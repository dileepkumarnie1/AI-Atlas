# Context Log

_Last updated: 2025-10-06_

## Using this log
- Append a dated entry for every batch of related changes.
- Cross-check new requests against the "Recent Changes" section before starting work to avoid duplicating completed tasks.
- Update the "Open Follow-ups" list as items are completed or new gaps are identified.

## Recent Changes

### 2025-10-06
- Investigated Audio & Music category gaps and documented tag-based grouping behavior.
- Disabled npm-based ingestion in `scripts/discover-tools.mjs`, added manual lists, and wired Product Hunt, BuiltWith, SimilarTech, and Crunchbase integrations.
- Annotated npm-derived entries in `public/tools.json` and updated the UI to honor `_commentedOut` flags.
- Updated `.github/workflows/discover-tools.yml` to inject new API secrets and configured actionlint allowlist.
- Filtered npm-hosted links directly in `index.html` search results (`commit 875b0c4`).
- Added `docs/context-log.md` to capture ongoing change history and pushed commits `875b0c4`/`caabc8f` to `origin/main`.
- Added `scripts/flag-npm-tools.mjs` and marked 42 npm-hosted entries in `public/tools.json` with `_commentedOut: true`; verified zero visible npm links remain.
- Wired the npm quarantine script into `.github/workflows/discover-tools.yml` so every discovery run auto-flags registry links before PR creation.

## Open Follow-ups
- [x] Finish annotating any remaining npm entries in `public/tools.json` and report counts if required (flagged 42 npm hosts on 2025-10-06).
- [ ] Run discovery once the new API tokens are confirmed to be available and review output for npm regressions.
- [ ] Double-check popularity metadata to ensure npm entries no longer influence rankings.
