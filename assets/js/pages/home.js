/**
 * Home — daily character dashboard: current progression, next hunt,
 * attention items and direct routes into the player's core loop.
 */

import { boot } from './_boot.js';
import { esc } from '../lib/text.js';
import { compact, kk, nf, md, pct } from '../lib/fmt.js';
import { dailyGains, experienceUntilNextLevel, progressWithinLevel, xpPace } from '../engine/progression.js';
import { baseVocation, judge, vocationFits } from '../engine/rules.js';
import { loadCharacter, loadCharacterHistory, logbook } from '../data/sources.js';
import { ICONS, NAV, basisPill, metric } from '../shell.js';
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
const capturedAtLabel = latest?.capturedAt
  ? new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(latest.capturedAt)).reduce((parts, p) => ({ ...parts, [p.type]: p.value }), {})
  : null;
const capturedAtText = capturedAtLabel
  ? `as of ${capturedAtLabel.year}-${capturedAtLabel.month}-${capturedAtLabel.day} at ${capturedAtLabel.hour}:${capturedAtLabel.minute} BRT`
  : null;
const book = logbook();
// gap-free daily gains, dated — the same series backs both the pace figure
// and its sparkline, so the trend line never shows a number the average
// didn't also use
const gains = dailyGains(history);
const consecutiveLatest = latest != null && gains.at(-1)?.date === latest.date;
const latestGain = consecutiveLatest ? gains.at(-1).gain : null;
const gainSeries = gains.slice(-14).map((g) => ({ key: md(g.date), n: g.gain }));
const pace = xpPace(gains);
// a trailing 3-day rolling average of the same real gains — genuinely
// distinct from the raw daily series above, not just the same shape twice
const paceSeries = gainSeries.map((g, i, arr) => {
  const window = arr.slice(Math.max(0, i - 2), i + 1);
  return { key: g.key, n: Math.round(window.reduce((sum, w) => sum + w.n, 0) / window.length) };
});
const xpToNext = latest ? experienceUntilNextLevel(latest.level, latest.experience) : null;
const levelProgress = latest ? progressWithinLevel(latest.level, latest.experience) : null;

const base = baseVocation(vocation);
const nextHunt = table
  .filter((row) => row.xpRawRate != null && row.level != null && row.level <= level && vocationFits(row.vocation, base))
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
if (!attention.length) attention.push({ text: `Character tracking is current through ${latest.date}.`, label: 'Open profile', href: 'character.html' });

// every destination except Home itself, in sidebar order — the desktop-only
// pages (Codex, Charms, Progress, Logbook) stay reachable on mobile this way
const shortcuts = NAV.filter(([href]) => href !== 'index.html');

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
    ${metric('Current level', level != null ? nf(level) : '—', levelProgress != null ? `${pct(levelProgress)} through this level` : 'Waiting for exact experience')}
    ${metric("Today's XP", latestGain != null ? `+${compact(latestGain)}` : '—', consecutiveLatest ? esc(capturedAtText || `tracked on ${latest.date}`) : 'No consecutive-day reading', { sparkId: gainSeries.length >= 2 ? 'home-gain-spark' : null })}
    ${metric('XP pace', pace ? `${compact(pace.xp)}<em>/day</em>` : '—', pace ? `average of ${nf(pace.days)} recorded days` : 'Not enough consecutive days', { sparkId: gainSeries.length >= 2 ? 'home-pace-spark' : null })}
    ${metric(`Level ${level != null ? nf(level + 1) : ''}`, xpToNext != null ? compact(xpToNext) : '—', 'XP remaining')}
    ${metric('Charm points', charmPoints != null ? nf(charmPoints) : '—', charmPoints != null ? 'earned points; spending is private' : 'No tracked highscore value')}
  </section>

  <section class="panel home-next-hunt">
    <div class="home-card-kicker">
      <h2 class="eyebrow">Next hunt · from your evidence</h2>
      ${nextHunt ? basisPill(nextHunt.basis) : ''}
    </div>
    ${nextHunt ? `
      <h3>${esc(nextHunt.ground)}</h3>
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
      <h3>No level-fit rated hunt yet</h3>
      <p class="dim">Widen the planner filters to inspect unrated and team options.</p>
      <div class="home-card-actions"><a class="btn btn-primary" href="grounds.html">Open hunt planner</a></div>`}
  </section>

  <section class="panel home-attention">
    <h2 class="eyebrow">Needs attention</h2>
    <div class="home-attention-list">
      ${attention.slice(0, 3).map((item) => `
        <div><span>${esc(item.text)}</span><a href="${esc(item.href)}">${esc(item.label)}</a></div>`).join('')}
    </div>
  </section>

  <section class="home-shortcuts-section">
    <h2 class="eyebrow">Shortcuts</h2>
    <div class="home-shortcuts">
      ${shortcuts.map(([href, label, icon]) => `<a href="${href}">${ICONS[icon]}<span>${esc(label)}</span></a>`).join('')}
    </div>
  </section>`;

if (gainSeries.length >= 2) {
  chartInto(document.getElementById('home-gain-spark'), (width) => sparkline(gainSeries, { width, height: 34, fmt: compact }));
  chartInto(document.getElementById('home-pace-spark'), (width) => sparkline(paceSeries, { width, height: 34, fmt: compact }));
}

export {};
