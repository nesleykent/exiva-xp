/**
 * Home — daily character dashboard: current progression, next hunt,
 * attention items and direct routes into the player's core loop.
 */

import { boot } from './_boot.js';
import { esc } from '../lib/text.js';
import { compact, kk, nf, md } from '../lib/fmt.js';
import { experienceUntilNextLevel, progressWithinLevel } from '../engine/progression.js';
import { judge } from '../engine/rules.js';
import { loadCharacter, loadCharacterHistory, logbook } from '../data/sources.js';
import { ICONS, basisPill } from '../shell.js';
import { sparkline, chartInto } from '../viz/svg.js';

const { stage, table, config } = await boot('index.html', { ledger: true, config: true });
const [profile, history] = await Promise.all([
  loadCharacter().catch(() => null),
  loadCharacterHistory().catch(() => []),
]);

const characterName = profile?.name || config.name;
const level = profile?.level ?? history.at(-1)?.level ?? null;
const vocation = profile?.vocation || '';
const latest = history.at(-1) || null;
const previous = history.at(-2) || null;
const book = logbook();
const consecutiveLatest = latest && previous
  && (new Date(latest.date) - new Date(previous.date)) === 86_400_000;
const latestGain = consecutiveLatest ? Math.max(0, latest.experience - previous.experience) : null;
// gap-free daily gains, dated — the same series backs both the pace figure
// and its sparkline, so the trend line never shows a number the average
// didn't also use
const gainSeries = history.slice(1).map((row, index) => {
  const prior = history[index];
  return (new Date(row.date) - new Date(prior.date)) === 86_400_000
    ? { key: md(row.date), n: Math.max(0, row.experience - prior.experience) }
    : null;
}).filter((g) => g != null).slice(-14);
const recentGains = gainSeries.slice(-7).map((g) => g.n);
const avgDailyXp = recentGains.length
  ? Math.round(recentGains.reduce((sum, gain) => sum + gain, 0) / recentGains.length)
  : null;
// a trailing 3-day rolling average of the same real gains — genuinely
// distinct from the raw daily series above, not just the same shape twice
const paceSeries = gainSeries.map((g, i, arr) => {
  const window = arr.slice(Math.max(0, i - 2), i + 1);
  return { key: g.key, n: Math.round(window.reduce((sum, w) => sum + w.n, 0) / window.length) };
});
const xpToNext = latest ? experienceUntilNextLevel(latest.level, latest.experience) : null;
const levelProgress = latest ? progressWithinLevel(latest.level, latest.experience) : null;

function norm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function vocationMatches(rowVocation) {
  if (!rowVocation) return true;
  const row = norm(rowVocation);
  const current = norm(vocation);
  if (!row || !current) return true;
  if (current.includes('druid')) return row.includes('druid');
  if (current.includes('sorcerer')) return row.includes('sorcerer') || row === 'mage';
  if (current.includes('knight')) return row.includes('knight');
  if (current.includes('paladin')) return row.includes('paladin');
  return row === current;
}

const nextHunt = table
  .filter((row) => row.xpRawRate != null && row.level != null && row.level <= level && vocationMatches(row.vocation))
  .sort((a, b) => b.xpRawRate - a.xpRawRate)[0] || null;

let charmPoints = null;
for (let index = history.length - 1; index >= 0; index--) {
  if (history[index].charmPoints == null) continue;
  charmPoints = Number(history[index].charmPoints);
  break;
}

const ruleStates = book.map((hunt) => judge(hunt, book));
const faulted = ruleStates.filter((verdict) => !verdict.ok).length;
const flagged = ruleStates.filter((verdict) => verdict.ok && verdict.flags.length).length;
const attention = [];
if (!book.length) {
  attention.push({ text: 'Your private logbook has no analyser sessions yet.', label: 'Log a hunt', href: 'submit.html' });
} else if (faulted || flagged) {
  attention.push({
    text: `${nf(faulted)} faulted and ${nf(flagged)} flagged hunt${faulted + flagged === 1 ? '' : 's'} need review.`,
    label: 'Review',
    href: 'admin.html',
  });
}
if (profile?.level != null && latest?.level != null && profile.level !== latest.level) {
  attention.push({ text: `The live profile is level ${nf(profile.level)} while the last history row is level ${nf(latest.level)}.`, label: 'Details', href: 'character.html' });
}
if (!latest) attention.push({ text: 'No experience history is available yet.', label: 'Character', href: 'character.html' });
if (!attention.length) attention.push({ text: `Character tracking is current through ${esc(latest.date)}.`, label: 'Open profile', href: 'character.html' });

const shortcuts = [
  ['character.html', 'Character', ICONS.user],
  ['grounds.html', 'Planner', ICONS.compass],
  ['submit.html', 'Log a hunt', ICONS.plus],
  ['tools.html', 'Tools', ICONS.tools],
  ['analytics.html', 'Analytics', ICONS.chart],
  ['creatures.html', 'Codex', ICONS.book],
  ['charms.html', 'Charms', ICONS.gem],
  ['admin.html', 'Logbook', ICONS.shield],
];

function metric(label, value, detail, { extra = '', sparkId } = {}) {
  return `
    <article class="panel home-metric">
      <span class="eyebrow">${esc(label)}</span>
      <b class="num">${value}</b>
      <small class="dim">${detail}${extra}</small>
      ${sparkId ? `<div class="metric-spark" id="${sparkId}"></div>` : ''}
    </article>`;
}

const today = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
}).format(new Date());

stage.innerHTML = `
  <header class="home-dashboard-head">
    <p class="eyebrow">${esc(today)}</p>
    <h1><span class="grad-text">${esc(characterName)}</span></h1>
    <p>${level != null ? `Level ${nf(level)} ${esc(vocation || 'character')}` : esc(vocation || 'Character')} · your day at a glance.</p>
  </header>

  <section class="home-metric-grid" aria-label="Character at a glance">
    ${metric('Current level', level != null ? nf(level) : '—', levelProgress != null ? `${levelProgress.toFixed(0)}% through this level` : 'Waiting for exact experience')}
    ${metric('Latest daily XP', latestGain != null ? `+${compact(latestGain)}` : '—', consecutiveLatest ? `tracked on ${esc(latest.date)}` : 'No consecutive-day reading', { sparkId: gainSeries.length >= 2 ? 'home-gain-spark' : null })}
    ${metric('XP pace', avgDailyXp != null ? `${compact(avgDailyXp)}<em>/day</em>` : '—', recentGains.length ? `average of ${nf(recentGains.length)} recorded days` : 'Not enough consecutive days', { sparkId: gainSeries.length >= 2 ? 'home-pace-spark' : null })}
    ${metric(`Level ${level != null ? nf(level + 1) : ''}`, xpToNext != null ? compact(xpToNext) : '—', 'XP remaining')}
    ${metric('Charm points', charmPoints != null ? nf(charmPoints) : '—', charmPoints != null ? 'earned points; spending is private' : 'No tracked highscore value')}
  </section>

  <section class="panel home-next-hunt">
    <div class="home-card-kicker">
      <p class="eyebrow">Next hunt · from your evidence</p>
      ${nextHunt ? basisPill(nextHunt.basis) : ''}
    </div>
    ${nextHunt ? `
      <h2>${esc(nextHunt.ground)}</h2>
      <p class="dim">The strongest level-fit ${esc(nextHunt.vocation || 'team')} planner row available for ${esc(characterName)} right now. Open the dossier to check creatures, access and the best usable attack element before hunting.</p>
      <div class="home-hunt-stats">
        <span><b class="num">${kk(nextHunt.xpRawRate)}</b><small>raw XP/h</small></span>
        <span><b class="num">${nextHunt.profitRate != null ? kk(nextHunt.profitRate) : '—'}</b><small>profit/h</small></span>
        <span><b class="num">${nf(nextHunt.n)}</b><small>evidence hunts</small></span>
      </div>
      <div class="home-card-actions">
        <a class="btn btn-primary" href="grounds.html?g=${esc(nextHunt.groundSlug)}">Open hunt planner</a>
        <a class="btn btn-secondary" href="submit.html">Log a hunt</a>
      </div>` : `
      <h2>No level-fit rated hunt yet</h2>
      <p class="dim">Widen the planner filters to inspect unrated and team options.</p>
      <div class="home-card-actions"><a class="btn btn-primary" href="grounds.html">Open hunt planner</a></div>`}
  </section>

  <section class="panel home-attention">
    <p class="eyebrow">Needs attention</p>
    <div class="home-attention-list">
      ${attention.slice(0, 3).map((item) => `
        <div><span>${esc(item.text)}</span><a href="${esc(item.href)}">${esc(item.label)}</a></div>`).join('')}
    </div>
  </section>

  <section class="home-shortcuts-section">
    <p class="eyebrow">Shortcuts</p>
    <div class="home-shortcuts">
      ${shortcuts.map(([href, label, icon]) => `<a href="${href}">${icon}<span>${esc(label)}</span></a>`).join('')}
    </div>
  </section>`;

if (gainSeries.length >= 2) {
  chartInto(document.getElementById('home-gain-spark'), (width) => sparkline(gainSeries, { width, height: 34, fmt: compact }));
  chartInto(document.getElementById('home-pace-spark'), (width) => sparkline(paceSeries, { width, height: 34, fmt: compact }));
}

export {};
