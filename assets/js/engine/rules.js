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

/**
 * Elements each vocation's own spell arsenal can actually deal, ordered by
 * how central they are to that vocation's identity. Confirmed against
 * TibiaWiki: Sorcerer is fire/energy/death (Energy Wave, Rage of the Skies);
 * Druid is ice/earth (Terra Wave, Eternal Winter, Ice Wave); Paladin's
 * offense is physical distance fighting plus holy spells (Divine Caldera,
 * Holy Flash); Knight is melee physical (Exori); Monk's confirmed damage
 * type is physical (Harmony spells) — its exact elemental spread beyond
 * that isn't nailed down, so it's kept physical-only rather than guessed.
 * Used to keep "best element" recommendations from suggesting an element a
 * vocation has no way to actually deal (e.g. Holy to a Druid).
 */
export const VOCATION_ELEMENTS = {
  Knight: ['physical'],
  Paladin: ['physical', 'holy'],
  Monk: ['physical'],
  Sorcerer: ['fire', 'energy', 'death'],
  Druid: ['ice', 'earth'],
};

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
  if (!hunt.party && !hunt.vocation) faults.push('Vocation is required for a solo hunt.');
  else if (hunt.vocation && !VOCATIONS.includes(hunt.vocation)) faults.push(`Unknown vocation "${hunt.vocation}".`);
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

/**
 * Applies the normal submission contract to a JSON import before it can enter
 * the local logbook. Existing IDs and repeated analyser text are reported as
 * duplicates; structurally or mechanically invalid rows are rejected.
 */
export function assessImport(incoming, book = []) {
  const accepted = [];
  const duplicates = [];
  const rejected = [];
  if (!Array.isArray(incoming)) {
    return { accepted, duplicates, rejected: [{ index: null, faults: ['Import must be a JSON array of hunts.'] }] };
  }

  const existing = Array.isArray(book) ? book : [];
  const knownIds = new Set(existing.map((hunt) => String(hunt?.id || '').trim()).filter(Boolean));
  const checked = [...existing];
  incoming.forEach((hunt, index) => {
    if (!hunt || typeof hunt !== 'object' || Array.isArray(hunt)) {
      rejected.push({ index, faults: ['Hunt is not an object.'] });
      return;
    }
    if (!hunt.id || !String(hunt.id).trim()) {
      rejected.push({ index, faults: ['Hunt has no stable ID.'] });
      return;
    }
    const id = String(hunt.id).trim();
    if (knownIds.has(id)) {
      duplicates.push({ index, id: hunt.id, reason: 'ID already present.' });
      return;
    }

    const verdict = judge(hunt, checked);
    const analyserDuplicate = verdict.faults.length === 1 && verdict.faults[0] === 'This exact analyser has already been submitted.';
    if (analyserDuplicate) {
      duplicates.push({ index, id: hunt.id, reason: verdict.faults[0] });
      return;
    }
    if (!verdict.ok) {
      rejected.push({ index, id: hunt.id, faults: verdict.faults });
      return;
    }

    accepted.push(hunt);
    checked.push(hunt);
    knownIds.add(id);
  });
  return { accepted, duplicates, rejected };
}
