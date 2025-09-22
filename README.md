### Step 1: Create a New Modal for Prompt Input

Add the following HTML for the modal to your existing `index.html` file:

```html
## Popularity data pipeline (counts and ranks)

The UI can show either:

This folder includes a lightweight, tokenless updater that collects public signals and generates the file the app already reads: `public/popularity.json`.

### Files

### Run the updater
## AI Atlas: Popularity and Discovery

This project powers a lightweight SPA that lists AI tools by domain, shows popularity, and lets users save favorites. Two background pipelines keep the data fresh:
- Popularity refresh (daily): computes counts and ranks from public signals
- Tool discovery (every 3 days): proposes new tools and opens a PR for review

The UI shows a badge for each tool:
- "N users" when an explicit numeric count is known
- Otherwise "Rank #N" derived from popularity signals
- Fallback to "N/A" if neither is available

---

## Popularity data pipeline

Generates both `public/popularity.json` (counts) and `public/popularity_ranks.json` (ranks) consumed by the app.

Files
- `data/tools-sources.json` – sources per tool (GitHub repo, npm package)
- `data/popularity-overrides.json` – optional true counts: `{ "Tool": { "actualUsers": 123456 } }`
- `scripts/update-popularity.mjs` – updater script
- `data/popularity_raw.json` – generated audit of signals and scores
- `public/popularity.json` – generated counts map
- `public/popularity_ranks.json` – generated rank map

Run locally (Windows PowerShell)
- npm run update:popularity

What it does
- Fetches GitHub stars/forks and npm weekly downloads (tokenless)
- Computes a combined popularity score and rank per tool
- Writes `public/popularity.json` and `public/popularity_ranks.json`

Automation (GitHub Actions)
- Workflow: `.github/workflows/update-popularity.yml`
- Schedule: daily at 03:17 UTC (cron: `17 3 * * *`)

Optional Windows scheduling (Task Scheduler)
1. Create Basic Task → Daily
2. Program/script: powershell.exe
3. Arguments:
   -NoLogo -NoProfile -Command "Set-Location -Path 'C:\\Users\\dilee\\Desktop\\AI_Projects\\Gemini\\AI_Atlas_new_format\\ver07\\ai-prompt-recommender'; npm run update:popularity"

---

## Automated tool discovery (every 3 days)

Goal: scan public sources for trending AI tools per domain, add a small curated set, and open a PR. Discovery covers all domain slugs present in `public/tools.json`.

Sources and heuristics
- GitHub search (stars threshold, topic/keyword filters)
- npm search
- Optional: Hacker News (Algolia)
- Domain-aware AI filters to reduce noise (e.g., exclude youtube-dl)

Files
- `scripts/discover-tools.mjs` – discovery and email
- `data/discovery-sources.json` – per-domain search config and thresholds
- `data/discovery_log.json` – generated log of additions

Run locally (Windows PowerShell)
- npm run discover:tools

Automation (GitHub Actions)
- Workflow: `.github/workflows/discover-tools.yml`
- Schedule: every 3 days at 04:00 UTC (cron: `0 4 */3 * *`)
- Opens a PR if `public/tools.json`, `data/discovery_log.json`, or `data/pending-tools.json` changed

Email notifications (optional)
The discovery script can send a summary email when SMTP is configured. Emails are now sent in both HTML and plaintext:
- HTML: grouped by domain, with clickable tool names, reasons, and links.
- Plaintext: readable fallback for clients that strip HTML.

Configure GitHub Actions secrets
- SMTP_HOST – e.g., smtp.gmail.com or your provider
- SMTP_PORT – typically 587 (TLS) or 465 (SSL)
- SMTP_USER – the SMTP username (full email for many providers)
- SMTP_PASS – the SMTP password or app-specific password
- TO_EMAIL – recipient (your address)

Configure locally in Windows PowerShell (one session)
- $env:SMTP_HOST = "smtp.example.com"
- $env:SMTP_PORT = "587"
- $env:SMTP_USER = "user@example.com"
- $env:SMTP_PASS = "app-password-or-token"
- $env:TO_EMAIL   = "your@email.com"
Then run: npm run discover:tools

Test email (local)
- npm run email:test — sends a small HTML + plaintext test message.

Test email (CI)
- Actions → "Send Test Email" → Run workflow — uses the same SMTP_* secrets.

Troubleshooting
-
### Reliability checks (spam/scam safety)

Before any discovered tool is staged or published, the script performs basic reliability checks and will skip items deemed risky. Signals used:

- Link integrity and HTTPS (https gets a small boost; invalid links are penalized)
- Host signals: trusted doc/repo/package hosts (e.g., github.com, npmjs.com, huggingface.co) boost score; BAD_HOSTS can be extended to blacklist domains
- GitHub stars thresholds add confidence
- npm weekly downloads add confidence (queried via api.npmjs.org)
- Hacker News popularity (>=100 points) adds a mild boost
- Optional Google Safe Browsing (GSB) URL check; if a match is found, the tool is marked risky and skipped

Verdicts
- safe: allowed
- unknown: allowed by default; set RELIABILITY_STRICT=true to skip these
- risky: always skipped

Configuration
- GOOGLE_SAFEBROWSING_API_KEY (secret): if set, GSB is queried to detect known unsafe URLs
- RELIABILITY_STRICT (env/CI variable): set to "true" to only allow tools with a safe verdict

Local testing (PowerShell)
- $env:GOOGLE_SAFEBROWSING_API_KEY = "your-key"  # optional
- $env:RELIABILITY_STRICT = "true"               # optional
- npm run discover:tools

CI setup
- Add GOOGLE_SAFEBROWSING_API_KEY to Actions Secrets
- Add RELIABILITY_STRICT to Actions Variables (e.g., true)

- Missing env vars: scripts will print which variables are missing.
- Gmail: enable 2FA and use an App Password with smtp.gmail.com:587.
- Outlook/Office365: smtp.office365.com:587; consider app passwords if required.
- If CI prints "Email not sent (SMTP env not configured)", ensure all SMTP_* and TO_EMAIL secrets are defined.

Note: The workflow installs nodemailer dynamically; the repo already depends on nodemailer@7 for local runs.

Local .env setup
- Copy `.env.example` to `.env` and fill in your SMTP details.
- You can send a quick test email:
   - npm run email:test
   - If it fails, it prints missing envs or SMTP errors to troubleshoot.

   Review flow: blacklist and drafts
   - Blacklist: add names to `data/blacklist.json` to permanently exclude items from discovery.
   - Drafts (default): discovery stages new candidates in `data/pending-tools.json` and logs them in `data/discovery_log.json`.
   - Publish drafts:
      - npm run drafts:publish
   - Clear drafts without publishing:
      - npm run drafts:clear
   - Check for potential duplicates before publishing:
      - npm run drafts:check
      - Optional thresholds:
         - JACCARD_MIN (default 0.5)
         - LEV_MAX (default 3)
   - Direct publish (skip drafts) – opt-in:
      - npm run discover:direct
      - This sets DIRECT_PUBLISH=true and writes directly to `public/tools.json`.

   Duplicate avoidance
   - The discovery pipeline avoids duplicates using strict and loose normalization (e.g., removing spaces/symbols) and also checks staged drafts.
   - You can add alias mappings in `data/aliases.json` to point alternate spellings to a canonical name (e.g., "open assistant" → "open-assistant").

---

## Tuning and curation tips
- Update `data/tools-sources.json` to improve popularity coverage
- Use `data/popularity-overrides.json` to inject real user counts
- Adjust `data/discovery-sources.json` to focus domains you care about most
- Review and merge the discovery PRs; consider a whitelist/blacklist if needed

## Troubleshooting
- If badges show N/A, ensure `public/popularity_ranks.json` exists (run the updater)
- If emails don’t arrive, verify SMTP secrets/vars and provider security settings
- If GitHub Actions PRs aren’t created, check if there were no changes in the run

---

## License

This project is dual-licensed under either:

- MIT License (see `LICENSE-MIT`)
- Apache License, Version 2.0 (see `LICENSE-APACHE`)

You may choose either license to govern your use of this software. The package metadata declares `"license": "(MIT OR Apache-2.0)"`.