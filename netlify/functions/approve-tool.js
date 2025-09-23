import crypto from 'node:crypto';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
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
  // fallback to ADC if available
  try {
    initializeApp({ credential: applicationDefault() });
    appInited = true;
  } catch {}
}

function hmacSign(s, secret){
  return crypto.createHmac('sha256', secret).update(s).digest('hex');
}

function htmlPage(title, body){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${title}</title><style>body{font-family:Segoe UI,Arial,sans-serif;line-height:1.4;padding:24px;color:#24292f} .ok{color:#116329} .err{color:#9a2222}</style></head><body>${body}</body></html>`;
}

export const handler = async (event) => {
  try{
    const params = event.queryStringParameters || {};
    const id = String(params.id || '').trim();
    const action = String(params.action || '').trim().toLowerCase();
    const token = String(params.token || '').trim();
    const SECRET = process.env.ADMIN_APPROVAL_SIGNING_KEY || '';
    if(!id || !action || !token || !SECRET){
      const msg = 'Missing id, action, token, or server secret.';
      return { statusCode: 400, headers: { 'content-type':'text/html' }, body: htmlPage('Approval Error', `<h2 class="err">Approval failed</h2><p>${msg}</p>`) };
    }
    const expect = hmacSign(id, SECRET);
    if(expect !== token){
      return { statusCode: 403, headers: { 'content-type':'text/html' }, body: htmlPage('Approval Error', `<h2 class="err">Invalid token</h2><p>Signature mismatch</p>`) };
    }
    initFirebase();
    if(!appInited){
      return { statusCode: 500, headers: { 'content-type':'text/html' }, body: htmlPage('Approval Error', `<h2 class="err">Server not configured</h2><p>Firebase credentials missing.</p>`) };
    }
    const db = getFirestore();
    const ref = db.collection('pending_tools').doc(id);
    const snap = await ref.get();
    if(!snap.exists){
      return { statusCode: 404, headers: { 'content-type':'text/html' }, body: htmlPage('Not Found', `<h2 class="err">Pending item not found</h2><p>ID: ${id}</p>`) };
    }
    const data = snap.data() || {};
    if(action === 'approve'){
      // write to tools collection as active
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
        approvedBy: 'email-link',
        source: data.source || 'discovery-email'
      };
      await toolsRef.add(payload);
      await ref.update({ status: 'approved', resolvedAt: new Date() });
      return { statusCode: 200, headers: { 'content-type':'text/html' }, body: htmlPage('Approved', `<h2 class="ok">Approved</h2><p>"${payload.name}" has been approved and queued for export.</p>`) };
    }
    if(action === 'reject'){
      await ref.update({ status: 'rejected', resolvedAt: new Date() });
      return { statusCode: 200, headers: { 'content-type':'text/html' }, body: htmlPage('Rejected', `<h2 class="ok">Rejected</h2><p>Item has been rejected.</p>`) };
    }
    return { statusCode: 400, headers: { 'content-type':'text/html' }, body: htmlPage('Approval Error', `<h2 class="err">Invalid action</h2><p>Use action=approve or action=reject.</p>`) };
  }catch(e){
    return { statusCode: 500, headers: { 'content-type':'text/html' }, body: htmlPage('Server Error', `<h2 class="err">Error</h2><pre>${(e && e.message) || String(e)}</pre>`) };
  }
};
