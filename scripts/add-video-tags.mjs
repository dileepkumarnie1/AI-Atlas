#!/usr/bin/env node

/**
 * Add comprehensive video-specific tags to video tools
 * This improves search accuracy by ensuring all video tools have relevant tags
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOOLS_PATH = path.join(__dirname, '../public/tools.json');

// Mapping of tool names to additional tags they should have
const VIDEO_TOOL_TAGS = {
  // Video Editing Tools
  'Descript': ['video editing', 'audio editing', 'transcription', 'podcast'],
  'Veed.io': ['video editing', 'online editor', 'subtitles'],
  'InVideo': ['video editing', 'video creation', 'templates', 'marketing'],
  'Opus Clip': ['video editing', 'video repurposing', 'short form'],
  'Topaz Video AI': ['video editing', 'video enhancement', 'upscaling'],
  'Fliki': ['video editing', 'faceless video', 'youtube'],
  'Lumen5': ['video editing', 'article to video', 'marketing'],
  'Kapwing': ['video editing', 'online editor', 'collaborative', 'meme maker'],
  'CapCut': ['video editing', 'mobile', 'tiktok', 'short form'],
  'Clipchamp': ['video editing', 'microsoft', 'online editor'],
  'Animoto': ['video editing', 'templates', 'marketing'],
  'WeVideo': ['video editing', 'collaborative', 'cloud based'],
  'Simon Says': ['video editing', 'transcription', 'subtitles'],
  
  // Video Generation Tools
  'Runway': ['video generation', 'video editing', 'text to video', 'ai video'],
  'Runway Gen-3': ['video generation', 'video editing', 'professional', 'gen-3'],
  'Pika': ['video generation', 'text to video', 'image to video'],
  'Pika Labs': ['video generation', 'text to video', 'discord'],
  'Sora (OpenAI)': ['video generation', 'text to video', 'openai', 'realistic'],
  'Google Veo': ['video generation', 'text to video', 'google', 'deepmind'],
  'Kling (Kuaishou)': ['video generation', 'text to video', 'high definition', 'long form'],
  'Luma Dream Machine': ['video generation', 'text to video', 'cinematic'],
  'HunyuanVideo': ['video generation', 'text to video', 'open source'],
  'MAGI-1': ['video generation', 'autoregressive', 'open source'],
  'Kaiber': ['video generation', 'video effects', 'animation', 'artistic'],
  'Pictory': ['video generation', 'text to video', 'blog to video'],
  'Dreamina': ['video generation', 'image generation', 'tiktok'],
  
  // Avatar & Talking Head Tools
  'Synthesia': ['video generation', 'ai avatars', 'talking head', 'corporate'],
  'HeyGen': ['video generation', 'ai avatars', 'video translation', 'lip sync'],
  'D-ID': ['video generation', 'talking head', 'photo animation'],
  'DeepBrain AI': ['video generation', 'ai avatars', 'presentations'],
  
  // Specialty Video Tools
  'brainrot.js': ['video generation', 'meme', 'content creation', 'viral'],
  'LocalAI': ['video generation', 'self hosted', 'open source', 'privacy'],
  
  // Generic fallback for any tool in video category
  '_default': ['video', 'video tool']
};

// Synonym groups for normalization
const TAG_GROUPS = {
  editing: ['editing', 'editor', 'edit'],
  generation: ['generation', 'generator', 'generate', 'gen'],
  creation: ['creation', 'creator', 'create'],
  ai: ['ai', 'artificial intelligence', 'machine learning']
};

function normalizeTag(tag) {
  const lower = tag.toLowerCase().trim();
  // Already normalized if it matches a canonical form
  for (const [canonical, variants] of Object.entries(TAG_GROUPS)) {
    if (variants.includes(lower)) return canonical;
  }
  return lower;
}

function addTagsToTool(tool, additionalTags) {
  // Get existing tags
  let existingTags = tool.tags || [];
  if (typeof existingTags === 'string') {
    existingTags = [existingTags];
  }
  
  // Normalize existing tags to lowercase for comparison
  const existingLower = new Set(existingTags.map(t => t.toLowerCase().trim()));
  
  // Add new tags if they don't already exist
  const newTags = [];
  for (const tag of additionalTags) {
    const normalized = tag.toLowerCase().trim();
    if (!existingLower.has(normalized)) {
      newTags.push(tag);
      existingLower.add(normalized);
    }
  }
  
  if (newTags.length > 0) {
    tool.tags = [...existingTags, ...newTags];
    return true;
  }
  return false;
}

function processToolsData() {
  console.log('Reading tools.json...');
  const data = JSON.parse(fs.readFileSync(TOOLS_PATH, 'utf-8'));
  
  let updatedCount = 0;
  let videoToolsCount = 0;
  
  // Find Video Tools category
  for (const category of data) {
    if (category.slug === 'video-tools' || category.name === 'Video Tools') {
      console.log(`\nProcessing category: ${category.name} (${category.tools.length} tools)`);
      
      for (const tool of category.tools) {
        videoToolsCount++;
        const toolName = tool.name;
        
        // Get specific tags for this tool, or use default
        const tagsToAdd = VIDEO_TOOL_TAGS[toolName] || VIDEO_TOOL_TAGS['_default'];
        
        if (addTagsToTool(tool, tagsToAdd)) {
          updatedCount++;
          console.log(`  ✓ Updated ${toolName}: added ${JSON.stringify(tagsToAdd)}`);
        } else {
          console.log(`  - ${toolName}: already has all relevant tags`);
        }
      }
    }
  }
  
  // Also check for video tools in other categories
  console.log('\nChecking other categories for video-related tools...');
  for (const category of data) {
    if (category.slug !== 'video-tools' && category.name !== 'Video Tools') {
      for (const tool of category.tools) {
        const desc = (tool.description || '').toLowerCase();
        const name = (tool.name || '').toLowerCase();
        
        // Check if this tool should have video tags based on our mapping
        if (VIDEO_TOOL_TAGS[tool.name]) {
          const tagsToAdd = VIDEO_TOOL_TAGS[tool.name];
          if (addTagsToTool(tool, tagsToAdd)) {
            console.log(`  ✓ Added tags to ${tool.name} in ${category.name}: ${JSON.stringify(tagsToAdd)}`);
            updatedCount++;
          }
        }
        // If tool mentions video in name or description, ensure it has video tags
        else if (desc.includes('video') || name.includes('video')) {
          const existingTags = (tool.tags || []).map(t => String(t).toLowerCase());
          
          // Determine what kind of video tool it is
          let tagsToAdd = [];
          if (desc.includes('edit') || desc.includes('editor') || name.includes('edit')) {
            tagsToAdd = ['video', 'video editing'];
          } else if (desc.includes('generat') || desc.includes('creat') || desc.includes('text to video') || desc.includes('text-to-video')) {
            tagsToAdd = ['video', 'video generation'];
          } else if (!existingTags.includes('video') && !existingTags.includes('video tool')) {
            tagsToAdd = ['video'];
          }
          
          if (tagsToAdd.length > 0 && addTagsToTool(tool, tagsToAdd)) {
            console.log(`  ✓ Added tags to ${tool.name} in ${category.name}: ${JSON.stringify(tagsToAdd)}`);
            updatedCount++;
          }
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`Summary:`);
  console.log(`  Total video tools in Video Tools category: ${videoToolsCount}`);
  console.log(`  Tools updated with new tags: ${updatedCount}`);
  console.log('='.repeat(60));
  
  if (updatedCount > 0) {
    // Create backup
    const backupPath = TOOLS_PATH + '.backup-' + Date.now();
    fs.copyFileSync(TOOLS_PATH, backupPath);
    console.log(`\nBackup created: ${backupPath}`);
    
    // Write updated data
    fs.writeFileSync(TOOLS_PATH, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Updated tools.json written successfully!`);
  } else {
    console.log('\nNo updates needed - all tools already have appropriate tags.');
  }
}

// Run the script
try {
  processToolsData();
} catch (error) {
  console.error('Error processing tools:', error);
  process.exit(1);
}
