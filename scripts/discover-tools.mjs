// Discover new tools for each domain and append to public/tools.json
// Sources: GitHub Search API (repos), npm search, Hacker News Algolia (stories)
// Sends an email summary if SMTP env vars are provided.

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

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
    const q = encodeURIComponent(`${query} stars:>${starsMin}`);
    const j = await ghFetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${perPage}`);
    return (j.items||[]).map(r=>({
      source: 'github',
      name: r.name,
      description: r.description || '',
      link: r.homepage && r.homepage.startsWith('http') ? r.homepage : r.html_url,
      iconUrl: r.owner?.avatar_url ? `${r.owner.avatar_url}&s=64` : undefined,
      tags: ['Open Source'],
      metrics: { stars: r.stargazers_count || 0, forks: r.forks_count || 0 },
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
    const url = `https://hn.algolia.com/api/v1/search?tags=story&query=${q}&hitsPerPage=${hits}`;
    const j = await (await fetch(url)).json();
    return (j.hits||[]).filter(h=>h.points>=100 && h.url).map(h=>({
      source: 'hn',
      name: h.title.replace(/\s*-\s*Show HN.*$/i,'').slice(0,80),
      description: h.title,
      link: h.url,
      tags: ['Trending'],
      metrics: { points: h.points },
      reason: `HN discussion (${h.points} points) for "${query}"`
    }));
  }catch{ return []; }
}

function chooseBest(cands){
  // Prefer GitHub items with stars, then HN by points
  const withScore = cands.map(c=>{
    const score = (c.metrics?.stars||0) + (c.metrics?.points||0)*10;
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
  const pendingItems = Array.isArray(pending?.items) ? pending.items : [];
  for(const it of pendingItems){ existingNames.add(normalizeKey(it.name)); existingNamesLoose.add(normalizeKeyLoose(it.name)); }
  const blacklistNames = new Set((blacklist?.names||[]).map(normalizeKey));
  const aliasMap = new Map(Object.entries(aliases?.aliases||{}).map(([a,c])=>[normalizeKey(a), normalizeKey(c)]));
  const directPublish = /^true$/i.test(String(process.env.DIRECT_PUBLISH||''));

  const additions = [];
  for(const [slug, cfg] of Object.entries(sources)){
    if(cfg && cfg.enabled === false) continue; // allow disabling domains
    const sec = domainBySlug.get(normalizeKey(slug));
    if(!sec) continue;
    const perPage = Number(cfg.githubPerPage || 5);
    const starsMin = Number(cfg.githubStarsMin || 500);
    const npmSize = Number(cfg.npmSize || 5);
    const maxAdds = Number(cfg.maxAdds || 2);
    const results = [];
    for(const q of cfg.githubQueries||[]){ results.push(...await searchGithubRepos(q, perPage, starsMin)); }
    for(const q of cfg.npmQueries||[]){ results.push(...await searchNpm(q, npmSize)); }
    for(const q of (cfg.hnQueries||[])){ results.push(...await searchHN(q, 5)); }
    const ranked = chooseBest(dedupeByName(results));
    let addedForDomain = 0;
    for(const cand of ranked){
  const k = normalizeKey(cand.name);
  const kl = normalizeKeyLoose(cand.name);
  // direct name/loose matches
  if(existingNames.has(k) || existingNamesLoose.has(kl)) continue;
  // alias match: map candidate alias -> canonical and see if present
  const aliasCanonical = aliasMap.get(k) || aliasMap.get(kl);
  if(aliasCanonical && (existingNames.has(aliasCanonical) || existingNamesLoose.has(normalizeKeyLoose(aliasCanonical)))) continue;
      if(blacklistNames.has(k)) continue;
      if(!isLikelyAITool(cand, slug)) continue;
      const tool = toToolShape(cand);
      if(directPublish){
        sec.tools = sec.tools || [];
        sec.tools.push(tool);
        existingNames.add(k);
        additions.push({ domain: sec.name || slug, name: tool.name, reason: cand.reason, mode: 'published', link: tool.link });
      } else {
        const domName = sec.name || slug;
        const items = Array.isArray(pending?.items) ? pending.items : [];
        // avoid staging duplicates
        if(!items.some(it => normalizeKey(it.name) === k || normalizeKeyLoose(it.name) === kl)){
          items.push({ domain: domName, ...tool, reason: cand.reason });
          pending.items = items;
          additions.push({ domain: domName, name: tool.name, reason: cand.reason, mode: 'staged', link: tool.link });
        }
      }
      addedForDomain += 1;
      if(addedForDomain >= maxAdds) break;
    }
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

  if(additions.length){
    const dateStr = new Date().toISOString().slice(0,10);
    const subject = `AI Atlas — ${additions.length} new ${directPublish? 'published' : 'staged'} tool(s) on ${dateStr}`;

    // Group by domain for nicer formatting
    const byDomain = additions.reduce((acc, a)=>{ (acc[a.domain] ||= []).push(a); return acc; }, {});

    // Plain text fallback
    const text = Object.entries(byDomain)
      .map(([dom, items]) => [`${dom}:`, ...items.map(a => `  • ${a.name}${a.link?` — ${a.link}`:''}\n    Why: ${a.reason}${a.mode?`\n    Mode: ${a.mode}`:''}`)].join('\n'))
      .join('\n\n');

    // Minimal HTML email (inline styles for broad client support)
    const esc = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const htmlSections = Object.entries(byDomain).map(([dom, items]) => `
      <section style="margin:16px 0;">
        <h3 style="margin:0 0 8px; font-size:16px;">${esc(dom)}</h3>
        <ul style="margin:0; padding-left:18px;">
          ${items.map(a => `
            <li style="margin:6px 0;">
              ${a.link ? `<a href="${esc(a.link)}" style="color:#0969da; text-decoration:none; font-weight:600;">${esc(a.name)}</a>` : `<strong>${esc(a.name)}</strong>`}
              ${a.mode ? `<span style="color:#6a737d;">(${esc(a.mode)})</span>` : ''}
              <div style="color:#24292f; font-size:13px; margin-top:2px;">${esc(a.reason)}</div>
              ${a.link ? `<div style="font-size:12px; color:#57606a;">${esc(a.link)}</div>` : ''}
            </li>
          `).join('')}
        </ul>
      </section>
    `).join('');

    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif; line-height:1.4; color:#24292f;">
        <h2 style="margin:0 0 12px;">AI Atlas</h2>
        <div style="margin:0 0 14px; color:#57606a;">${additions.length} new ${directPublish? 'published' : 'staged'} tool(s) on ${esc(dateStr)}</div>
        ${htmlSections}
        <hr style="border:none; border-top:1px solid #d0d7de; margin:16px 0;"/>
        <div style="font-size:12px; color:#57606a;">You’re receiving this because discovery ran successfully. Update SMTP settings or disable emails in the workflow to stop notifications.</div>
      </div>`;

    await maybeSendEmail({ subject, text, html });
  }else{
    console.log('No new additions this run.');
  }
}

main().catch(err=>{ console.error(err); process.exit(1); });
