#!/usr/bin/env node
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const TOOLS_JSON = path.join(root, 'public', 'tools.json');
const OVERRIDES = path.join(root, 'data', 'pricing-overrides.json');

function normalizeKey(s){ return String(s||'').trim().toLowerCase(); }

async function main(){
  let sections;
  try{ sections = JSON.parse(await fs.readFile(TOOLS_JSON, 'utf8')); }
  catch{ console.error('No public/tools.json found'); process.exit(1); }
  if (!Array.isArray(sections)) { console.error('Invalid tools.json'); process.exit(1); }
  let overrides = {};
  try{ overrides = JSON.parse(await fs.readFile(OVERRIDES, 'utf8')); } catch {}
  if (!overrides || typeof overrides !== 'object') { console.log('No overrides found'); process.exit(0); }
  const CANON = new Set(['Open Source','Free','Freemium','Subscription']);
  let touched = 0;
  for (const sec of sections){
    const secKey = normalizeKey(sec.slug || sec.name);
    const tools = Array.isArray(sec.tools) ? sec.tools : [];
    for (const t of tools){
      const toolKey = `${secKey}::${normalizeKey(t?.name)}`;
      if (overrides[toolKey] != null){
        const ov = overrides[toolKey];
        const labels = Array.isArray(ov) ? ov : [ov];
        const nonPricing = (Array.isArray(t.tags) ? t.tags : []).filter(x => !CANON.has(String(x)));
        const merged = Array.from(new Set([...nonPricing, ...labels]));
        if (JSON.stringify(merged) !== JSON.stringify(t.tags||[])){
          t.tags = merged;
          touched++;
        }
      }
    }
  }
  if (touched){
    await fs.writeFile(TOOLS_JSON, JSON.stringify(sections, null, 2));
    console.log(`Applied pricing overrides to ${touched} tool(s).`);
  } else {
    console.log('No pricing overrides to apply.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
