#!/usr/bin/env node
// Dispatch and monitor GitHub Actions workflows (discover/export)
// Requires env: GITHUB_REPO=owner/repo, GITHUB_TOKEN=ghp_...

const WORKFLOW_MAP = {
  discover: 'discover-tools.yml',
  export: 'export-tools.yml'
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { workflows: ['discover', 'export'], ref: 'main', intervalSec: 10, timeoutMin: 30 };
  for (const a of args) {
    if (a.startsWith('--workflows=')) out.workflows = a.split('=')[1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    else if (a.startsWith('--ref=')) out.ref = a.split('=')[1].trim();
    else if (a.startsWith('--interval=')) out.intervalSec = Number(a.split('=')[1]);
    else if (a.startsWith('--timeout=')) out.timeoutMin = Number(a.split('=')[1]);
  }
  return out;
}

function envOrThrow(key) {
  const v = (process.env[key] || '').trim();
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}

async function dispatchWorkflow(repo, token, file, ref, inputs = {}) {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(file)}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'ai-atlas-cli'
    },
    body: JSON.stringify({ ref, inputs })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dispatch failed (${file}): ${res.status} ${text}`);
  }
}

async function getLatestRun(repo, token, file, branch = 'main') {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(file)}/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=1`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'ai-atlas-cli' } });
  if (!res.ok) throw new Error(`Failed to list runs: ${res.status}`);
  const j = await res.json();
  return (j.workflow_runs && j.workflow_runs[0]) || null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function monitorRun(repo, token, file, branch, intervalSec, timeoutMin) {
  const deadline = Date.now() + timeoutMin * 60 * 1000;
  while (Date.now() < deadline) {
    const run = await getLatestRun(repo, token, file, branch);
    if (run) {
      const { status, conclusion, html_url } = run;
      console.log(`[${file}] status=${status} conclusion=${conclusion || ''} ${html_url}`);
      if (status === 'completed') {
        return { status, conclusion: conclusion || 'unknown', url: html_url };
      }
    } else {
      console.log(`[${file}] no runs yet; waiting...`);
    }
    await sleep(intervalSec * 1000);
  }
  throw new Error(`Timeout waiting for ${file} to complete`);
}

async function main() {
  try {
    const { workflows, ref, intervalSec, timeoutMin } = parseArgs();
    const repo = envOrThrow('GITHUB_REPO');
    const token = envOrThrow('GITHUB_TOKEN');

    for (const wf of workflows) {
      const file = WORKFLOW_MAP[wf];
      if (!file) throw new Error(`Unknown workflow key: ${wf}`);
      console.log(`Dispatching ${wf} → ${file} on ${ref}...`);
      await dispatchWorkflow(repo, token, file, ref);
      console.log(`Dispatched ${wf}. Monitoring latest run...`);
      const res = await monitorRun(repo, token, file, ref, intervalSec, timeoutMin);
      console.log(`Completed ${wf}: ${res.conclusion.toUpperCase()} — ${res.url}`);
    }
  } catch (e) {
    console.error(String(e && e.message || e));
    process.exit(1);
  }
}

main();
