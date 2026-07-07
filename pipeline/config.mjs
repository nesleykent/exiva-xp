/**
 * Reads config.ini so the tracked character isn't hardcoded across every
 * pipeline script. Minimal INI (line-based `[section]` + `key = value`,
 * `;`/`#` comments) — no dependency pulled in for it since the project
 * ships zero dependencies by design.
 */

import { readFileSync } from 'node:fs';

function parseIni(text) {
  const sections = {};
  let section = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) { section = sectionMatch[1].trim(); sections[section] = {}; continue; }
    const kv = line.match(/^([^=]+)=(.*)$/);
    if (kv && section) sections[section][kv[1].trim()] = kv[2].trim();
  }
  return sections;
}

const CONFIG_PATH = new URL('../config.ini', import.meta.url);
const ini = parseIni(readFileSync(CONFIG_PATH, 'utf8'));

if (!ini.character?.name || !ini.character?.world || !ini.character?.vocation) {
  throw new Error('config.ini must define [character] name, world and vocation');
}

export const CHARACTER = {
  name: ini.character.name,
  world: ini.character.world,
  vocation: ini.character.vocation,
};
