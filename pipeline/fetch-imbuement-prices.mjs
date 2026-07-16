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
import { pathToFileURL } from 'node:url';
import { IMBUEMENTS, GOLD_TOKEN_ITEM } from '../assets/js/engine/imbuements.js';
import { IMBUEMENT_MARKET_IDS } from './imbuement-market-ids.mjs';
import { CHARACTER } from './config.mjs';

const { world: WORLD } = CHARACTER;
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
// Matches fetch_item_history.py's tested default — going faster trips
// TibiaMarket's rate limit, and each 429 then costs a silent 15s+ backoff
// that's far more expensive than just spacing requests out up front.
const RATE_LIMIT_DELAY_MS = 6000;
const FRESH_WITHIN_MS = 4 * 60 * 60 * 1000; // skip a refetch under 4h old, per item
const HISTORY_WINDOW_DAYS = 30;

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
  const url = `${API}?${new URLSearchParams({ server: WORLD, item_id: itemId, start_days_ago: HISTORY_WINDOW_DAYS, end_days_ago: -1 })}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt <= 4) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const backoffMs = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 15) * 1000 * attempt;
      console.error(`item ${itemId}: ${res.status}, retrying in ${Math.round(backoffMs / 1000)}s (attempt ${attempt})`);
      await sleep(backoffMs);
      return fetchHistory(itemId, attempt + 1);
    }
    throw new Error(`${res.status} for item ${itemId}`);
  }
  return res.json();
}

/** Newest usable buyer-side observation, with its exact market timestamp and basis. */
export function currentBuyPrice(history) {
  if (!Array.isArray(history)) return null;
  for (let index = history.length - 1; index >= 0; index--) {
    const row = history[index];
    const observedAt = Number.isFinite(row?.time) ? new Date(row.time * 1000).toISOString() : null;
    if (row?.is_full_data && Number.isFinite(row.sell_offer) && row.sell_offer > 0) {
      return { price: row.sell_offer, observedAt, basis: 'active-sell-offer' };
    }
    if (Number.isFinite(row?.day_lowest_sell) && row.day_lowest_sell > 0) {
      return { price: row.day_lowest_sell, observedAt, basis: 'daily-lowest-sell' };
    }
    if (Number.isFinite(row?.day_average_sell) && row.day_average_sell > 0) {
      return { price: Math.round(row.day_average_sell), observedAt, basis: 'daily-average-sell' };
    }
  }
  return null;
}

async function main() {
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
      const observation = currentBuyPrice(history);
      if (observation) {
        store[WORLD][slug] = {
          price: observation.price,
          source: 'tibiamarket',
          basis: observation.basis,
          observedAt: observation.observedAt,
          updatedAt: now.toISOString(),
        };
        console.log(`${name}: ${observation.price} gp (${observation.basis})`);
      } else {
        console.log(`${name}: no sell observation in the last ${HISTORY_WINDOW_DAYS} days on ${WORLD}`);
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
