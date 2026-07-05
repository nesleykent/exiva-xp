/**
 * Submission rules — identical in the browser preview and in the Actions
 * pipeline, so what the player saw is exactly what gets enforced.
 * Faults reject a hunt; flags mark logs that need a closer look before sharing. Node-safe.
 */

import { fingerprint } from '../lib/text.js';

export const LIMITS = {
  level: [8, 2000],
  xpRawRateCeiling: 20_000_000,
  xpRawRateFlag: 8_000_000,
  lootRateFloorFlag: 1_000,
  minutesFlag: 10,
  profitRateFlag: 6_000_000,
};

export const VOCATIONS = ['Knight', 'Paladin', 'Monk', 'Sorcerer', 'Druid'];

const NON_NEGATIVE = ['xpRawRate', 'xpRate', 'loot', 'supplies', 'damage', 'damageRate', 'healing', 'healingRate', 'minutes'];

/**
 * @param {object} hunt submission record
 * @param {Array<object>} book already-accepted hunts (duplicate check)
 * @returns {{ok: boolean, faults: string[], flags: string[]}}
 */
export function judge(hunt, book = []) {
  const faults = [];
  const flags = [];

  if (!hunt || typeof hunt !== 'object') {
    return { ok: false, faults: ['Submission is not an object.'], flags };
  }

  if (hunt.xpRawRate == null) faults.push('No Raw XP/h — the analyser must contain Raw XP Gain or Raw XP/h.');
  if (hunt.loot == null) faults.push('No Loot value.');
  if (!hunt.ground || !String(hunt.ground).trim()) faults.push('No hunting ground.');
  const [lo, hi] = LIMITS.level;
  if (hunt.level == null || hunt.level < lo || hunt.level > hi) {
    faults.push(`Level must be between ${lo} and ${hi}.`);
  }
  if (hunt.vocation && !VOCATIONS.includes(hunt.vocation)) faults.push(`Unknown vocation "${hunt.vocation}".`);
  for (const f of NON_NEGATIVE) {
    if (hunt[f] != null && hunt[f] < 0) faults.push(`Field "${f}" cannot be negative.`);
  }
  if (hunt.xpRawRate != null && hunt.xpRawRate > LIMITS.xpRawRateCeiling) {
    faults.push('Raw XP/h is beyond anything achievable in the game.');
  }
  if (!hunt.raw || !String(hunt.raw).trim()) {
    faults.push('The original analyser text is missing.');
  } else {
    const fp = fingerprint(hunt.raw);
    if (book.some((b) => b.id !== hunt.id && fingerprint(b.raw || '') === fp)) {
      faults.push('This exact analyser has already been submitted.');
    }
  }

  const hours = hunt.minutes > 0 ? hunt.minutes / 60 : null;
  if (hunt.xpRawRate != null && hunt.xpRawRate > LIMITS.xpRawRateFlag) {
    flags.push('Exceptionally high XP/h — review before sharing.');
  }
  if (hours != null && hunt.minutes < LIMITS.minutesFlag) {
    flags.push(`Session under ${LIMITS.minutesFlag} minutes — short sessions produce noisy averages.`);
  }
  if (hours && hunt.loot != null && hunt.loot / hours < LIMITS.lootRateFloorFlag) {
    flags.push('Unusually low loot for the session length.');
  }
  if (hours && hunt.balance != null && hunt.balance / hours > LIMITS.profitRateFlag) {
    flags.push('Unusually high profit/h — review before sharing.');
  }

  return { ok: faults.length === 0, faults, flags };
}
