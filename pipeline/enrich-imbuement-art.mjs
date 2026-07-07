/**
 * Imbuement/item artwork resolver — mirrors enrich-art.mjs's approach for
 * creatures: TibiaData's own images hotlink-block, so every icon is
 * resolved from TibiaWiki (tibia.fandom.com) via the MediaWiki API instead.
 * Resolves one icon per imbuement type (e.g. "Vampirism.gif") and one per
 * unique catalogue item (e.g. "Vampire Teeth.gif"), plus the Gold Token.
 * Incremental and idempotent — safe to re-run any time.
 *
 *   node pipeline/enrich-imbuement-art.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { GOLD_TOKEN_ITEM, IMBUEMENTS } from '../assets/js/engine/imbuements.js';

const WIKI = 'https://tibia.fandom.com/api.php';
const UA = { 'User-Agent': 'exiva-xp-art (github.com/nesleykent/exiva-xp)' };

const artUrl = new URL('../data/imbuement-art.json', import.meta.url);
let art;
try { art = JSON.parse(readFileSync(artUrl, 'utf8')); }
catch { art = { source: 'tibia.fandom.com', imbuements: {}, items: {} }; }

async function resolveBatch(titles, ext) {
  const query = titles.map((t) => `File:${t}.${ext}`).join('|');
  const url = `${WIKI}?action=query&titles=${encodeURIComponent(query)}&prop=imageinfo&iiprop=url&format=json`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`wiki HTTP ${res.status}`);
  const body = await res.json();
  const back = new Map();
  for (const n of body.query?.normalized || []) back.set(n.to, n.from);
  const found = new Map();
  for (const page of Object.values(body.query?.pages || {})) {
    const pageUrl = page.imageinfo?.[0]?.url;
    if (!pageUrl) continue;
    const title = back.get(page.title) || page.title;
    const name = title.replace(/^File:/, '').replace(new RegExp(`\\.${ext}$`, 'i'), '');
    found.set(name.toLowerCase(), pageUrl);
  }
  return found;
}

async function resolveOne(name) {
  for (const ext of ['gif', 'png']) {
    const found = await resolveBatch([name], ext);
    const url = found.get(name.toLowerCase());
    if (url) return url;
  }
  return null;
}

async function validate(section) {
  let dropped = 0;
  for (const key of Object.keys(section)) {
    try {
      const res = await fetch(section[key], { method: 'HEAD' });
      if (!res.ok) { delete section[key]; dropped += 1; }
    } catch { delete section[key]; dropped += 1; }
  }
  return dropped;
}

console.log('Validating existing imbuement art URLs…');
const droppedImb = await validate(art.imbuements);
const droppedItems = await validate(art.items);
console.log(`  dropped ${droppedImb + droppedItems} dead URLs.`);

const imbNames = IMBUEMENTS.filter((i) => !art.imbuements[i.id]).map((i) => i.name);
console.log(`${imbNames.length} imbuement icons needed…`);
for (const name of imbNames) {
  const url = await resolveOne(name);
  if (url) art.imbuements[IMBUEMENTS.find((i) => i.name === name).id] = url;
  await new Promise((r) => setTimeout(r, 200));
}

const itemMap = new Map();
for (const imb of IMBUEMENTS) {
  for (const it of imb.tiers.powerful.items) itemMap.set(it.itemId, it.name);
}
itemMap.set(GOLD_TOKEN_ITEM, 'Gold Token');

const missingItems = [...itemMap].filter(([id]) => !art.items[id]);
console.log(`${missingItems.length} item icons needed…`);
for (const [id, name] of missingItems) {
  const url = await resolveOne(name);
  if (url) art.items[id] = url;
  await new Promise((r) => setTimeout(r, 200));
}

art.updatedAt = new Date().toISOString();
writeFileSync(artUrl, JSON.stringify(art, null, 1));

const stillImb = IMBUEMENTS.filter((i) => !art.imbuements[i.id]).map((i) => i.name);
const stillItems = [...itemMap].filter(([id]) => !art.items[id]).map(([, name]) => name);
console.log(`Resolved ${Object.keys(art.imbuements).length}/${IMBUEMENTS.length} imbuement icons, ${Object.keys(art.items).length}/${itemMap.size} item icons.`);
if (stillImb.length) console.log(`Still missing imbuement icons: ${stillImb.join(', ')}`);
if (stillItems.length) console.log(`Still missing item icons: ${stillItems.join(', ')}`);
