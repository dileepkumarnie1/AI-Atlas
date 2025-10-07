#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Robust root resolution (handles Windows drive letters properly)
const __file = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__file), '..');
const toolsPath = path.join(root, 'public', 'tools.json');
const schemaPath = path.join(root, 'schema', 'tools.schema.json');

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
  if (!fs.existsSync(toolsPath)) {
    console.error(`tools.json not found at ${toolsPath}`);
    process.exit(2);
  }
  if (!fs.existsSync(schemaPath)) {
    console.error(`Schema not found at ${schemaPath}`);
    process.exit(2);
  }
  const schema = loadJSON(schemaPath);
  const data = loadJSON(toolsPath);
  const ajv = new Ajv({allErrors: true, strict: false});
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(data);
  if (!ok) {
    console.error('Schema validation failed:');
    for (const err of validate.errors || []) {
      console.error(` - ${err.instancePath || '(root)'} ${err.message} ${err.params ? JSON.stringify(err.params) : ''}`);
    }
    process.exit(1);
  }
  console.log('tools.json passed schema validation.');
}

main();
