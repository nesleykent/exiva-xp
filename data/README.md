# Exiva XP Data Contract

All files in this directory are served statically by GitHub Pages. Browser code
must load them through `assets/js/data/sources.js` so `publish.yml` can stamp
fresh cache keys at deploy time.

## Curated Inputs

Do not hand-edit these during feature work:

- `bestiary.json` - Cyclopedia creature export. Refresh it only through
  `pipeline/update-bestiary.mjs`; the script joins the paginated TibiaDraptor
  API and refuses totals that do not match the reviewed release metadata.
- `grounds.json` - curated hunting-ground rows.
- `charms.json` - Cyclopedia charm export.

## Generated Reference Caches

These are rebuilt by pipeline scripts and committed:

- `codex-extra.json` - TibiaData/TibiaWiki creature enrichment.
- `ground-creatures.json` - explicit Bestiary-compatible creature rosters from
  TibiaWiki Hunting Places articles. Tactical local aliases retain their linked
  article and match method; unresolved aliases stay absent rather than inheriting
  a broad city or region population.
- `access.json` - best-effort TibiaWiki access and area notes.
- `ledger.json` - derived shared-hunt ledger cache.
- `shared-hunts.json` - optional approved shared hunt evidence.
- `imbuement-prices.json` - TibiaMarket price observations for the configured
  world. `observedAt` is the source row's timestamp; `updatedAt` is when the
  pipeline fetched it. Sparse items may use the newest sell observation in a
  30-day window and carry its exact `basis`; missing evidence stays missing.
- `creature-tasks.json` - one-time curated import from the owner-supplied
  `Kusnier's Tracker.xlsx`: owner-assigned task-speed tiers plus 313
  location-specific kills/hour or kills/lap observations. Workbook spelling
  variants are reconciled to canonical Bestiary names; every rate retains its
  worksheet and row, and its caveats travel with the dataset.

## Character State

These are generated observations for Night'Flyn and must stay honest:

- `highscores/*.json` - one daily observation history per TibiaData highscore
  category, keyed by Tibia's 10:00 Europe/Berlin server-save day. Every row
  stores `{value, rank, source}`; `experience.json` also stores `level` and
  contains the older GuildStats backfill. A confirmed unranked category stores
  explicit `null` values, while a category that failed to load gets no new row.
  Never carry forward an earlier observation as if it were measured today.
- `character.json` - latest profile, highscore ranks and known deaths.
- `character-snapshot.json` - highscore staleness guard for the tracker.

## Workflow Ownership

Generated-data workflows commit through `.github/actions/commit-generated-data`
so author identity, staging, pushing and optional Pages dispatch stay
consistent. A `GITHUB_TOKEN` push does not trigger push-based workflows, so
workflows that update visible data dispatch `publish.yml` explicitly when the
new state should be deployed.
