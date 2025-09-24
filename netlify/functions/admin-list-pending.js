import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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
    } catch {
      // fallthrough
    }
  }
  try {
    initializeApp({ credential: applicationDefault() });
    appInited = true;
  } catch {}
}

function getAllowedOrigin(){
  // Prefer explicit ADMIN_ALLOWED_ORIGIN; else derive from APPROVAL_BASE_URL origin; else '*'
  const explicit = (process.env.ADMIN_ALLOWED_ORIGIN||'').trim();
  if (explicit) return explicit;
  const base = (process.env.APPROVAL_BASE_URL||'').trim();
  if (base) {
    try { return new URL(base).origin; } catch {}
  }
  return '*';
}

function corsHeaders(origin){
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
  }catch(e){
    return { error: { code: 401, message: 'Invalid token' } };
  }
}

export const handler = async (event) => {
  const headers = corsHeaders(event.headers?.origin);
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
  try{
    initFirebase();
    if(!appInited){
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server not configured' }) };
    }
    const db = getFirestore();
    const params = event.queryStringParameters || {};
    const limit = Math.min(100, Math.max(1, Number(params.limit||50)));
    const status = String(params.status||'pending');

    let q = db.collection('pending_tools');
    if(status) q = q.where('status','==',status);
    q = q.orderBy('createdAt','desc').limit(limit);
    const snap = await q.get();
    const items = snap.docs.map(d => {
      const x = d.data() || {};
      return {
        id: d.id,
        name: x.name || '',
        domainName: x.domainName || '',
        domainSlug: x.domainSlug || '',
        link: x.link || '',
        iconUrl: x.iconUrl || '',
        status: x.status || 'pending',
        source: x.source || '',
        createdAt: x.createdAt && typeof x.createdAt.toDate === 'function' ? x.createdAt.toDate().toISOString() : (x.createdAt || null)
      };
    });
    return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) };
  }catch(e){
    return { statusCode: 500, headers, body: JSON.stringify({ error: (e && e.message) || String(e) }) };
  }
};
