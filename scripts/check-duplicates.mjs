import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd());
const PUBLIC_TOOLS = path.join(root, 'public', 'tools.json');
const PENDING = path.join(root, 'data', 'pending-tools.json');
const ALIASES = path.join(root, 'data', 'aliases.json');

function norm(s){ return String(s||'').trim().toLowerCase(); }
function normLoose(s){ return norm(s).replace(/[^a-z0-9]+/g,''); }
function tokens(s){ return norm(s).split(/[^a-z0-9]+/).filter(Boolean); }

function jaccard(a, b){
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if(sa.size===0 && sb.size===0) return 1;
  const inter = [...sa].filter(x=>sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return inter/union;
}

function levenshtein(a, b){
  a = normLoose(a); b = normLoose(b);
  const m = a.length, n = b.length;
  if(m===0) return n; if(n===0) return m;
  const dp = Array.from({length:m+1}, ()=>Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0]=i;
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      const cost = a[i-1]===b[j-1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i-1][j]+1,
        dp[i][j-1]+1,
        dp[i-1][j-1]+cost
      );
    }
  }
  return dp[m][n];
}

async function readJson(p){ const s = await fs.readFile(p,'utf8'); return JSON.parse(s); }

function parseUrl(u){
  try { const { hostname, pathname } = new URL(u); return { hostname: hostname?.toLowerCase(), pathname }; }
  catch { return { hostname: null, pathname: null }; }
}
function rootDomain(host){ if(!host) return null; const parts = host.split('.'); return parts.length >= 2 ? parts.slice(-2).join('.') : host; }
function githubRepoFrom(link){
  const { hostname, pathname } = parseUrl(link||'');
  if(!hostname) return null;
  if(!/github\.com$/i.test(hostname)) return null;
  const segs = (pathname||'').split('/').filter(Boolean);
  if(segs.length < 2) return null;
  let owner = segs[0], repo = segs[1];
  repo = repo.replace(/\.git$/i,'');
  return `${norm(owner)}/${norm(repo)}`;
}
function npmPackageFrom(link){
  const { hostname, pathname } = parseUrl(link||'');
  if(!hostname) return null;
  if(!/npmjs\.com$/i.test(hostname)) return null;
  const m = (pathname||'').match(/\/package\/(.+)$/);
  if(!m) return null;
  return decodeURIComponent(m[1]);
}

async function main(){
  const [db, pending, aliases] = await Promise.all([
    readJson(PUBLIC_TOOLS),
    readJson(PENDING).catch(()=>({ items: [] })),
    readJson(ALIASES).catch(()=>({ aliases: {} }))
  ]);

  const existing = [];
  for(const sec of db){
    for(const t of (sec.tools||[])){
      existing.push({ domain: sec.name||sec.slug, name: t.name, link: t.link || '' });
    }
  }
  const existingLoose = new Map(existing.map(e=>[normLoose(e.name), e]));
  // Precompute domains and ids for faster comparisons
  for(const e of existing){
    const { hostname } = parseUrl(e.link);
    e.hostname = hostname; e.root = rootDomain(hostname);
    e.gh = githubRepoFrom(e.link);
    e.npm = npmPackageFrom(e.link);
  }
  const aliasMap = new Map(Object.entries(aliases.aliases||{}).map(([k,v])=>[norm(k), norm(v)]));

  const toCheck = (pending.items||[]);
  if(!toCheck.length){ console.log('No pending items to check.'); return; }

  const JACCARD_MIN = Number(process.env.JACCARD_MIN || 0.5);
  const LEV_MAX = Number(process.env.LEV_MAX || 3);

  const lines = [];
  for(const d of toCheck){
    const name = d.name;
    const key = normLoose(name);
    const alias = aliasMap.get(norm(name)) || aliasMap.get(key);
    const maybeCanonical = alias ? alias : null;
    const link = d.link || '';
    const { hostname: pHost } = parseUrl(link);
    const pRoot = rootDomain(pHost);
    const pGh = githubRepoFrom(link);
    const pNpm = npmPackageFrom(link);

    // Exact loose match
    if(existingLoose.has(key)){
      const match = existingLoose.get(key);
      lines.push(`= EXACT (loose) | PENDING: "${name}" ~ EXISTING: "${match.name}" (${match.domain})`);
      continue;
    }

    // Alias canonical match
    if(maybeCanonical && existingLoose.has(normLoose(maybeCanonical))){
      const match = existingLoose.get(normLoose(maybeCanonical));
      lines.push(`~ ALIAS       | PENDING: "${name}" → "${maybeCanonical}" ~ EXISTING: "${match.name}" (${match.domain})`);
      continue;
    }

    // Strong URL-based matches
    if(pGh){
      const ghMatch = existing.find(e => e.gh && e.gh === pGh);
      if(ghMatch){ lines.push(`! GH-REPO     | PENDING: "${name}" (${pGh}) ~ EXISTING: "${ghMatch.name}" (${ghMatch.domain})`); continue; }
    }
    if(pNpm){
      const npmMatch = existing.find(e => e.npm && norm(e.npm) === norm(pNpm));
      if(npmMatch){ lines.push(`! NPM-PKG     | PENDING: "${name}" (${pNpm}) ~ EXISTING: "${npmMatch.name}" (${npmMatch.domain})`); continue; }
    }
    if(pRoot){
      const sameRoot = existing.filter(e => e.root && e.root === pRoot);
      if(sameRoot.length){
        // If same root domain, we can relax thresholds a bit
        let bestSame = null;
        for(const e of sameRoot){
          const jac = jaccard(name, e.name);
          const lev = levenshtein(name, e.name);
          const score = jac - (lev/20);
          if(!bestSame || score > bestSame.score){ bestSame = { e, jac, lev, score }; }
        }
        if(bestSame && (bestSame.jac >= Math.max(0.4, JACCARD_MIN-0.1) || bestSame.lev <= LEV_MAX+1)){
          lines.push(`~ SAME-DOMAIN | PENDING: "${name}" (${pRoot}) ~ EXISTING: "${bestSame.e.name}" (${bestSame.e.domain}) | jac=${bestSame.jac.toFixed(2)} lev=${bestSame.lev}`);
          continue;
        }
      }
    }

    // Fuzzy scan across all
    let best = null;
    for(const e of existing){
      const jac = jaccard(name, e.name);
      const lev = levenshtein(name, e.name);
      const score = jac - (lev/20);
      if(!best || score > best.score){ best = { e, jac, lev, score }; }
    }
    if(best && (best.jac >= JACCARD_MIN || best.lev <= LEV_MAX)){
      lines.push(`? POSSIBLE    | PENDING: "${name}" ~ EXISTING: "${best.e.name}" (${best.e.domain}) | jac=${best.jac.toFixed(2)} lev=${best.lev}`);
    }
  }

  if(!lines.length){
    console.log('No potential duplicates found.');
  } else {
  // Order by severity
  const severity = line => line.startsWith('=') ? 0 : line.startsWith('!') ? 1 : line.startsWith('~') ? 2 : 3;
  lines.sort((a,b)=> severity(a)-severity(b));
  console.log('Duplicate check report:');
  console.log(lines.join('\n'));
    console.log('\nAdjust thresholds with env vars: JACCARD_MIN (default 0.5), LEV_MAX (default 3).');
  }
}

main().catch(err=>{ console.error(err); process.exit(1); });
