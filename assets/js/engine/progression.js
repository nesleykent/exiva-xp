/**
 * Level / experience / base-value formulas, ported from
 * tibia-xp-history's formulae.mjs (github.com/mathiasbynens/tibia-xp-history),
 * which sources them from TibiaWiki:
 *   https://tibia.fandom.com/wiki/Experience_Formula
 *   https://tibia.fandom.com/wiki/Formulae#Base_Damage_and_Healing
 * Shared by the character tracker pipeline and the hub's progression UI.
 */

import { DAY_MS } from '../lib/fmt.js';
import { average } from '../lib/stats.js';

export const experienceForLevel = (level) =>
  (50 / 3) * (level ** 3 - 6 * level ** 2 + 17 * level - 12);

export const levelForExperience = (experience) => (
  Math.cbrt(Math.sqrt(3) * Math.sqrt(243 * experience ** 2 - 48_600 * experience + 3_680_000) + 27 * experience - 2_700) /
  30 ** (2 / 3) - (5 * 10 ** (2 / 3)) / Math.cbrt(3 * Math.sqrt(3) * Math.sqrt(243 * experience ** 2 - 48_600 * experience + 3_680_000) + 81 * experience - 8_100) + 2
);

export const experienceUntilNextLevel = (level, experience) =>
  (50 / 3) * level * ((level - 3) * level + 8) - experience;

/** 0–100 progress through the current level. */
export const progressWithinLevel = (level, experience) => (
  (level * ((600 - 100 * level) * level - 1700) + 6 * experience + 1200) /
  (level * (3 * level - 9) + 12)
);

const clamp = (number, granularity) => {
  const tmp = Math.ceil(number / granularity) * granularity;
  return tmp === number ? number + granularity : tmp;
};

export const nextMilestoneLevel = (level, granularity = 50) => clamp(level, granularity);

// Base damage/healing value — the "level component" of every damage formula;
// the foundation for a TibiaTools-style damage calculator.
const stepSize = (level) => Math.floor((Math.sqrt(2 * level + 2025) + 5) / 10);

export const baseValue = (level) => {
  const step = stepSize(level);
  return Math.floor((level + 1000) / step - 50 * step + 100 * step - 450);
};

export const nextBaseBreakpointLevel = (level) => {
  const step = stepSize(level);
  return level + step - ((level + 1000) % step);
};

/**
 * Gap-aware daily XP gains from tracked history rows ({date, experience}).
 * A tracker gap (backfill sources drop out for weeks at a time) leaves
 * adjacent rows more than a day apart; crediting that span's whole delta to
 * one day would fabricate a spike out of weeks of real progress, so only a
 * row exactly one day after its predecessor yields a gain.
 */
export function dailyGains(history) {
  const gains = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const row = history[i];
    if (new Date(row.date) - new Date(prev.date) !== DAY_MS) continue;
    gains.push({ date: row.date, gain: Math.max(0, row.experience - prev.experience) });
  }
  return gains;
}

/** Mean of the last `window` gap-free daily gains — rest days count, since they are part of the real pace. */
export function xpPace(gains, window = 7) {
  const recent = gains.slice(-window);
  return recent.length ? { xp: Math.round(average(recent.map((g) => g.gain))), days: recent.length } : null;
}
