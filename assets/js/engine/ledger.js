/**
 * The Ledger — every hunting ground as a living statistical model.
 * Logged hunts group by ground × vocation × party-mode × level tier; each
 * group carries avg/median/lo/hi/σ for raw XP/h, loot/h and profit/h. The
 * curated table is the baseline; a group flips from `curated` → `blended` on
 * first evidence → `logged` once it clears the takeover threshold.
 * Node-safe — the browser and the Actions pipeline run this same file.
 */

import { series } from '../lib/stats.js';
import { slug } from '../lib/text.js';

export const TAKEOVER = 5;

export const TIERS = [
  [8, 49], [50, 99], [100, 149], [150, 199],
  [200, 299], [300, 399], [400, 599], [600, Infinity],
];

export function tierOf(level) {
  if (level == null) return null;
  for (const [lo, hi] of TIERS) {
    if (level >= lo && level <= hi) return hi === Infinity ? `${lo}+` : `${lo}–${hi}`;
  }
  return null;
}

export const TRUST = [
  { min: 100, label: 'Very high', bars: 5 },
  { min: 50, label: 'High', bars: 4 },
  { min: 20, label: 'Medium', bars: 3 },
  { min: 5, label: 'Low', bars: 2 },
  { min: 1, label: 'Very low', bars: 1 },
  { min: 0, label: 'Unproven', bars: 0 },
];

export function trustOf(n) {
  return TRUST.find((t) => n >= t.min) || TRUST[TRUST.length - 1];
}

/** Per-hour metrics for one hunt. */
export function hourly(hunt) {
  const h = hunt.minutes > 0 ? hunt.minutes / 60 : null;
  return {
    xpRawRate: hunt.xpRawRate ?? null,
    lootRate: h && hunt.loot != null ? hunt.loot / h : null,
    profitRate: h && hunt.balance != null ? hunt.balance / h : null,
  };
}

const keyOf = (ground, vocation, party, tier) =>
  [slug(ground), vocation || (party ? 'party' : '?'), party ? 'party' : 'solo', tier || '?'].join('~');

/**
 * @param {Array} curated normalised curated entries (see sources.js)
 * @param {Array} hunts logged hunts from the active backend
 * @returns {Array} ledger table rows
 */
export function buildLedger(curated, hunts) {
  const groups = new Map();
  for (const hunt of hunts) {
    const key = keyOf(hunt.ground, hunt.vocation, hunt.party, tierOf(hunt.level));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(hunt);
  }

  const evidence = new Map();
  for (const [key, members] of groups) {
    const rates = members.map(hourly);
    const levels = members.map((h) => h.level).filter((l) => l != null);
    evidence.set(key, {
      n: members.length,
      xpRawRate: series(rates.map((r) => r.xpRawRate)),
      lootRate: series(rates.map((r) => r.lootRate)),
      profitRate: series(rates.map((r) => r.profitRate)),
      meanLevel: levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null,
      latest: members.map((h) => h.loggedAt).filter(Boolean).sort().at(-1) || null,
      sample: members[0],
    });
  }

  const table = [];
  const consumed = new Set();

  for (const entry of curated) {
    const tier = tierOf(entry.level);
    const key = keyOf(entry.ground, entry.vocation, entry.party, tier);
    const ev = evidence.get(key) || null;
    if (ev) consumed.add(key);
    const owned = ev && ev.n >= TAKEOVER;

    table.push({
      key,
      ground: entry.ground,
      groundSlug: entry.groundSlug,
      vocation: entry.vocation,
      party: entry.party,
      level: entry.level,
      levelText: entry.levelText,
      tier,
      gear: entry.gear,
      gearLabel: entry.gearLabel,
      basis: owned ? 'logged' : ev ? 'blended' : 'curated',
      xpRawRate: owned ? ev.xpRawRate.avg : entry.xpRaw,
      lootRate: owned ? ev.lootRate.avg : entry.loot,
      profitRate: ev ? ev.profitRate.avg : null,
      curatedValues: { xpRaw: entry.xpRaw, loot: entry.loot },
      evidence: ev,
      n: ev?.n || 0,
      trust: trustOf(ev?.n || 0),
      latest: ev?.latest || null,
    });
  }

  for (const [key, ev] of evidence) {
    if (consumed.has(key)) continue;
    const h = ev.sample;
    const tier = tierOf(h.level);
    table.push({
      key,
      ground: h.ground,
      groundSlug: slug(h.ground),
      vocation: h.vocation || null,
      party: !!h.party,
      level: ev.meanLevel != null ? Math.round(ev.meanLevel) : null,
      levelText: tier || '—',
      tier,
      gear: null,
      gearLabel: null,
      basis: 'logged',
      xpRawRate: ev.xpRawRate.avg,
      lootRate: ev.lootRate.avg,
      profitRate: ev.profitRate.avg,
      curatedValues: null,
      evidence: ev,
      n: ev.n,
      trust: trustOf(ev.n),
      latest: ev.latest,
    });
  }

  return table;
}

/** Everything the active hunt log knows about one ground. */
export function groundDossier(groundSlug, hunts) {
  const mine = hunts.filter((h) => slug(h.ground) === groundSlug);
  const rates = mine.map(hourly);
  const killTotals = new Map();
  for (const h of mine) {
    for (const k of h.kills || []) killTotals.set(k.name, (killTotals.get(k.name) || 0) + (k.n || 0));
  }
  return {
    n: mine.length,
    hunts: mine,
    kills: [...killTotals.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    xpRawRate: series(rates.map((r) => r.xpRawRate)),
    lootRate: series(rates.map((r) => r.lootRate)),
    profitRate: series(rates.map((r) => r.profitRate)),
  };
}
