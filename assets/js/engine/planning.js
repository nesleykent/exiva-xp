/**
 * Personal planning calculators. These stay DOM-free so the browser UI,
 * smoke tests and future Actions can share the same arithmetic.
 */

import { baseValue } from './progression.js';

export const clampNumber = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function parseStamina(text) {
  const m = String(text || '').trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  if (m[2] != null && Number(m[2]) > 59) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2] || 0);
  return Number.isFinite(minutes) ? clampNumber(minutes, 0, 42 * 60) : null;
}

export function formatStamina(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Offline stamina regeneration, per TibiaWiki (Stamina, "Regenerating
 * Stamina"): 1 stamina minute per 3 offline minutes, "twice as long" (6)
 * for the bonus hours above 39:00, and no regeneration at all for the
 * first 10 offline minutes. The article's own worked example — 39:00 to
 * 42:00 takes 18h10m offline — pins all three numbers and is asserted in
 * the smoke tests.
 */
export function staminaRecoveryPlan(currentMinutes, targetMinutes, {
  regularRate = 3,
  bonusRate = 6,
  bonusStart = 39 * 60,
  startupDelay = 10,
  max = 42 * 60,
} = {}) {
  const current = clampNumber(currentMinutes, 0, max);
  const target = clampNumber(targetMinutes, 0, max);
  if (target <= current) return { needed: 0, readyInMinutes: 0, segments: [] };

  let remaining = target - current;
  let cursor = current;
  let readyInMinutes = startupDelay;
  const segments = [];

  const regularGain = Math.min(remaining, Math.max(0, bonusStart - cursor));
  if (regularGain) {
    const offline = regularGain * regularRate;
    readyInMinutes += offline;
    segments.push({ label: 'Regular stamina', gain: regularGain, offline });
    cursor += regularGain;
    remaining -= regularGain;
  }

  if (remaining > 0) {
    const bonusGain = Math.min(remaining, max - cursor);
    const offline = bonusGain * bonusRate;
    readyInMinutes += offline;
    segments.push({ label: 'Bonus stamina', gain: bonusGain, offline });
    remaining -= bonusGain;
  }

  return { needed: target - current, readyInMinutes, segments };
}

export function staminaProjection(currentMinutes, huntMinutes, targetMinutes, options = {}) {
  const current = clampNumber(currentMinutes, 0, 42 * 60);
  const spent = clampNumber(huntMinutes, 0, 42 * 60);
  const afterHunt = clampNumber(current - spent, 0, 42 * 60);
  return {
    current,
    spent,
    afterHunt,
    recovery: staminaRecoveryPlan(afterHunt, targetMinutes, options),
  };
}

const finite = (n) => Number.isFinite(Number(n));

export function profitSnapshot(hunts = []) {
  const usable = hunts.filter((h) => finite(h.balance) && finite(h.minutes) && Number(h.minutes) > 0);
  const totals = usable.reduce((acc, h) => {
    acc.hunts += 1;
    acc.minutes += Number(h.minutes) || 0;
    acc.balance += Number(h.balance) || 0;
    acc.loot += Number(h.loot) || 0;
    acc.supplies += Number(h.supplies) || 0;
    return acc;
  }, { hunts: 0, minutes: 0, balance: 0, loot: 0, supplies: 0 });
  totals.profitRate = totals.minutes > 0 ? totals.balance / (totals.minutes / 60) : null;

  const byGround = new Map();
  for (const h of usable) {
    const key = h.ground || 'Unknown ground';
    if (!byGround.has(key)) byGround.set(key, { ground: key, hunts: 0, minutes: 0, balance: 0 });
    const row = byGround.get(key);
    row.hunts += 1;
    row.minutes += Number(h.minutes) || 0;
    row.balance += Number(h.balance) || 0;
  }
  const grounds = [...byGround.values()].map((row) => ({
    ...row,
    profitRate: row.minutes > 0 ? row.balance / (row.minutes / 60) : null,
  })).sort((a, b) => (b.profitRate ?? -Infinity) - (a.profitRate ?? -Infinity));

  return {
    totals,
    grounds,
    recent: [...usable].sort((a, b) => String(b.loggedAt || '').localeCompare(String(a.loggedAt || ''))).slice(0, 5),
  };
}

/**
 * Per-hit elemental damage charm mechanics, from the game's own Cyclopedia
 * export (data/charms.json): the per-stage `value` is the TRIGGER CHANCE
 * (5/10/11% by stage), and the damage dealt on proc is a fixed percentage
 * of the target's initial hit points stated in the effect text ("… deal
 * <element> damage equal to 5% of the target's initial hit points").
 * There is no shared proc constant — chance comes from each charm's own
 * stages, damage from its own effect text. Charms whose effect doesn't
 * match this per-hit pattern (e.g. Carnage's on-kill burst, the Minor
 * utility charms) simply don't parse and are excluded.
 */
const PER_HIT_DAMAGE = /equal to ([\d.]+)% of the target's initial hit ?points/i;

export function charmAdvice(hunts = [], codex, charms = []) {
  if (!Array.isArray(hunts) || !codex || !Array.isArray(charms)) return [];

  const killed = new Map();
  for (const hunt of hunts) {
    for (const kill of hunt?.kills || []) {
      const n = Number(kill?.n) || 0;
      if (n <= 0) continue;
      const creature = codex.identify(kill.name)?.creature;
      if (!creature) continue;
      const key = creature.slug || creature.name;
      const row = killed.get(key) || { creature, n: 0 };
      row.n += n;
      killed.set(key, row);
    }
  }
  if (!killed.size) return [];

  return charms
    .filter((charm) => charm?.element)
    .map((charm) => {
      // maxed stage = best trigger chance; damage % parsed from the effect
      const chance = Number(charm.stages?.at(-1)?.value);
      const damagePct = Number(charm.effect?.match(PER_HIT_DAMAGE)?.[1]);
      if (!Number.isFinite(chance) || chance <= 0 || !Number.isFinite(damagePct) || damagePct <= 0) {
        return { charm, total: 0, topCreatures: [] };
      }

      let total = 0;
      const topCreatures = [];
      for (const { creature, n } of killed.values()) {
        const hp = Number(creature.hp) || 0;
        const taken = Number(creature.taken?.[charm.element]);
        // expected charm damage per attack, weighted by kill volume
        const expected = n * hp * (damagePct / 100) * (taken / 100) * (chance / 100);
        if (!Number.isFinite(expected) || expected <= 0) continue;
        total += expected;
        topCreatures.push({ name: creature.name, n, expected });
      }

      return {
        charm,
        total,
        topCreatures: topCreatures
          .sort((a, b) => b.expected - a.expected)
          .slice(0, 3)
          .map(({ name, n }) => ({ name, n })),
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

/**
 * Effective damage against a creature — TibiaTools-style: the player supplies
 * their own raw damage range (read it off the client or an analyser), and the
 * calculator applies only real, known mechanics on top: the target's elemental
 * resistance, its mitigation, expected crit/fatal contribution, and the
 * expected damage-charm proc. It never invents the raw roll — deriving damage
 * from level+skill alone requires weapon/wheel state this app cannot know.
 * `level` is only used for the base-value reference readout.
 */
export function effectiveDamage({
  level,
  rawMin = 0,
  rawMax = 0,
  elementTaken = 100,
  mitigation = 0,
  critChance = 0,
  critDamage = 50,
  fatalChance = 0,
  fatalDamage = 60,
  // per-hit elemental charm: damage % of initial HP and trigger chance %,
  // both per-charm values from the catalogue (5% dmg, 5/10/11% by stage)
  charmPercent = 0,
  charmChance = 0,
  targetHp = 0,
} = {}) {
  const min = Math.max(0, Number(rawMin) || 0);
  const max = Math.max(min, Number(rawMax) || 0);
  const rawAvg = (min + max) / 2;
  const resistanceFactor = (Number(elementTaken) || 0) / 100;
  const mitigationFactor = 1 - clampNumber(Number(mitigation) || 0, 0, 100) / 100;
  const critFactor = 1 + (clampNumber(Number(critChance) || 0, 0, 100) / 100) * ((Number(critDamage) || 0) / 100);
  const fatalFactor = 1 + (clampNumber(Number(fatalChance) || 0, 0, 100) / 100) * ((Number(fatalDamage) || 0) / 100);
  const hit = rawAvg * resistanceFactor * mitigationFactor * critFactor * fatalFactor;
  const charmProc = Math.max(0, Number(targetHp) || 0) * (clampNumber(Number(charmPercent) || 0, 0, 100) / 100) * resistanceFactor;
  const charmExpected = charmProc * (clampNumber(Number(charmChance) || 0, 0, 100) / 100);
  return {
    base: baseValue(Number(level) || 8),
    rawAvg,
    hit,
    charmProc,
    charmExpected,
    turn: hit + charmExpected,
  };
}
