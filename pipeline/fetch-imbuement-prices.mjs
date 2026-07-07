/**
 * TibiaMarket price prefill for the imbuement calculator — the phase
 * `assets/js/data/imbuement-prices.js` deferred ("manual-input phase only").
 *
 * Fetches current Gentebra market prices for Gold Token and every item the
 * imbuement calculator prices, from TibiaMarket's public `item_history`
 * endpoint (api.tibiamarket.top — the same one github.com/nesleykent/
 * tibia-warzones-schedule's fetch_item_history.py uses, same request shape
 * and bearer token). Writes data/imbuement-prices.json as
 * { [world]: { [itemSlug]: { price, source, updatedAt } } }; the client
 * layers manual localStorage overrides on top per assets/js/pages/tools.js.
 *
 * Run by .github/workflows/fetch-imbuement-prices.yml, or locally:
 *   node pipeline/fetch-imbuement-prices.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { IMBUEMENTS, GOLD_TOKEN_ITEM } from '../assets/js/engine/imbuements.js';
import { IMBUEMENT_MARKET_IDS } from './imbuement-market-ids.mjs';

const WORLD = 'Gentebra';
const API = 'https://api.tibiamarket.top/item_history';
// Same bundled fallback token the sister project ships publicly (its own
// anonymous read token for tibiamarket.top) — override with
// TIBIA_MARKET_TOKEN if the owner ever issues a dedicated one.
const TOKEN = process.env.TIBIA_MARKET_TOKEN || [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJzdWIiOiJ3ZWJzaXRlIiwiaWF0IjoxNzA2Mzc2MTM1LCJleHAiOjI0ODM5NzYxMzV9',
  'MrRgQJyNb5rlNmdsD3oyzG3ZugVeeeF8uFNElfWUOyI',
].join('.');
const PRICES_PATH = new URL('../data/imbuement-prices.json', import.meta.url);
const RATE_LIMIT_DELAY_MS = 3000;
const FRESH_WITHIN_MS = 4 * 60 * 60 * 1000; // skip a refetch under 4h old, per item

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (path, fallback) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
};
const writeJson = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`);

const headers = {
  Accept: 'application/json',
  'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
  Authorization: `Bearer ${TOKEN}`,
  Origin: 'https://www.tibiamarket.top',
  Referer: 'https://www.tibiamarket.top/',
  'User-Agent': 'exiva-xp-price-tracker (github.com/nesleykent/exiva-xp)',
};

async function fetchHistory(itemId, attempt = 1) {
  const url = `${API}?${new URLSearchParams({ server: WORLD, item_id: itemId, start_days_ago: 2, end_days_ago: -1 })}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt <= 4) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 15) * 1000 * attempt);
      return fetchHistory(itemId, attempt + 1);
    }
    throw new Error(`${res.status} for item ${itemId}`);
  }
  return res.json();
}

/** The price a buyer would pay right now: cheapest active sell offer today, else today's average sell. */
function currentBuyPrice(history) {
  const latest = Array.isArray(history) ? history.at(-1) : null;
  if (!latest) return null;
  if (Number.isFinite(latest.day_lowest_sell) && latest.day_lowest_sell > 0) return latest.day_lowest_sell;
  if (Number.isFinite(latest.day_average_sell) && latest.day_average_sell > 0) return Math.round(latest.day_average_sell);
  return null;
}

const items = new Map([[GOLD_TOKEN_ITEM, 'Gold Token']]);
for (const imb of IMBUEMENTS) {
  for (const tierId of ['basic', 'intricate', 'powerful']) {
    for (const it of imb.tiers[tierId].items) items.set(it.itemId, it.name);
  }
}

const store = readJson(PRICES_PATH, {});
store[WORLD] ||= {};
const now = new Date();
let fetched = 0;
let skippedFresh = 0;
let missingId = 0;
let failed = 0;

for (const [slug, name] of items) {
  const marketId = IMBUEMENT_MARKET_IDS[slug];
  if (!marketId) { missingId++; console.error(`${slug}: no TibiaMarket item_id pinned`); continue; }

  const existing = store[WORLD][slug];
  if (existing?.updatedAt && now - new Date(existing.updatedAt) < FRESH_WITHIN_MS) {
    skippedFresh++;
    continue;
  }

  try {
    const history = await fetchHistory(marketId);
    const price = currentBuyPrice(history);
    if (price != null) {
      store[WORLD][slug] = { price, source: 'tibiamarket', updatedAt: now.toISOString() };
      console.log(`${name}: ${price} gp`);
    } else {
      console.log(`${name}: no recent trades on ${WORLD}`);
    }
    fetched++;
  } catch (err) {
    failed++;
    console.error(`${name}: ${err.message}`);
  }
  await sleep(RATE_LIMIT_DELAY_MS);
}

writeJson(PRICES_PATH, store);

if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, `commit-message=data: imbuement prices for ${WORLD} (${new Date().toISOString().slice(0, 10)})\n`);
}

console.log(`Done: ${fetched} fetched, ${skippedFresh} skipped (fresh), ${missingId} missing item_id, ${failed} failed.`);
