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
  out.keywords = get(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const headingMatches = html.match(/<(h1|h2|h3)[^>]*>(.*?)<\/\1>/ig) || [];
  out.headings = headingMatches.map(h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim()).join(' ').toLowerCase();
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

function inferTagsFromMeta(meta){
  const bag = (meta.keywords || '') + ' ' + (meta.title || '') + ' ' + (meta.ogDescription || '') + ' ' + (meta.headings || '');
  const t = bag.toLowerCase();
  const set = new Set();
  const add = (x) => { if (x && set.size < 12) set.add(x); };
  const has = (w) => t.includes(w);
  if (has('chat') || has('assistant') || has('convers')) add('chatbot');
  if (has('code') || has('developer') || has('programming') || has('ide')) add('developer-tools');
  if (has('image') || has('photo') || has('art') || has('visual')) add('image');
  if (has('video')) add('video');
  if (has('audio') || has('voice') || has('music')) add('audio');
  if (has('speech') || has('tts') || has('stt')) add('speech');
  if (has('translate') || has('translation') || has('multilingual')) add('translation');
  if (has('summar') || has('outline')) add('summarization');
  if (has('search') || has('retrieval') || has('rag')) add('search');
  if (has('agent') || has('autonom')) add('agents');
  if (has('workflow') || has('automation')) add('automation');
  if (has('notebook') || has('jupyter')) add('notebooks');
  if (has('education') || has('learn') || has('study')) add('education');
  if (has('marketing') || has('seo') || has('copy')) add('marketing');
  if (has('design') || has('ui') || has('ux')) add('design');
  if (has('pdf') || has('document')) add('documents');
  if (has('api')) add('api');
  if (has('open source') || has('opensource') || has('github')) add('open-source');
  return Array.from(set);
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
    const inferredTags = inferTagsFromMeta(meta);
    let iconUrl = '';
    const pick = meta.icons && meta.icons.find(h => /apple-touch-icon|icon/.test(h)) || meta.icons && meta.icons[0] || '';
    if (pick) { try { iconUrl = new URL(pick, origin).toString(); } catch {} }
    if (!iconUrl) iconUrl = `${origin}/favicon.ico`;
    return { description, iconUrl, inferredTags };
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
  // Build section default tag frequencies
  const sectionDefaults = new Map();
  for (const sec of sections){
    const slug = (sec.slug || sec.name || '').toLowerCase();
    const freq = new Map();
    for(const t of arr(sec.tools)){
      for(const tag of arr(t.tags)){
        const k = String(tag||'').toLowerCase(); if(!k) continue;
        freq.set(k, (freq.get(k)||0)+1);
      }
    }
    sectionDefaults.set(slug, Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k])=>k));
  }

  for (const sec of sections){
    for (const t of arr(sec.tools)){
      if (!isNonEmptyStr(t.link)) continue;
      const needsDesc = !isNonEmptyStr(t.description) || t.description.trim().length < 10;
      const needsIcon = !isNonEmptyStr(t.iconUrl);
      const needsTags = !Array.isArray(t.tags) || t.tags.length === 0;
      // Ensure schema fields present even if no network
      if (!('tags' in t)) t.tags = [];
      if (!('pros' in t)) t.pros = [];
      if (!('cons' in t)) t.cons = [];
      if (!('about' in t)) t.about = t.description || '';
      if (!(needsDesc || needsIcon || needsTags)) continue;
      const info = await enrichFromLink(t.link);
      if (needsDesc && isNonEmptyStr(info.description)) { t.description = info.description; t.about ||= info.description; updates++; }
      if (needsIcon && isNonEmptyStr(info.iconUrl)) { t.iconUrl = info.iconUrl; updates++; }
      if (needsTags) {
        const slug = (sec.slug || sec.name || '').toLowerCase();
        const defaults = sectionDefaults.get(slug) || [];
        const tags = Array.from(new Set([...(info.inferredTags||[]), ...defaults])).slice(0,8);
        if (tags.length) { t.tags = tags; updates++; }
      }
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
