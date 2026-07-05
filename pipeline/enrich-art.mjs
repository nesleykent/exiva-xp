/**
 * Artwork fixer. TibiaData's own images (static.tibia.com) block hotlinking
 * — they 403 from any other origin, including GitHub Pages — so every
 * creature must be sourced from TibiaWiki (tibia.fandom.com) instead, which
 * allows it. Two passes over data/codex-extra.json:
 *  1. validate existing wiki image URLs (drop the ones that 404) and flag
 *     any static.tibia.com URL for replacement, since those never render;
 *  2. resolve File:<Name>.gif (then .png) on TibiaWiki via the MediaWiki
 *     API for every flagged creature, batched 50 titles per request.
 * Incremental and idempotent — safe to re-run any time.
 *
 *   node pipeline/enrich-art.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const WIKI = 'https://tibia.fandom.com/api.php';
const HEAD_CONCURRENCY = 12;

const slug = (s) => String(s).toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s'-]/g, ' ')
  .replace(/\s+/g, ' ').trim().replace(/['\s]+/g, '-').replace(/-+/g, '-');

const bestiary = JSON.parse(readFileSync(new URL('../data/bestiary.json', import.meta.url), 'utf8'));
const names = (bestiary.data || []).map((c) => c.name);

const extraUrl = new URL('../data/codex-extra.json', import.meta.url);
let extraFile;
try { extraFile = JSON.parse(readFileSync(extraUrl, 'utf8')); }
catch { extraFile = { source: 'api.tibiadata.com/v4', creatures: {} }; }
const extra = extraFile.creatures;

// ---- pass 1: drop dead/unusable image URLs -------------------------------
// static.tibia.com hotlink-blocks (403 from any foreign origin) — those
// URLs never render on the deployed site, so treat them as gone outright.

let dropped = 0;
for (const key of Object.keys(extra)) {
  if (extra[key]?.image?.includes('static.tibia.com')) {
    extra[key].image = null;
    dropped += 1;
  }
}
console.log(`Flagged ${dropped} tibia.com URLs (hotlink-blocked) for replacement.`);

const withWikiArt = names.filter((n) => extra[slug(n)]?.image);
console.log(`Validating ${withWikiArt.length} existing wiki image URLs…`);
let deadWiki = 0;
const queue = [...withWikiArt];
await Promise.all(Array.from({ length: HEAD_CONCURRENCY }, async () => {
  while (queue.length) {
    const name = queue.shift();
    const entry = extra[slug(name)];
    try {
      const res = await fetch(entry.image, { method: 'HEAD' });
      if (!res.ok) { entry.image = null; deadWiki += 1; }
    } catch { entry.image = null; deadWiki += 1; }
  }
}));
console.log(`  dropped ${deadWiki} dead URLs.`);

// ---- pass 2: resolve every gap from TibiaWiki ----------------------------

const missing = names.filter((n) => !extra[slug(n)]?.image);
console.log(`${missing.length} creatures need artwork; asking TibiaWiki…`);

async function resolveBatch(batch, ext) {
  const titles = batch.map((n) => `File:${n}.${ext}`).join('|');
  // no redirects=1: file redirects (variant creatures reusing a base sprite,
  // e.g. Hot Dog → Dog.gif) resolve at the imageinfo level while the page
  // title keeps the requested name, so the back-mapping stays intact.
  const url = `${WIKI}?action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'exiva-xp-art (github.com/nesleykent/exiva-xp)' } });
  if (!res.ok) throw new Error(`wiki HTTP ${res.status}`);
  const body = await res.json();

  // map returned title → original title through the "normalized" list
  const back = new Map();
  for (const n of body.query?.normalized || []) back.set(n.to, n.from);

  const found = new Map(); // creature name → url
  for (const page of Object.values(body.query?.pages || {})) {
    const url = page.imageinfo?.[0]?.url;
    if (!url) continue;
    const title = back.get(page.title) || page.title;
    const name = title.replace(/^File:/, '').replace(new RegExp(`\\.${ext}$`, 'i'), '');
    found.set(name.toLowerCase(), url);
  }
  return found;
}

/**
 * Last-resort fallback for exact-title misses: disambiguated pages
 * ("Monk" the creature → "Monk (Creature).gif") or case drift ("Mooh'tah
 * Warrior" → "Mooh'Tah Warrior.gif"). Full-text search the File namespace
 * and take the closest-titled hit.
 */
async function opensearchImage(name) {
  const url = `${WIKI}?action=opensearch&search=${encodeURIComponent(name)}&limit=10&namespace=6&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'exiva-xp-art (github.com/nesleykent/exiva-xp)' } });
  if (!res.ok) return null;
  const [, titles] = await res.json();
  const target = name.toLowerCase();
  const clean = (t) => t.replace(/^File:/, '').replace(/\.\w+$/, '').replace(/\s*\((creature|6\.0)\)\s*/i, '').toLowerCase();
  const hit = (titles || []).find((t) => clean(t) === target) || (titles || [])[0];
  if (!hit) return null;
  const info = await resolveBatch([hit.replace(/^File:/, '').replace(/\.\w+$/, '')], hit.split('.').pop());
  return info.values().next().value || null;
}

let filled = 0;
for (let i = 0; i < missing.length; i += 50) {
  const batch = missing.slice(i, i + 50);
  let found;
  try {
    found = await resolveBatch(batch, 'gif');
    const leftover = batch.filter((n) => !found.has(n.toLowerCase()));
    if (leftover.length) {
      const png = await resolveBatch(leftover, 'png');
      for (const [k, v] of png) found.set(k, v);
    }
  } catch (err) {
    console.error(`  batch ${i / 50 + 1}: ${err.message}`);
    continue;
  }

  for (const name of batch.filter((n) => !found.has(n.toLowerCase()))) {
    try {
      const url = await opensearchImage(name);
      if (url) found.set(name.toLowerCase(), url);
    } catch { /* leave missing, next run retries */ }
  }

  for (const name of batch) {
    const url = found.get(name.toLowerCase());
    if (!url) continue;
    const key = slug(name);
    if (!extra[key]) extra[key] = { image: null, loot: [] };
    extra[key].image = url;
    filled += 1;
  }
  await new Promise((r) => setTimeout(r, 300)); // be polite to the wiki
}

extraFile.artFixedAt = new Date().toISOString();
writeFileSync(extraUrl, JSON.stringify(extraFile, null, 1));

const total = names.filter((n) => extra[slug(n)]?.image).length;
const still = names.filter((n) => !extra[slug(n)]?.image);
console.log(`Filled ${filled} from TibiaWiki → ${total}/${names.length} creatures have artwork.`);
if (still.length) console.log(`Still missing: ${still.join(', ')}`);
