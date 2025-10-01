#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

function normalizeName(s){
  return String(s||'').trim().toLowerCase();
}

function slugifyName(s){
  return String(s||'')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function readJson(fp){
  const raw = await fs.readFile(fp, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(fp, data){
  await fs.writeFile(fp, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function buildSectionIndex(sections){
  const byName = new Map();
  const bySlug = new Map();
  for(const sec of sections){
    const nameKey = normalizeName(sec.name);
    const slugKey = normalizeName(sec.slug || slugifyName(sec.name));
    byName.set(nameKey, sec);
    bySlug.set(slugKey, sec);
  }
  return { byName, bySlug };
}

function mapDomainToSection(domain, index){
  const domainKey = normalizeName(domain);
  // Direct name match
  if(index.byName.has(domainKey)) return index.byName.get(domainKey);
  // Known alias mapping
  const aliases = new Map([
    ['ai safety & ethics', 'ethical ai'],
    ['ai safety and ethics', 'ethical ai'],
  ]);
  if(aliases.has(domainKey)){
    const aliased = normalizeName(aliases.get(domainKey));
    if(index.byName.has(aliased)) return index.byName.get(aliased);
  }
  // Try slug match
  const slugKey = normalizeName(slugifyName(domain));
  if(index.bySlug.has(slugKey)) return index.bySlug.get(slugKey);
  return null;
}

function toolExists(section, name){
  const key = normalizeName(name);
  const arr = Array.isArray(section.tools) ? section.tools : [];
  return arr.some(t => normalizeName(t.name) === key);
}

function pickFields(item){
  const out = {
    name: item.name,
    description: item.description || item.about || '',
    link: item.link || '',
    tags: Array.isArray(item.tags) ? item.tags : (item.tags ? [String(item.tags)] : []),
    about: item.about || item.description || '',
    pros: Array.isArray(item.pros) ? item.pros : [],
    cons: Array.isArray(item.cons) ? item.cons : [],
  };
  if(item.iconUrl) out.iconUrl = item.iconUrl;
  return out;
}

async function main(){
  const root = process.cwd();
  const pendingPath = path.join(root, 'data', 'pending-tools.json');
  const toolsPath = path.join(root, 'public', 'tools.json');

  const pending = await readJson(pendingPath);
  const sections = await readJson(toolsPath);
  if(!pending || !Array.isArray(pending.items)){
    console.log('No pending.items found. Nothing to do.');
    return;
  }
  if(!Array.isArray(sections) || sections.length === 0){
    console.error('public/tools.json has no sections. Aborting.');
    process.exit(1);
  }

  const index = buildSectionIndex(sections);
  let added = 0, skipped = 0, missingSections = 0;

  for(const item of pending.items){
    const domain = item.domain || item.category || '';
    if(!domain){ skipped++; continue; }
    const sec = mapDomainToSection(domain, index);
    if(!sec){
      missingSections++;
      continue;
    }
    sec.tools = Array.isArray(sec.tools) ? sec.tools : [];
    if(toolExists(sec, item.name)){
      skipped++;
      continue;
    }
    const tool = pickFields(item);
    if(!tool.name || !tool.link){ skipped++; continue; }
    // Ensure schema keys present
    if(!Array.isArray(tool.tags)) tool.tags = [];
    if(!Array.isArray(tool.pros)) tool.pros = [];
    if(!Array.isArray(tool.cons)) tool.cons = [];
    sec.tools.push(tool);
    added++;
  }

  if(added > 0){
    await writeJson(toolsPath, sections);
  }
  console.log(`Pending merge complete. Added: ${added}, Skipped: ${skipped}, Missing sections: ${missingSections}`);
}

main().catch(err => { console.error(err); process.exit(1); });
