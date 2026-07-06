/**
 * Engine smoke tests — run by publish.yml on every push and runnable locally:
 *   node pipeline/smoke.mjs
 * Exercises the full loop: read analyser → locate → battle read → rules →
 * ledger, against the real datasets. Any thrown error fails the deploy.
 */

import { readFileSync } from 'node:fs';
import { isAnalyser, readAnalyser } from '../assets/js/engine/analyser.js';
import { judge } from '../assets/js/engine/rules.js';
import { armorSpots, Codex, ELEMENT_CHARM } from '../assets/js/engine/codex.js';
import { locateHunt, nameCreatures, population } from '../assets/js/engine/locator.js';
import { readBattle } from '../assets/js/engine/strategy.js';
import { buildLedger, groundDossier } from '../assets/js/engine/ledger.js';
import { baseValue, experienceForLevel, levelForExperience, experienceUntilNextLevel, nextBaseBreakpointLevel, nextMilestoneLevel, progressWithinLevel } from '../assets/js/engine/progression.js';
import { charmAdvice, effectiveDamage, exerciseWeaponCost, formatStamina, parseStamina, profitSnapshot, sharedExpRange, staminaProjection, staminaRecoveryPlan } from '../assets/js/engine/planning.js';
import { normalizeGrounds } from '../assets/js/data/sources.js';

const data = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

let extra = null;
try { extra = data('codex-extra.json'); } catch { /* enrichment is optional */ }
const codex = new Codex(data('bestiary.json'), extra);
assert(codex.size > 500, `codex too small: ${codex.size}`);

const grounds = normalizeGrounds(data('grounds.json'));
assert(grounds.entries.length > 500, `grounds too small: ${grounds.entries.length}`);

const s = readAnalyser([
  'Session data: From 2026-01-01, 10:00:00 to 2026-01-01, 12:00:00',
  'Session: 02:00h',
  'Raw XP Gain: 2,400,000',
  'Loot: 500,000',
  'Balance: 300,000',
  'Killed Monsters:',
  '  120x dragon',
  '  30x dragon lord',
].join('\n'));
assert(isAnalyser(s), 'isAnalyser rejected a valid analyser paste');
assert(!isAnalyser(readAnalyser('hello world')), 'isAnalyser accepted plain text');
assert(s.xpRawRate === 1_200_000, `rate derivation failed: ${s.xpRawRate}`);
assert(s.kills.length === 2, 'kill list failed');

const loc = locateHunt(s.kills, codex, grounds.directory);
assert(loc.candidates.length > 0, 'locator returned nothing');

const seaSerpents = nameCreatures('Sea Serpents', codex).map((c) => c.name);
assert(seaSerpents.includes('Sea Serpent'), 'nameCreatures missed the creature named by Sea Serpents');
const codexPopulation = population({ name: 'Sea Serpents' }, codex);
assert(codexPopulation?.evidence === 'codex' && codexPopulation.set.some((row) => row.creature.name === 'Sea Serpent'),
  'population missed the codex population for Sea Serpents');

const battle = readBattle(loc.known.map((k) => ({ creature: k.creature, n: k.n })));
assert(battle && battle.tips.length > 0, 'strategy returned nothing');

const hunt = {
  id: 't', loggedAt: '2026-01-01T12:00:00Z', ground: 'Dragon Lair',
  vocation: 'Knight', party: false, level: 100,
  minutes: s.minutes, xpRawRate: s.xpRawRate, loot: s.loot, balance: s.balance,
  kills: s.kills, drops: s.drops, raw: s.raw,
};
const verdict = judge(hunt, []);
assert(verdict.ok, `rules rejected a clean hunt: ${verdict.faults.join('; ')}`);
assert(!judge({ ...hunt, id: 't2' }, [hunt]).ok, 'duplicate slipped through');

const table = buildLedger(grounds.entries, [hunt]);
assert(table.some((r) => r.basis === 'logged'), 'ledger missing logged row');
const dossier = groundDossier(hunt.ground.toLowerCase().replace(/ /g, '-'), [hunt]);
assert(dossier.n === 1 && dossier.kills[0].name === 'dragon' && dossier.kills[0].n === 120,
  'groundDossier did not aggregate the hunt kills');
assert(dossier.profitRate.avg === 150_000, `groundDossier profit rate failed: ${dossier.profitRate.avg}`);
const loggedPopulation = population({ name: hunt.ground }, codex, [hunt]);
assert(loggedPopulation?.evidence === 'logged' && loggedPopulation.set.some((row) => row.creature.name === 'Dragon' && row.n === 120),
  'population did not prefer logged kill evidence');

assert(formatStamina(parseStamina('39:30')) === '39:30', 'stamina parsing/formatting failed');
const stamina = staminaProjection(parseStamina('39:00'), parseStamina('2:00'), parseStamina('42:00'));
assert(stamina.afterHunt === parseStamina('37:00') && stamina.recovery.readyInMinutes > 0, 'stamina projection failed');
// TibiaWiki's own worked example pins all three regen constants:
// "To go from 39 hours of stamina to the maximum of 42 hours (bonus)
//  it would take 18 hours and 10 minutes of being offline."
const wikiExample = staminaRecoveryPlan(39 * 60, 42 * 60);
assert(wikiExample.readyInMinutes === 18 * 60 + 10,
  `stamina regen drifted from the wiki example: 39:00→42:00 gave ${wikiExample.readyInMinutes} min, expected 1090`);
const damage = effectiveDamage({ level: 465, rawMin: 300, rawMax: 700, elementTaken: 110, targetHp: 1000, critChance: 10, fatalChance: 1, charmPercent: 5, charmChance: 11 });
assert(damage.rawAvg === 500 && damage.turn > damage.hit && damage.base > 0, 'damage calculator math failed');
assert(damage.charmExpected < damage.charmProc, 'charm expectation must discount by trigger chance');
assert(Math.abs(damage.charmExpected - damage.charmProc * 0.11) < 1e-9, 'charm expectation must use the given per-charm trigger chance');
const profit = profitSnapshot([hunt]);
assert(profit.totals.hunts === 1 && profit.totals.profitRate === 150_000, 'profit snapshot failed');

const sharedRange = sharedExpRange(300);
assert(sharedRange.min <= 300 && 300 <= sharedRange.max, 'sharedExpRange must contain its own reference level');
assert(sharedRange.min === 200 && sharedRange.max === 450, `sharedExpRange(300) drifted: got ${sharedRange.min}-${sharedRange.max}`);
const exercise = exerciseWeaponCost(500);
assert(exercise.mana === 300_000 && exercise.seconds === 1000, `exerciseWeaponCost(500) drifted: ${JSON.stringify(exercise)}`);

const charms = data('charms.json').charms;
const charmElement = Object.fromEntries(Object.entries(ELEMENT_CHARM).map(([el, name]) => [name, el]));
const adviceCharms = charms.map((c) => ({ name: c.name, element: charmElement[c.name] || null, stages: c.stages, effect: c.effect }));
const dragon = codex.identify('dragon')?.creature;
assert(dragon, 'dragon did not resolve in the codex');
const dragonArmor = armorSpots(dragon);
assert(dragonArmor.length > 0 && dragonArmor.every((row) => row.taken < 100), 'armorSpots missed dragon resistances');
assert(dragonArmor.every((row, i) => i === 0 || dragonArmor[i - 1].taken <= row.taken), 'armorSpots is not ordered hardest resistance first');
const advice = charmAdvice([{ kills: [{ name: 'dragon', n: 100 }] }], codex, adviceCharms);
assert(advice.length > 0, 'charm advice returned nothing for dragon kills');
assert(advice.every((row, i) => i === 0 || advice[i - 1].total >= row.total), 'charm advice is not sorted descending');
assert(advice.every((row) => Number.isFinite(row.total) && row.total > 0), 'charm advice produced a non-positive or non-finite total');
const dragonWeaknesses = new Set(Object.entries(dragon.taken).filter(([, taken]) => Number(taken) > 100).map(([el]) => el));
assert(dragonWeaknesses.size > 0, 'dragon has no elemental weakness to test against');
assert(dragonWeaknesses.has(advice[0].charm.element), `top dragon charm is ${advice[0].charm.element}, not a dragon weakness`);

if (extra) {
  const enriched = codex.creatures.filter((c) => c.art).length;
  assert(enriched > 100, `enrichment wiring broken: ${enriched}`);
  console.log(`enrichment: ${enriched}/${codex.size} creatures carry TibiaData extras`);
}

assert(charms.length >= 24, `charm catalogue too small: ${charms.length}`);
const charmNames = new Set(charms.map((c) => c.name));
for (const [el, name] of Object.entries(ELEMENT_CHARM)) {
  assert(charmNames.has(name), `${name} (the ${el} charm) is missing from the catalogue`);
}
for (const c of charms) {
  assert(/\{\{\}\}/.test(c.effect), `${c.name}: effect template lost its {{}} placeholder`);
  assert(c.stages?.length === 3, `${c.name}: expected 3 upgrade stages, got ${c.stages?.length}`);
}

let access = null;
try { access = data('access.json'); } catch { /* optional, best-effort */ }
if (access) {
  assert(typeof access.grounds === 'object', 'access.json malformed');
  for (const [slug, entry] of Object.entries(access.grounds)) {
    assert(entry.wikiTitle && entry.wikiUrl, `access.json[${slug}] has no wikiTitle/wikiUrl — a malformed placeholder entry slipped through`);
    assert(entry.area || entry.level || entry.quest || entry.premium || entry.note, `access.json[${slug}] carries no actual signal — should have been omitted`);
  }
}

assert(experienceForLevel(2) === 100, 'XP formula broken: level 2 must cost 100 xp');
assert(Math.abs(levelForExperience(experienceForLevel(465)) - 465) < 1e-6, 'level↔XP inversion drifted');
assert(progressWithinLevel(465, experienceForLevel(465)) === 0, 'progressWithinLevel must start at 0 for exact level XP');
assert(Math.abs(progressWithinLevel(465, (experienceForLevel(465) + experienceForLevel(466)) / 2) - 50) < 1e-9,
  'progressWithinLevel drifted at the midpoint between levels');
assert(nextMilestoneLevel(465) === 500 && nextMilestoneLevel(500) === 550, 'nextMilestoneLevel should advance to the next 50-level marker');
const baseAt465 = baseValue(465);
const nextBaseAt465 = nextBaseBreakpointLevel(465);
assert(Number.isFinite(baseAt465) && nextBaseAt465 > 465, 'base value breakpoint calculation failed');
assert(baseValue(nextBaseAt465 - 1) === baseAt465 && baseValue(nextBaseAt465) > baseAt465,
  'nextBaseBreakpointLevel did not point at the next base-value increase');

let character = null;
try { character = data('character.json'); } catch { /* tracker has not run yet */ }
if (character) {
  assert(character.name === "Night'Flyn", `character.json tracks ${character.name}, expected Night'Flyn`);
  const charHistory = data('character-history.json');
  const entries = Object.entries(charHistory);
  assert(entries.length >= 1, 'character-history.json is empty despite character.json existing');
  assert(!Object.hasOwn(charHistory, '2026-07-06') || charHistory['2026-07-06'].source !== 'TibiaData highscores',
    'pre-server-save TibiaData reading was recorded under UTC date 2026-07-06 instead of Tibia server-save day 2026-07-05');
  for (const [date, e] of entries) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(date), `bad history date key: ${date}`);
    assert(Number.isFinite(e.level) && Number.isFinite(e.experience) && (e.rank == null || Number.isFinite(e.rank)),
      `history[${date}] missing level/experience or has a bad rank`);
    assert(experienceUntilNextLevel(e.level, e.experience) > 0,
      `history[${date}]: recorded XP exceeds the next level's requirement — level/XP mismatch`);
  }
  const latestEntry = entries.at(-1)?.[1] || {};
  if (character.skillRanks?.drome != null) {
    assert(Number.isFinite(latestEntry.dromeScore), 'latest character-history entry is missing TibiaData Drome score despite a Drome rank in character.json');
  }
  for (const [valueField, rankField] of [
    ['magicLevel', 'magicLevelRank'],
    ['charmPoints', 'charmPointsRank'],
    ['bossPoints', 'bossPointsRank'],
    ['achievements', 'achievementsRank'],
    ['loyalty', 'loyaltyRank'],
    ['fishing', 'fishingRank'],
    ['dromeScore', 'dromeScoreRank'],
  ]) {
    if (latestEntry[valueField] != null && latestEntry[rankField] != null) {
      assert(Number.isFinite(latestEntry[rankField]), `latest character-history entry has a bad ${rankField}`);
    }
  }
}

let online = null;
try { online = data('character-online.json'); } catch { /* online sampler has not run yet */ }
if (online) {
  assert(online.character === "Night'Flyn", `character-online.json tracks ${online.character}, expected Night'Flyn`);
  assert(online.world === 'Gentebra', `character-online.json world is ${online.world}, expected Gentebra`);
  assert(online.cadenceMinutes === 15, `online cadence must stay at 15 minutes, got ${online.cadenceMinutes}`);
  assert(/TibiaData/.test(online.source || ''), 'online sampler must declare TibiaData as its source');
  assert(Array.isArray(online.samples), 'character-online.json samples must be an array');
  let previousSlot = '';
  for (const sample of online.samples) {
    assert(/^\d{4}-\d{2}-\d{2}T\d{2}:(00|15|30|45):00\.000Z$/.test(sample.slot),
      `online sample has a non-15-minute slot: ${sample.slot}`);
    assert(sample.slot >= previousSlot, `online samples are out of order around ${sample.slot}`);
    previousSlot = sample.slot;
    assert(/^\d{4}-\d{2}-\d{2}T/.test(sample.sampledAt || ''), `online sample ${sample.slot} has no sampledAt timestamp`);
    assert(typeof sample.online === 'boolean', `online sample ${sample.slot} has no boolean online flag`);
    assert(sample.worldPlayersOnline == null || Number.isFinite(sample.worldPlayersOnline),
      `online sample ${sample.slot} has bad worldPlayersOnline`);
    if (sample.online) {
      assert(Number.isFinite(sample.level), `online sample ${sample.slot} is online without a level`);
      assert(sample.vocation, `online sample ${sample.slot} is online without a vocation`);
    }
  }
  // compacted day summaries: internal consistency, never more online than observed
  let previousDay = '';
  for (const day of online.days || []) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(day.date), `compacted day has a bad date: ${day.date}`);
    assert(day.date > previousDay, `compacted days out of order around ${day.date}`);
    previousDay = day.date;
    assert(Number.isFinite(day.observed) && Number.isFinite(day.online) && day.online <= day.observed,
      `compacted day ${day.date}: online (${day.online}) exceeds observed (${day.observed})`);
    assert(day.minutes === day.online * online.cadenceMinutes,
      `compacted day ${day.date}: minutes must equal online × cadence`);
    if (online.samples.length) {
      assert(day.date < online.samples[0].slot.slice(0, 10),
        `compacted day ${day.date} overlaps the raw sample window`);
    }
  }
  // observed level-ups are permanent and ordered
  let previousUp = '';
  for (const up of online.levelUps || []) {
    assert(up.slot > previousUp, `level-ups out of order around ${up.slot}`);
    previousUp = up.slot;
    assert(Number.isFinite(up.level) && Number.isFinite(up.from) && up.level > up.from,
      `level-up at ${up.slot} is not an increase (${up.from} → ${up.level})`);
  }
}

console.log(`engine ok: ${codex.size} creatures / ${grounds.entries.length} entries / ${table.length} ledger rows / ${charms.length} charms${access ? ` / ${Object.keys(access.grounds).length} ground access notes` : ''}${character ? ` / ${Object.keys(data('character-history.json')).length} tracked day(s) of Night'Flyn` : ''}${online ? ` / ${online.samples.length} online sample(s)` : ''}`);
