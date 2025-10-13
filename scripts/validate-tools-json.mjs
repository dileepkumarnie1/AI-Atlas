#!/usr/bin/env node
import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const toolsPath = path.join(root, 'public', 'tools.json');
const configPath = path.join(root, '.github', 'tools-validation.json');
const BASELINE_REF = process.env.BASELINE_REF || 'origin/main';

function isNonEmptyStr(s){ return typeof s === 'string' && s.trim().length > 0; }
function arr(a){ return Array.isArray(a) ? a : []; }
function norm(s){ return String(s||'').trim().toLowerCase(); }
function secKey(sec){ return norm(sec.slug || sec.name || ''); }
function toolKey(sec, t){ return `${secKey(sec)}::${norm(t?.name)}`; }

function loadBaselineFromGit(){
  try{
    const raw = execSync(`git show ${BASELINE_REF}:public/tools.json`, { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
    const json = JSON.parse(raw);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

async function main(){
  const raw = await fs.readFile(toolsPath, 'utf8');
  const sections = JSON.parse(raw);
  // Build baseline key set to identify new tools
  const baseline = loadBaselineFromGit();
  const baselineKeys = new Set();
  for (const s of baseline){ for (const t of arr(s.tools)) baselineKeys.add(toolKey(s, t)); }

  const issuesNew = [];
  const issuesLegacy = [];
  const ICON_CHECK = process.env.ICON_CHECK === '1';
  const HEAD_TIMEOUT_MS = Number(process.env.ICON_HEAD_TIMEOUT_MS || 3000);
  const concurrency = 12;
  const headQueue = [];
  async function headOk(url){
    try{
      const controller = new AbortController();
      const to = setTimeout(()=>controller.abort(), HEAD_TIMEOUT_MS);
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(to);
      return res.ok;
    }catch{ return false; }
  }
  for (const sec of sections){
    const secName = sec.slug || sec.name || 'unknown-section';
    for (const t of arr(sec.tools)){
      const tName = t?.name || 'unknown';
      const miss = [];
      if (!isNonEmptyStr(t.name)) miss.push('name');
      if (!isNonEmptyStr(t.link)) miss.push('link');
      if (!isNonEmptyStr(t.description)) miss.push('description');
      if (!('tags' in t) || !Array.isArray(t.tags) || t.tags.length === 0) miss.push('tags');
      if (!('about' in t) || !isNonEmptyStr(t.about)) miss.push('about');
      if (!('pros' in t) || !Array.isArray(t.pros)) miss.push('pros');
      if (!('cons' in t) || !Array.isArray(t.cons)) miss.push('cons');
      if (!('iconUrl' in t) || !isNonEmptyStr(t.iconUrl)) miss.push('iconUrl');
      let brokenIcon = false;
      if (ICON_CHECK && isNonEmptyStr(t.iconUrl)){
        const url = t.iconUrl.match(/^https?:/i) ? t.iconUrl : `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY || ''}/main/public/${t.iconUrl.replace(/^\/*/, '')}`;
        headQueue.push({ sec: secName, tool: tName, url, isNew: baselineKeys.size === 0 ? false : !baselineKeys.has(toolKey(sec, t)) });
      }
      const isNew = baselineKeys.size === 0 ? false : !baselineKeys.has(toolKey(sec, t));
      if (miss.length){
        const item = { section: secName, tool: tName, missing: miss };
        (isNew ? issuesNew : issuesLegacy).push(item);
      }
    }
  }
  // Process icon HEAD checks with simple concurrency cap
  if (ICON_CHECK && headQueue.length){
    let idx = 0; const brokenNew = []; const brokenLegacy = [];
    async function worker(){
      for(;;){
        const i = idx++; if (i >= headQueue.length) break;
        const item = headQueue[i];
        const ok = await headOk(item.url);
        if (!ok){ (item.isNew ? brokenNew : brokenLegacy).push({ section: item.sec, tool: item.tool, iconUrl: item.url }); }
        await delay(5);
      }
    }
    const workers = Array.from({ length: Math.min(concurrency, headQueue.length) }, () => worker());
    await Promise.all(workers);
    if (brokenNew.length || brokenLegacy.length){
      const lines = [];
      lines.push(`Icon HEAD failures — NEW: ${brokenNew.length}, LEGACY: ${brokenLegacy.length}`);
      for (const it of brokenNew.slice(0, 50)) lines.push(`- NEW [${it.section}] ${it.tool} icon not reachable`);
      for (const it of brokenLegacy.slice(0, 50)) lines.push(`- LEGACY [${it.section}] ${it.tool} icon not reachable`);
      const out = process.env.GITHUB_STEP_SUMMARY;
      if (out) await fs.appendFile(out, lines.join('\n')+'\n'); else console.log(lines.join('\n'));
      // Enforce only for NEW tools
      if (brokenNew.length) process.exit(1);
    }
  }
  const summaryLines = [];
  summaryLines.push('### Tools.json validation');
  const totalIssues = issuesNew.length + issuesLegacy.length;
  summaryLines.push(`New tools with issues: ${issuesNew.length}`);
  for (const it of issuesNew.slice(0, 100)){
    summaryLines.push(`- NEW [${it.section}] ${it.tool}: ${it.missing.join(', ')}`);
  }
  if (issuesNew.length > 100) summaryLines.push(`...and ${issuesNew.length - 100} more NEW.`);
  summaryLines.push(`Legacy tools with issues: ${issuesLegacy.length}`);
  for (const it of issuesLegacy.slice(0, 50)){
    summaryLines.push(`- LEGACY [${it.section}] ${it.tool}: ${it.missing.join(', ')}`);
  }
  if (issuesLegacy.length > 50) summaryLines.push(`...and ${issuesLegacy.length - 50} more LEGACY.`);
  // Determine strict mode with optional config grace period
  let strictAfter = '';
  try {
    const cfgRaw = await fs.readFile(configPath, 'utf8');
    const cfg = JSON.parse(cfgRaw);
    if (cfg && typeof cfg.strictAfter === 'string') strictAfter = cfg.strictAfter;
  } catch {}
  function strictActive(){
    if (process.env.STRICT === '0') return false;
    if (process.env.STRICT === '1') return true;
    if (strictAfter){
      const now = Date.now();
      const ts = Date.parse(strictAfter);
      if (!Number.isNaN(ts)){
        return now >= ts; // before the date -> GRACE; on/after -> ENFORCED
      }
    }
    return true; // default enforce if no config
  }
  const enforce = strictActive();
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (out){
    const header = [`Strict mode scope: NEW tools only`, `Strict mode: ${enforce ? 'ENFORCED' : 'GRACE'}${strictAfter ? ` (strictAfter=${strictAfter})` : ''}`].join(' \| ');
    await fs.appendFile(out, header + '\n' + summaryLines.join('\n') + '\n');
  } else {
    console.log(`Strict mode scope: NEW tools only`);
    console.log(`Strict mode: ${enforce ? 'ENFORCED' : 'GRACE'}${strictAfter ? ` (strictAfter=${strictAfter})` : ''}`);
    console.log(summaryLines.join('\n'));
  }
  // Enforce STRICT only for NEW tools; legacy issues are reported but do not fail
  if (enforce && issuesNew.length){
    process.exit(1);
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });
