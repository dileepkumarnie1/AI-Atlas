#!/usr/bin/env node
/**
 * Generate pricing overrides from audit anomalies.
 *
 * Reads:
 *  - data/pricing-audit.json (produced by scripts/audit-pricing.mjs)
 *  - public/tools.json (catalog)
 *  - data/pricing-overrides.json (existing overrides, optional)
 * Writes/updates:
 *  - data/pricing-overrides.json with suggested canonical pricing labels
 */
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const AUDIT_JSON = path.join(root, 'data', 'pricing-audit.json');
const TOOLS_JSON = path.join(root, 'public', 'tools.json');
const OVERRIDES_JSON = path.join(root, 'data', 'pricing-overrides.json');

function norm(s){ return String(s||'').trim().toLowerCase(); }
function keyFor(sec, name){ return `${norm(sec)}::${norm(name)}`; }

const CANON = new Set(['Open Source','Free','Freemium','Subscription']);
const PRIORITY = new Map([['Open Source',1],['Free',2],['Freemium',3],['Subscription',4]]);

function canonicalizeFromTool(tool){
  const out = new Set();
  const tags = Array.isArray(tool?.tags) ? tool.tags : [];
  for (const raw of tags){
    const v = norm(raw);
    if (/^oss$|open[\s-]?source/.test(v)) out.add('Open Source');
    else if (/^free$/.test(v)) out.add('Free');
    else if (/^freemium$/.test(v)) out.add('Freemium');
    else if (/paid|subscription|subscribe|premium|enterprise/.test(v)) out.add('Subscription');
  }
  if (out.size === 0){
    const txt = `${tool?.name||''} ${tool?.description||tool?.about||''}`.toLowerCase();
    if (/open[\s-]?source|^oss$/.test(txt)) out.add('Open Source');
    else out.add('Freemium');
  }
  return Array.from(out);
}

function choosePrimary(labels){
  const arr = Array.from(new Set(labels)).filter(l => CANON.has(l));
  if (!arr.length) return 'Freemium';
  return arr.sort((a,b)=> (PRIORITY.get(a)||9)-(PRIORITY.get(b)||9))[0];
}

async function readJsonSafe(p){ try { const s = await fs.readFile(p, 'utf8'); return JSON.parse(s); } catch { return null; } }
async function writeJson(p, obj){ await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(obj, null, 2)); }

async function main(){
  const audit = await readJsonSafe(AUDIT_JSON);
  if (!audit || !Array.isArray(audit.anomalies)){
    console.log('No anomalies file found or anomalies array missing; nothing to do.');
    process.exit(0);
  }
  if (audit.anomalies.length === 0){
    console.log('No anomalies to fix; exiting.');
    process.exit(0);
  }
  const sections = await readJsonSafe(TOOLS_JSON) || [];
  const toolIndex = new Map();
  for (const sec of sections){
    const secKey = norm(sec.slug || sec.name || '');
    for (const t of (Array.isArray(sec.tools) ? sec.tools : [])){
      toolIndex.set(keyFor(secKey, t.name), t);
    }
  }
  const overrides = await readJsonSafe(OVERRIDES_JSON) || {};
  let updated = 0;
  for (const a of audit.anomalies){
    const secKey = norm(a.section || '');
    const toolKey = keyFor(secKey, a.tool);
    const tool = toolIndex.get(toolKey);
    let chosen = '';
    const labels = Array.isArray(a.labels) ? a.labels : [];
    const hasCanon = labels.some(l => CANON.has(l));
    const conflict = labels.includes('Open Source') && (labels.includes('Subscription') || labels.includes('Paid/Subscription') || labels.includes('Paid'));
    if (conflict){
      // Prefer Open Source over Subscription when conflicting
      chosen = 'Open Source';
    } else if (hasCanon){
      chosen = choosePrimary(labels);
    } else if (tool){
      const derived = canonicalizeFromTool(tool);
      chosen = choosePrimary(derived);
    } else {
      chosen = 'Freemium';
    }
    if (!overrides[toolKey] || overrides[toolKey] !== chosen){
      overrides[toolKey] = chosen;
      updated++;
      console.log(`Suggest override: ${toolKey} -> ${chosen}`);
    }
  }
  if (updated > 0){
    await writeJson(OVERRIDES_JSON, overrides);
    console.log(`Wrote ${updated} override${updated===1?'':'s'} to ${path.relative(root, OVERRIDES_JSON)}`);
  } else {
    console.log('No override changes needed.');
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
