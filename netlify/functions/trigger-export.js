// Netlify Function: trigger-export
// Purpose: One-click trigger the GitHub Actions workflow 'export-tools.yml' via workflow_dispatch.
// Security: Requires a token query param which is HMAC-SHA256 over the literal string 'export'
//           using the shared secret ADMIN_APPROVAL_SIGNING_KEY.

import crypto from 'node:crypto';

function hmacSign(s, secret){
  try{ return crypto.createHmac('sha256', String(secret||''))
    .update(String(s))
    .digest('hex');
  }catch{ return ''; }
}

function htmlPage(title, body){
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>body{font-family:Segoe UI,Arial,sans-serif;line-height:1.4;color:#24292f;padding:24px;}a.btn{display:inline-block;background:#0969da;color:#fff;padding:8px 12px;border-radius:6px;text-decoration:none} .muted{color:#57606a;font-size:12px;margin-top:6px}</style>
  </head><body>
    <h2 style="margin:0 0 8px;">AI Atlas — Export Tools</h2>
    ${body}
  </body></html>`;
}

export const handler = async (event) => {
  try{
    // Method and params
    const method = (event.httpMethod || 'GET').toUpperCase();
    const params = new URLSearchParams(event.queryStringParameters || {});
    const b = (method === 'GET') ? {} : (event.body ? JSON.parse(event.body) : {});
    const token = params.get('token') || b.token || '';

    // Verify token against HMAC('export')
    const SECRET = process.env.ADMIN_APPROVAL_SIGNING_KEY || '';
    if(!SECRET){
      return { statusCode: 500, body: 'ADMIN_APPROVAL_SIGNING_KEY not configured' };
    }
    const expect = hmacSign('export', SECRET);
    if(!token || token !== expect){
      return { statusCode: 403, body: htmlPage('Unauthorized', `<p>Invalid token.</p><div class="muted">Ask an admin to regenerate the link.</div>`) };
    }

    // Repo and auth
    const repoSlug = String(process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY || '').trim();
    if(!repoSlug || !repoSlug.includes('/')){
      return { statusCode: 500, body: htmlPage('Configuration error', `<p>GITHUB_REPO or GITHUB_REPOSITORY is not set (owner/repo).</p>`) };
    }
    const tokenPAT = process.env.GITHUB_TOKEN_PAT || process.env.GH_PAT || '';
    if(!tokenPAT){
      return { statusCode: 500, body: htmlPage('Configuration error', `<p>Missing GitHub Personal Access Token (set GITHUB_TOKEN_PAT or GH_PAT in Netlify env).</p>`) };
    }

    // Trigger workflow_dispatch
    const url = `https://api.github.com/repos/${repoSlug}/actions/workflows/export-tools.yml/dispatches`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenPAT}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'ai-atlas-netlify'
      },
      body: JSON.stringify({ ref: 'main' })
    });
    if(resp.status !== 204){
      const text = await resp.text().catch(()=> '');
      return { statusCode: 500, body: htmlPage('Failed to trigger', `<p>GitHub API error: ${resp.status}</p><pre style="white-space:pre-wrap;background:#f6f8fa;padding:8px;border-radius:6px;">${text}</pre>`) };
    }

    const actionsUi = `https://github.com/${repoSlug}/actions/workflows/export-tools.yml`;
    const okHtml = `<p>Export workflow has been triggered successfully.</p>
      <p><a class="btn" href="${actionsUi}">View Workflow</a></p>
      <div class="muted">You may need to sign in to GitHub to see the run.</div>`;
    return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: htmlPage('Triggered', okHtml) };
  }catch(e){
    return { statusCode: 500, body: String(e && e.message || e) };
  }
};
