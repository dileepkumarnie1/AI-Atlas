#!/usr/bin/env node
/**
 * Set or check Firebase custom claim { admin: true } on a user UID or email.
 * Usage:
 *   node scripts/set-admin-claim.mjs --uid <uid>
 *   node scripts/set-admin-claim.mjs --email <email@example.com>
 * Optional:
 *   --key <path-to-serviceAccount.json>  (otherwise uses GOOGLE_APPLICATION_CREDENTIALS)
 *   --check-only  (only prints current custom claims and exits)
 */
import 'dotenv/config';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0) {
    const val = args[idx + 1];
    if (val && !val.startsWith('--')) return val;
  }
  return null;
};
const hasFlag = (name) => args.includes(`--${name}`);

// Resolve service account key path
const KEY_PATH = getArg('key') || process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
if (!KEY_PATH || !fs.existsSync(KEY_PATH)) {
  console.error('ERROR: Service account key not found.');
  console.error('Provide it with --key <path> or set GOOGLE_APPLICATION_CREDENTIALS env var.');
  process.exit(1);
}
const saRaw = fs.readFileSync(KEY_PATH, 'utf-8');
let sa;
try {
  sa = JSON.parse(saRaw);
} catch (e) {
  console.error('ERROR: Failed to parse service account JSON at', KEY_PATH);
  process.exit(1);
}
initializeApp({ credential: cert(sa) });

const uid = getArg('uid');
const email = getArg('email');
const checkOnly = hasFlag('check-only');
if (!uid && !email) {
  console.error('Usage: node scripts/set-admin-claim.mjs --uid <uid> | --email <email> [--key <path>] [--check-only]');
  process.exit(1);
}

const auth = getAuth();

(async () => {
  try {
    let userRecord;
    if (uid) userRecord = await auth.getUser(uid);
    else userRecord = await auth.getUserByEmail(email);

    const currentClaims = userRecord.customClaims || {};
    console.log('User:', { uid: userRecord.uid, email: userRecord.email });
    console.log('Current custom claims:', currentClaims);

    if (checkOnly) {
      console.log('Check-only mode: no changes applied.');
      process.exit(0);
    }

    if (currentClaims.admin === true) {
      console.log('Admin claim already set. No update needed.');
      process.exit(0);
    }

    await auth.setCustomUserClaims(userRecord.uid, { ...currentClaims, admin: true });
    console.log(`Custom claim { admin: true } set for UID ${userRecord.uid}`);
    console.log('NOTE: Access is controlled via custom claims (request.auth.token.admin).');
    console.log('If your app wants to display a role label, you can mirror { role: "admin" } in Firestore separately.');
  } catch (e) {
    console.error('Failed to set/check admin claim:', e.message || e);
    process.exit(2);
  }
})();
