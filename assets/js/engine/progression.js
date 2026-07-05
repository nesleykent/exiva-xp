/**
 * Level / experience / base-value formulas, ported from
 * tibia-xp-history's formulae.mjs (github.com/mathiasbynens/tibia-xp-history),
 * which sources them from TibiaWiki:
 *   https://tibia.fandom.com/wiki/Experience_Formula
 *   https://tibia.fandom.com/wiki/Formulae#Base_Damage_and_Healing
 * Shared by the character tracker pipeline and the hub's progression UI.
 */

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
