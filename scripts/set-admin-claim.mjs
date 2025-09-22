#!/usr/bin/env node
/**
 * Set Firebase custom claim { admin: true } on a user UID or email.
 * Usage:
 *   node scripts/set-admin-claim.mjs --uid <uid>
 *   node scripts/set-admin-claim.mjs --email <email@example.com>
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS pointing to a service account JSON
 * with access to the Firebase project, or initializeApp({ credential: cert(...) }).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'node:fs';

// Load service account via env if provided (optional)
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!SA_PATH || !fs.existsSync(SA_PATH)) {
  console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS not set or file not found.');
  console.error('Please set it to your service account JSON path before running.');
  process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf-8'));
initializeApp({ credential: cert(sa) });

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && args[idx+1]) return args[idx+1];
  return null;
};

const uid = getArg('uid');
const email = getArg('email');
if (!uid && !email) {
  console.error('Usage: node scripts/set-admin-claim.mjs --uid <uid> | --email <email>');
  process.exit(1);
}

const auth = getAuth();

(async () => {
  try {
    let userRecord;
    if (uid) userRecord = await auth.getUser(uid);
    else userRecord = await auth.getUserByEmail(email);

    await auth.setCustomUserClaims(userRecord.uid, { admin: true });
    console.log(`Custom claim { admin: true } set for UID ${userRecord.uid}`);

    // Optionally, write a role field into Firestore users/{uid} for convenience display
    // This is not required for access control; rules use custom claims.
    console.log('NOTE: Access is controlled via custom claims (request.auth.token.admin).');
    console.log('If your app wants to display a role label, you can store { role: "admin" } in Firestore separately.');
  } catch (e) {
    console.error('Failed to set admin claim:', e.message || e);
    process.exit(2);
  }
})();
