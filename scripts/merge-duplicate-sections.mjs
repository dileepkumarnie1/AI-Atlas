#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const TOOLS_JSON = path.join(root, 'public', 'tools.json');
const SLUG_ALIASES = path.join(root, 'data', 'domain-slug-aliases.json');

function normalizeKey(s){ return String(s||'').trim().toLowerCase(); }

async function main(){
  const raw = await fs.readFile(TOOLS_JSON, 'utf8');
  const sections = JSON.parse(raw);
  if (!Array.isArray(sections)) { throw new Error('tools.json is not an array'); }
  let aliasMap = {};
  try {
    const a = JSON.parse(await fs.readFile(SLUG_ALIASES, 'utf8'));
    aliasMap = a.aliases || a || {};
  } catch {}
  const bySlug = new Map();
  sections.forEach((s, idx) => bySlug.set(normalizeKey(s.slug || s.name || `sec-${idx}`), { idx, sec: s }));

  let mergedCount = 0;
  for (const [alias, canonical] of Object.entries(aliasMap)){
    const aliasKey = normalizeKey(alias);
    const canonKey = normalizeKey(canonical);
    const aliasEntry = bySlug.get(aliasKey);
    const canonEntry = bySlug.get(canonKey);
    if (!aliasEntry) continue; // nothing to merge
    if (!canonEntry){
      // If canonical section missing, just rename alias section to canonical
      const s = aliasEntry.sec;
      s.slug = canonical;
      s.name = s.name || canonical;
      bySlug.delete(aliasKey);
      bySlug.set(canonKey, { idx: aliasEntry.idx, sec: s });
      mergedCount++;
      continue;
    }
    // Merge tools by name into canonical
    const aliasTools = Array.isArray(aliasEntry.sec.tools) ? aliasEntry.sec.tools : [];
    const canonTools = Array.isArray(canonEntry.sec.tools) ? canonEntry.sec.tools : [];
    const canonNames = new Set(canonTools.map(t => normalizeKey(t?.name)));
    for (const t of aliasTools){
      const k = normalizeKey(t?.name);
      if (!k) continue;
      if (!canonNames.has(k)) { canonTools.push(t); canonNames.add(k); }
    }
    canonEntry.sec.tools = canonTools;
    // Remove alias section from list
    sections.splice(aliasEntry.idx, 1);
    // Rebuild index map after splice
    bySlug.clear();
    sections.forEach((s, idx) => bySlug.set(normalizeKey(s.slug || s.name || `sec-${idx}`), { idx, sec: s }));
    mergedCount++;
  }

  if (mergedCount){
    await fs.writeFile(TOOLS_JSON, JSON.stringify(sections, null, 2));
    console.log(`Merged ${mergedCount} duplicate section(s) using slug aliases.`);
  } else {
    console.log('No duplicate sections found to merge.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
