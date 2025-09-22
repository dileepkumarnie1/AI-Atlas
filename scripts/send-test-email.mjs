import 'dotenv/config';

async function main(){
  let nodemailer;
  try{ nodemailer = (await import('nodemailer')).default; }catch{
    console.error('nodemailer is not installed. Run: npm i nodemailer@7');
    process.exit(1);
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, TO_EMAIL } = process.env;
  const missing = ['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','TO_EMAIL'].filter(k=>!process.env[k]);
  if(missing.length){
    console.error('Missing SMTP env vars:', missing.join(', '));
    console.log('Set them in a .env file or in your PowerShell session before running this test.');
    process.exit(1);
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  const subject = `SMTP test from AI Atlas at ${new Date().toISOString()}`;
  const text = 'Success! Your SMTP settings are working.';
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif; line-height:1.4; color:#24292f;">
    <h2 style="margin:0 0 8px;">AI Atlas</h2>
    <p style="margin:0 0 8px;">Success! Your SMTP settings are working.</p>
    <p style="margin:0; color:#57606a; font-size:12px;">${new Date().toLocaleString()}</p>
  </div>`;
  const info = await transporter.sendMail({ from: SMTP_USER, to: TO_EMAIL, subject, text, html });
  console.log('Email sent:', info.messageId || info);
}

main().catch(err=>{ console.error('Failed to send test email:', err.message || err); process.exit(1); });
