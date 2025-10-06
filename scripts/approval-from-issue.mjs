#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

function setOutput(name, value){
  const line = `${name}=${value}\n`;
  try{
    const f = process.env.GITHUB_OUTPUT;
    if(f){ fs.appendFileSync(f, line); return; }
  }catch{}
  // fallback
  console.log(`::set-output name=${name}::${value}`);
}

function hmacSign(s, secret){
  return crypto.createHmac('sha256', secret).update(String(s)).digest('hex');
}

const DUP_STOPWORDS = new Set(['ai','the','and','of','for','app','apps','tool','tools','platform','labs','studio','framework','kit','sdk','api','model','models','agent','agents','chat','assistant','bot','bots']);

function normalizeKey(value){
  return String(value||'').trim().toLowerCase();
}

function canonicalName(value){
  const tokens = String(value||'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .split(' ')
    .filter(t => t && !DUP_STOPWORDS.has(t));
  return tokens.join(' ');
}

function normalizeUrlForComparison(url){
  if(!url) return '';
  try{
    const u = new URL(String(url));
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./,'').toLowerCase();
    const params = new URLSearchParams(u.search);
    params.sort();
    const query = params.toString();
    u.search = query ? `?${query}` : '';
    u.pathname = u.pathname ? u.pathname.replace(/\/+$/,'') || '/' : '/';
    return u.toString();
  }catch{
    return String(url||'').trim().toLowerCase();
  }
}

try{
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if(!eventPath || !fs.existsSync(eventPath)){
    setOutput('status','skipped');
    setOutput('message','No event payload found');
    process.exit(0);
  }
  const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const issue = payload.issue || {};
  const title = String(issue.title || '');
  const body = String(issue.body || '');
  const labels = (issue.labels || []).map(l => (typeof l === 'string'? l : l.name)).join(',');

  // Proceed if labeled 'approval' OR intent is clear from title/body
  const hasApprovalLabel = /\bapproval\b/i.test(labels);
  const intentFromBody = /Action:\s*(approve|reject)/i.test(body);
  const intentFromTitle = /(Approve ID|Reject ID)/i.test(title) || /\b(approve|reject)\b/i.test(title);
  const hasApprovalIntent = hasApprovalLabel || intentFromBody || intentFromTitle;
  if(!hasApprovalIntent){
    setOutput('status','skipped');
    setOutput('message','Issue not recognized as approval request (add label "approval" or include Action: approve/reject).');
    process.exit(0);
  }

  // Parse fields: Pending ID, Action (approve/reject), Token
  const idMatch = body.match(/Pending ID:\s*([\w-]+)/i) || title.match(/ID[:\s]+([\w-]+)/i);
  const actionMatch = body.match(/Action:\s*(approve|reject)/i) || title.match(/\b(approve|reject)\b/i);
  const tokenMatch = body.match(/Token:\s*([a-f0-9]{64})/i);
  const id = idMatch ? idMatch[1] : '';
  const action = (actionMatch ? actionMatch[1] : '').toLowerCase();
  const token = tokenMatch ? tokenMatch[1] : '';

  if(!id || !action){
    setOutput('status','skipped');
    setOutput('message','Missing ID or action in issue');
    process.exit(0);
  }

  const SECRET = process.env.ADMIN_APPROVAL_SIGNING_KEY || '';
  if(!SECRET){
    setOutput('status','error');
    setOutput('message','Server secret not configured');
    process.exit(1);
  }
  if(!token){
    setOutput('status','error');
    setOutput('message','Token missing in issue body');
    process.exit(1);
  }
  const expect = hmacSign(id, SECRET);
  if(token !== expect){
    setOutput('status','error');
    setOutput('message','Invalid token');
    process.exit(1);
  }

  // Initialize Firebase
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if(!svc){
    setOutput('status','error');
    setOutput('message','FIREBASE_SERVICE_ACCOUNT_JSON missing');
    process.exit(1);
  }
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const key = JSON.parse(svc);
  initializeApp({ credential: cert(key) });
  const db = getFirestore();

  let ref = db.collection('pending_tools').doc(id);
  let snap = await ref.get();
  let data = snap.data() || {};
  // If not found and looks like a provisional ID, reconstruct a minimal pending doc from issue body
  if(!snap.exists && /^prov-/.test(id)){
    const nameMatch = body.match(/Name:\s*(.+)/i);
    const linkMatch = body.match(/Link:\s*(https?:[^\s]+)/i);
    const domainMatch = body.match(/Domain:\s*(.+)/i);
    const name = (nameMatch ? nameMatch[1] : '').trim();
    const link = (linkMatch ? linkMatch[1] : '').trim();
    const domainName = (domainMatch ? domainMatch[1] : '').trim();
    if(!name || !link){
      setOutput('status','error');
      setOutput('message',`Pending item not found and insufficient data to create: ${id}`);
      process.exit(1);
    }
    const slug = domainName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    const doc = {
      name,
      description: '',
      about: '',
      link,
      iconUrl: '',
      tags: [], pros: [], cons: [],
      domainSlug: slug,
      domainName,
      source: 'discovery',
      status: 'pending',
      createdAt: new Date()
    };
    await ref.set(doc);
    snap = await ref.get();
    data = snap.data() || {};
  }else if(!snap.exists){
    setOutput('status','error');
    setOutput('message',`Pending item not found: ${id}`);
    process.exit(1);
  }
  if(action === 'approve'){
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
      approvedBy: 'github-issue',
      source: data.source || 'discovery-issue'
    };
    await toolsRef.add(payload);
    await ref.update({ status: 'approved', resolvedAt: new Date() });
    setOutput('status','ok');
    setOutput('message',`Approved "${payload.name}" (ID ${id})`);
    setOutput('action','approve');
    setOutput('id', id);
    setOutput('name', payload.name || '');
    process.exit(0);
  }else if(action === 'reject'){
    await ref.update({ status: 'rejected', resolvedAt: new Date() });
    try{
      const rejects = db.collection('discovery_rejections');
      const normalizedName = normalizeKey(data.name || id);
      const canonical = canonicalName(data.name || '');
      const normalizedLink = normalizeUrlForComparison(data.link || '');
      const hashSource = `${canonical || ''}::${normalizedName || ''}::${normalizedLink || ''}`;
      const docId = crypto.createHash('sha256').update(hashSource || id).digest('hex').slice(0, 40);
      const payload = {
        name: data.name || '',
        normalizedName,
        canonicalName: canonical,
        link: data.link || '',
        normalizedLink,
        domainSlug: data.domainSlug || '',
        domainName: data.domainName || '',
        pendingId: id,
        source: data.source || 'discovery-issue',
        rejectedAt: new Date().toISOString(),
        reason: 'issue-rejection'
      };
      await rejects.doc(docId).set(payload, { merge: true });
    }catch(err){
      console.warn('Failed to record rejection in discovery_rejections:', err?.message || err);
    }
    setOutput('status','ok');
    setOutput('message',`Rejected ID ${id}`);
    setOutput('action','reject');
    setOutput('id', id);
    setOutput('name', data.name || '');
    process.exit(0);
  }else{
    setOutput('status','error');
    setOutput('message','Invalid action (use approve/reject)');
    process.exit(1);
  }
}catch(e){
  setOutput('status','error');
  setOutput('message', (e && e.message) || String(e));
  process.exit(1);
}
