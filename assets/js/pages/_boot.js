/** Shared page bootstrap: mount chrome, load reference data and active hunt evidence. */

import { mountShell, $ } from '../shell.js';
import { backend, loadCodex, loadGrounds } from '../data/sources.js';
import { buildLedger } from '../engine/ledger.js';

export async function boot(page, { ledger = true } = {}) {
  mountShell(page);
  const stage = $('#stage');
  try {
    const [codex, grounds, hunts] = await Promise.all([
      loadCodex(), loadGrounds(), backend().read(),
    ]);
    return {
      stage,
      codex,
      grounds,
      hunts,
      table: ledger ? buildLedger(grounds.entries, hunts) : [],
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
