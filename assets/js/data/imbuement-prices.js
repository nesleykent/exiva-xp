/**
 * Manual imbuement item prices, stored per world in the browser. This is
 * the manual-input phase only — see AGENTS.md decision log: TibiaMarket API
 * prefill is a future final phase, not implemented here.
 */

const STORAGE_KEY = 'exiva:imbuement-prices';

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function writeStore(store) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
  catch { /* private browsing / quota — prices simply won't persist */ }
}

/** { itemId: { price, source: 'manual', updatedAt } } for one world. */
export function loadWorldPrices(world) {
  return readStore()[world] || {};
}

export function saveItemPrice(world, itemId, price, { confirmedZero = false } = {}) {
  const store = readStore();
  store[world] = store[world] || {};
  if (price == null || !Number.isFinite(price)) {
    delete store[world][itemId];
  } else {
    store[world][itemId] = { price, source: 'manual', confirmedZero, updatedAt: new Date().toISOString() };
  }
  writeStore(store);
  return store[world];
}

export function clearWorldPrices(world) {
  const store = readStore();
  delete store[world];
  writeStore(store);
}
