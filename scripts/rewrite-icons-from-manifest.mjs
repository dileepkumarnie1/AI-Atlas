#!/usr/bin/env node
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const TOOLS_JSON = path.join(root, 'public', 'tools.json');
const MANIFEST = path.join(root, 'public', 'icons', 'manifest.json');

function normalizeKey(s){ return String(s||'').trim().toLowerCase(); }

async function main(){
  let sections;
  try{
    sections = JSON.parse(await fs.readFile(TOOLS_JSON, 'utf8'));
  }catch{
    console.error('No public/tools.json found; nothing to rewrite.');
    process.exit(0);
  }
  if (!Array.isArray(sections)) { console.error('Invalid tools.json'); process.exit(1); }
  if (!fssync.existsSync(MANIFEST)) { console.log('No icon manifest found; skipping.'); process.exit(0); }
  const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  let touched = 0;
  for (const sec of sections){
    const secKey = normalizeKey(sec.slug || sec.name);
    const tools = Array.isArray(sec.tools) ? sec.tools : [];
    for (const t of tools){
      const k = `${secKey}::${normalizeKey(t?.name)}`;
      const local = manifest[k];
      if (local){
        const rel = String(local).replace(/^public\//, '');
        if (t.iconUrl !== rel){ t.iconUrl = rel; touched++; }
      }
    }
  }
  if (touched){
    await fs.writeFile(TOOLS_JSON, JSON.stringify(sections, null, 2));
    console.log(`Rewrote ${touched} iconUrl entries using manifest.`);
  } else {
    console.log('No icon rewrites needed.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
