This folder stores cached tool icons downloaded by scripts/cache-tool-icons.mjs.

- Files are organized as public/icons/<section-slug>/<tool-slug>.<ext>
- The manifest at public/icons/manifest.json maps section+tool to the cached path.
- Exporter prefers cached icons when present, rewriting iconUrl to the relative path.
