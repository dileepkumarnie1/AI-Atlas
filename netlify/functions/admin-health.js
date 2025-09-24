import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let appInited = false;
function initFirebase(){
  if (appInited) return;
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (svcJson) {
    try {
      const key = JSON.parse(svcJson);
      initializeApp({ credential: cert(key) });
      appInited = true;
      return;
    } catch {}
  }
  try {
    initializeApp({ credential: applicationDefault() });
    appInited = true;
  } catch {}
}

function getAllowedOrigin(){
  const explicit = (process.env.ADMIN_ALLOWED_ORIGIN||'').trim();
  if (explicit) return explicit;
  const base = (process.env.APPROVAL_BASE_URL||'').trim();
  if (base) {
    try { return new URL(base).origin; } catch {}
  }
  return '*';
}

function corsHeaders(){
  const allow = getAllowedOrigin();
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '600'
  };
}

async function requireAdmin(event){
  const authz = event.headers && (event.headers.authorization || event.headers.Authorization);
  if(!authz || !/^Bearer\s+/.test(authz)) return { error: { code: 401, message: 'Missing Authorization Bearer token' } };
  const token = authz.replace(/^Bearer\s+/i,'').trim();
  initFirebase();
  if(!appInited) return { error: { code: 500, message: 'Server auth not configured' } };
  try{
    const decoded = await getAuth().verifyIdToken(token);
    if(!decoded || decoded.admin !== true) return { error: { code: 403, message: 'Admin claim required' } };
    return { uid: decoded.uid, email: decoded.email || '' };
  }catch{
    return { error: { code: 401, message: 'Invalid token' } };
  }
}

export const handler = async (event) => {
  const headers = corsHeaders();
  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 204, headers };
  }
  if(event.httpMethod !== 'GET'){
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  const admin = await requireAdmin(event);
  if('error' in admin){
    return { statusCode: admin.error.code, headers, body: JSON.stringify({ error: admin.error.message }) };
  }
  const result = { ok: true, checks: {} };
  try{
    // Env checks
    const must = ['FIREBASE_SERVICE_ACCOUNT_JSON'];
    const optional = ['APPROVAL_BASE_URL','ADMIN_APPROVAL_SIGNING_KEY','ADMIN_ALLOWED_ORIGIN','GITHUB_REPO','GITHUB_TOKEN'];
    result.checks.env = {
      required: must.map(k => ({ key: k, present: !!(process.env[k]||'').trim() })),
      optional: optional.map(k => ({ key: k, present: !!(process.env[k]||'').trim() }))
    };

    // Firestore connectivity
    initFirebase();
    if(!appInited){ throw new Error('Firebase Admin not configured'); }
    const db = getFirestore();
    const testDoc = db.collection('health_checks').doc('admin');
    await testDoc.set({ ts: new Date(), source: 'admin-health' }, { merge: true });
    const snap = await testDoc.get();
    result.checks.firestore = { ok: snap.exists, ts: snap.exists ? (snap.data().ts || null) : null };

    return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
  }catch(e){
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: (e && e.message) || String(e), checks: result.checks }) };
  }
};
