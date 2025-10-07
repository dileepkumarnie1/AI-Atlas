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
- Otherwise "#N" derived from popularity signals
- Fallback to "N/A" if neither is available

---

## Non-product archival workflow

Purpose: keep `public/tools.json` focused on real, user-facing AI products while preserving removed items in an auditable archive file.

Script: `scripts/archive-non-products.mjs`

Archive file: `public/non_product_archive.json`

Archive entry schema:
```
{
   archivedAt: ISO timestamp of last run that added entries,
   removedCount: total entries currently in archive,
   restoredAt?: ISO timestamp of last restore (if any),
   items: [
      {
         originalCategorySlug: string,
         categoryIndex: number,
         tool: { name, description, link, ... }
      }
   ]
}
```

### Modes

Archiving (default): removes any tool whose name is in the internal BLOCKLIST constant and appends it to the archive (unless already archived).

Restore: reinserts archived tools back into their original category index.

### Flags

`--dry-run`   : Show what would change without writing files.
`--verbose`   : Log each archived or restored name.
`--whitelist <file>` : JSON array of tool names to *never* archive even if on blocklist.
`--restore-all` : Restore all archived items (ignores blocklist).
`--restore <name1,name2>` : Restore only the specified comma-separated tool names.

Examples (PowerShell):
```
node scripts/archive-non-products.mjs --dry-run --whitelist data/whitelist.json
node scripts/archive-non-products.mjs --verbose --whitelist data/whitelist.json
node scripts/archive-non-products.mjs --restore-all --verbose
node scripts/archive-non-products.mjs --restore "fairseq,Airfoil" --dry-run
```

### Duplicate protection

The script skips re-archiving names already present in `non_product_archive.json` and reports a skipped count.

### Whitelist

File: `data/whitelist.json` (created empty). Add product names you want immune from blocklist removal.

### CI Automation

Workflow: `.github/workflows/archive-non-products.yml`

Dispatch inputs:
- apply (true/false): when false (default) runs dry-run
- whitelist: path to whitelist file (default `data/whitelist.json`)
- verbose: enable verbose logging
- restore_all: set true to restore everything
- restore_list: comma-separated names to restore (ignored if restore_all=true)

Run from GitHub → Actions → Archive Non-Product Tools → Run workflow.

If `apply=true` and changes occur, the workflow commits with message `chore: archive non-product tools (CI)`.

### Maintenance tips
- Review the BLOCKLIST periodically; move any legitimate products off it.
- Keep whitelist small—prefer pruning blocklist when appropriate.
- After a restore, consider adding the restored names to whitelist if you expect future blocklist hits.

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
   - In UI (`index.html`): `const ALLOWLIST_GITHUB_NAMES = new Set([ 'github copilot' ])`
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
- Normalizes signals across all tools to a 0–100 scale
- Computes a blended popularity score and rank per tool using these weights:
   - If `actualUsers` override exists: 60% usersScore + 30% curated “Most Popular” order + 10% normalized signals + small repeat bonus
   - Otherwise: 60% curated “Most Popular” order + 35% normalized signals + small repeat bonus
- Writes `public/popularity.json` and `public/popularity_ranks.json`

Automation (GitHub Actions)
- Workflow: `.github/workflows/update-popularity.yml`
- Schedule: daily at 07:00 IST (01:30 UTC) (cron: `30 1 * * *`)

### Setting real user counts (overrides)

Use `data/popularity-overrides.json` to inject real user counts that guide both display and ranking. Example:

```
{
   "ChatGPT (OpenAI)": { "actualUsers": 100000000 },
   "Gemini (Google)":   { "actualUsers": 50000000 },
   "Claude (Anthropic)":{ "actualUsers": 10000000 }
}
```

Notes
- The updater derives a usersScore (0–100) from `log10(actualUsers+1) * 20` and blends it into the final rank.
- Tools without overrides are still ranked via curated order and normalized signals.
- The UI shows the actual number when present; otherwise it shows “#N”.

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

Dry run (no network/emails)
- Set `DRY_RUN=true` to validate logic without calling external services or sending email. Useful for quick local checks.
   - PowerShell (one session): `$Env:DRY_RUN = "true"; npm run discover:tools`
   - Output will include `[dry-run]` notes and still write diagnostics to `data/discovery_report.json` without staging additions.

### Discovery tuning via environment variables

You can adjust discovery behavior without code changes using environment variables. Set them in CI or locally (PowerShell): `$Env:NAME = "value"` before running `npm run discover:tools`.

Global thresholds
- DISCOVERY_TRENDING_GH_STARS_MIN — default 1000
- DISCOVERY_TRENDING_GH_RECENT_DAYS — default 60
- DISCOVERY_TRENDING_NPM_DL_MIN — default 5000
- DISCOVERY_TRENDING_HN_POINTS_MIN — default 200
- DISCOVERY_TRENDING_HN_RECENT_DAYS — default 14
- DISCOVERY_PAGE_FRESHNESS_MAX_DAYS — default 90
- DISCOVERY_GITHUB_SEARCH_RECENT_DAYS — default 180
 - DISCOVERY_HN_POINTS_MIN — default 100 (fallback when reading Hacker News)
 - DISCOVERY_HN_RECENT_DAYS — default 14 (fallback when reading Hacker News)
 - DISCOVERY_RELAX_MAX_PASSES — default 2 (extra relaxed passes when a domain is underfilled)
 - DISCOVERY_RELAX_MIN_SCORE — default 1 (page-classifier score threshold in relaxed passes)
 - DISCOVERY_RELAX_ALLOW_UNKNOWN — default true (allow reliability verdict "unknown" in relaxed passes; set false to require "safe")

Per-domain overrides (format)
- DISCOVERY_<DOMAIN>_GITHUB_STARS_MIN — overrides stars filter for GitHub search
- DISCOVERY_<DOMAIN>_AIXPLORIA_STRICT — one of: hard | soft | true | false
- DISCOVERY_<DOMAIN>_AIXPLORIA_SIZE — number of items to fetch per category (default 30)
 - DISCOVERY_<DOMAIN>_HN_POINTS_MIN — minimum HN points per story for that domain (default 100)
 - DISCOVERY_<DOMAIN>_HN_RECENT_DAYS — lookback window in days for HN stories (default 14)
 - DISCOVERY_<DOMAIN>_AIXPLORIA_SIZE_RELAXED — larger per-category page size during relaxed passes
 - DISCOVERY_<DOMAIN>_RELAX_MAX_PASSES — number of relaxed passes just for this domain
 - DISCOVERY_<DOMAIN>_RELAX_MIN_SCORE — relaxed acceptance score threshold for this domain
 - DISCOVERY_<DOMAIN>_RELAX_ALLOW_UNKNOWN — allow reliability verdict "unknown" during relaxed passes for this domain (true/false)

Notes
- DOMAIN is the slug uppercased with non-alphanumerics replaced by underscores, e.g., `video-tools` → `VIDEO_TOOLS`.
- Global (DISCOVERY_X) values apply to all domains unless a per-domain override is provided.
- Hard parity means candidates must be present in Aixploria categories for that domain.

Minimum per-domain results
- The discovery script now guarantees at least 2 staged/published items per domain by default (configurable via `DISCOVERY_MIN_PER_DOMAIN` or `DISCOVERY_<DOMAIN>_MIN_PER_DOMAIN`).
- If a domain is underfilled after the primary pass, the script performs up to `RELAX_MAX_PASSES` relaxed passes that lower thresholds (GitHub stars, npm size, HN points) and accept candidates with slightly relaxed page-classifier scores while still respecting safety checks and the GitHub-link exclusion policy.

Automation (GitHub Actions)
- Workflow: `.github/workflows/discover-tools.yml`
- Schedule: daily at 07:00 IST (01:30 UTC) (cron: `30 1 * * *`)
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

Discovery env examples (PowerShell)
- $env:DISCOVERY_AIXPLORIA_STRICT = "hard"         # enforce hard parity across all domains
- $env:DISCOVERY_VIDEO_TOOLS_AIXPLORIA_STRICT = "hard"  # enforce just for Video Tools
- $env:DISCOVERY_TRENDING_GH_STARS_MIN = "2000"    # require more stars to count as trending
- $env:DISCOVERY_GITHUB_SEARCH_RECENT_DAYS = "90"  # only search repos updated in last 90 days

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

---

## Code of Conduct

Participation in this project is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). By contributing or engaging in project spaces, you agree to uphold these standards.

---

## Attribution

This site is powered by [Netlify](https://www.netlify.com/).

---

## Admin endpoints configuration

Admin curation options:

1) GitHub-based approval (recommended for GitHub Pages dev):
   - Discovery emails link to pre-filled GitHub Issues with label `approval` (requires env `GITHUB_REPO`).
   - Workflow `.github/workflows/approval-from-issue.yml` listens for such issues and writes the decision to Firestore using `FIREBASE_SERVICE_ACCOUNT_JSON` and `ADMIN_APPROVAL_SIGNING_KEY`.
   - Close the issue after success; comments record the action.

2) Netlify Functions (if you deploy them):
   - `/.netlify/functions/admin-list-pending` (GET) — list pending tools
   - `/.netlify/functions/admin-review` (POST) — approve/reject a pending tool
   - `/.netlify/functions/admin-dispatch` (POST) — trigger GitHub workflows (discover/export)
   - `/.netlify/functions/admin-health` (GET) — health and connectivity checks

Required Netlify environment variables:

- FIREBASE_SERVICE_ACCOUNT_JSON — Raw JSON for a Firebase service account (Firestore access)
- ADMIN_ALLOWED_ORIGIN — Exact origin allowed for CORS (e.g., https://your-site.netlify.app)
- APPROVAL_BASE_URL — Public site URL (used to derive origin if ADMIN_ALLOWED_ORIGIN not set)
 - GITHUB_REPO — owner/repo; when set, discovery emails will generate GitHub Issue links instead of Netlify approval URLs
- GITHUB_REPO — GitHub repo in owner/name format, e.g., user/ai-prompt-recommender
- GITHUB_TOKEN — Token with workflow scope to call the dispatch API

Access control:

- All admin functions require a Firebase ID token with custom claim `admin: true`.
- Use the provided script to set the claim: `npm run set:admin`

---

## UI tests (Playwright) – features and optional auth

Run tests with the GitHub Actions workflow: `.github/workflows/feature-tests-only.yml` (Feature/Functionality testing).

Feature selection
- The workflow exposes a dropdown titled “Feature to test”. Choose a single feature (e.g., “Search”, “Theme Toggle”) or “All” for a full regression. The harness will only run the selected tests.

Base URL handling
- Provide `base_url` input, or leave it empty and it will auto-derive the default GitHub Pages URL for this repo (owner.github.io/repo). You can also set an environment variable `TEST_BASE_URL` to override.

Optional Auth tests (Auth, Favorites, Admin Moderation)
- These tests are skipped automatically unless credentials are provided.
- To enable them, add either GitHub Actions Secrets or Variables:
   - Secret/Variable: `TEST_USER_EMAIL`
   - Secret/Variable: `TEST_USER_PASSWORD`
- When present, the workflow forwards these to the test runner; otherwise, auth-dependent tests are skipped and do not fail the run.

Notes
- Admin Moderation UI is visible only when the signed-in user has an `admin: true` custom claim. See the Admin role section above for how to grant this.
- The test artifacts (CSV/XLSX and screenshots) are uploaded per run under “ui-test-artifacts-<feature>”.