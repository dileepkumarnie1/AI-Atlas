#!/usr/bin/env node
/**
 * Export Firestore tools (status=active) into public/tools.json
 * Groups by domainSlug and preserves domain metadata (name, slug, icon, description)
 * from the existing public/tools.json when present.
 *
 * Usage (Windows PowerShell):
 *   # Set service account or pass --key
 *   $Env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\path\\to\\service-account.json"
 *   npm run export:tools
 *
 *   # Or explicitly:
 *   node scripts/export-tools.mjs --key C:\\path\\to\\service-account.json
 *
 * Options:
 *   --key <path>         Path to Firebase service account JSON
 *   --out <path>         Output JSON path (default: public/tools.json)
 *   --allow-empty        Allow writing when Firestore yields 0 tools (default: abort)
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0) {
    const v = args[i + 1];
    if (v && !v.startsWith('--')) return v;
  }
  return null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const root = path.resolve(process.cwd());
const PUBLIC_DIR = path.join(root, 'public');
const DEFAULT_OUT = path.join(PUBLIC_DIR, 'tools.json');
const OUT_PATH = getArg('out') ? path.resolve(getArg('out')) : DEFAULT_OUT;
const ICONS_DIR = path.join(PUBLIC_DIR, 'icons');
const ICON_MANIFEST = path.join(ICONS_DIR, 'manifest.json');
const PRICING_OVERRIDES_PATH = path.join(root, 'data', 'pricing-overrides.json');
const SLUG_ALIASES_PATH = path.join(root, 'data', 'domain-slug-aliases.json');

function normalizeKey(s) { return String(s || '').trim().toLowerCase(); }
function titleCaseFromSlug(slug){ return String(slug||'').split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' '); }
function getHostname(u){ try { return new URL(String(u||'')).hostname.replace(/^www\./,'').toLowerCase(); } catch { return ''; } }
// Convert arbitrary labels to canonical slug (lowercase, hyphens for spaces/punctuation)
function toSlug(s){
  return String(s||'')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const GITHUB_HOST = 'github.com';
const ALLOWLIST_GITHUB_NAMES = new Set(['github copilot']);

async function readJsonSafe(p){ try { const s = await fs.readFile(p, 'utf8'); return JSON.parse(s); } catch { return null; } }
async function writeJson(p, obj){ await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(obj, null, 2)); }

// Firebase Admin init
const KEY_PATH = getArg('key') || process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
if (!KEY_PATH || !fssync.existsSync(KEY_PATH)) {
  console.error('ERROR: Service account key not found. Provide --key <path> or set GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}
let sa;
try { sa = JSON.parse(fssync.readFileSync(KEY_PATH, 'utf8')); }
catch { console.error('ERROR: Failed to parse service account JSON at', KEY_PATH); process.exit(1); }
initializeApp({ credential: cert(sa) });
const db = getFirestore();
console.log(`Using Firebase project: ${sa.project_id || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'unknown'}`);

function mapToolDocToJson(doc){
  const data = doc || {};
  const name = String(data.name || '').trim();
  const link = String(data.link || '').trim();
  if (!name || !link) return null; // invalid

  // Enforce GitHub-hosted exclusion policy, with allowlist
  const host = getHostname(link);
  const nameNorm = normalizeKey(name);
  if (host === GITHUB_HOST && !ALLOWLIST_GITHUB_NAMES.has(nameNorm)) return null;

  // Canonicalize pricing tags for robust UI grouping
        function canonicalizeTags(tags) {
          const inArr = Array.isArray(tags) ? tags : [];
          const outSet = new Set();
          const extras = new Set();
          for (const t of inArr) {
            if (!t) continue;
            const raw = String(t).trim();
            const v = raw.toLowerCase();
            // Preserve original tag
            outSet.add(raw);
            // Pricing/category canonicalization
            if (/^oss$|open[\s-]?source/.test(v)) extras.add('Open Source');
            else if (/^freemium$/.test(v)) extras.add('Freemium');
            else if (/^free$/.test(v)) extras.add('Free');
            else if (/paid|subscription|subscribe|premium|enterprise/.test(v)) extras.add('Subscription');
          }
          // Ensure at least one pricing tag exists so the tool shows in a group
          const hasPricing = ['Open Source','Free','Freemium','Subscription'].some(x => outSet.has(x) || extras.has(x));
          if (!hasPricing) {
            // Heuristic: if the tool name or description hints at being open-source, mark it; else default to Freemium
            const txt = `${data.name||''} ${data.description||data.about||''}`.toLowerCase();
            if (/open[\s-]?source|^oss$/.test(txt)) extras.add('Open Source');
            else extras.add('Freemium');
          }
          // Merge extras
          for (const x of extras) outSet.add(x);
          return Array.from(outSet);
  }

  const out = {
    name,
    description: data.description || data.about || '',
    link,
    tags: canonicalizeTags(data.tags),
    // Always include schema fields for consistency
    about: data.about || '',
    pros: Array.isArray(data.pros) ? data.pros : [],
    cons: Array.isArray(data.cons) ? data.cons : [],
  };
  if (data.iconUrl) out.iconUrl = data.iconUrl;
  return out;
}

// Lightweight HTML metadata extraction without external deps
function extractMeta(html){
  const out = {};
  const get = (re) => {
    const m = html.match(re);
    return m && m[1] ? m[1].trim() : '';
  };
  out.title = get(/<title[^>]*>([^<]*)<\/title>/i);
  // Prefer og:description, then twitter:description, then meta description
  out.ogDescription = get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
                      get(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
                      get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  // Icon candidates
  const icons = [];
  const linkRe = /<link[^>]+rel=["']([^"']+)["'][^>]+href=["']([^"']+)["'][^>]*>/ig;
  let lm;
  while ((lm = linkRe.exec(html))){
    const rel = lm[1].toLowerCase();
    const href = lm[2];
    if (/(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/.test(rel)) icons.push(href);
  }
  out.icons = icons;
  // og:image as a fallback logo (may be large)
  const ogImg = get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (ogImg) out.ogImage = ogImg;
  return out;
}

async function enrichFromLink(link){
  // best-effort: short timeout
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(link, { signal: controller.signal, headers: { 'user-agent': 'ai-atlas-exporter/1.0 (+github actions)' } });
    const url = new URL(link);
    const origin = url.origin;
    const text = await res.text();
    const meta = extractMeta(text || '');
    // Description
    const description = meta.ogDescription || meta.title || '';
    // Icon resolution
    let iconUrl = '';
    const pick = meta.icons && meta.icons.find(h => /apple-touch-icon|icon/.test(h)) || meta.icons && meta.icons[0] || '';
    if (pick) {
      try { iconUrl = new URL(pick, origin).toString(); } catch { /* ignore */ }
    }
    if (!iconUrl) {
      // fallback to favicon.ico
      iconUrl = `${origin}/favicon.ico`;
    }
    return { description, about: description, iconUrl };
  } catch {
    // Network error or timeout; fallback to favicon
    try {
      const origin = new URL(link).origin;
      return { description: '', about: '', iconUrl: `${origin}/favicon.ico` };
    } catch { return { description: '', about: '', iconUrl: '' }; }
  } finally {
    clearTimeout(to);
  }
}

async function main(){
  // Load icon manifest if present
  let iconManifest = null;
  try {
    const raw = await fs.readFile(ICON_MANIFEST, 'utf8');
    iconManifest = JSON.parse(raw);
  } catch {}
  // Load pricing overrides if present
  let pricingOverrides = null;
  try {
    const raw = await fs.readFile(PRICING_OVERRIDES_PATH, 'utf8');
    pricingOverrides = JSON.parse(raw);
  } catch {}
  // Load slug alias map if present
  let slugAliases = null;
  try {
    const raw = await fs.readFile(SLUG_ALIASES_PATH, 'utf8');
    const obj = JSON.parse(raw);
    slugAliases = obj && (obj.aliases || obj);
  } catch {}
  // Read existing tools.json to preserve domain metadata, order, and current tools
  const existing = await readJsonSafe(DEFAULT_OUT);
  const existingSections = Array.isArray(existing) ? existing : [];
  if (!existingSections.length && !hasFlag('force-new')){
    console.log('Safety: existing public/tools.json not found or empty. Skipping write. Use --force-new to create a new catalog.');
    process.exit(0);
  }
  const existingTotal = existingSections.reduce((sum, s) => sum + (Array.isArray(s.tools) ? s.tools.length : 0), 0);
  const skeletonSections = existingSections.map(sec => ({
    name: sec.name,
    slug: sec.slug,
    description: sec.description || '',
    icon: sec.icon || '',
  }));
  const skeletonOrder = skeletonSections.map(s => normalizeKey(s.slug || s.name));
  const skeletonBySlug = new Map(skeletonSections.map(s => [normalizeKey(s.slug || s.name), s]));

  // Fetch Firestore tools
  const snap = await db.collection('tools').where('status', '==', 'active').get();
  console.log(`Fetched ${snap.size} active tools from Firestore.`);
  if (snap.size === 0) {
    console.log('No active tools found in Firestore. Skipping write (exit 0).');
    process.exit(0);
  }

  // Group by domainSlug
  const groups = new Map(); // slug -> { tools: [] }
  // Track added-tools later to optionally enrich only new insertions
  const candidatesToEnrich = new Set(); // key: `${slug}::${nameLower}`
  for (const doc of snap.docs){
    const d = doc.data();
  const rawSlug = d.domainSlug || d.domainName || 'uncategorized';
  let slug = toSlug(rawSlug);
  // Apply alias mapping to normalize to canonical site slugs
  const aliased = slugAliases && slugAliases[slug];
  if (aliased && typeof aliased === 'string') slug = toSlug(aliased);
    const tool = mapToolDocToJson(d);
    if (!tool) continue; // filtered/invalid
    if (!groups.has(slug)) groups.set(slug, { tools: [], name: d.domainName });
    const arr = groups.get(slug).tools;
    const k = normalizeKey(tool.name);
    if (!arr.some(t => normalizeKey(t.name) === k)) {
      arr.push(tool);
      candidatesToEnrich.add(`${slug}::${k}`);
    }
  }

  const totalTools = Array.from(groups.values()).reduce((acc, g) => acc + g.tools.length, 0);
  if (totalTools === 0) {
    console.log('After filtering/grouping, no tools to write. Skipping write (exit 0).');
    process.exit(0);
  }

  // Build output by merging Firestore tools into existing sections (append-only)
  const outSections = [];
  let additions = 0;
  for (const secOrig of existingSections){
    const key = normalizeKey(secOrig.slug || secOrig.name);
    const grp = groups.get(key);
    // Start with existing tools list
    const mergedTools = Array.isArray(secOrig.tools) ? [...secOrig.tools] : [];
    if (grp && Array.isArray(grp.tools)){
      const existingNames = new Set(mergedTools.map(t => normalizeKey(t?.name)));
      for (const t of grp.tools){
        const k = normalizeKey(t.name);
        if (!existingNames.has(k)){
          // Ensure schema fields always present
          if (!Array.isArray(t.tags)) t.tags = [];
          if (!('about' in t)) t.about = t.description || '';
          if (!Array.isArray(t.pros)) t.pros = [];
          if (!Array.isArray(t.cons)) t.cons = [];
          // Prefer cached icon when available
          if (iconManifest) {
            const manKey = `${key}::${k}`;
            const localPath = iconManifest[manKey];
            if (localPath) t.iconUrl = localPath.replace(/^public\//, '');
          }
          // Apply pricing overrides if present
          if (pricingOverrides && (pricingOverrides[`${key}::${k}`] != null)) {
            const ov = pricingOverrides[`${key}::${k}`];
            const labels = Array.isArray(ov) ? ov : [ov];
            const pricingPattern = /(^oss$)|open[\s-]?source|freemium|free|paid|subscription|subscribe|premium|enterprise/i;
            const nonPricing = (Array.isArray(t.tags) ? t.tags : []).filter(x => !pricingPattern.test(String(x)));
            const merged = Array.from(new Set([...nonPricing, ...labels]));
            t.tags = merged;
          }
          mergedTools.push(t);
          existingNames.add(k);
          additions++;
        }
      }
    }
    // Apply icon manifest and pricing overrides to ALL tools in the section (existing + newly added)
    if (Array.isArray(mergedTools) && mergedTools.length) {
      const CANON = new Set(['Open Source','Free','Freemium','Subscription']);
      for (const t of mergedTools){
        try {
          const toolKey = `${key}::${normalizeKey(t?.name)}`;
          // Prefer cached icon when available
          if (iconManifest && iconManifest[toolKey]) {
            const localPath = iconManifest[toolKey];
            if (localPath) t.iconUrl = String(localPath).replace(/^public\//, '');
          }
          // Apply pricing overrides
          if (pricingOverrides && (pricingOverrides[toolKey] != null)){
            const ov = pricingOverrides[toolKey];
            const labels = Array.isArray(ov) ? ov : [ov];
            const nonPricing = (Array.isArray(t.tags) ? t.tags : []).filter(x => !CANON.has(String(x)));
            t.tags = Array.from(new Set([...nonPricing, ...labels]));
          }
        } catch {}
      }
    }

    outSections.push({
      name: secOrig.name,
      slug: secOrig.slug,
      description: secOrig.description || '',
      icon: secOrig.icon || '',
      tools: mergedTools,
    });
  }

  // Append new domains present in Firestore but not in existing file
  for (const [slug, grp] of groups.entries()){
    const key = normalizeKey(slug);
    if (skeletonBySlug.has(key)) continue;
    // Apply icon manifest to new sections' tools too
    const toolsWithIcons = Array.isArray(grp.tools) ? grp.tools.map(t => {
      const k = normalizeKey(t.name);
      if (iconManifest) {
        const manKey = `${key}::${k}`;
        const localPath = iconManifest[manKey];
        if (localPath) t.iconUrl = localPath.replace(/^public\//, '');
      }
      if (pricingOverrides && (pricingOverrides[`${key}::${k}`] != null)){
        const ov = pricingOverrides[`${key}::${k}`];
        const labels = Array.isArray(ov) ? ov : [ov];
        const CANON = new Set(['Open Source','Free','Freemium','Subscription']);
        const nonPricing = (Array.isArray(t.tags) ? t.tags : []).filter(x => !CANON.has(String(x)));
        const merged = Array.from(new Set([...nonPricing, ...labels]));
        t.tags = merged;
      }
      return t;
    }) : grp.tools;
    outSections.push({
      name: titleCaseFromSlug(slug),
      slug,
      description: 'Generated from Firestore export',
      icon: '',
      tools: toolsWithIcons,
    });
    additions += Array.isArray(grp.tools) ? grp.tools.length : 0;
  }

  // Opportunistic enrichment for tools that were just added
  // Build quick lookup for outSections tools by slug+name
  async function enrichNewlyAdded(){
    // Only run if explicitly enabled; enrichment has moved to approval time
    if (process.env.EXPORTER_ENRICH !== '1') return;
    const tasks = [];
    for (const sec of outSections){
      const secKey = normalizeKey(sec.slug || sec.name);
      if (!Array.isArray(sec.tools)) continue;
      for (const t of sec.tools){
        const key = `${secKey}::${normalizeKey(t.name)}`;
        if (!candidatesToEnrich.has(key)) continue; // only enrich newly added
        const needsDesc = !t.description || t.description.trim().length < 10;
        const needsIcon = !t.iconUrl;
        const needsAbout = !t.about;
        if (!(needsDesc || needsIcon || needsAbout)) continue;
        tasks.push((async () => {
          const info = await enrichFromLink(t.link);
          if (needsDesc && info.description) t.description = info.description;
          if (needsAbout && info.about) t.about = info.about;
          if (needsIcon && info.iconUrl) t.iconUrl = info.iconUrl;
          // Ensure arrays remain present
          if (!Array.isArray(t.tags)) t.tags = [];
          if (!Array.isArray(t.pros)) t.pros = [];
          if (!Array.isArray(t.cons)) t.cons = [];
        })());
      }
    }
    // Run in parallel with a cap (simple chunking)
    const chunk = 6;
    for (let i = 0; i < tasks.length; i += chunk){
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(tasks.slice(i, i + chunk));
    }
  }

  await enrichNewlyAdded();

  // Optional: stable sort tools by name within each section
  for (const sec of outSections){
    if (Array.isArray(sec.tools)){
      sec.tools.sort((a,b)=> a.name.localeCompare(b.name));
    }
  }
  const newTotal = outSections.reduce((sum, s) => sum + (Array.isArray(s.tools) ? s.tools.length : 0), 0);
  if (newTotal < existingTotal && !hasFlag('allow-shrink')){
    console.log(`Safety: new catalog would shrink from ${existingTotal} to ${newTotal}. Skipping write. Use --allow-shrink to override.`);
    process.exit(0);
  }
  if (additions === 0){
    console.log('No additions detected from Firestore. Skipping write.');
    process.exit(0);
  }
  await writeJson(OUT_PATH, outSections);
  console.log(`Wrote ${outSections.length} sections; total tools ${newTotal} (was ${existingTotal}); additions ${additions} -> ${path.relative(root, OUT_PATH)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
