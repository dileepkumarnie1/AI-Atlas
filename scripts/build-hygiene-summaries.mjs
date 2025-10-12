import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd());
const PUBLIC_DIR = path.join(root, 'public');
const DATA_DIR = path.join(root, 'data');
const TOOLS_JSON_PATH = path.join(PUBLIC_DIR, 'tools.json');
const REPORT_JSON_PATH = path.join(DATA_DIR, 'hygiene-report.json');
const REPORT_MD_PATH = path.join(DATA_DIR, 'hygiene-report.md');
const SUGGESTIONS_JSON_PATH = path.join(DATA_DIR, 'hygiene-suggestions.json');

function normalizeKey(s){ return String(s||'').trim().toLowerCase(); }

function getGithubOwnerFromLink(url){
  try{
    const u = new URL(url);
    if(u.hostname !== 'github.com') return '';
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] || '';
  }catch{ return ''; }
}

function siteCandidates(origin){
  const urls = [];
  urls.push(origin + '/favicon.svg');
  urls.push(origin + '/apple-touch-icon.png');
  urls.push(origin + '/favicon.ico');
  return urls;
}

async function main(){
  const toolsRaw = await fs.readFile(TOOLS_JSON_PATH, 'utf8');
  const db = JSON.parse(toolsRaw);
  const repRaw = await fs.readFile(REPORT_JSON_PATH, 'utf8');
  const rep = JSON.parse(repRaw);

  // Discover the GitHub domain slug to target moves into
  const githubSections = db.filter(sec => normalizeKey(sec.slug||'').includes('github') || normalizeKey(sec.name||'').includes('github'));
  const githubSlug = githubSections[0]?.slug || githubSections[0]?.name || 'GitHub AI Projects';

  // Build duplicates suggestions: choose one primary (non Most Popular if possible), remove others except allow presence in Most Popular
  const dupSuggestions = [];
  for(const d of rep.duplicates || []){
    const occ = d.occurrences || [];
    if(occ.length < 2) continue;
    // prefer non most-popular entry; fallback to first
    const primary = occ.find(o => normalizeKey(o.section) !== 'most-popular') || occ[0];
    const remove = occ.filter(o => o !== primary && normalizeKey(o.section) !== 'most-popular');
    dupSuggestions.push({ name: d.name, keep: { section: primary.section, link: primary.link }, remove });
  }

  // Moves for GitHub outside domain
  const moveSuggestions = [];
  for(const g of rep.githubOutsideDomain || []){
    moveSuggestions.push({ name: g.name, from: g.section, to: githubSlug, link: g.link });
  }

  // Icon suggestions
  const iconMissing = [];
  for(const m of rep.missingIcons || []){
    try{
      const u = new URL(m.link);
      const origin = u.origin;
      const owner = getGithubOwnerFromLink(m.link);
      const candidates = owner ? [
        `https://avatars.githubusercontent.com/${owner}?s=128&v=4`,
        ...siteCandidates(origin)
      ] : siteCandidates(origin);
      iconMissing.push({ name: m.name, section: m.section, link: m.link, candidates, recommended: candidates[0] });
    }catch{
      iconMissing.push({ name: m.name, section: m.section, link: m.link, candidates: [], recommended: '' });
    }
  }
  const iconLowQ = [];
  for(const l of rep.lowQualityIcons || []){
    try{
      const owner = getGithubOwnerFromLink(l.iconUrl) || getGithubOwnerFromLink(l.link);
      let candidates = [];
      if(owner){
        candidates.push(`https://avatars.githubusercontent.com/${owner}?s=128&v=4`);
      }
      // If we can parse the link, add site-based candidates
      if(l.link){
        try{ const origin = new URL(l.link).origin; candidates.push(...siteCandidates(origin)); }catch{}
      }
      // De-dup candidates
      candidates = Array.from(new Set(candidates));
      iconLowQ.push({ name: l.name, section: l.section, link: l.link, current: l.iconUrl, candidates, recommended: candidates[0]||'' });
    }catch{
      iconLowQ.push({ name: l.name, section: l.section, link: l.link, current: l.iconUrl, candidates: [], recommended: '' });
    }
  }

  const suggestions = {
    generatedAt: new Date().toISOString(),
    githubDomainSlug: githubSlug,
    duplicates: dupSuggestions,
    moves: moveSuggestions,
    icons: { missing: iconMissing, lowQuality: iconLowQ }
  };

  // Write suggestions JSON
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SUGGESTIONS_JSON_PATH, JSON.stringify(suggestions, null, 2));

  // Build Markdown summary
  const s = rep.summary || {};
  const topDup = (rep.duplicates||[]).slice(0, 15);
  const lines = [];
  lines.push(`# Tools Hygiene Report`);
  lines.push('');
  lines.push(`Generated: ${rep.generatedAt || new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Sections: ${s.sections ?? 'n/a'}`);
  lines.push(`- Total tools (occurrences): ${s.totalTools ?? 'n/a'}`);
  lines.push(`- Unique tools: ${s.uniqueTools ?? 'n/a'}`);
  lines.push(`- Duplicates: ${s.duplicates ?? 0}`);
  lines.push(`- Missing icons: ${s.missingIcons ?? 0}`);
  lines.push(`- Low-quality icons: ${s.lowQualityIcons ?? 0}`);
  lines.push(`- GitHub links outside GitHub domain: ${s.githubOutsideDomain ?? 0}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Duplicate tools (top 15)');
  lines.push('');
  if(topDup.length === 0){
    lines.push('_No duplicates detected._');
  }else{
    for(const d of topDup){
      lines.push(`- ${d.name} — ${d.count} occurrences`);
      for(const o of d.occurrences){
        lines.push(`  - ${o.section}${o.link?` — ${o.link}`:''}`);
      }
    }
  }
  lines.push('');
  lines.push('## GitHub outside GitHub domain (sample)');
  lines.push('');
  for(const g of (rep.githubOutsideDomain||[]).slice(0, 20)){
    lines.push(`- ${g.name} — ${g.section} → move to ${githubSlug}`);
  }
  lines.push('');
  lines.push('## Icon issues');
  lines.push('');
  lines.push(`- Missing icons: ${s.missingIcons ?? 0}`);
  lines.push(`- Low-quality icons: ${s.lowQualityIcons ?? 0}`);
  lines.push('');
  lines.push('Recommended sources:');
  lines.push('- GitHub: https://avatars.githubusercontent.com/<org-or-user>?s=128&v=4');
  lines.push('- Sites: /favicon.svg, /apple-touch-icon.png (prefer SVG over ICO)');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('This report is auto-generated. Apply changes manually or wire an approval workflow to consume `data/hygiene-suggestions.json`.');

  await fs.writeFile(REPORT_MD_PATH, lines.join('\n'));
  console.log('Wrote', REPORT_MD_PATH, 'and', SUGGESTIONS_JSON_PATH);
}

main().catch(err=>{ console.error(err); process.exit(1); });
