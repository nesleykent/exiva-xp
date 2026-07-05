/** Progression analytics — XP history, skills and personal hunt performance. */

import { boot } from './_boot.js';
import { nf, kk, hm } from '../lib/fmt.js';
import { average, tally } from '../lib/stats.js';
import { hourly } from '../engine/ledger.js';
import { bars, flow, sparkline, attachFlowHover } from '../viz/svg.js';
import { loadCharacter, loadCharacterHistory } from '../data/sources.js';

const { stage, hunts, table } = await boot('analytics.html');
const [history, profile] = await Promise.all([
  loadCharacterHistory().catch(() => []),
  loadCharacter().catch(() => null),
]);

const label = (r) => [r.ground, r.vocation || 'Party', r.levelText].filter(Boolean).join(' · ');
const latest = history.at(-1) || null;
const previous = history.at(-2) || null;
const dailyXp = [];
for (let i = 1; i < history.length; i++) {
  dailyXp.push({ key: history[i].date.slice(5), n: Math.max(0, history[i].experience - history[i - 1].experience) });
}

const SKILLS = [
  { key: 'magicLevel', rank: 'magiclevel', label: 'Magic level' },
  { key: 'charmPoints', rank: 'charmpoints', label: 'Charm points' },
  { key: 'bossPoints', rank: 'bosspoints', label: 'Boss points' },
  { key: 'achievements', rank: 'achievements', label: 'Achievement points' },
  { key: 'loyalty', rank: 'loyaltypoints', label: 'Loyalty points' },
  { key: 'fishing', rank: 'fishing', label: 'Fishing' },
];
const TREND_SKILLS = [
  ...SKILLS,
  { key: 'dromeScore', label: 'Drome score' },
];

function signed(value) {
  if (value == null || !Number.isFinite(value)) return '<span class="dim">-</span>';
  if (value === 0) return '<span class="dim">0</span>';
  return `<span class="${value > 0 ? 'ok' : 'bad'}">${value > 0 ? '+' : ''}${nf(value)}</span>`;
}

const skillTrends = TREND_SKILLS.map((s) => {
  const series = history
    .filter((row) => row[s.key] != null)
    .map((row) => ({ key: row.date.slice(5), n: row[s.key] }));
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

function skillTrendCard(s) {
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
const meanProfit = average(hunts.map((h) => hourly(h).profitRate).filter((p) => p != null));
const lastGain = latest && previous ? Math.max(0, latest.experience - previous.experience) : null;

const board = (title, data, svg) => (data.length ? `
  <section class="section">
    <div class="section-bar"><h2>${title}</h2></div>
    <div class="panel panel-pad viz">${svg}</div>
  </section>` : '');

stage.innerHTML = `
  <header style="padding: 8px 0 4px">
    <h1 style="font-size:26px; letter-spacing:-.4px">Progression analytics</h1>
    <p class="dim">XP and skills come from Night'Flyn's daily tracker; hunt boards use ${nf(hunts.length)} saved analyser log${hunts.length === 1 ? '' : 's'} plus ${nf(table.length)} planner rows.</p>
  </header>
  <div class="pulse-row">
    <div class="panel pulse"><div class="big num">${nf(history.length)}</div><div class="eyebrow">Tracked days</div></div>
    <div class="panel pulse"><div class="big num">${lastGain != null ? kk(lastGain) : '—'}</div><div class="eyebrow">Last daily XP</div></div>
    <div class="panel pulse"><div class="big num">${nf(hunts.length)}</div><div class="eyebrow">Saved hunts</div></div>
    <div class="panel pulse"><div class="big num">${meanMinutes != null ? hm(meanMinutes) : '—'}</div><div class="eyebrow">Avg session</div></div>
    <div class="panel pulse"><div class="big num">${meanProfit != null ? kk(meanProfit) : '—'}</div><div class="eyebrow">Avg profit/h</div></div>
  </div>
  ${board('Daily XP gain', dailyXp, flow(dailyXp))}
  ${skillTrends.length ? `<section class="section">
    <div class="section-bar"><h2>Tracked skills</h2><span class="fine dim">each metric gets its own scale and readiness state</span></div>
    <div class="skill-grid">${skillTrends.map(skillTrendCard).join('')}</div>
  </section>` : ''}
  ${board('Best XP targets', topXp, bars(topXp))}
  ${board('Best profit targets', topProfit, bars(topProfit))}
  ${board('Busiest grounds', busiest, bars(busiest, { fmt: nf }))}
  ${board('Hunts logged over time', perMonth, flow(perMonth))}
  ${board('Most killed creatures', topKills, bars(topKills, { fmt: nf }))}
  ${board('Most looted items', topDrops, bars(topDrops, { fmt: nf }))}
  ${board('Hunts by vocation', byVocation, bars(byVocation, { fmt: nf }))}
  ${hunts.length ? '' : '<div class="note note-amber" style="margin-top:24px">Personal hunt boards light up after the first analyser is saved. XP and skill tracking already run from the character history.</div>'}`;
document.querySelectorAll('.viz').forEach((panel) => { if (panel.querySelector('.vdot')) attachFlowHover(panel); });

export {};
