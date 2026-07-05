/**
 * Enrich the codex with TibiaData (https://docs.tibiadata.com — GET
 * /v4/creature/{race}): official artwork, description, behaviour,
 * summon/convince costs, paralysability, invisibility sense and loot lists.
 * Writes data/codex-extra.json keyed by creature slug. Re-run any time to
 * refresh; creatures TibiaData doesn't know are skipped, not failed.
 *
 *   node pipeline/enrich-codex.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const API = 'https://api.tibiadata.com/v4/creature/';
const CONCURRENCY = 4;

const slug = (s) => String(s).toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s'-]/g, ' ')
  .replace(/\s+/g, ' ').trim().replace(/['\s]+/g, '-').replace(/-+/g, '-');

const bestiary = JSON.parse(readFileSync(new URL('../data/bestiary.json', import.meta.url), 'utf8'));

// Incremental: keep what an earlier run already fetched, look up only the gaps.
let existing = {};
try {
  existing = JSON.parse(readFileSync(new URL('../data/codex-extra.json', import.meta.url), 'utf8')).creatures || {};
} catch { /* first run */ }

const names = (bestiary.data || []).map((c) => c.name).filter((n) => !existing[slug(n)]);
console.log(`${names.length} creatures to look up (${Object.keys(existing).length} already enriched).`);

async function lookup(name, attempt = 0) {
  try {
    const res = await fetch(API + encodeURIComponent(name.toLowerCase()), {
      headers: { 'User-Agent': 'exiva-xp-enrich (github.com/nesleykent/exiva-xp)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body.information?.status?.http_code !== 200 && !body.creature?.name) return null;
    const c = body.creature;
    if (!c?.name) return null;
    return {
      race: c.race || null,
      image: c.image_url || null,
      description: c.description || null,
      behaviour: c.behaviour || null,
      immune: c.immune || [],
      strong: c.strong || [],
      weakness: c.weakness || [],
      healedBy: c.healed || null,
      paralysable: !!c.be_paralysed,
      summonMana: c.be_summoned ? c.summoned_mana : null,
      convinceMana: c.be_convinced ? c.convinced_mana : null,
      seeInvisible: !!c.see_invisible,
      loot: c.is_lootable ? (c.loot_list || []) : [],
    };
  } catch (err) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      return lookup(name, attempt + 1);
    }
    console.error(`  ${name}: ${err.message}`);
    return null;
  }
}

const extra = { ...existing };
let done = 0;
let found = 0;
const queue = [...names];

await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const name = queue.shift();
    const data = await lookup(name);
    done += 1;
    if (data) { extra[slug(name)] = data; found += 1; }
    if (done % 100 === 0) console.log(`  ${done}/${names.length} (${found} enriched)`);
  }
}));

writeFileSync(
  new URL('../data/codex-extra.json', import.meta.url),
  JSON.stringify({ source: 'api.tibiadata.com/v4', fetchedAt: new Date().toISOString(), creatures: extra }, null, 1),
);
console.log(`Done: ${found}/${names.length} new, ${Object.keys(extra).length} total enriched → data/codex-extra.json`);
