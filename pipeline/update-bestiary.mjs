/**
 * Refresh data/bestiary.json from TibiaDraptor's public Cyclopedia API.
 * The endpoint is paginated and accepts POST requests; this script joins every
 * page into the single static export consumed by the browser. Current release
 * totals are pinned to the owner's SU2026 metadata so a partial or newer export
 * cannot silently replace the catalogue.
 *
 *   node pipeline/update-bestiary.mjs
 */

import { writeFileSync } from 'node:fs';

const API = 'https://tibiadraptor.com/api/v1/bestiary';
const EXPECTED = {
  release: 'Summer Update 2026',
  version: '15.30',
  date: '2026-07-21',
  creatures: 833,
  charmPoints: 28_734,
  echoWardenCharmPoints: 8_497,
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(page, attempt = 0) {
  try {
    const response = await fetch(`${API}?page=${page}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'exiva-xp-bestiary (github.com/nesleykent/exiva-xp)',
      },
      body: '{}',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.data) || !body.meta?.total) throw new Error('malformed response');
    return body;
  } catch (error) {
    if (attempt >= 3) throw error;
    await wait(800 * (2 ** attempt));
    return fetchPage(page, attempt + 1);
  }
}

const first = await fetchPage(1);
const pageCount = Number(first.meta.last_page);
const pages = [first];

for (let page = 2; page <= pageCount; page += 1) {
  pages.push(await fetchPage(page));
  console.log(`Fetched Bestiary page ${page}/${pageCount}.`);
}

const totals = new Set(pages.map((page) => Number(page.meta.total)));
if (totals.size !== 1) throw new Error('Bestiary total changed while pages were being fetched; retry.');

const creatures = pages.flatMap((page) => page.data);
const ids = new Set(creatures.map((creature) => creature.id));
const names = new Set(creatures.map((creature) => creature.name));
const total = Number(first.meta.total);

if (creatures.length !== total || ids.size !== total || names.size !== total) {
  throw new Error(`Bestiary pages are incomplete or duplicated: ${creatures.length} rows, ${ids.size} IDs, ${names.size} names, expected ${total}.`);
}
if (total !== EXPECTED.creatures
  || Number(first.viewing_total_monsters) !== EXPECTED.creatures
  || Number(first.viewing_total_points) !== EXPECTED.charmPoints
  || Number(first.viewing_total_echo_warden_charm_points) !== EXPECTED.echoWardenCharmPoints) {
  throw new Error('Bestiary totals do not match the owner-supplied SU2026 metadata; review the new release before importing it.');
}

const su2026 = creatures.filter((creature) => creature.released_in === EXPECTED.release);
if (su2026.length !== 21) throw new Error(`Expected 21 SU2026 creatures, received ${su2026.length}.`);

const pageUrl = `${API}?page=1`;
const output = {
  data: creatures,
  links: { first: pageUrl, last: pageUrl, prev: null, next: null },
  meta: {
    current_page: 1,
    from: 1,
    last_page: 1,
    links: [
      { url: null, label: '&laquo; Previous', active: false },
      { url: pageUrl, label: '1', active: true },
      { url: null, label: 'Next &raquo;', active: false },
    ],
    path: API,
    per_page: total,
    to: total,
    total,
  },
  viewing_total_points: Number(first.viewing_total_points),
  viewing_total_monsters: Number(first.viewing_total_monsters),
  user_details: first.user_details || { count: 0, points: 0 },
  viewing_total_echo_warden_charm_points: Number(first.viewing_total_echo_warden_charm_points),
  source: {
    provider: 'TibiaDraptor Cyclopedia API',
    url: API,
    fetchedAt: new Date().toISOString(),
    release: EXPECTED.release,
    version: EXPECTED.version,
    releaseDate: EXPECTED.date,
  },
};

writeFileSync(
  new URL('../data/bestiary.json', import.meta.url),
  `${JSON.stringify(output, null, 1)}\n`,
);
console.log(`Updated data/bestiary.json: ${creatures.length} creatures, ${su2026.length} from ${EXPECTED.release}.`);
