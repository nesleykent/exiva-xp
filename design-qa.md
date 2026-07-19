# Design QA — standalone template rebuild

## Source of truth

- Reference: `Exiva XP (Standalone).html`
- Implementation: the production HTML shells, shared shell, `assets/css/base.css`, `assets/css/pages.css`, and page controllers under `assets/js/pages/`
- Compared at 1200 × 800 in dark appearance, with additional mobile checks at 390 × 844.

## Screens and states compared

- Home: reference and implementation shown together at the same viewport.
- Character: reference and implementation shown together at the same viewport.
- Analytics, Planner, Codex, Charms, Tools, Log a hunt, and Logbook: matching full-view captures at 1200 × 800.
- Planner selection: selected ground keeps filters and three nearby results visible, then opens the ground dossier inline.
- Codex selection: selected creature keeps the result context and opens the creature dossier inline.
- Log a hunt: a realistic Hunting Analyser was pasted and successfully advanced from Paste to Read without saving a logbook entry.
- Mobile Home: reference and implementation checked at 390 × 844; implementation has no horizontal overflow and retains the required five-destination mobile tab bar.

## Findings and fixes

| Priority | Finding | Resolution |
| --- | --- | --- |
| P1 | Production Home was a sparse workspace doorway rather than the template's daily intelligence dashboard. | Rebuilt Home around the character greeting, five real metrics, next-hunt recommendation, attention state, and shortcuts. |
| P1 | Character hierarchy did not match the compact identity → metrics → next hunts → chart sequence. | Reordered and compacted the hero, level progress, metrics, story-ring hunts, and chart. |
| P1 | Planner and Codex replaced list context when a result opened. | Both now preserve filters and nearby results while opening detail inline. |
| P2 | Desktop result density differed from the reference. | Planner uses a two-column grid with three initial results; Codex uses a three-column grid and eight retained results after selection. |
| P2 | Mobile Home used a dense two-column metric layout unlike the reference. | Mobile Home metrics now use a single column while secondary metric groups remain compact. |
| P2 | Dashboard XP notation used Tibia `kk` notation where the reference used `M`/`B`. | Added dashboard compact formatting and applied it to primary XP metrics, chart labels, and the chart inspector. |
| P2 | Several supporting screens lacked the template's summary-card rhythm. | Added real, source-backed summary cards to Analytics and Charms and aligned shared radius, spacing, canvas width, and dark surfaces. |

## Intentional differences

- The reference contains illustrative values, a different vocation/world, a simulated online badge, and a prefilled analyser. Production uses Night'Flyn's tracked data and leaves unknown/private values honest rather than fabricating them.
- The reference demonstrates nine mobile destinations. Production keeps the architectural contract's five-item daily-loop mobile navigation; the remaining destinations stay available through Home and desktop navigation.
- GitHub and appearance controls remain in the production shell because they are required shared utilities.

## Verification

- All nine main routes rendered meaningful content with zero horizontal overflow at 1200 × 800.
- Mobile Home rendered at 390 × 844 with zero horizontal overflow and exactly five visible navigation destinations.
- Planner selection: 3 visible cards, filters retained, selected dossier opened, query-backed URL preserved.
- Codex selection: 8 visible cards retained and selected dossier opened with query-backed URL.
- `node --check` passed for every touched JavaScript file.
- `node pipeline/smoke.mjs` passed.
- `git diff --check` passed.

Final result: passed
