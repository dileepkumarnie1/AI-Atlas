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
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
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
  const headers = corsHeaders();
  if(event.httpMethod === 'OPTIONS'){
    return { statusCode: 204, headers };
  }
  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  const admin = await requireAdmin(event);
  if('error' in admin){
    return { statusCode: admin.error.code, headers, body: JSON.stringify({ error: admin.error.message }) };
  }

  let body = {};
  try{
    const raw = event.isBase64Encoded ? Buffer.from(event.body||'', 'base64').toString('utf8') : (event.body || '');
    body = raw ? JSON.parse(raw) : {};
  }catch{
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const id = String(body.id||'').trim();
  const action = String(body.action||'').trim().toLowerCase();
  const reason = String(body.reason||'').trim();
  if(!id || !action) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'id and action are required' }) };
  }
  if(action !== 'approve' && action !== 'reject'){
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'action must be approve or reject' }) };
  }

  try{
    initFirebase();
    if(!appInited){
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server not configured' }) };
    }
    const db = getFirestore();
    const ref = db.collection('pending_tools').doc(id);
    const snap = await ref.get();
    if(!snap.exists){
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Pending item not found' }) };
    }
    const data = snap.data() || {};
    const curStatus = String(data.status||'pending');

    // Idempotency: if already resolved, return current state
    if(curStatus === 'approved' || curStatus === 'rejected'){
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, status: curStatus }) };
    }

    if(action === 'reject'){
      await Promise.all([
        ref.update({ status: 'rejected', resolvedAt: new Date(), resolvedBy: admin.email || admin.uid, reason: reason || undefined }),
        db.collection('audit_logs').add({ actorUid: admin.uid, actorEmail: admin.email||'', action: 'reject', targetId: id, targetType: 'pending_tools', reason: reason||'', ts: new Date() })
      ]);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, status: 'rejected' }) };
    }

    // approve
    const toolsRef = db.collection('tools');
    const payload = {
      name: data.name,
      description: data.description || data.about || '',
      about: data.about || data.description || '',
      link: data.link,
      iconUrl: data.iconUrl || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      pros: Array.isArray(data.pros) ? data.pros : [],
      cons: Array.isArray(data.cons) ? data.cons : [],
      domainSlug: data.domainSlug || '',
      domainName: data.domainName || '',
      status: 'active',
      approvedAt: new Date(),
      approvedBy: admin.email || admin.uid,
      source: data.source || 'discovery-admin'
    };
    const addRes = await toolsRef.add(payload);
    await Promise.all([
      ref.update({ status: 'approved', resolvedAt: new Date(), resolvedBy: admin.email || admin.uid }),
      db.collection('audit_logs').add({ actorUid: admin.uid, actorEmail: admin.email||'', action: 'approve', targetId: id, targetType: 'pending_tools', reason: reason||'', ts: new Date(), toolId: addRes.id })
    ]);

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, status: 'approved', toolId: addRes.id }) };
  }catch(e){
    return { statusCode: 500, headers, body: JSON.stringify({ error: (e && e.message) || String(e) }) };
  }
};
