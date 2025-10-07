#!/usr/bin/env node
/**
 * Archive non-product / article / library entries from public/tools.json
 * into public/non_product_archive.json instead of deleting them.
 *
 * Features:
 *  --dry-run : shows counts only, no file modifications
 *  --verbose : lists each archived name
 *
 * Archive file structure:
 * {
 *   archivedAt: ISO timestamp,
 *   removedCount: number,
 *   items: [ { originalCategorySlug, categoryIndex, tool } ]
 * }
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

const ROOT = path.resolve(process.cwd());
const TOOLS_PATH = path.join(ROOT, 'public', 'tools.json');
const ARCHIVE_PATH = path.join(ROOT, 'public', 'non_product_archive.json');

const BLOCKLIST = new Set([
  // Articles / news / commentary
  'Airfoil',
  'Bypassing airport security via SQL injection',
  'A privacy war is raging inside the W3C',
  'If you are good at code review, you will be good at using AI agents',
  'My AI skeptic friends are all nuts',
  'Open source AI is the path forward',
  'Learning to Reason with LLMs',
  'Copilot regurgitating Quake code, including sweary comments',
  'Kite – Programming Copilot',
  'Launch HN: Continue (YC S23) – Create custom AI code assistants',
  'Meta’s new text-to-video AI generator is like DALL-E for video',
  'Imagen Video: high definition video generation with diffusion models',
  'Stable Diffusion 2.0',
  'Stable Video Diffusion',
  '3D Gaussian Splatting as Markov Chain Monte Carlo',
  'AI for generative design: Plain text to 3D Designs',
  'DreamFusion: Text-to-3D using 2D Diffusion',
  'Onedrive is slow on Linux but fast with a “Windows” user-agent (2016)',
  'Why AutoGPT engineers ditched vector databases',
  'AI Content Generation, Part 1: Machine Learning Basics',
  'One AI Tutor Per Child: Personalized learning is finally here',
  "After OpenAI's blowup, it seems pretty clear that 'AI safety' isn't a real thing",
  'AI behavior guardrails should be public',
  'Concrete AI Safety Problems',
  'Freeway guardrails are now a favorite target of thieves',
  'Joint Statement on AI Safety and Openness',
  'Many AI safety orgs have tried to criminalize currently-existing open-source AI',
  'US and UK refuse to sign AI safety declaration at summit',
  'Airbnb’s design to live and work anywhere',
  'FAA K-12 Airport Design Challenge in Minecraft',
  'Figma disables AI app design tool after it copied Apple\'s weather app',
  'Paper Airplane Designs',
  'Paper Airplane Designs (2013)',
  'Agents raid home of fired Florida data scientist who built Covid-19 dashboard',
  // Research Papers
  'DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via RL',
  'TradingAgents: Multi-Agents LLM Financial Trading Framework',
  'CogVideo: Large-Scale Pretraining for Text-to-Video Generation via Transformers',
  'Financial Time Series Forecasting with Deep Learning: A Literature Review',
  'Deep Learning for Procedural Content Generation – a survey',
  // Developer libraries / packages (keep product-level platforms, move raw libs)
  '@ai-sdk/react','@ai-sdk/svelte','@ai-sdk/ui-utils','@assistant-ui/react','@bentwnghk/chat','@ckeditor/ckeditor5-ai','@edsamo/mysql-mcp-server','@google-cloud/orchestration-airflow','@guardrails-ai/core','@inkeep/create-agents','@inquirer/confirm','@inquirer/core','@inquirer/expand','@inquirer/rawlist','@kajidog/aivis-cloud-cli','@listr2/prompt-adapter-inquirer','@llamaindex/semtools','@lobehub/chat','@luckymachines/contracts','@openctx/provider-linear-issues','@pooltogether/uniform-random-number','@stdlib/constants-float32-exponent-bias','@stdlib/constants-float64-exponent-bias','@usgupta/circuitware-cli','@usgupta/circuitware-code','@voltagent/core','@wemake.cx/bias-detection','@wildcard-ai/deepcontext','@xynehq/jaf','ai-embed-search','airflow','beeai-framework','cc-model-switcher','claude-forge','ethical-algorithm-tester','fairseq','kapellmeister','llm-agents','n8n-nodes-comfyui-image-to-image','password-prompt','ssml-builder','supabase','tensaikit','tensaikit-test','threed-garden','workflow-ai-bot','workflow-ai-plugin','youtube-dl'
]);

function loadJson(p){return JSON.parse(fs.readFileSync(p,'utf-8'));}
function saveJson(p,obj){fs.writeFileSync(p, JSON.stringify(obj,null,2));}

function main(){
  if(!fs.existsSync(TOOLS_PATH)){
    console.error('Missing tools.json');
    process.exit(1);
  }
  let data = loadJson(TOOLS_PATH);
  if(!Array.isArray(data)){
    console.error('tools.json root must be an array of category objects');
    process.exit(1);
  }
  const archived = [];
  let removedCount = 0;
  data.forEach((cat, idx)=>{
    if(!cat || !Array.isArray(cat.tools)) return;
    const kept = [];
    for(const tool of cat.tools){
      if(tool && BLOCKLIST.has(tool.name)){
        removedCount++;
        archived.push({ originalCategorySlug: cat.slug || cat.name || 'unknown', categoryIndex: idx, tool });
        if(VERBOSE) console.log('[archive]', tool.name);
      } else {
        kept.push(tool);
      }
    }
    cat.tools = kept;
  });

  if(DRY){
    console.log(`Dry run: would archive ${removedCount} entries.`);
    return;
  }

  // Write updated tools
  saveJson(TOOLS_PATH, data);

  // Merge archive
  let archiveObj = { archivedAt: new Date().toISOString(), removedCount, items: archived };
  if(fs.existsSync(ARCHIVE_PATH)){
    try {
      const prev = loadJson(ARCHIVE_PATH);
      if(prev && Array.isArray(prev.items)){
        archiveObj.items = prev.items.concat(archiveObj.items);
        archiveObj.removedCount = archiveObj.items.length;
      }
    } catch(e){ /* ignore parse errors; start fresh */ }
  }
  saveJson(ARCHIVE_PATH, archiveObj);
  console.log(`Archived ${removedCount} entries to non_product_archive.json`);
}

// Entry point detection that works cross-platform (Windows path vs file URL)
const invokedDirectly = (() => {
  try {
    const urlPath = new URL(import.meta.url).pathname.replace(/\\/g,'/');
    const argv1 = path.resolve(process.argv[1] || '').replace(/\\/g,'/');
    return urlPath.endsWith(argv1.split('/').pop());
  } catch { return false; }
})();

if (invokedDirectly) {
  main();
}
