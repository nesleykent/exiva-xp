/**
 * Ground access requirements and area — best-effort extraction from
 * TibiaWiki. There is no structured API for either, so this heuristically
 * resolves each curated ground to its TibiaWiki article and reads:
 *  - the infobox's `city` field, or else the first `near` wikilink, as the
 *    ground's broader area (e.g. "Ankrahmun" for Cobra Bastion);
 *  - the intro paragraphs, pattern-matched for a minimum level, a linked
 *    Quest name, and a Premium Account mention.
 *
 * Many curated names are "Creature(s) Location" or "Location Creature(s)",
 * where only one word is a real place — e.g. "Elder Wyrms Drefia" only
 * resolves because "Drefia" is a real page. Whole-phrase search scores that
 * badly (1 shared word out of 3), so candidates also include each individual
 * significant word tried as its own exact-title search. Since more than one
 * word can produce an exact title hit (and the first one isn't necessarily
 * the right one — "Wyrms" is a real page too, but the wrong one), every
 * candidate is actually fetched and only accepted if its page yields a real
 * signal; a title match whose page has nothing usable is skipped in favour
 * of the next candidate rather than accepted blindly.
 *
 * This is inherently fuzzy: a ground is only written to data/access.json
 * when at least one signal (area, level, quest, premium or note) was
 * found, every entry carries the wiki page it came from, and the UI must
 * present this as "unverified — check in-game", never as authoritative.
 * Re-run any time; it always rebuilds from scratch.
 *
 *   node pipeline/enrich-access.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeGrounds } from '../assets/js/data/sources.js';

const WIKI = 'https://tibia.fandom.com/api.php';
const CONCURRENCY = 8;
const UA = { 'User-Agent': 'exiva-xp-access (github.com/nesleykent/exiva-xp)' };

const NOISE_WORDS = new Set(['profit', 'task', 'only', 'left', 'right', 'upper', 'lower',
  'north', 'south', 'east', 'west', 'central', 'with', 'without', 'floor', 'basement',
  'surface', 'bottom', 'boss', 'team', 'party', 'boosted', 'stealth', 'ring', 'runes',
  'rune', 'single', 'target', 'exori', 'aoe', 'boxing', 'boxes', 'first', 'half', 'full']);

/** Verified game-specific abbreviations tibiapal uses in ground names. Kept
 * as one token even when the expansion has a space, so "PH" → "port hope"
 * is tried as a phrase, not split into "port" and "hope" separately. */
const ABBREVIATIONS = {
  ph: 'port hope', lb: 'liberty bay', yala: 'yalahar', rosh: 'roshamuul', rosha: 'roshamuul',
  ab: "ab'dendriel",
};

/** Cleaned search tokens for a curated ground name — noise stripped,
 * abbreviations expanded, multi-word expansions kept as one token. */
function tokens(name) {
  return name
    .replace(/\(.*?\)/g, ' ')
    .replace(/-\s*\d+/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NOISE_WORDS.has(w.toLowerCase()))
    .map((w) => ABBREVIATIONS[w.toLowerCase()] || w);
}

/** Word-overlap score against the cleaned ground name — opensearch's own
 * ranking often prefers a same-named creature or unrelated cave over the
 * actual named area, so re-rank its results ourselves. */
function overlapScore(target, title) {
  const a = new Set(target.toLowerCase().split(/\s+/).filter(Boolean));
  const b = new Set(title.toLowerCase().replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean));
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / Math.max(a.size, b.size);
}

async function opensearch(query) {
  const url = `${WIKI}?action=opensearch&search=${encodeURIComponent(query)}&limit=6&namespace=0&format=json`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return [];
  const [, titles] = await res.json();
  return titles || [];
}

/** Ordered, de-duplicated candidate titles: whole-phrase best match first
 * (if plausible), then an exact-title hit for each individual word. */
async function candidateTitles(name) {
  const seen = new Set();
  const out = [];
  const add = (t) => { if (t && !seen.has(t)) { seen.add(t); out.push(t); } };

  const phrase = tokens(name).join(' ') || name;
  const titles = await opensearch(phrase);
  const target = phrase.toLowerCase();
  add(titles.find((t) => t.toLowerCase() === target));
  if (titles.length) {
    const ranked = [...titles].sort((a, b) => overlapScore(phrase, b) - overlapScore(phrase, a));
    if (overlapScore(phrase, ranked[0]) >= 0.5) add(ranked[0]);
  }

  for (const word of tokens(name).filter((w) => w.length >= 4)) {
    const wordTitles = await opensearch(word);
    add(wordTitles.find((t) => t.toLowerCase() === word.toLowerCase()));
  }
  return out;
}

/** Only these infobox types describe a place; Creature/NPC/Item pages that
 * happen to share a word with a ground name (e.g. "Nightmare" the monster,
 * matched from "Nightmare Scions Krailos") must never be read as one — their
 * lore text can coincidentally contain a "Quest" link or a level mention
 * that has nothing to do with reaching the ground. */
const PLACE_INFOBOXES = new Set(['hunt', 'geography']);

function infoboxType(wikitext) {
  const m = wikitext.match(/\{\{Infobox\s+(\w+)/i);
  return m ? m[1].toLowerCase() : null;
}

/** Parse `| field = value` lines out of the leading {{Infobox ...}} block. */
function infoboxFields(wikitext) {
  const block = wikitext.match(/\{\{Infobox[^\n]*\n([\s\S]*?)\n\}\}/i);
  const fields = {};
  if (!block) return fields;
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\|\s*(\w+)\s*=\s*(.*)$/);
    if (m && m[2].trim()) fields[m[1].toLowerCase()] = m[2].trim();
  }
  return fields;
}

/** First wikilink target in a "near" field: "[[Port Hope]] [[Banuta]], ..." → "Port Hope". */
function firstLink(text) {
  const m = text?.match(/\[\[([^\]|]+)/);
  return m ? m[1].trim() : null;
}

function introText(wikitext) {
  return wikitext
    .replace(/\{\{Infobox[\s\S]*?\n\}\}\n?/i, '')
    .replace(/\{\{[^{}]*\}\}/g, '') // drop remaining simple templates
    .split(/\n==/)[0]; // stop at the first section heading
}

function plainText(wikitext) {
  return wikitext
    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSignals(wikitext) {
  const intro = introText(wikitext);

  let level = null;
  let m = intro.match(/level\s+(\d{2,4})\s*(?:or higher|or above|and above|\+)/i)
    || intro.match(/(?:requires?|must be)\s+(?:at least\s+)?level\s+(\d{2,4})/i);
  if (m) level = +m[1];

  // Use the wikilink's actual page title, never its display alias — aliases
  // are often generic ("permission", "task to kill them") while the target
  // is guaranteed quest-shaped by this regex.
  let quest = null;
  m = intro.match(/\[\[([^\]|]*?Quest)(?:\|[^\]]+)?\]\]/i);
  if (m) quest = m[1].trim();

  const premium = /premium account/i.test(intro);

  let note = null;
  const sentences = plainText(intro).match(/[^.!?]+[.!?]/g) || [];
  const signalSentence = sentences.find((s) => /\b(access|quest|level \d|premium|require)\b/i.test(s));
  if (signalSentence) note = signalSentence.trim().slice(0, 260);

  return { level, quest, premium: premium || null, note };
}

/** The ground's broader area — infobox `city`, else the first `near` link
 * (skipping a self-reference: some pages list themselves in `near`). */
function extractArea(fields, pageTitle) {
  if (fields.city) return plainText(fields.city);
  const near = fields.near ? firstLink(fields.near) : null;
  return near && near.toLowerCase() !== pageTitle.toLowerCase() ? near : null;
}

/** Try each candidate page in order; accept the first that yields a signal. */
/** @returns {{entry: object|null, hadCandidates: boolean}} */
async function resolveGround(ground) {
  const candidates = await candidateTitles(ground.name);
  for (const title of candidates) {
    const res = await fetch(`${WIKI}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json`, { headers: UA });
    if (!res.ok) continue;
    const body = await res.json();
    const wikitext = body?.parse?.wikitext?.['*'];
    if (!wikitext) continue;
    if (!PLACE_INFOBOXES.has(infoboxType(wikitext))) continue;

    const signals = extractSignals(wikitext);
    const area = extractArea(infoboxFields(wikitext), title);
    if (!area && !signals.level && !signals.quest && !signals.premium && !signals.note) continue;

    return {
      hadCandidates: true,
      entry: {
        ...signals,
        area,
        wikiTitle: title,
        wikiUrl: `https://tibia.fandom.com/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      },
    };
  }
  return { hadCandidates: candidates.length > 0, entry: null };
}

const grounds = normalizeGrounds(
  JSON.parse(readFileSync(new URL('../data/grounds.json', import.meta.url), 'utf8')),
).directory;

console.log(`Resolving access notes for ${grounds.length} grounds…`);

const result = {};
let matched = 0;
let withSignal = 0;
const queue = [...grounds];

await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const ground = queue.shift();
    try {
      const { hadCandidates, entry } = await resolveGround(ground);
      if (hadCandidates) matched += 1;
      if (entry) { result[ground.slug] = entry; withSignal += 1; }
    } catch (err) {
      console.error(`  ${ground.name}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}));

writeFileSync(new URL('../data/access.json', import.meta.url), JSON.stringify({
  source: 'tibia.fandom.com (best-effort extraction, unverified — always check the linked wiki page in-game)',
  builtAt: new Date().toISOString(),
  grounds: result,
}, null, 1));

const withArea = Object.values(result).filter((r) => r.area).length;
console.log(`Matched a wiki page for ${matched}/${grounds.length} grounds; ${withSignal} carry a signal (${withArea} with an area).`);
