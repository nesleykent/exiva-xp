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
- `imbuement-prices.json` - TibiaMarket price observations for the configured
  world. `observedAt` is the source row's timestamp; `updatedAt` is when the
  pipeline fetched it. Sparse items may use the newest sell observation in a
  30-day window and carry its exact `basis`; missing evidence stays missing.

## Character State

These are generated observations for Night'Flyn and must stay honest:

- `character-history.json` - daily XP/rank/highscore rows keyed by Tibia's
  10:00 Europe/Berlin server-save day. Unknown values stay `null`; never carry
  forward a previous highscore value or rank as if it were measured today.
- `character.json` - latest profile, highscore ranks and known deaths.
- `character-snapshot.json` - highscore staleness guard for the tracker.

## Workflow Ownership

Generated-data workflows commit through `.github/actions/commit-generated-data`
so author identity, staging, pushing and optional Pages dispatch stay
consistent. A `GITHUB_TOKEN` push does not trigger push-based workflows, so
workflows that update visible data dispatch `publish.yml` explicitly when the
new state should be deployed.
