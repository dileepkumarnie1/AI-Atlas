// Discover new tools for each domain and append to public/tools.json
// Sources: GitHub Search API (repos), npm search, Hacker News Algolia (stories)
// Sends an email summary if SMTP env vars are provided.

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { load as loadHTML } from 'cheerio';

// Optional Firestore (for approval links flow)
let fbInitTried = false;
let getFirestoreSafe = null;
async function initFirebaseIfPossible(){
  if(fbInitTried) return;
  fbInitTried = true;
  try{
    const svc = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if(!svc) return;
    const { initializeApp, cert } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const key = JSON.parse(svc);
    initializeApp({ credential: cert(key) });
    getFirestoreSafe = () => getFirestore();
  }catch{/* ignore */}
}

function signId(id){
  const SECRET = String(process.env.ADMIN_APPROVAL_SIGNING_KEY||'');
  if(!SECRET) return '';
  return crypto.createHmac('sha256', SECRET).update(String(id)).digest('hex');
}

const root = path.resolve(process.cwd());
const DATA_DIR = path.join(root, 'data');
const PUBLIC_DIR = path.join(root, 'public');
const TOOLS_JSON = path.join(PUBLIC_DIR, 'tools.json');
const DISCOVERY_SOURCES = path.join(DATA_DIR, 'discovery-sources.json');
const DISCOVERY_LOG = path.join(DATA_DIR, 'discovery_log.json');
const BLACKLIST_JSON = path.join(DATA_DIR, 'blacklist.json');
const PENDING_JSON = path.join(DATA_DIR, 'pending-tools.json');
const ALIASES_JSON = path.join(DATA_DIR, 'aliases.json');

function normalizeKey(s){ return String(s||'').trim().toLowerCase(); }
function normalizeKeyLoose(s){ return normalizeKey(s).replace(/[^a-z0-9]+/g,''); }

// --- Reliability helpers ---
const TRUSTED_HOSTS = new Set([
  'github.com','npmjs.com','huggingface.co','pypi.org','readthedocs.io','gitlab.com',
  'vercel.app','netlify.app','readme.io','docs.rs','pkg.go.dev','crates.io'
]);
const BAD_HOSTS = new Set([
  // Add known-bad domains here if needed
]);

// Hosts that are commonly blogs or article platforms (poor signal for "real tool" landing pages)
const BLOG_HOSTS = new Set([
  'medium.com','substack.com','dev.to','towardsdatascience.com','mirror.xyz','hashnode.dev',
  'blogspot.com','wordpress.com','notion.site','ghost.io','hashnode.com','freecodecamp.org','teletype.in'
]);
const CONTENT_SUBDOMAIN_PREFIXES = ['blog','docs','help','support','kb','developer','dev','api','learn','status'];
// Package registries and developer-only hubs; usually not end-user tools
const PACKAGE_HOSTS = new Set([
  'npmjs.com','pypi.org','rubygems.org','crates.io','pkg.go.dev','packagist.org','nuget.org'
]);

// Exclusion policy: avoid GitHub-hosted repo pages as final tool links, except allowlisted branded products
const GITHUB_HOST = 'github.com';
const ALLOWLIST_GITHUB_NAMES = new Set([
  'github copilot'
]);

function getHostname(u){
  try { return new URL(u).hostname.replace(/^www\./,'').toLowerCase(); } catch { return ''; }
}

function getPathname(u){
  try { return new URL(u).pathname || '/'; } catch { return '/'; }
}

function getOrigin(u){
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host}`;
  } catch { return ''; }
}

function sameHost(u, host){
  try{ return new URL(u).hostname.replace(/^www\./,'').toLowerCase() === host; }catch{ return false; }
}

async function getNpmWeeklyDownloads(pkg){
  try{
    const url = `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(pkg)}`;
    const j = await (await fetch(url)).json();
    return Number(j.downloads||0);
  }catch{ return 0; }
}

async function checkGoogleSafeBrowsing(url){
  const key = process.env.GOOGLE_SAFEBROWSING_API_KEY;
  if(!key) return { unsafe: false, reason: 'no-gsb-key' };
  try{
    const body = {
      client: { clientId: 'ai-atlas', clientVersion: '1.0' },
      threatInfo: {
        threatTypes: ['MALWARE','SOCIAL_ENGINEERING','UNWANTED_SOFTWARE','POTENTIALLY_HARMFUL_APPLICATION'],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: [{ url }]
      }
    };
    const resp = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${key}`, {
      method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body)
    });
    if(!resp.ok) return { unsafe: false, reason: `gsb-http-${resp.status}` };
    const data = await resp.json();
    const unsafe = Array.isArray(data?.matches) && data.matches.length>0;
    return { unsafe, reason: unsafe ? 'gsb-match' : 'gsb-clear' };
  }catch{
    return { unsafe: false, reason: 'gsb-error' };
  }
}

async function assessReliability(cand){
  // Score toolbox: + signals add, - signals subtract
  let score = 0;
  const reasons = [];
  const link = String(cand.link||'');
  const host = getHostname(link);
  if(!link || !/^https?:\/\//i.test(link)) { reasons.push('invalid-link'); score -= 2; }
  if(link.startsWith('https://')) { reasons.push('https'); score += 1; } else { reasons.push('no-https'); score -= 1; }
  if(TRUSTED_HOSTS.has(host)) { reasons.push(`trusted-host:${host}`); score += 2; }
  if(BAD_HOSTS.has(host)) { reasons.push(`bad-host:${host}`); score -= 5; }
  // Source-specific signals
  const src = String(cand.source||'').toLowerCase();
  if(src === 'github'){
    const stars = Number(cand.metrics?.stars||0);
    if(stars >= 500) { reasons.push(`gh-stars:${stars}`); score += 3; }
    else if(stars >= 100) { reasons.push(`gh-stars:${stars}`); score += 2; }
    else if(stars >= 20) { reasons.push(`gh-stars:${stars}`); score += 1; }
  }
  if(src === 'npm'){
    // Extract package name from npm link
    const m = link.match(/\/package\/(@?[^/]+)/);
    if(m){
      const dls = await getNpmWeeklyDownloads(m[1]);
      if(dls >= 50000) { reasons.push(`npm-dls:${dls}`); score += 3; }
      else if(dls >= 5000) { reasons.push(`npm-dls:${dls}`); score += 2; }
      else if(dls >= 500) { reasons.push(`npm-dls:${dls}`); score += 1; }
    }
  }
  // HN already filtered by >=100 points upstream -> mild boost
  if(src === 'hn' && (cand.metrics?.points||0) >= 100){ reasons.push('hn-points'); score += 1; }

  // Optional Google Safe Browsing check
  const gsb = await checkGoogleSafeBrowsing(link);
  if(gsb.unsafe){ reasons.push('gsb-unsafe'); score -= 10; }

  const thresholdRisky = Number(process.env.RELIABILITY_RISKY_MAX || -1); // <= -1 defaults to our logic
  const verdict = (gsb.unsafe || score <= -2) ? 'risky' : (score >= 2 ? 'safe' : 'unknown');
  return { score, reasons, verdict, host };
}

// --- Tool vs Blog/Docs classifier helpers ---
function textIncludesAny(text, needles){
  const t = String(text||'').toLowerCase();
  return needles.some(n => t.includes(String(n).toLowerCase()));
}

function looksLikeBlogOrDocs(url){
  const host = getHostname(url);
  const path = getPathname(url).toLowerCase();
  if (BLOG_HOSTS.has(host)) return true;
  if (CONTENT_SUBDOMAIN_PREFIXES.some(p => new RegExp(`^${p}\\.`,'i').test(host))) return true;
  // Common docs/help/knowledge base paths
  if (/(^|\/)docs(\/|$)/.test(path)) return true;
  if (/(^|\/)documentation(\/|$)/.test(path)) return true;
  if (/(^|\/)blog(\/|$)/.test(path)) return true;
  if (/(^|\/)guide(s)?(\/|$)/.test(path)) return true;
  if (/(^|\/)support(\/|$)/.test(path)) return true;
  if (/(^|\/)help(\/|$)/.test(path)) return true;
  if (/(^|\/)kb(\/|$)/.test(path)) return true;
  if (/(^|\/)article(s)?(\/|$)/.test(path)) return true;
  if (/(^|\/)news(\/|$)/.test(path)) return true;
  if (host === 'openai.com' && /(^|\/)index(\/|$)/.test(path)) return true;
  return false;
}

function looksLikeDevPackage(url){
  const host = getHostname(url);
  if (PACKAGE_HOSTS.has(host)) return true;
  // GitHub repo pages are excluded elsewhere, but treat as dev package too
  if (host === GITHUB_HOST) return true;
  return false;
}

async function fetchHtml(url, timeoutMs = 10000){
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try{
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'AI-Atlas-Discovery/1.0 (+https://example.com) NodeFetch',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = String(res.headers.get('content-type')||'').toLowerCase();
    if(ct.includes('application/pdf')){ return '__PDF__'; }
    if(!ct.includes('text/html')){
      // If it's not HTML, it's unlikely to be a landing page tool (could be JSON API)
      return '';
    }
    return await res.text();
  }catch{
    return '';
  }finally{
    clearTimeout(t);
  }
}

function extractJsonLdTypes($){
  const types = [];
  $('script[type="application/ld+json"]').each((_, el)=>{
    try{
      const raw = $(el).contents().text();
      if(!raw) return;
      const j = JSON.parse(raw);
      const pushType = (obj)=>{
        const t = obj['@type'];
        if(Array.isArray(t)) types.push(...t.map(x=>String(x).toLowerCase()));
        else if(t) types.push(String(t).toLowerCase());
      };
      if(Array.isArray(j)) j.forEach(pushType); else if(typeof j === 'object') pushType(j);
    }catch{/* ignore bad JSON-LD */}
  });
  return types;
}

function extractOgType($){
  const t = $('meta[property="og:type"]').attr('content') || $('meta[name="og:type"]').attr('content');
  return String(t||'').toLowerCase();
}

function pageToolSignals($){
  const signals = [];
  const bodyText = $('body').text().slice(0, 200000); // cap for performance
  // CTA signals
  const ctaNeedles = [
    'sign up','signup','get started','start for free','start free','try it free','try now','open app','launch app',
    'add to chrome','add to vscode','install extension','download app','start trial','use for free','create account'
  ];
  if(textIncludesAny(bodyText, ctaNeedles)) signals.push('cta');
  // Pricing
  const pricingNeedles = ['pricing','plans','plan','tiers','billing'];
  if(textIncludesAny(bodyText, pricingNeedles)) signals.push('pricing');
  // Auth nav
  const authNeedles = ['log in','login','sign in','account','dashboard'];
  if(textIncludesAny(bodyText, authNeedles)) signals.push('auth');
  // Product-ish OG metadata
  const og = extractOgType($);
  if(og.includes('product') || og.includes('website')) signals.push(`og:${og||'website'}`);
  // JSON-LD types
  const ld = extractJsonLdTypes($);
  if(ld.some(t => t.includes('softwareapplication') || t.includes('product'))) signals.push('jsonld:product');
  if(ld.some(t => t.includes('article') || t.includes('blogposting'))) signals.push('jsonld:article');
  // Buttons and links
  const btnText = $('a,button').map((_,el)=>$(el).text().trim().toLowerCase()).get().join(' ');
  const btnNeedles = ['try','get started','sign up','start free','pricing','launch'];
  if(textIncludesAny(btnText, btnNeedles)) signals.push('buttons');
  return { signals, ld, og };
}

async function classifyCandidate(cand, domainSlug){
  const url = String(cand.link||'');
  const host = getHostname(url);
  const strictClassifier = process.env.TOOL_CLASSIFIER_STRICT
    ? /^true$/i.test(String(process.env.TOOL_CLASSIFIER_STRICT||'').trim())
    : true;
  // Quick prechecks
  if(/\.pdf(\?|$)/i.test(url)) return { isTool:false, reason:'pdf-link', category:'content' };
  if(host === 'arxiv.org' && /(^|\/)pdf(\/|$)/.test(getPathname(url))) return { isTool:false, reason:'pdf-link', category:'content' };
  if(looksLikeDevPackage(url)) return { isTool:false, reason:'dev-package', category:'dev-package' };
  if(looksLikeBlogOrDocs(url)) return { isTool:false, reason:'blog/docs', category:'content' };
  // Fetch and inspect
  const html = await fetchHtml(url);
  if(html === '__PDF__') return { isTool:false, reason:'pdf-content', category:'content' };
  if(!html){
    // If we cannot fetch, play safe: treat as unknown; in strict mode, reject
    return { isTool: !strictClassifier, reason: 'unfetchable', category:'unknown' };
  }
  const $ = loadHTML(html);
  // Article signals
  const ld = extractJsonLdTypes($);
  if(ld.some(t => t.includes('article') || t.includes('blogposting'))){
    return { isTool:false, reason:'jsonld-article', category:'content' };
  }
  // Hero/title hints
  const title = $('title').text().toLowerCase();
  if(/\bblog\b/.test(title) || /\barticle\b/.test(title)){
    return { isTool:false, reason:'title-article', category:'content' };
  }
  const { signals } = pageToolSignals($);
  const hasProductSchema = signals.includes('jsonld:product');
  const ctaish = signals.includes('cta') || signals.includes('buttons');
  const hasPricing = signals.includes('pricing');
  const hasAuth = signals.includes('auth');
  const score = (hasProductSchema?2:0) + (ctaish?1:0) + (hasPricing?1:0) + (hasAuth?1:0);
  const threshold = strictClassifier ? 2 : 1;
  // If homepage path and strict mode, require stronger signals
  const path = getPathname(url);
  if(strictClassifier && path === '/' && score < 3){
    return { isTool:false, reason:`weak-homepage score=${score}`, category:'content' };
  }
  const isTool = score >= threshold;
  return { isTool, reason: `signals:${signals.join(',')||'none'} score=${score}`, category: isTool?'tool':'content', score };
}

// --- Directory consensus and trending helpers ---
async function fetchAnchors(url, timeoutMs=10000){
  const html = await fetchHtml(url, timeoutMs);
  if(!html || html === '__PDF__') return [];
  const $ = loadHTML(html);
  const out = [];
  $('a[href]').each((_, el)=>{
    const href = String($(el).attr('href')||'');
    const text = String($(el).text()||'').trim();
    if(!href) return;
    let abs = href;
    if(href.startsWith('/')) abs = getOrigin(url) + href;
    out.push({ href: abs, text });
  });
  return out;
}

async function fetchDirectoryConsensusSets(){
  const enabled = String(process.env.DIRECTORY_CONSENSUS_ENABLED||'true').toLowerCase() !== 'false';
  if(!enabled) return { names:new Set(), domains:new Set() };
  const names = new Set();
  const domains = new Set();
  try{
    const a1 = await fetchAnchors('https://tooldirectory.ai/');
    for(const a of a1){
      if(/\/tool|\/tools|ai/i.test(a.href)){
        const n = canonicalName(a.text || getHostname(a.href)); if(n) names.add(n);
        const d = getHostname(a.href); if(d) domains.add(d);
      }
    }
  }catch{}
  try{
    const a2 = await fetchAnchors('https://www.aixploria.com/en/');
    for(const a of a2){
      if(/ai|tool/i.test(a.href) || /ai|tool/i.test(a.text)){
        const n = canonicalName(a.text || getHostname(a.href)); if(n) names.add(n);
        const d = getHostname(a.href); if(d) domains.add(d);
      }
    }
  }catch{}
  // Third consensus directory: Futurepedia
  try{
    const a3 = await fetchAnchors('https://www.futurepedia.io/');
    for(const a of a3){
      if(/\/tool|\/tools|\/product|ai/i.test(a.href) || /ai|tool/i.test(a.text)){
        const n = canonicalName(a.text || getHostname(a.href)); if(n) names.add(n);
        const d = getHostname(a.href); if(d) domains.add(d);
      }
    }
  }catch{}
  return { names, domains };
}

function inDirectoryConsensus(cand, dirSets){
  const n = canonicalName(cand.name);
  const host = getHostname(cand.link);
  if(dirSets.names.has(n)) return true;
  if(dirSets.domains.has(host)) return true;
  return false;
}

async function computeTrendingEvidence(cand){
  const src = String(cand.source||'').toLowerCase();
  try{
    if(src === 'github'){
      const stars = Number(cand.metrics?.stars||0);
      const pushedAt = cand.metrics?.pushedAt ? new Date(cand.metrics.pushedAt).getTime() : 0;
      const recent = pushedAt && (Date.now() - pushedAt) <= (60*24*3600*1000);
      return stars >= 1000 && recent;
    }
    if(src === 'npm'){
      const m = (cand.link||'').match(/\/package\/(\@?[^/]+)/);
      if(m){
        const dls = await getNpmWeeklyDownloads(m[1]);
        return dls >= 5000;
      }
      return false;
    }
    if(src === 'hn'){
      const pts = Number(cand.metrics?.points||0);
      const created = Number(cand.metrics?.createdAtSec||0) * 1000;
      const recent = created && (Date.now() - created) <= (14*24*3600*1000);
      return pts >= 200 && recent;
    }
    // Fallback: treat recently updated landing pages as trending (freshness <= 90 days)
    const freshDays = await pageFreshnessDays(cand.link);
    if(freshDays !== null && freshDays <= 90) return true;
  }catch{}
  return false;
}

// Extract freshness from page HTML via common meta/JSON-LD date hints
function extractPageDates($){
  const dates = [];
  const push = (s)=>{ if(!s) return; const t = Date.parse(String(s).trim()); if(!Number.isNaN(t)) dates.push(new Date(t)); };
  const meta = (sel, attr='content') => $(sel).attr(attr);
  push(meta('meta[property="article:published_time"]'));
  push(meta('meta[name="article:published_time"]'));
  push(meta('meta[property="og:updated_time"]'));
  push(meta('meta[name="og:updated_time"]'));
  push(meta('meta[itemprop="datePublished"]'));
  push(meta('meta[itemprop="dateModified"]'));
  push(meta('meta[name="date"]'));
  $('time').each((_,el)=>{ push($(el).attr('datetime')); push($(el).text()); });
  // JSON-LD
  $('script[type="application/ld+json"]').each((_,el)=>{
    try{
      const raw = $(el).contents().text(); if(!raw) return;
      const j = JSON.parse(raw);
      const arr = Array.isArray(j) ? j : [j];
      for(const obj of arr){ push(obj.datePublished); push(obj.dateModified); }
    }catch{}
  });
  return dates;
}

async function pageFreshnessDays(url){
  try{
    const html = await fetchHtml(url);
    if(!html || html === '__PDF__') return null;
    const $ = loadHTML(html);
    const dates = extractPageDates($);
    if(dates.length === 0) return null;
    const mostRecent = dates.sort((a,b)=>b.getTime()-a.getTime())[0].getTime();
    return Math.floor((Date.now() - mostRecent)/(24*3600*1000));
  }catch{ return null; }
}

// Stronger duplicate detection with canonical name
const DUP_STOPWORDS = new Set(['ai','the','and','of','for','app','apps','tool','tools','platform','labs','studio','framework','kit','sdk','api','model','models','agent','agents','chat','assistant','bot','bots']);
function canonicalName(s){
  const tokens = String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(t=>t && !DUP_STOPWORDS.has(t));
  return tokens.join(' ');
}

async function readJsonSafe(p){
  try { const s = await fs.readFile(p, 'utf8'); return JSON.parse(s); } catch { return Array.isArray(p)?[]:{}; }
}

async function writeJson(p, obj){
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj, null, 2));
}

async function ghFetch(url){
  const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'ai-atlas-discovery-script' };
  const token = process.env.GITHUB_TOKEN;
  if(token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if(!res.ok) throw new Error(`GitHub ${res.status}: ${url}`);
  return res.json();
}

async function searchGithubRepos(query, perPage=5, starsMin=500){
  try{
    const since = new Date(Date.now() - 180*24*3600*1000).toISOString().slice(0,10);
    const q = encodeURIComponent(`${query} stars:>${starsMin} pushed:>=${since}`);
    const j = await ghFetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${perPage}`);
    return (j.items||[]).map(r=>({
      source: 'github',
      name: r.name,
      description: r.description || '',
      link: r.homepage && r.homepage.startsWith('http') ? r.homepage : r.html_url,
      iconUrl: r.owner?.avatar_url ? `${r.owner.avatar_url}&s=64` : undefined,
      tags: ['Open Source'],
      metrics: { stars: r.stargazers_count || 0, forks: r.forks_count || 0, pushedAt: r.pushed_at },
      reason: `High GitHub traction: ${r.stargazers_count?.toLocaleString?.() || r.stargazers_count} stars for query "${query}"`
    }));
  }catch{ return []; }
}

async function searchNpm(query, size=5){
  try{
    const q = encodeURIComponent(query);
    const j = await (await fetch(`https://registry.npmjs.org/-/v1/search?text=${q}&size=${size}`)).json();
    return (j.objects||[]).map(x=>x.package).map(p=>({
      source: 'npm',
      name: p.name,
      description: p.description || '',
      link: `https://www.npmjs.com/package/${p.name}`,
      tags: ['Library'],
      metrics: { version: p.version },
      reason: `Popular npm package for "${query}"`
    }));
  }catch{ return []; }
}

async function searchHN(query, hits=5){
  try{
    const q = encodeURIComponent(query);
    const since = Math.floor(Date.now()/1000) - (14*24*3600);
    const url = `https://hn.algolia.com/api/v1/search?tags=story&query=${q}&hitsPerPage=${hits}&numericFilters=created_at_i>${since}`;
    const j = await (await fetch(url)).json();
    return (j.hits||[]).filter(h=>h.points>=100 && h.url).map(h=>({
      source: 'hn',
      name: h.title.replace(/\s*-\s*Show HN.*$/i,'').slice(0,80),
      description: h.title,
      link: h.url,
      tags: ['Trending'],
      metrics: { points: h.points, createdAtSec: h.created_at_i },
      reason: `HN discussion (${h.points} points) for "${query}"`
    }));
  }catch{ return []; }
}

// --- Aixploria category scraping ---
async function fetchAixploriaCategory(catUrl, perPageLimit=40){
  try{
    const html = await fetchHtml(catUrl, 15000);
    if(!html || html === '__PDF__') return [];
    const $ = loadHTML(html);
    const host = getHostname(catUrl);
    const cards = new Set();
    // Collect candidate card roots around internal post links
    $('a[href*="/en/"]').each((_, a)=>{
      const href = String($(a).attr('href')||'');
      if(!href || !href.startsWith('http')) return;
      if(!sameHost(href, host)) return; // internal only
      const text = String($(a).text()||'').trim();
      if(text.length < 2 || text.length > 120) return;
      const root = $(a).closest('article, li, .card, .listing, .entry, .item, .elementor-post, .elementor-portfolio__content');
      if(root && root.length) cards.add(root.get(0));
    });
    const items = [];
    for(const node of Array.from(cards)){
      const el = $(node);
      // Name: prefer a prominent internal title link
      let name = el.find('h2 a, h3 a').first().text().trim();
      if(!name){
        name = el.find('a[href*="/en/"]').first().text().trim();
      }
      if(!name) continue;
      // External link: text like "Link AI VISIT" or any external anchor inside the card
      let ext = '';
      el.find('a[href]').each((_, a)=>{
        if(ext) return;
        const href = String($(a).attr('href')||'');
        if(!href.startsWith('http')) return;
        const h = getHostname(href);
        if(h && h !== host){
          const t = String($(a).text()||'').toLowerCase();
          if(/visit|link ai visit|open|go to|try/i.test(t) || true){
            ext = href;
          }
        }
      });
      if(!ext) continue;
      items.push({
        source: 'aixploria',
        name,
        description: '',
        link: ext,
        tags: ['Freemium'],
        metrics: {},
        reason: `Aixploria category seed: ${catUrl}`
      });
      if(items.length >= perPageLimit) break;
    }
    // Dedupe by name
    const seen = new Set();
    return items.filter(it=>{ const k = normalizeKey(it.name); if(!k || seen.has(k)) return false; seen.add(k); return true; });
  }catch{ return []; }
}

async function searchAixploriaCategories(categoryUrls=[], sizePerCat=30){
  const results = [];
  for(const u of categoryUrls){
    const items = await fetchAixploriaCategory(u, sizePerCat);
    results.push(...items);
  }
  return results;
}

function chooseBest(cands){
  // Prefer GitHub items with stars, then HN by points
  const withScore = cands.map(c=>{
    let score = (c.metrics?.stars||0) + (c.metrics?.points||0)*10;
    // Strongly prefer curated items in ranking so they are considered in global selection
    if(String(c.source).toLowerCase() === 'curated') score += 1_000_000;
    return { ...c, _score: score };
  }).sort((a,b)=>b._score - a._score);
  return withScore;
}

function dedupeByName(items){
  const seen = new Set();
  return items.filter(it=>{
    const k = normalizeKey(it.name);
    if(!k || seen.has(k)) return false; seen.add(k); return true;
  });
}

function isLikelyAITool(item, domainSlug){
  const name = (item.name||'').toLowerCase();
  const desc = (item.description||'').toLowerCase();
  const link = (item.link||'').toLowerCase();
  const source = (item.source||'').toLowerCase();
  // Exclude obvious non-products or non-AI
  const banned = [
    'awesome', 'awesome-', 'list of', 'torrent', 'downloader', 'youtube-dl', 'ytdl',
    'dotfiles', 'vim', 'emacs', 'sublime', 'neovim', 'zsh', 'oh-my-zsh', 'shell',
    'course', 'tutorial', 'examples', 'sample', 'demo', 'template', 'boilerplate'
  ];
  if(banned.some(b=> name.includes(b) || desc.includes(b) || link.includes(b))) return false;
  // Positive AI signals
  const aiSignals = [' ai', 'gpt', 'ml', 'machine learning', 'deep learning', 'diffusion', 'transformer', 'llm', 'language model', 'rag'];
  const hasAISignal = aiSignals.some(k => name.includes(k.trim()) || desc.includes(k));
  // HN items must include explicit AI signals to avoid generic popular posts
  if(source === 'hn' && !hasAISignal) return false;
  // Domain-specific requirements
  const dom = (domainSlug||'').toLowerCase();
  if(dom === 'video-tools'){
    const vid = desc.includes('video') || name.includes('video');
    const gen = ['text-to-video','video generation','avatar','lip sync','subtitle','rotoscoping'].some(k=> desc.includes(k) || name.includes(k));
    return vid && (gen || hasAISignal);
  }
  if(dom === 'language-chat'){
    const chat = ['chat','assistant','llm','language model','gpt','rag'].some(k=> name.includes(k) || desc.includes(k));
    return chat || hasAISignal;
  }
  if(dom === 'most-popular'){
    return hasAISignal || ['platform','assistant','agent','copilot','studio'].some(k=> name.includes(k) || desc.includes(k));
  }
  if(dom === 'image-generation'){
    const img = name.includes('image') || desc.includes('image') || desc.includes('diffusion') || desc.includes('stable diffusion');
    return img && (hasAISignal || desc.includes('diffusion') || desc.includes('controlnet'));
  }
  if(dom === 'code-assistance'){
    const codey = ['code','coding','programming','refactor','autocomplete','copilot','lint','debug'].some(k=> name.includes(k) || desc.includes(k));
    return codey || hasAISignal;
  }
  if(dom === 'audio-music'){
    const au = ['audio','voice','speech','tts','music','song','synthesis','cloning'].some(k=> name.includes(k) || desc.includes(k));
    return au && hasAISignal;
  }
  if(dom === 'productivity'){
    const prod = ['meeting','notes','calendar','email','document','summary','transcript','todo','assistant'].some(k=> name.includes(k) || desc.includes(k));
    return prod && hasAISignal;
  }
  if(dom === 'design-tools'){
    const des = ['design','figma','ui','ux','logo','mockup','wireframe','upscale','inpaint'].some(k=> name.includes(k) || desc.includes(k));
    return des && hasAISignal;
  }
  if(dom === 'research'){
    const res = ['paper','pdf','citation','summarization','literature','arxiv','semantic'].some(k=> name.includes(k) || desc.includes(k));
    return res && hasAISignal;
  }
  if(dom === 'marketing-seo'){
    const mkt = ['seo','keyword','ad','campaign','copy','content'].some(k=> name.includes(k) || desc.includes(k));
    return mkt && hasAISignal;
  }
  if(dom === 'data-analysis' || dom === 'data-analytics'){
    const data = ['sql','data','pandas','notebook','analysis','etl','bi','chart','visualization','insight','vector'].some(k=> name.includes(k) || desc.includes(k));
    return data && hasAISignal;
  }
  if(dom === '3d-modeling'){
    const threed = ['3d','nerf','gaussian','mesh','sdf','splatting','render','blender'].some(k=> name.includes(k) || desc.includes(k));
    return threed && hasAISignal;
  }
  if(dom === 'ethical-ai' || dom === 'ai-safety-ethics'){
    const safe = ['safety','guardrail','bias','fairness','privacy','interpretability','red team','jailbreak','toxicity'].some(k=> name.includes(k) || desc.includes(k));
    return safe;
  }
  if(dom === 'education'){
    const edu = ['tutor','quiz','flashcard','learn','course','student','teacher'].some(k=> name.includes(k) || desc.includes(k));
    return edu && hasAISignal;
  }
  if(dom === 'crypto'){
    const c = ['crypto','defi','trading','blockchain'].some(k=> name.includes(k) || desc.includes(k));
    return c && hasAISignal;
  }
  if(dom === 'prompt-enhancers'){
    const p = ['prompt','few-shot','template','jailbreak','guardrails','system prompt'].some(k=> name.includes(k) || desc.includes(k));
    return p || hasAISignal;
  }
  if(dom === 'most-famous-agentic-ais'){
    const ag = ['agent','autogpt','babyagi','multi-agent','crew'].some(k=> name.includes(k) || desc.includes(k));
    return ag || hasAISignal;
  }
  if(dom === 'workflow-automation'){
    const wf = ['workflow','automation','orchestration','pipeline','zapier','n8n'].some(k=> name.includes(k) || desc.includes(k));
    return wf && hasAISignal;
  }
  if(dom === 'search-knowledge-discovery'){
    const s = ['search','semantic','vector','rag','knowledge','qa','retrieval'].some(k=> name.includes(k) || desc.includes(k));
    return s && hasAISignal;
  }
  // Default: require any AI signal
  return hasAISignal;
}

function toToolShape(item){
  return {
    name: item.name,
    description: item.description || 'Newly discovered tool',
    link: item.link,
    tags: item.tags || ['Freemium'],
    iconUrl: item.iconUrl,
    about: item.description || 'Auto-discovered by catalog scan.',
    pros: [],
    cons: []
  };
}

async function maybeSendEmail({ subject, text, html }){
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, TO_EMAIL } = process.env;
  if(!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !TO_EMAIL){
    console.log('Email not sent (SMTP env not configured). Preview:\n', subject, '\n', text);
    return false;
  }
  let nodemailer;
  try{ nodemailer = (await import('nodemailer')).default; }catch{
    console.warn('nodemailer not installed; skipping email.');
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  const mail = { from: SMTP_USER, to: TO_EMAIL, subject, text };
  if(html) mail.html = html;
  await transporter.sendMail(mail);
  console.log('Email sent to', TO_EMAIL);
  return true;
}

async function main(){
  const [db, sources, logPrev, blacklist, pending, aliases] = await Promise.all([
    readJsonSafe(TOOLS_JSON),
    readJsonSafe(DISCOVERY_SOURCES),
    readJsonSafe(DISCOVERY_LOG),
    readJsonSafe(BLACKLIST_JSON),
    readJsonSafe(PENDING_JSON),
    readJsonSafe(ALIASES_JSON)
  ]);
  const sections = Array.isArray(db) ? db : [];
  const domainBySlug = new Map(sections.map(sec => [normalizeKey(sec.slug), sec]));
  const existingNames = new Set(sections.flatMap(sec => (sec.tools||[]).map(t=>normalizeKey(t.name))));
  const existingNamesLoose = new Set(sections.flatMap(sec => (sec.tools||[]).map(t=>normalizeKeyLoose(t.name))));
  const existingCanonicalNames = new Set(sections.flatMap(sec => (sec.tools||[]).map(t=>canonicalName(t.name))));
  const pendingItems = Array.isArray(pending?.items) ? pending.items : [];
  for(const it of pendingItems){ existingNames.add(normalizeKey(it.name)); existingNamesLoose.add(normalizeKeyLoose(it.name)); existingCanonicalNames.add(canonicalName(it.name)); }
  const blacklistNames = new Set((blacklist?.names||[]).map(normalizeKey));
  const aliasMap = new Map(Object.entries(aliases?.aliases||{}).map(([a,c])=>[normalizeKey(a), normalizeKey(c)]));
  const directPublish = /^true$/i.test(String(process.env.DIRECT_PUBLISH||''));

  // Config flags for diagnostics and CI visibility
  const strictMode = /^true$/i.test(String(process.env.RELIABILITY_STRICT||'').trim());
  const hasGSBKey = Boolean(process.env.GOOGLE_SAFEBROWSING_API_KEY);
  console.log(`[config] Safe Browsing key present=${hasGSBKey}, strict=${strictMode}`);

  const additions = [];
  const diag = {
    timestamp: new Date().toISOString(),
    strict: strictMode,
    hasGSBKey,
    domains: {},
    totals: { candidates: 0, added: 0, staged: 0, published: 0, skips: { duplicate:0, alias:0, blacklist:0, notAi:0, risky:0, strictUnknown:0, githubHost:0, notTool:0, blogHost:0, devPackage:0, notTrending:0, notInDirectories:0 }, maxAddsStops: 0 }
  };
  // Global candidate pool to allow selecting top-N across all domains
  const globalCandidates = [];
  for(const [slug, cfg] of Object.entries(sources)){
    if(cfg && cfg.enabled === false) continue; // allow disabling domains
    const sec = domainBySlug.get(normalizeKey(slug));
    if(!sec) continue;
  diag.domains[slug] = diag.domains[slug] || { candidates: 0, added: 0, staged: 0, published: 0, skips: { duplicate:0, alias:0, blacklist:0, notAi:0, risky:0, strictUnknown:0, githubHost:0, notTool:0, blogHost:0, devPackage:0, notTrending:0, notInDirectories:0 }, maxAddsStop: false };
    const perPage = Number(cfg.githubPerPage || 5);
    const starsMin = Number(cfg.githubStarsMin || 500);
    const npmSize = Number(cfg.npmSize || 5);
    const maxAdds = Number(cfg.maxAdds || 2);
    const results = [];
    for(const q of cfg.githubQueries||[]){ results.push(...await searchGithubRepos(q, perPage, starsMin)); }
    for(const q of cfg.npmQueries||[]){ results.push(...await searchNpm(q, npmSize)); }
    for(const q of (cfg.hnQueries||[])){ results.push(...await searchHN(q, 5)); }
    if(Array.isArray(cfg.aixploriaCategories) && cfg.aixploriaCategories.length){
      results.push(...await searchAixploriaCategories(cfg.aixploriaCategories, Number(cfg.aixploriaSize||30)));
    }
    // Optional curated items: allow seeding specific high-quality tools per domain via discovery-sources.json
    // Example schema per domain:
    // "curated": [ { "name": "Orchids AI", "link": "https://orchids.ai", "description": "Curated entry", "tags": ["Freemium"] } ]
    if (Array.isArray(cfg.curated) && cfg.curated.length) {
      for (const c of cfg.curated) {
        if (!c || !c.name || !c.link) continue;
        results.push({
          source: 'curated',
          name: String(c.name),
          description: c.description || 'Curated entry',
          link: String(c.link),
          tags: Array.isArray(c.tags) && c.tags.length ? c.tags : ['Freemium'],
          metrics: { },
          reason: c.reason || 'Curated high-quality tool'
        });
      }
    }
    const deduped = dedupeByName(results);
    diag.domains[slug].candidates = deduped.length;
    diag.totals.candidates += deduped.length;
    const ranked = chooseBest(deduped).map(c => ({ ...c, _domainSlug: slug }));
    // Push into global pool; we'll apply strict filters and a global top-N later
    globalCandidates.push(...ranked);
  }

  // Load directory consensus sets for cross-reference
  const dirSets = await fetchDirectoryConsensusSets();
  // Sort global candidates by composite score (prefer GitHub stars, then HN points); then filter and select up to per-domain targets
  globalCandidates.sort((a,b)=> (b._score||0) - (a._score||0));
  // Target up to 2 per domain by default (configurable via discovery-sources maxAdds). Global cap is sum unless overridden.
  const perDomainTargets = new Map(Object.entries(sources).map(([slug,cfg])=>[slug, Number(cfg?.maxAdds || 2)]));
  const sumTargets = Array.from(perDomainTargets.values()).reduce((a,b)=>a+b,0) || Infinity;
  const GLOBAL_MAX_NEW = Number(process.env.GLOBAL_MAX_NEW_TOOLS || sumTargets);
  const selected = [];
  const domainAddedPre = new Map();
  for(const cand of globalCandidates){
    if(selected.length >= GLOBAL_MAX_NEW) break;
    const slug = cand._domainSlug;
    const sec = domainBySlug.get(normalizeKey(slug));
    if(!sec) continue;
    const k = normalizeKey(cand.name);
    const kl = normalizeKeyLoose(cand.name);
    const kc = canonicalName(cand.name);
    // direct name/loose matches
    if(existingNames.has(k) || existingNamesLoose.has(kl) || (kc && existingCanonicalNames.has(kc))) { diag.domains[slug].skips.duplicate++; diag.totals.skips.duplicate++; continue; }
    // alias match: map candidate alias -> canonical and see if present
    const aliasCanonical = aliasMap.get(k) || aliasMap.get(kl);
    if(aliasCanonical && (existingNames.has(aliasCanonical) || existingNamesLoose.has(normalizeKeyLoose(aliasCanonical)))) { diag.domains[slug].skips.alias++; diag.totals.skips.alias++; continue; }
    if(blacklistNames.has(k)) { diag.domains[slug].skips.blacklist++; diag.totals.skips.blacklist++; continue; }
    // Curated entries bypass AI-signal heuristic (still subject to reliability checks)
    if(cand.source !== 'curated' && !isLikelyAITool(cand, slug)) { diag.domains[slug].skips.notAi++; diag.totals.skips.notAi++; continue; }
    // Prefer reliable sources/domains for the link itself
    const host = getHostname(cand.link);
    const candNameNorm = normalizeKey(cand.name);
    if(host === GITHUB_HOST && !ALLOWLIST_GITHUB_NAMES.has(candNameNorm)){
      diag.domains[slug].skips.githubHost++; diag.totals.skips.githubHost = (diag.totals.skips.githubHost||0)+1; continue;
    }
    // Exclude obvious blog/doc content and developer package pages; then run detailed page classification
    if(BLOG_HOSTS.has(host) || /^blog\./i.test(host)){
      diag.domains[slug].skips.blogHost++; diag.totals.skips.blogHost = (diag.totals.skips.blogHost||0)+1; continue;
    }
    if(PACKAGE_HOSTS.has(host)){
      diag.domains[slug].skips.devPackage++; diag.totals.skips.devPackage = (diag.totals.skips.devPackage||0)+1; continue;
    }
    const classif = await classifyCandidate(cand, slug);
    if(!classif.isTool){ diag.domains[slug].skips.notTool++; diag.totals.skips.notTool = (diag.totals.skips.notTool||0)+1; continue; }
    // Require either listing in known directories or strong trending evidence,
    // OR allow strong page signals (score>=3) + reliability safe as fallback
    const inDirs = inDirectoryConsensus(cand, dirSets);
    const trending = await computeTrendingEvidence(cand);
    let allowBySignals = false;
    let relForDecision = null;
    if(!inDirs && !trending){
      const reliability = await assessReliability(cand);
      const strict = /^true$/i.test(String(process.env.RELIABILITY_STRICT||'').trim());
      const safeEnough = reliability.verdict === 'safe' || (!strict && reliability.verdict !== 'risky');
      if(classif.score >= 3 && safeEnough){
        allowBySignals = true;
        relForDecision = reliability;
      }else{
        diag.domains[slug].skips.notTrending = (diag.domains[slug].skips.notTrending||0)+1;
        diag.totals.skips.notTrending = (diag.totals.skips.notTrending||0)+1;
        diag.domains[slug].skips.notInDirectories = (diag.domains[slug].skips.notInDirectories||0)+1;
        diag.totals.skips.notInDirectories = (diag.totals.skips.notInDirectories||0)+1;
        continue;
      }
    }
  const reliability = relForDecision || await assessReliability(cand);
  const strict = /^true$/i.test(String(process.env.RELIABILITY_STRICT||'').trim());
    if(reliability.verdict === 'risky'){ diag.domains[slug].skips.risky++; diag.totals.skips.risky++; continue; }
    if(strict && reliability.verdict !== 'safe'){ diag.domains[slug].skips.strictUnknown++; diag.totals.skips.strictUnknown++; continue; }

    // Enforce per-domain pre-selection cap
    const cur = domainAddedPre.get(slug) || 0;
    const cap = perDomainTargets.get(slug) ?? 2;
    if(cur >= cap){ diag.domains[slug].maxAddsStop = true; diag.totals.maxAddsStops = (diag.totals.maxAddsStops||0)+1; continue; }
    selected.push({ cand, slug, reliability });
    domainAddedPre.set(slug, cur + 1);
  }

  // Apply per-domain maxAdds as a secondary safety (but primary control is GLOBAL_MAX_NEW)
  const domainAddedCount = new Map();
  for(const sel of selected){
    const { cand, slug, reliability } = sel;
    const sec = domainBySlug.get(normalizeKey(slug));
    if(!sec) continue;
    const cfg = sources[slug] || {};
    const perDomainMax = Number(cfg.maxAdds || Infinity);
    const cur = domainAddedCount.get(slug) || 0;
    if(cur >= perDomainMax){ diag.domains[slug].maxAddsStop = true; diag.totals.maxAddsStops++; continue; }
  const k = normalizeKey(cand.name);
  const kl = normalizeKeyLoose(cand.name);
    const tool = toToolShape(cand);
    if(directPublish){
      sec.tools = sec.tools || [];
      sec.tools.push(tool);
      existingNames.add(k);
      existingCanonicalNames.add(canonicalName(tool.name));
      additions.push({ domain: sec.name || slug, name: tool.name, reason: cand.reason, mode: 'published', link: tool.link, reliability });
      diag.domains[slug].published++; diag.totals.published++;
    } else {
      const domName = sec.name || slug;
      const items = Array.isArray(pending?.items) ? pending.items : [];
      // avoid staging duplicates
      if(!items.some(it => normalizeKey(it.name) === k || normalizeKeyLoose(it.name) === kl || canonicalName(it.name) === canonicalName(cand.name))){
        items.push({ domain: domName, ...tool, reason: cand.reason });
        pending.items = items;
        additions.push({ domain: domName, name: tool.name, reason: cand.reason, mode: 'staged', link: tool.link, reliability });
        diag.domains[slug].staged++; diag.totals.staged++;
      }
    }
    domainAddedCount.set(slug, cur + 1);
    diag.domains[slug].added = (diag.domains[slug].staged||0) + (diag.domains[slug].published||0);
  }

  if(additions.length && directPublish){
    await writeJson(TOOLS_JSON, sections);
  }
  if(!directPublish){
    pending.lastUpdated = new Date().toISOString();
    await writeJson(PENDING_JSON, pending);
  }
  const now = new Date().toISOString();
  const logNew = { lastRun: now, additions, ...logPrev };
  await writeJson(DISCOVERY_LOG, logNew);
  // Write diagnostics report for inspection in CI
  await writeJson(path.join(DATA_DIR, 'discovery_report.json'), { ...diag, additions });

  if(additions.length){
    const dateStr = new Date().toISOString().slice(0,10);
    const subject = `AI Atlas — ${additions.length} new ${directPublish? 'published' : 'staged'} tool(s) on ${dateStr}`;

    // Group by domain for nicer formatting
    const byDomain = additions.reduce((acc, a)=>{ (acc[a.domain] ||= []).push(a); return acc; }, {});

    // Plain text fallback
    const text = Object.entries(byDomain)
      .map(([dom, items]) => [`${dom}:`, ...items.map(a => `  • ${a.name}${a.link?` — ${a.link}`:''}\n    Why: ${a.reason}${a.mode?`\n    Mode: ${a.mode}`:''}`)].join('\n'))
      .join('\n\n');

    // Minimal HTML email (inline styles for broad client support) with header and summary
    const esc = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const modeBadge = m => {
      const isPub = String(m).toLowerCase() === 'published';
      const bg = isPub ? '#d1f7c4' : '#ffe8a3';
      const fg = isPub ? '#116329' : '#8a6d00';
      const label = isPub ? 'Published' : 'Staged';
      return `<span style="display:inline-block; padding:2px 6px; border-radius:10px; font-size:11px; background:${bg}; color:${fg}; margin-left:6px;">${label}</span>`;
    };

    const summaryRows = Object.entries(byDomain)
      .map(([dom, items]) => `<tr><td style="padding:4px 8px;">${esc(dom)}</td><td style="padding:4px 8px; text-align:right;">${items.length}</td></tr>`)
      .join('');

    // If approval flow configured, create pending docs and generate links.
    // Prefer GitHub Issues links when GITHUB_REPO is set; else fallback to Netlify function URL derived from APPROVAL_BASE_URL
    const approvalBase = (() => {
      const raw = String(process.env.APPROVAL_BASE_URL || '').trim();
      if(!raw) return '';
      try{
        const u = new URL(raw);
        return u.origin;
      }catch{
        const m = raw.match(/^(https?:\/\/[^\/]+)/i);
        return (m ? m[1] : raw).replace(/\/+$/,'');
      }
    })();
  const repoSlug = String(process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY || '').trim();
    const useApproval = Boolean(process.env.ADMIN_APPROVAL_SIGNING_KEY) && (Boolean(repoSlug) || Boolean(approvalBase));
    let db = null;
    if(useApproval){ await initFirebaseIfPossible(); try{ db = getFirestoreSafe && getFirestoreSafe(); }catch{} }

    async function ensurePendingAndLinks(domainName, a){
      if(!useApproval){ return { approve:'#', reject:'#', id:'' }; }
      const slug = normalizeKey(domainName || a.domain);
      // If Firestore is available, create a real pending doc and generate signed links
      if(db){
        const doc = {
          name: a.name,
          description: '',
          about: '',
          link: a.link,
          iconUrl: '',
          tags: [], pros: [], cons: [],
          domainSlug: slug,
          domainName,
          source: 'discovery',
          status: 'pending',
          createdAt: new Date()
        };
        const ref = await db.collection('pending_tools').add(doc);
        const id = ref.id;
        const token = signId(id);
        if (repoSlug) {
          const titleApprove = encodeURIComponent(`Approve ID: ${id}`);
          const bodyApprove = encodeURIComponent(`Action: approve\nPending ID: ${id}\nToken: ${token}`);
          const titleReject = encodeURIComponent(`Reject ID: ${id}`);
          const bodyReject = encodeURIComponent(`Action: reject\nPending ID: ${id}\nToken: ${token}`);
          const approve = `https://github.com/${repoSlug}/issues/new?labels=approval&title=${titleApprove}&body=${bodyApprove}`;
          const reject = `https://github.com/${repoSlug}/issues/new?labels=approval&title=${titleReject}&body=${bodyReject}`;
          return { approve, reject, id };
        } else {
          const approve = `${approvalBase}/.netlify/functions/approve-tool?action=approve&id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
          const reject = `${approvalBase}/.netlify/functions/approve-tool?action=reject&id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
          return { approve, reject, id };
        }
      }
      // Fallback: Firestore not available at discovery time.
      // Generate provisional GitHub Issue links that include enough payload to create the pending doc during approval.
      // Security: Links carry a signed provisional ID (HMAC) based on name+link.
      const provId = 'prov-' + crypto.createHash('sha256').update(`${a.name}|${a.link}`).digest('hex').slice(0,24);
      const token = signId(provId);
      if (repoSlug) {
        const titleApprove = encodeURIComponent(`Approve ID: ${provId}`);
        const bodyApprove = encodeURIComponent(
          `Action: approve\nPending ID: ${provId}\nToken: ${token}\nName: ${a.name}\nLink: ${a.link}\nDomain: ${domainName}\nDescription: ${a.reason || ''}`
        );
        const titleReject = encodeURIComponent(`Reject ID: ${provId}`);
        const bodyReject = encodeURIComponent(
          `Action: reject\nPending ID: ${provId}\nToken: ${token}\nName: ${a.name}\nLink: ${a.link}\nDomain: ${domainName}`
        );
        const approve = `https://github.com/${repoSlug}/issues/new?labels=approval&title=${titleApprove}&body=${bodyApprove}`;
        const reject = `https://github.com/${repoSlug}/issues/new?labels=approval&title=${titleReject}&body=${bodyReject}`;
        return { approve, reject, id: provId };
      }
      // If Netlify base is configured, provide approval function links with provisional payload
      if (approvalBase) {
        const qs = new URLSearchParams({
          action: 'approve',
          id: provId,
          token,
          name: a.name,
          link: a.link,
          domain: domainName
        }).toString();
        const approve = `${approvalBase}/.netlify/functions/approve-tool?${qs}`;
        const qsR = new URLSearchParams({
          action: 'reject',
          id: provId,
          token,
          name: a.name,
          link: a.link,
          domain: domainName
        }).toString();
        const reject = `${approvalBase}/.netlify/functions/approve-tool?${qsR}`;
        return { approve, reject, id: provId };
      }
      // Final fallback: provide Admin UI link if base URL known; else empty
      const adminUrl = approvalBase ? `${approvalBase}/admin.html` : '#';
      return { approve: adminUrl, reject: adminUrl, id: '' };
    }

    const htmlSections = await Promise.all(Object.entries(byDomain).map(async ([dom, items]) => {
      const rows = await Promise.all(items.map(async a => {
        const links = await ensurePendingAndLinks(dom, a);
        const approvalHtml = (links && links.approve && links.approve !== '#') ? `<div style="margin-top:6px;">
          <a href="${links.approve}" style="background:#2da44e;color:#fff;padding:4px 8px;border-radius:6px;text-decoration:none;">Approve</a>
          <a href="${links.reject}" style="background:#d1242f;color:#fff;padding:4px 8px;border-radius:6px;text-decoration:none;margin-left:8px;">Reject</a>
          ${links.id ? `<span style="color:#57606a;font-size:12px;margin-left:6px;">ID: ${links.id}</span>` : ''}
        </div>` : '';
        return `
            <li style="margin:6px 0;">
              ${a.link ? `<a href="${esc(a.link)}" style="color:#0969da; text-decoration:none; font-weight:600;">${esc(a.name)}</a>` : `<strong>${esc(a.name)}</strong>`}
              ${a.mode ? modeBadge(a.mode) : ''}
              <div style="color:#24292f; font-size:13px; margin-top:2px;">${esc(a.reason)}</div>
              ${a.reliability ? `<div style="font-size:12px; color:#57606a; margin-top:2px;">Reliability: ${esc(a.reliability.verdict)} (score ${esc(a.reliability.score)})</div>` : ''}
              ${a.link ? `<div style="font-size:12px; color:#57606a;">${esc(a.link)}</div>` : ''}
              ${approvalHtml}
            </li>
          `;
      }));
      return `
      <section style="margin:16px 0;">
        <h3 style="margin:0 0 8px; font-size:16px;">${esc(dom)}</h3>
        <ul style="margin:0; padding-left:18px;">
          ${rows.join('')}
        </ul>
      </section>`;
    }));

    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif; line-height:1.4; color:#24292f;">
        <div style="display:flex; align-items:center; gap:8px; margin:0 0 8px;">
          <div style="width:10px; height:10px; border-radius:2px; background:#0969da;"></div>
          <h2 style="margin:0; font-size:18px;">AI Atlas</h2>
        </div>
        <div style="margin:0 0 10px; color:#57606a;">${additions.length} new ${directPublish? 'published' : 'staged'} tool(s) on ${esc(dateStr)}</div>
        <table style="border-collapse:collapse; border:1px solid #d0d7de; margin:10px 0; width:100%; max-width:420px;">
          <thead>
            <tr style="background:#f6f8fa;"><th style="text-align:left; padding:6px 8px;">Domain</th><th style="text-align:right; padding:6px 8px;">Count</th></tr>
          </thead>
          <tbody>${summaryRows}</tbody>
        </table>
  ${htmlSections.join('')}
        <hr style="border:none; border-top:1px solid #d0d7de; margin:16px 0;"/>
        <div style="font-size:12px; color:#57606a;">You’re receiving this because discovery ran successfully. Update SMTP settings or disable emails in the workflow to stop notifications.</div>
      </div>`;

    await maybeSendEmail({ subject, text, html });
  }else{
    console.log('No new additions this run.');
    // Print a concise diagnostic summary to logs
    for(const [slug, d] of Object.entries(diag.domains)){
      console.log(`[diag] ${slug} — candidates=${d.candidates}, added=${d.added}, skips:`, d.skips);
    }
  }

  // If running in GitHub Actions, append a short summary table
  try{
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if(summaryPath){
      let md = `### Discovery summary (\`${now}\`)\n\n`;
      md += `Config: Safe Browsing key: ${diag.hasGSBKey ? 'present' : 'absent'} · Strict mode: ${diag.strict ? 'on' : 'off'}\n\n`;
      md += `| Domain | Candidates | Added | Staged | Published | Duplicate | Alias | Blacklist | Not AI | Risky | Strict Unknown |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
      for(const [slug, d] of Object.entries(diag.domains)){
        md += `| ${slug} | ${d.candidates||0} | ${d.added||0} | ${d.staged||0} | ${d.published||0} | ${d.skips.duplicate||0} | ${d.skips.alias||0} | ${d.skips.blacklist||0} | ${d.skips.notAi||0} | ${d.skips.risky||0} | ${d.skips.strictUnknown||0} |\n`;
      }
      // Append extra skips not in the main table for visibility
      md += `\n<details><summary>Extra skip reasons</summary>\n\n`;
      md += `- blogHost (by host/path): ${(diag.totals.skips.blogHost||0)}\n`;
      md += `- devPackage (registry/dev hubs): ${(diag.totals.skips.devPackage||0)}\n`;
      md += `- notTool (page classification): ${(diag.totals.skips.notTool||0)}\n`;
      md += `</details>\n`;
      await fs.appendFile(summaryPath, md);
    }
  }catch{}
}

main().catch(err=>{ console.error(err); process.exit(1); });
