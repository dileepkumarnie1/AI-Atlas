import nodemailer from 'nodemailer';

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { to, subject = 'Thank you for your submission', html = '<p>Thanks!</p>' } = body;
    if (!to) return { statusCode: 400, body: 'Missing to' };

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      return { statusCode: 500, body: 'SMTP not configured' };
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({ from: SMTP_USER, to, subject, html });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: e.message || 'error' };
  }
};
