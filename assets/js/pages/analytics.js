/** Progression analytics — XP history, highscores and personal hunt performance. */

import { boot } from './_boot.js';
import { esc } from '../lib/text.js';
import { DAY_MS, compact, nf, kk, hm, day, md, ym } from '../lib/fmt.js';
import { average, tally } from '../lib/stats.js';
import { hourly } from '../engine/ledger.js';
import { dailyGains } from '../engine/progression.js';
import { bars, flow, flowLegend, sparkline, attachVizHover, categorical, donut, chartInto, vizEmpty } from '../viz/svg.js';
import { loadCharacter, loadCharacterHistory } from '../data/sources.js';
import { HIGHSCORE_CATEGORIES } from '../engine/highscores.js';
import { metric, note } from '../shell.js';

const { stage, hunts, table, config } = await boot('analytics.html', { ledger: true, config: true });
const [history, profile] = await Promise.all([
  loadCharacterHistory().catch(() => []),
  loadCharacter().catch(() => null),
]);
const characterName = profile?.name || config.name;

const label = (r) => [r.ground, r.vocation || 'Party', r.levelText].filter(Boolean).join(' · ');
const latest = history.at(-1) || null;
// gap-free only: a tracker gap never becomes one fabricated spike day
const gains = dailyGains(history);
const deaths = profile?.deaths || [];
const chartEvents = (date) => {
  const events = [];
  const row = history.find((r) => r.date === date);
  const prevRow = history[history.findIndex((r) => r.date === date) - 1];
  if (row && prevRow && row.level > prevRow.level) events.push({ type: 'level', label: `Reached level ${nf(row.level)}` });
  deaths.filter((d) => String(d.time || '').slice(0, 10) === date).forEach((d) => {
    events.push({ type: 'death', label: d.reason || `Died at level ${nf(d.level)}` });
  });
  return events;
};
const dailyXp = gains.map((g) => ({ key: md(g.date), label: g.date, n: g.gain, events: chartEvents(g.date) }));
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdayBuckets = WEEKDAYS.map((name) => ({ name, gains: [] }));
for (const g of gains) weekdayBuckets[new Date(`${g.date}T00:00:00Z`).getUTCDay()].gains.push(g.gain);
const weekdayXp = weekdayBuckets
  .filter((row) => row.gains.length)
  .map((row) => ({ key: `${row.name} (${nf(row.gains.length)}d)`, n: average(row.gains) }));

function signed(value, fmt = nf) {
  if (value == null || !Number.isFinite(value)) return '<span class="dim">—</span>';
  return `<em class="metric-delta ${value > 0 ? 'up' : value < 0 ? 'down' : 'even'}">${value > 0 ? '+' : ''}${fmt(value)}</em>`;
}

const highscoreTrends = HIGHSCORE_CATEGORIES.map((s) => {
  const series = history
    .filter((row) => row[s.valueField] != null)
    .map((row) => ({ key: md(row.date), n: row[s.valueField] }));
  const values = new Set(series.map((row) => row.n));
  const latestPoint = series.at(-1);
  const previousPoint = series.length > 1 ? series.at(-2) : null;
  const firstPoint = series[0];
  return {
    ...s,
    series,
    moving: series.length >= 2 && values.size >= 2,
    value: latestPoint?.n ?? null,
    lastDelta: latestPoint && previousPoint ? latestPoint.n - previousPoint.n : null,
    trackedDelta: latestPoint && firstPoint ? latestPoint.n - firstPoint.n : null,
  };
}).filter((s) => s.value != null);

function highscoreTrendCard(s) {
  return `
    <article class="panel skill-card">
      <div class="skill-card-head">
        <div>
          <h3>${s.label}</h3>
          <p class="fine dim">${nf(s.series.length)} tracked row${s.series.length === 1 ? '' : 's'} · independent scale</p>
        </div>
        <b class="num">${nf(s.value)}</b>
      </div>
      <div class="mini-metrics">
        <span><b class="num">${signed(s.lastDelta)}</b><small>Last change</small></span>
        <span><b class="num">${signed(s.trackedDelta)}</b><small>Tracked delta</small></span>
      </div>
      <div class="sparkline">
        ${s.moving ? mount(`hs-${s.valueField}`, (width) => sparkline(s.series, { width, fmt: nf })) : vizEmpty('No trend drawn until this metric has at least two distinct values.')}
      </div>
    </article>`;
}

const topXp = table.filter((r) => r.xpRawRate != null)
  .sort((a, b) => b.xpRawRate - a.xpRawRate).slice(0, 10)
  .map((r) => ({ key: label(r), n: r.xpRawRate }));

const topProfit = table.filter((r) => r.profitRate != null)
  .sort((a, b) => b.profitRate - a.profitRate).slice(0, 10)
  .map((r) => ({ key: label(r), n: r.profitRate }));

const busiest = tally(hunts, (h) => h.ground).slice(0, 10);

const perMonth = tally(hunts, (h) => String(h.loggedAt || '').slice(0, 7))
  .sort((a, b) => a.key.localeCompare(b.key))
  .map(({ key, n }) => ({ key: ym(key), n }));

const topKills = tally(
  hunts.flatMap((h) => h.kills || []),
  (k) => k.name,
  (k) => k.n || 0,
).slice(0, 10);

const topDrops = tally(
  hunts.flatMap((h) => h.drops || []),
  (d) => d.name,
  (d) => d.n || 0,
).slice(0, 10);

const byVocation = tally(hunts, (h) => h.vocation || (h.party ? 'Team' : 'Unknown'));

const meanMinutes = average(hunts.map((h) => h.minutes).filter((m) => m > 0));
const meanXp = average(hunts.map((h) => hourly(h).xpRawRate).filter((value) => value != null));
const meanProfit = average(hunts.map((h) => hourly(h).profitRate).filter((p) => p != null));
const totalProfit = hunts.some((hunt) => hunt.balance != null)
  ? hunts.reduce((sum, hunt) => sum + (hunt.balance || 0), 0)
  : null;
const totalHuntXp = hunts.some((hunt) => hunt.xpRaw != null)
  ? hunts.reduce((sum, hunt) => sum + (hunt.xpRaw || 0), 0)
  : null;
const lastGain = latest && gains.at(-1)?.date === latest.date ? gains.at(-1).gain : null;

/**
 * Charts mount into placeholder divs after the page renders (chartInto), so
 * each draws at its container's true pixel width and its text sits exactly
 * on the design-system type scale.
 */
const MOUNTS = new Map();
const mount = (id, build) => { MOUNTS.set(id, build); return `<div class="chart-mount" data-mount="${id}"></div>`; };

const board = (title, data, body) => (data.length ? `
  <section class="section">
    <div class="section-bar"><h2>${title}</h2></div>
    <div class="panel panel-pad viz">${body}</div>
  </section>` : '');

// ---------------------------------------------------------------- profit share by ground

// A ground only appears here if it has at least one hunt with a real
// (non-null) positive profit balance — never zero-filled for grounds that
// were only logged without a balance, and a loss-making ground has no
// meaningful "share" of positive profit so it stays out of the donut too.
const profitByGround = tally(
  hunts.filter((h) => h.balance != null),
  (h) => h.ground,
  (h) => h.balance,
).filter((d) => d.n > 0).slice(0, 10);

function profitShareBoard(data) {
  if (!data.length) return '';
  // fixed-order categorical assignment from viz/svg.js — never cycled; the
  // tail past the five brand hues folds into one grey "Other" row
  const rows = categorical(data);
  const total = rows.reduce((sum, d) => sum + d.n, 0);
  const legend = rows.map((d) => `
    <li><i class="donut-swatch" style="background:rgb(var(${d.color}))"></i>
      <span>${esc(d.key)}</span>
      <b class="num">${kk(d.n)}</b>
      <small>${Math.round((d.n / total) * 100)}%</small>
    </li>`).join('');
  return `
    <section class="section">
      <div class="section-bar"><h2>Profit share by ground</h2><span class="fine dim">${nf(data.length)} ground${data.length === 1 ? '' : 's'} with logged profit</span></div>
      <div class="panel panel-pad viz donut-board">
        <div class="donut-chart">${donut(rows, { fmt: kk, label: 'Profit share by ground' })}</div>
        <ul class="donut-legend">${legend}</ul>
      </div>
    </section>`;
}

// ---------------------------------------------------------------- this week vs last week

const addDays = (dateStr, n) => new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const isoWeekStart = (dateStr) => addDays(dateStr, -((new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7));

const todayKey = day(new Date().toISOString());
const thisWeekStart = isoWeekStart(todayKey);
const lastWeekStart = addDays(thisWeekStart, -7);
// Comparing a partial "this week" against a full prior week would overstate
// a shortfall, so the prior week is windowed to the same elapsed day count.
const elapsedDays = Math.min(7, Math.round((new Date(`${todayKey}T00:00:00Z`) - new Date(`${thisWeekStart}T00:00:00Z`)) / DAY_MS) + 1);
const thisWeekDates = Array.from({ length: elapsedDays }, (_, i) => addDays(thisWeekStart, i));
const lastWeekDates = Array.from({ length: elapsedDays }, (_, i) => addDays(lastWeekStart, i));

const dailyGainByDate = new Map(gains.map((g) => [g.date, g.gain]));

// A window's XP total is only honest when every day in it has a real,
// gap-free tracked delta (see the daily-XP gap comment above) — one missing
// day makes the whole window's total null rather than an understated number.
const windowXp = (dates) => {
  const gains = dates.map((d) => dailyGainByDate.get(d));
  return gains.every((g) => g != null) ? gains.reduce((a, b) => a + b, 0) : null;
};
const windowHunts = (dates) => {
  const set = new Set(dates);
  return hunts.filter((h) => set.has(day(h.loggedAt)));
};
const weekWindow = (dates) => {
  const list = windowHunts(dates);
  const profitHunts = list.filter((h) => h.balance != null);
  return {
    start: dates[0],
    end: dates.at(-1),
    xp: windowXp(dates),
    huntsCount: list.length,
    profit: profitHunts.length ? profitHunts.reduce((sum, h) => sum + h.balance, 0) : null,
  };
};

const thisWeek = weekWindow(thisWeekDates);
const lastWeek = weekWindow(lastWeekDates);

// The comparison only makes sense once tracking (character history or
// logged hunts) actually reaches back into the prior window; otherwise a
// "0 vs 0" reading would look like a real flat week instead of no evidence.
const earliestTracked = history[0]?.date ?? null;
const earliestHuntDate = hunts.length ? hunts.map((h) => day(h.loggedAt)).sort()[0] : null;
const weekComparisonReady = (earliestTracked != null && earliestTracked <= lastWeekStart)
  || (earliestHuntDate != null && earliestHuntDate <= lastWeekStart);

function weekTone(current, prior) {
  if (current == null || prior == null) return null;
  if (prior <= 0) return current > 0 ? { tone: 'up', pct: null } : { tone: 'even', pct: null };
  const pct = Math.round(((current - prior) / prior) * 100);
  return { tone: Math.abs(pct) < 8 ? 'even' : pct > 0 ? 'up' : 'down', pct };
}
const profitTone = weekTone(thisWeek.profit, lastWeek.profit);
const xpTone = weekTone(thisWeek.xp, lastWeek.xp);
const leadTone = profitTone || xpTone;

function weekHeadline() {
  if (!leadTone) return 'Not enough matching profit or XP data in this window yet to call a direction.';
  const usingProfit = !!profitTone;
  const cur = usingProfit ? thisWeek.profit : thisWeek.xp;
  const pri = usingProfit ? lastWeek.profit : lastWeek.xp;
  const metric = usingProfit ? 'profit' : 'XP';
  // formatting semantics: gold wears Tibia-style kk, XP wears compact M/B
  const fmt = usingProfit ? kk : compact;
  if (leadTone.tone === 'even') return `about even with last week — ${fmt(cur)} vs ${fmt(pri)} ${metric}`;
  return `${Math.abs(leadTone.pct)}% ${leadTone.tone === 'up' ? 'ahead of' : 'behind'} last week — ${fmt(cur)} vs ${fmt(pri)} ${metric}`;
}

function weekComparisonBoard() {
  const rangeLabel = `${elapsedDays === 7 ? 'This week' : `First ${nf(elapsedDays)} day${elapsedDays === 1 ? '' : 's'} of this week`} (${thisWeek.start} to ${thisWeek.end}) vs the same span last week (${lastWeek.start} to ${lastWeek.end})`;
  if (!weekComparisonReady) {
    return `
      <section class="section">
        <div class="section-bar"><h2>This week vs last week</h2></div>
        ${note('warning', `Not enough data yet — this comparison needs tracked history or logged hunts reaching back into last week (${lastWeek.start} to ${lastWeek.end}).`)}
      </section>`;
  }
  return `
    <section class="section">
      <div class="section-bar"><h2>This week vs last week</h2></div>
      <div class="pace-band pace-${leadTone?.tone || 'even'}">
        <div class="pace-message">
          <b>${esc(weekHeadline())}</b>
          <span class="fine dim">${esc(rangeLabel)}</span>
        </div>
        <div class="pace-support">
          <span><b class="num">${signed(thisWeek.xp != null && lastWeek.xp != null ? thisWeek.xp - lastWeek.xp : null, compact)}</b><small>XP</small></span>
          <span><b class="num">${signed(thisWeek.profit != null && lastWeek.profit != null ? thisWeek.profit - lastWeek.profit : null, kk)}</b><small>Profit</small></span>
          <span><b class="num">${signed(thisWeek.huntsCount - lastWeek.huntsCount)}</b><small>Hunts logged</small></span>
        </div>
      </div>
    </section>`;
}

stage.innerHTML = `
  <header class="page-head">
    <h1>Analytics</h1>
    <p class="dim">Progression and hunt performance, with ${esc(characterName)}'s tracker and ${nf(hunts.length)} saved analyser session${hunts.length === 1 ? '' : 's'} kept distinct.</p>
  </header>
  <div class="metric-row">
    ${metric('Sessions', nf(hunts.length), meanMinutes != null ? `${hm(meanMinutes)} average` : `${nf(history.length)} tracked days`)}
    ${metric('Avg XP / hour', compact(meanXp), 'from saved analysers')}
    ${metric('Total profit', compact(totalProfit), meanProfit != null ? `${compact(meanProfit)}/h average` : 'no profit evidence yet')}
    ${metric('Total hunt XP', compact(totalHuntXp), lastGain != null ? `${compact(lastGain)} latest daily gain` : 'saved sessions only')}
  </div>
  ${board('Daily XP gain', dailyXp, mount('daily-xp', (width) => flow(dailyXp, { width, fmt: compact })) + flowLegend(dailyXp, 'XP/day', compact))}
  <div class="analytics-duo">
    ${board('Avg XP gain by weekday', weekdayXp, mount('weekday-xp', (width) => bars(weekdayXp, { width, fmt: compact })))}
    ${profitShareBoard(profitByGround)}
  </div>
  ${weekComparisonBoard()}
  ${highscoreTrends.length ? `<section class="section">
    <div class="section-bar"><h2>Tracked highscores</h2><span class="fine dim">each category gets its own scale and readiness state</span></div>
    <div class="skill-grid">${highscoreTrends.map(highscoreTrendCard).join('')}</div>
  </section>` : ''}
  ${board('Best XP targets', topXp, mount('top-xp', (width) => bars(topXp, { width, fmt: compact })))}
  ${board('Best profit targets', topProfit, mount('top-profit', (width) => bars(topProfit, { width })))}
  ${board('Busiest grounds', busiest, mount('busiest', (width) => bars(busiest, { width, fmt: nf })))}
  ${board('Hunts logged over time', perMonth, mount('per-month', (width) => flow(perMonth, { width, fmt: nf })))}
  ${board('Most killed creatures', topKills, mount('top-kills', (width) => bars(topKills, { width, fmt: nf })))}
  ${board('Most looted items', topDrops, mount('top-drops', (width) => bars(topDrops, { width, fmt: nf })))}
  ${board('Hunts by vocation', byVocation, mount('by-vocation', (width) => bars(byVocation, { width, fmt: nf })))}
  ${hunts.length ? '' : `<section class="section">${note('warning', 'Personal hunt boards light up after the first analyser is saved. XP and highscore tracking already run from the character history.')}</section>`}`;
document.querySelectorAll('[data-mount]').forEach((el) => chartInto(el, MOUNTS.get(el.dataset.mount)));
document.querySelectorAll('.viz').forEach((panel) => attachVizHover(panel));

export {};
