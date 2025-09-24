import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
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
  }catch{
    return { error: { code: 401, message: 'Invalid token' } };
  }
}

async function dispatchWorkflow(workflow, ref='main', inputs={}){
  const repo = (process.env.GITHUB_REPO||'').trim();
  const token = (process.env.GITHUB_TOKEN||'').trim();
  if(!repo || !token) {
    throw new Error('GITHUB_REPO and GITHUB_TOKEN must be configured on the server');
  }
  const map = {
    discover: 'discover-tools.yml',
    export: 'export-tools.yml'
  };
  const file = map[workflow];
  if(!file) throw new Error('Unsupported workflow: ' + workflow);
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(file)}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'ai-atlas-admin-dispatch'
    },
    body: JSON.stringify({ ref, inputs })
  });
  if(!res.ok){
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }
  return { ok: true };
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

  const workflow = String(body.workflow||'').trim().toLowerCase();
  const ref = (body.ref && String(body.ref).trim()) || 'main';
  const inputs = (body.inputs && typeof body.inputs === 'object') ? body.inputs : {};
  if(!workflow){
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'workflow is required (discover|export)' }) };
  }

  try{
    const out = await dispatchWorkflow(workflow, ref, inputs);
    return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, workflow, ref, result: out }) };
  }catch(e){
    return { statusCode: 500, headers, body: JSON.stringify({ error: (e && e.message) || String(e) }) };
  }
};
