#!/usr/bin/env node
/**
 * Email major pricing anomalies in a table with approve links.
 *
 * Inputs via env:
 *  - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, TO_EMAIL (recipient), FROM_EMAIL (optional)
 *  - GITHUB_REPO (e.g., dileepkumarnie1/AI-Atlas)
 *  - GH_TOKEN (repo-scoped token) for approval webhook links (optional)
 *
 * Behavior:
 *  - Reads data/pricing-audit.json, filters anomalies with reason containing 'conflict'
 *  - Builds an HTML email table: tool, section, anomalies, suggested model
 *  - Each row includes multiple "Approve (Issue)" links to open prefilled GitHub Issues (labeled pricing-approve),
 *    an "Approval Page" deep link (prefilled web page), and a "Dispatch UI" link to the manual Actions workflow
 *    (Pricing Approval)
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

function sanitize(s){ return String(s||'').trim(); }

function chooseSuggestion(labels){
  const CANON = new Set(['Open Source','Free','Freemium','Subscription','Paid/Subscription','Paid']);
  const normalize = (l)=> l==='Paid'?'Subscription':(l==='Paid/Subscription'?'Subscription':l);
  const unique = Array.from(new Set((labels||[]).map(normalize))).filter(l=>CANON.has(l));
  const priority = new Map([['Open Source',1],['Free',2],['Freemium',3],['Subscription',4]]);
  if (!unique.length) return 'Freemium';
  return unique.sort((a,b)=>(priority.get(a)||9)-(priority.get(b)||9))[0];
}

async function sendEmail(html){
  let nodemailer; try{ nodemailer=(await import('nodemailer')).default; }catch{ console.error('Missing nodemailer. npm i nodemailer@7'); process.exit(1);} 
  const host = sanitize(process.env.SMTP_HOST);
  const port = Number(sanitize(process.env.SMTP_PORT));
  const user = sanitize(process.env.SMTP_USER);
  const pass = sanitize(process.env.SMTP_PASS);
  const to = sanitize(process.env.TO_EMAIL);
  const from = sanitize(process.env.FROM_EMAIL) || user;
  if(!host||!port||!user||!pass||!to){
    console.error('Missing SMTP env vars (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, TO_EMAIL).');
    process.exit(1);
  }
  const transporter = nodemailer.createTransport({ host, port, secure: port===465, auth: { user, pass }});
  const subject = `AI Atlas: Pricing conflicts needing approval (${new Date().toISOString().slice(0,10)})`;
  const info = await transporter.sendMail({ from, to, subject, html, text: 'Pricing conflicts pending approval' });
  console.log('Email sent:', info.messageId || info);
}

async function main(){
  const auditPath = path.join(process.cwd(), 'data', 'pricing-audit.json');
  const raw = await fs.readFile(auditPath, 'utf8');
  const j = JSON.parse(raw);
  const anomalies = Array.isArray(j.anomalies) ? j.anomalies : [];
  const majors = anomalies.filter(a=>/conflict/i.test(a.reason));
  if (majors.length===0){ console.log('No major anomalies (conflicts) to email.'); return; }
  const rows = majors.map(a=>{
    const repo = sanitize(process.env.GITHUB_REPO);
    const dispatchUrl = repo ? `https://github.com/${repo}/actions/workflows/pricing-approval.yml/dispatches` : '#';
    const candidates = Array.from(new Set([...(a.labels||[]), chooseSuggestion(a.labels)])).filter(Boolean);
    const [owner, rname] = repo ? repo.split('/') : [];
    const suggested = chooseSuggestion(a.labels);
    // Build Approval Page link (prefer GitHub Pages if available, otherwise raw)
    const approveParams = new URLSearchParams({
      section: String(a.section||''),
      tool: String(a.tool||''),
      pricing: String(suggested||'Freemium'),
      repo: String(repo||'')
    }).toString();
    const pagesUrl = (owner && rname) ? `https://${owner}.github.io/${rname}/public/approve.html?${approveParams}` : '#';
    const rawUrl = repo ? `https://raw.githubusercontent.com/${repo}/main/public/approve.html?${approveParams}` : '#';
    const approvalPageUrl = pagesUrl !== '#' ? pagesUrl : rawUrl;
    const links = candidates.map(c=>{
      const issueUrl = repo ? (
        `https://github.com/${repo}/issues/new`+
        `?title=${encodeURIComponent(`Pricing approval: ${a.tool} -> ${c}`)}`+
        `&labels=${encodeURIComponent('pricing-approve')}`+
        `&body=${encodeURIComponent(`Section: ${a.section}\nTool: ${a.tool}\nPricing: ${c}\n`)}`
      ) : '#';
      return `<a href="${issueUrl}" target="_blank" style="margin-right:8px;">Approve ${c} (Issue)</a>`;
    }).join('')
    + (approvalPageUrl && approvalPageUrl !== '#' ? ` <a href="${approvalPageUrl}" target="_blank" style="color:#0366d6;">Approval Page</a>` : '')
    + ` <a href="${dispatchUrl}" target="_blank" style="color:#57606a;">Dispatch UI</a>`;
    return `<tr>
      <td style="padding:8px 6px; border-bottom:1px solid #eee;">${a.tool}</td>
      <td style="padding:8px 6px; border-bottom:1px solid #eee; color:#57606a;">${a.section}</td>
      <td style="padding:8px 6px; border-bottom:1px solid #eee;">${(a.labels||[]).join(', ')}</td>
      <td style=\"padding:8px 6px; border-bottom:1px solid #eee;\">${links}</td>
    </tr>`;
  }).join('');
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif; color:#24292f;">
      <h2 style="margin:0 0 8px;">Pricing conflicts require approval</h2>
      <p style="margin:0 0 12px; color:#57606a;">Use <strong>Approve (Issue)</strong> to open a pre‑filled GitHub Issue (labelled <code>pricing-approve</code>). The <em>Pricing Approval (Issue)</em> workflow will apply the override and open a PR automatically.
      You can also use the <strong>Approval Page</strong> (prefilled web page) to review and generate links, or click <strong>Dispatch UI</strong> to run the manual <em>Pricing Approval</em> workflow from Actions.</p>
      <table style="border-collapse:collapse; width:100%; max-width:900px;">
        <thead>
          <tr style="text-align:left;">
            <th style="padding:8px 6px; border-bottom:2px solid #ddd;">Tool</th>
            <th style="padding:8px 6px; border-bottom:2px solid #ddd;">Section</th>
            <th style="padding:8px 6px; border-bottom:2px solid #ddd;">Anomalies</th>
            <th style="padding:8px 6px; border-bottom:2px solid #ddd;">Approve</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:12px 0 0; color:#57606a; font-size:12px;">Tip: If you prefer, open an issue labeled <code>pricing-approve</code> with fields
      <strong>Section</strong>, <strong>Tool</strong>, <strong>Pricing</strong>, and the <em>Pricing Approval (Issue)</em> workflow will create a PR automatically.</p>
    </div>`;
  await sendEmail(html);
}

main().catch(e=>{ console.error('email-pricing-anomalies failed:', e.message||e); process.exit(1); });
