/**
 * Strategy engine — turns a weighted creature set (a session's kills, or a
 * ground's population) into combat advice: elemental damage profile, attack
 * element to use / avoid, defensive exposure, charm targets, plain-language
 * tips. Weights are real kill counts when logged evidence exists.
 * Node-safe.
 */

import { ELEMENTS, ELEMENT_NAME, ELEMENT_CHARM, elementOrder, weakSpots } from './codex.js';
import { pct } from '../lib/fmt.js';
import { esc, slug } from '../lib/text.js';

/** Kill-weighted % damage taken per element for a creature set. */
export function damageProfile(set) {
  const acc = Object.fromEntries(ELEMENTS.map((el) => [el, 0]));
  let mass = 0;
  for (const { creature, n } of set) {
    const w = n || 1;
    if (!creature) continue;
    mass += w;
    for (const el of ELEMENTS) acc[el] += creature.taken[el] * w;
  }
  const profile = Object.fromEntries(
    ELEMENTS.map((el) => [el, mass ? acc[el] / mass : 100]),
  );
  return { profile, mass };
}

export function orderProfile(profile) {
  return ELEMENTS.map((el) => ({ el, taken: profile[el] })).sort((a, b) => b.taken - a.taken);
}

/** Which elements the set deals back at you, weighted by kills. */
export function threatProfile(set) {
  const acc = Object.fromEntries(ELEMENTS.map((el) => [el, 0]));
  let mass = 0;
  for (const { creature, n } of set) {
    const w = n || 1;
    if (!creature) continue;
    mass += w;
    for (const el of creature.deals) acc[el] += w;
  }
  return ELEMENTS
    .map((el) => ({ el, share: mass ? acc[el] / mass : 0 }))
    .filter((t) => t.share > 0)
    .sort((a, b) => b.share - a.share);
}

/** Creatures worth an elemental offensive Charm, ranked by kills × hp × weakness. */
export function charmTargets(set, limit = 5) {
  const out = [];
  for (const { creature, n } of set) {
    if (!creature) continue;
    const [weakest] = weakSpots(creature);
    if (!weakest) continue;
    out.push({
      creature,
      el: weakest.el,
      taken: weakest.taken,
      points: creature.charm?.points ?? null,
      rank: (n || 1) * (creature.hp || 1) * (weakest.taken / 100),
    });
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, limit);
}

/**
 * Full read on a creature set.
 * @param {Array<{creature, n}>} set
 */
export function readBattle(set) {
  const live = (set || []).filter((s) => s.creature);
  if (!live.length) return null;

  const { profile, mass } = damageProfile(live);
  const order = orderProfile(profile);
  const attack = order[0];
  const avoid = order[order.length - 1];

  const blockers = live
    .filter((s) => s.creature.taken[attack.el] < 100)
    .sort((a, b) => a.creature.taken[attack.el] - b.creature.taken[attack.el]);
  const softest = live
    .filter((s) => elementOrder(s.creature)[0].taken > 100)
    .sort((a, b) => elementOrder(b.creature)[0].taken - elementOrder(a.creature)[0].taken);

  const threats = threatProfile(live);
  const charms = charmTargets(live);

  const tips = [];
  tips.push(attack.taken > 102
    ? `Lead with ${ELEMENT_NAME[attack.el]} — the set takes ${pct(attack.taken)} of it on a kill-weighted average.`
    : `No element stands out here (${ELEMENT_NAME[attack.el]} tops out at ${pct(attack.taken)}); raw damage and attack speed matter more than element choice.`);
  if (avoid.taken < 95) {
    tips.push(`Leave ${ELEMENT_NAME[avoid.el]} at home — only ${pct(avoid.taken)} of it lands.`);
  }
  if (blockers.length) {
    const names = blockers.slice(0, 3).map((s) => s.creature.name).join(', ');
    tips.push(`${names}${blockers.length > 3 ? ' and others' : ''} shrug off ${ELEMENT_NAME[attack.el]}; keep a second element for them.`);
  }
  if (threats.length) {
    tips.push(`Gear defence for ${threats.slice(0, 2).map((t) => ELEMENT_NAME[t.el]).join(' and ')} — ${pct(threats[0].share * 100)} of what you fight deals ${ELEMENT_NAME[threats[0].el].toLowerCase()}.`);
  }
  if (charms.length) {
    const c = charms[0];
    const charmName = ELEMENT_CHARM[c.el];
    tips.push(`Equip the <a href="charms.html?charm=${esc(slug(charmName))}">${esc(charmName)} Charm</a> on ${esc(c.creature.name)} — it takes ${pct(c.taken)} ${ELEMENT_NAME[c.el].toLowerCase()} damage${c.points ? `, and finishing its Bestiary entry grants ${c.points} charm points` : ''}.`);
  }

  return { profile, order, attack, avoid, blockers, softest, threats, charms, tips, mass };
}
