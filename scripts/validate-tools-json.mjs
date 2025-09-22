#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const toolsPath = path.join(root, 'public', 'tools.json');

function isNonEmptyStr(s){ return typeof s === 'string' && s.trim().length > 0; }
function arr(a){ return Array.isArray(a) ? a : []; }

async function main(){
  const raw = await fs.readFile(toolsPath, 'utf8');
  const sections = JSON.parse(raw);
  const issues = [];
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
      if (miss.length){
        issues.push({ section: secName, tool: tName, missing: miss });
      }
    }
  }
  const summaryLines = [];
  summaryLines.push('### Tools.json validation');
  if (issues.length === 0){
    summaryLines.push('All tools have required fields.');
  } else {
    summaryLines.push(`Found ${issues.length} tools with missing fields:`);
    for (const it of issues.slice(0, 100)){
      summaryLines.push(`- [${it.section}] ${it.tool}: ${it.missing.join(', ')}`);
    }
    if (issues.length > 100) summaryLines.push(`...and ${issues.length - 100} more.`);
  }
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (out){
    await fs.appendFile(out, summaryLines.join('\n') + '\n');
  } else {
    console.log(summaryLines.join('\n'));
  }
  // Do not fail the job by default; set STRICT=1 to enforce
  if (process.env.STRICT === '1' && issues.length){
    process.exit(1);
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });
