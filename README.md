### Step 1: Create a New Modal for Prompt Input

Add the following HTML for the modal to your existing `index.html` file:

```html
## Popularity data pipeline (counts and ranks)

The UI can show either:

This folder includes a lightweight, tokenless updater that collects public signals and generates the file the app already reads: `public/popularity.json`.

### Files

### Run the updater
## AI Atlas: Popularity and Discovery

This project powers a lightweight SPA that lists AI tools by domain, shows popularity, and lets users save favorites. Two background pipelines keep the data fresh, plus an admin export:
- Popularity refresh (daily): computes counts and ranks from public signals
- Tool discovery (every 3 days): proposes new tools and opens a PR for review
- Firestore export (on demand): exports approved tools from Firestore into `public/tools.json`

The UI shows a badge for each tool:
- "N users" when an explicit numeric count is known
- Otherwise "Rank #N" derived from popularity signals
- Fallback to "N/A" if neither is available

---

## Exclusion policy: GitHub-hosted links

This site hides tools whose primary link points to GitHub (for example, repository README pages) to reduce noise from non-web apps and repos. One exception is allowlisted:

- Allowlisted: "GitHub Copilot"

Where enforced
- UI: On load, the app filters out any tool whose link host is github.com unless its name is allowlisted.
- Discovery: `scripts/discover-tools.mjs` skips candidates with github.com links unless allowlisted; it also reports `skips.githubHost` in diagnostics.
- Draft publishing: `scripts/publish-drafts.mjs` skips drafts with github.com links unless allowlisted.

Change the allowlist
- Search for the constant (case-insensitive names):
   - In UI (`public/index.html`): `const ALLOWLIST_GITHUB_NAMES = new Set([ 'github copilot' ])`
   - In scripts: `ALLOWLIST_GITHUB_NAMES`
- Add another tool name in lowercase to the set(s) if you want to allow a specific GitHub-hosted tool.

Rationale
- Many GitHub repos are libraries or CLIs rather than ready-to-use web tools, which created confusion in domain listings. Hiding them by default keeps the catalog focused. The allowlist provides a narrow escape hatch for special cases.

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

---

## Firestore → tools.json exporter (admin)

Source of truth is Firestore (`tools` collection). When you approve/add tools in the Admin panel, run this exporter to regenerate the static catalog consumed by the SPA:

Run locally (Windows PowerShell)
- Set service account once per session:
   - `$Env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\path\\to\\service-account.json"`
- Export:
   - `npm run export:tools`

Advanced
- Custom key path: `node scripts/export-tools.mjs --key C:\\path\\to\\service-account.json`
- Custom output: `node scripts/export-tools.mjs --out public/tools.json`
- Allow empty (if no tools in Firestore): add `--allow-empty`

Notes
- The exporter keeps your current domain list (name, slug, icon, description) and order from `public/tools.json` when present, and fills tools from Firestore by `domainSlug`.
- Tools with a GitHub link are excluded by policy, except allowlisted names (e.g., "GitHub Copilot").
- Unknown domain slugs get appended at the end with a generated title; you can curate later.

### Backfill Firestore from tools.json (optional)

If you already have a curated `public/tools.json` and want Firestore to match it, run the importer:

Local (Windows PowerShell)
- `$Env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\path\\to\\service-account.json"`
- `npm run import:tools`

Options
- Dry run (no writes): `node scripts/import-tools-from-json.mjs --dry-run`
- Custom key: `node scripts/import-tools-from-json.mjs --key C:\\path\\to\\service-account.json`

Notes
- The importer enforces the GitHub link exclusion policy (allowlists GitHub Copilot).
- It sets `status: "active"` and uses each section’s `slug` as `domainSlug`.
- It avoids duplicates using normalized `name + domainSlug`.

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

Actions summary visibility
- Each discovery run writes a config line in the GitHub Actions job summary:
   - Config: Safe Browsing key: present/absent · Strict mode: on/off
- Use this to confirm your secret/variable is being picked up.

Strict mode source (CI)
- The workflow reads RELIABILITY_STRICT from either:
   1) Actions Secret RELIABILITY_STRICT (preferred if defined), or
   2) Actions Variable RELIABILITY_STRICT (fallback)
- Tip: When pasting values in the UI, extra spaces/newlines are ignored by the script.

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

---

## Admin role (full CRUD)

Admins are granted full read/write access to Firestore using a custom claim (request.auth.token.admin = true). Regular users can only access their own data. This is enforced by `security-rules.txt`.

Steps:

1) Deploy the rules in Firebase Console (Firestore → Rules) using the contents of `security-rules.txt`.

2) Assign the admin claim to a user with the Admin SDK script:

    - Create a Firebase service account JSON (Firebase Console → Project settings → Service accounts) and download it.
    - Set an env var to point at it:
       - PowerShell: `$Env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\path\\to\\service-account.json"`
    - Run one of:
       - `npm run admin:set -- --uid <UID>`
       - `npm run admin:set -- --email <email@example.com>`

    The script sets the claim `{ admin: true }` for that user.

3) Client notes:
    - The client writes only `profile` fields on sign-in; it does not set or overwrite the `role` field.
    - Access control is claim-based (rules read `request.auth.token.admin`). If you want to show a role label in UI, you may store `role: "admin"` in Firestore for display only.

Troubleshooting:
- After setting claims, sign out and sign back in to refresh the ID token.
- Ensure your site’s domain is in Firebase Auth → Settings → Authorized domains (for GitHub Pages/Netlify).