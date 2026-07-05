/**
 * Locator — answers "where was this hunt?" from a kill list, and "which
 * creatures live at this ground?" from a ground name.
 *
 * Locate: each identified kill spreads evidence over its known habitats;
 * evidence blends log-scaled kill volume, creature rarity, a ubiquity damper
 * (creatures found in 40 habitats say little) and identification grade.
 * Candidates then score by evidence × coverage × breadth, and each one is
 * cross-referenced against the curated ground names. Node-safe.
 */

import { RARITY } from './codex.js';
import { fold, closeness, depluralize } from '../lib/text.js';

/**
 * @param {Array<{name, n}>} kills
 * @param {Codex} codex
 * @param {Array<{name, slug, key}>} grounds curated ground directory
 */
export function locateHunt(kills, codex, grounds = [], limit = 5) {
  const { known, unknown } = codex.identifyAll(kills);
  if (!known.length) return { candidates: [], known, unknown };

  const totalKills = known.reduce((a, k) => a + (k.n || 1), 0) || 1;
  const board = new Map();

  for (const hit of known) {
    const { creature, n } = hit;
    const rarity = RARITY[fold(creature.rarity || 'common')] || 1;
    const damper = 1 / Math.log2(2 + (creature.habitatCount || 1));
    const evidence = Math.log10(1 + (n || 1)) * rarity * damper * hit.grade;

    for (const habitat of creature.habitats) {
      const key = fold(habitat);
      if (!board.has(key)) board.set(key, { habitat, evidence: 0, kills: 0, dwellers: [] });
      const cell = board.get(key);
      cell.evidence += evidence;
      cell.kills += n || 0;
      cell.dwellers.push(hit);
    }
  }

  const candidates = [...board.values()]
    .map((cell) => ({
      habitat: cell.habitat,
      dwellers: cell.dwellers,
      kills: cell.kills,
      coverage: cell.kills / totalKills,
      score: cell.evidence * (0.5 + cell.kills / totalKills) * Math.sqrt(cell.dwellers.length),
      ground: nearestGround(cell.habitat, grounds),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const top = candidates[0]?.score || 1;
  for (const c of candidates) c.certainty = Math.round((c.score / top) * 100);

  return { candidates, known, unknown };
}

/** Curated ground whose name best matches a bestiary habitat, if any. */
export function nearestGround(habitatName, grounds) {
  const key = fold(habitatName);
  let best = null, grade = 0;
  for (const g of grounds) {
    let s = closeness(key, g.key);
    if (g.key.includes(key) || key.includes(g.key)) s = Math.max(s, 0.9);
    if (s > grade) { grade = s; best = g; }
  }
  return grade >= 0.72 ? { name: best.name, slug: best.slug, grade } : null;
}

/** Words in curated ground names that never identify a creature or habitat. */
const NAME_NOISE = new Set(['profit', 'task', 'only', 'left', 'right', 'upper', 'lower',
  'north', 'south', 'east', 'west', 'with', 'without', 'floor', 'basement']);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word match, not substring — "kazo" must not match inside "kazordoon". */
function wordIn(word, text) {
  return new RegExp(`\\b${escapeRegex(word)}\\b`).test(text);
}

/**
 * Creatures named directly by a ground name. Curated names are often the
 * creature, not the place — "Sea Serpents", "Issavi Goannas", "Flimsy
 * Venore" (Flimsy Lost Souls). Tokens and bigrams are depluralised and
 * matched word-bounded against creature names.
 */
export function nameCreatures(groundName, codex) {
  const words = fold(groundName).replace(/\b\d+\b/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 4 && !NAME_NOISE.has(w));
  const grams = new Set();
  for (let i = 0; i < words.length; i++) {
    grams.add(words[i]);
    if (i + 1 < words.length) grams.add(`${words[i]} ${words[i + 1]}`);
  }
  const hits = new Map();
  for (const gram of grams) {
    const singular = gram.split(' ').map(depluralize).join(' ');
    if (singular.length < 4) continue;
    for (const c of codex.creatures) {
      if (wordIn(singular, c.key)) hits.set(c.id, c);
    }
  }
  return [...hits.values()];
}

/**
 * Population of a ground, by evidence tier:
 *  1. logged kill counts;
 *  2. creatures the ground is named after + strong habitat-name matches;
 *  3. weak habitat word-matches (only when tier 2 finds nothing).
 * Returns {set: [{creature, n}], evidence: 'logged'|'codex', habitats[]} | null.
 */
export function population(ground, codex, huntsAtGround = []) {
  const killTotals = new Map();
  for (const hunt of huntsAtGround) {
    for (const k of hunt.kills || []) {
      killTotals.set(k.name, (killTotals.get(k.name) || 0) + (k.n || 0));
    }
  }
  if (killTotals.size) {
    const { known } = codex.identifyAll(
      [...killTotals.entries()].map(([name, n]) => ({ name, n })),
    );
    if (known.length) {
      return {
        set: known.map((k) => ({ creature: k.creature, n: k.n })),
        evidence: 'logged',
        habitats: [],
      };
    }
  }

  const key = fold(ground.name).replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
  const words = key.split(' ').filter((w) => w.length > 3 && !NAME_NOISE.has(w));
  const habitats = [];
  for (const h of codex.allHabitats()) {
    const hKey = fold(h.name);
    let grade = closeness(key, hKey);
    if (hKey.includes(key) || key.includes(hKey)) grade = Math.max(grade, 0.9);
    else if (words.some((w) => wordIn(w, hKey))) grade = Math.max(grade, 0.75);
    if (grade >= 0.75) habitats.push({ ...h, grade });
  }
  habitats.sort((a, b) => b.grade - a.grade);

  const seen = new Set();
  const set = [];
  const take = (creature) => {
    if (seen.has(creature.id)) return;
    seen.add(creature.id);
    set.push({ creature, n: 1 });
  };

  // tier 2: named creatures + strong habitat matches (precise signals)
  for (const c of nameCreatures(ground.name, codex)) take(c);
  for (const h of habitats.filter((x) => x.grade >= 0.9)) h.dwellers.forEach(take);

  // tier 3: only the single best-scoring weak match, and only absent a
  // precise signal — several loosely-related habitats compounded together
  // is how unrelated creatures used to flood a ground's population.
  if (!set.length && habitats.length) {
    const top = habitats[0].grade;
    for (const h of habitats.filter((x) => x.grade === top)) h.dwellers.forEach(take);
  }

  return set.length ? { set, evidence: 'codex', habitats } : null;
}
