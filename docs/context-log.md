# Context Log

_Last updated: 2025-10-07_

## Using this log
- Append a dated entry for every batch of related changes.
- Run `npm run context:log -- --entry "<summary>"` (repeat `--entry` for multiple bullets) to automatically insert new notes and refresh the "Last updated" stamp.
- Cross-check new requests against the "Recent Changes" section before starting work to avoid duplicating completed tasks.
- Update the "Open Follow-ups" list as items are completed or new gaps are identified.

## Recent Changes

### 2025-10-07
- Removed unused prototype assets (`src/**`, `public/prompt.html`, legacy prompt enhancer backups, and redundant hero image) to slim the repository.
- Swapped the embedded tool fallback in `public/prompt-enhancer.js` for a dynamic fetch from `public/tools.json` with caching and graceful failure handling.
- Deduplicated repeated inline CSS blocks in `index.html` to simplify style maintenance.

- Added scripts/update-context-log.mjs to automate context log updates.
- Documented npm run context:log helper and smoke-tested command usage.
- Added archival whitelist + restore flags + CI workflow.
- Added --blocklist override, integrity warnings, and archive:dry npm script.
### 2025-10-06
- Investigated Audio & Music category gaps and documented tag-based grouping behavior.
- Disabled npm-based ingestion in `scripts/discover-tools.mjs`, added manual lists, and wired Product Hunt, BuiltWith, SimilarTech, and Crunchbase integrations.
- Annotated npm-derived entries in `public/tools.json` and updated the UI to honor `_commentedOut` flags.
- Updated `.github/workflows/discover-tools.yml` to inject new API secrets and configured actionlint allowlist.
- Filtered npm-hosted links directly in `index.html` search results (`commit 875b0c4`).
- Added `docs/context-log.md` to capture ongoing change history and pushed commits `875b0c4`/`caabc8f` to `origin/main`.
- Added `scripts/flag-npm-tools.mjs` and marked 42 npm-hosted entries in `public/tools.json` with `_commentedOut: true`; verified zero visible npm links remain.
- Wired the npm quarantine script into `.github/workflows/discover-tools.yml` so every discovery run auto-flags registry links before PR creation.

- Shortened popularity badge text to '#N' in UI and README.
## Open Follow-ups
- [x] Finish annotating any remaining npm entries in `public/tools.json` and report counts if required (flagged 42 npm hosts on 2025-10-06).
- [ ] Run discovery once the new API tokens are confirmed to be available and review output for npm regressions.
- [ ] Double-check popularity metadata to ensure npm entries no longer influence rankings.
- [ ] Monitor Prompt Studio fallback in production to confirm the live catalog fetch works without CORS or caching regressions.
