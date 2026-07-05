/**
 * Character - Night'Flyn's dashboard: generated profile, progression,
 * sampled online status, skills, deaths, and shortcuts into the planning tools.
 */

import { boot } from './_boot.js';
import { esc } from '../lib/text.js';
import { kk, nf, day, hm } from '../lib/fmt.js';
import {
  DEFAULT_TIMEZONE,
  SUPPORTED_TIMEZONES,
  TIMEZONE_STORAGE_KEY,
  dateKeyInTimezone,
  formatDateInTimezone,
  formatDateTimeInTimezone,
  getTimezoneDisplayLabel,
} from '../lib/timezones.js';
import { $, ring } from '../shell.js';
import { bars, flow, attachFlowHover } from '../viz/svg.js';
import { loadCharacter, loadCharacterHistory, loadCharacterOnline, logbook } from '../data/sources.js';
import { experienceForLevel, experienceUntilNextLevel, progressWithinLevel, nextMilestoneLevel } from '../engine/progression.js';

const { stage, codex, grounds, table } = await boot('character.html');
const [profile, history, onlineLog] = await Promise.all([
  loadCharacter(),
  loadCharacterHistory(),
  loadCharacterOnline(),
]);
let timezone = loadTimezone();

const latest = history.at(-1) || null;
const profileLevel = profile?.level ?? null;
const trackedLevel = latest?.level ?? null;
const level = profileLevel ?? trackedLevel;
const experience = latest?.experience ?? null;
const historyNote = latest && profileLevel != null && trackedLevel != null && profileLevel !== trackedLevel
  ? `profile level ${nf(profileLevel)}; exact highscore XP row level ${nf(trackedLevel)} as of ${latest.date}`
  : 'tracked daily from TibiaData highscores at 03:00 UTC';

const facts = [];
if (profileLevel != null) facts.push({ big: nf(profileLevel), cap: 'current profile level' });
if (trackedLevel != null && trackedLevel !== profileLevel) facts.push({ big: nf(trackedLevel), cap: 'tracked highscore level' });
if (trackedLevel != null && experience != null) {
  facts.push({ big: kk(experienceUntilNextLevel(trackedLevel, experience)), cap: `tracked XP to level ${trackedLevel + 1}` });
  facts.push({ big: `${progressWithinLevel(trackedLevel, experience).toFixed(1)}%`, cap: `through tracked level ${trackedLevel}` });
  facts.push({ big: kk(experience), cap: 'tracked experience' });
}
if (level != null) facts.push({ big: nf(nextMilestoneLevel(level)), cap: 'profile milestone' });
if (latest?.rank) facts.push({ big: `#${nf(latest.rank)}`, cap: `${profile?.world || 'world'} druid XP rank` });

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
const levelUps = historyRows
  .filter((row) => row.levelDelta > 0)
  .map((row) => ({ date: row.date, level: row.level, step: row.levelDelta, source: row.source || 'TibiaData tracker' }))
  .reverse();

// Default prediction pace: mean of the last 7 recorded daily gains (zeros
// count because rest days are part of the real pace).
const recentGains = gains.slice(-7).map((g) => g.n);
const avgDailyXp = recentGains.length ? Math.round(recentGains.reduce((a, b) => a + b, 0) / recentGains.length) : null;

const SKILLS = [
  ['magicLevel', 'magiclevel', 'Magic level'],
  ['charmPoints', 'charmpoints', 'Charm points'],
  ['bossPoints', 'bosspoints', 'Boss points'],
  ['achievements', 'achievements', 'Achievement points'],
  ['loyalty', 'loyaltypoints', 'Loyalty points'],
  ['fishing', 'fishing', 'Fishing'],
  ['dromeScore', 'drome', 'Drome score'],
];

/** Earliest recorded value of a skill field; the delta window is the whole history. */
function firstKnown(field) {
  for (const e of history) if (e[field] != null) return { value: e[field], date: e.date };
  return null;
}

const deaths = [...(profile?.deaths || [])].reverse();
const myHunts = logbook();
const grounds4me = level == null ? [] : [...new Map(
  table.filter((r) => r.xpRawRate != null && r.level != null && r.level <= level && r.level >= level - 250)
    .sort((a, b) => b.xpRawRate - a.xpRawRate)
    .map((r) => [r.groundSlug, r]),
).values()].slice(0, 10);

const onlineSamples = onlineLog?.samples || [];
const cadence = onlineLog?.cadenceMinutes || 15;
const onlineSeen = onlineSamples.filter((sample) => sample.online);
const latestSample = onlineSamples.at(-1) || null;
// the sampler persists every observed level-up before compacting old raw
// samples away; deriving from raw alone would forget anything >14 days old
const onlineLevelUps = onlineLog?.levelUps?.length ? onlineLog.levelUps : observedOnlineLevelUps(onlineSamples);

const skillRows = latest ? SKILLS
  .filter(([key]) => latest[key] != null)
  .map(([key, rankKey, label]) => {
    const first = firstKnown(key);
    const value = latest[key];
    return {
      key,
      label,
      value,
      rank: profile?.skillRanks?.[rankKey] ?? null,
      firstValue: first?.value ?? null,
      firstDate: first?.date ?? null,
      delta: first ? value - first.value : null,
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

function saveTimezone(value) {
  timezone = value || DEFAULT_TIMEZONE;
  try { localStorage.setItem(TIMEZONE_STORAGE_KEY, timezone); } catch { /* best-effort */ }
}

function timezoneOptionsHtml() {
  let group = null;
  let html = '';
  for (const item of SUPPORTED_TIMEZONES) {
    if (item.group !== group) {
      if (group) html += '</optgroup>';
      group = item.group;
      html += `<optgroup label="${esc(group)}">`;
    }
    html += `<option value="${esc(item.value)}"${item.value === timezone ? ' selected' : ''}>${esc(getTimezoneDisplayLabel(item.value))}</option>`;
  }
  return group ? `${html}</optgroup>` : html;
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

function statusBadge(online) {
  return `<span class="badge ${online ? 'badge-success' : 'badge-error'}">${online ? 'Online' : 'Offline'}</span>`;
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

function dailyOnlineRows(samples, minutesPerSample, tz) {
  const map = new Map();
  for (const sample of samples) {
    const date = dateKeyInTimezone(sample.slot, tz);
    if (!date) continue;
    if (!map.has(date)) {
      map.set(date, {
        date,
        samples: 0,
        onlineSamples: 0,
        minutes: 0,
        lastLevel: null,
        lastSlot: null,
        worldPlayersOnline: null,
      });
    }
    const row = map.get(date);
    row.samples += 1;
    row.lastSlot = sample.slot;
    row.worldPlayersOnline = sample.worldPlayersOnline ?? row.worldPlayersOnline;
    if (sample.online) {
      row.onlineSamples += 1;
      row.minutes += minutesPerSample;
      row.lastLevel = sample.level ?? row.lastLevel;
    }
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function observedOnlineLevelUps(samples) {
  const rows = [];
  let previousLevel = null;
  for (const sample of samples) {
    if (!sample.online || !Number.isFinite(sample.level)) continue;
    if (previousLevel != null && sample.level > previousLevel) {
      rows.push({ slot: sample.slot, from: previousLevel, level: sample.level, vocation: sample.vocation });
    }
    previousLevel = sample.level;
  }
  return rows.reverse();
}

function xpRowsForChart(metric, range) {
  let rows = historyRows;
  if (range !== 'all') rows = rows.slice(-Number(range));
  if (metric === 'daily') {
    return {
      title: 'Daily XP gained',
      note: `${rows.filter((row) => row.gain != null).length} gain rows`,
      baseline: 'zero',
      data: rows.filter((row) => row.gain != null).map((row) => ({ key: row.date.slice(5), n: row.gain })),
    };
  }
  if (metric === 'level') {
    return {
      title: 'Tracked level',
      note: `${rows.length} daily levels`,
      baseline: 'min',
      data: rows.map((row) => ({ key: row.date.slice(5), n: row.level })),
    };
  }
  return {
    title: 'Total experience',
    note: `${rows.length} exact highscore rows`,
    baseline: 'min',
    data: rows.map((row) => ({ key: row.date.slice(5), n: row.experience })),
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

function profileTableHtml() {
  return tableHtml([
    { label: 'Field', cell: (row) => esc(row[0]) },
    { label: 'Value', cell: (row) => plain(row[1]) },
  ], profileRows(), 'No character profile data yet.');
}

function onlineSampleTableHtml() {
  return tableHtml([
    { label: 'Slot', cell: (row) => esc(fmtDateTime(row.slot) || row.slot || '-') },
    { label: 'Status', cell: (row) => statusBadge(row.online) },
    { label: 'Level seen', className: 'num', cell: (row) => row.level != null ? nf(row.level) : '<span class="dim">-</span>' },
    { label: 'Vocation', cell: (row) => plain(row.vocation) },
    { label: 'World online', className: 'num', cell: (row) => row.worldPlayersOnline != null ? nf(row.worldPlayersOnline) : '<span class="dim">-</span>' },
    { label: 'Sampled at', cell: (row) => esc(fmtDateTime(row.sampledAt) || '-') },
  ], [...onlineSamples].reverse().slice(0, 48), 'No online samples yet. The 15-minute workflow will create the first row after it runs.');
}

function onlineDailyTableHtml(onlineDaily) {
  // days older than the sampler's raw window arrive pre-compacted per UTC
  // day (the raw slots are pruned); they join the recent timezone-grouped
  // rows with an explicit UTC marker rather than being re-bucketed.
  const compacted = (onlineLog?.days || []).map((d) => ({
    date: `${d.date} <span class="dim">(UTC)</span>`,
    sortKey: d.date,
    samples: d.observed,
    onlineSamples: d.online,
    minutes: d.minutes,
    lastLevel: d.maxLevel,
    lastSlot: null,
    worldPlayersOnline: null,
  }));
  const merged = [...onlineDaily.map((r) => ({ ...r, sortKey: r.date }))]
    .concat(compacted)
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  return tableHtml([
    { label: 'Date', cell: (row) => row.date },
    { label: 'Observed online', className: 'num', cell: (row) => hm(row.minutes) },
    { label: 'Online samples', className: 'num', cell: (row) => `${nf(row.onlineSamples)} / ${nf(row.samples)}` },
    { label: 'Last seen level', className: 'num', cell: (row) => row.lastLevel != null ? nf(row.lastLevel) : '<span class="dim">-</span>' },
    { label: 'Last slot', cell: (row) => esc(fmtDateTime(row.lastSlot) || '-') },
    { label: 'World online', className: 'num', cell: (row) => row.worldPlayersOnline != null ? nf(row.worldPlayersOnline) : '<span class="dim">-</span>' },
  ], merged.slice(0, 30), 'No daily online summary yet.');
}

function onlineLevelUpTableHtml() {
  return tableHtml([
    { label: 'Observed slot', cell: (row) => esc(fmtDateTime(row.slot) || row.slot) },
    { label: 'From', className: 'num', cell: (row) => nf(row.from) },
    { label: 'To', className: 'num', cell: (row) => nf(row.level) },
    { label: 'Vocation', cell: (row) => plain(row.vocation) },
  ], onlineLevelUps, 'No level-up was observed by the 15-minute online sampler yet.');
}

function onlineBodyHtml() {
  const onlineDaily = dailyOnlineRows(onlineSamples, cadence, timezone);
  const todayKey = dateKeyInTimezone(new Date(), timezone);
  const todayOnline = onlineDaily.find((row) => row.date === todayKey);
  const timezoneLabel = getTimezoneDisplayLabel(timezone);
  return `
    <div class="tool-fields timezone-controls">
      <label class="lbl lbl-wide"><span class="eyebrow">Show times in</span><select id="timezone-select">${timezoneOptionsHtml()}</select></label>
      <span class="fine dim timezone-context">${esc(timezoneLabel)} · days below use this timezone</span>
    </div>
    <div class="pulse-row">
      <div class="panel pulse"><div class="big num">${latestSample ? (latestSample.online ? 'Online' : 'Offline') : '-'}</div><div class="eyebrow">Last sample</div></div>
      <div class="panel pulse"><div class="big num">${todayOnline ? hm(todayOnline.minutes) : '0m'}</div><div class="eyebrow">Sampled online today</div></div>
      <div class="panel pulse"><div class="big num">${nf(onlineSeen.length)}</div><div class="eyebrow">Online samples</div></div>
      <div class="panel pulse"><div class="big num">${nf(onlineLevelUps.length)}</div><div class="eyebrow">Observed level-ups</div></div>
    </div>
    ${onlineDaily.length ? `<div class="panel panel-pad viz" style="margin-top:12px">
      <p class="eyebrow" style="margin:0 0 8px">Sampled online minutes by ${esc(timezoneLabel)} day</p>
      ${bars([...onlineDaily].reverse().slice(-14).map((row) => ({ key: row.date.slice(5), n: row.minutes })), { fmt: hm })}
    </div>` : ''}
    <div class="section-subhead"><h3>Daily sampled summary</h3><span class="fine dim">online samples / total samples</span></div>
    ${onlineDailyTableHtml(onlineDaily)}
    <div class="section-subhead"><h3>Observed level changes</h3><span class="fine dim">only when the sampler catches the character online</span></div>
    ${onlineLevelUpTableHtml()}
    <div class="section-subhead"><h3>Recent samples</h3><span class="fine dim">${esc(onlineLog?.source || 'TibiaData world endpoint')}</span></div>
    ${onlineSampleTableHtml()}`;
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

function renderTimeSensitiveSections() {
  const profileTarget = $('#profile-table');
  const onlineTarget = $('#online-dynamic');
  const deathsTarget = $('#deaths-table');
  const huntTarget = $('#hunt-table');
  const lastLoginTarget = $('#last-login-day');
  if (profileTarget) profileTarget.innerHTML = profileTableHtml();
  if (onlineTarget) {
    onlineTarget.innerHTML = onlineBodyHtml();
    bindTimezoneSelect();
  }
  if (deathsTarget) deathsTarget.innerHTML = deathsTableHtml();
  if (huntTarget) huntTarget.innerHTML = huntTableHtml();
  if (lastLoginTarget) lastLoginTarget.textContent = profile ? (fmtDateOnly(profile.lastLogin) || '-') : '-';
}

function bindTimezoneSelect() {
  const select = $('#timezone-select');
  if (!select) return;
  select.addEventListener('change', () => {
    saveTimezone(select.value);
    renderTimeSensitiveSections();
  });
}

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

const skillsTable = tableHtml([
  { label: 'Skill', cell: (row) => esc(row.label) },
  { label: 'Value', className: 'num', cell: (row) => nf(row.value) },
  { label: 'Rank', className: 'num', cell: (row) => row.rank != null ? `#${nf(row.rank)}` : '<span class="dim">-</span>' },
  { label: 'First tracked', className: 'num', cell: (row) => row.firstValue != null ? nf(row.firstValue) : '<span class="dim">-</span>' },
  { label: 'Delta', className: 'num', cell: (row) => signed(row.delta) },
  { label: 'Window', cell: (row) => esc([row.firstDate, row.sourceDate].filter(Boolean).join(' -> ')) },
], skillRows, 'No skill rows yet.');

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
  <header class="hello">
    <p class="eyebrow">${esc(profile?.world || 'Tibia')} · ${esc(profile?.vocation || 'character')} dashboard</p>
    <h1><span class="grad-text">${esc(profile?.name || "Night'Flyn")}</span>${level != null ? ` · ${nf(level)}` : ''}</h1>
    <p>Progression, hunts, profit, deaths, creature matchups, charms and the numbers behind the next decision.</p>
    <div class="actions">
      <a class="btn btn-primary btn-lg" href="submit.html">Save a hunt</a>
      <a class="btn btn-tertiary btn-lg" href="grounds.html">Plan next hunt</a>
    </div>
  </header>

  ${facts.length ? `<div class="pulse-row">
    ${facts.map((f) => `<div class="panel pulse"><div class="big num">${f.big}</div><div class="eyebrow">${esc(f.cap)}</div></div>`).join('')}
  </div>` : ''}

  <section class="section" style="margin-top:0">
    <div class="section-bar"><h2>Profile details</h2><span class="fine dim">TibiaData profile surface</span></div>
    <div id="profile-table">${profileTableHtml()}</div>
  </section>

  <section class="section">
    <div class="section-bar"><h2>Experience history</h2><span class="fine dim">${esc(historyNote)}</span></div>
    ${bestDay?.gain ? `<p class="fine dim" style="margin:0 0 10px">Best recorded day: <b class="num">+${nf(bestDay.gain)}</b> exp on ${esc(bestDay.date)}</p>` : ''}
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
          </div>
          <div class="chart-button-group" aria-label="XP chart range">
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-range="7" aria-pressed="false">7d</button>
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-range="30" aria-pressed="false">30d</button>
            <button type="button" class="btn btn-tertiary btn-sm" data-xp-range="all" aria-pressed="true">All</button>
          </div>
        </div>
      </div>
      <div id="xp-chart"></div>
    </div>
    <div class="section-subhead"><h3>Daily rows</h3><span class="fine dim">exact XP, XP-to-next and source per row</span></div>
    ${xpTable}
  </section>

  ${trackedLevel != null && experience != null && avgDailyXp != null ? `
  <section class="section">
    <div class="section-bar"><h2>Level prediction</h2><span class="fine dim">tracked pace, straight arithmetic</span></div>
    <div class="panel panel-pad">
      <div class="tool-fields">
        <label class="lbl lbl-narrow"><span class="eyebrow">Target level</span><input id="pred-level" type="number" min="${trackedLevel + 1}" max="2000" value="${nextMilestoneLevel(trackedLevel)}"></label>
        <label class="lbl"><span class="eyebrow">Avg daily exp</span><input id="pred-pace" type="number" min="1" value="${avgDailyXp}"></label>
      </div>
      <div class="tool-result" id="pred-out"></div>
      <p class="fine dim">Pace defaults to the last ${nf(recentGains.length)} tracked days' average; edit either field.</p>
    </div>
  </section>` : ''}

  <section class="section">
    <div class="section-bar"><h2>Online samples</h2><span class="fine dim">TibiaData world online_players every ${nf(cadence)} minutes</span></div>
    <p class="fine dim" style="margin:0 0 12px">This is sampled status, not continuous telemetry. Each online row means Night'Flyn appeared in Gentebra's public world list during that 15-minute slot.</p>
    <div id="online-dynamic">${onlineBodyHtml()}</div>
  </section>

  ${latest ? `
  <section class="section">
    <div class="section-bar"><h2>Skills &amp; standings</h2><span class="fine dim">as of ${esc(latest.date)} · each skill keeps its own unit</span></div>
    <div class="facts">
      ${skillRows.map((row) => `
        <div class="fact">
          <b class="num">${nf(row.value)}</b>
          <span class="fine dim">${esc(row.label)}</span>
          <span class="fine dim">${row.rank != null ? `Rank #${nf(row.rank)}` : 'Tracked value'}${row.delta ? ` · ${row.delta > 0 ? '+' : ''}${nf(row.delta)}` : ''}</span>
        </div>`).join('')}
    </div>
    <div class="section-subhead"><h3>Skill rows</h3><span class="fine dim">no shared-axis comparison across different skill scales</span></div>
    ${skillsTable}
  </section>` : ''}

  ${levelUps.length ? `
  <section class="section">
    <div class="section-bar"><h2>Level-up log</h2><span class="fine dim">daily highscore rows where tracked level rose</span></div>
    ${tableHtml([
      { label: 'Date', cell: (row) => esc(row.date) },
      { label: 'Reached', className: 'num', cell: (row) => nf(row.level) },
      { label: 'Step', className: 'num', cell: (row) => `+${nf(row.step)}` },
      { label: 'Source', cell: (row) => esc(sourceName(row.source)) },
    ], levelUps, 'No tracked level-ups yet.')}
  </section>` : ''}

  <section class="section">
    <div class="section-bar"><h2>Deaths</h2><span class="fine dim">${nf(profile?.deaths?.length || 0)} on record</span></div>
    <div id="deaths-table">${deathsTableHtml()}</div>
  </section>

  ${grounds4me.length ? `
  <section class="section">
    <div class="section-bar"><h2>Level-fit hunt targets</h2><a class="fine dim" href="grounds.html">Open full planner</a></div>
    <div class="story-rail">
      ${grounds4me.slice(0, 8).map((r) => `
        <a class="story" href="ground.html?g=${esc(r.groundSlug)}" title="${esc(r.ground)} - ${kk(r.xpRawRate)} raw XP/h from level ${nf(r.level)}">
          ${ring(r.ground)}
          <span class="cap">${esc(r.ground)}</span>
        </a>`).join('')}
    </div>
    <div class="section-subhead"><h3>Planner rows</h3><span class="fine dim">same data the planner ranks, filtered around level ${nf(level)}</span></div>
    ${groundsTable}
  </section>` : ''}

  <section class="section">
    <div class="section-bar"><h2>My hunt log</h2><a class="fine dim" href="analytics.html">Progress</a></div>
    <div class="pulse-row">
      <div class="panel pulse"><div class="big num">${nf(myHunts.length)}</div><div class="eyebrow">Logged hunts</div></div>
      <div class="panel pulse"><div class="big num">${nf(grounds.directory.length)}</div><div class="eyebrow">Grounds in the planner</div></div>
      <div class="panel pulse"><div class="big num">${nf(codex.size)}</div><div class="eyebrow">Creatures in the codex</div></div>
      <div class="panel pulse"><div class="big num" id="last-login-day">${profile ? (fmtDateOnly(profile.lastLogin) || '-') : '-'}</div><div class="eyebrow">Last login</div></div>
    </div>
    <div class="section-subhead"><h3>Recent analyser sessions</h3><span class="fine dim">private browser logbook</span></div>
    <div id="hunt-table">${huntTableHtml()}</div>
  </section>`;

bindTimezoneSelect();

// ---- chart controls ----
const xpState = { metric: 'total', range: 'all' };

function renderXpChart() {
  const chart = $('#xp-chart');
  if (!chart) return;
  const selected = xpRowsForChart(xpState.metric, xpState.range);
  $('#xp-chart-title').textContent = selected.title;
  $('#xp-chart-note').textContent = selected.note;
  chart.innerHTML = selected.data.length
    ? flow(selected.data, { baseline: selected.baseline })
    : '<p class="dim">Not enough rows for this chart yet.</p>';
  attachFlowHover(chart.closest('.viz'));
  document.querySelectorAll('[data-xp-metric]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.xpMetric === xpState.metric));
  });
  document.querySelectorAll('[data-xp-range]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.xpRange === xpState.range));
  });
}

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
