/**
 * Engine smoke tests — run by publish.yml on every push and runnable locally:
 *   node pipeline/smoke.mjs
 * Exercises the full loop: read analyser → locate → battle read → rules →
 * ledger, against the real datasets. Any thrown error fails the deploy.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { isAnalyser, readAnalyser } from '../assets/js/engine/analyser.js';
import { assessImport, judge } from '../assets/js/engine/rules.js';
import { armorSpots, Codex, ELEMENT_CHARM, TASK_SPEEDS } from '../assets/js/engine/codex.js';
import { locateHunt, nameCreatures, population } from '../assets/js/engine/locator.js';
import { readBattle } from '../assets/js/engine/strategy.js';
import { buildLedger, groundDossier } from '../assets/js/engine/ledger.js';
import { baseValue, experienceForLevel, levelForExperience, experienceUntilNextLevel, nextBaseBreakpointLevel, nextMilestoneLevel, progressWithinLevel } from '../assets/js/engine/progression.js';
import { charmAdvice, effectiveDamage, formatStamina, parseStamina, profitSnapshot, staminaProjection, staminaRecoveryPlan } from '../assets/js/engine/planning.js';
import { HIGHSCORE_CATEGORIES } from '../assets/js/engine/highscores.js';
import { calculateImbuement, calculateTier, getAcquisitionOptions, GOLD_TOKEN_ITEM, imbuementById, IMBUEMENTS, selectCheapestOption } from '../assets/js/engine/imbuements.js';
import { normalizeGrounds } from '../assets/js/data/sources.js';
import { flow } from '../assets/js/viz/svg.js';
import { IMBUEMENT_MARKET_IDS } from './imbuement-market-ids.mjs';
import { currentBuyPrice } from './fetch-imbuement-prices.mjs';
import { CHARACTER } from './config.mjs';

const data = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const tibiaServerSaveDate = (date = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day - (parts.hour < 10 ? 1 : 0))).toISOString().slice(0, 10);
};

let extra = null;
try { extra = data('codex-extra.json'); } catch { /* enrichment is optional */ }
const taskData = data('creature-tasks.json');
const bestiary = data('bestiary.json');
const su2026Names = [
  'Devoted Radiant Acolyte', 'Devoted Radiant Inquisitor', 'Devoted Radiant Paragon',
  'Devoted Radiant Templar', 'Devoted Radiant Warden', 'Devoted Radiant Zealot',
  'Iceplume Strider', 'Jaracal', 'Moonspawn Blightspitter', 'Moonspawn Oozecrown',
  'Moonstone Excavator', 'Moonstone Overseer', 'Radiant Acolyte', 'Radiant Inquisitor',
  'Radiant Paragon', 'Radiant Templar', 'Radiant Warden', 'Radiant Zealot',
  'Silverfrost Sentinel', 'True Feverbloom Asura', 'Winged Jaracal',
];
const su2026 = bestiary.data.filter((creature) => creature.released_in === 'Summer Update 2026');
assert(bestiary.meta.total === 833 && bestiary.data.length === 833
  && bestiary.viewing_total_monsters === 833 && bestiary.viewing_total_points === 28_734,
  'SU2026 Bestiary totals must match the owner-supplied Cyclopedia metadata');
assert(bestiary.viewing_total_echo_warden_charm_points === 8_497,
  'SU2026 Echo Warden charm-point total must match the owner-supplied metadata');
assert(bestiary.source?.version === '15.30' && bestiary.source?.release === 'Summer Update 2026',
  'Bestiary import lineage must identify the SU2026 release');
assert(su2026.length === su2026Names.length
  && su2026Names.every((name) => su2026.some((creature) => creature.name === name))
  && su2026.reduce((sum, creature) => sum + creature.charm_details.charm_points, 0) === 1_650,
  'SU2026 Bestiary must contain the exact 21-creature, 1,650-point roster');
assert(su2026.every((creature) => creature.resistances?.length === 7 && creature.class?.name),
  'SU2026 creatures must retain complete Cyclopedia combat fields');
const codex = new Codex(bestiary, extra, taskData);
assert(codex.size === 833, `codex size drifted from the SU2026 Bestiary: ${codex.size}`);
const taskCreatures = codex.creatures.filter((creature) => creature.taskSpeed);
const taskRates = codex.creatures.flatMap((creature) => creature.taskRates);
assert(taskCreatures.length === 131 && TASK_SPEEDS.every((speed) => taskCreatures.some((creature) => creature.taskSpeed === speed)),
  'owner-curated task speeds must cover all five tiers and 131 canonical creatures');
assert(taskRates.length === 313 && taskRates.every((rate) => rate.kills > 0 && ['hour', 'lap'].includes(rate.unit)),
  'workbook task routes must preserve 313 positive, explicitly-unitized observations');
assert(codex.creature('emerald-damselfly').taskRates.some((rate) => rate.source.row === 7),
  'workbook spelling aliases must reconcile to canonical codex creatures');

const groundRosters = data('ground-creatures.json');
const grounds = normalizeGrounds(data('grounds.json'), groundRosters);
assert(grounds.entries.length > 500, `grounds too small: ${grounds.entries.length}`);
assert(grounds.entries.every((e) => e.xpRawFrom == null),
  'grounds.json alone must produce no stand-in XP — the overlay is what fills those');

// Druid raw-XP stand-ins (pipeline/fetch-druid-xp.mjs): they may only fill
// blanks, may never restate a published value, and must always be traceable
// back to the legacy row they came from — a stand-in that can't be labelled
// would read as a real druid figure.
const xpLegacy = data('grounds-xp-legacy.json');
const withLegacy = normalizeGrounds(data('grounds.json'), groundRosters, xpLegacy);
const published = new Map(grounds.entries.map((e) => [e.id, e.xpRaw]));
const filled = withLegacy.entries.filter((e) => e.xpRawFrom != null);
assert(filled.length > 25, `druid XP stand-ins too few: ${filled.length}`);
assert(filled.every((e) => e.vocation === xpLegacy.appliesTo),
  `stand-ins must stay within ${xpLegacy.appliesTo}`);
assert(filled.every((e) => published.get(e.id) == null),
  'a stand-in must never overwrite a value tibiapal already publishes');
assert(filled.every((e) => e.xpRaw > 0 && e.xpRawFrom.place && e.xpRawFrom.vocation && e.xpRawFrom.origin),
  'every stand-in needs a usable value and full provenance');
assert(withLegacy.entries.every((e) => e.xpRawFrom != null || e.xpRaw === published.get(e.id)),
  'the overlay must leave every other row exactly as captured');
assert(Object.keys(groundRosters.grounds).length >= 325,
  `TibiaWiki ground roster coverage regressed: ${Object.keys(groundRosters.grounds).length}`);
assert(Object.values(groundRosters.grounds).every((roster) =>
  roster.creatures.length && roster.creatures.every((name) => codex.identify(name)?.grade >= 0.97)),
'TibiaWiki ground rosters must contain only canonical Bestiary creatures');

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
const seaSerpentGround = grounds.directory.find((ground) => ground.slug === 'sea-serpents');
const wikiPopulation = population(seaSerpentGround, codex);
assert(wikiPopulation?.evidence === 'wiki' && wikiPopulation.set.some((row) => row.creature.name === 'Sea Serpent'),
  'population missed the TibiaWiki roster for Sea Serpents');
assert(codexPopulation?.evidence === 'name' && codexPopulation.set.some((row) => row.creature.name === 'Sea Serpent'),
  'population missed the safe name-only fallback without a roster');
const warzoneTwo = population(grounds.directory.find((ground) => ground.slug === 'warzone-2'), codex);
assert(warzoneTwo?.set.some((row) => row.creature.name === 'Magma Crawler')
  && !warzoneTwo.set.some((row) => row.creature.name === 'Humongous Fungus'),
'numbered Warzones must not inherit Warzone 1 creatures');
assert(warzoneTwo.source?.wikiTitle === 'Warzone 2' && warzoneTwo.source?.wikiUrl,
  'ground roster audit lineage must remain in the generated database');
const upperRoshamuul = population(grounds.directory.find((ground) => ground.slug === 'upper-roshamuul'), codex);
assert(upperRoshamuul?.set.some((row) => row.creature.name === 'Guzzlemaw')
  && !upperRoshamuul.set.some((row) => row.creature.name === 'Shock Head'),
'Upper Roshamuul must not inherit Lower Roshamuul creatures');

const battle = readBattle(loc.known.map((k) => ({ creature: k.creature, n: k.n })));
assert(battle && battle.tips.length > 0, 'strategy returned nothing');
assert(battle.tips.some((tip) => tip.includes('charms.html?charm=')) && battle.tips.every((tip) => !tip.includes('#')),
  'strategy charm links must use query-backed route state instead of fragments');

const hunt = {
  id: 't', loggedAt: '2026-01-01T12:00:00Z', ground: 'Dragon Lair',
  vocation: 'Knight', party: false, level: 100,
  minutes: s.minutes, xpRawRate: s.xpRawRate, loot: s.loot, balance: s.balance,
  kills: s.kills, drops: s.drops, raw: s.raw,
};
const verdict = judge(hunt, []);
assert(verdict.ok, `rules rejected a clean hunt: ${verdict.faults.join('; ')}`);
assert(!judge({ ...hunt, id: 't2' }, [hunt]).ok, 'duplicate slipped through');
const soloWithoutVocation = judge({ ...hunt, id: 'solo-no-vocation', vocation: null }, []);
assert(soloWithoutVocation.faults.includes('Vocation is required for a solo hunt.'),
  'solo hunts must retain vocation evidence');
assert(judge({ ...hunt, id: 'team-no-vocation', vocation: null, party: true }, []).ok,
  'team hunts must remain valid without a single vocation');
const importReport = assessImport([
  { ...hunt, id: 'imported', raw: `${hunt.raw}\nImported backup marker` },
  { ...hunt, id: 'imported', raw: `${hunt.raw}\nSecond row with repeated ID` },
  { ...hunt, id: 'duplicate-analyser' },
  { id: 'broken' },
  null,
], [hunt]);
assert(importReport.accepted.length === 1, `import should accept one valid new hunt, got ${importReport.accepted.length}`);
assert(importReport.duplicates.length === 2, `import should skip repeated ID + analyser duplicates, got ${importReport.duplicates.length}`);
assert(importReport.rejected.length === 2, `import should reject malformed rows, got ${importReport.rejected.length}`);
assert(importReport.rejected.some((row) => row.faults.includes('No hunting ground.')),
  'import rejection must preserve normal hunt-rule faults');
assert(assessImport({}, []).rejected[0].faults[0] === 'Import must be a JSON array of hunts.',
  'non-array imports must fail closed');

const table = buildLedger(grounds.entries, [hunt]);
assert(table.some((r) => r.basis === 'logged'), 'ledger missing logged row');
const dossier = groundDossier(hunt.ground.toLowerCase().replace(/ /g, '-'), [hunt]);
assert(dossier.n === 1 && dossier.kills[0].name === 'dragon' && dossier.kills[0].n === 120,
  'groundDossier did not aggregate the hunt kills');
assert(dossier.profitRate.avg === 150_000, `groundDossier profit rate failed: ${dossier.profitRate.avg}`);
const loggedPopulation = population({ name: hunt.ground }, codex, [hunt]);
assert(loggedPopulation?.evidence === 'logged' && loggedPopulation.set.some((row) => row.creature.name === 'Dragon' && row.n === 120),
  'population did not prefer logged kill evidence');
const loggedWarzoneTwo = population(grounds.directory.find((ground) => ground.slug === 'warzone-2'), codex, [{
  ground: 'Candia Nibblemaws',
  kills: [{ name: 'Goggle Cake', n: 50 }],
}, {
  ground: 'Warzone 2',
  kills: [{ name: 'Magma Crawler', n: 10 }],
}]);
assert(loggedWarzoneTwo?.evidence === 'logged-wiki'
  && loggedWarzoneTwo.set.length === warzoneTwo.set.length
  && !loggedWarzoneTwo.set.some((row) => row.creature.name === 'Goggle Cake')
  && loggedWarzoneTwo.set.some((row) => row.creature.name === 'Lava Golem' && row.n === 0)
  && loggedWarzoneTwo.battleSet.length === 1
  && loggedWarzoneTwo.battleSet[0].creature.name === 'Magma Crawler',
'saved analyser kills must be scoped to the selected ground without hiding unobserved TibiaWiki roster creatures');

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
  const artwork = codex.creatures.filter((creature) => creature.art).length;
  const tibiaData = codex.creatures
    .filter((creature) => Object.hasOwn(extra.creatures?.[creature.slug] || {}, 'race')).length;
  assert(artwork > 100 && tibiaData > 100,
    `enrichment wiring broken: ${tibiaData} TibiaData records, ${artwork} artwork records`);
  console.log(`enrichment: ${tibiaData}/${codex.size} TibiaData records; ${artwork}/${codex.size} artwork records`);
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
  assert(character.name === CHARACTER.name, `character.json tracks ${character.name}, expected ${CHARACTER.name} (config.ini)`);
  const highscoreHistories = Object.fromEntries(HIGHSCORE_CATEGORIES.map(({ category }) => [
    category,
    data(`highscores/${category}.json`),
  ]));
  const experienceEntries = Object.entries(highscoreHistories.experience);
  assert(experienceEntries.length >= 1, 'highscores/experience.json is empty despite character.json existing');
  assert(experienceEntries.at(-1)[0] <= tibiaServerSaveDate(), 'latest experience row is after the current Tibia server-save day');
  for (const { category, primary } of HIGHSCORE_CATEGORIES) {
    const entries = Object.entries(highscoreHistories[category]);
    for (const [date, observation] of entries) {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(date), `bad ${category} history date key: ${date}`);
      assert(Object.hasOwn(observation, 'value') && Object.hasOwn(observation, 'rank'),
        `${category}[${date}] must store value and rank explicitly`);
      assert(observation.value == null || Number.isFinite(observation.value), `${category}[${date}] has a bad value`);
      assert(observation.rank == null || Number.isFinite(observation.rank), `${category}[${date}] has a bad rank`);
      assert(typeof observation.source === 'string' && observation.source, `${category}[${date}] is missing source lineage`);
      if (primary) {
        assert(Number.isFinite(observation.level) && Number.isFinite(observation.value),
          `experience[${date}] is missing level or XP`);
        assert(experienceUntilNextLevel(observation.level, observation.value) > 0,
          `experience[${date}]: recorded XP exceeds the next level's requirement — level/XP mismatch`);
      }
    }
  }
  const latestDrome = Object.values(highscoreHistories.dromescore).at(-1);
  if (character.highscoreRanks?.dromescore != null || character.skillRanks?.drome != null) {
    assert(Number.isFinite(latestDrome?.value), 'latest Drome history is missing a value despite a Drome rank in character.json');
  }
}

// -------------------------------------------------------------- imbuements

assert(IMBUEMENTS.length >= 20, `imbuement catalogue too small: ${IMBUEMENTS.length}`);
assert(IMBUEMENTS.filter((i) => i.supportsGoldTokenExchange).map((i) => i.id).sort().join(',') === 'strike,vampirism,void',
  'only Vampirism, Void and Strike may support Gold Token exchange');

const vampirism = imbuementById('vampirism');
const gentebraPrices = {
  'gold-token': 46029,
  'vampire-teeth': 792,
  'bloody-pincers': 13022,
  'piece-of-dead-brain': 30596,
};
const powerful = calculateTier(vampirism, 'powerful', gentebraPrices);
const totals = Object.fromEntries(powerful.options.map((o) => [o.label, o.total]));
assert(totals['Market only'] === 618110, `market-only total wrong: ${totals['Market only']}`);
assert(totals['6 Gold Tokens'] === 526174, `token-only total wrong: ${totals['6 Gold Tokens']}`);
assert(totals['Hybrid from Intricate'] === 587096, `hybrid-from-intricate total wrong: ${totals['Hybrid from Intricate']}`);
assert(totals['Hybrid from Basic'] === 690368, `hybrid-from-basic total wrong: ${totals['Hybrid from Basic']}`);
assert(powerful.cheapest.label === '6 Gold Tokens', `expected Gold Tokens to be cheapest, got ${powerful.cheapest?.label}`);
assert(powerful.cheapest.fee === 250000, `expected Powerful imbuing fee in cheapest option, got ${powerful.cheapest?.fee}`);
assert(powerful.savings.find((s) => s.against === 'Market only').amount === 618110 - 526174, 'savings vs market-only wrong');

const basic = calculateTier(vampirism, 'basic', gentebraPrices);
const basicTotals = Object.fromEntries(basic.options.map((o) => [o.label, o.total]));
assert(basicTotals['Market only'] === 34800, `Basic market-only total wrong: ${basicTotals['Market only']}`);
assert(basicTotals['2 Gold Tokens'] === 107058, `Basic token total wrong: ${basicTotals['2 Gold Tokens']}`);
assert(basic.cheapest.fee === 15000, `expected Basic imbuing fee in cheapest option, got ${basic.cheapest?.fee}`);

const intricate = calculateTier(vampirism, 'intricate', gentebraPrices);
const intricateTotals = Object.fromEntries(intricate.options.map((o) => [o.label, o.total]));
assert(intricateTotals['Market only'] === 270130, `Intricate market-only total wrong: ${intricateTotals['Market only']}`);
assert(intricateTotals['4 Gold Tokens'] === 239116, `Intricate token total wrong: ${intricateTotals['4 Gold Tokens']}`);
assert(intricateTotals['Hybrid from Basic'] === 342388, `Intricate hybrid total wrong: ${intricateTotals['Hybrid from Basic']}`);
assert(intricate.cheapest.fee === 55000, `expected Intricate imbuing fee in cheapest option, got ${intricate.cheapest?.fee}`);

const voidImbuement = imbuementById('void');
const screenshotPrices = {
  'gold-token': 46274,
  'rope-belt': 4296,
  'silencer-claws': 3362,
  'grimeleech-wings': 1734,
};
const screenshotCalc = calculateImbuement(voidImbuement, screenshotPrices);
assert(screenshotCalc.basic.cheapest.total === 107548, `screenshot Basic Void total wrong: ${screenshotCalc.basic.cheapest.total}`);
assert(screenshotCalc.intricate.cheapest.label === 'Hybrid from Basic', `screenshot Intricate Void should use Basic package hybrid, got ${screenshotCalc.intricate.cheapest.label}`);
assert(screenshotCalc.intricate.cheapest.total === 231598, `screenshot Intricate Void total wrong: ${screenshotCalc.intricate.cheapest.total}`);
assert(screenshotCalc.powerful.cheapest.label === 'Hybrid from Basic', `screenshot Powerful Void should use Basic package hybrid, got ${screenshotCalc.powerful.cheapest.label}`);
assert(screenshotCalc.powerful.cheapest.total === 435268, `screenshot Powerful Void total wrong: ${screenshotCalc.powerful.cheapest.total}`);

const basicOptions = getAcquisitionOptions(vampirism, 'basic', gentebraPrices);
assert(basicOptions.length === 2, `Basic Vampirism should have exactly market + token options, got ${basicOptions.length}`);
assert(selectCheapestOption(basicOptions).label === 'Market only', 'Basic Vampirism cheapest should be market at these prices (25×792 beats 2×46,029)');

const intricateOptions = getAcquisitionOptions(vampirism, 'intricate', gentebraPrices);
assert(intricateOptions.length === 3, `Intricate Vampirism should have market + token + one hybrid, got ${intricateOptions.length}`);
const intricateHybrid = intricateOptions.find((o) => o.method === 'hybrid');
assert(intricateHybrid.items.length === 1 && intricateHybrid.items[0].name === 'Bloody Pincers',
  'Intricate hybrid must only carry the Bloody Pincers remainder, not the Basic package again');

const swiftness = imbuementById('swiftness');
assert(!swiftness.supportsGoldTokenExchange, 'Swiftness must not support Gold Token exchange');
const swiftnessOptions = getAcquisitionOptions(swiftness, 'powerful', {});
assert(swiftnessOptions.length === 1 && swiftnessOptions[0].method === 'market',
  'imbuements without Gold Token support must expose Market only as the single option');

const missingPriceTier = calculateTier(vampirism, 'basic', {});
assert(!missingPriceTier.canCalculate, 'a tier with zero prices set must not be calculable');
assert(missingPriceTier.missingPrices.includes('Vampire Teeth') && missingPriceTier.missingPrices.includes('Gold Token'),
  'missing-price list must name every unpriced item across all options');
assert(missingPriceTier.cheapest == null, 'an incomplete tier must never recommend an option');

const zeroPriceTier = calculateTier(vampirism, 'basic', { 'vampire-teeth': 0 });
assert(!zeroPriceTier.canCalculate, 'an unconfirmed zero price must be treated as missing, not free');
const confirmedZeroTier = calculateTier(vampirism, 'basic', { 'vampire-teeth': { price: 0, confirmedZero: true }, 'gold-token': 100 });
assert(confirmedZeroTier.canCalculate, 'an explicitly confirmed zero price must be usable');

for (const imb of IMBUEMENTS) {
  const calc = calculateImbuement(imb, {});
  for (const tierId of ['basic', 'intricate', 'powerful']) assert(!calc[tierId].canCalculate, `${imb.id} ${tierId} should be incomplete with no prices set`);
}

// every priceable item (fetch-imbuement-prices.mjs's TibiaMarket prefill target) must have a pinned numeric item_id
const priceableItems = new Set([GOLD_TOKEN_ITEM]);
for (const imb of IMBUEMENTS) {
  for (const tierId of ['basic', 'intricate', 'powerful']) {
    for (const it of imb.tiers[tierId].items) priceableItems.add(it.itemId);
  }
}
for (const itemId of priceableItems) {
  assert(Number.isFinite(IMBUEMENT_MARKET_IDS[itemId]), `${itemId} has no TibiaMarket item_id pinned in pipeline/imbuement-market-ids.mjs`);
}

const sparseMarketHistory = [
  { time: 1700000000, day_average_sell: 110.4 },
  { time: 1700086400, is_full_data: true, sell_offer: 125, day_lowest_sell: 120 },
  { time: 1700172800, day_lowest_sell: 0, day_average_sell: 0 },
];
const sparseMarketPrice = currentBuyPrice(sparseMarketHistory);
assert(sparseMarketPrice.price === 125 && sparseMarketPrice.basis === 'active-sell-offer',
  'market price fallback must use the newest usable active sell offer when later rows have no sells');
assert(sparseMarketPrice.observedAt === new Date(1700086400 * 1000).toISOString(),
  'market price fallback must preserve the source observation timestamp');
const recentTradePrice = currentBuyPrice([
  { time: 1700000000, is_full_data: true, sell_offer: 125 },
  { time: 1700086400, day_lowest_sell: 118, day_average_sell: 121 },
]);
assert(recentTradePrice.price === 118 && recentTradePrice.basis === 'daily-lowest-sell',
  'a newer daily sell observation must win over an older active-offer snapshot');
assert(currentBuyPrice(null) == null && currentBuyPrice([]) == null,
  'missing market history must remain missing instead of inventing a price');

const pageFiles = ['index', 'character', 'grounds', 'creatures', 'charms', 'submit', 'tools', 'analytics', 'admin'];
for (const page of pageFiles) {
  const html = readFileSync(new URL(`../${page}.html`, import.meta.url), 'utf8');
  assert(!/href\s*=\s*["'][^"']*#/.test(html), `${page}.html reintroduced hash navigation`);
  assert(html.includes('data-skip-stage'), `${page}.html is missing the non-hash skip control`);
  assert(!/<button\b(?![^>]*\btype\s*=)[^>]*>/.test(html), `${page}.html contains a button without an explicit type`);
}
const jsSourceUrls = [new URL('../assets/js/shell.js', import.meta.url)];
for (const directory of ['lib', 'engine', 'data', 'viz', 'pages']) {
  const directoryUrl = new URL(`../assets/js/${directory}/`, import.meta.url);
  readdirSync(directoryUrl).filter((name) => name.endsWith('.js')).forEach((name) => jsSourceUrls.push(new URL(name, directoryUrl)));
}
for (const sourceUrl of jsSourceUrls) {
  const source = readFileSync(sourceUrl, 'utf8');
  assert(!/href\s*=\s*["'][^"']*#|location\.hash|hashchange/.test(source),
    `${sourceUrl.pathname} reintroduced hash-based navigation`);
  assert(!/<button\b(?![^>]*\btype\s*=)[^>]*>/.test(source),
    `${sourceUrl.pathname} contains a button without an explicit type`);
}
const characterController = readFileSync(new URL('../assets/js/pages/character.js', import.meta.url), 'utf8');
const homeController = readFileSync(new URL('../assets/js/pages/home.js', import.meta.url), 'utf8');
const groundsController = readFileSync(new URL('../assets/js/pages/grounds.js', import.meta.url), 'utf8');
const creaturesController = readFileSync(new URL('../assets/js/pages/creatures.js', import.meta.url), 'utf8');
const submitController = readFileSync(new URL('../assets/js/pages/submit.js', import.meta.url), 'utf8');
const bootController = readFileSync(new URL('../assets/js/pages/_boot.js', import.meta.url), 'utf8');
const toolsController = readFileSync(new URL('../assets/js/pages/tools.js', import.meta.url), 'utf8');
// The character page mirrors the standalone reference's section order and set:
// header (avatar + name + share) → KPIs → next hunts → Experience chart →
// Skills → point-stat cards → hunting activity + deaths. The reference has no
// deep-dive tabs, planner table, or projection tool, so those must stay gone.
assert(characterController.includes('character-hero') && characterController.includes('id="share-profile"') &&
  characterController.includes('skill-grid') && characterController.includes('stat-cards') &&
  characterController.includes('experienceChartData') && characterController.includes('id="xp-year"'),
  'character page must keep the reference sections: hero + share, skills grid, stat cards, and the single Experience chart with year/month controls');
assert(!characterController.includes('character-deep-dive') && !characterController.includes('projection-tools') &&
  !characterController.includes('data-xp-metric') && !characterController.includes('chart-inspector'),
  'character page must not reintroduce the tabbed deep-dive, projection tool, metric toggle, or chart inspector the reference does not have');
assert(homeController.includes("boot('index.html', { ledger: true, config: true })") &&
  homeController.includes('loadCharacterHistory') && homeController.includes('home-metric-grid') &&
  homeController.includes('Next hunt · from your evidence') && homeController.includes('Needs attention'),
  'Home must remain the owner-directed, evidence-backed daily dashboard from the standalone reference');
assert(!homeController.includes('loadCodex') && !homeController.includes('loadCharms'),
  'Home dashboard must not pull the multi-megabyte codex or charm catalogue');
for (const route of ['analytics.html', 'creatures.html', 'charms.html', 'admin.html']) {
  assert(homeController.includes(`'${route}'`), `${route} must remain reachable from the mobile Home dashboard`);
}
assert(groundsController.includes('id="f" role="search"') &&
  groundsController.includes("$('#f').addEventListener('submit', (e) => e.preventDefault())"),
  'Planner live filters must keep Enter from submitting and losing filter state');
assert(creaturesController.includes('id="c-filter" role="search"') &&
  creaturesController.includes("$('#c-filter').addEventListener('submit', (e) => e.preventDefault())"),
  'Codex live filters must keep Enter from submitting and losing filter state');
assert(submitController.includes('aria-labelledby="paste-heading"') && submitController.includes('id="read-note" role="status"'),
  'analyser input and parser feedback must remain available to assistive technology');
assert(submitController.includes('class="guess ${i === 0') && !submitController.includes('role="button"'),
  'hunt-location choices must remain native buttons instead of keyboard-emulated divs');
assert(submitController.includes('id="hunt-form"') && submitController.includes("addEventListener('submit'") && submitController.includes('let saving = false'),
  'hunt confirmation must remain a native form guarded against concurrent saves');
assert(submitController.includes('id="review-heading" tabindex="-1"') && submitController.includes("$('#review-heading').focus()"),
  'successful analyser parsing must move focus to the review workflow');
assert(bootController.includes('codex = false') && bootController.includes('grounds = false') && bootController.includes('ledger = false'),
  'page bootstrap datasets must stay opt-in to prevent multi-megabyte unrelated fetches');
assert(bootController.includes('const needsGrounds = grounds || ledger') && bootController.includes('const needsHunts = hunts || ledger'),
  'ledger pages must automatically load their grounds and hunt evidence');
assert(toolsController.includes('id="stamina-out" role="status"') && toolsController.includes('id="damage-out" role="status"'),
  'interactive calculator results must remain polite live status regions');
assert(toolsController.includes('aria-labelledby="imb-modal-title"') && toolsController.includes('id="imb-modal-effect"'),
  'imbuement dialog must remain programmatically named and described');
const markedFlow = flow([
  { key: '07-01', n: 10, events: [{ type: 'level', label: 'Reached level 10' }] },
  { key: '07-02', n: 5, events: [{ type: 'death', label: 'Death at level 10' }] },
]);
assert(markedFlow.includes('vevent-level') && markedFlow.includes('vevent-death'),
  'progression chart must render both level-up and death markers');

console.log(`engine ok: ${codex.size} creatures / ${grounds.entries.length} entries / ${table.length} ledger rows / ${charms.length} charms${access ? ` / ${Object.keys(access.grounds).length} ground access notes` : ''}${character ? ` / ${Object.keys(data('highscores/experience.json')).length} tracked XP day(s) of ${CHARACTER.name}` : ''} / ${IMBUEMENTS.length} imbuements`);
