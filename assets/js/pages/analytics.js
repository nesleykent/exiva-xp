/** Progression analytics — XP history, highscores and personal hunt performance. */

import { boot } from './_boot.js';
import { esc } from '../lib/text.js';
import { compact, nf, kk, hm, day } from '../lib/fmt.js';
import { average, tally } from '../lib/stats.js';
import { hourly } from '../engine/ledger.js';
import { bars, flow, sparkline, attachFlowHover } from '../viz/svg.js';
import { loadCharacter, loadCharacterHistory } from '../data/sources.js';
import { HIGHSCORE_CATEGORIES } from '../engine/highscores.js';

const { stage, hunts, table, config } = await boot('analytics.html', { ledger: true, config: true });
const [history, profile] = await Promise.all([
  loadCharacterHistory().catch(() => []),
  loadCharacter().catch(() => null),
]);
const characterName = profile?.name || config.name;

const label = (r) => [r.ground, r.vocation || 'Party', r.levelText].filter(Boolean).join(' · ');
const latest = history.at(-1) || null;
const previous = history.at(-2) || null;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// Tracker gaps (see AGENTS.md) leave adjacent rows more than a day apart;
// attributing that whole span's XP delta to a single day would fabricate a
// spike out of weeks of real progress, so gaps are skipped entirely here.
const isConsecutiveDay = (a, b) => (new Date(b.date) - new Date(a.date)) === ONE_DAY_MS;
const dailyXp = [];
for (let i = 1; i < history.length; i++) {
  if (!isConsecutiveDay(history[i - 1], history[i])) continue;
  dailyXp.push({ key: history[i].date.slice(5), n: Math.max(0, history[i].experience - history[i - 1].experience) });
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdayBuckets = WEEKDAYS.map((name) => ({ name, gains: [] }));
for (let i = 1; i < history.length; i++) {
  if (!isConsecutiveDay(history[i - 1], history[i])) continue;
  const gain = Math.max(0, history[i].experience - history[i - 1].experience);
  const day = new Date(`${history[i].date}T00:00:00Z`).getUTCDay();
  weekdayBuckets[day].gains.push(gain);
}
const weekdayXp = weekdayBuckets
  .filter((row) => row.gains.length)
  .map((row) => ({ key: `${row.name} (${nf(row.gains.length)}d)`, n: average(row.gains) }));

function signed(value, fmt = nf) {
  if (value == null || !Number.isFinite(value)) return '<span class="dim">-</span>';
  if (value === 0) return `<span class="dim">${fmt(value)}</span>`;
  return `<span class="${value > 0 ? 'ok' : 'bad'}">${value > 0 ? '+' : ''}${fmt(value)}</span>`;
}

const highscoreTrends = HIGHSCORE_CATEGORIES.map((s) => {
  const series = history
    .filter((row) => row[s.valueField] != null)
    .map((row) => ({ key: row.date.slice(5), n: row[s.valueField] }));
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
        ${s.moving ? sparkline(s.series, { fmt: nf }) : '<span class="fine dim">No trend drawn until this metric has at least two distinct values.</span>'}
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
  .sort((a, b) => a.key.localeCompare(b.key));

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
const lastGain = latest && previous && isConsecutiveDay(previous, latest)
  ? Math.max(0, latest.experience - previous.experience) : null;

const board = (title, data, svg) => (data.length ? `
  <section class="section">
    <div class="section-bar"><h2>${title}</h2></div>
    <div class="panel panel-pad viz">${svg}</div>
  </section>` : '');

// ---------------------------------------------------------------- profit share by ground

// A ground only appears here if it has at least one hunt with a real
// (non-null) profit balance — never zero-filled for grounds that were only
// ever logged without a balance.
const profitByGround = tally(
  hunts.filter((h) => h.balance != null),
  (h) => h.ground,
  (h) => h.balance,
).slice(0, 10);

// Element colours (--c-*) are this project's only categorical data palette
// (AGENTS.md §5); cycling them for donut segments matches their sanctioned
// "meter" use rather than inventing a new chart accent set.
const DONUT_COLORS = ['--c-ice', '--c-fire', '--c-earth', '--c-energy', '--c-holy', '--c-death', '--c-physical'];

/** Hand-rolled donut (stacked stroke-dasharray arcs on one circle) — no
 * chart library, same inline-SVG convention as viz/svg.js's bars()/flow(). */
function profitShareDonut(data, total) {
  const size = 200;
  const r = 74;
  const cx = size / 2;
  const cy = size / 2;
  const sw = 30;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const arcs = data.map((d, i) => {
    const frac = d.n / total;
    const dash = Math.max(0.5, frac * circumference);
    const seg = `<circle class="vdonut-seg" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgb(var(${DONUT_COLORS[i % DONUT_COLORS.length]}))" stroke-width="${sw}" stroke-dasharray="${dash.toFixed(1)} ${(circumference - dash).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(d.key)}: ${kk(d.n)} (${Math.round(frac * 100)}%)</title></circle>`;
    offset += dash;
    return seg;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Profit share by ground" xmlns="http://www.w3.org/2000/svg">${arcs}<text class="vdonut-total" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central">${kk(total)}</text></svg>`;
}

function profitShareBoard(data) {
  if (!data.length) return '';
  const total = data.reduce((sum, d) => sum + d.n, 0);
  const legend = data.map((d, i) => `
    <li><i class="donut-swatch" style="background:rgb(var(${DONUT_COLORS[i % DONUT_COLORS.length]}))"></i>
      <span>${esc(d.key)}</span>
      <b class="num">${kk(d.n)}</b>
      <small>${Math.round((d.n / total) * 100)}%</small>
    </li>`).join('');
  return `
    <section class="section">
      <div class="section-bar"><h2>Profit share by ground</h2><span class="fine dim">${nf(data.length)} ground${data.length === 1 ? '' : 's'} with logged profit</span></div>
      <div class="panel panel-pad viz donut-board">
        <div class="donut-chart">${profitShareDonut(data, total)}</div>
        <ul class="donut-legend">${legend}</ul>
      </div>
    </section>`;
}

// ---------------------------------------------------------------- this week vs last week

const ONE_DAY = 24 * 60 * 60 * 1000;
const addDays = (dateStr, n) => new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + n * ONE_DAY).toISOString().slice(0, 10);
const isoWeekStart = (dateStr) => addDays(dateStr, -((new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7));

const todayKey = day(new Date().toISOString());
const thisWeekStart = isoWeekStart(todayKey);
const lastWeekStart = addDays(thisWeekStart, -7);
// Comparing a partial "this week" against a full prior week would overstate
// a shortfall, so the prior week is windowed to the same elapsed day count.
const elapsedDays = Math.min(7, Math.round((new Date(`${todayKey}T00:00:00Z`) - new Date(`${thisWeekStart}T00:00:00Z`)) / ONE_DAY) + 1);
const thisWeekDates = Array.from({ length: elapsedDays }, (_, i) => addDays(thisWeekStart, i));
const lastWeekDates = Array.from({ length: elapsedDays }, (_, i) => addDays(lastWeekStart, i));

const dailyGainByDate = new Map();
for (let i = 1; i < history.length; i++) {
  if (!isConsecutiveDay(history[i - 1], history[i])) continue;
  dailyGainByDate.set(history[i].date, Math.max(0, history[i].experience - history[i - 1].experience));
}

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
  const fmt = kk;
  if (leadTone.tone === 'even') return `about even with last week — ${fmt(cur)} vs ${fmt(pri)} ${metric}`;
  return `${Math.abs(leadTone.pct)}% ${leadTone.tone === 'up' ? 'ahead of' : 'behind'} last week — ${fmt(cur)} vs ${fmt(pri)} ${metric}`;
}

function weekComparisonBoard() {
  const rangeLabel = `${elapsedDays === 7 ? 'This week' : `First ${nf(elapsedDays)} day${elapsedDays === 1 ? '' : 's'} of this week`} (${thisWeek.start} to ${thisWeek.end}) vs the same span last week (${lastWeek.start} to ${lastWeek.end})`;
  if (!weekComparisonReady) {
    return `
      <section class="section">
        <div class="section-bar"><h2>This week vs last week</h2></div>
        <div class="note note-amber">Not enough data yet — this comparison needs tracked history or logged hunts reaching back into last week (${lastWeek.start} to ${lastWeek.end}).</div>
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
          <span><b class="num">${signed(thisWeek.xp != null && lastWeek.xp != null ? thisWeek.xp - lastWeek.xp : null, kk)}</b><small>XP</small></span>
          <span><b class="num">${signed(thisWeek.profit != null && lastWeek.profit != null ? thisWeek.profit - lastWeek.profit : null, kk)}</b><small>Profit</small></span>
          <span><b class="num">${signed(thisWeek.huntsCount - lastWeek.huntsCount)}</b><small>Hunts logged</small></span>
        </div>
      </div>
    </section>`;
}

stage.innerHTML = `
  <header style="padding: 8px 0 4px">
    <h1 style="font-size:26px; letter-spacing:-.4px">Analytics</h1>
    <p class="dim">Progression and hunt performance, with ${esc(characterName)}'s tracker and ${nf(hunts.length)} saved analyser session${hunts.length === 1 ? '' : 's'} kept distinct.</p>
  </header>
  <div class="pulse-row">
    <div class="panel pulse"><div class="eyebrow">Sessions</div><div class="big num">${nf(hunts.length)}</div><div class="fine dim">${meanMinutes != null ? `${hm(meanMinutes)} average` : `${nf(history.length)} tracked days`}</div></div>
    <div class="panel pulse"><div class="eyebrow">Avg XP / hour</div><div class="big num">${meanXp != null ? compact(meanXp) : '—'}</div><div class="fine dim">from saved analysers</div></div>
    <div class="panel pulse"><div class="eyebrow">Total profit</div><div class="big num">${totalProfit != null ? compact(totalProfit) : '—'}</div><div class="fine dim">${meanProfit != null ? `${compact(meanProfit)}/h average` : 'no profit evidence yet'}</div></div>
    <div class="panel pulse"><div class="eyebrow">Total hunt XP</div><div class="big num">${totalHuntXp != null ? compact(totalHuntXp) : '—'}</div><div class="fine dim">${lastGain != null ? `${compact(lastGain)} latest daily gain` : 'saved sessions only'}</div></div>
  </div>
  ${board('Daily XP gain', dailyXp, flow(dailyXp, { fmt: compact }))}
  <div class="analytics-duo">
    ${board('Avg XP gain by weekday', weekdayXp, bars(weekdayXp))}
    ${profitShareBoard(profitByGround)}
  </div>
  ${weekComparisonBoard()}
  ${highscoreTrends.length ? `<section class="section">
    <div class="section-bar"><h2>Tracked highscores</h2><span class="fine dim">each category gets its own scale and readiness state</span></div>
    <div class="skill-grid">${highscoreTrends.map(highscoreTrendCard).join('')}</div>
  </section>` : ''}
  ${board('Best XP targets', topXp, bars(topXp))}
  ${board('Best profit targets', topProfit, bars(topProfit))}
  ${board('Busiest grounds', busiest, bars(busiest, { fmt: nf }))}
  ${board('Hunts logged over time', perMonth, flow(perMonth))}
  ${board('Most killed creatures', topKills, bars(topKills, { fmt: nf }))}
  ${board('Most looted items', topDrops, bars(topDrops, { fmt: nf }))}
  ${board('Hunts by vocation', byVocation, bars(byVocation, { fmt: nf }))}
  ${hunts.length ? '' : '<div class="note note-amber" style="margin-top:24px">Personal hunt boards light up after the first analyser is saved. XP and highscore tracking already run from the character history.</div>'}`;
document.querySelectorAll('.viz').forEach((panel) => { if (panel.querySelector('.vdot')) attachFlowHover(panel); });

export {};
