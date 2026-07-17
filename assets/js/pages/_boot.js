/** Shared page bootstrap: mount chrome and load only each page's declared data. */

import { mountShell, $ } from '../shell.js';
import { backend, loadCodex, loadGrounds } from '../data/sources.js';
import { buildLedger } from '../engine/ledger.js';
import { loadConfig } from '../lib/config.js';

export async function boot(page, {
  codex = false,
  grounds = false,
  hunts = false,
  config = false,
  ledger = false,
} = {}) {
  mountShell(page);
  const stage = $('#stage');
  const needsGrounds = grounds || ledger;
  const needsHunts = hunts || ledger;
  try {
    const [loadedCodex, loadedGrounds, loadedHunts, loadedConfig] = await Promise.all([
      codex ? loadCodex() : null,
      needsGrounds ? loadGrounds() : null,
      needsHunts ? backend().read() : [],
      config ? loadConfig() : null,
    ]);
    return {
      stage,
      codex: loadedCodex,
      grounds: loadedGrounds,
      hunts: loadedHunts,
      config: loadedConfig,
      table: ledger ? buildLedger(loadedGrounds.entries, loadedHunts) : [],
    };
  } catch (err) {
    stage.innerHTML = `<div class="note note-red">Could not load the datasets (${err.message}). If you opened the file directly, serve the folder over HTTP instead.</div>`;
    throw err;
  }
}

/** Query-string param, e.g. ground.html?g=cobra-bastion */
export function param(name) {
  return new URLSearchParams(location.search).get(name) || '';
}
