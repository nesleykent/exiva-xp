/**
 * Druid raw-XP stand-ins from tibiapal's legacy Mage table.
 *
 * tibiapal rebuilt its hunting tables per vocation and has only filled the
 * Druid table's "Raw exp" column for the earliest grounds — 33 of 162 rows at
 * the time of writing. The retired combined-mage table at /hunting-old still
 * carries numbers for 89 places, so until the Druid column is finished those
 * mage figures are the best available reference for a druid's grounds.
 *
 * They are NOT druid measurements. A mage row is a sorcerer-leaning number
 * from an older balance pass, so everything written here is provenance-
 * stamped and the UI must present it as a stand-in, never as tibiapal's
 * druid figure (see §3.1 of AGENTS.md — no placeholder data presented as
 * real). data/grounds.json stays the untouched capture of the live Druid
 * table; this writes a separate overlay that sources.js layers underneath
 * it, so a re-capture of grounds.json never has to be un-merged, and each
 * stand-in disappears on its own the moment tibiapal publishes a real druid
 * value for that ground.
 *
 * Matching is deliberately strict — a wrong ground is worse than a missing
 * number:
 *   - pass 1 matches raw names outright;
 *   - pass 2 matches on cleaned token sets (parentheticals, technique noise
 *     and plurals removed, tibiapal's abbreviations expanded), and only when
 *     the pairing is 1:1 in both directions;
 *   - compass directions and floor markers stay significant, so
 *     "Werehyaenas South" never inherits "Werehyaenas North", and
 *     "Ingol -1" never inherits plain "Ingol";
 *   - a negated qualifier blocks a match, so "Oramond West (No Quara Raid)"
 *     never inherits plain "Oramond West".
 * Everything it declines to match is reported, so the gaps stay visible.
 *
 * Re-run any time; it always rebuilds from scratch.
 *   node pipeline/fetch-druid-xp.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { toNumber } from '../assets/js/lib/fmt.js';

const LEGACY_URL = 'https://tibiapal.com/hunting-old';
const LIVE_URL = 'https://tibiapal.com/hunting';
const GROUNDS_PATH = new URL('../data/grounds.json', import.meta.url);
const OUT_PATH = new URL('../data/grounds-xp-legacy.json', import.meta.url);
const UA = { 'User-Agent': 'exiva-xp-druid-xp (github.com/nesleykent/exiva-xp)' };

/** tibiapal's own shorthand, same vocabulary enrich-access.mjs resolves. */
const ABBREVIATIONS = {
  ph: 'port hope', lb: 'liberty bay', yala: 'yalahar', rosh: 'roshamuul', rosha: 'roshamuul',
  dl: 'dragon lord', dls: 'dragon lord', inq: 'inquisition', mosl: 'mother of scarabs lair',
  wote: 'wrath of the emperor', poi: 'pits of inferno',
};

/**
 * Technique/qualifier words that describe HOW a place is hunted rather than
 * WHICH place it is. Compass directions and floor numbers are deliberately
 * absent — those identify distinct hunts on both tables.
 */
const NOISE = new Set(['profit', 'aoe', 'sd', 'gfb', 'avalanche', 'thunderstorm', 'stoneshower',
  'stealth', 'ring', 'sorcerer', 'druid', 'mage', 'rune', 'runes', 'exori', 'boxing', 'strike',
  'spell', 'spells', 'forked', 'glacier', 'thorn', 'thorns', 'wave', 'ice', 'strong', 'the']);

const NEGATION = /\b(no|non|without)\b/i;

const html = async (url) => {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
};

const decode = (text) => text
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

/** Rows of {level, place, xp, loot} from one `<table id=…>` on a tibiapal page. */
function readTable(page, tableId) {
  const start = page.search(new RegExp(`<table[^>]*id=["']${tableId}["']`, 'i'));
  if (start < 0) throw new Error(`table #${tableId} not found — tibiapal markup changed`);
  const end = page.indexOf('</table>', start);
  const table = page.slice(start, end < 0 ? undefined : end);
  const rows = [];
  for (const row of table.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map((c) => decode(c[1]));
    if (cells.length < 4 || /^level$/i.test(cells[0])) continue;
    const [level, place, xp, loot] = cells;
    if (!place) continue;
    rows.push({ level, place, xp, loot });
  }
  if (!rows.length) throw new Error(`table #${tableId} parsed to zero rows — tibiapal markup changed`);
  return rows;
}

/** "1.8kk" → 1800000, "-5k" → -5000, "-" / "N/A" / "" → null. */
const value = (text) => (!text || text === '-' || /^n\/?a$/i.test(text) ? null : toNumber(text));

const singular = (token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token);

/** Floor markers ("-3", "-8") identify distinct hunts and must agree. */
const floors = (name) => [...name.matchAll(/(?:^|\s)(-\d)(?=\s|$|\))/g)].map((m) => m[1]).sort().join(',');

/**
 * Comparison key: parentheticals dropped (they hold technique/vocation
 * notes on both tables), abbreviations expanded, noise removed, plurals
 * folded, tokens sorted so word order can't matter.
 */
function key(name) {
  const bare = name.replace(/\([^)]*\)/g, ' ').toLowerCase();
  const tokens = bare
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((token) => (ABBREVIATIONS[token] ? ABBREVIATIONS[token].split(' ') : [token]))
    .map(singular)
    .filter((token) => !NOISE.has(token));
  return [...new Set(tokens)].sort().join(' ');
}

const negated = (name) => NEGATION.test(name.match(/\(([^)]*)\)/)?.[1] || '');

const compatible = (a, b) => floors(a) === floors(b) && negated(a) === negated(b);

// ---------------------------------------------------------------------- run

const grounds = JSON.parse(readFileSync(GROUNDS_PATH, 'utf8'));
const [legacyPage, livePage] = await Promise.all([html(LEGACY_URL), html(LIVE_URL)]);

const legacy = readTable(legacyPage, 'hunting_table_mage');
const live = readTable(livePage, 'hunting_table_druid');
console.log(`legacy mage table: ${legacy.length} rows, ${legacy.filter((r) => value(r.xp) != null).length} with raw exp`);
console.log(`live druid table: ${live.length} rows, ${live.filter((r) => value(r.xp) != null).length} with raw exp`);

/**
 * The live Druid table is consulted rather than trusted for names: a ground
 * that has since gained a real druid number is dropped from the overlay even
 * if data/grounds.json (captured earlier) still shows it as blank. Variant
 * rows are held apart by the same floor/negation rule the matcher uses, so a
 * published "Oramond West (Quara Raid)" is not read as covering the separate
 * "(No Quara Raid)" hunt.
 */
const published = live.filter((r) => value(r.xp) != null);
const publishedFor = (ground) => published.some((r) => r.place.toLowerCase() === ground.toLowerCase()
  || (key(r.place) === key(ground) && compatible(r.place, ground)));

// Raw exp and the profit column are filled independently: a druid row can
// have one and not the other, and a legacy row is worth consulting as long
// as it carries either.
const gaps = grounds.entries.filter((e) => e.vocation === 'Druid' && (e.xpRaw == null || e.loot == null));
const donors = legacy.filter((r) => value(r.xp) != null || value(r.loot) != null);
console.log(`druid entries missing raw exp and/or profit: ${gaps.length}`);

const claims = new Map(); // legacy place → [ground entries]
const matchOf = new Map(); // ground name → legacy row
const skipped = [];

for (const gap of gaps) {
  // Per field, not per row: a druid ground can have a published raw exp and
  // still be missing its profit figure, and only the blank half is filled.
  const liveRow = publishedFor(gap.ground);
  const needs = {
    xpRaw: gap.xpRaw == null && value(liveRow?.xp) == null,
    loot: gap.loot == null && value(liveRow?.loot) == null,
  };
  if (!needs.xpRaw && !needs.loot) {
    skipped.push([gap.ground, 'tibiapal now publishes a druid value']);
    continue;
  }
  const exact = donors.filter((r) => r.place.toLowerCase() === gap.ground.toLowerCase());
  const sameName = exact.length ? exact : donors.filter((r) => key(r.place) === key(gap.ground));
  const candidates = exact.length ? exact : sameName.filter((r) => compatible(r.place, gap.ground));
  if (!candidates.length) {
    skipped.push([gap.ground, sameName.length
      ? `different hunt from "${sameName[0].place}" (floor or negated qualifier)`
      : 'no legacy mage row']);
    continue;
  }
  if (candidates.length > 1) {
    skipped.push([gap.ground, `ambiguous: ${candidates.map((c) => c.place).join(' / ')}`]);
    continue;
  }
  matchOf.set(gap.ground, { ...candidates[0], needs });
  const claimed = claims.get(candidates[0].place) || [];
  claimed.push(gap.ground);
  claims.set(candidates[0].place, claimed);
}

// A legacy row that two different druid grounds both claim identifies neither.
for (const [place, claimants] of claims) {
  if (claimants.length < 2) continue;
  for (const ground of claimants) {
    matchOf.delete(ground);
    skipped.push([ground, `shares legacy row "${place}" with ${claimants.filter((c) => c !== ground).join(', ')}`]);
  }
}

const entries = {};
for (const [ground, row] of [...matchOf].sort((a, b) => a[0].localeCompare(b[0]))) {
  const xpRaw = row.needs.xpRaw ? value(row.xp) : null;
  const loot = row.needs.loot ? value(row.loot) : null;
  if (xpRaw == null && loot == null) continue; // matched, but the legacy row was blank too
  entries[ground] = {
    ...(xpRaw != null ? { xpRaw } : {}),
    ...(loot != null ? { loot } : {}),
    from: { place: row.place, levelText: row.level, vocation: 'Mage' },
  };
}

writeFileSync(OUT_PATH, `${JSON.stringify({
  origin: LEGACY_URL,
  appliesTo: 'Druid',
  capturedAt: new Date().toISOString().slice(0, 10),
  note: 'Raw XP/h from tibiapal\'s retired combined Mage table, used only where the live Druid table has no value yet. Mage figures, not druid measurements — present as a stand-in, never as a tibiapal druid figure.',
  entries,
}, null, 1)}\n`);

const standIns = Object.entries(entries).sort((a, b) => a[0].localeCompare(b[0]));
console.log(`\nwrote ${standIns.length} stand-in row(s) to data/grounds-xp-legacy.json`
  + ` (${standIns.filter(([, e]) => e.xpRaw != null).length} raw exp,`
  + ` ${standIns.filter(([, e]) => e.loot != null).length} profit)`);
for (const [ground, entry] of standIns) {
  const fields = [entry.xpRaw != null ? `xp ${entry.xpRaw}` : null, entry.loot != null ? `profit ${entry.loot}` : null];
  console.log(`  ${ground} ← ${entry.from.place} (${entry.from.levelText}) ${fields.filter(Boolean).join(', ')}`);
}
const reasons = skipped.reduce((acc, [, reason]) => {
  const bucket = reason.startsWith("ambiguous") ? "ambiguous"
    : reason.startsWith('shares') ? 'shared legacy row' : reason;
  acc[bucket] = (acc[bucket] || 0) + 1;
  return acc;
}, {});
console.log(`\nleft blank (${skipped.length}):`);
for (const [reason, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${n} × ${reason}`);
for (const [ground, reason] of skipped.filter(([, r]) => r !== 'no legacy mage row')) {
  console.log(`  · ${ground} — ${reason}`);
}
