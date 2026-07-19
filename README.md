# Exiva XP

**A private-first Tibia character hub, built around [Night'Flyn](https://www.tibia.com/community/?subtopic=characters&name=night%27flyn)** (Elder Druid, Gentebra). Exiva XP centralises everything one character needs to understand, plan and improve: Hunting Analyser sessions, XP and highscore history, profit, deaths, hunting places, creature intelligence, elemental strategy, charms, stamina planning and long-term progression. Every tool answers a practical character question: *where should I hunt, which element is best, how much profit do I make, how does my XP evolve, which respawns fit my level, which creatures do I kill most, which charms matter, and how is my performance changing?* The curated hunting database remains underneath as the planning engine, but the character and personal logbook are the centre. Public/shared features are optional later layers.

Four scoped references shape the product: the current [Exiva XP site](https://nesleykent.github.io/exiva-xp/index.html), [TibiaTools](https://tibiatools.io) (combat/damage/charm calculator logic), [Respawn Finder](https://github.com/danyelvarejao/respawn-finder) (respawn search patterns that improve the hunting database), and [Tibia XP History](https://github.com/mathiasbynens/tibia-xp-history) (daily character progression tracking via TibiaData — its formulas and crawler workflow are ported here, with history rows keyed to Tibia's 10:00 Europe/Berlin server-save day). GuildStats is used only as an initial Night'Flyn backfill source until the daily tracker has enough history of its own.

Plain HTML5, CSS and JavaScript modules — no frameworks, no build step, no dependencies. Ships to GitHub Pages as-is. The interface follows the [Instagram Design System](https://github.com/nesleykent/instagram-design-system): a product-app shell (sidebar → icon rail → tab bar), light and dark appearances, quiet monochrome surfaces and one loud gradient.

## The loop

1. **Paste** — the analyser reader extracts duration, XP, rates, loot, supplies, balance, damage, healing, kills and drops from any client export format. The pasted text travels with the submission verbatim; the reader derives what arithmetic allows and invents nothing.
2. **Locate** — every kill is identified in the codex (exact → plural-aware → fuzzy) and spreads evidence over its habitats. Candidates are scored by creature overlap, kill volume, rarity, ubiquity damping and coverage; the hunter confirms one of the top 5.
3. **Read** — the session gets an instant battle read: kill-weighted damage profile, the element to lead with, the element to leave at home, blockers, incoming-damage exposure, and which Charm to equip.
4. **Save** — by default the hunt is stored in this browser's private logbook. Optional GitHub sharing can still turn a hunt into a prefilled Issue/Discussion later, where Actions re-run the same rules before merging shared evidence.
5. **Learn** — every ground becomes a living statistical model for Night'Flyn: averages, medians, ranges, deviations, trust tiers and trends that sharpen with every saved analyser.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Fast app doorway grouped into the daily loop and reference/record workspaces; dashboard metrics stay on Character instead of repeating on Home |
| `character.html` | Night'Flyn's character dashboard: slim identity, current/target/projected progression, one interactive XP chart with level-up/death markers, then task tabs for next hunt, highscores, hunt log and details. Highscores uses one Experience trend plus one complete compact list with no repeated rank cards; the full row history lives on Analytics; planner shortcuts never recommend off-vocation rows |
| `grounds.html` | Hunt planner. It opens around Night'Flyn's tracked level, then shows one tile per ground with best-effort **area** (nearest city/region), best attack element, task speed and logged evidence. Filter bar: Search (matches ground *or* creature names), Level, Vocation, Hunt type (solo/team), task speed, Playstyle (free text against the loadout column, e.g. "fork" for druids, "arrows" for paladins), and Sort. Sorting happens after grouping into cards, against each card's own aggregate value, so the numbers shown always match what you sorted by. Each ground's curated rows keep tibiapal's vocation-specific **loadout** column verbatim (knight/monk weapon element, paladin ammo/barrage, sorcerer mastery, druid spell/fork playstyle). Selecting a tile opens its dossier inline on the same page (`grounds.html?g=…`, back button/browser-back returns to the filtered list) instead of navigating to a separate page — best-effort **area and access requirements** (city/region, level/quest/premium, sourced from TibiaWiki, always linked and labelled unverified), recommendations, personal/shared stats, population, battle plan, creature matchups |
| `tools.html` | Character tools: stamina calculator, TibiaTools-style element damage sandbox, imbuement price calculator, level-target/days-to-goal calculator, and profit tracker from saved analyser sessions |
| `creatures.html` | Codex explorer — search, difficulty and class filters, sortable by name/HP/XP/charm points; used to answer which creatures matter for Night'Flyn's hunts, tasks and charms. Selecting a tile opens its dossier inline on the same page (`creatures.html?c=…`, back button/browser-back returns to the filtered list) — official artwork, lore and behaviour (TibiaData), stats, task speed, location-specific kills/hour or kills/lap observations, summon/convince costs, resistance meters, damage ranking, battle plan, loot, habitats (linked to grounds), Charm data, and the kill count from your saved analyser logs (an honest floor, not the Bestiary counter) |
| `charms.html` | Personal charm intelligence: "Charms for your hunts" ranks elemental charms by expected proc damage over the saved kill log, the tracked charm-point budget marks affordable stages (earned-points caveat), and the full catalogue (Cyclopedia-sourced): elemental damage charms grouped by element, other Major charms, and Minor charms — cost per upgrade stage, effect text, and a link to the source page. Creature/ground recommendations open the selected charm first through query-backed route state, without fragment navigation |
| `submit.html` | The four-step analyser flow: paste, locate, read combat strategy, save to the private logbook |
| `analytics.html` | Pure-SVG progression and performance boards: daily XP gain, tracked highscores, top XP/profit targets, busiest grounds, hunts over time, most-killed creatures, most-looted items, vocation split |
| `admin.html` | Logbook tools: local hunt review, rule checks, duplicate sweep, JSON/CSV/Excel export, JSON import |

## Character Hub Scope

Exiva XP is one Night'Flyn interface, not a generic public directory. Current implemented surfaces cover: Hunting Analyser parsing, personal hunt logbook, XP and highscore history, level-fit hunt planning, creature codex, elemental recommendations, charm references, profit tracking, stamina calculation, a first TibiaTools-style damage sandbox and progression analytics. The remaining product work is explicit and should not be treated as done: deeper TibiaTools combat parity, richer planner search informed by the Respawn Finder reference, Wheel/equipment inference and historical data import.

## Layout

```
*.html                     eleven thin pages sharing one shell
config.ini                 the tracked character's name — world/vocation resolve from TibiaData automatically
assets/
  css/base.css             fonts, tokens (light + dark), app shell
  css/pages.css            page components
  fonts/                   Optimistic VF + Instagram Sans (from the design system)
  js/
    lib/                   fmt.js · text.js · stats.js · config.js (browser config.ini reader)
    engine/                analyser.js · codex.js · strategy.js
                           locator.js · ledger.js · rules.js  (game logic, Node-safe)
    data/sources.js        dataset loaders + 8 submission backends
    viz/svg.js             hand-rolled SVG charts
    shell.js               chrome + shared DOM fragments
    pages/                 one controller per page
data/
  README.md                source-of-truth contract for curated inputs,
                           generated caches and character observations
  bestiary.json            creature reference (read-only)
  codex-extra.json         TibiaData enrichment: artwork, lore, behaviour, loot, summon data
  creature-tasks.json      owner-curated task speed + workbook route-rate observations
  charms.json              the Charm catalogue (read-only, sourced from TibiaWiki)
  grounds.json             curated entries from tibiapal.com/hunting (read-only)
  ground-creatures.json    generated — TibiaWiki hunting-place creature rosters
  access.json              generated — best-effort ground access notes (unverified)
  shared-hunts.json        generated — optional shared/approved hunts
  ledger.json              generated — prebuilt shared ledger cache
  character.json           generated daily — Night'Flyn profile, highscore ranks, death log
  highscores/              generated daily — one history file per TibiaData highscore category; experience includes older imported backfill
  character-snapshot.json  generated daily — highscore staleness guard and same-day rerun guard
  imbuement-prices.json    generated a few times daily — {world: {itemId: {price, source, basis, observedAt, updatedAt}}} TibiaMarket prefill for Gentebra
pipeline/
  config.mjs               reads config.ini — the tracked character for every script below
  check-hunt.mjs           Action: judge an issue payload
  merge-hunts.mjs          Optional Action: merge approved shared issues, rebuild the shared ledger
  enrich-codex.mjs         refresh codex-extra.json from the TibiaData API (incremental)
  enrich-art.mjs           validate artwork URLs, fill gaps from TibiaWiki (fandom)
  enrich-access.mjs        best-effort ground access notes from TibiaWiki (rebuilds fully)
  enrich-ground-creatures.mjs explicit TibiaWiki creature rosters (rebuilds fully)
  track-character.mjs      hourly Night'Flyn TibiaData highscore crawl (ported from tibia-xp-history, extended across all current highscore categories)
  fetch-imbuement-prices.mjs  TibiaMarket price prefill for Gentebra imbuement items (30-day sparse-market fallback; skips items fetched within 4h)
  imbuement-market-ids.mjs    item slug → TibiaMarket numeric item_id pins used by fetch-imbuement-prices.mjs
  smoke.mjs                engine smoke tests, run locally or by publish.yml
.github/actions/
  commit-generated-data    shared owner-authored generated-data commit +
                           optional Pages dispatch action
.github/workflows/
  check-hunt.yml           on issue opened/edited
  merge-hunts.yml          optional shared evidence, on `approved` label + nightly sweep
  track-character.yml      every hour — refresh the current Tibia server-save day, commit, redeploy
  fetch-imbuement-prices.yml  a few times daily — refresh TibiaMarket imbuement item prices for Gentebra, commit, redeploy
  publish.yml              syntax checks + engine smoke tests + Pages deploy
```

The engine directory is DOM-free and runs identically in the browser and in Node 22 inside Actions — the pipeline can never disagree with the preview the hunter saw.

## Data model

```json
{
  "id": "", "loggedAt": "", "ground": "", "vocation": "", "party": false,
  "level": 0, "world": "",
  "minutes": 0, "xpRaw": 0, "xp": 0, "xpRawRate": 0, "xpRate": 0,
  "loot": 0, "supplies": 0, "balance": 0,
  "damage": 0, "damageRate": 0, "healing": 0, "healingRate": 0,
  "kills": [{ "name": "", "n": 0 }],
  "drops": [{ "name": "", "n": 0 }],
  "raw": ""
}
```

Data precedence is strict: `raw` is never altered; curated files are read-only; generated files (`shared-hunts.json`, `ledger.json`) are never hand-edited; the local browser logbook is the default source for personal analytics; the `approved` label is only the gate into the optional shared dataset.

## The ledger

Hunts group by ground × vocation × party-mode × level tier (8–49, 50–99, 100–149, 150–199, 200–299, 300–399, 400–599, 600+). Groups carry avg / median / min / max / σ for raw XP/h, loot/h and profit/h (loot and balance ÷ duration), sample count and recency. Rows are labelled by basis — **Curated** → **Blended** (first logged evidence arrives; curated values shown, logged stats attached) → **Logged** (5+ hunts; logged averages take over). Trust is a pure function of sample count: 1–4 Very low, 5–19 Low, 20–49 Medium, 50–99 High, 100+ Very high.

## Creature & combat intelligence

Codex resistances mean *% of damage taken* — 100 neutral, 110 weak, 80 resistant, 0 immune — across Physical, Earth, Fire, Energy, Ice, Holy and Death. From that one semantic the strategy engine derives per-creature element rankings, kill-weighted profiles for sessions and grounds, incoming-damage exposure, charm targets ranked by kills × HP × weakness, and plain-language tips. Ground intelligence prefers real logged kill counts over explicit TibiaWiki hunting-place rosters, then falls back only to creatures named directly by the ground label; every dossier labels which evidence it used.

Task intelligence comes from the owner-supplied `Kusnier's Tracker.xlsx` plus the owner's five speed tiers. The curated import keeps 313 route-specific observations across 205 creatures; rates retain whether they were measured per hour or per lap and never collapse multiple locations into a fabricated global average. Nine workbook spelling/plural variants were reconciled to canonical Bestiary names. The Hard Monsters worksheet identifies its measurements as approximately level-750 Monk results, and every creature dossier repeats the broader level/vocation/skill/route caveat.

The bestiary is complemented by the [TibiaData API](https://docs.tibiadata.com) (`GET /v4/creature/{race}`): descriptions, behaviour notes, summon/convince mana, paralysability, invisibility sense and loot lists, cached into `data/codex-extra.json` by `pipeline/enrich-codex.mjs`. The script is incremental — re-running it only fetches creatures that are still missing — and the site works fine without the file.

Artwork comes entirely from [TibiaWiki](https://tibia.fandom.com), not TibiaData: `static.tibia.com` (TibiaData's image host) blocks hotlinking and 403s from any foreign origin, including GitHub Pages, so those URLs never render once deployed. `pipeline/enrich-art.mjs` flags any `static.tibia.com` URL for replacement, HEAD-validates the rest, and resolves every gap against the TibiaWiki MediaWiki API (`File:<Name>.gif`, falling back to `.png`, then an opensearch pass for disambiguated or oddly-cased pages), batched 50 titles per request. Wiki file redirects are followed at the imageinfo level, so variant creatures that reuse a base sprite (e.g. Haunted Dragon → Undead Dragon) resolve to the sprite they actually show in-game. Current coverage: all 812 creatures, 100% wiki-sourced.

## Charms

`data/charms.json` is the full Charm catalogue (25 charms) from the same tibiadraptor.com Cyclopedia export that produces `bestiary.json` — real in-game effect text and per-stage costs, not a wiki transcription. Effect strings carry a `{{}}` placeholder for the stage-dependent value; `loadCharms()` substitutes all three stages into one "X% / Y% / Z%" sentence. Icons load from `tibiadraptor.com/images/charms/`. The set: 7 elemental damage charms (one per element — Wound/Physical, Poison/Earth, Enflame/Fire, Zap/Energy, Freeze/Ice, Curse/Death, Divine Wrath/Holy), the remaining Major charms (higher point cost, offensive/defensive utility), and 11 Minor charms (lower point cost, available from the start). Per [TibiaWiki's own Charms article](https://tibia.fandom.com/wiki/Charms), a charm is unlocked with Charm Points earned by completing a creature's Bestiary entry and assigned free of charge — one per creature, 2 simultaneous slots on a free account, 6 on Premium; detaching one costs gold (level × 100). Neither tier is level-gated. Each card also links out to TibiaWiki for lore.

`ELEMENT_CHARM` in `assets/js/engine/codex.js` maps each element to its Charm's real name, so every place the strategy engine recommends "hit this with Ice" also names the actual Charm ("equip the Freeze Charm") and opens `charms.html?charm=freeze` with that card selected first — never the generic "Charm pick" phrasing, which reads like an in-game feature that doesn't exist.

## Ground access requirements and area

There's no structured API for hunting-ground access requirements or their broader area, so `pipeline/enrich-access.mjs` best-effort-resolves each curated ground to its TibiaWiki article and reads: the infobox's `city` field (or the first `near` link, skipping self-references) as the ground's **area** — e.g. "Ankrahmun" for Cobra Bastion — and the intro prose for a minimum level, a linked Quest name (using the wikilink's actual page title, never a display alias — aliases like "permission" or "task to kill them" aren't quest names) and a Premium Account mention. Area shows as an informational label on both the hunt planner tiles and the ground dossier's Requirements panel (not a filter). A ground only gets an entry when at least one of these was found; every entry carries the wiki page it came from, and the UI always labels this "unverified — confirm in-game" and links the source. Re-running the script rebuilds `data/access.json` from scratch. Current coverage: 259 of 410 grounds carry a signal, 244 with an area.

Many curated names are just the creature that spawns there ("Bashmu", "Werelions", "Falcons"), with no separate location article to read a city/near field from — for these, TibiaWiki genuinely has no structured place data to extract, and the panel correctly shows "no requirement found" rather than guessing. Two matching safeguards keep the fuzzy resolution honest: (1) when a whole-phrase search fails, each individual word is retried as its own exact-title search and every candidate is actually fetched — not just title-matched — so a wrong-but-plausible word (e.g. "Wyrms" from "Elder Wyrms Drefia") gets skipped in favour of the real one ("Drefia") once its page turns out to have nothing usable; (2) a candidate page is only trusted if its infobox is actually `Hunt` or `Geography` — early versions accepted any page whose intro text happened to mention a "Quest" link or level number, which let creature pages (e.g. "Nightmare", matched from "Nightmare Scions Krailos") leak in irrelevant lore-text signals.

## Ground creature rosters

`pipeline/enrich-ground-creatures.mjs` rebuilds `data/ground-creatures.json` from TibiaWiki's `Category:Hunting Places`. It fetches every article's wikitext, reads canonical `CreatureList` templates (or exact creature links in short articles that have no list), drops bosses and other names absent from the Cyclopedia Bestiary, and resolves the planner's tactical aliases only through exact/strong titles, previously resolved Wiki access pages, or reviewed alias rules. Number and direction guards keep Warzone 2 away from Warzone 1 and Upper Roshamuul away from Lower Roshamuul. Section-aware parsing keeps Book World chapters, Hive subareas, Banuta's ape floors and the Fire/Energy/Ice Library populations separate. Floor aliases stay unresolved when TibiaWiki only publishes an article-wide list. Current coverage is 330 of 410 planner grounds.

The runtime merges logged analyser kills with the TibiaWiki roster whenever both exist: saved kills weight the battle advice, while the full respawn remains visible and mobs absent from the loaded sessions show no logged kill share. Without a log it uses the equal-weight Wiki roster, then falls back only to creatures explicitly named by the ground label. The old broad Bestiary-habitat similarity fallback was removed: labels such as “Yalahar”, “Drefia”, “Banuta” and “Ingol” describe regions containing many unrelated spawns, so an unresolved ground now honestly shows no trustworthy population instead of fabricating a matchup. Each dossier links the exact source article.

## Backends

`assets/js/data/sources.js` defines one submission interface with eight implementations, selected by the `BACKEND` constant: `browser` (default — offline LocalStorage), `github-issues`, `github-discussions`, `static` (read-only mirror), `supabase`, `firebase`, `cloudflare-d1` and `sqlite` (both via a generic `GET/POST /hunts` REST contract). Every backend also keeps the hunter's personal logbook in LocalStorage; GitHub backends are optional public/shared sync, not the default product mode.

## Deploying your own

1. Push this folder to a new repository's `main` branch.
2. Edit `config.ini` — just the character's `name`. World and vocation resolve automatically from TibiaData's character endpoint (cached through `data/character.json` after the first tracker run). Both the pipeline scripts (`pipeline/config.mjs`) and the browser UI (`assets/js/lib/config.js`) read this file; no code edits needed.
3. Set `SITE.owner` / `SITE.repo` in `assets/js/data/sources.js`.
4. **Settings → Pages** → Source: **GitHub Actions**.
5. Optional, only if you want shared/public hunt submissions: create the labels `hunt`, `approved`, `clean`, `faulted`.
6. Push — `publish.yml` verifies the engine and deploys.

Run locally with any static server (`python3 -m http.server`) — ES modules don't load from `file://`.

## Design system adherence

An audit against the source Instagram Design System's actual component code (not just its prose guidelines) found and fixed real drift: buttons were named by colour (`btn-blue`/`btn-soft`/`btn-line`/`btn-red`) instead of by tier (`btn-primary`/`btn-secondary`/`btn-tertiary`/`btn-destructive`, matching the source `Button` component's `tier` prop exactly); buttons used an 8–12px radius that grew with size, where the source keeps every button at a flat 6px regardless of size; two raw `#fff` literals existed where a token should; disabled opacity was `.45` against the source's `.3`; status/basis pills were named `pill-blue`/`pill-green`/`pill-red` instead of by meaning (`pill-info`/`pill-success`/`pill-error`, matching the source `Badge` component's tone system). Utility cards (`.panel`) moved from a 12px radius to 6px, matching the source `Card` component's "utility" variant exactly — creature/charm art tiles correctly kept 12px, matching the source's separate "editorial" (image-tile) variant instead.

Known, deliberate deviations: utility cards don't carry an always-on shadow (the source does) — at this app's card density, an always-on shadow on hundreds of small cards reads as noisy, which conflicts with the source's own "used sparingly" guidance more than a hover-reveal does.

A second audit initially misread the source's `Tag` component as "the categorical-label chip" and converted every passive label into big 2px-bordered chips with invented per-element border accents (`Tag` has exactly two accents: purple and neutral, verified against the design project's typed `Tag.tsx`). The correction landed in two steps. First: `Tag` is the *interactive filter chip* (the brand type-tester pattern) and this app has no such control, so passive chips left it entirely. Second, closing the "colours don't match" audit item: the source `Badge` is a **solid tone fill with white uppercase text** (the LIVE pattern) — so genuine status indicators (`Curated`/`Logged`/`Blended` basis, admin's `Faulted`/`Flagged`/`Clean`, evidence provenance) now render as source-exact `.badge` chips (tones: success, info/blue, error; the caution tone doesn't exist in the source, so `badge-warning` uses the brand gradient's orange stop as a documented extension). Categorical metadata (vocations, family/tier/rarity, loot, habitats) and the element-resistance readouts stay on Exiva's own quiet `.pill` wash chips — solid uppercase badges on every label would out-shout the content, and element colours remain data colours (their RGB values map 1:1 onto source palette entries: fire=the orange gradient stop, energy=subscribers-purple, ice=signature blue, earth=success green, holy=gradient yellow, death=magenta stop, physical=secondary-icon grey).

The source package has no Sort/Picker/Menu component at all, so Sort (`assets/js/shell.js`'s `sortMenu`/`bindSortMenu`) follows [Apple's Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) instead: a button that opens a small anchored menu listing the options with a checkmark on the current one, dismissed on pick or outside-tap — rather than a native OS-styled `<select>`, which read as foreign chrome next to the rest of this custom-styled system.

A third audit re-verified every token and component against the source `.tsx`/`.css` directly (not prior audit notes) and found: the motion easing curves were wrong — `--e-standard`/`--e-settle` used invented cubic-béziers instead of the source's actual `--ig-ease-standard`/`--ig-ease-settle` values, now corrected byte-for-byte (plus `--e-confident`, previously absent); text/select-menu inputs rendered a transparent border at rest where the source always shows a visible `--ig-stroke` outline, now matching (padding corrected `8px`→`10px` vertical to match `Input.tsx` exactly); the imbuement-calculator modal was missing the source's `backdrop-filter: blur(20px)` scrim and `ig-zoom-settle` entrance animation, both added; and the inline copy control used a 4px-radius/bordered treatment where the source's `IconButton` "ghost" variant is always transparent and fully circular, now corrected. The old imbuement overview comparison trigger was removed during the Intibia-parity pass. Also corrected: the mobile tab bar's icon size was 26px against the source `IOSTabBar`'s 27px (no-label variant); the `btn-destructive` tier is an app-side extension of `Button`'s tier system (the source's `tier` prop has only primary/secondary/tertiary), not a literal source value — the previous claim of an exact match was overstated, though the visual treatment itself was already correct.

Known, deliberate deviations confirmed by this pass (left as-is): `Avatar`'s "story" ring renders a visible background-colour gap between the gradient ring and the photo (a two-band halo); this app's `.ring` shows initials, not photos, so its inset is a single surface-coloured band. The character dashboard does not include the source's social-media-style stories/Next hunts rail. `IOSTabBar` tints the active tab's icon a distinct accent colour; the mobile tab bar instead only bolds the active label's weight, since a colour-tinted icon would conflict with AGENTS.md §5's own near-monochrome rule (icon tints reserved for element data colours). Utility-chrome glyphs (chevrons, checkmarks, the wordmark glyph) use a heavier stroke-width than the source's `1.7` — plausibly deliberate for legibility at small sizes, left unchanged.

## Roadmap

The task list, decision log and the full architectural contract live in [AGENTS.md](AGENTS.md) — read it before contributing. Current priorities: deeper character-dashboard analytics, planner search depth informed by the Respawn Finder reference, extending the character history backfill, and Wheel/equipment context for the damage calculator where real formulas and player state are available.

---

Fan project — not affiliated with CipSoft GmbH; Tibia is a registered trademark of CipSoft GmbH. Curated ground data from [tibiapal.com](https://tibiapal.com/hunting); creature artwork, lore and loot from [TibiaData](https://tibiadata.com) / tibia.com. Interface tokens and typefaces from the Instagram Design System study; Instagram Sans and Optimistic remain the property of Meta Platforms, Inc.
