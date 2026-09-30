# Design QA — visual and UX quality pass (2026-09-30)

Branch `claude/visual-ux-quality-audit-7aada4`. This is a quality pass on the shipped surfaces, not a redesign. AGENTS.md stays binding: the Instagram-derived tokens and §5 component rules are the design language, Apple HIG breaks ties, and §12's open questions stay owner decisions. The earlier `design-qa.md` (standalone-template import) is a separate record.

## Method

- **Screens:** 12 states (Home, Character, Planner, Planner dossier `?g=marapur-nagas`, Codex, Codex dossier `?c=dragon`, Charms, Charms selected `?charm=freeze`, Tools, Log a hunt, Progress, Logbook) × 375 / 768 / 1280 / 1440 px × light / dark = 96 captures.
- **Harness:** headless Chrome over CDP (`.claude/qa-shots/shoot.mjs`, zero dependencies). It writes viewport PNGs, full-page JPEGs and `report.json` with horizontal overflow, targets under 44 px, a font-size/line-height census and console errors. Captures live in `.claude/qa-shots/{before,after}/`, which is gitignored and never deployed.
- **Contrast:** WCAG ratios for every text/surface token pair in both themes (`.claude/qa-shots/contrast.mjs`).
- **Critique:** three independent reviewers (mobile, desktop, source/interaction states) wrote `.claude/qa-shots/critique-{mobile,desktop,code}.md`. Their findings were checked against the source before being ranked below.

## Baseline facts

- No horizontal overflow at any width or in either theme. No console errors or warnings.
- No unlabelled form fields and no images without `alt`. One nameless link: the rail wordmark, whose text is hidden at ≤1100 px.

## Inventory (as built)

### Type
| Token | px | Use (CSS rules) | Rendered share* |
| --- | --- | --- | --- |
| `--fs-11` | 11 | eyebrow, badge, table th, ticks, captions (12) | 648 |
| `--fs-12` | 12 | `.fine`, pills, `.btn`, segmented, legends (14) | 2,705 |
| `--fs-13` | 13 | meters, stepper, viz tip, mini-list, disclosures (12) | 190 |
| `--fs-14` | 14 | inputs, tables, notes, tips, body-small (16) | 509 |
| `--fs-15` | 15 | fact values, tile names, mini-metrics (7) | 879 |
| `--fs-16` | 16 | body, rail items (4) | 401 |
| `--fs-17` | 17 | pace band only (2) | 12 |
| `--fs-18` | 18 | card titles (h2 in tools/steps/home), KPI-sm, ring core (8) | 94 |
| `--fs-20` | 20 | section-bar h2 (1) | 78 |
| `--fs-22` | 22 | analytics skill-card value (1) | 45 |
| `--fs-24` | 24 | KPI value ≤700 px (1) | 21 |
| `--fs-26` | 26 | h1, wordmark, masthead ring (3) | 62 |
| `--fs-28` | 28 | KPI value (1) | 51 |
| `--fs-32` | 32 | character hero initial (1) | 4 |
| — | 13.33 | **UA default** — imbuement cards are `<button>`s with no font-size | 69 |
| `--fs-10` | 10 | unused | 0 |

\*Text-bearing elements across the 48 light-mode captures.

- **Weights:** 400 / 600 / 700, plus **900** where a `<b>` sits inside a 600-weight parent (`.pill`, level-progress row), because the UA default for `b` is `bolder`.
- **Line heights:** 27 distinct size/leading pairs; "normal" is used for 15/14/12/16 px text next to explicit values for the same sizes.
- **Headings:** h1 26 px everywhere (good); h2 is 20 px in section bars and 18 px in cards; h3 renders at 15, 16 (inline style in grounds.js) and 18 px.

### Spacing
- Tokens `--s1…--s16` = 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64. Almost all layout spacing uses them.
- Off-scale values in use: 2 px (label/value micro-gaps, 10 rules), 6 px (tight pill rows, tips, imbuement rows, 11 rules), 10 px (field/cell/fact padding), badge 3/7 px, `.tips` 18 px indent. These are documented "cozy half-steps". §12 #9 already asks the owner about tokenising them.
- **Inline `style=""` in templates:** 20 sites in `grounds.js`, `creatures.js`, `submit.js`, `admin.js`, `tools.js`, `charms.js`. Most restate an existing token or duplicate a shared class.

### Radii
`--r-xs` 2 (trust segments) · `--r-sm` 4 (badge, heatmap cells) · 6 (segmented thumb, calc) · `--r-input`/`--r-md` 8 (buttons, fields, filter bar, facts, notes, mini-cards) · `--r-card` 10 (`.panel` only) · `--r-lg` 12 (sort menu, art disc, modal) · `--r-xl` 16 (unused) · pill · circle. Whether the contract is 6, 8 or 10 px is §12 #1.

### Colour
- Near-monochrome surfaces (`--surface`, `--surface-2`, `--surface-raised`, `--wash`), `--ink`/`--ink-2`, one action blue, fixed status tones, brand gradient, element data colours. The CSS has no raw hex outside the token block.
- Theme-swapping text tones exist for success and warning only (`--ink-success`, `--ink-warning`). Blue and red are still used as text at their fixed fill values.

### Elevation
One shadow value (`0 0 10px rgba(0,0,0,.2)`) under three names, applied on hover and to floating surfaces only. One ad-hoc pressed-segment shadow.

### Breakpoints
1100 (icon rail) · 1000 (advanced filters → 2 columns) · 880/879/860 (duo splits) · 700 (tab bar, touch targets) · 520 (stepper labels). The stray breakpoints are §12 #9.

### Components
- **Buttons:** `.btn` primary / secondary / tertiary / destructive × sm / default / lg. Hover exists on three tiers, not destructive. No pressed state. Disabled is opacity .3.
- **Fields:** text/search/number/select/textarea share one chrome (36 px, 44 px ≤700). The sort menu is a HIG anchored menu.
- **Segmented control:** 30 px buttons with a pressed thumb and no hover.
- **Cards:** `.panel` (10 px radius, line border) with `.metric` KPI, `.tile`, `.fact`, `.tool-kpis` cell, `.tool-mini-card`, `.imb-card`, `.pace-band`, `.empty-action`.
- **Chips:** `.badge` (status, solid) and `.pill` (data, wash).
- **Nav:** sidebar (≥1101) → icon rail → 5-tab bar (≤700) plus the floating utility pill.
- **Icons:** 1.7-stroke line set. 26 px in the rail, 27 px in the tab bar, 18 px in shortcuts, 15–16 px inline.

## Target scales (derived from what already dominates)

- **Type:** keep the token ladder that carries 99% of text: 11 · 12 · 13 · 14 · 15 · 16 · 18 · 20 · 24 · 26 · 28 (+32 for the one hero glyph). Rules:
  - Every rendered size must be a token. No UA-default 13.33 px.
  - 17 folds into 18 and 22 folds into 20. They are one-rule outliers that sit a pixel from a neighbour.
  - `b`/`strong` render 700, never 900.
  - Headings: h1 26 · section h2 20 · card title (h2/h3 inside a card) 18 · sub-heading h3 inside a section 16.
- **Spacing:** the existing 4-px ladder (`--s1…--s16`). The 2/6/10 px half-steps stay as documented outliers until §12 #9 is decided. New code uses tokens, and template inline spacing moves into shared classes.
- **Radius / colour / elevation:** unchanged tokens. The one addition is theme-aware text tones for blue and red (`--ink-info`, `--ink-error`), following the precedent `--ink-success`/`--ink-warning` set, so status text passes AA while fills keep the fixed hues.
- **Touch:** every control is ≥44 px on layouts ≤700 px through the existing `--tap` contract. Links inside sentences are exempt (WCAG 2.5.8).

## Issues (ranked: severity × reach)

Evidence and full source pointers for every item are in `.claude/qa-shots/critique-{mobile,code}.md` (ids M-xx / F-xx). The desktop critic did not finish (quota), so 1280/1440 were reviewed inline. Items are grouped as issue classes: one fix at the source per class.

| # | Sev | Class | Issue | Reach | Refs |
| --- | --- | --- | --- | --- | --- |
| 1 | High | Typography | **KPI numbers break mid-figure.** "2.62B" renders one glyph per line (Character, ≤768 px) and Progress highscore cards read "1,28 / 5". The cause is `overflow-wrap: anywhere` on figures that are shrinking flex items. | Character, Progress · 375/768 | M-01, known |
| 2 | High | Layout | **Mobile keeps desktop gutters.** 32 px stage padding plus 24 px panel padding leaves about 263 px of content at 375. A 96 px header reserve covers the whole header, so ledes wrap into 5–7 lines. | every page · ≤700 | F-13, M-04 |
| 3 | High | Accessibility | **Text contrast and link visibility.** Blue text is 3.17:1 (2.76:1 in `.pill-info`) and red text 3.69:1 in light mode. Links in prose have no colour or underline (WCAG 1.4.1), and link pills look exactly like label pills. | 8 pages · all | F-01, M-09, F-15, contrast.mjs |
| 4 | High | Accessibility | **State visibility.** The focus ring is clipped inside `overflow` scrollers (segmented, rule filters, next-hunts). Sort-menu focus looks the same as hover. There is no current-page mark on the icon rail or tab bar. | every page · all | F-02, F-03 |
| 5 | High | Technical | **Mobile input ergonomics.** Fields render at 12–14 px, so iOS zooms on focus. Controls under 44 px: segmented (30), back link (20), `<summary>` (16), stepper (26 wide), Home shortcuts (36), attention link (20), pill links (20), table links (28). | daily-loop pages · ≤700 | F-04, F-06, M-12 |
| 6 | Med | Layout | **Grid track counts orphan cards.** Home KPIs 4+1 (1280) and 3+2 (768); 4-card rows 3+1 (768); Character stats 4+2; Codex 3+3+2; facts 6+2; Tools KPIs 2+1. Character KPIs are forced into 4 columns at 768. | 7 pages | F-11, M-07 |
| 7 | Med | Layout | **Horizontal scrollers hide content with no cue.** Segmented filters are clipped ("40…", "Harn…", "Norma…") at every width. The heatmap and the month tabs open at the oldest end. | Planner, Codex, Character | M-03, F-14, F-17 |
| 8 | Med | Components | **Dark-mode states collapse into their surface.** The pressed segment is darker than its track and its shadow is invisible. Empty meter lanes, trust segments, "Less" heatmap cells and nested-card borders vanish (≈1.05:1). | 6 pages · dark | F-09, M-02 (part) |
| 9 | Med | Layout | **Tools grid.** The 23-card imbuement list sits in one narrow column while Profit floats alone about 1,000 px lower. `.tool-head` titles wrap beside their subtitles at every width. | Tools · all | F-12, known |
| 10 | Med | Typography | **Off-scale type.** Imbuement cards render at the UA 13.33 px. Nested `<b>` renders at weight 900. h3 renders at 15/16/18. The Codex lore and behaviour paragraphs use two inline styles. `--fs-17`/`--fs-22` are one-rule outliers. | Tools, dossiers, Character | F-23, M-16, known |
| 11 | Med | Components | **Empty states have five looks,** and the CTA wraps "Log a / hunt" at 768. Planner/Codex "no results" occupies one grid cell. | 6 pages | M-08, F-16 |
| 12 | Med | Accessibility | **Focus drops to `<body>`** after Show more, opening or closing a dossier, Logbook delete, and imbuement price edits. | Planner, Codex, Logbook, Tools | F-05 |
| 13 | Med | Accessibility | **Names, roles, headings.** The wordmark has no name at 701–1100. The next-hunts links carry `role=listitem`. `bars()`/`flow()` SVGs are unnamed. Home and Character sections have no headings. The stamina live region re-announces every minute. | every page | F-07, F-29, F-08 |
| 14 | Med | Components | **Charts at phone width.** `bars()` clips the first glyph of each label and leaves a 57 px lane. `flow()` draws about 150 full-size event discs. The multi-year axis has no years. | Progress | M-05, M-06 |
| 15 | Low | Components | **Button state gaps.** Destructive has no hover. Hover still recolours disabled buttons. There is no pressed state. The stepper disabled opacity is .4 vs .3 elsewhere. | all | F-24 |
| 16 | Low | Components | **Native select chevrons and heights** don't match the sort menu and inputs in the same row (40/41/42 px). | Planner, Tools | M-20, F-20c |
| 17 | Low | Clarity | **Redundant counts.** The in-bar count sits above the count line. `dataTable` always prints "N rows". | Planner, Codex, dossiers | M-14, F-25 (part) |
| 18 | Low | Clarity | **Log step 1.** The realistic placeholder reads as pre-filled input. "Backend: This browser" is developer wording. Future steps are near-invisible in dark. | Log | M-19 |
| 19 | Low | Clarity | **Charms deep link** lands with the selected card below the fold. | Charms `?charm=` | M-18 |
| 20 | Low | Technical | **Hygiene.** The reduced-motion shimmer flickers. There are dead `th` sort affordances and `.section-bar a.fine`, duplicate `.wordmark svg`, unneeded `!important`, and invalid content models (`<div>` in `<button>`, two controls in one `<label>`). | all | F-26, F-27, F-28 |
| 21 | Low | Technical | **Loot names show `&#39;`** (double-escaped TibiaData entities in generated `codex-extra.json`). Planner cards list lowercase creature keys. | Codex dossier, Planner | M-10, F-19 |

## Done

| # | Commit | What changed at the source | Verified |
| --- | --- | --- | --- |
| 1 | `b25e52d` | Figures `white-space: nowrap`. The inline sparkline shrinks, then wraps below the value. Highscore values wrap under their label. Character KPIs go 2-up ≤1000 px. | Character and Progress at 320/375/768/1280, both themes. No overflow (one 10 px overflow found at 1280 on the first try and fixed before commit). |
| 2 | `27fa48f` | ≤700 px: stage gutters 16 px, `.panel-pad` 16 px. The utility-cluster reserve is a float beside the page head's first lines (Home: its first rows; Character: the hero). Two `!important`s removed. | 11 states at 320/375. Planner lede goes from 5 lines to 4 at full width, "400+" is no longer clipped, and Tools card titles fit one line. |
| 3 | `9c27c37` | New `--ink-info`/`--ink-error` text tones (light 0,100,183 / 196,30,48; dark 64,172,255 / 255,105,115). `--ink-success` nudged to 0,122,18. Every text use of `--blue`/`--red` is routed to them. Prose links get the info tone and an underline; `a.pill` gets a link cue. | Every text/surface pair ≥4.5:1 in both themes (`contrast.mjs`). Dossier links are visible. |
| 4 (+15) | `065aff9` | Focus rings inside scrollers use `outline-offset: -2px`. Sort-menu focus keeps the ring. The current rail/tab icon gets a 2.4 stroke. Buttons: pressed state (`opacity .7`), destructive hover, no hover while disabled. Segmented, rule filters, back link, attention link and disclosures get hovers. Stepper disabled opacity is .3. | Keyboard Tab on Planner at 375 dark: ring fully visible, compass bolder. |
| 5 | `cca57a5` | ≤700 px: fields and the sort button at 16 px (no iOS zoom). Segmented, Home shortcuts, back link, attention link and summary reach ≥44 px. Link pills, table links and number-only steps get an invisible 44 px hit halo. | Undersized mobile targets 87 → 11. The 11 are halo'd pill/table links that the box measurement can't see. |
| 6 | `67219ae` | KPI rows: `minmax(150px)` (Home fits 5 at 1280), 2-up below 1000 px with an odd last card spanning. Character stats 3+3 at tablet width. `.facts` capped at 4 columns. Codex tiles auto-fill at 240 px, opening at 12. Tools KPIs pair up with a spanning odd cell. | Home, Character, Codex, dossiers, Charms, Tools and Progress at 768/1280, both themes. No orphan rows, no overflow. |
| 7 | `197a7d4` | `.segmented` wraps instead of scrolling behind a hidden scrollbar. The Codex "Every class"/"Task speed" sets take a full filter row. `.sheet` tables get scroll-edge shadows. The heatmap opens at its newest week. | Planner "400+" and Codex Medium/Trivial are no longer clipped. At 375 the heatmap shows September. |
| 8 | `651af70` | New `--surface-selected` (pressed segment) and `--track` (meter lanes, trust segments, heatmap cells, level track); light values equal what they replace. Cards nested in a panel use the `--stroke` border. | At 1280 dark, the pressed segment sits lighter than its track and empty lanes are visible. |
| 9 | `8233bcd` | Tools: Profit follows Level target, and the imbuement calculator spans the last row (cards 3–4 across). `.tool-head` subtitles wrap below their titles. | Tools at 1280 goes from ~3,050 to 2,160 px tall. |
| 10 | `8425afe` | `.imb-card` inherits its font at 14 px (was UA 13.33). `b, strong` are 700 (no 900). `.prose` replaces two inline paragraph styles. Section h3 is 16. 17→18 and 22→20. Invalid `<div>` inside `<button>` replaced with spans. | The type census on the affected pages has only scale sizes and weights 400/600/700. |
| 11 | `732d111` | `emptyState()` in shell.js is one treatment everywhere; its CTA never wraps. No-results spans the grid. Recent deaths uses `vizEmpty`. | Charms 768 "Log a hunt" on one line; the Planner no-match state is full-width. |
| 12 | `1c15545` | Focus: dossier h1 on open, the tile on close, the first new card after Show more, Undo after a Logbook delete, and the successor card after the imbuement dialog. | Planner: open → H1, close → same tile, more → index 6. Tools dialog verified in a visible headless page (the pane's hidden tab never fires `close`). |
| 13 | `b338dac` | Rail labels are visually hidden rather than `display:none` (the wordmark has a name). The next-hunts tray is a `<ul>`. `bars()`/`flow()` carry `aria-label` data summaries. Home/Character eyebrow titles are `<h2>`. The stamina clock tick is silent. Tools errors use `note('error')` with `aria-invalid`. Stamina fields drop `inputmode=numeric` (no ":" key). | Heading outline on every page. `iconButtonsNoName` is empty at 768. |
| 14 | `96ee2a0` | `bars()` label column fits the longest label at 7 px/glyph (≤40%). Dense `flow()` series get small events. The multi-year Daily XP axis shows month + year. Board titles become chart names. | Progress at 375: whole labels, a readable line, "Oct 2024 · Nov 2025 · Sep 2026". |
| 16 | `1741fae` | Fields share a 20 px line box (42 px everywhere). `select` draws the sort menu's chevron from two `--ink-2` gradient strokes. | Planner 768 light/dark: inputs, selects and sort all measure 42 px. |
| 17–19 | `19900d8` | In-bar result counts removed; `dataTable` counts only above 10 rows. `?charm=` opens on the selected card. The Log example is labelled as one. "Backend:" → "Saves to:". Upcoming steps stay legible in dark. | Charms deep link at 375 shows the card first. |
| 20 | `11ace93` | Inline styles moved to classes (`.facts-3`, `.critter-link`, dossier section spacing). Charm stages on two lines. Dead `th` pointer cursor and `.section-bar a.fine` removed. Reduced motion runs one iteration. Price rows no longer nest two controls in one `<label>`. | Charm facts "Stage 1 / 5%"; dossier spacing unchanged. |
| 21 | `b95cf6c` | `decodeEntities()` in lib/text.js, applied where the engine reads cached loot and at capture in `enrich-codex`. Smoke asserts it. Planner cards use Bestiary display names. | Dragon dossier "dragon's tails"; cards "Naga Warrior · Naga Archer · Makara". |
| (M-17) | `6014fc1` | Home KPIs are two-up on phones like every other KPI row. | 320/375: Next hunt is on the first screen. |
| (regressions caught in review) | `eb25803`, `53b36fd` | The scoped header reserve had also narrowed Character's level bar, so it was removed from `.character-hero`. The Tools KPI pairing had broken the one-row layout wide cards already had, so a container query on `.tool-card` restores three-across at ≥400 px card width. | After shots: Character bar full width. Tools KPIs 1 row at 768/1280 and 2 rows at 375/1440 (narrow cards). |

## Done criteria (after set: 96 captures, `.claude/qa-shots/after/report.json`)

| Criterion | Result |
| --- | --- |
| No horizontal overflow at 375/768/1280/1440, both themes | 0 of 96 captures overflow (320 px also checked on the pages that changed). |
| All text on the type scale | No off-scale rendered size (13.33, 17 and 22 are gone). No weight 900. Spacing uses `--s*`, except the documented 2/6/10 px half-steps (§12 #9). |
| Consistent hover/focus/active/disabled | Every interactive component in the state matrix has hover, a visible focus ring, pressed, and a non-hover disabled state (critique-code.md §1, cycles 4 and 12). |
| No console errors; tests pass | 0 console errors or warnings in 96 captures. `node pipeline/smoke.mjs` and `node --check` pass on every touched file. |
| No high-severity item left outside "Needs decision" | Issues 1–5 (all High) are done. What remains is Low or listed under Needs decision. |
| Mobile targets ≥ 44 px | Undersized items at 375: 278 → 6. The 6 are table/pill links and number-only steps with an invisible 44 px hit halo. Links inside sentences are WCAG-exempt. |

Before/after pairs for the largest changes are in `.claude/qa-shots/compare/`.

## Removed (restorable from the commit named)

- **Planner filter-bar count** "167 grounds · 189 rows" and **Codex filter-bar count** "833 creatures" (`19900d8`). Each duplicated the "Showing N of M" line directly below it.
- **`dataTable` "N rows" footer** on tables of 10 rows or fewer (`19900d8`). It restated a count the section bar already gives, or one visible at a glance.
- **Dead CSS** `.section-bar a.fine` and the `th` pointer cursor (`11ace93`). No element matched the first; no table is sortable.

## Remaining (deliberately left, lower priority)

- **Codex filter stack on phones is tall.** Wrapping made all 20 classes visible, but "Every class" now takes about six rows at 375. The fix depends on the filter-collapse decision below.
- **Table row dividers in dark mode** (`--line` 38 on raised 33) remain faint. Part of the dark token-spacing decision below.
- **Admin duplicate rows and some dossier margins** still carry token-valued inline styles (`admin.js`, `grounds.js` facts, `tools.js` 6 px note).
- **Home copy.** "Open hunt planner" opens the ground's dossier. "Log a hunt" appears three times above the tab bar (M-14/F-25). Both are copy/IA calls.
- **Log a hunt Confirm step.** Save sits in the form while Back has its own row (F-25).
- **Semantics.** `.back-link` is a `<button>` that `pushState`s. A link would allow open-in-new-tab (F-28).
- **Inline pill/table links** measure 20–28 px by box. They carry an invisible 44 px hit halo, which `report.json` cannot see.

## Needs decision

Owner calls, not guessed. Each needs a decision before code changes.

- **Mobile filter collapse.** Owner commit `b2b5221` ("Show Codex and Planner filters by default") removed the disclosure; AGENTS.md §5 still mandates `.filter-toggle/.filter-more`. On mobile, Planner shows about 900 px of filters before any result. The layout-only density fixes in this pass do not hide anything. (M-03 note, §12 #14)
- **Brand-exact colours below AA.**
  - White on `#0095F6` `.btn-primary` is 3.17:1.
  - `.badge` is white on green (2.27), orange (2.61) and red (3.69).
  - `--ink-2` on `--surface-2`/`--wash` is 4.34/4.12.
  - All three are §5 "source-exact" values.
- **Dark-mode token spacing.** Dark `--line`/`--wash`/`--surface-btn2` sit within 5 levels of `--surface-raised`, so `.btn-secondary` and table dividers vanish inside panels. The fix is to change the source token values or add a raised-context secondary. (M-02, F-10)
- **44 pt at tablet/coarse pointer.** Extend the ≤700 px touch contract to `(pointer: coarse)`? That would widen the 2026-07-16 decision. (M-13)
- **Progress "Best targets"** rank every vocation for a Druid (all 20 rows are Sorcerer). Should they be scoped like the Planner and Character? (M-11)
- **Dossier battle advice is population-wide:** "Lead with Holy" for a Druid. Should it be vocation-scoped? (F-22)
- **Tooltip-only data.** Stand-in provenance, charm affordability and the KPI spread are hover-only. Stand-in provenance is owner-directed to be a tooltip. (F-21)
- **Codex class filters.** The top-3 "Class" and the 20-option "Every class" are two controls for one state, and Sort is segmented. Both tie to §12 #4 and to the filter-collapse question above. (M-14, F-14)
- **Time-true charts.** `flow()` spaces points by index, so tracker gaps collapse. Plotting by date is a chart-semantics change. (F-18)
- Already open in AGENTS.md §12: radius contract (#1), spacing half-step tokens (#9), stray breakpoints (#9).
