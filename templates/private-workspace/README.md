# Prompt Shelf Private Workspace

This repository is the private cross-device data source for one Prompt Shelf user.

Before the Skill mirror can write, set `repository` in `private-workspace.json`
to the confirmed private `owner/repository`, initialize or clone that exact Git
repository, and make sure GitHub reports its visibility as `PRIVATE`. The sync
script fails closed if the marker, origin, and GitHub visibility do not agree.

Validate this unbound blank template with
`node scripts/verify-private-workspace.mjs --template`. After binding it to a
real private repository, omit `--template`.

- `data/prompts.json`: prompt records, categories, trash, revisions, and sync tombstones
- `data/skills-index.json`: generated private Skill index
- `data/ai-chats.json`: persistent AI Navigator conversations and deletion tombstones
- `private-workspace.json`: private-repository identity and write guard
- `data/skills-sync-manifest.json`: local Skill mirror verification record
- `skills/`: private Skill source mirror with dependency caches and credential files excluded
- `scripts/verify-private-workspace.mjs`: credential, schema, and path boundary check

The Prompt and Skill dashboards share one AI configuration on each device. AI
conversation history syncs through `data/ai-chats.json`; API keys remain only in
that device's IndexedDB and never enter this repository.

The public Prompt Shelf repository and GitHub Pages deployment must never receive these real data files. A local prepare script does not mean the data is synchronized; cross-device sync is complete only after this private repository is committed and pushed successfully.
