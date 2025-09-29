#!/usr/bin/env node
/**
 * Clean and normalize public/tools.json
 * - Remove repo-hosted links (github/gitlab/bitbucket/codeberg/sourceforge/pypi/npm/crates/readthedocs)
 * - Keep an allowlist (e.g., GitHub Copilot)
 * - Canonicalize pricing tags: ensure one of [Open Source, Free, Freemium, Subscription]
 * - Ensure schema fields: description/about/tags/pros/cons/iconUrl
 * - De-duplicate within sections by normalized name
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const toolsPath = path.join(root, 'public', 'tools.json');

function normalizeKey(s){ return String(s||'').trim().toLowerCase(); }
function getHostname(u){ try { return new URL(String(u||'')).hostname.replace(/^www\./,'').toLowerCase(); } catch { return ''; } }

const ALLOW_TOOL_NAMES = new Set([
  'github copilot'
]);
const REPO_HOSTS = new Set([
  'github.com','gitlab.com','bitbucket.org','codeberg.org','sourceforge.net',
  'pypi.org','npmjs.com','crates.io','readthedocs.io','readthedocs.org'
]);

function isRepoHost(host){
  if (!host) return false;
  if (REPO_HOSTS.has(host)) return true;
  // Catch subdomains like docs.github.com
  for(const h of REPO_HOSTS){ if (host.endsWith('.'+h)) return true; }
  return false;
}

function canonicalizeTags(data, tags){
  const inArr = Array.isArray(tags) ? tags : [];
  const outSet = new Set();
  const extras = new Set();
  for (const t of inArr){
    if (!t) continue;
    const raw = String(t).trim();
    const v = raw.toLowerCase();
    outSet.add(raw);
    if (/^oss$|open[\s-]?source/.test(v)) extras.add('Open Source');
    else if (/^freemium$/.test(v)) extras.add('Freemium');
    else if (/^free$/.test(v)) extras.add('Free');
    else if (/paid|subscription|subscribe|premium|enterprise/.test(v)) extras.add('Subscription');
  }
  const hasPricing = ['Open Source','Free','Freemium','Subscription'].some(x => outSet.has(x) || extras.has(x));
  if (!hasPricing){
    const txt = `${data?.name||''} ${data?.description||data?.about||''}`.toLowerCase();
    if (/open[\s-]?source|^oss$/.test(txt)) extras.add('Open Source');
    else extras.add('Freemium');
  }
  for (const x of extras) outSet.add(x);
  // Cap tag count to a sensible size
  return Array.from(outSet).slice(0, 12);
}

function ensureSchema(sec, tool){
  const t = { ...tool };
  t.name = String(t.name||'').trim();
  t.link = String(t.link||'').trim();
  t.description = String(t.description||t.about||'').trim();
  t.about = String(t.about||t.description||'').trim();
  t.tags = canonicalizeTags(t, t.tags);
  if (!Array.isArray(t.pros)) t.pros = [];
  if (!Array.isArray(t.cons)) t.cons = [];
  if (!t.iconUrl){
    const host = getHostname(t.link);
    if (host) t.iconUrl = `https://${host}/favicon.ico`;
  }
  return t;
}

async function main(){
  const raw = await fs.readFile(toolsPath, 'utf8');
  const sections = JSON.parse(raw);
  const out = [];
  let removed = 0, deduped = 0, updated = 0;
  for (const sec of sections){
    const seen = new Set();
    const tools = [];
    for (const tool of (sec.tools||[])){
      const nameKey = normalizeKey(tool?.name);
      if (!nameKey) { removed++; continue; }
      const allowByName = ALLOW_TOOL_NAMES.has(nameKey);
      const host = getHostname(tool?.link);
      if (!allowByName && isRepoHost(host)) { removed++; continue; }
      if (seen.has(nameKey)) { deduped++; continue; }
      const t2 = ensureSchema(sec, tool);
      tools.push(t2); seen.add(nameKey); updated++;
    }
    out.push({ name: sec.name, slug: sec.slug, description: sec.description||'', icon: sec.icon||'', tools });
  }
  await fs.writeFile(toolsPath, JSON.stringify(out, null, 2));
  console.log(`Cleaned tools.json -> removed=${removed}, deduped=${deduped}, updated=${updated}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
