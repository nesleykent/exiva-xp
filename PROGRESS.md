# PROGRESS — visual/UX quality audit (branch claude/visual-ux-quality-audit-7aada4)

Checkpoint ledger. Read first after any interruption. NO MORE AGENTS — work inline (quota).

## Done
- Harness: `.claude/qa-shots/shoot.mjs` + `run-all.sh` (resumable; Chrome drops CDP every ~20 pages, script skips shots on disk). Run: `.claude/qa-shots/run-all.sh <outDir> --full [--pages a,b --widths 375,1280]` (set EXPECT=n for subsets). Server: preview config `worktree` port 8093.
- Baseline `.claude/qa-shots/before/` — 12 states × 375/768/1280/1440 × light/dark (96 png + full jpg + report.json). No overflow, no console errors.
- Contrast `.claude/qa-shots/contrast.mjs`: light blue text 3.17, pill-info 2.76, red text 3.69, ink-2 on surface-2 4.34.
- Critiques on disk: `.claude/qa-shots/critique-mobile.md`, `critique-code.md`. Desktop critic died with quota — do desktop review inline (do NOT relaunch).
- `DESIGN_QA.md` complete: inventory, target scales, 21 ranked issues, Needs decision (commit 46a8daa).
- Cycles done (DESIGN_QA #): 1 figures b25e52d · 2 gutters 27fa48f · 3 text tones+links 9c27c37 · 4 states (+#15 buttons) 065aff9 · 5 mobile targets+16px fields cca57a5 · 6 grid orphans 67219ae · 7 scrollers 197a7d4 · 8 dark tracks/selected 651af70 · 9 tools grid 8233bcd · 10 type scale 8425afe · 11 empty states 732d111 · 12 focus survives re-render 1c15545 · 13 names/headings/live region b338dac · 14 charts 96ee2a0 · 16 selects 1741fae · 17-19 counts/deeplink/log copy 19900d8 · 20 hygiene 11ace93 · 21 loot/names b95cf6c · M-17 home 2-up 6014fc1. DESIGN_QA Done/Removed/Remaining written; AGENTS §9 entry + §12 #16 added.
- `.claude/qa-shots/evaljs.mjs <url> <jsfile>` runs JS in a VISIBLE headless page (the browser pane is `visibilityState: hidden`, so dialog `close` events never fire there). After-shots `.claude/qa-shots/after-cN`.
- NOTE: browser pane caches CSS — force `fetch(u,{cache:'reload'})` then reload before judging. Preview server must be running (harness exits 2 if not).

## Remaining
2. Fix loop, one issue class per commit (smoke + node --check + re-shoot affected pages to `.claude/qa-shots/after/`), update `DESIGN_QA.md` + this file after each.
3. Final report.

## Key results
- Owner commit b2b5221 deliberately shows Planner/Codex filters by default → do NOT re-hide; "Needs decision" (conflicts with §5 text). Layout-only density fixes are OK.
- Known fixes queued: Character Total-experience KPI breaks per char (≤768; `.metric-value-row`); 4-col dashboard-metrics cramped at 768; imb-card buttons render 13.33px UA font; `b` inside 600 parents → 900; mobile targets <44 (segmented 30px, home shortcuts 36, attention links, back-link, summary, stepper); blue/red text contrast → add `--ink-info`/`--ink-error` like `--ink-success`; tool-head h2 wraps beside subtitle on mobile; mobile header reserve narrows lede; Home KPI orphan row at 1280 (5 cards, 4 cols).
- AGENTS.md binding: tokens only, §5 UI rules, §12 = owner decisions.

## Files changed
- `assets/css/base.css`, `assets/css/pages.css` — cycles 1-5
- `DESIGN_QA.md`, `PROGRESS.md` — docs

## Next step
- Full after capture running → `.claude/qa-shots/after/` (96). Then: verify done criteria from `after/report.json` (overflow 0, console 0, font sizes on scale, small targets), add a 'Done criteria' section to DESIGN_QA.md, make before/after comparison crops for the final report, commit, write final report in chat.
