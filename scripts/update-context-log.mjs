#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv){
  const args = { _: [] };
  for(let i = 2; i < argv.length; i++){
    const token = argv[i];
    if(!token.startsWith('--')){
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i+1];
    if(next && !next.startsWith('--')){
      if(args[key] === undefined){
        args[key] = next;
      }else if(Array.isArray(args[key])){
        args[key].push(next);
      }else{
        args[key] = [args[key], next];
      }
      i++;
    }else{
      args[key] = true;
    }
  }
  return args;
}

function normalizeEntries(raw){
  const ensureArray = (val) => {
    if(val === undefined || val === null) return [];
    return Array.isArray(val) ? val : [val];
  };
  const entries = [];
  const seen = new Set();
  for(const block of ensureArray(raw)){
    if(typeof block !== 'string') continue;
    for(const line of block.split(/\r?\n/)){
      const trimmed = line.trim();
      if(!trimmed) continue;
      if(seen.has(trimmed)) continue;
      seen.add(trimmed);
      entries.push(trimmed);
    }
  }
  return entries;
}

async function readAdditionalEntries(file){
  if(!file) return [];
  const filePath = path.resolve(process.cwd(), file);
  try{
    const contents = await fs.readFile(filePath, 'utf8');
    return normalizeEntries(contents);
  }catch(err){
    throw new Error(`Unable to read summary file at ${filePath}: ${err.message}`);
  }
}

function updateLastUpdated(content, date){
  if(!/_Last updated:\s*/i.test(content)){
    return content.replace('# Context Log', `# Context Log\n\n_Last updated: ${date}_`);
  }
  return content.replace(/_Last updated:[^\n]*_/i, `_Last updated: ${date}_`);
}

function insertOrUpdateRecentChanges(section, date, entries){
  const lines = section.split('\n');
  const targetHeading = `### ${date}`;
  const headingIndex = lines.findIndex(line => line.trim() === targetHeading);

  const prepareEntryLines = () => entries.map(entry => `- ${entry}`);

  if(headingIndex !== -1){
    let insertStart = headingIndex + 1;
    while(insertStart < lines.length && lines[insertStart].trim() === '') insertStart++;
    let insertEnd = insertStart;
    while(insertEnd < lines.length){
      const trimmed = lines[insertEnd].trim();
      if(trimmed.startsWith('### ') || trimmed.startsWith('## ')) break;
      insertEnd++;
    }
    const existingEntries = new Set();
    for(let i = insertStart; i < insertEnd; i++){
      const trimmed = lines[i].trim();
      if(trimmed.startsWith('- ')){
        existingEntries.add(trimmed.slice(2).trim());
      }
    }
    const newLines = [];
    for(const entry of entries){
      if(!existingEntries.has(entry)){
        newLines.push(`- ${entry}`);
        existingEntries.add(entry);
      }
    }
    if(newLines.length > 0){
      if(insertStart === insertEnd){
        lines.splice(insertStart, 0, ...newLines, '');
      }else{
        lines.splice(insertEnd, 0, ...newLines);
      }
    }
    return lines.join('\n');
  }

  // Insert new block just after the section heading.
  const insertionBlock = ['', targetHeading, ...prepareEntryLines(), ''];
  let insertPos = 1;
  while(insertPos < lines.length && lines[insertPos].trim() === '') insertPos++;
  lines.splice(insertPos, 0, ...insertionBlock);
  return lines.join('\n');
}

function ensureSection(content, date, entries){
  const sectionHeader = '## Recent Changes';
  const sectionStart = content.indexOf(sectionHeader);
  const block = `## Recent Changes\n\n### ${date}\n${entries.map(e => `- ${e}`).join('\n')}\n`;
  if(sectionStart === -1){
    return `${content.trimEnd()}\n\n${block}\n`;
  }
  const after = content.slice(sectionStart);
  const nextSectionIdx = after.indexOf('\n## ');
  const currentSection = nextSectionIdx === -1 ? after : after.slice(0, nextSectionIdx);
  const remainder = nextSectionIdx === -1 ? '' : after.slice(nextSectionIdx);
  const updatedSection = insertOrUpdateRecentChanges(currentSection, date, entries);
  return content.slice(0, sectionStart) + updatedSection + remainder;
}

async function main(){
  const args = parseArgs(process.argv);
  const date = args.date ? String(args.date) : new Date().toISOString().slice(0, 10);
  const logPath = path.resolve(process.cwd(), args.path ?? 'docs/context-log.md');

  const valueBucket = [];
  const pushValue = (val) => {
    if(val === undefined || val === null) return;
    if(Array.isArray(val)){
      for(const item of val) pushValue(item);
      return;
    }
    valueBucket.push(String(val));
  };

  pushValue(args.entry);
  pushValue(args.entries);
  if(Array.isArray(args._)){
    for(const token of args._){
      pushValue(token);
    }
  }

  const directEntries = normalizeEntries(valueBucket);
  const fileEntries = await readAdditionalEntries(args.file || args.input);
  const entries = [...directEntries, ...fileEntries];
  if(entries.length === 0){
    console.error('No summary entries provided. Use --entry, positional text, or --file to supply content.');
    process.exit(1);
  }

  let content;
  try{
    content = await fs.readFile(logPath, 'utf8');
  }catch{
    const scaffold = `# Context Log\n\n_Last updated: ${date}_\n\n## Recent Changes\n\n### ${date}\n${entries.map(e => `- ${e}`).join('\n')}\n\n## Open Follow-ups\n- [ ] Pending review\n`;
    await fs.writeFile(logPath, scaffold, 'utf8');
    console.log(`Created new context log at ${logPath}`);
    return;
  }

  let updated = updateLastUpdated(content, date);
  updated = ensureSection(updated, date, entries);

  if(updated === content){
    console.log('Context log is already up to date.');
    return;
  }

  await fs.writeFile(logPath, updated.replace(/\r?\n/g, '\n'), 'utf8');
  console.log(`Updated context log at ${logPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
