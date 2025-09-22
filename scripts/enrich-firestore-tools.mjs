#!/usr/bin/env node
/**
 * Enrich Firestore tools with missing description/iconUrl/about/tags.
 * Moves enrichment "left" so exporter can simply copy through.
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS pointing to a Firebase Admin key.
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function isNonEmptyStr(s){ return typeof s === 'string' && s.trim().length > 0; }
function arr(a){ return Array.isArray(a) ? a : []; }
function normalizeKey(s){ return String(s||'').trim().toLowerCase(); }

// Lightweight HTML meta extraction and text-based tag inference
function extractMeta(html){
  const out = {};
  const get = (re) => { const m = html.match(re); return m && m[1] ? m[1].trim() : ''; };
  out.title = get(/<title[^>]*>([^<]*)<\/title>/i);
  out.description = get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)
                 || get(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)
                 || get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  out.keywords = get(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const icons = [];
  const linkRe = /<link[^>]+rel=["']([^"']+)["'][^>]+href=["']([^"']+)["'][^>]*>/ig;
  let lm; while ((lm = linkRe.exec(html))){ const rel = lm[1].toLowerCase(); const href = lm[2]; if (/(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/.test(rel)) icons.push(href); }
  out.icons = icons;
  const ogImg = get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (ogImg) out.ogImage = ogImg;
  // Grab visible headings for tag cues
  const headingMatches = html.match(/<(h1|h2|h3)[^>]*>(.*?)<\/\1>/ig) || [];
  out.headings = headingMatches.map(h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim()).join(' ').toLowerCase();
  return out;
}

function keywordsFromMeta(meta){
  const bag = (meta.keywords || '') + ' ' + (meta.title || '') + ' ' + (meta.description || '') + ' ' + (meta.headings || '');
  const t = bag.toLowerCase();
  const tagSet = new Set();
  const add = (tag) => { if (tag && tagSet.size < 12) tagSet.add(tag); };
  const has = (w) => t.includes(w);
  // Heuristics
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
  return Array.from(tagSet);
}

function buildDomainDefaultTags(sections){
  // Build defaults from existing catalog: pick most common tags within each section
  const map = new Map(); // slug -> [tags]
  for(const sec of sections){
    const slug = normalizeKey(sec.slug || sec.name);
    const freq = new Map();
    for(const t of arr(sec.tools)){
      for(const tag of arr(t.tags)){
        const k = normalizeKey(tag);
        if(!k) continue;
        freq.set(k, (freq.get(k)||0)+1);
      }
    }
    const top = Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k])=>k);
    if(top.length) map.set(slug, top);
  }
  return map;
}

async function enrichFromLink(link){
  const controller = new AbortController();
  const to = setTimeout(()=>controller.abort(), 8000);
  try{
    const res = await fetch(link, { signal: controller.signal, headers: { 'user-agent': 'ai-atlas-enricher/1.0' } });
    const url = new URL(link);
    const origin = url.origin;
    const html = await res.text();
    const meta = extractMeta(html || '');
    let description = meta.description || meta.title || '';
    let iconUrl = '';
    const pick = (meta.icons && meta.icons.find(h=>/apple-touch-icon|icon/.test(h))) || (meta.icons && meta.icons[0]) || '';
    if (pick) { try { iconUrl = new URL(pick, origin).toString(); } catch {} }
    if (!iconUrl) iconUrl = `${origin}/favicon.ico`;
    return { meta, description, about: description, iconUrl };
  } catch {
    try { return { meta: {}, description: '', about: '', iconUrl: new URL(link).origin + '/favicon.ico' }; }
    catch { return { meta: {}, description: '', about: '', iconUrl: '' }; }
  } finally { clearTimeout(to); }
}

async function readCatalogSections(){
  try{
    const file = path.join(process.cwd(), 'public', 'tools.json');
    const raw = await fs.readFile(file, 'utf8');
    const sections = JSON.parse(raw);
    return Array.isArray(sections) ? sections : [];
  } catch { return []; }
}

async function main(){
  const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!KEY) { console.error('GOOGLE_APPLICATION_CREDENTIALS not set'); process.exit(1); }
  let sa; try { sa = JSON.parse(await fs.readFile(KEY, 'utf8')); } catch { console.error('Failed to read service account file'); process.exit(1); }
  initializeApp({ credential: cert(sa) });
  const db = getFirestore();

  const sections = await readCatalogSections();
  const domainDefaults = buildDomainDefaultTags(sections);

  const snap = await db.collection('tools').where('status', '==', 'active').get();
  console.log(`Enriching ${snap.size} active tool(s) in Firestore...`);
  let touched = 0;

  // Limit concurrency
  const docs = snap.docs;
  const batchSize = 8;
  for (let i=0; i<docs.length; i+=batchSize){
    const part = docs.slice(i, i+batchSize);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(part.map(async d => {
      const data = d.data();
      const updates = {};
      const missingDesc = !isNonEmptyStr(data.description) || String(data.description).trim().length < 10;
      const missingIcon = !isNonEmptyStr(data.iconUrl);
      const missingAbout = !isNonEmptyStr(data.about);
      const missingTags = !Array.isArray(data.tags) || data.tags.length === 0;
      if (!(missingDesc || missingIcon || missingAbout || missingTags)) return;
      const info = await enrichFromLink(data.link);
      if (missingDesc && isNonEmptyStr(info.description)) updates.description = info.description;
      if (missingAbout && isNonEmptyStr(info.about)) updates.about = info.about;
      if (missingIcon && isNonEmptyStr(info.iconUrl)) updates.iconUrl = info.iconUrl;
      if (missingTags) {
        const slug = normalizeKey(data.domainSlug || '');
        const inferred = keywordsFromMeta(info.meta);
        const defaults = domainDefaults.get(slug) || [];
        const tags = Array.from(new Set([...(inferred||[]), ...defaults])).slice(0, 8);
        if (tags.length) updates.tags = tags;
      }
      if (Object.keys(updates).length){
        updates.enrichedAt = new Date().toISOString();
        try { await d.ref.update(updates); touched++; }
        catch (e) { console.warn('Failed to update', d.id, e.message); }
      }
    }));
  }
  console.log(`Enrichment complete. Updated ${touched} document(s).`);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
