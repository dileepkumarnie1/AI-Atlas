import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd());
const PUBLIC_DIR = path.join(root, 'public');
const DATA_DIR = path.join(root, 'data');
const TOOLS_JSON_PATH = path.join(PUBLIC_DIR, 'tools.json');
const OUT_PATH = path.join(DATA_DIR, 'hygiene-report.json');

function normalizeKey(s){
  return String(s||'').trim().toLowerCase();
}

function hostnameOf(url){
  try{ return new URL(url).hostname.toLowerCase(); }catch{ return ''; }
}

async function main(){
  const raw = await fs.readFile(TOOLS_JSON_PATH, 'utf8');
  const db = JSON.parse(raw);
  if(!Array.isArray(db)) throw new Error('tools.json root is not an array');

  // identify github domain slug(s)
  const githubSlugs = new Set(
    db.filter(sec => normalizeKey(sec.slug||'').includes('github') || normalizeKey(sec.name||'').includes('github'))
      .map(sec => String(sec.slug||'').trim())
      .filter(Boolean)
  );

  const byName = new Map();
  const missingIcons = [];
  const lowQualityIcons = [];
  const githubOutsideDomain = [];

  for(const sec of db){
    const secSlug = String(sec.slug || sec.name || '').trim();
    const tools = Array.isArray(sec.tools) ? sec.tools : [];
    for(const t of tools){
      const name = String(t.name||'').trim();
      if(!name) continue;
      const k = normalizeKey(name);
      const link = String(t.link||'').trim();
      const iconUrl = String(t.iconUrl||'').trim();

      if(!byName.has(k)) byName.set(k, { name, occurrences: [] });
      byName.get(k).occurrences.push({ section: secSlug, link, iconUrl });

      // icons
      if(!iconUrl){
        missingIcons.push({ name, section: secSlug, link });
      }else{
        const iu = iconUrl.toLowerCase();
        if(iu.endsWith('.ico') || iu.includes('/favicon')){
          lowQualityIcons.push({ name, section: secSlug, iconUrl });
        }
      }

      // github links outside github domain sections
      const host = hostnameOf(link);
      if(host === 'github.com' || host.endsWith('.github.com')){
        if(!githubSlugs.has(secSlug)){
          githubOutsideDomain.push({ name, section: secSlug, link });
        }
      }
    }
  }

  const duplicates = [];
  for(const { name, occurrences } of byName.values()){
    if(occurrences.length > 1){
      duplicates.push({ name, count: occurrences.length, occurrences });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      sections: db.length,
      totalTools: Array.from(byName.values()).reduce((acc, v) => acc + v.occurrences.length, 0),
      uniqueTools: byName.size,
      duplicates: duplicates.length,
      missingIcons: missingIcons.length,
      lowQualityIcons: lowQualityIcons.length,
      githubOutsideDomain: githubOutsideDomain.length
    },
    duplicates: duplicates.sort((a,b)=> b.count - a.count || a.name.localeCompare(b.name)),
    missingIcons: missingIcons,
    lowQualityIcons: lowQualityIcons,
    githubOutsideDomain: githubOutsideDomain
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(report, null, 2));
  console.log('Hygiene report written to', OUT_PATH);
}

main().catch(err => { console.error(err); process.exit(1); });
