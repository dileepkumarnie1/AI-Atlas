#!/usr/bin/env node
/**
 * Backfill Firestore tools with iconUrl pointing to repo-cached assets.
 *
 * WARNING: Run only if you want Firestore to reference static repo icons.
 * Requires GOOGLE_APPLICATION_CREDENTIALS to a Firebase Admin service account.
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const root = process.cwd();
const MANIFEST = path.join(root, 'public', 'icons', 'manifest.json');

function normalizeKey(s){ return String(s||'').trim().toLowerCase(); }

async function main(){
  const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!KEY || !fssync.existsSync(KEY)){
    console.error('Missing GOOGLE_APPLICATION_CREDENTIALS or file not found.');
    process.exit(1);
  }
  if (!fssync.existsSync(MANIFEST)){
    console.error('Icon manifest not found. Run tools:icons first.');
    process.exit(1);
  }
  const sa = JSON.parse(await fs.readFile(KEY, 'utf8'));
  initializeApp({ credential: cert(sa) });
  const db = getFirestore();

  const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  const snap = await db.collection('tools').where('status', '==', 'active').get();
  console.log(`Backfilling ${snap.size} Firestore tools with cached icon paths (if present)...`);
  let updated = 0;
  for (const doc of snap.docs){
    const d = doc.data();
    const sec = normalizeKey(d.domainSlug || d.domainName || '');
    const key = `${sec}::${normalizeKey(d.name)}`;
    const local = manifest[key];
    if (!local) continue;
    const rel = String(local).replace(/^public\//,'');
    if (d.iconUrl === rel) continue;
    try{
      await doc.ref.update({ iconUrl: rel, iconBackfilledAt: new Date().toISOString() });
      updated++;
    }catch(e){ console.warn('Update failed for', d.name, e.message); }
  }
  console.log(`Backfill complete. Updated ${updated} document(s).`);
}

main().catch(e => { console.error(e); process.exit(1); });
