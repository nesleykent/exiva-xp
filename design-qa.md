# Design QA — complete standalone experience import

## Source and method

- Reference: `Exiva XP (Standalone).html`, including its extracted page sources.
- Implementation: production HTML shells, `assets/css/base.css`, `assets/css/pages.css`, `assets/js/shell.js`, and controllers in `assets/js/pages/`.
- Dark-mode reference and implementation captures were compared side by side at 1200 × 800. Responsive checks used 390 × 844 and the required 320 × 700 minimum.

## Screens and states compared

- Full-screen comparisons: Home, Character, Analytics, Planner, Codex, Charms, Tools, Log a hunt, and Logbook.
- Final focused comparisons: Planner, Codex, and Tools at matching 1200 × 800 viewports.
- Planner interaction: Team filter reduced the live result set from 148 grounds to 43 without navigation.
- Tools interaction: Advanced combat options opened and exposed the mitigation controls.
- Log a hunt interaction: realistic analyser text advanced from Paste to What we read without saving a session.
- Mobile: Planner and Codex at 390 × 844; Planner at 320 × 700 with exactly five bottom destinations.

## Findings and resolutions

| Priority | Visible mismatch | Resolution |
| --- | --- | --- |
| P1 | Planner began with a dense eight-field administration form and oversized identity cards. | Imported the template's Hot right now strip, compact Party/Level segmented controls, progressive More filters disclosure, concise two-column result cards, Top XP status, and selected-card border. |
| P1 | Codex exposed dropdowns and 72 initial results, unlike the template's short browse surface. | Added segmented Difficulty/Class/Sort controls, retained an All classes disclosure, limited the initial browse set to eight, and added selected-card context. Real creature art intentionally replaces template initials. |
| P1 | Tools exposed every combat modifier and pushed the lower tools far below the fold. | Collapsed advanced combat options, restored the template's two-column tool rhythm, reduced the level-target surface to target and pace, and compacted the imbuement tier control. |
| P1 | Analytics placed the comparison band before the primary chart. | Reordered the page to metrics → Daily XP gain → secondary boards → week comparison, matching the reference hierarchy while retaining honest tracker data. |
| P2 | Charms omitted the recommendation workspace when no analyser evidence existed. | The section now remains present with an explicit evidence requirement and Log a hunt action; no recommendation is fabricated. |
| P2 | The first hunt-entry step floated on the page rather than reading as one focused task. | Wrapped Paste in a panel and right-aligned the primary Read analyser action, while preserving the four-step keyboard-operable flow. |
| P2 | Mobile utility controls could overlap generic page-header copy. | Reserved header space for the floating GitHub and appearance cluster and rechecked at 390 px and 320 px. |

## Intentional differences

- The template uses illustrative hunts, creatures, profit, online status, and analyser values. Production uses Night'Flyn's tracked data, the private logbook, and explicit empty states.
- Production keeps the architectural contract's five mobile destinations; the template's additional mobile demonstrations are not imported.
- Production keeps real Tibia creature and charm artwork rather than replacing available assets with initials.
- Advanced filters and calculations remain available through disclosure instead of being removed.

## Verification

- Planner, Codex, Tools, Analytics, Charms, and Log a hunt rendered successfully from a fresh local origin.
- Segmented filters, progressive disclosures, selected-route behavior, and analyser parsing were exercised in the browser.
- No horizontal navigation overflow was introduced at the 320 px baseline; the mobile tab bar remains exactly five destinations.
- `node --check` passed for every touched JavaScript file.
- `node pipeline/smoke.mjs` passed.
- `git diff --check` passed.

passed
