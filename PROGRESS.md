# PROGRESS — visual/UX quality audit (branch claude/visual-ux-quality-audit-7aada4)

Checkpoint ledger. Read first after any interruption. NO MORE AGENTS — work inline (quota).

## Done
- Harness: `.claude/qa-shots/shoot.mjs` + `run-all.sh` (resumable; Chrome drops CDP every ~20 pages, script skips shots on disk). Run: `.claude/qa-shots/run-all.sh <outDir> --full [--pages a,b --widths 375,1280]` (set EXPECT=n for subsets). Server: preview config `worktree` port 8093.
- Baseline `.claude/qa-shots/before/` — 12 states × 375/768/1280/1440 × light/dark (96 png + full jpg + report.json). No overflow, no console errors.
- Contrast `.claude/qa-shots/contrast.mjs`: light blue text 3.17, pill-info 2.76, red text 3.69, ink-2 on surface-2 4.34.
- Critiques on disk: `.claude/qa-shots/critique-mobile.md`, `critique-code.md`. Desktop critic died with quota — do desktop review inline (do NOT relaunch).
- `DESIGN_QA.md` drafted: method, inventory, target scales. Issue list still empty.

## Remaining
1. Inline desktop review (1280/1440 light full jpgs) → merge with the two critiques → ranked issue list in `DESIGN_QA.md`.
2. Fix loop, one issue class per commit (smoke + node --check + re-shoot affected pages to `.claude/qa-shots/after/`), update `DESIGN_QA.md` + this file after each.
3. Final report.

## Key results
- Owner commit b2b5221 deliberately shows Planner/Codex filters by default → do NOT re-hide; "Needs decision" (conflicts with §5 text). Layout-only density fixes are OK.
- Known fixes queued: Character Total-experience KPI breaks per char (≤768; `.metric-value-row`); 4-col dashboard-metrics cramped at 768; imb-card buttons render 13.33px UA font; `b` inside 600 parents → 900; mobile targets <44 (segmented 30px, home shortcuts 36, attention links, back-link, summary, stepper); blue/red text contrast → add `--ink-info`/`--ink-error` like `--ink-success`; tool-head h2 wraps beside subtitle on mobile; mobile header reserve narrows lede; Home KPI orphan row at 1280 (5 cards, 4 cols).
- AGENTS.md binding: tokens only, §5 UI rules, §12 = owner decisions.

## Files changed
- `PROGRESS.md`, `DESIGN_QA.md` (new, uncommitted)

## Next step
- Read `critique-mobile.md` and `critique-code.md`, review desktop shots inline, write ranked issue list into `DESIGN_QA.md`, commit docs, then start fix cycle 1 (Character KPI break + dashboard grid).
