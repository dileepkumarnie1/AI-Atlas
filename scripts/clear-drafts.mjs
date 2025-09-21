import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd());
const PENDING_JSON = path.join(root, 'data', 'pending-tools.json');

async function readJsonSafe(p){ try{ const s = await fs.readFile(p,'utf8'); return JSON.parse(s);}catch{ return { items: [], lastUpdated: null }; } }
async function writeJson(p, obj){ await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(obj, null, 2)); }

async function main(){
  const pending = await readJsonSafe(PENDING_JSON);
  pending.items = [];
  pending.lastUpdated = new Date().toISOString();
  await writeJson(PENDING_JSON, pending);
  console.log('Cleared pending drafts.');
}

main().catch(err=>{ console.error(err); process.exit(1); });
