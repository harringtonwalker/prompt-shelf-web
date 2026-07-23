# Prompt Shelf Private Workspace

This repository is the private cross-device data source for one Prompt Shelf user.

Before the Skill mirror can write, set `repository` in `private-workspace.json`
to the confirmed private `owner/repository`, initialize or clone that exact Git
repository, and make sure GitHub reports its visibility as `PRIVATE`. The sync
script fails closed if the marker, origin, and GitHub visibility do not agree.

- `data/prompts.json`: prompt records, categories, trash, revisions, and sync tombstones
- `data/skills-index.json`: generated private Skill index
- `private-workspace.json`: private-repository identity and write guard
- `data/skills-sync-manifest.json`: local Skill mirror verification record
- `skills/`: private Skill source mirror with dependency caches and credential files excluded
- `scripts/verify-private-workspace.mjs`: credential, schema, and path boundary check

The public Prompt Shelf repository and GitHub Pages deployment must never receive these real data files. A local prepare script does not mean the data is synchronized; cross-device sync is complete only after this private repository is committed and pushed successfully.
