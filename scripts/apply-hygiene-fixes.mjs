import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd());
const PUBLIC_DIR = path.join(root, 'public');
const DATA_DIR = path.join(root, 'data');
const TOOLS_JSON_PATH = path.join(PUBLIC_DIR, 'tools.json');
const SUGGESTIONS_JSON_PATH = path.join(DATA_DIR, 'hygiene-suggestions.json');

const LIMIT_ICONS_MISSING = Number(process.env.LIMIT_ICONS_MISSING || 5);
const LIMIT_ICONS_LOWQ = Number(process.env.LIMIT_ICONS_LOWQ || 5);
const LIMIT_MOVES = Number(process.env.LIMIT_MOVES || 5);
const LIMIT_DEDUP = Number(process.env.LIMIT_DEDUP || 3);

function normalizeKey(s){ return String(s||'').trim().toLowerCase(); }

function getHostname(link){
  try { return new URL(String(link||'')).hostname; } catch { return ''; }
}

// Build a resilient fallback icon URL given a tool link
function buildFallbackIcon(link, size=64){
  const host = getHostname(link);
  if(!host) return '';
  const s2 = `https://www.google.com/s2/favicons?domain=${host}&sz=${size}`;
  const duck = `https://icons.duckduckgo.com/ip3/${host}.ico`;
  // Prefer Google S2 (PNG, consistent), then DuckDuckGo
  return s2 || duck;
}

function findSection(db, sectionId){
  const sid = String(sectionId||'').trim();
  const sidNorm = normalizeKey(sid);
  return db.find(sec => normalizeKey(sec.slug||'') === sidNorm || normalizeKey(sec.name||'') === sidNorm || String(sec.slug||sec.name||'') === sid);
}

function findToolIndexByName(sec, name){
  const k = normalizeKey(name);
  const tools = Array.isArray(sec.tools) ? sec.tools : [];
  for(let i=0;i<tools.length;i++){
    const t = tools[i];
    if(normalizeKey(t?.name) === k) return i;
  }
  return -1;
}

async function main(){
  const toolsRaw = await fs.readFile(TOOLS_JSON_PATH, 'utf8');
  const db = JSON.parse(toolsRaw);
  const sugRaw = await fs.readFile(SUGGESTIONS_JSON_PATH, 'utf8');
  const suggestions = JSON.parse(sugRaw);

  let changes = 0;

  // 1) Fix missing icons (up to limit)
  const missing = (suggestions.icons?.missing || []).slice(0, LIMIT_ICONS_MISSING);
  for(const m of missing){
    const sec = findSection(db, m.section);
    if(!sec) continue;
    const idx = findToolIndexByName(sec, m.name);
    if(idx === -1) continue;
    // Choose recommendation; if absent, derive a safe fallback from the tool link
    let rec = String(m.recommended||'').trim();
    if(!rec){
      rec = buildFallbackIcon(sec.tools[idx]?.link);
    }
    if(!rec) continue;
    if(!sec.tools[idx].iconUrl || sec.tools[idx].iconUrl !== rec){
      sec.tools[idx].iconUrl = rec;
      changes++;
    }
  }

  // 2) Replace low-quality icons (up to limit)
  const lowq = (suggestions.icons?.lowQuality || []).slice(0, LIMIT_ICONS_LOWQ);
  for(const l of lowq){
    const sec = findSection(db, l.section);
    if(!sec) continue;
    const idx = findToolIndexByName(sec, l.name);
    if(idx === -1) continue;
    // Prefer recommended; else any candidate; else fallback from link
    let rec = String(l.recommended||'').trim();
    if(!rec){
      const candidates = Array.isArray(l.candidates) ? l.candidates : [];
      rec = String(candidates.find(u => String(u||'').trim())||'').trim();
    }
    if(!rec){
      rec = buildFallbackIcon(sec.tools[idx]?.link);
    }
    if(!rec) continue;
    if(sec.tools[idx].iconUrl !== rec){
      sec.tools[idx].iconUrl = rec;
      changes++;
    }
  }

  // 3) Move GitHub links into GitHub domain section (up to limit)
  const moves = (suggestions.moves || []).slice(0, LIMIT_MOVES);
  const targetSec = findSection(db, suggestions.githubDomainSlug || 'GitHub AI Projects');
  for(const mv of moves){
    if(!targetSec) break;
    const fromSec = findSection(db, mv.from);
    if(!fromSec) continue;
    const idx = findToolIndexByName(fromSec, mv.name);
    if(idx === -1) continue;
    const tool = fromSec.tools[idx];
    // If target already has the tool (by name), skip adding
    if(findToolIndexByName(targetSec, mv.name) === -1){
      targetSec.tools = Array.isArray(targetSec.tools) ? targetSec.tools : [];
      targetSec.tools.push(tool);
    }
    // Remove from source section
    fromSec.tools.splice(idx, 1);
    changes++;
  }

  // 4) Deduplicate (remove extras beyond keep), preserve Most Popular if present
  const dedups = (suggestions.duplicates || []).slice(0, LIMIT_DEDUP);
  for(const d of dedups){
    for(const rem of (d.remove||[])){
      const sec = findSection(db, rem.section);
      if(!sec) continue;
      const idx = findToolIndexByName(sec, d.name);
      if(idx !== -1){
        sec.tools.splice(idx, 1);
        changes++;
      }
    }
  }

  // 5) Final pass: ensure every tool has some icon. If missing, use fallback from its link
  for(const sec of db){
    const tools = Array.isArray(sec.tools) ? sec.tools : [];
    for(const t of tools){
      if(!t) continue;
      const hasIcon = Boolean(String(t.iconUrl||'').trim());
      if(!hasIcon){
        const fb = buildFallbackIcon(t.link);
        if(fb){ t.iconUrl = fb; changes++; }
      }
    }
  }

  if(changes > 0){
    await fs.writeFile(TOOLS_JSON_PATH, JSON.stringify(db, null, 2));
    console.log(`Applied ${changes} change(s) and wrote tools.json`);
  }else{
    console.log('No changes applied');
  }
}

main().catch(err=>{ console.error(err); process.exit(1); });
