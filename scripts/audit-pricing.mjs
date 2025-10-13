#!/usr/bin/env node
/**
 * Audit pricing grouping for tools and suggest corrections.
 *
 * Reads public/tools.json and groups tools into pricing buckets based on
 * canonical tags [Open Source, Free, Freemium, Subscription]. Applies
 * optional overrides from data/pricing-overrides.json. Generates:
 * - data/pricing-audit.json: structured results per section and tool
 * - data/pricing-audit.md: human-readable summary with counts and anomalies
 */
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const TOOLS = path.join(root, 'public', 'tools.json');
const OVERRIDES = path.join(root, 'data', 'pricing-overrides.json');
const OUT_JSON = path.join(root, 'data', 'pricing-audit.json');
const OUT_MD = path.join(root, 'data', 'pricing-audit.md');

function arr(a){ return Array.isArray(a) ? a : []; }
function norm(s){ return String(s||'').trim().toLowerCase(); }
function keyFor(sec, name){ return `${norm(sec)}::${norm(name)}`; }

const CANON = ['Open Source','Free','Freemium','Subscription'];

function canonicalize(tags, name, desc){
  const out = new Set();
  for (const raw of arr(tags)){
    const v = norm(raw);
    if (/^oss$|open[\s-]?source/.test(v)) out.add('Open Source');
    else if (/^free$/.test(v)) out.add('Free');
    else if (/^freemium$/.test(v)) out.add('Freemium');
    else if (/paid|subscription|subscribe|premium|enterprise/.test(v)) out.add('Subscription');
  }
  // Heuristics when empty
  if (out.size === 0){
    const txt = `${name} ${desc}`.toLowerCase();
    if (/open[\s-]?source|^oss$/.test(txt)) out.add('Open Source');
    else out.add('Freemium');
  }
  return Array.from(out);
}

async function main(){
  const sections = JSON.parse(await fs.readFile(TOOLS, 'utf8'));
  const overrides = fssync.existsSync(OVERRIDES) ? JSON.parse(await fs.readFile(OVERRIDES, 'utf8')) : {};
  const results = [];
  const counts = { 'Open Source':0, 'Free':0, 'Freemium':0, 'Subscription':0 };
  const anomalies = [];
  for (const sec of sections){
    const secName = sec.slug || sec.name || 'unknown';
    for (const t of arr(sec.tools)){
      const base = canonicalize(t.tags, t.name, t.description || t.about || '');
      const k = keyFor(secName, t.name);
      let applied = null;
      if (overrides && overrides[k] != null){
        applied = Array.isArray(overrides[k]) ? overrides[k] : [overrides[k]];
      }
      const labels = applied && applied.length ? applied : base;
      // Count primary label for distribution; prefer Open Source > Free > Freemium > Subscription
      const priority = new Map([['Open Source',1],['Free',2],['Freemium',3],['Subscription',4]]);
      const primary = [...labels].sort((a,b)=> (priority.get(a)||9)-(priority.get(b)||9))[0] || 'Freemium';
      counts[primary] = (counts[primary]||0)+1;
      // anomaly: has both Open Source and Subscription, or none canonical
      const hasCanon = labels.some(l => CANON.includes(l));
      const conflict = labels.includes('Open Source') && labels.includes('Subscription');
      if (!hasCanon || conflict){ anomalies.push({ section: secName, tool: t.name, labels, reason: conflict ? 'open-source+subscription conflict' : 'no canonical labels' }); }
      results.push({ section: secName, tool: t.name, link: t.link, labels, primary });
    }
  }
  await fs.writeFile(OUT_JSON, JSON.stringify({ counts, anomalies, items: results }, null, 2));
  const lines = [];
  lines.push('# Pricing Audit');
  lines.push('');
  lines.push('## Distribution');
  for (const k of CANON){ lines.push(`- ${k}: ${counts[k]||0}`); }
  lines.push('');
  lines.push('## Anomalies');
  if (anomalies.length === 0) lines.push('- None');
  else anomalies.slice(0, 200).forEach(a => lines.push(`- [${a.section}] ${a.tool} — ${a.reason} (${a.labels.join(', ')})`));
  if (anomalies.length > 200) lines.push(`...and ${anomalies.length-200} more`);
  lines.push('');
  lines.push('## Notes');
  lines.push('- Canonical groups follow common OSS/pricing labels used on software directories.');
  lines.push('- Overrides can enforce known pricing changes or exceptions.');
  await fs.writeFile(OUT_MD, lines.join('\n'));
  console.log(`Wrote ${path.relative(root, OUT_JSON)} and ${path.relative(root, OUT_MD)}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
