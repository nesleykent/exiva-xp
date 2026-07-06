# Exiva XP Data Contract

All files in this directory are served statically by GitHub Pages. Browser code
must load them through `assets/js/data/sources.js` so `publish.yml` can stamp
fresh cache keys at deploy time.

## Curated Inputs

Do not hand-edit these during feature work:

- `bestiary.json` - Cyclopedia creature export.
- `grounds.json` - curated hunting-ground rows.
- `charms.json` - Cyclopedia charm export.

## Generated Reference Caches

These are rebuilt by pipeline scripts and committed:

- `codex-extra.json` - TibiaData/TibiaWiki creature enrichment.
- `access.json` - best-effort TibiaWiki access and area notes.
- `ledger.json` - derived shared-hunt ledger cache.
- `shared-hunts.json` - optional approved shared hunt evidence.

## Character State

These are generated observations for Night'Flyn and must stay honest:

- `character-history.json` - daily XP/rank/skill rows keyed by Tibia's
  10:00 Europe/Berlin server-save day. Unknown values stay `null`; never carry
  forward a previous skill or rank as if it were measured today.
- `character.json` - latest profile, skill ranks and known deaths.
- `character-snapshot.json` - highscore staleness guard for the tracker.
- `character-online.json` - 15-minute sampled world-list observations. Offline
  means "not listed in that sample", not continuous telemetry.

## Workflow Ownership

Generated-data workflows commit through `.github/actions/commit-generated-data`
so author identity, staging, pushing and optional Pages dispatch stay
consistent. A `GITHUB_TOKEN` push does not trigger push-based workflows, so
workflows that update visible data dispatch `publish.yml` explicitly when the
new state should be deployed.
