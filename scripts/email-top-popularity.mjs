// Send an email with the Top 30 tools by popularity (latest run)
// Reads data/popularity_raw.json (ranked list) and public/tools.json for links

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd());
const DATA_DIR = path.join(root, 'data');
const PUBLIC_DIR = path.join(root, 'public');
const RAW_PATH = path.join(DATA_DIR, 'popularity_raw.json');
const RANKS_PATH = path.join(PUBLIC_DIR, 'popularity_ranks.json');
const TOOLS_PATH = path.join(PUBLIC_DIR, 'tools.json');

async function readJsonSafe(p){
  try{ const s = await fs.readFile(p, 'utf8'); return JSON.parse(s); }catch{ return null; }
}

function normalizeKey(s){ return String(s||'').trim().toLowerCase(); }

async function loadTop30(){
  const raw = await readJsonSafe(RAW_PATH);
  let ranked = Array.isArray(raw?.ranked) ? raw.ranked : null;
  if(!ranked){
    const ranks = await readJsonSafe(RANKS_PATH);
    if(ranks && typeof ranks === 'object'){
      ranked = Object.entries(ranks)
        .map(([name, rank]) => ({ name, rank: Number(rank)||99999, score: null }))
        .sort((a,b)=> a.rank - b.rank);
    }
  }
  if(!ranked){
    throw new Error('No popularity data found. Ensure update-popularity ran and produced data/popularity_raw.json or public/popularity_ranks.json');
  }
  // Ensure increasing by rank
  ranked.sort((a,b)=> (a.rank||99999) - (b.rank||99999));
  return ranked.slice(0, 30);
}

async function buildLinkMap(){
  const db = await readJsonSafe(TOOLS_PATH);
  const map = new Map();
  if(Array.isArray(db)){
    for(const sec of db){
      for(const t of (sec.tools||[])){
        const k = normalizeKey(t?.name);
        if(k && !map.has(k)) map.set(k, t?.link || null);
      }
    }
  }
  return map;
}

async function sendEmail({ subject, text, html }){
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, TO_EMAIL } = process.env;
  if(!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !TO_EMAIL){
    console.log('Email not sent (SMTP env not configured). Preview:\n', subject, '\n', text);
    return false;
  }
  let nodemailer;
  try{ nodemailer = (await import('nodemailer')).default; }catch{
    console.warn('nodemailer not installed; skipping email.');
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  await transporter.sendMail({ from: SMTP_USER, to: TO_EMAIL, subject, text, html });
  console.log('Top 30 popularity email sent to', TO_EMAIL);
  return true;
}

function esc(s){ return String(s||'').replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

async function main(){
  const top = await loadTop30();
  const linkMap = await buildLinkMap();
  const dateStr = new Date().toISOString().slice(0,10);
  const subject = `AI Atlas — Top 30 Popularity (${dateStr})`;
  const lines = top.map(e => {
    const link = linkMap.get(normalizeKey(e.name));
    const score = e.score != null ? ` (score ${e.score})` : '';
    return `${String(e.rank).padStart(2,' ')}. ${e.name}${score}${link?` — ${link}`:''}`;
  });
  const text = lines.join('\n');

  const itemsHtml = top.map(e => {
    const link = linkMap.get(normalizeKey(e.name));
    const score = e.score != null ? ` (score ${esc(e.score)})` : '';
    const nameHtml = link ? `<a href="${esc(link)}" style="color:#0969da; text-decoration:none; font-weight:600;">${esc(e.name)}</a>` : `<strong>${esc(e.name)}</strong>`;
    return `<li style="margin:6px 0;">#${e.rank} — ${nameHtml}${score}${link?`<div style=\"font-size:12px; color:#57606a;\">${esc(link)}</div>`:''}</li>`;
  }).join('');

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif; line-height:1.4; color:#24292f;">
      <div style="display:flex; align-items:center; gap:8px; margin:0 0 8px;">
        <div style="width:10px; height:10px; border-radius:2px; background:#0969da;"></div>
        <h2 style="margin:0; font-size:18px;">AI Atlas — Top 30 Popularity</h2>
      </div>
      <div style="margin:0 0 10px; color:#57606a;">${esc(dateStr)}</div>
      <ol style="margin:0; padding-left:20px;">${itemsHtml}</ol>
      <hr style="border:none; border-top:1px solid #d0d7de; margin:16px 0;"/>
      <div style="font-size:12px; color:#57606a;">You’re receiving this because the popularity updater ran. Update SMTP settings or remove TO_EMAIL to stop notifications.</div>
    </div>`;

  await sendEmail({ subject, text, html });
}

main().catch(err=>{ console.error(err); process.exit(1); });
