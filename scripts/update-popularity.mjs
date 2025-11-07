// Minimal popularity updater (tokenless): fetch GitHub stars and npm downloads
// Outputs public/popularity.json with either actualUsers overrides or computed popularityScore rank
// Safe to run locally without secrets; rate limits are mild for small lists

import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd());
const DATA_DIR = path.join(root, 'data');
const PUBLIC_DIR = path.join(root, 'public');
const SOURCES_PATH = path.join(DATA_DIR, 'tools-sources.json');
const OVERRIDES_PATH = path.join(DATA_DIR, 'popularity-overrides.json');
const RAW_OUT_PATH = path.join(DATA_DIR, 'popularity_raw.json');
const OUT_PATH = path.join(PUBLIC_DIR, 'popularity.json');
const OUT_RANKS_PATH = path.join(PUBLIC_DIR, 'popularity_ranks.json');
const TOOLS_JSON_PATH = path.join(PUBLIC_DIR, 'tools.json');

async function readJsonSafe(p){
  try{ const s = await fs.readFile(p, 'utf8'); return JSON.parse(s); }catch{ return {}; }
}

const GH_TOKEN = process.env.GITHUB_TOKEN || '';

async function fetchJson(url){
  const headers = {};
  // Add GitHub headers only for GitHub API endpoints
  if(url.startsWith('https://api.github.com/')){
    headers['Accept'] = 'application/vnd.github+json';
    headers['User-Agent'] = 'ai-atlas-popularity-script';
    if(GH_TOKEN) headers['Authorization'] = `Bearer ${GH_TOKEN}`;
  }
  const res = await fetch(url, { headers });
  if(!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return res.json();
}

async function fetchGithub(repo){
  // repo format: owner/name
  try{
    const base = await fetchJson(`https://api.github.com/repos/${repo}`);
    // commits in last 90 days (approx): use commits API with since param; unauthenticated has low rate limits
    const since = new Date(Date.now() - 90*24*60*60*1000).toISOString();
    let commitCount90 = 0;
    try{
      const commits = await fetchJson(`https://api.github.com/repos/${repo}/commits?since=${encodeURIComponent(since)}&per_page=100`);
      commitCount90 = Array.isArray(commits) ? commits.length : 0;
    }catch{ /* ignore rate limit */ }
    // latest release recency
    let daysSinceRelease = null;
    try{
      const rel = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`);
      const published = rel?.published_at ? new Date(rel.published_at).getTime() : null;
      if(published){ daysSinceRelease = Math.max(0, Math.round((Date.now() - published)/(1000*60*60*24))); }
    }catch{ /* no releases or rate limit */ }
    return {
      stars: base.stargazers_count || 0,
      forks: base.forks_count || 0,
      openIssues: base.open_issues_count || 0,
      commitCount90,
      daysSinceRelease
    };
  }catch{ return { stars:0, forks:0, openIssues:0, commitCount90:0, daysSinceRelease:null }; }
}

async function fetchNpm(pkg){
  try{
    const week = await fetchJson(`https://api.npmjs.org/downloads/point/last-week/${pkg}`);
    const month = await fetchJson(`https://api.npmjs.org/downloads/point/last-month/${pkg}`);
    return { weeklyDownloads: week.downloads || 0, monthlyDownloads: month.downloads || 0 };
  }catch{ return { weeklyDownloads:0, monthlyDownloads:0 }; }
}

async function fetchPypi(project){
  // Simple JSON API doesn't provide downloads; use pypistats.org JSON if available without auth (best-effort)
  try{
    const lastMonth = await fetchJson(`https://pypistats.org/api/packages/${project}/recent`);
    // sum last_month across installer categories where available
    const dl = lastMonth?.data?.last_month || 0;
    return { monthlyDownloads: dl };
  }catch{ return { monthlyDownloads: 0 }; }
}

function scoreFromSignals(sig){
  // Raw log-based score (will be normalized later across all tools)
  const log = (x)=> Math.log10((x||0)+1);
  const stars = 0.6*log(sig.github?.stars);
  const forks = 0.15*log(sig.github?.forks);
  const npmDls = 0.6*log(sig.npm?.monthlyDownloads || sig.npm?.weeklyDownloads);
  const pypiDls = 0.5*log(sig.pypi?.monthlyDownloads);
  const commits = 0.3*log(sig.github?.commitCount90);
  // release freshness: newer is better; map daysSinceRelease to a decay 0..1, then scale to 0..0.3
  let relFresh = 0;
  if (typeof sig.github?.daysSinceRelease === 'number' && sig.github.daysSinceRelease >= 0){
    const days = sig.github.daysSinceRelease;
    const decay = 1 / (1 + days/90); // ~0.5 at 90 days, ~0.25 at 270 days
    relFresh = 0.3 * decay;
  }
  const s = stars + forks + npmDls + pypiDls + commits + relFresh;
  return Number(s.toFixed(4));
}

function normalizeKey(s){
  return String(s||'').trim().toLowerCase();
}

function buildMostPopularOrderMap(db){
  const mp = (db || []).find(sec => normalizeKey(sec.slug) === 'most-popular' || normalizeKey(sec.name) === 'most popular');
  if(!mp || !Array.isArray(mp.tools)) return {};
  const n = mp.tools.length || 1;
  const map = {};
  mp.tools.forEach((t, idx) => {
    const key = normalizeKey(t?.name);
    if(!key) return;
    // Higher is better; linear 100..>1
    const score = 100 * ((n - idx) / n);
    map[key] = score;
  });
  return map;
}

function buildFrequencyMap(db){
  const freq = {};
  (db||[]).forEach(sec => {
    (sec.tools||[]).forEach(t => {
      const k = normalizeKey(t?.name);
      if(!k) return;
      freq[k] = (freq[k]||0) + 1;
    });
  });
  return freq;
}

function isOpenSourceTool(toolName, allTools){
  // Find the tool in the database and check if it has 'Open Source' tag
  const tool = allTools.find(t => normalizeKey(t.name) === normalizeKey(toolName));
  if(!tool) return false;
  const tags = tool.tags || [];
  return tags.includes('Open Source');
}

async function main(){
  const sources = await readJsonSafe(SOURCES_PATH);
  const overrides = await readJsonSafe(OVERRIDES_PATH);
  const toolsDb = await readJsonSafe(TOOLS_JSON_PATH);
  const db = Array.isArray(toolsDb) ? toolsDb : [];
  const allTools = db.flatMap(sec => Array.isArray(sec.tools) ? sec.tools : []);
  const allNames = [...new Set(allTools.map(t => t.name).filter(Boolean))];

  const entries = Object.entries(sources);
  const raw = {};

  const mpOrderMap = buildMostPopularOrderMap(db); // approx 0..100
  const freqMap = buildFrequencyMap(db); // integer counts

  for(const [name, src] of entries){
    const sig = { github: null, npm: null, pypi: null };
    if(src.github) sig.github = await fetchGithub(src.github);
    if(src.npm) sig.npm = await fetchNpm(src.npm);
    if(src.pypi) sig.pypi = await fetchPypi(src.pypi);
    const signalsRaw = scoreFromSignals(sig); // unnormalized
    raw[name] = { signals: sig, signalsRaw };
  }

  // Normalize signalsRaw into 0..100 range for fair combination with mpScore
  const rawValues = Object.values(raw).map(r => r?.signalsRaw || 0).filter(v => v>0);
  const maxSignals = rawValues.length ? Math.max(...rawValues) : 0;
  const signalsNormMap = {};
  if(maxSignals > 0){
    for(const [name, r] of Object.entries(raw)){
      const v = r?.signalsRaw || 0;
      signalsNormMap[name] = v>0 ? Number(((v / maxSignals) * 100).toFixed(2)) : 0;
    }
  }

  // Ensure every tool has a combined score (signals + MP order + frequency)
  for(const name of allNames){
    const k = normalizeKey(name);
    const existing = raw[name];
    
    // Check if tool is open source - if so, skip ranking calculation
    // Open source tools are excluded from rankings per business requirements
    const isOpenSource = isOpenSourceTool(name, allTools);
    
    const signalsScore = (signalsNormMap[name] || 0); // 0..100 normalized
    const mpScore = mpOrderMap[k] || 0;
    const freqScore = Math.max(0, (freqMap[k] || 0) - 1) * 10; // +10 per extra occurrence beyond first
    const freqCapped = Math.min(30, freqScore); // avoid inflate by repeats
    // Boost for real user overrides (if provided); logarithmic, mapped to 0..100
    const actual = (overrides[name] && typeof overrides[name].actualUsers === 'number') ? overrides[name].actualUsers : null;
    const usersScore = actual ? Math.min(100, Math.log10(actual + 1) * 20) : 0; // ~100 at 1e5+
    
    // Weighted combination (emphasize curated Most Popular list; then signals; small repeat bonus)
    // If usersScore present, prioritize it by blending as primary signal
    // For open source tools, set combined score to 0 to exclude from rankings per business requirements
    let combined;
    if(isOpenSource){
      combined = 0; // Exclude open source tools from rankings
    } else if(usersScore > 0){
      combined = Number((0.6*usersScore + 0.3*mpScore + 0.1*signalsScore + 0.05*freqCapped).toFixed(2));
    } else {
      combined = Number((0.6*mpScore + 0.35*signalsScore + 0.05*freqCapped).toFixed(2));
    }
    
    raw[name] = {
      ...(existing || { signals: { github: null, npm: null } }),
      signalsRaw: existing?.signalsRaw || 0,
      signalsNorm: signalsScore,
      mpScore,
      freqScore,
      usersScore,
      popularityScore: combined,
      isOpenSource  // Track if tool is open source (tagged with 'Open Source') for debugging and transparency
    };
  }

  // Sort for ranks across ALL tools
  const ranked = Object.entries(raw)
    .sort((a,b)=> (b[1].popularityScore||0) - (a[1].popularityScore||0))
    .map(([name, val], i)=> ({ name, score: val.popularityScore||0, rank: i+1 }));
  const rankMap = Object.fromEntries(ranked.map(e=> [e.name, e.rank]));

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(RAW_OUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), raw, ranked }, null, 2));

  // Prepare final output for the app
  const out = {};
  for(const name of allNames){
    const override = overrides[name];
    if(override && typeof override.actualUsers === 'number'){
      out[name] = override.actualUsers; // trusted real number
    }else{
      // Store negative rank as placeholder; UI will show Rank and not treat as users
      // Alternatively, store zero and rely on rank in UI—here we keep zero to avoid confusion
      out[name] = 0;
    }
  }

  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2));
  await fs.writeFile(OUT_RANKS_PATH, JSON.stringify(rankMap, null, 2));

  console.log('popularity.json written. For true counts, set data/popularity-overrides.json { "Tool": { "actualUsers": 123456 } }');
  console.log('Ranks stored in data/popularity_raw.json and public/popularity_ranks.json.');
}

main().catch(err=>{ console.error(err); process.exit(1); });
