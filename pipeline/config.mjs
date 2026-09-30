/**
 * Reads config.ini so the tracked character isn't hardcoded across every
 * pipeline script — only the character NAME is configured. World and
 * vocation are resolved automatically from TibiaData, since the character
 * endpoint already reports both; hardcoding them alongside the name would
 * just be a second, driftable copy of data TibiaData already owns.
 *
 * Resolution prefers the already-tracked data/character.json (no extra
 * request on the common warm path — every scheduled run would otherwise
 * hit TibiaData purely to reconfirm a fact that basically never changes)
 * and only calls TibiaData live on cold start or a name mismatch (e.g. the
 * owner just edited config.ini to point at a different character).
 */

import { readFileSync } from 'node:fs';
import { parseIni } from '../assets/js/lib/config.js';
import { baseVocation } from '../assets/js/engine/rules.js';

const CONFIG_PATH = new URL('../config.ini', import.meta.url);
const CHARACTER_JSON_PATH = new URL('../data/character.json', import.meta.url);
// Public api.tibiadata.com keeps highscores in "restriction mode" but the
// character endpoint works fine there too — the dev instance is only
// strictly needed for highscores, kept here just for one consistent host.
const API = 'https://dev.tibiadata.com/v4';

// TibiaData's highscore URLs take a lowercase, unpromoted, plural vocation
// slug (knights/paladins/sorcerers/druids/monks); the character endpoint
// reports the promoted title (e.g. "Elder Druid").
function vocationSlug(vocationTitle) {
  const base = baseVocation(vocationTitle);
  if (!base) throw new Error(`Could not resolve a highscores vocation slug from TibiaData's "${vocationTitle}"`);
  return `${base.toLowerCase()}s`;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

async function fetchCharacterInfo(name) {
  const res = await fetch(`${API}/character/${encodeURIComponent(name.toLowerCase())}`, {
    headers: { 'User-Agent': 'exiva-xp-config (github.com/nesleykent/exiva-xp)' },
  });
  if (!res.ok) throw new Error(`${res.status} resolving "${name}" from TibiaData`);
  const c = (await res.json())?.character?.character;
  if (!c || c.name !== name) throw new Error(`TibiaData has no character profile matching "${name}"`);
  return { world: c.world, vocation: c.vocation };
}

const ini = parseIni(readFileSync(CONFIG_PATH, 'utf8'));
const name = ini.character?.name;
if (!name) throw new Error('config.ini must define [character] name');

const cached = readJson(CHARACTER_JSON_PATH);
const { world, vocation: vocationTitle } = cached?.name === name && cached.world && cached.vocation
  ? cached
  : await fetchCharacterInfo(name);

export const CHARACTER = { name, world, vocation: vocationSlug(vocationTitle) };
