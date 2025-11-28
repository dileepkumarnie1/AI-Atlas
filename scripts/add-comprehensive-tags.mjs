#!/usr/bin/env node

/**
 * Add comprehensive tags to ALL tools based on their category and description
 * This ensures semantic search works for any query type
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOOLS_PATH = path.join(__dirname, '../public/tools.json');

// Category-to-tags mapping - comprehensive coverage
const CATEGORY_TAG_MAP = {
  'Language & Chat': ['chat', 'chatbot', 'conversational ai', 'language model', 'llm'],
  'Customer Support & Chatbots': ['chat', 'chatbot', 'customer support', 'support'],
  'Image Generation': ['image generation', 'ai art', 'text to image', 'image creator'],
  'Video Tools': ['video', 'video tool'],
  'Code Assistance': ['code', 'coding', 'programming', 'developer tool', 'code assistant'],
  'AI Developer Tools & APIs': ['code', 'developer tool', 'api', 'programming'],
  'Audio & Music': ['audio', 'music', 'sound'],
  'Voice & Speech AI': ['voice', 'speech', 'audio', 'tts'],
  'AI Voice Cloning & TTS': ['voice', 'voice cloning', 'tts', 'text to speech'],
  'Productivity': ['productivity', 'automation', 'workflow', 'efficiency'],
  'Workflow Automation': ['automation', 'workflow', 'productivity'],
  'Design Tools': ['design', 'graphic design', 'creative'],
  'Research': ['research', 'academic', 'research tool'],
  'Marketing & SEO': ['marketing', 'seo', 'advertising', 'digital marketing'],
  'Data Analysis': ['data', 'analytics', 'data analysis', 'data science'],
  '3D Modeling': ['3d', '3d modeling', '3d design'],
  'Education': ['education', 'learning', 'teaching'],
  'AI Writing Assistants': ['writing', 'writing assistant', 'content writing', 'writer'],
  'AI Paraphrasing & Rewriting': ['writing', 'rewriting', 'paraphrasing', 'text'],
  'Avatar & Virtual Influencer': ['avatar', 'virtual influencer', 'digital avatar'],
  'Translation & Localization': ['translation', 'translator', 'multilingual', 'localization'],
  'AI Transcription & Captioning': ['transcription', 'captions', 'subtitles', 'speech to text'],
  'AI Presentation Tools': ['presentation', 'slides', 'powerpoint'],
  'Meeting Assistants': ['meeting', 'meeting assistant', 'notes', 'meeting notes'],
  'Email Assistants': ['email', 'email assistant', 'email automation'],
  'AI Note-Taking & PKM': ['notes', 'note taking', 'pkm', 'knowledge management'],
  'Scheduling & Calendar': ['scheduling', 'calendar', 'appointment'],
  'Podcast Tools': ['podcast', 'audio', 'podcasting'],
  'AI Social Media Creation': ['social media', 'content creation', 'social'],
  'Social Media & Content': ['social media', 'content', 'social'],
  'Logo & Branding': ['logo', 'branding', 'logo design', 'brand identity'],
  'AI Photo Editing': ['photo editing', 'image editing', 'photo editor'],
  'AI Background Removal': ['background removal', 'image editing', 'photo editing'],
  'AI Screen Recording & Tutorials': ['screen recording', 'tutorial', 'video'],
  'AI Document Tools': ['document', 'pdf', 'document processing'],
  'AI Summarization Tools': ['summarization', 'summary', 'summarize'],
  'Legal & Compliance': ['legal', 'compliance', 'law'],
  'Healthcare & Medical AI': ['healthcare', 'medical', 'health'],
  'Finance & Accounting': ['finance', 'accounting', 'financial'],
  'AI Personal Finance': ['finance', 'personal finance', 'money'],
  'HR & Recruitment': ['hr', 'recruitment', 'hiring', 'human resources'],
  'Sales & CRM': ['sales', 'crm', 'sales tool'],
  'Gaming & Entertainment': ['gaming', 'entertainment', 'games'],
  'Cybersecurity': ['security', 'cybersecurity', 'cyber'],
  'E‑commerce & Retail': ['ecommerce', 'retail', 'shopping', 'commerce'],
  'Real Estate & PropTech': ['real estate', 'property', 'proptech'],
  'AI Travel & Booking': ['travel', 'booking', 'trip'],
  'AI Fitness & Wellness': ['fitness', 'wellness', 'health'],
  'AI Fashion & Styling': ['fashion', 'styling', 'style'],
  'AI Agriculture & Farming': ['agriculture', 'farming', 'agri'],
  'Knowledge Management': ['knowledge', 'knowledge management', 'organization'],
  'Search & Knowledge Discovery': ['search', 'knowledge', 'discovery'],
  'AI Form & Survey Builders': ['form', 'survey', 'form builder'],
  'AI Diagram & Flowchart Tools': ['diagram', 'flowchart', 'visualization'],
  'Ethical AI': ['ethical', 'ai ethics', 'responsible ai'],
  'AI Safety & Ethics': ['safety', 'ethics', 'ai safety']
};

// Keyword-based tag detection from descriptions
const KEYWORD_TAG_MAP = {
  'chat': ['chat', 'chatbot', 'conversational'],
  'code': ['code', 'coding', 'programming', 'developer'],
  'writing': ['writing', 'writer', 'content'],
  'video': ['video'],
  'image': ['image', 'photo', 'picture'],
  'audio': ['audio', 'sound', 'music'],
  'voice': ['voice', 'speech'],
  'design': ['design'],
  'productivity': ['productivity', 'efficient'],
  'automation': ['automat'],
  'translation': ['translat'],
  'transcription': ['transcrib'],
  'avatar': ['avatar'],
  'meeting': ['meeting'],
  'email': ['email'],
  'presentation': ['presentation', 'slides'],
  'summarization': ['summar'],
  'note': ['note taking', 'notes'],
  'research': ['research']
};

function addTagsToTool(tool, additionalTags) {
  let existingTags = tool.tags || [];
  if (typeof existingTags === 'string') {
    existingTags = [existingTags];
  }
  
  const existingLower = new Set(existingTags.map(t => String(t).toLowerCase().trim()));
  
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

function detectTagsFromDescription(description) {
  const tags = [];
  const desc = (description || '').toLowerCase();
  
  for (const [tag, keywords] of Object.entries(KEYWORD_TAG_MAP)) {
    if (keywords.some(kw => desc.includes(kw))) {
      tags.push(tag);
    }
  }
  
  return tags;
}

function processToolsData() {
  console.log('Reading tools.json...');
  const data = JSON.parse(fs.readFileSync(TOOLS_PATH, 'utf-8'));
  
  let updatedCount = 0;
  let totalTools = 0;
  
  for (const category of data) {
    const categoryTags = CATEGORY_TAG_MAP[category.name] || [];
    console.log(`\nProcessing category: ${category.name} (${category.tools.length} tools)`);
    
    if (categoryTags.length > 0) {
      console.log(`  Category tags: ${categoryTags.join(', ')}`);
    }
    
    for (const tool of category.tools) {
      totalTools++;
      
      // Combine category tags + detected tags from description
      const tagsToAdd = [
        ...categoryTags,
        ...detectTagsFromDescription(tool.description)
      ];
      
      if (tagsToAdd.length > 0 && addTagsToTool(tool, tagsToAdd)) {
        updatedCount++;
        console.log(`  ✓ ${tool.name}: added ${tagsToAdd.length} tags`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`Summary:`);
  console.log(`  Total tools processed: ${totalTools}`);
  console.log(`  Tools updated with new tags: ${updatedCount}`);
  console.log('='.repeat(60));
  
  if (updatedCount > 0) {
    const backupPath = TOOLS_PATH + '.backup-' + Date.now();
    fs.copyFileSync(TOOLS_PATH, backupPath);
    console.log(`\nBackup created: ${backupPath}`);
    
    fs.writeFileSync(TOOLS_PATH, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Updated tools.json written successfully!`);
  } else {
    console.log('\nNo updates needed - all tools already have appropriate tags.');
  }
}

try {
  processToolsData();
} catch (error) {
  console.error('Error processing tools:', error);
  process.exit(1);
}
