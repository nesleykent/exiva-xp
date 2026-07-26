/**
 * Build an explicit hunting-ground creature roster cache from TibiaWiki's
 * Hunting Places articles. Local planner labels are tactical aliases rather
 * than canonical place titles, so only exact/strong title matches or the
 * already-resolved TibiaWiki access article are accepted. Ambiguous matches
 * stay unresolved instead of inheriting a broad city or region population.
 *
 *   node pipeline/enrich-ground-creatures.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { Codex } from '../assets/js/engine/codex.js';
import { depluralize, fold, slug } from '../assets/js/lib/text.js';
import { normalizeGrounds } from '../assets/js/data/sources.js';

const WIKI = 'https://tibia.fandom.com/api.php';
const CATEGORY = 'Category:Hunting Places';
const UA = { 'User-Agent': 'exiva-xp-ground-creatures (github.com/nesleykent/exiva-xp)' };
const BATCH_SIZE = 50;

const NOISE = new Set([
  'aoe', 'basement', 'beginner', 'beginners', 'boss', 'bottom', 'box', 'boxes',
  'boxing', 'central', 'east', 'entrance', 'first', 'floor', 'full', 'half',
  'lap', 'left', 'lower', 'north', 'only', 'profit', 'right', 'rune', 'runes',
  'sanguine', 'single', 'south', 'stage', 'stealth', 'surface', 'target', 'task',
  'upper', 'west', 'with', 'without',
]);

const PHRASES = new Map([
  ['ab', "ab'dendriel"],
  // Player shorthand for the prey itself — expanding it lets the evidence
  // check see the creature the label is actually naming.
  ['dt', 'dark torturer'],
  ['dts', 'dark torturer'],
  ['feru', 'ferumbras'],
  ['ankh', 'ankrahmun'],
  ['kazo', 'kazordoon'],
  ['lb', 'liberty bay'],
  ['mosl', 'mother scarabs lair'],
  ['mota', 'museum tibian arts'],
  ['ph', 'port hope'],
  ['poi', 'pits inferno'],
  ['rosh', 'roshamuul'],
  ['rosha', 'roshamuul'],
  ['yala', 'yalahar'],
  // Players write the werecreature hunts as "Were" — expanding it lets the
  // evidence check see the Werewolf/Werebear the label means.
  ['were', 'werewolf'],
]);

const PAGE_RULES = [
  [/\bnibelor crystal spiders?\b/i, 'Nibelor Ice Cave'],
  [/\b(?:giant spiders?.*(?:port hope|ph)|(?:port hope|ph).*giant spiders?)\b/i, 'Spider Caves'],
  [/\b(?:tarantulas?.*(?:port hope|ph)|(?:port hope|ph).*tarantulas?)\b/i, 'Tiquanda/Tarantula Caves'],
  [/\b(?:yalahar.*elv|elv.*yalahar)\b/i, 'Foreigner Quarter/Elves'],
  [/\b(?:corym.*(?:port hope|ph)|(?:port hope|ph).*corym)\b/i, 'Tiquanda Corym Cave'],
  [/\bpirates? yalahar\b/i, 'Foreigner Quarter'],
  [/\byalahar dragons?\b/i, 'Arena and Zoo Quarter'],
  [/\b(?:mutated humans?|bog raiders?).*yalahar|yalahar.*(?:mutated humans?|bog raiders?)\b/i, 'Alchemist Quarter'],
  [/\b(?:hive surface|inner hive|hive stage ?[23])\b/i, 'The Hive'],
  [/\b(?:wyrms?.*(?:liberty bay|lb)|(?:liberty bay|lb).*wyrms?)\b/i, 'Vandura Wyrm Cave'],
  [/\bcarlin cults?\b/i, 'Forbidden Temple (Carlin)'],
  [/\bnightmare scions? krailos\b/i, 'Krailos Ruins'],
  [/\b(?:edron heroes?|old fortress heroes?)\b/i, 'Old Fortress'],
  [/\bravenous lava lurkers?\b/i, 'Gnome Deep Hub'],
  [/\boramond west\b/i, 'Oramond/Western Plains'],
  [/\bdark faun cave\b/i, 'Feyrist Meadows'],
  [/\b(?:lizard chosens?|lizard city)\b/i, 'Razachai'],
  [/\bbarkless\b/i, 'Barkless Cult Trial Zone'],
  [/\b(?:edron.*were|werecreatures? edron)\b/i, 'Edron Lycanthropes Cave'],
  [/\boramond mino/i, 'Oramond Minotaur Camp'],
  [/\bdeeplings? library\b/i, 'Fiehonja'],
  [/\byalahar grim reapers?\b/i, 'Cemetery Quarter'],
  [/\bwerehyaenas?\b/i, 'Hyaena Lairs'],
  [/\b(?:draken walls?|wote .*draken)\b/i, 'Razachai/Inner Sanctum'],
  [/\bwerelions?\b/i, 'Lion Sanctum'],
  [/\bcandia nibblemaws?\b/i, 'Chocolate Mines'],
  [/\bdiremaw task area\b/i, 'Gnome Deep Hub'],
  [/\boramond wildlife raid|wildlife raid/i, 'Oramond Marshes'],
  [/\bgazer spectres?\b/i, 'Haunted Temple'],
  [/\bburster spectres?\b/i, 'Haunted Tomb'],
  [/\bripper spectres?\b/i, 'Buried Cathedral'],
  [/\bmarapur turtles?|foam stalkers?\b/i, 'Great Pearl Fan Reef'],
  [/\b(?:marapur )?nagas?\b/i, 'Temple of the Moon Goddess'],
  [/\boskayaat werecrocodiles?|werecrocodiles?/i, 'Murky Caverns'],
  [/\boskayaat weretigers?|weretigers?/i, 'Oskayaat Undercity'],
  // Floating Savants and Furies are in The Extension Site, not the museum
  // proper — the Museum of Tibian Arts article lists animated exhibits and
  // Goldhanded Cultists, neither of which is what these grounds hunt.
  [/\b(?:floating savants?|mota fury)\b/i, 'The Extension Site'],
  [/\b(?:flimsy|flimsies).*venore|venore.*(?:flimsy|flimsies)/i, 'Brain Grounds'],
  [/\b(?:flimsy|flimsies).*(?:port hope|ph)|(?:port hope|ph).*(?:flimsy|flimsies)/i, 'Netherworld'],
  [/\bazzilon walls?\b/i, 'Azzilon Castle'],
  [/\btemple of the sun and sea\b/i, 'Temple of the Moon Goddess'],
  [/\bferu(?:mbras)?.*plague|plague.*feru/i, 'Grounds of Plague'],
  [/\bferu(?:mbras)?.*pumin|pumin.*feru/i, 'Grounds of Deceit'],
  [/\bferu(?:mbras)?.*(?:infernatil|mazoran)|(?:infernatil|mazoran).*feru/i, 'Grounds of Fire'],
  [/\bferu(?:mbras)?.*(?:undead dragon)|undead dragon.*feru/i, 'Grounds of Undeath'],
  // The seal rooms were crossed over. Grounds of Destruction is the one with
  // the Juggernauts (with Destroyer, Fury, Vexclaw, Hellflayer); the Dark
  // Torturers are in Grounds of Damnation. Grounds of Despair holds Spectres
  // and Hands of Cursed Fate, neither of which either ground hunts.
  [/\bferu(?:mbras)?.*juggernaut|juggernaut.*feru/i, 'Grounds of Destruction'],
  [/\bferu(?:mbras)?.*(?:dt|dark torturer)|(?:dt|dark torturer).*feru/i, 'Grounds of Damnation'],
  [/\bferu(?:mbras)? way\b/i, 'Ferumbras Citadel'],
  [/\braubritters? castle\b/i, 'Stag Bastion'],
  [/\btrue asuras?\b/i, 'Asura Vaults'],
  [/\bmammoths?.*svargrond/i, 'Formorgar Glacier/Mammoths'],
  // Putrid Mummies are in Caverna Exanima (Darashia); Horestis Tomb does not
  // list one at all — owner-reported.
  [/\bputrid mummy\b/i, 'Caverna Exanima'],
  [/\b(?:edron )?orc cults?\b/i, 'Edron Orc Cave'],
  // Crypt Warrior lives in Bounac; Kilmaresh Catacombs has the Crypt *Warden*.
  // Different creature, different city (Thais vs Issavi) — owner-reported.
  [/\bcrypt warriors?\b/i, 'Bounac'],
  [/\bfalcons?(?: eagle)?\b/i, 'Falcon Bastion'],
  [/\bissavi ogres?\b/i, 'Kilmaresh Mountains'],
  [/\bissavi.*(?:sphinx|crypt warden)|(?:sphinx|crypt warden).*issavi/i, 'Kilmaresh Catacombs'],
  [/\bissavi sur(?:face|afce)\b/i, 'Kilmaresh Central Steppe'],
  [/\bnimmersatt/i, "Nimmersatt's Breeding Ground"],
  [/\bingol\b/i, 'Podzilla'],
  [/\bstonerefiners?\b/i, 'Corym Mines'],
  [/\bterramites? darashia\b/i, 'Darama Terramite Cave'],
  [/\bcormaya dwarf/i, 'Cormaya Dwarf Cave'],
  [/\bedron earth elementals?\b/i, 'Edron Earth Elemental Cave'],
  [/\bgargoyle cave meriana|meriana gargoyle cave/i, 'Meriana Gargoyle Cave'],
  [/\bupper spike\b/i, 'Upper Spike'],
  [/\bwater elementals?.*(?:port hope|ph)|(?:port hope|ph).*water elementals?/i, 'Tiquanda/Water Elemental Cave'],
  [/\b(?:krailos surface|krailos ogres?)\b/i, 'Krailos Steppe'],
  [/\boramond fury\b/i, 'Oramond Fury Dungeon'],
  // No "Oramond Catacombs" article exists; the hunt is the deep Oramond
  // Dungeon under Rathleton (Destroyer, Grim Reaper, Dark Torturer, Juggernaut).
  [/\boramond catacombs?\b/i, 'Oramond Dungeon'],
  [/\b(?:darashia dragon lords?|dragon lords? darashia)\b/i, "Kha'zeel Dragon Lairs/Kha'labal"],
  [/\b(?:poi dragon lords?|dragon lords? poi)\b/i, 'Pits of Inferno Dragon Lair'],
  [/\brotworms? liberty bay\b/i, 'Vandura Rotworm Cave'],
  // Owner-reported. Chor lists a Crocodile and sits in Port Hope, but the
  // Port Hope crocodile hunt is the Tiquanda cave; Crocodile lives in twenty
  // places, so "has one" was never enough to identify a spot.
  [/\bcrocodiles?.*(?:port hope|ph)|(?:port hope|ph).*crocodiles?/i, 'Tiquanda/Reptile and Crustacean Caves'],
  // The Yalahar cultists (Novice/Acolyte/Adept/Enlightened of the Cult) are in
  // the Magician Quarter's Research Centre — the Cult Cave is Liberty Bay's.
  [/\b(?:yalahar cults?|cults? yalahar)\b/i, 'Magician Quarter/Research Centre'],
];

const BROAD_PAGE_TITLES = new Set([
  'Alchemist Quarter',
  'Bounac',
  'Arena and Zoo Quarter',
  'Banuta',
  'Cemetery Quarter',
  'Drefia',
  'Ferumbras Citadel',
  "Kha'zeel Dragon Lairs/Kha'labal",
  'Laguna Islands',
  'Museum of Tibian Arts',
  'Razachai',
  'Talahu',
  'Vengoth',
]);

const AMBIGUOUS_SUBAREAS = [
  /\bdeeper banuta\b.*(?:bottom|-[68]\b)/i,
  /\bedron vampire crypt\b.*-[34]\b/i,
  /\bmother of scarabs lair\b.*-\d/i,
  /^prison -[123]$/i,
  /^ingol (?:surface\/|-?[1-5])/i,
];

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };

/** Articles head their floors in words — "Second Floor" is the ground's -2. */
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10 };

function distinguishingNumber(value) {
  const digit = String(value).match(/(?:^|\s)(?:warzone\s+|chapter\s+)?-?(\d+)(?:\b|\/)/i);
  if (digit) return Number(digit[1]);
  const roman = String(value).match(/\b(?:warzone|chapter|world)\s*:?\s*(i{1,3}|iv|v|vi{0,3}|ix)\b/i);
  if (roman) return ROMAN[roman[1].toLowerCase()];
  const ordinal = String(value).match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i);
  return ordinal ? ORDINALS[ordinal[1].toLowerCase()] : null;
}

function readJson(name) {
  return JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
}

function words(value) {
  const prepared = String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]s\b/g, '')
    .replace(/\b-?\d+\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const out = [];
  for (const raw of prepared.split(/\s+/).filter(Boolean)) {
    const expanded = PHRASES.get(raw)?.split(' ') || [raw];
    for (let word of expanded) {
      if (NOISE.has(word)) continue;
      if (word.endsWith('ies') && word.length > 4) word = `${word.slice(0, -3)}y`;
      else if (word.endsWith('s') && !word.endsWith('ss') && word.length > 4) word = word.slice(0, -1);
      out.push(word);
    }
  }
  return [...new Set(out)];
}

function titleScore(groundName, title) {
  const target = words(groundName);
  const candidate = words(title);
  if (!target.length || !candidate.length) return 0;
  const a = new Set(target);
  const b = new Set(candidate);
  const shared = target.filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  const coverage = shared / Math.min(a.size, b.size);
  const jaccard = shared / union;
  const exact = target.join(' ') === candidate.join(' ');
  return exact ? 1 : coverage * 0.7 + jaccard * 0.3;
}

const OPPOSITE_QUALIFIERS = [
  ['upper', 'lower'],
  ['north', 'south'],
  ['east', 'west'],
  ['fire', 'ice'],
];

function qualifierConflict(groundName, title) {
  const ground = new Set(fold(groundName).split(' '));
  const page = new Set(fold(title).split(' '));
  return OPPOSITE_QUALIFIERS.some(([a, b]) =>
    (ground.has(a) && page.has(b)) || (ground.has(b) && page.has(a)));
}

function explicitCreatureHints(groundName, codex, roster) {
  const singularGround = fold(groundName).split(' ').map(depluralize).join(' ');
  const direct = codex.creatures.filter((creature) =>
    new RegExp(`(?:^| )${creature.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`).test(singularGround));
  if (!direct.length) return [];
  const keys = direct.map((creature) => creature.key);
  return roster.filter((name) => {
    const key = fold(name);
    return keys.some((hint) => key === hint || key.startsWith(`${hint} `));
  });
}

async function wiki(params) {
  const url = `${WIKI}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return res.json();
      lastError = new Error(`${res.status} ${res.statusText}`);
      if (res.status !== 429 && res.status < 500) break;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
  }
  throw new Error(`${url} → ${lastError?.message || 'request failed'}`);
}

/**
 * Last resort: ask TibiaWiki's own search for the ground, the way a player
 * would. Local labels borrow nicknames and abbreviations that appear nowhere
 * in an article title, so token matching can't reach them — but the wiki's
 * full-text index has read the article bodies, where those nicknames usually
 * do appear. Hits are narrowed to the Hunting Places catalogue, and every
 * survivor still has to clear the same evidence gate as any other pairing,
 * so a search hit is a candidate and never a conclusion.
 */
async function searchHuntingPlaces(name, pages) {
  const query = name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const body = await wiki({ action: 'query', list: 'search', srsearch: `${query} hunting place`, srlimit: '15' });
  return (body.query?.search || []).map((hit) => hit.title).filter((title) => pages.has(title));
}

async function huntingPlaceTitles() {
  const titles = [];
  let cmcontinue = null;
  do {
    const body = await wiki({
      action: 'query',
      list: 'categorymembers',
      cmtitle: CATEGORY,
      cmnamespace: '0',
      cmlimit: '500',
      ...(cmcontinue ? { cmcontinue } : {}),
    });
    titles.push(...(body.query?.categorymembers || []).map((page) => page.title));
    cmcontinue = body.continue?.cmcontinue || null;
  } while (cmcontinue);
  return titles.filter((title) => title !== 'Hunting Places');
}

async function pageWikitext(titles) {
  const pages = new Map();
  for (let offset = 0; offset < titles.length; offset += BATCH_SIZE) {
    const batch = titles.slice(offset, offset + BATCH_SIZE);
    const body = await wiki({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: batch.join('|'),
    });
    for (const page of body.query?.pages || []) {
      const text = page.revisions?.[0]?.slots?.main?.content;
      if (text) pages.set(page.title, text);
    }
    console.log(`Fetched ${Math.min(offset + BATCH_SIZE, titles.length)}/${titles.length} TibiaWiki hunting places…`);
  }
  return pages;
}

function templateBlocks(wikitext) {
  const blocks = [];
  const startPattern = /\{\{\s*Creature\s*List\b/gi;
  for (const match of wikitext.matchAll(startPattern)) {
    let depth = 0;
    for (let i = match.index; i < wikitext.length - 1; i += 1) {
      const pair = wikitext.slice(i, i + 2);
      if (pair === '{{') { depth += 1; i += 1; }
      else if (pair === '}}') {
        depth -= 1;
        i += 1;
        if (depth === 0) {
          blocks.push({ start: match.index, text: wikitext.slice(match.index, i + 1) });
          break;
        }
      }
    }
  }
  return blocks;
}

function cleanCreature(value) {
  return value
    .replace(/<!--.*?-->/gs, '')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/\{\{!\}\}/g, '|')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\}\}\s*$/g, '')
    .trim();
}

/** Captions that describe the overworld around a hunt, not the hunt itself. */
const AMBIENT_CONTEXT = /\bsurface\b|\bsurroundings?\b|\boutside\b|\babove ground\b|\bentrance\b/i;

/** Size/age modifiers that sit in front of the genus in a creature name. */
const CREATURE_MODIFIERS = new Set(['young', 'adult', 'elder', 'lesser', 'greater', 'massive',
  'mean', 'ancient', 'giant', 'small', 'large', 'baby', 'juvenile', 'war']);

/** Rank and role words shared across creatures — never identifying on their own. */
const GENERIC_RANKS = new Set(['warrior', 'archer', 'scout', 'mage', 'magician', 'knight',
  'priest', 'priestess', 'acolyte', 'assassin', 'vizier', 'guard', 'brute', 'savage', 'shaman',
  'novice', 'adept', 'master', 'swordmaster', 'lord', 'warlock', 'hunter', 'commander',
  'soldier', 'executioner', 'henchman', 'servant', 'champion', 'worker', 'queen', 'king']);

/**
 * Does this ground label name this creature? Either the full name is spelled
 * out, or the label carries a word distinctive enough to identify it.
 *
 * Tibia builds creature names as genus + rank, but the genus is not always
 * first: "Naga Warrior" leads with it, "Novice of the Cult" ends with it. So
 * rank words are discarded and any surviving word counts, which is what lets
 * "Coryms Port Hope" reach a Corym Charlatan and "Yalahar Cults" reach the
 * Novice/Adept/Enlightened of the Cult. Dropping ranks cannot make two
 * different creatures collide dangerously — Crypt Warrior and Crypt Warden
 * both reduce to "crypt" — because the spelled-out veto in pairingEvidence
 * still requires the exact creature to be present.
 */
function labelNamesCreature(label, creatureName) {
  const parts = words(creatureName);
  if (!parts.length) return false;
  if (parts.every((word) => label.has(word))) return true;
  const distinctive = parts.filter((word) => word.length >= 4
    && !CREATURE_MODIFIERS.has(word) && !GENERIC_RANKS.has(word));
  return distinctive.some((word) => label.has(word));
}

/**
 * The hunting place's own city — the area a ground actually sits in.
 * `Infobox Hunt` states it outright, which is what makes it trustworthy:
 * access.json has to guess from a Geography article's `near` links instead,
 * and that is how Oramond Catacombs came to read "Cormaya" (Rathleton) and
 * Marapur Nagas "Roshamuul" (Marapur).
 */
function huntCity(wikitext) {
  if (!/\{\{Infobox[_ ]Hunt/i.test(wikitext)) return null;
  const raw = wikitext.match(/\|\s*city\s*=\s*([^\n|}]*)/i)?.[1];
  const city = (raw || '')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
  return city || null;
}

function listContext(wikitext, block) {
  const headings = [...wikitext.slice(0, block.start).matchAll(/^\s*(={2,4})\s*(.*?)\s*\1\s*$/gm)];
  const heading = headings.at(-1)?.[2] || '';
  const caption = block.text.match(/\|\s*caption\s*=\s*([^|\n}]+)/i)?.[1]?.trim() || '';
  return `${heading} ${caption}`.trim();
}

function namesFromBlock(block, codex) {
  const names = new Set();
  for (const part of block.text.split(/\n\s*\|/).slice(1)) {
    const value = cleanCreature(part);
    if (!value || /^type\s*=|^collapsed\s*=|^title\s*=/i.test(value)) continue;
    const name = value.split('|')[0].trim();
    if (!name || name.includes('=')) continue;
    const hit = codex.identify(name.replace(/\s+\(Creature\)$/i, ''));
    if (hit?.grade >= 0.97) names.add(hit.creature.name);
  }
  return [...names];
}

function creatureList(wikitext, codex, groundName = '') {
  const lists = templateBlocks(wikitext)
    .map((block) => ({ context: listContext(wikitext, block), names: namesFromBlock(block, codex) }))
    .filter((list) => list.names.length);
  let selected = lists;
  // Set when a rule or a prey-naming caption picked the sub-area outright.
  let explicit = false;
  if (lists.length > 1) {
    // The Hive has two "Outside" lists and only the ground floor is the
    // surface hunt — the Small Towers hold Kollos, Spidris and the Overseer.
    const special = /\bhive surface\b/i.test(groundName)
      ? lists.filter((list) => /ground floor outside/i.test(list.context))
      : /\binner hive stage ?2\b/i.test(groundName)
        ? lists.filter((list) => /\btowers?\b/i.test(list.context) && !/western tower underground/i.test(list.context))
        : /\bbanuta apes?|\bapes banuta\b/i.test(groundName)
          ? lists.filter((list) => /inside banuta|floor -[12]/i.test(list.context))
          : [];
    const groundNumber = distinguishingNumber(groundName);
    const contextNumbers = new Set(lists.map((list) => distinguishingNumber(list.context)).filter((n) => n != null));
    const numbered = groundNumber != null && contextNumbers.size > 1
      ? lists.filter((list) => distinguishingNumber(list.context) === groundNumber)
      : [];
    const keywords = words(groundName).filter((word) => ['earth', 'energy', 'fire', 'ice'].includes(word));
    const sectioned = keywords.length
      ? lists.filter((list) => keywords.some((word) => words(list.context).includes(word)))
      : [];
    /**
     * Most cave/tomb articles open with the overworld fauna standing above
     * the entrance — "Surface Creatures", "Surroundings", "Outside". Keeping
     * those alongside the real roster is how a rotworm cave came to advertise
     * butterflies, parrots, flamingos and seagulls. Drop them whenever the
     * article also has a non-ambient list, unless the ground itself is the
     * surface hunt ("Hive Surface", "Issavi Surface", "Krailos Surface").
     */
    const nonBoss = lists.filter((list) => !/\bboss\b/i.test(list.context));
    const wantsSurface = /\bsurface\b|\boutside\b|\bsurroundings?\b/i.test(groundName);
    const grounded = nonBoss.filter((list) => !AMBIENT_CONTEXT.test(list.context));
    /**
     * A surface hunt wants the surface lists, not every list. "Feyrist
     * Surface" is the day and night meadow, not the nightmare cave below it,
     * and "Hive Surface" is the ground floor outside, not the Kollos and
     * Spidris within. Falling back to everything only hid the distinction.
     */
    const surfaceLists = nonBoss.filter((list) => AMBIENT_CONTEXT.test(list.context));
    const regular = wantsSurface
      ? (surfaceLists.length ? surfaceLists : nonBoss)
      : (grounded.length ? grounded : nonBoss);
    /**
     * A caption naming the ground's own prey is the most precise signal an
     * article offers: "Forbidden Lands' Behemoth cave creatures" is exactly
     * the Behemoth hunt, while the ground-level list beside it is sixteen
     * animals that happen to share the region.
     */
    const labelWords = new Set(words(groundName));
    /**
     * Words that identify the prey itself, taken from the creatures the label
     * names. A caption carrying one of these points at the exact sub-area:
     * "Forbidden Lands' Behemoth cave creatures" is the Behemoth hunt, while
     * "ground level creatures" beside it is sixteen animals sharing a region.
     * Matching on any shared caption word was too loose — both captions
     * mention "Forbidden Lands".
     */
    const preyWords = new Set(nonBoss
      .flatMap((list) => list.names)
      .filter((name) => labelNamesCreature(labelWords, name))
      .flatMap((name) => words(name))
      .filter((word) => labelWords.has(word)));
    const captioned = preyWords.size
      ? nonBoss.filter((list) => list.context
        && words(list.context).some((word) => preyWords.has(word)))
      : [];

    // `special` stays ahead of it: a hand-written rule already knows which
    // sub-area a ground means, and "Hive Surface" must not be lured into the
    // inner hive by a caption that also says "hive".
    if (special.length) { selected = special; explicit = true; }
    else if (captioned.length && captioned.length < nonBoss.length) { selected = captioned; explicit = true; }
    else if (numbered.length) selected = numbered;
    else if (sectioned.length) selected = sectioned;
    else if (regular.length) selected = regular;
  }

  /**
   * The ambient filter is about incidental fauna, not about outdoors. Some
   * articles caption a genuine sub-area of the hunt "…, surface" — Vengoth's
   * Haunted Treelings live in "Vengoth, surface" — and dropping it deleted
   * the one creature the ground is named after, which then read as a wrong
   * pairing. A list holding named prey is never ambient, whatever its caption.
   */
  if (groundName && !explicit) {
    const label = new Set(words(groundName));
    const chosen = new Set(selected);
    const already = new Set(selected.flatMap((list) => list.names));
    const havePrey = [...already].some((name) => labelNamesCreature(label, name));
    // Only rescue prey that is actually missing. Restoring unconditionally
    // dragged the inner hive back into "Hive Surface", because Hive Overseer
    // answers to the same "hive" the label uses.
    const restored = havePrey ? [] : lists.filter((list) => !chosen.has(list)
      && list.names.some((name) => labelNamesCreature(label, name)));
    if (restored.length) selected = [...selected, ...restored];
  }

  const names = new Set(selected.flatMap((list) => list.names));
  if (!names.size) {
    const intro = wikitext
      .replace(/\{\{Infobox[\s\S]*?\n\}\}\s*/i, '')
      .split(/\n==/)[0];
    for (const match of intro.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) {
      const hit = codex.identify(match[1].trim().replace(/\s+\(Creature\)$/i, ''));
      if (hit?.grade >= 0.97) names.add(hit.creature.name);
    }
  }
  return [...names];
}

/**
 * Grammatical filler in article titles — "The Hive" is the hive, and
 * "Grounds of Plague" is the plague seal players call "Feru Plague".
 */
const STOPWORDS = new Set(['the', 'of', 'and', 'a', 'an', 'at', 'in', 'on', 'ground', 'grounds']);

/** Lowest recommended level the article gives for any vocation. */
function huntLevel(wikitext) {
  const levels = ['lvlknights', 'lvlpaladins', 'lvlmages']
    .map((key) => Number(wikitext.match(new RegExp(`\\|\\s*${key}\\s*=\\s*(\\d+)`, 'i'))?.[1]))
    .filter((n) => Number.isFinite(n) && n > 0);
  return levels.length ? Math.min(...levels) : null;
}

/**
 * Does this pairing survive evidence, or is it just a name that looked right?
 *
 * Nothing here trusts similarity. `strong` is the gate — a pairing is only
 * kept when the ground label names a creature the article actually lists, or
 * spells out the article's own title. City and level only corroborate; they
 * can raise confidence in a pairing but can never establish one, because
 * every ground in a region shares a city and plenty share a level bracket.
 *
 * The Cyclopedia check is the useful one: bestiary.json's `locations` string
 * is written by CipSoft, not by the wiki editors who wrote the article, so
 * when it independently places those creatures here the pairing has two
 * unrelated sources agreeing. That is what "Cobras" fails — the snake `Cobra`
 * is listed in the Pharaoh Tombs, never in the Cobra Bastion.
 */
function pairingEvidence(groundName, title, wikitext, creatures, groundLevel, bestiaryLocations, codex, articleCreatures = creatures) {
  const label = new Set(words(groundName));
  const reasons = [];
  let points = 0;
  let strong = false;

  /**
   * A hard veto, checked before anything else. When the label spells out a
   * specific creature in full — "Crypt Warriors" is exactly `Crypt Warrior` —
   * the article has to list that creature, or this is the wrong place no
   * matter how well the rest scores. Genus matching alone let "Crypt
   * Warriors" pair with Kilmaresh Catacombs on the shared word "crypt", when
   * that article holds the Crypt *Warden* and the real hunt is Bounac.
   * Single-word names are exempt: a label saying "Elves" should not be forced
   * to find a plain `Elf` in a list of Elf Scouts and Elf Arcanists.
   */
  const spelledOut = codex.creatures.filter((creature) => {
    const parts = words(creature.name);
    return parts.length >= 2 && parts.every((word) => label.has(word));
  });
  const missing = spelledOut.filter((creature) => !creatures.includes(creature.name));
  if (spelledOut.length && missing.length === spelledOut.length) {
    return { points: 0, strong: false, city: huntCity(wikitext), level: huntLevel(wikitext),
      reasons: [`names ${missing.map((c) => c.name).join('/')}, absent from this article`] };
  }

  const titleWords = words(title).filter((word) => !STOPWORDS.has(word));
  if (titleWords.length && titleWords.every((word) => label.has(word))) {
    points += 3 + titleWords.length;
    strong = true;
    reasons.push(`title:${title}`);
  }

  /**
   * Tibia names creatures genus-first — "Naga Warrior", "Corym Charlatan",
   * "Elf Scout" — and a ground label names the genus, not the rank ("Nagas",
   * "Coryms", "Elves Yalahar"). So the genus word counts, not just a full
   * name match; requiring every word refused pairings that were right.
   * Size/age modifiers are skipped, since "Young Goanna" is a goanna.
   */
  const named = articleCreatures.filter((name) => labelNamesCreature(label, name));
  if (named.length) {
    points += 3 + named.length;
    strong = true;
    reasons.push(`named:${named.join('/')}`);
  }

  const city = huntCity(wikitext);
  if (city && words(city).length && words(city).every((word) => label.has(word))) {
    points += 2;
    reasons.push(`city:${city}`);
  }

  const level = huntLevel(wikitext);
  if (groundLevel != null && level != null) {
    const gap = Math.abs(groundLevel - level);
    if (gap <= 60) { points += 2; reasons.push('level'); }
    else if (gap > 300) { points -= 2; reasons.push('level-far'); }
  }

  const corroborated = creatures.filter((name) => (bestiaryLocations.get(name) || [])
    .some((where) => {
      const parts = words(where);
      return parts.length && titleWords.length && parts.every((word) => titleWords.includes(word));
    }));
  const cityAgrees = reasons.some((r) => r.startsWith('city:'));
  const levelAgrees = reasons.includes('level');
  if (corroborated.length) {
    points += 2;
    reasons.push(`cyclopedia:${corroborated.length}`);
    /**
     * No shared name, but three sources agree anyway: CipSoft places several
     * of the article's creatures at this very place, and the ground's own
     * city or level bracket lines up with the article's. That is corroboration
     * rather than coincidence, and it is the only thing standing behind
     * grounds whose local label shares no word with the wiki title — "Issavi
     * Surface" for Kilmaresh Central Steppe, "Feyrist Surface" for Feyrist
     * Meadows. A single stray creature never qualifies.
     */
    if (corroborated.length >= 3 && (cityAgrees || levelAgrees)) {
      strong = true;
      reasons.push('corroborated');
    }
  }

  return { points, strong, reasons, city, level };
}

/**
 * Resolve a ground from where the Cyclopedia says its prey lives.
 *
 * This is the strongest signal available and it needs no name similarity at
 * all: the label names a creature, `bestiary.json` says which places that
 * creature inhabits, and one of those places is a Hunting Place article. Two
 * sources, neither derived from the other. It is how "Putrid Mummy" reaches
 * Caverna Exanima and "Feru DT" reaches Grounds of Damnation without anyone
 * hand-writing a rule.
 *
 * When the label names several creatures, only places common to all of them
 * count — "Rotworms Liberty Bay" should not match every cave with a rotworm.
 * A location naming more than one article, or none, resolves nothing.
 */
function resolveByCyclopedia(ground, pages, codex, bestiaryLocations, titleIndex) {
  const label = new Set(words(ground.name));
  const named = codex.creatures.filter((creature) => labelNamesCreature(label, creature.name));
  if (!named.length || named.length > 6) return null;

  const perCreature = named.map((creature) => new Set(bestiaryLocations.get(creature.name) || []));
  if (perCreature.some((places) => places.size === 0)) return null;
  const shared = [...perCreature[0]].filter((place) => perCreature.every((places) => places.has(place)));
  if (!shared.length) return null;

  const titles = [...new Set(shared.map((place) => titleIndex.get(fold(place))).filter(Boolean))];
  if (titles.length !== 1) return null;

  const title = titles[0];
  if (!pages.has(title) || !creatureList(pages.get(title), codex, ground.name).length) return null;
  return { title, method: 'cyclopedia-location', score: 1 };
}

function resolvePage(ground, pages, access, codex, bestiaryLocations, titleIndex) {
  const ruleTitle = PAGE_RULES.find(([pattern]) => pattern.test(ground.name))?.[1];
  if (ruleTitle && pages.has(ruleTitle) && creatureList(pages.get(ruleTitle), codex, ground.name).length) {
    return { title: ruleTitle, method: 'curated-alias', score: titleScore(ground.name, ruleTitle) };
  }

  // Ahead of the access cache and title ranking: those are name heuristics,
  // this is two independent sources agreeing on where the prey lives.
  const byPrey = resolveByCyclopedia(ground, pages, codex, bestiaryLocations, titleIndex);
  if (byPrey) return byPrey;

  const accessTitle = access[ground.slug]?.wikiTitle;
  const groundNumber = distinguishingNumber(ground.name);
  const accessNumber = distinguishingNumber(accessTitle || '');
  const numberConflict = groundNumber != null && accessNumber != null && groundNumber !== accessNumber;
  if (!numberConflict && !qualifierConflict(ground.name, accessTitle || '')
      && accessTitle && pages.has(accessTitle) && creatureList(pages.get(accessTitle), codex, ground.name).length) {
    return { title: accessTitle, method: 'access-cache', score: 1 };
  }

  const ranked = [...pages.keys()]
    .map((title) => ({ title, score: titleScore(ground.name, title) }))
    .filter((row) => {
      const titleNumber = distinguishingNumber(row.title);
      return !qualifierConflict(ground.name, row.title)
        && !(groundNumber != null && titleNumber != null && groundNumber !== titleNumber);
    })
    .filter((row) => row.score >= 0.74 && creatureList(pages.get(row.title), codex, ground.name).length)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const best = ranked[0];
  if (!best) return null;
  const margin = best.score - (ranked[1]?.score || 0);
  if (best.score < 0.9 && margin < 0.12) return null;
  return { ...best, method: slug(ground.name) === slug(best.title) ? 'exact-title' : 'strong-title' };
}

const grounds = normalizeGrounds(readJson('grounds.json')).directory;
const access = readJson('access.json').grounds || {};
const codex = new Codex(readJson('bestiary.json'));
const titles = await huntingPlaceTitles();
const pages = await pageWikitext(titles);
const rosters = {};
const unresolved = [];
const refused = [];

/** CipSoft's own location strings — an source independent of the wiki article. */
/** Cyclopedia location string → the Hunting Place article of that name. */
const titleIndex = new Map([...pages.keys()].map((title) => [fold(title), title]));

const bestiaryLocations = new Map(readJson('bestiary.json').data
  .map((c) => [c.name, String(c.locations || '').split(',').map((p) => p.trim()).filter(Boolean)]));

for (const ground of grounds) {
  if (AMBIGUOUS_SUBAREAS.some((pattern) => pattern.test(ground.name))) {
    unresolved.push(ground.name);
    continue;
  }
  /** Roster + evidence for one candidate article, ready to accept or reject. */
  const consider = (title, method) => {
    const full = creatureList(pages.get(title), codex, ground.name);
    let creatures = full;
    const hints = explicitCreatureHints(ground.name, codex, creatures);
    if (BROAD_PAGE_TITLES.has(title) && hints.length) creatures = hints;
    if (/oramond west \(no quara raid\)/i.test(ground.name)) {
      creatures = creatures.filter((name) => !/^Quara /i.test(name));
    }
    // Evidence is judged against the article's own full roster, never the
    // narrowed one: a broad page trimmed to the named prey must not lose the
    // very creature that proves the pairing.
    const evidence = pairingEvidence(ground.name, title, pages.get(title),
      creatures, ground.entryLevel ?? null, bestiaryLocations, codex, full);
    return { title, method, creatures, evidence };
  };

  const match = resolvePage(ground, pages, access, codex, bestiaryLocations, titleIndex);
  let candidate = match ? consider(match.title, match.method) : null;

  // Nothing local worked, or what did failed its evidence: ask the wiki's own
  // search and let the best evidenced hit stand in.
  if (!candidate || !candidate.evidence.strong || candidate.evidence.points <= 0) {
    const hits = await searchHuntingPlaces(ground.name, pages);
    /**
     * Search hits are held to a harder standard than a local match: they must
     * name a creature the article lists, or the article's own title, and may
     * not lean on the three-source corroboration shortcut. Full-text search
     * happily returns any large article in the right region, and corroboration
     * alone waved several of them through — Crocodiles Port Hope matched Chor
     * (no crocodile in it), Edron Heroes matched the Edron Dragon Lair, and
     * Cults Yalahar matched a temple in Ankrahmun. A search result is a lead,
     * so it has to name its evidence outright.
     */
    const searched = hits.map((title) => consider(title, 'wiki-search'))
      .filter((row) => row.creatures.length && row.evidence.points > 0
        && row.evidence.reasons.some((r) => r.startsWith('title:')
          // A creature that lives almost everywhere cannot identify a spot.
          // Crocodile is in twenty places, so "this article has a Crocodile"
          // matched Chor for a hunt that belongs in the Tiquanda caves; only
          // a reasonably location-specific creature counts as identification.
          || (r.startsWith('named:') && r.slice(6).split('/')
            .some((name) => (bestiaryLocations.get(name) || []).length <= 8))))
      .sort((a, b) => b.evidence.points - a.evidence.points);
    // A tie between two equally-evidenced articles identifies neither.
    if (searched.length && !(searched[1] && searched[1].evidence.points === searched[0].evidence.points)) {
      candidate = searched[0];
    }
  }

  if (!candidate) {
    unresolved.push(ground.name);
    continue;
  }
  const { creatures, evidence } = candidate;
  if (!evidence.strong || evidence.points <= 0) {
    // A pairing nothing corroborates is a guess, and a guessed roster reads
    // exactly like a real one. Drop it: no creature list beats a wrong one.
    refused.push({ name: ground.name, title: candidate.title, method: candidate.method, reasons: evidence.reasons });
    unresolved.push(ground.name);
    continue;
  }

  rosters[ground.slug] = {
    creatures,
    city: evidence.city,
    wikiTitle: candidate.title,
    wikiUrl: `https://tibia.fandom.com/wiki/${encodeURIComponent(candidate.title.replace(/ /g, '_'))}`,
    match: candidate.method,
    evidence: evidence.reasons,
  };
}

const output = {
  source: 'tibia.fandom.com Category:Hunting Places — Infobox Hunt city + non-ambient CreatureList rosters',
  builtAt: new Date().toISOString(),
  grounds: rosters,
};

if (!process.argv.includes('--dry-run')) {
  writeFileSync(new URL('../data/ground-creatures.json', import.meta.url), `${JSON.stringify(output, null, 1)}\n`);
}

console.log(`Resolved ${Object.keys(rosters).length}/${grounds.length} grounds; ${unresolved.length} unresolved.`);
console.log(`  with a city: ${Object.values(rosters).filter((r) => r.city).length}`);
console.log(`\nRefused for want of evidence (${refused.length}) — a name matched, nothing corroborated it:`);
for (const row of refused) {
  console.log(`  - ${row.name}  →  ${row.title} [${row.method}]${row.reasons.length ? `  only: ${row.reasons.join(', ')}` : '  no signal at all'}`);
}
console.log(`\nUnresolved (${unresolved.length}):`);
console.log(unresolved.map((name) => `  - ${name}`).join('\n'));
