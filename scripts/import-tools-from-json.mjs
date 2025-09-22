#!/usr/bin/env node
/**
 * One-off backfill: import tools from public/tools.json into Firestore `tools`.
 * - Sets status: "active"
 * - domainSlug taken from each section.slug (lowercased)
 * - Skips GitHub-hosted links except allowlisted names (e.g., GitHub Copilot)
 * - Avoids duplicates by normalized tool name + domainSlug
 *
 * Usage (Windows PowerShell):
 *   $Env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\path\\to\\service-account.json"
 *   npm run import:tools
 *
 * Options:
 *   --key <path>        Service account JSON path (else uses GOOGLE_APPLICATION_CREDENTIALS)
 *   --dry-run           Do not write, only print what would be imported
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(`--${name}`); if(i>=0){ const v=args[i+1]; if(v && !v.startsWith('--')) return v;} return null; };
const hasFlag = (name) => args.includes(`--${name}`);

const root = path.resolve(process.cwd());
const TOOLS_JSON = path.join(root, 'public', 'tools.json');

function normalizeKey(s){ return String(s||'').trim().toLowerCase(); }
function getHostname(u){ try { return new URL(String(u||'')).hostname.replace(/^www\./,'').toLowerCase(); } catch { return ''; } }
const GITHUB_HOST = 'github.com';
const ALLOWLIST_GITHUB_NAMES = new Set(['github copilot']);

async function readJson(p){ const s = await fs.readFile(p,'utf8'); return JSON.parse(s); }

// Firebase Admin init
const KEY_PATH = getArg('key') || process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
if (!KEY_PATH || !fssync.existsSync(KEY_PATH)) { console.error('ERROR: Service account key not found. Provide --key or set GOOGLE_APPLICATION_CREDENTIALS.'); process.exit(1); }
let sa; try { sa = JSON.parse(fssync.readFileSync(KEY_PATH,'utf8')); } catch { console.error('ERROR: Parse service account JSON failed:', KEY_PATH); process.exit(1); }
initializeApp({ credential: cert(sa) });
const db = getFirestore();
console.log(`Using Firebase project: ${sa.project_id || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'unknown'}`);

async function main(){
  const sections = await readJson(TOOLS_JSON);
  if(!Array.isArray(sections) || !sections.length){ console.log('No sections found in public/tools.json'); return; }

  // Load existing Firestore tools (name+domainSlug dedupe)
  const snap = await db.collection('tools').get();
  const existing = new Set();
  for(const d of snap.docs){
    const t = d.data();
    const key = `${normalizeKey(t.name)}::${normalizeKey(t.domainSlug)}`;
    existing.add(key);
  }

  const dryRun = hasFlag('dry-run');
  let toImport = 0;
  for(const sec of sections){
    const domainSlug = normalizeKey(sec.slug || sec.name);
    const tools = Array.isArray(sec.tools) ? sec.tools : [];
    for(const tool of tools){
      const name = String(tool.name||'').trim();
      const link = String(tool.link||'').trim();
      if(!name || !link) continue;
      const host = getHostname(link);
      const nameNorm = normalizeKey(name);
      if(host === GITHUB_HOST && !ALLOWLIST_GITHUB_NAMES.has(nameNorm)) continue; // policy

      const key = `${nameNorm}::${domainSlug}`;
      if(existing.has(key)) continue; // already present

      const doc = {
        name,
        link,
        description: tool.description || tool.about || '',
        tags: Array.isArray(tool.tags) ? tool.tags : [],
        iconUrl: tool.iconUrl || '',
        about: tool.about || '',
        pros: Array.isArray(tool.pros) ? tool.pros : [],
        cons: Array.isArray(tool.cons) ? tool.cons : [],
        domainSlug,
        status: 'active',
        createdAt: new Date(),
        createdBy: 'import-script'
      };
      toImport++;
      if(dryRun){
        console.log('[dry-run] would import:', doc.name, '->', domainSlug);
      } else {
        await db.collection('tools').add(doc);
        existing.add(key);
        console.log('Imported:', doc.name, '->', domainSlug);
      }
    }
  }
  console.log(dryRun ? `Dry run complete. Would import ${toImport} tools.` : `Import complete. Imported ${toImport} tools.`);
}

main().catch(err=>{ console.error(err); process.exit(1); });
