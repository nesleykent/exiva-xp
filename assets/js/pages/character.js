/**
 * Character - the tracked character's dashboard (config.ini): generated profile, progression,
 * highscores, deaths, and shortcuts into the planning tools.
 */

import { boot } from './_boot.js';
import { esc } from '../lib/text.js';
import { compact, kk, nf, day, hm, md } from '../lib/fmt.js';
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_STORAGE_KEY,
  dateKeyInTimezone,
  formatDateInTimezone,
  formatDateTimeInTimezone,
} from '../lib/timezones.js';
import { $, ring } from '../shell.js';
import { flow, sparkline, attachVizHover, chartInto, refreshCharts } from '../viz/svg.js';
import { loadCharacter, loadCharacterHistory, logbook } from '../data/sources.js';
import { experienceForLevel, experienceUntilNextLevel, progressWithinLevel, nextMilestoneLevel } from '../engine/progression.js';
import { HIGHSCORE_CATEGORIES } from '../engine/highscores.js';

const { stage, table, config } = await boot('character.html', { ledger: true, config: true });
const [profile, history] = await Promise.all([
  loadCharacter(),
  loadCharacterHistory(),
]);
const timezone = loadTimezone();

const latest = history.at(-1) || null;
const profileLevel = profile?.level ?? null;
const trackedLevel = latest?.level ?? null;
const level = profileLevel ?? trackedLevel;
const experience = latest?.experience ?? null;
const historyNote = latest && profileLevel != null && trackedLevel != null && profileLevel !== trackedLevel
  ? `Profile shows level ${nf(profileLevel)}; last recorded update shows level ${nf(trackedLevel)} on ${latest.date}`
  : 'Updated automatically';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const historyRows = history.map((row, i) => {
  const prev = history[i - 1] || null;
  // A tracker gap (see AGENTS.md, backfill sources drop out for weeks at a
  // time) leaves adjacent rows more than a day apart; treating that span's
  // whole XP delta as this row's "gain" would fabricate a single-day spike
  // out of weeks of real progress, so gain is null across a gap. levelDelta
  // stays a raw delta regardless — the table showing it always shows both
  // rows' dates too, so a multi-level jump reads honestly as one.
  const consecutiveDay = prev && (new Date(row.date) - new Date(prev.date)) === ONE_DAY_MS;
  const gain = consecutiveDay ? Math.max(0, row.experience - prev.experience) : null;
  return {
    ...row,
    gain,
    levelDelta: prev ? row.level - prev.level : null,
    rankDelta: prev && row.rank != null && prev.rank != null ? row.rank - prev.rank : null,
    xpToNext: experienceUntilNextLevel(row.level, row.experience),
    progress: progressWithinLevel(row.level, row.experience),
  };
});

const gains = historyRows.filter((row) => row.gain != null).map((row) => ({ key: row.date.slice(5), n: row.gain }));

// Level-up log, derived from the daily rows: every day the tracked level rose.
const levelUpsChronological = historyRows
  .filter((row) => row.levelDelta > 0)
  .map((row) => ({ date: row.date, level: row.level, step: row.levelDelta }));
const levelUps = [...levelUpsChronological].reverse();

// Default prediction pace: mean of the last 7 recorded daily gains (zeros
// count because rest days are part of the real pace).
const recentGains = gains.slice(-7).map((g) => g.n);
const avgDailyXp = recentGains.length ? Math.round(recentGains.reduce((a, b) => a + b, 0) / recentGains.length) : null;

/** Earliest recorded value of a highscore field; the delta window is the whole history. */
function firstKnown(field) {
  for (const e of history) if (e[field] != null) return { value: e[field], date: e.date };
  return null;
}

function highscoreSeries(field) {
  return history
    .filter((row) => row[field] != null)
    .map((row) => ({ id: row.date, key: md(row.date), n: row[field] }));
}

const deaths = [...(profile?.deaths || [])].reverse();
const myHunts = logbook();
const characterVocation = profile?.vocation || '';
const compatibleRows = level == null ? [] : table.filter((r) =>
  r.xpRawRate != null
  && r.level != null
  && r.level <= level
  && isVocationCompatible(r.vocation, characterVocation));
const grounds4me = [...new Map(
  compatibleRows
    .sort((a, b) => b.xpRawRate - a.xpRawRate)
    .map((r) => [r.groundSlug, r]),
).values()].slice(0, 10);

const highscoreRows = latest ? HIGHSCORE_CATEGORIES
  .filter(({ valueField }) => latest[valueField] != null)
  .map((category) => {
    const { category: rankKey, valueField, rankField, label, kind } = category;
    const first = firstKnown(valueField);
    const value = latest[valueField];
    const series = highscoreSeries(valueField);
    const values = series.map((row) => row.n);
    const previousValue = values.length > 1 ? values.at(-2) : null;
    const latestRank = latest[rankField] ?? profile?.highscoreRanks?.[rankKey] ?? profile?.skillRanks?.[rankKey] ?? null;
    return {
      key: valueField,
      rankKey,
      label,
      kind,
      value,
      rank: latestRank,
      firstDate: first?.date ?? null,
      delta: first ? value - first.value : null,
      lastDelta: previousValue != null ? value - previousValue : null,
      series,
    };
  }) : [];

const recentHunts = [...myHunts]
  .sort((a, b) => String(b.loggedAt || '').localeCompare(String(a.loggedAt || '')))
  .slice(0, 8);

function loadTimezone() {
  try {
    return localStorage.getItem(TIMEZONE_STORAGE_KEY) || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function plain(value) {
  return value == null || value === '' ? '<span class="dim">-</span>' : esc(String(value));
}

function signed(value, fmt = nf) {
  if (value == null || !Number.isFinite(value)) return '<span class="dim">-</span>';
  if (value === 0) return `<span class="dim">${fmt(value)}</span>`;
  return `<span class="${value > 0 ? 'ok' : 'bad'}">${value > 0 ? '+' : ''}${fmt(value)}</span>`;
}

function fmtDateTime(iso) {
  return iso ? formatDateTimeInTimezone(iso, timezone) : null;
}

function fmtDateOnly(iso) {
  return iso ? formatDateInTimezone(iso, timezone) : null;
}

function norm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function isVocationCompatible(rowVocation, profileVocation) {
  if (!rowVocation) return true;
  const row = norm(rowVocation);
  const character = norm(profileVocation);
  if (!row || !character) return true;
  if (row === character) return true;
  if (character.includes('druid')) return row.includes('druid');
  if (character.includes('sorcerer')) return row.includes('sorcerer') || row === 'mage';
  if (character.includes('knight')) return row.includes('knight');
  if (character.includes('paladin')) return row.includes('paladin');
  return row === character;
}

function tableHtml(columns, rows, empty) {
  if (!rows.length) return `<div class="panel panel-pad dim">${esc(empty || 'No rows yet.')}</div>`;
  return `<div class="sheet panel"><table class="grid">
    <thead><tr>${columns.map((col) => `<th${col.className ? ` class="${esc(col.className)}"` : ''}>${esc(col.label)}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>${columns.map((col) => `<td${col.className ? ` class="${esc(col.className)}"` : ''}>${col.cell(row)}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table></div>`;
}

function levelCadence() {
  if (levelUpsChronological.length < 3) return null;
  const gaps = [];
  for (let i = 1; i < levelUpsChronological.length; i++) {
    const previous = new Date(`${levelUpsChronological[i - 1].date}T00:00:00Z`);
    const next = new Date(`${levelUpsChronological[i].date}T00:00:00Z`);
    const days = Math.round((next - previous) / 86_400_000);
    if (Number.isFinite(days) && days >= 0) gaps.push(days);
  }
  if (gaps.length < 2) return null;
  return {
    recent: avg(gaps.slice(-5)),
    all: avg(gaps),
  };
}

const chartYears = [...new Set(historyRows.map((row) => row.date.slice(0, 4)))].sort();
const monthsInYear = (year) => [...new Set(historyRows.filter((row) => row.date.startsWith(year)).map((row) => row.date.slice(5, 7)))].sort();
const MONTH_NAME = { '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec' };

function xpRowsForChart(metric, { year, month }) {
  let rows = historyRows;
  if (year !== 'all') rows = rows.filter((row) => row.date.startsWith(month === 'all' ? year : `${year}-${month}`));
  if (metric === 'daily') {
    return {
      title: 'Daily XP gained',
      note: `${rows.filter((row) => row.gain != null).length} days with a recorded gain`,
      baseline: 'zero',
      fmt: compact,
      data: rows.filter((row) => row.gain != null).map((row) => chartPoint(row, row.gain)),
    };
  }
  if (metric === 'level') {
    return {
      title: 'Character level',
      note: `${rows.length} days recorded`,
      baseline: 'min',
      fmt: nf,
      data: rows.map((row) => chartPoint(row, row.level)),
    };
  }
  if (metric === 'rank') {
    const rankRows = rows.filter((row) => row.rank != null);
    return {
      title: 'World XP rank',
      note: `${rankRows.length} days with a recorded rank; lower number is better`,
      baseline: 'min',
      fmt: (value) => `#${nf(value)}`,
      data: rankRows.map((row) => chartPoint(row, row.rank)),
    };
  }
  return {
    title: 'Total experience',
    note: `${rows.length} days recorded`,
    baseline: 'min',
    fmt: compact,
    data: rows.map((row) => chartPoint(row, row.experience)),
  };
}

function profileGroupHtml(title, rows) {
  const clean = rows.filter(([, value]) => value != null && value !== '');
  if (!clean.length) return '';
  return `
    <article class="profile-group">
      <h3>${esc(title)}</h3>
      <dl>
        ${clean.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${plain(value)}</dd></div>`).join('')}
      </dl>
    </article>`;
}

/** Stable, rarely-changing facts — kept out of the primary view since
 * nothing here answers "what should I do now". */
function characterDetailsHtml() {
  const houses = profile?.houses?.length ? profile.houses.map((h) => `${h.name} (${h.town})`).join(', ') : null;
  return `
    <div class="profile-groups">
      ${profileGroupHtml('Identity', [
        ['Name', profile?.name],
        ['Sex', profile?.sex],
        ['Vocation', profile?.vocation],
        ['World', profile?.world],
        ['Loyalty title', profile?.loyaltyTitle],
      ])}
      ${profileGroupHtml('Place', [
        ['Residence', profile?.residence],
        ['House', houses],
      ])}
      ${profileGroupHtml('Dates', [
        ['Last login', fmtDateTime(profile?.lastLogin)],
        ['Account created', fmtDateOnly(profile?.accountCreated)],
        ['Profile updated', fmtDateTime(profile?.updatedAt)],
      ])}
    </div>`;
}

function deltaSpan(delta) {
  if (!delta) return '';
  return ` <span class="fine dim">(${delta > 0 ? '+' : ''}${nf(delta)})</span>`;
}

/** GuildStats-style daily history: date, exp gained, rank/level with their
 * day-over-day delta, and running total experience — most recent day first.
 * Time online / avg exp per hour aren't in TibiaData highscores, so unlike
 * a scraped guildstats.eu table this doesn't fabricate those two columns. */
function dailyHistoryTableHtml() {
  const rows = [...historyRows].reverse();
  const totalGain = historyRows.reduce((sum, row) => sum + (row.gain || 0), 0);
  const totalLevelChange = historyRows.length > 1 ? historyRows.at(-1).level - historyRows[0].level : 0;
  return `
    <div class="sheet panel"><table class="grid">
      <thead><tr>
        <th>When</th>
        <th class="num">Exp change</th>
        <th class="num">Rank</th>
        <th class="num">Level</th>
        <th class="num">Experience</th>
      </tr></thead>
      <tbody>
        ${rows.map((row) => `<tr>
          <td>${esc(row.date)}</td>
          <td class="num">${row.gain != null ? `+${nf(row.gain)}` : '<span class="dim">-</span>'}</td>
          <td class="num">${row.rank != null ? nf(row.rank) : '<span class="dim">-</span>'}${deltaSpan(row.rankDelta)}</td>
          <td class="num">${nf(row.level)}${deltaSpan(row.levelDelta)}</td>
          <td class="num">${nf(row.experience)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr>
        <td>Total</td>
        <td class="num">+${nf(totalGain)}</td>
        <td class="num"></td>
        <td class="num">${totalLevelChange > 0 ? '+' : ''}${nf(totalLevelChange)}</td>
        <td class="num"></td>
      </tr></tfoot>
    </table></div>`;
}

function deathsTableHtml() {
  return tableHtml([
    { label: 'When', cell: (row) => esc(fmtDateTime(row.time) || day(row.time)) },
    { label: 'Level', className: 'num', cell: (row) => nf(row.level) },
    { label: 'Details', cell: (row) => esc(row.reason || '') },
  ], deaths, 'No deaths on record.');
}

function huntColumns() {
  return [
    { label: 'When', cell: (row) => esc(fmtDateOnly(row.loggedAt) || day(row.loggedAt)) },
    { label: 'Ground', cell: (row) => esc(row.ground || '-') },
    { label: 'Minutes', className: 'num', cell: (row) => row.minutes != null ? hm(row.minutes) : '<span class="dim">-</span>' },
    { label: 'Raw XP/h', className: 'num', cell: (row) => row.xpRawRate != null ? kk(row.xpRawRate) : '<span class="dim">-</span>' },
    { label: 'Profit/h', className: 'num', cell: (row) => row.balance != null && row.minutes ? kk((row.balance / row.minutes) * 60) : '<span class="dim">-</span>' },
    { label: 'Balance', className: 'num', cell: (row) => row.balance != null ? kk(row.balance) : '<span class="dim">-</span>' },
    { label: 'Kills', className: 'num', cell: (row) => nf((row.kills || []).reduce((sum, kill) => sum + (kill.n || 0), 0)) },
  ];
}

function huntTableHtml() {
  return tableHtml(huntColumns(), recentHunts, 'No saved analyser sessions in this browser yet.');
}

/** Task tabs replace the old hash-link section rail. They preserve browser
 * history, keep one deep-dive workflow visible at a time, and support the
 * WAI-ARIA tab keyboard model without changing the URL. */
function bindCharacterTabs() {
  const list = $('[role="tablist"]');
  if (!list) return;
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls'))).filter(Boolean);
  const select = (tab, focus = false) => {
    tabs.forEach((candidate) => {
      const active = candidate === tab;
      candidate.setAttribute('aria-selected', String(active));
      candidate.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => { panel.hidden = panel.id !== tab.getAttribute('aria-controls'); });
    refreshCharts(); // a just-revealed panel's charts now have a real width to render at
    if (focus) tab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (event) => {
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs.at(-1);
      if (!next) return;
      event.preventDefault();
      select(next, true);
    });
  });
}

function avg(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function gainAverage(days) {
  return avg(historyRows.slice(-days).map((row) => row.gain).filter((gain) => gain != null));
}

function chartEvents(date) {
  const events = [];
  const levelUp = levelUpsChronological.find((row) => row.date === date);
  if (levelUp) events.push({ type: 'level', label: `Reached level ${nf(levelUp.level)}` });
  deaths.filter((row) => String(row.time || '').slice(0, 10) === date).forEach((row) => {
    events.push({ type: 'death', label: row.reason || `Died at level ${nf(row.level)}` });
  });
  return events;
}

function chartPoint(row, n) {
  // short axis label; the canonical ISO date rides along for the tooltip
  return { id: row.date, key: md(row.date), label: row.date, n, events: chartEvents(row.date) };
}

function xpDetailHtml(row = historyRows.at(-1)) {
  if (!row) return '<p class="dim">No day selected yet.</p>';
  const prev = historyRows[historyRows.findIndex((r) => r.date === row.date) - 1] || null;
  const gained = row.gain == null ? '<span class="dim">-</span>' : `+${nf(row.gain)}`;
  const isToday = row.date === dateKeyInTimezone(new Date(), timezone);
  return `
    <div class="inspector-head">
      <b>${esc(row.date)}</b>
      ${isToday ? '<span class="badge badge-success">Today</span>' : ''}
    </div>
    <div class="mini-metrics">
      <span><b class="num">${nf(row.level)}</b><small>Level</small></span>
      <span><b class="num">${gained}</b><small>XP gain</small></span>
      <span><b class="num">${compact(row.xpToNext)}</b><small>XP to next</small></span>
      <span><b class="num">${row.progress.toFixed(1)}%</b><small>Level progress</small></span>
      <span><b class="num">${row.rank ? `#${nf(row.rank)}` : '-'}</b><small>Rank</small></span>
      <span><b class="num">${prev ? signed(row.level - prev.level) : '<span class="dim">-</span>'}</b><small>Level change</small></span>
    </div>`;
}

function sampledSeries(series, maxPoints = 40) {
  if (series.length <= maxPoints) return series;
  const out = [];
  const last = series.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    out.push(series[Math.round((i / (maxPoints - 1)) * last)]);
  }
  return out;
}

/** The one metric worth a full trend card — the rest read faster as a compact list. */
function highscoreFeatureHtml(row) {
  const hasTrend = row.series.length >= 2 && new Set(row.series.map((point) => point.n)).size >= 2;
  return `
    <article class="panel skill-feature">
      <div class="skill-card-head">
        <div>
          <h3>${esc(row.label)}</h3>
          <p class="fine dim">${esc(row.kind)} · ${row.firstDate ? `history since ${esc(row.firstDate)}` : 'new this update'}</p>
        </div>
        <b class="num">${nf(row.value)}</b>
      </div>
      <div class="mini-metrics">
        <span><b class="num">${row.rank != null ? `#${nf(row.rank)}` : '-'}</b><small>Current rank</small></span>
        <span><b class="num">${signed(row.lastDelta)}</b><small>Last change</small></span>
        <span><b class="num">${signed(row.delta)}</b><small>All-time change</small></span>
      </div>
      <div class="sparkline sparkline-lg"${hasTrend ? ' id="hs-feature-spark"' : ''}>
        ${hasTrend ? '' : '<p class="viz-empty">Trend appears after the next update for this skill.</p>'}
      </div>
    </article>`;
}

function highscoreRowHtml(row) {
  return `
    <div class="hs-row">
      <div class="hs-row-label">
        <b>${esc(row.label)}</b>
        <span class="fine dim">${esc(row.kind)}</span>
      </div>
      <div class="hs-row-value">
        <b class="num">${nf(row.value)}</b>
        <span class="fine dim">${row.rank != null ? `#${nf(row.rank)}` : '-'} · ${signed(row.delta)}</span>
      </div>
    </div>`;
}

const avg7 = gainAverage(7);
const avg30 = gainAverage(30);
const bestProfitHunt = myHunts
  .filter((hunt) => hunt.balance != null && hunt.minutes > 0)
  .map((hunt) => ({ ...hunt, profitRate: (hunt.balance / hunt.minutes) * 60 }))
  .sort((a, b) => b.profitRate - a.profitRate)[0] || null;
const cadenceTrend = levelCadence();
const featuredHighscore = highscoreRows.find((row) => row.key === 'experience') || highscoreRows[0] || null;
const secondaryHighscores = highscoreRows.filter((row) => row !== featuredHighscore);

/** This week's pace vs the 30-day average, as a conclusion rather than two
 * raw numbers — the one line the page should say before anything else. */
function paceInsight() {
  if (avg7 == null || avg30 == null || avg30 <= 0) return null;
  const deltaPct = Math.round(((avg7 - avg30) / avg30) * 100);
  const tone = Math.abs(deltaPct) < 8 ? 'even' : deltaPct > 0 ? 'up' : 'down';
  const text = tone === 'even'
    ? `right on your usual pace — averaging ${kk(avg7)} XP/day this week`
    : `${Math.abs(deltaPct)}% ${tone === 'up' ? 'ahead of' : 'behind'} your 30-day pace — ${kk(avg7)} vs ${kk(avg30)} XP/day`;
  return { tone, deltaPct, text };
}

/** Straight arithmetic to the next 50-level milestone at the recent pace. */
function levelProjection() {
  if (trackedLevel == null || experience == null || !avgDailyXp) return null;
  const target = nextMilestoneLevel(trackedLevel);
  const needed = experienceForLevel(target) - experience;
  if (needed <= 0) return null;
  const days = Math.ceil(needed / avgDailyXp);
  const eta = new Date(Date.now() + days * 86_400_000);
  return { target, days, eta: eta.toISOString().slice(0, 10) };
}

const insight = paceInsight();
const projection = levelProjection();
const levelProgressPct = trackedLevel != null && experience != null ? progressWithinLevel(trackedLevel, experience) : null;

/** XP gained month-to-date. Total experience is cumulative, so the delta
 * across the window is honest even when the tracker has gaps inside it. */
function monthToDateGain() {
  if (!latest || experience == null) return null;
  const monthPrefix = latest.date.slice(0, 7);
  const before = [...historyRows].reverse().find((row) => row.date.slice(0, 7) < monthPrefix);
  if (!before) return null;
  return experience - before.experience;
}

/** Overall profit rate across the logbook — only sessions with a real balance and duration. */
function profitPerHour() {
  const rated = myHunts.filter((hunt) => hunt.balance != null && hunt.minutes > 0);
  if (!rated.length) return null;
  const minutes = rated.reduce((sum, hunt) => sum + hunt.minutes, 0);
  return { rate: (rated.reduce((sum, hunt) => sum + hunt.balance, 0) / minutes) * 60, n: rated.length };
}

const monthGain = monthToDateGain();
const profitRate = profitPerHour();
const charmPoints = latest?.charmPoints ?? null;
const charmFirst = firstKnown('charmPoints');
const charmDelta = charmPoints != null && charmFirst != null && charmFirst.value !== charmPoints
  ? charmPoints - charmFirst.value : null;
const totalXpSpark = sampledSeries(historyRows.map((row) => ({ key: md(row.date), n: row.experience })), 24);

const metricDelta = (text, tone) => (text == null ? '' : `<em class="metric-delta ${tone}">${text}</em>`);

/** Template-aligned KPI row: value, coloured delta, context line — one card per question. */
function progressionOverviewHtml() {
  return `
    <div class="dashboard-metrics" aria-label="Progression at a glance">
      <article class="panel dashboard-metric dashboard-metric-featured">
        <span class="eyebrow">Total experience</span>
        <b class="num">${experience != null ? compact(experience) : '-'}</b>
        <small>${monthGain != null ? `${metricDelta(`+${compact(monthGain)}`, 'up')} this month` : esc(historyNote)}</small>
        ${totalXpSpark.length >= 2 ? '<div class="metric-spark" id="xp-total-spark"></div>' : ''}
      </article>
      <article class="panel dashboard-metric">
        <span class="eyebrow">XP / day pace</span>
        <b class="num">${avgDailyXp != null ? compact(avgDailyXp) : '-'}</b>
        <small>${insight ? `${metricDelta(`${insight.deltaPct > 0 ? '+' : ''}${insight.deltaPct}%`, insight.tone)} vs 30-day average` : (recentGains.length ? `${nf(recentGains.length)} recent recorded days` : 'Not enough pace data yet')}</small>
      </article>
      <article class="panel dashboard-metric">
        <span class="eyebrow">Profit / hour</span>
        <b class="num">${profitRate ? `${kk(profitRate.rate)} gp` : '-'}</b>
        <small>${profitRate ? `across ${nf(profitRate.n)} logged hunt${profitRate.n === 1 ? '' : 's'}` : 'No logged hunts yet'}</small>
      </article>
      <article class="panel dashboard-metric">
        <span class="eyebrow">Charm points</span>
        <b class="num">${charmPoints != null ? nf(charmPoints) : '-'}</b>
        <small>${charmPoints == null ? 'Not tracked yet'
    : charmDelta != null ? `${metricDelta(`+${nf(charmDelta)}`, 'up')} since ${esc(charmFirst.date)}`
      : 'earned points · tracked highscore'}</small>
      </article>
    </div>`;
}

function projectionControlsHtml() {
  if (trackedLevel == null || experience == null || avgDailyXp == null) return '';
  return `
    <div class="projection-tools">
      <div class="section-subhead first"><h3>Adjust target and pace</h3><span class="fine dim">defaults to the last ${nf(recentGains.length)} days</span></div>
      <div class="tool-fields">
        <label class="lbl lbl-narrow"><span class="eyebrow">Target level</span><input id="pred-level" type="number" min="${trackedLevel + 1}" max="2000" value="${nextMilestoneLevel(trackedLevel)}"></label>
        <label class="lbl"><span class="eyebrow">Avg daily exp</span><input id="pred-pace" type="number" min="1" value="${avgDailyXp}"></label>
      </div>
      <div class="tool-result" id="pred-out"></div>
    </div>`;
}

/**
 * GitHub-style intensity grid over the last 26 tracked weeks of daily XP
 * gain. A day with no gap-free measurement renders as a distinct "unknown"
 * cell, never as zero — thresholds are quartiles of the real positive gains.
 */
function activityHeatmapHtml() {
  if (!latest || historyRows.length < 14) return '<p class="viz-empty">Not enough tracked days yet.</p>';
  const gainByDate = new Map(historyRows.map((row) => [row.date, row.gain]));
  const positives = historyRows.map((row) => row.gain).filter((gain) => gain > 0).sort((a, b) => a - b);
  const quart = (p) => positives.length ? positives[Math.min(positives.length - 1, Math.floor(p * positives.length))] : Infinity;
  const t1 = quart(0.25), t2 = quart(0.5), t3 = quart(0.75);
  const levelOf = (gain) => (gain <= 0 ? 0 : gain <= t1 ? 1 : gain <= t2 ? 2 : gain <= t3 ? 3 : 4);
  const end = new Date(`${latest.date}T00:00:00Z`);
  const endWeekday = (end.getUTCDay() + 6) % 7;
  const start = new Date(end.getTime() - (25 * 7 + endWeekday) * ONE_DAY_MS);
  const weeks = [];
  for (let w = 0; w < 26; w++) {
    const first = new Date(start.getTime() + w * 7 * ONE_DAY_MS);
    const prev = new Date(first.getTime() - 7 * ONE_DAY_MS);
    const label = w === 0 || first.getUTCMonth() !== prev.getUTCMonth()
      ? first.toLocaleDateString('en', { month: 'short', timeZone: 'UTC' }) : '';
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const dayDate = new Date(start.getTime() + (w * 7 + d) * ONE_DAY_MS);
      if (dayDate > end) { cells.push('<i class="hm hm-void"></i>'); continue; }
      const key = dayDate.toISOString().slice(0, 10);
      const gain = gainByDate.get(key);
      // data-v/data-l feed the shared viz tooltip (value leads, date follows)
      cells.push(gain == null
        ? `<i class="hm hm-null" data-v="No measurement" data-l="${key}"></i>`
        : `<i class="hm hm-${levelOf(gain)}" data-v="+${compact(gain)} XP" data-l="${key}"></i>`);
    }
    weeks.push(`<div class="hm-week"><span class="hm-month">${label}</span>${cells.join('')}</div>`);
  }
  return `
    <div class="heatmap" role="img" aria-label="Daily XP gain intensity over the last 26 tracked weeks">${weeks.join('')}</div>
    <div class="hm-legend fine dim"><span>Less</span><i class="hm hm-0"></i><i class="hm hm-1"></i><i class="hm hm-2"></i><i class="hm hm-3"></i><i class="hm hm-4"></i><span>More</span><i class="hm hm-null"></i><span>not tracked</span></div>`;
}

/** The three latest recorded deaths; the complete table stays in Details. */
function recentDeathsHtml() {
  if (!deaths.length) return '<p class="dim">No deaths on record.</p>';
  return `<ul class="death-list">${deaths.slice(0, 3).map((row) => `
    <li>
      <i class="death-dot" aria-hidden="true"></i>
      <div>
        <p>${esc(row.reason || 'Death')}</p>
        <p class="fine dim">${esc(fmtDateOnly(row.time) || day(row.time))} · level ${nf(row.level)}</p>
      </div>
    </li>`).join('')}</ul>`;
}

const groundsTable = tableHtml([
  { label: 'Ground', cell: (row) => `<a href="grounds.html?g=${esc(row.groundSlug)}">${esc(row.ground)}</a>` },
  { label: 'Level', className: 'num', cell: (row) => plain(row.levelText || (row.level != null ? `${row.level}+` : null)) },
  { label: 'Vocation', cell: (row) => plain(row.vocation || (row.party ? 'Team' : null)) },
  { label: 'Mode', cell: (row) => row.party ? '<span class="pill">Team</span>' : '<span class="pill">Solo</span>' },
  { label: 'Raw XP/h', className: 'num', cell: (row) => kk(row.xpRawRate) },
  { label: 'Profit/h', className: 'num', cell: (row) => row.profitRate != null ? kk(row.profitRate) : '<span class="dim">-</span>' },
  { label: 'Basis', cell: (row) => `<span class="badge ${row.basis === 'logged' ? 'badge-success' : row.basis === 'blended' ? 'badge-info' : ''}">${esc(row.basis || 'curated')}</span>` },
], grounds4me, 'No level-fit grounds found in the planner.');

stage.innerHTML = `
  <header class="character-hero panel">
    <div class="character-profile">
      ${ring(profile?.name || config.name)}
      <div class="hero-identity">
        <h1>${esc(profile?.name || config.name)}</h1>
        <p class="character-profile-line">${esc(profile?.vocation || 'Character')} · ${esc(profile?.world || config.world)}${level != null ? ` · Level ${nf(level)}` : ''}</p>
        ${trackedLevel != null && experience != null ? `
        <div class="character-level-progress">
          <div><span>Level ${nf(trackedLevel)} → ${nf(trackedLevel + 1)}</span><b class="num">${levelProgressPct.toFixed(0)}%</b></div>
          <span class="track"><i style="width:${levelProgressPct.toFixed(2)}%"></i></span>
          <small>${compact(experienceUntilNextLevel(trackedLevel, experience))} XP remaining</small>
        </div>` : ''}
      </div>
    </div>
    <div class="hero-actions actions">
      <a class="btn btn-primary btn-lg" href="submit.html">Log a hunt</a>
      <a class="btn btn-tertiary btn-lg" href="grounds.html">Plan hunt</a>
    </div>
  </header>

  <section class="progression-overview" aria-label="Progression">
    ${progressionOverviewHtml()}
    <div class="panel panel-pad viz progression-chart">
      <div class="chart-controls">
        <div>
          <p class="eyebrow chart-title" id="xp-chart-title">Daily XP gained</p>
          <p class="fine dim chart-note" id="xp-chart-note">${esc(historyNote)}</p>
          <div class="chart-event-legend" aria-label="Chart event markers">
            <span><i class="event-level"></i>Level-up</span>
            <span><i class="event-death"></i>Death</span>
          </div>
        </div>
        <div class="chart-control-groups">
          <div class="chart-button-group" aria-label="XP chart metric">
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-metric="daily" aria-pressed="true">Daily gain</button>
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-metric="total" aria-pressed="false">Total XP</button>
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-metric="level" aria-pressed="false">Level</button>
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-metric="rank" aria-pressed="false">Rank</button>
          </div>
          <div class="chart-button-group" aria-label="XP chart year">
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-year="all" aria-pressed="false">All</button>
            ${chartYears.map((year) => `<button type="button" class="btn btn-tertiary btn-sm" data-xp-year="${year}" aria-pressed="false">${year}</button>`).join('')}
          </div>
          <div class="chart-button-group" aria-label="XP chart month" id="xp-month-row"></div>
        </div>
      </div>
      <div class="chart-shell">
        <div id="xp-chart"></div>
        <aside class="chart-inspector" id="xp-detail" aria-live="polite">${xpDetailHtml()}</aside>
      </div>
      <div class="chart-foot"><a class="fine dim" href="analytics.html">Explore full progression</a></div>
    </div>
  </section>

  <section class="activity-duo" aria-label="Hunting activity and recent deaths">
    <div class="panel panel-pad viz">
      <p class="eyebrow panel-eyebrow">Daily XP activity</p>
      ${activityHeatmapHtml()}
    </div>
    <div class="panel panel-pad">
      <p class="eyebrow panel-eyebrow">Recent deaths</p>
      ${recentDeathsHtml()}
    </div>
  </section>

  <section class="character-deep-dive" aria-labelledby="deep-dive-title">
    <h2 class="visually-hidden" id="deep-dive-title">Character deep dives</h2>
    <div class="character-tabs-wrap">
      <div class="character-tabs" role="tablist" aria-label="Character deep dives">
        <button type="button" role="tab" id="tab-next" aria-controls="panel-next" aria-selected="true">Next hunt</button>
        <button type="button" role="tab" id="tab-highscores" aria-controls="panel-highscores" aria-selected="false" tabindex="-1">Highscores</button>
        <button type="button" role="tab" id="tab-hunts" aria-controls="panel-hunts" aria-selected="false" tabindex="-1">Hunt log</button>
        <button type="button" role="tab" id="tab-details" aria-controls="panel-details" aria-selected="false" tabindex="-1">Details</button>
      </div>
    </div>

    <div class="character-tab-panel" role="tabpanel" id="panel-next" aria-labelledby="tab-next" tabindex="0">
      ${projectionControlsHtml()}
      ${grounds4me.length ? `
      <div class="section-subhead"><h3>Planner rows</h3><span class="fine dim">${esc(characterVocation || 'character')} rows around level ${nf(level)}</span></div>
      ${groundsTable}` : `
      <div class="empty-action">
        <div><h3>No rated ${esc(characterVocation || 'character')} hunts in this band</h3><p class="dim">The full planner still includes unrated grounds and lets you inspect a wider level range.</p></div>
        <a class="btn btn-primary" href="grounds.html">Adjust planner filters</a>
      </div>`}
    </div>

    <div class="character-tab-panel" role="tabpanel" id="panel-highscores" aria-labelledby="tab-highscores" tabindex="0" hidden>
      ${latest ? `
      <div class="section-subhead first"><h3>Highscores</h3><span class="fine dim">${nf(highscoreRows.length)} tracked categories</span></div>
      <div class="skill-feature-row">
        ${featuredHighscore ? highscoreFeatureHtml(featuredHighscore) : ''}
        <section class="hs-list-wrap" aria-labelledby="other-highscores-title">
          <h3 class="eyebrow" id="other-highscores-title">Other tracked categories</h3>
          <div class="hs-list panel">${secondaryHighscores.map(highscoreRowHtml).join('')}</div>
        </section>
      </div>` : '<div class="empty-action"><div><h3>No highscore snapshot yet</h3><p class="dim">The scheduled tracker will populate this view after a successful crawl.</p></div></div>'}
    </div>

    <div class="character-tab-panel" role="tabpanel" id="panel-hunts" aria-labelledby="tab-hunts" tabindex="0" hidden>
      ${myHunts.length ? `
      <div class="section-subhead first"><h3>Recent analyser sessions</h3><a class="fine dim" href="analytics.html">Progress</a></div>
      <div class="hunt-summary">
        <span><b class="num">${nf(myHunts.length)}</b><small>Logged hunts</small></span>
        <span><b>${bestProfitHunt ? esc(bestProfitHunt.ground || '-') : '-'}</b><small>${bestProfitHunt ? `${kk(bestProfitHunt.profitRate)} profit/h best log` : 'No profitable hunt yet'}</small></span>
      </div>
      <div id="hunt-table">${huntTableHtml()}</div>` : `
      <div class="empty-action">
        <div><h3>Build your first personal hunt baseline</h3><p class="dim">Paste a Hunting Analyser to start comparing raw XP, profit and creature kills.</p></div>
        <a class="btn btn-primary" href="submit.html">Log your first hunt</a>
      </div>`}
    </div>

    <div class="character-tab-panel" role="tabpanel" id="panel-details" aria-labelledby="tab-details" tabindex="0" hidden>
      <div class="section-subhead first"><h3>Character details</h3><span class="fine dim">stable profile facts and recorded events</span></div>
      <div class="panel panel-pad profile-panel"><div id="profile-summary">${characterDetailsHtml()}</div></div>
      <div class="event-summary">
        <span><b class="num">${nf(levelUps.length)}</b><small>Level-ups recorded</small></span>
        <span><b class="num">${levelUps[0] ? `Lv ${nf(levelUps[0].level)}` : '-'}</b><small>${levelUps[0] ? `Most recent · ${esc(levelUps[0].date)}` : 'No level-up yet'}</small></span>
        <span><b class="num">${cadenceTrend ? cadenceTrend.recent.toFixed(1) : '-'}</b><small>Recent days per level</small></span>
        <span><b class="num">${nf(deaths.length)}</b><small>Deaths on record</small></span>
      </div>
      ${historyRows.length ? `<div class="section-subhead"><h3>Daily history</h3><span class="fine dim">${nf(historyRows.length)} tracked days, most recent first</span></div><div id="daily-history-table">${dailyHistoryTableHtml()}</div>` : ''}
      ${deaths.length ? `<div class="section-subhead"><h3>Deaths</h3><span class="fine dim">also marked on the XP chart when dates overlap</span></div><div id="deaths-table">${deathsTableHtml()}</div>` : ''}
    </div>
  </section>`;

bindCharacterTabs();
document.querySelectorAll('.viz').forEach((panel) => attachVizHover(panel));

// sparklines mount at their container's true pixel width (token-size text)
chartInto($('#xp-total-spark'), (width) => sparkline(totalXpSpark, { width, height: 34, fmt: compact }));
if (featuredHighscore) {
  chartInto($('#hs-feature-spark'), (width) => sparkline(sampledSeries(featuredHighscore.series), { width, height: 84, fmt: nf }));
}

// ---- chart controls: metric × year × month, months only for tracked data ----
const xpState = { metric: 'daily', year: chartYears.at(-1) || 'all', month: 'all' };

function renderXpMonthRow() {
  const host = $('#xp-month-row');
  if (!host) return;
  if (xpState.year === 'all') { host.innerHTML = ''; host.hidden = true; return; }
  host.hidden = false;
  const months = monthsInYear(xpState.year);
  host.innerHTML = [
    `<button type="button" class="btn btn-tertiary btn-sm" data-xp-month="all" aria-pressed="${String(xpState.month === 'all')}">All</button>`,
    ...months.map((month) => `<button type="button" class="btn btn-tertiary btn-sm" data-xp-month="${month}" aria-pressed="${String(month === xpState.month)}">${MONTH_NAME[month]}</button>`),
  ].join('');
  host.querySelectorAll('[data-xp-month]').forEach((btn) => {
    btn.addEventListener('click', () => {
      xpState.month = btn.dataset.xpMonth;
      renderXpChart();
    });
  });
}

function renderXpChart() {
  const chart = $('#xp-chart');
  if (!chart) return;
  const selected = xpRowsForChart(xpState.metric, xpState);
  $('#xp-chart-title').textContent = selected.title;
  $('#xp-chart-note').textContent = selected.note;
  chartInto(chart, (width) => flow(selected.data, { width, baseline: selected.baseline, fmt: selected.fmt, empty: 'Not enough rows for this chart yet.' }));
  attachVizHover(chart.closest('.viz'));
  document.querySelectorAll('[data-xp-metric]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.xpMetric === xpState.metric));
  });
  document.querySelectorAll('[data-xp-year]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.xpYear === xpState.year));
  });
  renderXpMonthRow();
}

function showXpDetail(date) {
  const target = $('#xp-detail');
  if (!target) return;
  target.innerHTML = xpDetailHtml(historyRows.find((row) => row.date === date) || historyRows.at(-1));
}

$('#xp-chart')?.closest('.viz')?.addEventListener('viz:pick', (event) => showXpDetail(event.detail.id));

document.querySelectorAll('[data-xp-metric]').forEach((btn) => {
  btn.addEventListener('click', () => {
    xpState.metric = btn.dataset.xpMetric;
    renderXpChart();
  });
});
document.querySelectorAll('[data-xp-year]').forEach((btn) => {
  btn.addEventListener('click', () => {
    xpState.year = btn.dataset.xpYear;
    xpState.month = 'all';
    renderXpChart();
  });
});
renderXpChart();

// ---- level prediction wiring (pure arithmetic over tracked data) ----
function renderPrediction() {
  const out = $('#pred-out');
  if (!out) return;
  const target = Math.floor(Number($('#pred-level').value));
  const pace = Number($('#pred-pace').value);
  if (!Number.isFinite(target) || target <= trackedLevel || !Number.isFinite(pace) || pace <= 0) {
    out.innerHTML = '<span class="dim">Pick a target above the current level and a positive daily pace.</span>';
    return;
  }
  const needed = experienceForLevel(target) - experience;
  const days = Math.ceil(needed / pace);
  const eta = new Date(Date.now() + days * 86_400_000);
  out.innerHTML = `
    <div class="tool-kpis">
      <span><b>${kk(needed)}</b><small>exp to level ${nf(target)}</small></span>
      <span><b>${nf(days)}</b><small>days at this pace</small></span>
      <span><b>${eta.toISOString().slice(0, 10)}</b><small>projected date</small></span>
    </div>`;
}
if ($('#pred-out')) {
  ['#pred-level', '#pred-pace'].forEach((id) => $(id).addEventListener('input', renderPrediction));
  renderPrediction();
}
export {};
