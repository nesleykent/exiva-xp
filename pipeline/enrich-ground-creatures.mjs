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
  [/\b(?:floating savants?|mota fury)\b/i, 'Museum of Tibian Arts'],
  [/\b(?:flimsy|flimsies).*venore|venore.*(?:flimsy|flimsies)/i, 'Brain Grounds'],
  [/\b(?:flimsy|flimsies).*(?:port hope|ph)|(?:port hope|ph).*(?:flimsy|flimsies)/i, 'Netherworld'],
  [/\bazzilon walls?\b/i, 'Azzilon Castle'],
  [/\btemple of the sun and sea\b/i, 'Temple of the Moon Goddess'],
  [/\bferu(?:mbras)?.*plague|plague.*feru/i, 'Grounds of Plague'],
  [/\bferu(?:mbras)?.*pumin|pumin.*feru/i, 'Grounds of Deceit'],
  [/\bferu(?:mbras)?.*(?:infernatil|mazoran)|(?:infernatil|mazoran).*feru/i, 'Grounds of Fire'],
  [/\bferu(?:mbras)?.*(?:undead dragon)|undead dragon.*feru/i, 'Grounds of Undeath'],
  [/\bferu(?:mbras)?.*juggernaut|juggernaut.*feru/i, 'Grounds of Despair'],
  [/\bferu(?:mbras)?.*(?:dt|dark torturer)|(?:dt|dark torturer).*feru/i, 'Grounds of Destruction'],
  [/\bferu(?:mbras)? way\b/i, 'Ferumbras Citadel'],
  [/\braubritters? castle\b/i, 'Stag Bastion'],
  [/\btrue asuras?\b/i, 'Asura Vaults'],
  [/\bmammoths?.*svargrond/i, 'Formorgar Glacier/Mammoths'],
  [/\bputrid mummy\b/i, 'Horestis Tomb'],
  [/\b(?:edron )?orc cults?\b/i, 'Edron Orc Cave'],
  [/\bcrypt warriors?\b/i, 'Kilmaresh Catacombs'],
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
  [/\b(?:darashia dragon lords?|dragon lords? darashia)\b/i, "Kha'zeel Dragon Lairs/Kha'labal"],
  [/\b(?:poi dragon lords?|dragon lords? poi)\b/i, 'Pits of Inferno Dragon Lair'],
  [/\brotworms? liberty bay\b/i, 'Vandura Rotworm Cave'],
];

const BROAD_PAGE_TITLES = new Set([
  'Alchemist Quarter',
  'Arena and Zoo Quarter',
  'Banuta',
  'Cemetery Quarter',
  'Drefia',
  'Ferumbras Citadel',
  'Feyrist Meadows',
  "Kha'zeel Dragon Lairs/Kha'labal",
  'Laguna Islands',
  'Museum of Tibian Arts',
  'Old Fortress',
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

function distinguishingNumber(value) {
  const digit = String(value).match(/(?:^|\s)(?:warzone\s+|chapter\s+)?-?(\d+)(?:\b|\/)/i);
  if (digit) return Number(digit[1]);
  const roman = String(value).match(/\b(?:warzone|chapter|world)\s*:?\s*(i{1,3}|iv|v|vi{0,3}|ix)\b/i);
  return roman ? ROMAN[roman[1].toLowerCase()] : null;
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
  if (lists.length > 1) {
    const special = /\bhive surface\b/i.test(groundName)
      ? lists.filter((list) => /\boutside\b/i.test(list.context))
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
    const regular = !wantsSurface && grounded.length ? grounded : nonBoss;
    if (special.length) selected = special;
    else if (numbered.length) selected = numbered;
    else if (sectioned.length) selected = sectioned;
    else if (regular.length) selected = regular;
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

/** Size/age modifiers that sit in front of the genus in a creature name. */
const CREATURE_MODIFIERS = new Set(['young', 'adult', 'elder', 'lesser', 'greater', 'massive',
  'mean', 'ancient', 'giant', 'small', 'large', 'baby', 'juvenile', 'war']);

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
function pairingEvidence(groundName, title, wikitext, creatures, groundLevel, bestiaryLocations) {
  const label = new Set(words(groundName));
  const reasons = [];
  let points = 0;
  let strong = false;

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
  const named = creatures.filter((name) => {
    const parts = words(name);
    if (!parts.length) return false;
    if (parts.every((word) => label.has(word))) return true;
    const genus = parts.find((word) => !CREATURE_MODIFIERS.has(word));
    return genus && genus.length >= 4 && label.has(genus);
  });
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

function resolvePage(ground, pages, access, codex) {
  const ruleTitle = PAGE_RULES.find(([pattern]) => pattern.test(ground.name))?.[1];
  if (ruleTitle && pages.has(ruleTitle) && creatureList(pages.get(ruleTitle), codex, ground.name).length) {
    return { title: ruleTitle, method: 'curated-alias', score: titleScore(ground.name, ruleTitle) };
  }

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
const bestiaryLocations = new Map(readJson('bestiary.json').data
  .map((c) => [c.name, String(c.locations || '').split(',').map((p) => p.trim()).filter(Boolean)]));

for (const ground of grounds) {
  if (AMBIGUOUS_SUBAREAS.some((pattern) => pattern.test(ground.name))) {
    unresolved.push(ground.name);
    continue;
  }
  const match = resolvePage(ground, pages, access, codex);
  if (!match) {
    unresolved.push(ground.name);
    continue;
  }
  let creatures = creatureList(pages.get(match.title), codex, ground.name);
  const hints = explicitCreatureHints(ground.name, codex, creatures);
  if (BROAD_PAGE_TITLES.has(match.title) && hints.length) {
    creatures = hints;
  }
  if (/oramond west \(no quara raid\)/i.test(ground.name)) {
    creatures = creatures.filter((name) => !/^Quara /i.test(name));
  }
  const evidence = pairingEvidence(ground.name, match.title, pages.get(match.title),
    creatures, ground.entryLevel ?? null, bestiaryLocations);
  if (!evidence.strong || evidence.points <= 0) {
    // A pairing nothing corroborates is a guess, and a guessed roster reads
    // exactly like a real one. Drop it: no creature list beats a wrong one.
    refused.push({ name: ground.name, title: match.title, method: match.method, reasons: evidence.reasons });
    unresolved.push(ground.name);
    continue;
  }

  rosters[ground.slug] = {
    creatures,
    city: evidence.city,
    wikiTitle: match.title,
    wikiUrl: `https://tibia.fandom.com/wiki/${encodeURIComponent(match.title.replace(/ /g, '_'))}`,
    match: match.method,
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
