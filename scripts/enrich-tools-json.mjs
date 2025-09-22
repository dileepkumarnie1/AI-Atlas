#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

function isNonEmptyStr(s){ return typeof s === 'string' && s.trim().length > 0; }
function arr(a){ return Array.isArray(a) ? a : []; }

function extractMeta(html){
  const out = {};
  const get = (re) => { const m = html.match(re); return m && m[1] ? m[1].trim() : ''; };
  out.title = get(/<title[^>]*>([^<]*)<\/title>/i);
  out.ogDescription = get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
                      get(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
                      get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const icons = [];
  const linkRe = /<link[^>]+rel=["']([^"']+)["'][^>]+href=["']([^"']+)["'][^>]*>/ig;
  let lm;
  while ((lm = linkRe.exec(html))){
    const rel = lm[1].toLowerCase();
    const href = lm[2];
    if (/(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/.test(rel)) icons.push(href);
  }
  out.icons = icons;
  const ogImg = get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (ogImg) out.ogImage = ogImg;
  return out;
}

async function enrichFromLink(link){
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(link, { signal: controller.signal, headers: { 'user-agent': 'ai-atlas-enricher/1.0' } });
    const url = new URL(link);
    const origin = url.origin;
    const text = await res.text();
    const meta = extractMeta(text || '');
    const description = meta.ogDescription || meta.title || '';
    let iconUrl = '';
    const pick = meta.icons && meta.icons.find(h => /apple-touch-icon|icon/.test(h)) || meta.icons && meta.icons[0] || '';
    if (pick) { try { iconUrl = new URL(pick, origin).toString(); } catch {} }
    if (!iconUrl) iconUrl = `${origin}/favicon.ico`;
    return { description, iconUrl };
  } catch {
    try { return { description: '', iconUrl: new URL(link).origin + '/favicon.ico' }; }
    catch { return { description: '', iconUrl: '' }; }
  } finally { clearTimeout(to); }
}

async function main(){
  const file = process.argv[2] || path.join(process.cwd(), 'public', 'tools.json');
  const raw = await fs.readFile(file, 'utf8');
  const sections = JSON.parse(raw);
  let updates = 0;
  for (const sec of sections){
    for (const t of arr(sec.tools)){
      if (!isNonEmptyStr(t.link)) continue;
      const needsDesc = !isNonEmptyStr(t.description) || t.description.trim().length < 10;
      const needsIcon = !isNonEmptyStr(t.iconUrl);
      // Ensure schema fields present even if no network
      if (!('tags' in t)) t.tags = [];
      if (!('pros' in t)) t.pros = [];
      if (!('cons' in t)) t.cons = [];
      if (!('about' in t)) t.about = t.description || '';
      if (!(needsDesc || needsIcon)) continue;
      const info = await enrichFromLink(t.link);
      if (needsDesc && isNonEmptyStr(info.description)) { t.description = info.description; t.about ||= info.description; updates++; }
      if (needsIcon && isNonEmptyStr(info.iconUrl)) { t.iconUrl = info.iconUrl; updates++; }
    }
  }
  if (updates){
    await fs.writeFile(file, JSON.stringify(sections, null, 2));
    console.log(`Enriched ${updates} fields and wrote ${file}`);
  } else {
    console.log('No enrichment needed.');
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });
