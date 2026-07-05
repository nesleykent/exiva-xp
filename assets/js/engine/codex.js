/**
 * The Codex — creature knowledge base built from data/bestiary.json.
 * Normalises raw records, indexes by name and habitat, and answers name
 * queries (exact → depluralised → fuzzy). Resistance semantics everywhere:
 * value = % of damage taken (100 neutral, >100 weak, <100 resistant, 0 immune).
 * Node-safe.
 */

import { fold, slug, depluralize, closeness } from '../lib/text.js';

export const ELEMENTS = ['physical', 'earth', 'fire', 'energy', 'ice', 'holy', 'death'];

export const ELEMENT_NAME = {
  physical: 'Physical', earth: 'Earth', fire: 'Fire', energy: 'Energy',
  ice: 'Ice', holy: 'Holy', death: 'Death',
};

/** The one elemental-damage Charm matching each element (see data/charms.json). */
export const ELEMENT_CHARM = {
  physical: 'Wound', earth: 'Poison', fire: 'Enflame', energy: 'Zap',
  ice: 'Freeze', holy: 'Divine Wrath', death: 'Curse',
};

/** Occurrence → evidence weight when locating hunts (rarer = stronger). */
export const RARITY = { 'very rare': 3, rare: 2, uncommon: 1.4, common: 1 };

function refine(raw) {
  const taken = Object.fromEntries(ELEMENTS.map((el) => [el, 100]));
  for (const r of raw.resistances || []) {
    if (r?.type in taken) taken[r.type] = Number(r.value);
  }
  const habitats = String(raw.locations || '').split(/\s*,\s*/).filter(Boolean);
  return {
    id: raw.id,
    name: raw.name,
    slug: slug(raw.name),
    key: fold(raw.name),
    hp: raw.hitpoints ?? null,
    xp: raw.experience ?? null,
    speed: raw.speed ?? null,
    armor: raw.armor ?? null,
    mitigation: raw.mitigation != null ? Number(raw.mitigation) : null,
    tier: raw.difficulty || null,
    rarity: raw.occurrence || null,
    family: raw.class?.name || null,
    attack: raw.attack_type || null,
    caster: !!raw.cast_spells,
    deals: (raw.damage_types || []).filter((t) => ELEMENTS.includes(t)),
    afflicts: raw.negative_conditions || [],
    taken,
    habitats,
    habitatCount: raw.totalLocations ?? habitats.length,
    charm: raw.charm_details ? {
      stages: [raw.charm_details.first_stage, raw.charm_details.second_stage, raw.charm_details.third_stage],
      points: raw.charm_details.charm_points,
    } : null,
  };
}

export class Codex {
  /**
   * @param {object} rawJson bestiary export
   * @param {object|null} extraJson data/codex-extra.json (TibiaData enrichment)
   */
  constructor(rawJson, extraJson = null) {
    const list = Array.isArray(rawJson) ? rawJson : rawJson?.data || [];
    const extras = extraJson?.creatures || {};
    this.creatures = list.map((raw) => {
      const c = refine(raw);
      const x = extras[c.slug];
      if (x) {
        c.art = x.image || null;
        c.lore = x.description || null;
        c.behaviour = x.behaviour || null;
        c.lootList = x.loot || [];
        c.summonMana = x.summonMana ?? null;
        c.convinceMana = x.convinceMana ?? null;
        c.paralysable = x.paralysable ?? null;
        c.seeInvisible = x.seeInvisible ?? null;
        c.healedBy = x.healedBy || null;
      } else {
        c.art = null; c.lore = null; c.behaviour = null; c.lootList = [];
        c.summonMana = null; c.convinceMana = null;
        c.paralysable = null; c.seeInvisible = null; c.healedBy = null;
      }
      return c;
    });
    this.byKey = new Map(this.creatures.map((c) => [c.key, c]));
    this.bySlug = new Map(this.creatures.map((c) => [c.slug, c]));
    this.habitats = new Map(); // folded habitat → {name, dwellers[]}
    for (const c of this.creatures) {
      for (const h of c.habitats) {
        const k = fold(h);
        if (!this.habitats.has(k)) this.habitats.set(k, { name: h, dwellers: [] });
        this.habitats.get(k).dwellers.push(c);
      }
    }
  }

  get size() { return this.creatures.length; }

  creature(slugOrName) {
    return this.bySlug.get(slugOrName) || this.byKey.get(fold(slugOrName)) || null;
  }

  /** exact → depluralised → fuzzy. Returns {creature, how, grade} | null. */
  identify(name) {
    const key = fold(name);
    if (!key) return null;
    let c = this.byKey.get(key);
    if (c) return { creature: c, how: 'exact', grade: 1 };

    const singular = key.split(' ').map(depluralize).join(' ');
    c = this.byKey.get(singular);
    if (c) return { creature: c, how: 'plural', grade: 0.97 };

    let best = null, grade = 0;
    for (const candidate of this.creatures) {
      if (Math.abs(candidate.key.length - singular.length) > 4) continue;
      const g = closeness(candidate.key, singular);
      if (g > grade) { grade = g; best = candidate; }
    }
    return best && grade >= 0.82 ? { creature: best, how: 'fuzzy', grade } : null;
  }

  /** Identify a whole kill list → {known[], unknown[]}. */
  identifyAll(kills) {
    const known = [], unknown = [];
    for (const { name, n } of kills || []) {
      const hit = this.identify(name);
      if (hit) known.push({ ...hit, name, n: n || 0 });
      else unknown.push({ name, n: n || 0 });
    }
    return { known, unknown };
  }

  allHabitats() { return [...this.habitats.values()]; }
}

/** Elements ranked vs one creature, hardest-hitting first. */
export function elementOrder(creature) {
  return ELEMENTS
    .map((el) => ({ el, taken: creature.taken[el] }))
    .sort((a, b) => b.taken - a.taken);
}

export function weakSpots(creature) {
  return elementOrder(creature).filter((r) => r.taken > 100);
}

export function armorSpots(creature) {
  return elementOrder(creature).filter((r) => r.taken < 100).reverse();
}
