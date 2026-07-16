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

const { stage, codex, grounds, table, config } = await boot('character.html');
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
  ? `profile level ${nf(profileLevel)}; exact highscore XP row level ${nf(trackedLevel)} as of ${latest.date}`
  : 'tracked every 15 minutes from TibiaData highscores';

const historyRows = history.map((row, i) => {
  const prev = history[i - 1] || null;
  const gain = prev ? Math.max(0, row.experience - prev.experience) : null;
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
  .map((row) => ({ date: row.date, level: row.level, step: row.levelDelta, source: row.source || 'TibiaData tracker' }));
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

const historyByDate = new Map(historyRows.map((row) => [row.date, row]));

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
      rankHistoryKey: rankField,
      label,
      kind,
      value,
      rank: latestRank,
      firstValue: first?.value ?? null,
      firstDate: first?.date ?? null,
      delta: first ? value - first.value : null,
      lastDelta: previousValue != null ? value - previousValue : null,
      observations: series.length,
      series,
      sourceDate: latest.date,
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
  return source || 'TibiaData tracker';
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

function xpOverWindow(row) {
  const first = row.firstDate ? historyByDate.get(row.firstDate) : null;
  const last = row.sourceDate ? historyByDate.get(row.sourceDate) : null;
  return first && last ? last.experience - first.experience : null;
}

function xpRowsForChart(metric, range) {
  let rows = historyRows;
  if (range !== 'all') rows = rows.slice(-Number(range));
  if (metric === 'daily') {
    return {
      title: 'Daily XP gained',
      note: `${rows.filter((row) => row.gain != null).length} gain rows`,
      baseline: 'zero',
      fmt: kk,
      data: rows.filter((row) => row.gain != null).map((row) => ({ id: row.date, key: row.date.slice(5), n: row.gain })),
    };
  }
  if (metric === 'level') {
    return {
      title: 'Tracked level',
      note: `${rows.length} daily levels`,
      baseline: 'min',
      fmt: nf,
      data: rows.map((row) => ({ id: row.date, key: row.date.slice(5), n: row.level })),
    };
  }
  if (metric === 'rank') {
    const rankRows = rows.filter((row) => row.rank != null);
    return {
      title: 'World XP rank',
      note: `${rankRows.length} rank rows; raw rank number, lower = better`,
      baseline: 'min',
      fmt: (value) => `#${nf(value)}`,
      data: rankRows.map((row) => ({ id: row.date, key: row.date.slice(5), n: row.rank })),
    };
  }
  return {
    title: 'Total experience',
    note: `${rows.length} exact highscore rows`,
    baseline: 'min',
    fmt: kk,
    data: rows.map((row) => ({ id: row.date, key: row.date.slice(5), n: row.experience })),
  };
}

function profileRows() {
  return [
    ['Name', profile?.name],
    ['Title', profile?.title],
    ['Sex', profile?.sex],
    ['Vocation', profile?.vocation],
    ['World', profile?.world],
    ['Residence', profile?.residence],
    ['Profile level', profileLevel],
    ['Tracked highscore level', trackedLevel],
    ['Tracked experience', experience != null ? nf(experience) : null],
    ['Achievement points', profile?.achievementPoints],
    ['Last login', fmtDateTime(profile?.lastLogin)],
    ['Account status', profile?.accountStatus],
    ['Account created', fmtDateOnly(profile?.accountCreated)],
    ['Loyalty title', profile?.loyaltyTitle],
    ['Houses', profile?.houses?.length ? profile.houses.map((h) => `${h.name} (${h.town})`).join(', ') : null],
    ['Profile updated', fmtDateTime(profile?.updatedAt)],
  ].filter(([, value]) => value != null && value !== '');
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

function profileSummaryHtml() {
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
      ${profileGroupHtml('Standing', [
        ['Achievement points', profile?.achievementPoints],
        ['Loyalty title', profile?.loyaltyTitle],
        ['XP rank', latest?.rank ? `#${nf(latest.rank)}` : null],
      ])}
      ${profileGroupHtml('Dates', [
        ['Last login', fmtDateTime(profile?.lastLogin)],
        ['Account created', fmtDateOnly(profile?.accountCreated)],
        ['Profile updated', fmtDateTime(profile?.updatedAt)],
      ])}
    </div>`;
}

function profileTableHtml() {
  return tableHtml([
    { label: 'Field', cell: (row) => esc(row[0]) },
    { label: 'Value', cell: (row) => plain(row[1]) },
  ], profileRows(), 'No character profile data yet.');
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

/** Highlights the section-nav tab for whichever section is currently in view
 * — an 8000px+ scrolling page gives no other "you are here" feedback. */
function bindSectionNavSpy() {
  const nav = $('.section-nav');
  if (!nav || nav.dataset.bound) return;
  nav.dataset.bound = '1';
  const links = [...nav.querySelectorAll('a')];
  const sections = links
    .map((a) => document.getElementById(a.getAttribute('href').slice(1)))
    .filter(Boolean);
  if (!sections.length) return;
  const setActive = (id) => links.forEach((a) => {
    if (a.getAttribute('href') === `#${id}`) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  });
  setActive(sections[0].id); // sane default before the first scroll/intersection fires
  const io = new IntersectionObserver((entries) => {
    const hit = entries.find((e) => e.isIntersecting);
    if (hit) setActive(hit.target.id);
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => io.observe(s));
}

function avg(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function gainAverage(days) {
  return avg(historyRows.slice(-days).map((row) => row.gain).filter((gain) => gain != null));
}

function xpDetailHtml(row = historyRows.at(-1)) {
  if (!row) return '<p class="dim">No tracked XP row selected.</p>';
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
      <span><b class="num">${prev ? signed(row.level - prev.level) : '<span class="dim">-</span>'}</b><small>Level delta</small></span>
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

function highscoreCardHtml(row) {
  const hasTrend = row.series.length >= 2 && new Set(row.series.map((point) => point.n)).size >= 2;
  const trend = sampledSeries(row.series);
  return `
    <article class="panel skill-card">
      <div class="skill-card-head">
        <div>
          <h3>${esc(row.label)}</h3>
          <p class="fine dim">${esc(row.kind)} · ${nf(row.observations)} tracked row${row.observations === 1 ? '' : 's'}</p>
        </div>
        <b class="num">${nf(row.value)}</b>
      </div>
      <div class="mini-metrics">
        <span><b class="num">${row.rank != null ? `#${nf(row.rank)}` : '-'}</b><small>Current rank</small></span>
        <span><b class="num">${signed(row.lastDelta)}</b><small>Last change</small></span>
        <span><b class="num">${signed(row.delta)}</b><small>Tracked delta</small></span>
      </div>
      <div class="sparkline">
        ${hasTrend ? sparkline(trend, { fmt: nf }) : '<span class="fine dim">Waiting for another distinct TibiaData row before drawing a trend.</span>'}
      </div>
    </article>`;
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
          <p class="fine dim">${esc(row.kind)} · ${nf(row.observations)} tracked row${row.observations === 1 ? '' : 's'}</p>
        </div>
        <b class="num">${nf(row.value)}</b>
      </div>
      <div class="mini-metrics">
        <span><b class="num">${row.rank != null ? `#${nf(row.rank)}` : '-'}</b><small>Current rank</small></span>
        <span><b class="num">${signed(row.lastDelta)}</b><small>Last change</small></span>
        <span><b class="num">${signed(row.delta)}</b><small>Tracked delta</small></span>
      </div>
      <div class="sparkline sparkline-lg">
        ${hasTrend ? sparkline(trend, { fmt: nf }) : '<span class="fine dim">Waiting for another distinct TibiaData row before drawing a trend.</span>'}
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
const secondaryHighscores = primaryHighscores.filter((row) => row !== featuredHighscore);

const xpTable = tableHtml([
  { label: 'Date', cell: (row) => esc(row.date) },
  { label: 'Level', className: 'num', cell: (row) => nf(row.level) },
  { label: 'Delta', className: 'num', cell: (row) => signed(row.levelDelta) },
  { label: 'Experience', className: 'num', cell: (row) => nf(row.experience) },
  { label: 'XP gain', className: 'num', cell: (row) => row.gain == null ? '<span class="dim">-</span>' : `+${nf(row.gain)}` },
  { label: 'XP to next', className: 'num', cell: (row) => kk(row.xpToNext) },
  { label: 'Progress', className: 'num', cell: (row) => `${row.progress.toFixed(1)}%` },
  { label: 'Rank', className: 'num', cell: (row) => row.rank ? `#${nf(row.rank)}` : '<span class="dim">-</span>' },
  { label: 'Source', cell: (row) => esc(sourceName(row.source)) },
], [...historyRows].reverse(), 'No XP rows yet.');

const highscoresTable = tableHtml([
  { label: 'Highscore', cell: (row) => esc(row.label) },
  { label: 'Unit', cell: (row) => esc(row.kind) },
  { label: 'Value', className: 'num', cell: (row) => nf(row.value) },
  { label: 'Rank', className: 'num', cell: (row) => row.rank != null ? `#${nf(row.rank)}` : '<span class="dim">-</span>' },
  { label: 'Rows', className: 'num', cell: (row) => nf(row.observations) },
  { label: 'First tracked', className: 'num', cell: (row) => row.firstValue != null ? nf(row.firstValue) : '<span class="dim">-</span>' },
  { label: 'Last change', className: 'num', cell: (row) => signed(row.lastDelta) },
  { label: 'Delta', className: 'num', cell: (row) => signed(row.delta) },
  { label: 'XP over window', className: 'num', cell: (row) => signed(xpOverWindow(row)) },
  { label: 'Window', cell: (row) => esc([row.firstDate, row.sourceDate].filter(Boolean).join(' -> ')) },
], highscoreRows, 'No highscore rows yet.');

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
    <div class="hero-top">
      ${ring(profile?.name || config.name)}
      <div class="hero-stats">
        <span><b class="num">${lastGain != null ? `+${kk(lastGain)}` : '-'}</b><small>Last daily XP</small></span>
        <span><b class="num">${latest?.rank ? `#${nf(latest.rank)}` : '-'}</b><small>XP rank</small></span>
        <span><b class="num">${trackedLevel != null && experience != null ? kk(experienceUntilNextLevel(trackedLevel, experience)) : '-'}</b><small>XP to next</small></span>
      </div>
    </div>
    <div class="hero-identity">
      <p class="eyebrow">${esc(profile?.world || config.world)} · ${esc(profile?.vocation || 'character')}</p>
      <h1>${esc(profile?.name || config.name)}</h1>
      <p class="character-lede">${esc(profile?.title || 'Tracked character')} at level ${level != null ? nf(level) : '-'}, followed through exact XP rows, highscore standings, deaths and private hunt evidence.</p>
      <div class="dashboard-meta">
        ${profileLevel != null ? `<span class="pill">Profile lvl ${nf(profileLevel)}</span>` : ''}
        ${trackedLevel != null ? `<span class="pill">Highscore lvl ${nf(trackedLevel)}</span>` : ''}
        ${experience != null ? `<span class="pill">XP ${kk(experience)}</span>` : ''}
        ${latest?.date ? `<span class="pill">Tracker ${esc(latest.date)}</span>` : ''}
      </div>
    </div>
    <div class="hero-actions actions">
      <a class="btn btn-primary btn-lg" href="submit.html">Save hunt</a>
      <a class="btn btn-tertiary btn-lg" href="grounds.html">Plan hunt</a>
    </div>
  </header>

  <nav class="section-nav" aria-label="Character sections">
    <a href="#snapshot">Snapshot</a>
    <a href="#progression">Progression</a>
    <a href="#highscores">Highscores</a>
    <a href="#next">Next</a>
  </nav>

  <section class="section character-act" id="snapshot">
    <div class="section-bar"><h2>Snapshot</h2><span class="fine dim">who the character is now</span></div>
    <div class="snapshot-grid">
      <div class="panel panel-pad profile-panel">
        <div id="profile-summary">${profileSummaryHtml()}</div>
        <details class="detail-block compact">
          <summary>Full TibiaData profile fields</summary>
          <div id="profile-table">${profileTableHtml()}</div>
        </details>
      </div>
      <div class="dashboard-grid" aria-label="Current character read">
    <div class="panel pulse"><div class="big num">${avg7 != null ? kk(avg7) : '-'}</div><div class="eyebrow">7-day pace</div></div>
    <div class="panel pulse"><div class="big num">${avg30 != null ? kk(avg30) : '-'}</div><div class="eyebrow">30-day pace</div></div>
    <div class="panel pulse"><div class="big num">${nf(streaks.current)}</div><div class="eyebrow">Current XP-gain streak</div></div>
    <div class="panel pulse"><div class="big num">${nf(streaks.best)}</div><div class="eyebrow">Best XP-gain streak</div></div>
    <div class="panel pulse"><div class="big">${bestProfitHunt ? esc(bestProfitHunt.ground || '-') : '-'}</div><div class="eyebrow">${bestProfitHunt ? `${kk(bestProfitHunt.profitRate)} profit/h best log` : 'No profitable hunt log yet'}</div></div>
      </div>
    </div>
  </section>

  <section class="section character-act" id="progression">
    <div class="section-bar"><h2>Progression</h2><span class="fine dim">${esc(historyNote)}</span></div>
    <div class="narrative-strip">
      <span><b class="num">${nf(historyRows.length)}</b><small>tracked XP days</small></span>
      <span><b class="num">${bestDay?.gain ? `+${nf(bestDay.gain)}` : '-'}</b><small>best recorded day${bestDay?.date ? ` (${esc(bestDay.date)})` : ''}</small></span>
      <span><b class="num">${cadenceTrend ? `${cadenceTrend.recent.toFixed(1)}d` : '-'}</b><small>recent days per level</small></span>
    </div>
    <div class="panel panel-pad viz">
      <div class="chart-controls">
        <div>
          <p class="eyebrow" id="xp-chart-title" style="margin:0 0 4px">Total experience</p>
          <p class="fine dim" id="xp-chart-note" style="margin:0">${esc(historyNote)}</p>
        </div>
        <div class="chart-control-groups">
          <div class="chart-button-group" aria-label="XP chart metric">
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-metric="total" aria-pressed="true">Total XP</button>
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-metric="daily" aria-pressed="false">Daily gain</button>
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-metric="level" aria-pressed="false">Level</button>
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-metric="rank" aria-pressed="false">Rank</button>
          </div>
          <div class="chart-button-group" aria-label="XP chart range">
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-range="7" aria-pressed="false">7d</button>
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-range="30" aria-pressed="false">30d</button>
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-range="all" aria-pressed="true">All</button>
          </div>
        </div>
      </div>
      <div class="chart-shell">
        <div id="xp-chart"></div>
        <aside class="chart-inspector" id="xp-detail" aria-live="polite">${xpDetailHtml()}</aside>
      </div>
    </div>
  ${trackedLevel != null && experience != null && avgDailyXp != null ? `
    <div class="panel panel-pad prediction-panel">
      <div class="section-subhead first"><h3>Where this pace points</h3><span class="fine dim">straight arithmetic from tracked data</span></div>
      <div class="tool-fields">
        <label class="lbl lbl-narrow"><span class="eyebrow">Target level</span><input id="pred-level" type="number" min="${trackedLevel + 1}" max="2000" value="${nextMilestoneLevel(trackedLevel)}"></label>
        <label class="lbl"><span class="eyebrow">Avg daily exp</span><input id="pred-pace" type="number" min="1" value="${avgDailyXp}"></label>
      </div>
      <div class="tool-result" id="pred-out"></div>
      <p class="fine dim">Pace defaults to the last ${nf(recentGains.length)} tracked days' average; edit either field.</p>
    </div>` : ''}
    <details class="detail-block">
      <summary>Daily XP source rows</summary>
      ${xpTable}
    </details>
  </section>

  ${latest ? `
  <section class="section character-act" id="highscores">
    <div class="section-bar"><h2>Highscores</h2><span class="fine dim">standouts first; full tracker behind the fold</span></div>
    <div class="narrative-strip">
      ${standoutHighscores.map((row) => `<span><b class="num">#${nf(row.rank)}</b><small>${esc(row.label)} · ${nf(row.value)}</small></span>`).join('')}
    </div>
    <div class="skill-feature-row">
      ${featuredHighscore ? highscoreFeatureHtml(featuredHighscore) : ''}
      <div class="hs-list panel">
        ${secondaryHighscores.map(highscoreRowHtml).join('')}
      </div>
    </div>
    <details class="detail-block">
      <summary>All highscore cards and rows</summary>
      <div class="skill-grid detail-grid">
        ${highscoreRows.map(highscoreCardHtml).join('')}
      </div>
      <div class="section-subhead"><h3>Highscore rows</h3><span class="fine dim">separate units, ranks and trend readiness</span></div>
      ${highscoresTable}
    </details>
  </section>` : ''}

  <section class="section character-act" id="story">
    <div class="section-bar"><h2>Milestones and setbacks</h2><span class="fine dim">events, not just measurements</span></div>
    <div class="event-grid">
  ${levelUps.length ? `
      <article class="event-panel">
        <div class="section-subhead first"><h3>Level breakthroughs</h3><span class="fine dim">${cadenceTrend ? `${cadenceTrend.recent.toFixed(1)} recent days/level` : 'tracked level rises'}</span></div>
    ${tableHtml([
      { label: 'Date', cell: (row) => esc(row.date) },
      { label: 'Reached', className: 'num', cell: (row) => nf(row.level) },
      { label: 'Step', className: 'num', cell: (row) => `+${nf(row.step)}` },
      { label: 'Source', cell: (row) => esc(sourceName(row.source)) },
    ], levelUps.slice(0, 12), 'No tracked level-ups yet.')}
      </article>` : ''}
      <article class="event-panel">
        <div class="section-subhead first"><h3>Deaths</h3><span class="fine dim">${nf(profile?.deaths?.length || 0)} on record</span></div>
        <div id="deaths-table">${deathsTableHtml()}</div>
      </article>
    </div>
  </section>

  <section class="section character-act" id="next">
    <div class="section-bar"><h2>What next</h2><span class="fine dim">planning from the character state</span></div>
  ${grounds4me.length ? `
    <div class="next-block">
      <div class="section-subhead first"><h3>Level-fit hunt targets</h3><a class="fine dim" href="grounds.html">Open full planner</a></div>
    <div class="story-rail">
      ${grounds4me.slice(0, 8).map((r) => `
        <a class="story" href="ground.html?g=${esc(r.groundSlug)}" title="${esc(r.ground)} - ${kk(r.xpRawRate)} raw XP/h from level ${nf(r.level)}">
          ${ring(r.ground)}
          <span class="cap">${esc(r.ground)}</span>
        </a>`).join('')}
    </div>
      <div class="section-subhead"><h3>Planner rows</h3><span class="fine dim">${esc(characterVocation || 'character')} rows around level ${nf(level)}</span></div>
    ${groundsTable}
    </div>` : `<div class="panel panel-pad dim">No raw-XP-rated ${esc(characterVocation || 'character')} planner rows are available around level ${level != null ? nf(level) : '-'}. Open the full planner to inspect unrated rows and wider level bands.</div>`}

    <div class="hunt-log-panel">
      <div class="section-subhead first"><h3>My hunt log</h3><a class="fine dim" href="analytics.html">Progress</a></div>
    <div class="pulse-row">
      <div class="metric-tile pulse"><div class="big num">${nf(myHunts.length)}</div><div class="eyebrow">Logged hunts</div></div>
      <div class="metric-tile pulse"><div class="big num">${nf(grounds.directory.length)}</div><div class="eyebrow">Grounds in the planner</div></div>
      <div class="metric-tile pulse"><div class="big num">${nf(codex.size)}</div><div class="eyebrow">Creatures in the codex</div></div>
      <div class="metric-tile pulse"><div class="big num" id="last-login-day">${profile ? (fmtDateOnly(profile.lastLogin) || '-') : '-'}</div><div class="eyebrow">Last login</div></div>
    </div>
    <div class="section-subhead"><h3>Recent analyser sessions</h3><span class="fine dim">private browser logbook</span></div>
    <div id="hunt-table">${huntTableHtml()}</div>
    </div>
  </section>`;

bindSectionNavSpy();

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
    out.innerHTML = '<span class="dim">Pick a target above the tracked level and a positive daily pace.</span>';
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
