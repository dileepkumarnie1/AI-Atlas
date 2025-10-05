import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const toolsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'tools.json');

const json = fs.readFileSync(toolsPath, 'utf8');
const data = JSON.parse(json);
let flagged = 0;

for (const section of data) {
  if (!section || !Array.isArray(section.tools)) continue;
  for (const tool of section.tools) {
    const link = typeof tool?.link === 'string' ? tool.link : '';
    if (link.includes('npmjs.com')) {
      if (tool._commentedOut !== true) {
        tool._commentedOut = true;
        flagged += 1;
      }
    }
  }
}

fs.writeFileSync(toolsPath, JSON.stringify(data, null, 2) + '\n');
console.log(`Flagged ${flagged} npm tool entries.`);
