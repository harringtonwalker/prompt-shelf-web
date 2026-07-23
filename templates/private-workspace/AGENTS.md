# Private Prompt Shelf Workspace Rules

- This private repository is the sole cross-device data source for Prompt Shelf prompts and Skill index data.
- Do not copy real data into the public Prompt Shelf repository, GitHub Pages output, screenshots, logs, exports, or task bundles.
- GitHub Token and AI API Key never belong in this repository.
- `private-workspace.json` must name this exact private GitHub repository; do not copy a marker from another repository.
- Prompt data writes must preserve IDs, tombstones, trash, revision history, and remote SHA conflict protection.
- Skill source and `data/skills-index.json` are updated only through the canonical Skill repository sync script.
- Local preparation, Git commit, Git push, and webpage verification are separate completion states.
- Run `node scripts/verify-private-workspace.mjs` before commit or push.
- Do not delete or rewrite history without explicit owner approval and a verified backup.
