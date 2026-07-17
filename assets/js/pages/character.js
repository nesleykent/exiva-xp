/**
 * Character - the tracked character's dashboard (config.ini): generated profile, progression,
 * highscores, deaths, and shortcuts into the planning tools.
 */

import { boot } from './_boot.js';
import { esc } from '../lib/text.js';
import { kk, nf, day, hm } from '../lib/fmt.js';
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_STORAGE_KEY,
  formatDateInTimezone,
  formatDateTimeInTimezone,
} from '../lib/timezones.js';
import { $, ring } from '../shell.js';
import { flow, sparkline, attachFlowHover } from '../viz/svg.js';
import { loadCharacter, loadCharacterHistory, logbook } from '../data/sources.js';
import { experienceForLevel, experienceUntilNextLevel, progressWithinLevel, nextMilestoneLevel } from '../engine/progression.js';
import { HIGHSCORE_CATEGORIES } from '../engine/highscores.js';

const { stage, table, config } = await boot('character.html');
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
  : 'Updated automatically from TibiaData highscores';

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
    xpToNext: experienceUntilNextLevel(row.level, row.experience),
    progress: progressWithinLevel(row.level, row.experience),
  };
});

const gains = historyRows.filter((row) => row.gain != null).map((row) => ({ key: row.date.slice(5), n: row.gain }));
const bestDay = historyRows.reduce((best, row) => (row.gain > (best?.gain ?? 0) ? row : best), null);

// Level-up log, derived from the daily rows: every day the tracked level rose.
const levelUpsChronological = historyRows
  .filter((row) => row.levelDelta > 0)
  .map((row) => ({ date: row.date, level: row.level, step: row.levelDelta, source: row.source || 'TibiaData' }));
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
    .map((row) => ({ id: row.date, key: row.date.slice(5), n: row[field] }));
}

const deaths = [...(profile?.deaths || [])].reverse();
const myHunts = logbook();
const characterVocation = profile?.vocation || '';
const compatibleRows = level == null ? [] : table.filter((r) =>
  r.xpRawRate != null
  && r.level != null
  && r.level <= level
  && r.level >= level - 250
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

function sourceName(source) {
  return source || 'TibiaData';
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

function xpGainStreaks(rows) {
  let current = 0;
  let best = 0;
  for (const row of rows) {
    if (row.gain != null && row.gain > 0) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return { current, best };
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

function xpRowsForChart(metric, range) {
  let rows = historyRows;
  if (range !== 'all') rows = rows.slice(-Number(range));
  if (metric === 'daily') {
    return {
      title: 'Daily XP gained',
      note: `${rows.filter((row) => row.gain != null).length} days with a recorded gain`,
      baseline: 'zero',
      fmt: kk,
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
    fmt: kk,
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
        ['Title', profile?.title],
        ['Sex', profile?.sex],
        ['Vocation', profile?.vocation],
        ['World', profile?.world],
      ])}
      ${profileGroupHtml('Place', [
        ['Residence', profile?.residence],
        ['House', houses],
        ['Account status', profile?.accountStatus],
      ])}
      ${profileGroupHtml('Dates', [
        ['Last login', fmtDateTime(profile?.lastLogin)],
        ['Account created', fmtDateOnly(profile?.accountCreated)],
        ['Profile updated', fmtDateTime(profile?.updatedAt)],
      ])}
    </div>`;
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
  return { id: row.date, key: row.date.slice(5), n, events: chartEvents(row.date) };
}

function xpDetailHtml(row = historyRows.at(-1)) {
  if (!row) return '<p class="dim">No day selected yet.</p>';
  const prev = historyRows[historyRows.findIndex((r) => r.date === row.date) - 1] || null;
  const gained = row.gain == null ? '<span class="dim">-</span>' : `+${nf(row.gain)}`;
  return `
    <div class="inspector-head">
      <b>${esc(row.date)}</b>
      <span class="badge ${/backfill/i.test(row.source || '') ? 'badge-warning' : 'badge-info'}">${esc(sourceName(row.source))}</span>
    </div>
    <div class="mini-metrics">
      <span><b class="num">${nf(row.level)}</b><small>Level</small></span>
      <span><b class="num">${gained}</b><small>XP gain</small></span>
      <span><b class="num">${kk(row.xpToNext)}</b><small>XP to next</small></span>
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
  const trend = sampledSeries(row.series);
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
      <div class="sparkline sparkline-lg">
        ${hasTrend ? sparkline(trend, { fmt: nf }) : '<span class="fine dim">Trend appears after the next update for this skill.</span>'}
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

const lastGain = historyRows.at(-1)?.gain ?? null;
const avg7 = gainAverage(7);
const avg30 = gainAverage(30);
const bestProfitHunt = myHunts
  .filter((hunt) => hunt.balance != null && hunt.minutes > 0)
  .map((hunt) => ({ ...hunt, profitRate: (hunt.balance / hunt.minutes) * 60 }))
  .sort((a, b) => b.profitRate - a.profitRate)[0] || null;
const streaks = xpGainStreaks(historyRows);
const cadenceTrend = levelCadence();
const standoutHighscores = highscoreRows
  .filter((row) => row.rank != null)
  .sort((a, b) => a.rank - b.rank)
  .slice(0, 6);
const primaryHighscoreKeys = new Set(['experience', 'magicLevel', 'charmPoints', 'achievements', 'weeklyTasks', 'fishing']);
const primaryHighscores = highscoreRows.filter((row) => primaryHighscoreKeys.has(row.key));
const featuredHighscore = primaryHighscores.find((row) => row.key === 'experience') || primaryHighscores[0] || null;
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

/** One progression zone: current state, target and ETA are distinct values,
 * while pace, recent gain and rank share one comparison band. */
function progressionOverviewHtml() {
  const needed = projection ? experienceForLevel(projection.target) - experience : null;
  return `
    <div class="dashboard-metrics" aria-label="Progression at a glance">
      <article class="dashboard-metric">
        <span>Current level</span>
        <b class="num">${level != null ? nf(level) : '-'}</b>
        <small>${levelProgressPct != null ? `${levelProgressPct.toFixed(0)}% to the next level` : historyNote}</small>
      </article>
      <article class="dashboard-metric">
        <span>Target level</span>
        <b class="num">${projection ? nf(projection.target) : '-'}</b>
        <small>${needed != null ? `${kk(needed)} XP remaining` : 'Not enough pace data yet'}</small>
      </article>
      <article class="dashboard-metric">
        <span>Projected date</span>
        <b class="num dashboard-date">${projection ? esc(projection.eta) : '-'}</b>
        <small>${projection ? `${nf(projection.days)} days at the recent pace` : 'Check back after more updates'}</small>
      </article>
    </div>
    <div class="pace-band pace-${esc(insight?.tone || 'even')}">
      <div class="pace-message">
        <b>${insight ? esc(insight.text) : 'Not enough history yet to compare recent pace.'}</b>
        <span class="fine dim">${bestDay?.gain ? `Best recorded day: +${kk(bestDay.gain)} on ${esc(bestDay.date)}` : historyNote}</span>
      </div>
      <div class="pace-support">
        <span><b class="num">${lastGain != null ? `+${kk(lastGain)}` : '-'}</b><small>Last daily XP</small></span>
        <span><b class="num">${latest?.rank ? `#${nf(latest.rank)}` : '-'}</b><small>XP rank</small></span>
        <span><b class="num">${nf(streaks.current)}</b><small>Day streak</small></span>
      </div>
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

/** Achievement points and loyalty standing, framed as a comparison against
 * the world rather than a bare number. */
function standingHighlightsHtml() {
  const achievementsRank = highscoreRows.find((row) => row.key === 'achievements')?.rank ?? null;
  const parts = [];
  if (profile?.achievementPoints != null) {
    parts.push(`<span><b class="num">${nf(profile.achievementPoints)}</b><small>Achievement points${achievementsRank != null ? ` · #${nf(achievementsRank)} in the world` : ''}</small></span>`);
  }
  if (profile?.loyaltyTitle) {
    parts.push(`<span><b class="num">${esc(profile.loyaltyTitle)}</b><small>Loyalty title</small></span>`);
  }
  return parts.length ? `<div class="mini-metrics">${parts.join('')}</div>` : '';
}

const groundsTable = tableHtml([
  { label: 'Ground', cell: (row) => `<a href="ground.html?g=${esc(row.groundSlug)}">${esc(row.ground)}</a>` },
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
        <p class="character-profile-line">${esc(profile?.vocation || 'Character')} · ${esc(profile?.world || config.world)}${profile?.accountStatus ? ` · ${esc(profile.accountStatus)}` : ''}</p>
        ${profile?.title ? `<p class="fine dim">${esc(profile.title)}</p>` : ''}
      </div>
    </div>
    <div class="hero-actions actions">
      <a class="btn btn-primary btn-lg" href="submit.html">Log a hunt</a>
      <a class="btn btn-tertiary btn-lg" href="grounds.html">Plan hunt</a>
    </div>
  </header>

  <section class="progression-overview" aria-labelledby="progression-title">
    <div class="section-bar"><h2 id="progression-title">Progression</h2><span class="fine dim">current state, target and pace</span></div>
    ${progressionOverviewHtml()}
    <div class="panel panel-pad viz progression-chart">
      <div class="chart-controls">
        <div>
          <p class="eyebrow" id="xp-chart-title" style="margin:0 0 4px">Daily XP gained</p>
          <p class="fine dim" id="xp-chart-note" style="margin:0">${esc(historyNote)}</p>
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
          <div class="chart-button-group" aria-label="XP chart range">
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-range="7" aria-pressed="false">7d</button>
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-range="30" aria-pressed="true">30d</button>
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-range="all" aria-pressed="false">All</button>
          </div>
        </div>
      </div>
      <div class="chart-shell">
        <div id="xp-chart"></div>
        <aside class="chart-inspector" id="xp-detail" aria-live="polite">${xpDetailHtml()}</aside>
      </div>
      <div class="chart-foot"><a class="fine dim" href="analytics.html">Explore full progression</a></div>
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
      <div class="section-subhead"><h3>Level-fit hunt targets</h3><a class="fine dim" href="grounds.html">Open full planner</a></div>
      <div class="story-rail">
        ${grounds4me.slice(0, 8).map((row) => `
          <a class="story" href="ground.html?g=${esc(row.groundSlug)}" title="${esc(row.ground)} - ${kk(row.xpRawRate)} raw XP/h from level ${nf(row.level)}">
            ${ring(row.ground)}
            <span class="cap">${esc(row.ground)}</span>
          </a>`).join('')}
      </div>
      <div class="section-subhead"><h3>Planner rows</h3><span class="fine dim">${esc(characterVocation || 'character')} rows around level ${nf(level)}</span></div>
      ${groundsTable}` : `
      <div class="empty-action">
        <div><h3>No rated ${esc(characterVocation || 'character')} hunts in this band</h3><p class="dim">The full planner still includes unrated grounds and lets you inspect a wider level range.</p></div>
        <a class="btn btn-primary" href="grounds.html">Adjust planner filters</a>
      </div>`}
    </div>

    <div class="character-tab-panel" role="tabpanel" id="panel-highscores" aria-labelledby="tab-highscores" tabindex="0" hidden>
      ${latest ? `
      <div class="section-subhead first"><h3>Highscores</h3><span class="fine dim">one trend plus every tracked category</span></div>
      ${standingHighlightsHtml()}
      <div class="narrative-strip">
        ${standoutHighscores.map((row) => `<span><b class="num">#${nf(row.rank)}</b><small>${esc(row.label)} · ${nf(row.value)}</small></span>`).join('')}
      </div>
      <div class="skill-feature-row">
        ${featuredHighscore ? highscoreFeatureHtml(featuredHighscore) : ''}
        <div class="hs-list panel">${secondaryHighscores.map(highscoreRowHtml).join('')}</div>
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
      ${deaths.length ? `<div class="section-subhead"><h3>Deaths</h3><span class="fine dim">also marked on the XP chart when dates overlap</span></div><div id="deaths-table">${deathsTableHtml()}</div>` : ''}
    </div>
  </section>`;

bindCharacterTabs();

// ---- chart controls ----
const xpState = { metric: 'daily', range: '30' };

function renderXpChart() {
  const chart = $('#xp-chart');
  if (!chart) return;
  const selected = xpRowsForChart(xpState.metric, xpState.range);
  $('#xp-chart-title').textContent = selected.title;
  $('#xp-chart-note').textContent = selected.note;
  chart.innerHTML = selected.data.length
    ? flow(selected.data, { baseline: selected.baseline, fmt: selected.fmt })
    : '<p class="dim">Not enough rows for this chart yet.</p>';
  attachFlowHover(chart.closest('.viz'));
  document.querySelectorAll('[data-xp-metric]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.xpMetric === xpState.metric));
  });
  document.querySelectorAll('[data-xp-range]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.xpRange === xpState.range));
  });
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
document.querySelectorAll('[data-xp-range]').forEach((btn) => {
  btn.addEventListener('click', () => {
    xpState.range = btn.dataset.xpRange;
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
