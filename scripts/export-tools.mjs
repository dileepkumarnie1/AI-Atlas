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

function normalizeKey(s) { return String(s || '').trim().toLowerCase(); }
function titleCaseFromSlug(slug){ return String(slug||'').split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' '); }
function getHostname(u){ try { return new URL(String(u||'')).hostname.replace(/^www\./,'').toLowerCase(); } catch { return ''; } }

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

  const out = {
    name,
    description: data.description || data.about || '',
    link,
    tags: Array.isArray(data.tags) ? data.tags : [],
  };
  if (data.iconUrl) out.iconUrl = data.iconUrl;
  if (data.about) out.about = data.about;
  if (Array.isArray(data.pros) && data.pros.length) out.pros = data.pros;
  if (Array.isArray(data.cons) && data.cons.length) out.cons = data.cons;
  return out;
}

async function main(){
  // Read existing tools.json to preserve domain metadata and order
  const existing = await readJsonSafe(DEFAULT_OUT);
  const skeletonSections = Array.isArray(existing) ? existing.map(sec => ({
    name: sec.name,
    slug: sec.slug,
    description: sec.description || '',
    icon: sec.icon || '',
  })) : [];
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
  for (const doc of snap.docs){
    const d = doc.data();
    const slug = normalizeKey(d.domainSlug || 'uncategorized');
    const tool = mapToolDocToJson(d);
    if (!tool) continue; // filtered/invalid
    if (!groups.has(slug)) groups.set(slug, { tools: [], name: d.domainName });
    const arr = groups.get(slug).tools;
    const k = normalizeKey(tool.name);
    if (!arr.some(t => normalizeKey(t.name) === k)) arr.push(tool);
  }

  const totalTools = Array.from(groups.values()).reduce((acc, g) => acc + g.tools.length, 0);
  if (totalTools === 0) {
    console.log('After filtering/grouping, no tools to write. Skipping write (exit 0).');
    process.exit(0);
  }

  // Build output sections: preserve known domains (order), append unknown
  const outSections = [];
  for (const key of skeletonOrder){
    const sec = skeletonBySlug.get(key);
    const grp = groups.get(key);
    outSections.push({
      name: sec?.name || titleCaseFromSlug(key),
      slug: sec?.slug || key,
      description: sec?.description || '',
      icon: sec?.icon || '',
      tools: grp?.tools || [],
    });
  }

  // Append new domains present in Firestore but not in skeleton
  for (const [slug, grp] of groups.entries()){
    const key = normalizeKey(slug);
    if (skeletonBySlug.has(key)) continue;
    outSections.push({
      name: titleCaseFromSlug(slug),
      slug,
      description: 'Generated from Firestore export',
      icon: '',
      tools: grp.tools,
    });
  }

  // Optional: stable sort tools by name within each section
  for (const sec of outSections){
    if (Array.isArray(sec.tools)){
      sec.tools.sort((a,b)=> a.name.localeCompare(b.name));
    }
  }

  await writeJson(OUT_PATH, outSections);
  console.log(`Wrote ${outSections.length} sections and ${totalTools} tools to ${path.relative(root, OUT_PATH)}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
