import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const toolsPath = path.resolve(__dirname, '..', 'public', 'tools.json');
const backupPath = path.resolve(__dirname, '..', 'public', 'tools.github-pruned.backup.json');

const ALLOWLIST_GITHUB_NAMES = new Set(['github copilot']);

function isGithubLink(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'github.com';
  } catch {
    return false;
  }
}

function main() {
  const raw = fs.readFileSync(toolsPath, 'utf8');
  const data = JSON.parse(raw);

  const removed = [];
  for (const section of data) {
    if (!section || !Array.isArray(section.tools)) continue;
    const kept = [];
    for (const t of section.tools) {
      const name = (t?.name || '').toLowerCase();
      const drop = isGithubLink(t?.link) && !ALLOWLIST_GITHUB_NAMES.has(name);
      if (drop) {
        removed.push({ section: section.name, name: t?.name, link: t?.link });
      } else {
        kept.push(t);
      }
    }
    section.tools = kept;
  }

  fs.writeFileSync(backupPath, raw);
  fs.writeFileSync(toolsPath, JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify({ removedTotal: removed.length, removed }, null, 2));
}

main();
