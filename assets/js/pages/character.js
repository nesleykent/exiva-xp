/**
 * Character - the tracked character's dashboard (config.ini): generated profile, progression,
 * highscores, deaths, and shortcuts into the planning tools.
 */

import { boot } from './_boot.js';
import { esc, initials } from '../lib/text.js';
import { DAY_MS, MONTHS, compact, dateTicks, gp, kk, nf, day, md, pct } from '../lib/fmt.js';
import { average, rollingMean } from '../lib/stats.js';
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_STORAGE_KEY,
  formatDateInTimezone,
} from '../lib/timezones.js';
import { $, metric, ring } from '../shell.js';
import { columns, columnsLegend, sparkline, attachVizHover, chartInto, vizEmpty } from '../viz/svg.js';
import { loadCharacter, loadCharacterHistory, logbook } from '../data/sources.js';
import { dailyGains, experienceUntilNextLevel, progressWithinLevel, xpPace } from '../engine/progression.js';
import { baseVocation, vocationFits } from '../engine/rules.js';
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

const gains = dailyGains(history);
const gainByDate = new Map(gains.map((g) => [g.date, g.gain]));
const historyRows = history.map((row, i) => {
  const prev = history[i - 1] || null;
  // gain is null across a tracker gap (see dailyGains); levelDelta stays a
  // raw delta regardless, so a multi-level jump across a gap reads as one.
  return {
    ...row,
    gain: gainByDate.get(row.date) ?? null,
    levelDelta: prev ? row.level - prev.level : null,
    rankDelta: prev && row.rank != null && prev.rank != null ? row.rank - prev.rank : null,
    xpToNext: experienceUntilNextLevel(row.level, row.experience),
    progress: progressWithinLevel(row.level, row.experience),
  };
});

// Level-up log, derived from the daily rows: every day the tracked level rose.
const levelUpsChronological = historyRows
  .filter((row) => row.levelDelta > 0)
  .map((row) => ({ date: row.date, level: row.level, step: row.levelDelta }));

const pace = xpPace(gains);

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
const characterVocation = baseVocation(profile?.vocation);
const compatibleRows = level == null ? [] : table.filter((r) =>
  r.xpRawRate != null
  && r.level != null
  && r.level <= level
  && vocationFits(r.vocation, characterVocation));
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


function loadTimezone() {
  try {
    return localStorage.getItem(TIMEZONE_STORAGE_KEY) || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function fmtDateOnly(iso) {
  return iso ? formatDateInTimezone(iso, timezone) : null;
}

const chartYears = [...new Set(historyRows.map((row) => row.date.slice(0, 4)))].sort();
const monthsInYear = (year) => [...new Set(historyRows.filter((row) => row.date.startsWith(year)).map((row) => row.date.slice(5, 7)))].sort();
const monthName = (monthKey) => MONTHS[Number(monthKey) - 1];

/**
 * Experience chart data — one "XP gained" series, matching the reference.
 * A whole year aggregates to monthly totals (a smooth ~12-point area); a
 * single month shows its daily gains. Level-up and death markers ride along.
 */
/*
 * Experience chart data in the columns() shape: a year shows one column per
 * tracked month (placed at mid-month, so a month the tracker missed leaves a
 * hatched gap instead of Feb running straight into May); a month shows one
 * column per tracked day under a 7-day trend.
 */
const dayNumber = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const longDate = (iso) => `${md(iso)}, ${iso.slice(0, 4)}`;

function experienceChartData(year, month) {
  const inYear = historyRows.filter((row) => row.date.startsWith(year));
  if (month === 'all') {
    const byMonth = new Map();
    for (const row of inYear) {
      if (row.gain == null) continue;
      const key = row.date.slice(5, 7);
      if (!byMonth.has(key)) byMonth.set(key, { gain: 0, days: 0, events: [] });
      const entry = byMonth.get(key);
      entry.gain += row.gain;
      entry.days += 1;
      entry.events.push(...chartEvents(row.date));
    }
    const points = [...byMonth.keys()].sort().map((monthKey) => {
      const entry = byMonth.get(monthKey);
      const levels = entry.events.filter((e) => e.type === 'level').length;
      return {
        t: dayNumber(`${year}-${monthKey}-15`),
        n: entry.gain,
        key: monthName(monthKey),
        events: entry.events,
        tip: [`${monthName(monthKey)} ${year}`, `${nf(entry.days)} tracked day${entry.days === 1 ? '' : 's'}`, levels ? `${nf(levels)} level-up${levels === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '),
      };
    });
    return {
      points,
      step: 30,
      gapOver: 45,
      trend: null,
      unit: 'XP gained per month',
      series: 'XP gained per month',
      averageLabel: 'Monthly average',
      ticks: () => points.map((p) => ({ t: p.t, label: p.key })),
    };
  }
  const inMonth = inYear.filter((row) => row.date.slice(5, 7) === month && row.gain != null);
  const points = inMonth.map((row) => ({ t: dayNumber(row.date), n: row.gain, key: md(row.date), date: row.date, events: chartEvents(row.date) }));
  const trend = rollingMean(points, 7, 4);
  points.forEach((p, k) => {
    const levels = p.events.filter((e) => e.type === 'level').length;
    p.tip = [longDate(p.date), trend[k] != null ? `7-day avg ${compact(trend[k])}` : '', levels ? `${nf(levels)} level-up${levels === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  });
  return {
    points,
    step: 1,
    gapOver: 1,
    trend,
    unit: 'XP gained per day',
    series: 'XP gained per day',
    averageLabel: 'Month average',
    ticks: (width) => dateTicks(points[0].t, points.at(-1).t, Math.max(2, Math.floor((width - 62) / 88))),
  };
}

function gainAverage(days) {
  return average(historyRows.slice(-days).map((row) => row.gain).filter((gain) => gain != null));
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

function sampledSeries(series, maxPoints = 40) {
  if (series.length <= maxPoints) return series;
  const out = [];
  const last = series.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    out.push(series[Math.round((i / (maxPoints - 1)) * last)]);
  }
  return out;
}

/** A tracked fighting/skill level — no percent-to-next-level bar, TibiaData's
 * highscores endpoint returns the skill level only, never skill experience,
 * so a progress fraction would have to be invented. */
function skillCardHtml(row) {
  return `
    <div class="skill-item">
      <div class="skill-item-head">
        <span class="skill-item-name">${esc(SKILL_SHORT[row.key] || row.label)}</span>
        <b class="num">${nf(row.value)}</b>
      </div>
      <small class="dim">${row.rank != null ? `#${nf(row.rank)} world rank` : 'unranked'}</small>
    </div>`;
}

function statCardHtml(row) {
  return metric(STAT_LABEL[row.key] || row.label, nf(row.value),
    row.rank != null ? `#${nf(row.rank)} worldwide` : esc(row.kind), { size: 'sm' });
}

function nextHuntsHtml() {
  if (!grounds4me.length) return '';
  return `
    <ul class="next-hunts">
      ${grounds4me.slice(0, 8).map((row) => `
        <li><a class="next-hunts-item" href="grounds.html?g=${esc(row.groundSlug)}">
          <span class="next-hunts-ring"><span>${esc(initials(row.ground))}</span></span>
          <small>${esc(row.ground)}</small>
        </a></li>`).join('')}
    </ul>`;
}

const SKILL_KIND = 'skill level';
// reference order + short labels for the Skills grid (weapon skills first,
// then magic/distance, then the rest) — matches the standalone template
const SKILL_ORDER = ['swordFighting', 'shielding', 'magicLevel', 'distanceFighting', 'axeFighting', 'clubFighting', 'fistFighting', 'fishing'];
const SKILL_SHORT = {
  swordFighting: 'Sword', shielding: 'Shielding', magicLevel: 'Magic', distanceFighting: 'Distance',
  axeFighting: 'Axe', clubFighting: 'Club', fistFighting: 'Fist', fishing: 'Fishing',
};
const skillRows = highscoreRows
  .filter((row) => row.kind === SKILL_KIND)
  .sort((a, b) => {
    const ai = SKILL_ORDER.indexOf(a.key), bi = SKILL_ORDER.indexOf(b.key);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
// the reference's six point-stat cards, in its exact order (Loyalty Points is
// tracked but the reference doesn't surface it here)
const STAT_ORDER = ['achievements', 'bountyPoints', 'weeklyTasks', 'bossPoints', 'dromeScore', 'charmPoints'];
const STAT_LABEL = {
  achievements: 'Achievements', bountyPoints: 'Bounty points', weeklyTasks: 'Weekly tasks',
  bossPoints: 'Boss points', dromeScore: 'Drome score', charmPoints: 'Charm points',
};
const statRows = STAT_ORDER.map((key) => highscoreRows.find((row) => row.key === key)).filter(Boolean);

const deathCutoff = latest ? new Date(`${latest.date}T00:00:00Z`) : new Date();
const deaths30 = deaths.filter((row) => deathCutoff - new Date(row.time) < 30 * DAY_MS).length;
const deathsPrev30 = deaths.filter((row) => {
  const age = deathCutoff - new Date(row.time);
  return age >= 30 * DAY_MS && age < 60 * DAY_MS;
}).length;
const deathsDelta = deaths.length ? deaths30 - deathsPrev30 : null;

const avg7 = gainAverage(7);
const avg30 = gainAverage(30);

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

const insight = paceInsight();
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
const totalXpSpark = sampledSeries(historyRows.map((row) => ({ key: md(row.date), label: longDate(row.date), n: row.experience })), 24);

const metricDelta = (text, tone) => (text == null ? '' : `<em class="metric-delta ${tone}">${text}</em>`);

/** Template-aligned KPI row: value, coloured delta, context line — one card per question. */
function progressionOverviewHtml() {
  return `
    <div class="dashboard-metrics" aria-label="Progression at a glance">
      ${metric('Total experience', compact(experience),
    monthGain != null ? `${metricDelta(`+${compact(monthGain)}`, 'up')} this month` : esc(historyNote),
    { sparkId: totalXpSpark.length >= 2 ? 'xp-total-spark' : null, sparkInline: true })}
      ${metric('XP / day pace', compact(pace?.xp),
    insight ? `${metricDelta(`${insight.deltaPct > 0 ? '+' : ''}${insight.deltaPct}%`, insight.tone)} vs 30-day average` : (pace ? `${nf(pace.days)} recent recorded days` : 'Not enough pace data yet'))}
      ${metric('Profit / hour', profitRate ? gp(profitRate.rate) : '—',
    profitRate ? `across ${nf(profitRate.n)} logged hunt${profitRate.n === 1 ? '' : 's'}` : 'No logged hunts yet')}
      ${metric('Deaths', nf(deaths30), deathsDelta == null ? 'No deaths on record'
    : deathsDelta === 0 ? 'even with the prior 30 days'
      : `${metricDelta(`${deathsDelta > 0 ? '+' : ''}${nf(deathsDelta)}`, deathsDelta > 0 ? 'down' : 'up')} last 30 days`)}
    </div>`;
}

/**
 * GitHub-style intensity grid over the last 26 tracked weeks of daily XP
 * gain. A day with no gap-free measurement renders as a distinct "unknown"
 * cell, never as zero — thresholds are quartiles of the real positive gains.
 */
function activityHeatmapHtml() {
  if (!latest || historyRows.length < 14) return vizEmpty('Not enough tracked days yet.');
  const gainByDate = new Map(historyRows.map((row) => [row.date, row.gain]));
  const positives = historyRows.map((row) => row.gain).filter((gain) => gain > 0).sort((a, b) => a - b);
  const quart = (p) => positives.length ? positives[Math.min(positives.length - 1, Math.floor(p * positives.length))] : Infinity;
  const t1 = quart(0.25), t2 = quart(0.5), t3 = quart(0.75);
  const levelOf = (gain) => (gain <= 0 ? 0 : gain <= t1 ? 1 : gain <= t2 ? 2 : gain <= t3 ? 3 : 4);
  const end = new Date(`${latest.date}T00:00:00Z`);
  const endWeekday = (end.getUTCDay() + 6) % 7;
  const start = new Date(end.getTime() - (25 * 7 + endWeekday) * DAY_MS);
  const weeks = [];
  for (let w = 0; w < 26; w++) {
    const first = new Date(start.getTime() + w * 7 * DAY_MS);
    const prev = new Date(first.getTime() - 7 * DAY_MS);
    const label = w === 0 || first.getUTCMonth() !== prev.getUTCMonth()
      ? MONTHS[first.getUTCMonth()] : '';
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const dayDate = new Date(start.getTime() + (w * 7 + d) * DAY_MS);
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
  if (!deaths.length) return vizEmpty('No deaths on record.');
  return `<ul class="death-list">${deaths.slice(0, 3).map((row) => `
    <li>
      <i class="death-dot" aria-hidden="true"></i>
      <div>
        <p>${esc(row.reason || 'Death')}</p>
        <p class="fine dim">${esc(fmtDateOnly(row.time) || day(row.time))} · level ${nf(row.level)}</p>
      </div>
    </li>`).join('')}</ul>`;
}

stage.innerHTML = `
  <div class="character-page">
  <header class="character-hero">
    ${ring(profile?.name || config.name, { cls: 'character-avatar' })}
    <div class="hero-identity">
      <div class="hero-name-row">
        <h1>${esc(profile?.name || config.name)}</h1>
        ${profile?.online ? '<span class="badge badge-success">Online</span>' : ''}
        <button type="button" class="btn btn-secondary btn-sm" id="share-profile">Share profile</button>
      </div>
      <p class="character-profile-line">${esc(profile?.vocation || 'Character')} · ${esc(profile?.world || config.world)}${level != null ? ` · Level ${nf(level)}` : ''}</p>
      ${trackedLevel != null && experience != null ? `
      <div class="character-level-progress">
        <div><span>Level ${nf(trackedLevel)} → ${nf(trackedLevel + 1)}</span><b class="num">${pct(levelProgressPct)}</b></div>
        <span class="track"><i style="width:${levelProgressPct.toFixed(2)}%"></i></span>
        <small>${nf(experienceUntilNextLevel(trackedLevel, experience))} XP remaining</small>
      </div>` : ''}
    </div>
  </header>

  <section class="progression-overview" aria-label="Progression">
    ${progressionOverviewHtml()}
  </section>

  ${grounds4me.length ? `
  <section aria-label="Next hunts">
    <h2 class="eyebrow panel-eyebrow">Next hunts</h2>
    ${nextHuntsHtml()}
  </section>` : ''}

  ${historyRows.length ? `
  <section class="panel panel-pad viz" aria-label="Experience">
    <div class="exp-head">
      <h2 class="eyebrow panel-eyebrow exp-title">Experience</h2>
      <div class="segmented" id="xp-year" role="group" aria-label="Year">
        ${chartYears.map((year) => `<button type="button" data-year="${year}" aria-pressed="${String(year === (chartYears.at(-1)))}">${year}</button>`).join('')}
      </div>
    </div>
    <div class="segmented exp-month" id="xp-month" role="group" aria-label="Month"></div>
    <div id="xp-chart"></div>
    <div id="xp-chart-legend" class="exp-legend"></div>
  </section>` : ''}

  ${skillRows.length ? `
  <section class="panel panel-pad" aria-label="Skills">
    <h2 class="eyebrow panel-eyebrow">Skills</h2>
    <div class="skill-grid">${skillRows.map(skillCardHtml).join('')}</div>
  </section>` : ''}

  ${statRows.length ? `
  <section aria-label="Tracked highscores">
    <div class="stat-cards">${statRows.map(statCardHtml).join('')}</div>
  </section>` : ''}

  <section class="activity-duo" aria-label="Hunting activity and recent deaths">
    <div class="panel panel-pad viz">
      <h2 class="eyebrow panel-eyebrow">Daily XP activity</h2>
      ${activityHeatmapHtml()}
    </div>
    <div class="panel panel-pad">
      <h2 class="eyebrow panel-eyebrow">Recent deaths</h2>
      ${recentDeathsHtml()}
    </div>
  </section>
  </div>
  `;

document.querySelectorAll('.viz').forEach((panel) => attachVizHover(panel));

// sparklines mount at their container's true pixel width (token-size text)
chartInto($('#xp-total-spark'), (width) => sparkline(totalXpSpark, { width, height: 28, fmt: compact, ticks: false }));
attachVizHover($('#xp-total-spark')?.closest('.metric'));

// ---- share profile: copy the character URL; no server, so just the link ----
const shareBtn = $('#share-profile');
if (shareBtn) {
  shareBtn.addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) { await navigator.share({ title: `${profile?.name || config.name} · Exiva XP`, url }); return; }
      await navigator.clipboard.writeText(url);
    } catch { /* user dismissed the share sheet, or clipboard denied — nothing to do */ }
    const original = shareBtn.textContent;
    shareBtn.textContent = 'Link copied';
    setTimeout(() => { shareBtn.textContent = original; }, 1600);
  });
}

// ---- Experience chart: one XP-gained series, year + month segmented ----
const xpState = { year: chartYears.at(-1) || String(new Date().getFullYear()), month: 'all' };

function renderMonthSeg() {
  const host = $('#xp-month');
  if (!host) return;
  const months = monthsInYear(xpState.year);
  host.innerHTML = [
    `<button type="button" data-month="all" aria-pressed="${String(xpState.month === 'all')}">All</button>`,
    ...months.map((month) => `<button type="button" data-month="${month}" aria-pressed="${String(month === xpState.month)}">${monthName(month)}</button>`),
  ].join('');
}

function renderXpChart() {
  const chart = $('#xp-chart');
  if (!chart) return;
  const view = experienceChartData(xpState.year, xpState.month);
  const { points } = view;
  const mean = points.length ? average(points.map((p) => p.n)) : null;
  chartInto(chart, (width) => columns(points, {
    label: `Experience gained, ${xpState.month === 'all' ? xpState.year : `${monthName(xpState.month)} ${xpState.year}`}`,
    width,
    height: width < 480 ? 220 : 240,
    fmt: compact,
    step: view.step,
    gapOver: view.gapOver,
    trend: view.trend,
    average: mean,
    unit: view.unit,
    ticks: points.length ? view.ticks(width) : [],
    empty: 'Not enough rows for this chart yet.',
  }));
  $('#xp-chart-legend').innerHTML = points.length ? columnsLegend({
    series: view.series,
    trend: view.trend ? '7-day average' : '',
    average: view.averageLabel,
    noData: points.some((p, k) => k && p.t - points[k - 1].t > view.gapOver),
    levels: points.some((p) => p.events.some((e) => e.type === 'level')),
    deaths: points.some((p) => p.events.some((e) => e.type === 'death')),
  }) : '';
  attachVizHover(chart.closest('.viz'));
  $('#xp-year')?.querySelectorAll('[data-year]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.year === xpState.year));
  });
}

$('#xp-year')?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-year]');
  if (!btn) return;
  xpState.year = btn.dataset.year;
  xpState.month = 'all';
  renderMonthSeg();
  renderXpChart();
});
$('#xp-month')?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-month]');
  if (!btn) return;
  xpState.month = btn.dataset.month;
  $('#xp-month').querySelectorAll('[data-month]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  renderXpChart();
});

if ($('#xp-chart')) {
  renderMonthSeg();
  renderXpChart();
}

// the heatmap reads oldest → newest; on a narrow panel open it at today, not April
const heatmap = stage.querySelector('.heatmap');
if (heatmap) heatmap.scrollLeft = heatmap.scrollWidth;
export {};
