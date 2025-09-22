import 'dotenv/config';

function sanitize(str){
  return (str ?? '').toString().trim();
}

function validateSmtpEnv(env){
  const host = sanitize(env.SMTP_HOST);
  const portStr = sanitize(env.SMTP_PORT);
  const user = sanitize(env.SMTP_USER);
  const pass = sanitize(env.SMTP_PASS);
  const to = sanitize(env.TO_EMAIL);
  const missing = [];
  if(!host) missing.push('SMTP_HOST');
  if(!portStr) missing.push('SMTP_PORT');
  if(!user) missing.push('SMTP_USER');
  if(!pass) missing.push('SMTP_PASS');
  if(!to) missing.push('TO_EMAIL');
  if(missing.length) return { ok:false, missing };
  const issues = [];
  if(/[\s]/.test(host)) issues.push('SMTP_HOST contains whitespace');
  if(host.includes('://')) issues.push('SMTP_HOST must not include protocol (use smtp.example.com, not https://...)');
  if(host.includes(':')) issues.push('SMTP_HOST must not include a port (set SMTP_PORT separately)');
  if(!/^[A-Za-z0-9.-]+$/.test(host)) issues.push('SMTP_HOST has invalid characters (allowed: letters, digits, dot, hyphen)');
  const port = Number(portStr);
  if(!Number.isInteger(port) || port < 1 || port > 65535) issues.push('SMTP_PORT must be an integer between 1 and 65535');
  return { ok: issues.length === 0, issues, host, port, user, pass, to };
}

async function main(){
  let nodemailer;
  try{ nodemailer = (await import('nodemailer')).default; }catch{
    console.error('nodemailer is not installed. Run: npm i nodemailer@7');
    process.exit(1);
  }
  const { ok, missing, issues, host, port, user, pass, to } = validateSmtpEnv(process.env);
  if(missing && missing.length){
    console.error('Missing SMTP env vars:', missing.join(', '));
    console.log('Set them in repo Actions Secrets (CI) or a local .env before running this test.');
    process.exit(1);
  }
  if(!ok){
    console.error('Invalid SMTP configuration:\n - ' + (issues||[]).join('\n - '));
    console.log('Tip: use only the hostname in SMTP_HOST (e.g., smtp.gmail.com) and a numeric SMTP_PORT (587 or 465).');
    process.exit(1);
  }
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
  const subject = `SMTP test from AI Atlas at ${new Date().toISOString()}`;
  const text = 'Success! Your SMTP settings are working.';
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif; line-height:1.4; color:#24292f;">
    <h2 style="margin:0 0 8px;">AI Atlas</h2>
    <p style="margin:0 0 8px;">Success! Your SMTP settings are working.</p>
    <p style="margin:0; color:#57606a; font-size:12px;">${new Date().toLocaleString()}</p>
  </div>`;
  const info = await transporter.sendMail({ from: user, to, subject, text, html });
  console.log('Email sent:', info.messageId || info);
}

main().catch(err=>{ console.error('Failed to send test email:', err.message || err); process.exit(1); });
