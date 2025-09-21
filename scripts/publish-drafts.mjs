import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd());
const DATA_DIR = path.join(root, 'data');
const PUBLIC_DIR = path.join(root, 'public');
const TOOLS_JSON = path.join(PUBLIC_DIR, 'tools.json');
const PENDING_JSON = path.join(DATA_DIR, 'pending-tools.json');

function normalizeKey(s){ return String(s||'').trim().toLowerCase(); }
async function readJsonSafe(p){ try{ const s = await fs.readFile(p,'utf8'); return JSON.parse(s);}catch{ return Array.isArray(p)?[]:{}; } }
async function writeJson(p, obj){ await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(obj, null, 2)); }

async function main(){
  const [db, pending] = await Promise.all([ readJsonSafe(TOOLS_JSON), readJsonSafe(PENDING_JSON) ]);
  const sections = Array.isArray(db) ? db : [];
  const items = Array.isArray(pending?.items) ? pending.items : [];
  if(!items.length){ console.log('No drafts to publish.'); return; }

  const domainByNameOrSlug = new Map();
  for(const sec of sections){
    domainByNameOrSlug.set(normalizeKey(sec.name), sec);
    domainByNameOrSlug.set(normalizeKey(sec.slug), sec);
  }

  const existingNames = new Set(sections.flatMap(sec => (sec.tools||[]).map(t=>normalizeKey(t.name))));
  const published = [];
  for(const draft of items){
    const sec = domainByNameOrSlug.get(normalizeKey(draft.domain));
    if(!sec) { console.warn('Unknown domain for draft:', draft.domain, '-', draft.name); continue; }
    const k = normalizeKey(draft.name);
    if(existingNames.has(k)) { console.log('Already present, skipping:', draft.name); continue; }
    const tool = {
      name: draft.name,
      description: draft.description || draft.about || 'New tool',
      link: draft.link,
      iconUrl: draft.iconUrl,
      tags: draft.tags || [],
      about: draft.about || draft.description || '',
      pros: draft.pros || [],
      cons: draft.cons || []
    };
    sec.tools = sec.tools || [];
    sec.tools.push(tool);
    existingNames.add(k);
    published.push({ domain: sec.name || sec.slug, name: tool.name });
  }

  if(published.length){
    await writeJson(TOOLS_JSON, sections);
    pending.items = [];
    pending.lastUpdated = new Date().toISOString();
    await writeJson(PENDING_JSON, pending);
    console.log('Published tools:', published.map(p=>`${p.name} -> ${p.domain}`).join(', '));
  } else {
    console.log('No tools were published.')
  }
}

main().catch(err=>{ console.error(err); process.exit(1); });
