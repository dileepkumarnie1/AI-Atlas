#!/usr/bin/env node
/**
 * Cache tool icons locally under public/icons/<section>/<tool-slug>.<ext>
 *
 * - Reads public/tools.json
 * - For each tool, picks the best icon candidate (tool.iconUrl if present, else <origin>/favicon.ico)
 * - Downloads with short timeout and saves deterministically
 * - Writes a simple manifest at public/icons/manifest.json
 *
 * This script is idempotent and safe to re-run. It will skip downloads when the
 * target file already exists (unless --force is provided).
 */
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const PUBLIC_DIR = path.join(root, 'public');
const TOOLS_JSON = path.join(PUBLIC_DIR, 'tools.json');
const ICONS_DIR = path.join(PUBLIC_DIR, 'icons');
const OVERRIDES_PATH = path.join(root, 'data', 'icon-overrides.json');
const MANIFEST_PATH = path.join(ICONS_DIR, 'manifest.json');

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const FORCE = hasFlag('force');

function toSlug(s){
  return String(s||'')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeKey(s){ return String(s||'').trim().toLowerCase(); }

function fileExists(p){ try { return fssync.existsSync(p); } catch { return false; } }

function pickExtensionFromContentType(ct){
  const v = String(ct||'').toLowerCase();
  if (v.includes('image/png')) return 'png';
  if (v.includes('image/svg')) return 'svg';
  if (v.includes('image/jpeg')) return 'jpg';
  if (v.includes('image/webp')) return 'webp';
  if (v.includes('image/x-icon') || v.includes('image/vnd.microsoft.icon')) return 'ico';
  // fallback
  return 'ico';
}

function guessExtFromUrl(u){
  try{
    const url = new URL(u);
    const p = url.pathname.toLowerCase();
    if (p.endsWith('.png')) return 'png';
    if (p.endsWith('.svg')) return 'svg';
    if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'jpg';
    if (p.endsWith('.webp')) return 'webp';
    if (p.endsWith('.ico')) return 'ico';
  }catch{}
  return '';
}

async function fetchWithTimeout(u, ms = 7000){
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), ms);
  try{
    const res = await fetch(u, { signal: controller.signal, headers: { 'user-agent': 'ai-atlas-icon-cacher/1.0' } });
    return res;
  } finally {
    clearTimeout(to);
  }
}

async function ensureDir(p){ await fs.mkdir(p, { recursive: true }); }

async function main(){
  // Load overrides if present
  let overrides = {};
  try { overrides = JSON.parse(await fs.readFile(OVERRIDES_PATH, 'utf8')); } catch {}
  let sections;
  try{
    const raw = await fs.readFile(TOOLS_JSON, 'utf8');
    sections = JSON.parse(raw);
  }catch{
    console.error('public/tools.json not found or invalid. Nothing to cache.');
    process.exit(0);
  }
  if (!Array.isArray(sections) || sections.length === 0){
    console.log('No sections found in tools.json. Nothing to cache.');
    return;
  }

  await ensureDir(ICONS_DIR);
  const manifest = fileExists(MANIFEST_PATH) ? JSON.parse(fssync.readFileSync(MANIFEST_PATH, 'utf8')) : {};
  let downloaded = 0, skipped = 0, failed = 0;

  for (const sec of sections){
    const secSlug = toSlug(sec.slug || sec.name || 'misc');
    const secDir = path.join(ICONS_DIR, secSlug);
    await ensureDir(secDir);
    const tools = Array.isArray(sec.tools) ? sec.tools : [];
    for (const t of tools){
      const toolSlug = toSlug(t?.name || '');
      if (!toolSlug) { skipped++; continue; }
      const key = `${secSlug}::${normalizeKey(t.name)}`;
      // Resolve override first
      let candidate = '';
      const ov = overrides[key] || overrides.examples?.[key];
      if (ov) {
        // Treat repo-relative path as already cached
        if (!/^https?:\/\//i.test(ov)){
          const rel = ov.replace(/^\/*public\//, 'public/');
          const abs = path.join(root, rel);
          if (fileExists(abs)){
            manifest[key] = rel.replace(/^public\//, 'public/');
            skipped++;
            continue;
          }
          // If override path doesn't exist, construct remote from site as fallback below
          candidate = '';
        } else {
          candidate = ov;
        }
      }
      if (!candidate){
        const remote = (t && t.iconUrl) ? String(t.iconUrl) : '';
        candidate = remote;
      }
      if (!candidate){
        // Fallback to site favicon
        try{ candidate = new URL(String(t.link)).origin + '/favicon.ico'; }
        catch{ candidate = ''; }
      }
      if (!candidate){ skipped++; continue; }

      // Determine destination file path
      const guessed = guessExtFromUrl(candidate);
      let ext = guessed || 'ico';
      let dest = path.join(secDir, `${toolSlug}.${ext}`);
      // If a file with any known extension already exists, reuse and record
      const existing = ['png','svg','jpg','webp','ico'].map(e => path.join(secDir, `${toolSlug}.${e}`)).find(fileExists);
      if (existing && !FORCE){
        const rel = `public/icons/${secSlug}/${path.basename(existing)}`;
        manifest[key] = rel;
        skipped++;
        continue;
      }

      try{
        const res = await fetchWithTimeout(candidate, 8000);
        if (!res.ok){ throw new Error(`HTTP ${res.status}`); }
        const buf = Buffer.from(await res.arrayBuffer());
        // Prefer content-type for extension
        const ct = res.headers.get('content-type') || '';
        const fromCT = pickExtensionFromContentType(ct);
        if (fromCT && fromCT !== ext){ ext = fromCT; dest = path.join(secDir, `${toolSlug}.${ext}`); }
        await fs.writeFile(dest, buf);
        const rel = `public/icons/${secSlug}/${path.basename(dest)}`;
        manifest[key] = rel;
        downloaded++;
      }catch(e){
        // As a last resort, write nothing but note failure
        failed++;
        // console.warn('icon download failed', t?.name, candidate, e.message);
      }
    }
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Icon cache complete. downloaded=${downloaded} skipped=${skipped} failed=${failed} -> ${path.relative(root, MANIFEST_PATH)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
