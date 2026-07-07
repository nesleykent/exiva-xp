/**
 * Browser-side reader for the repo-root config.ini — same source of truth
 * pipeline/config.mjs uses, so the tracked character's name isn't
 * hardcoded twice. Fetched as plain text (no build step in this project)
 * and parsed with the same minimal INI rules as the Node loader.
 */

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

const FALLBACK = { name: "Night'Flyn", world: 'Gentebra', vocation: 'druids' };
let cached = null;

/** { name, world, vocation } from config.ini; falls back to the shipped default if unreachable. */
export async function loadConfig(prefix = '') {
  if (cached) return cached;
  try {
    const res = await fetch(`${prefix}config.ini`);
    if (!res.ok) throw new Error(`config.ini → HTTP ${res.status}`);
    const ini = parseIni(await res.text());
    cached = {
      name: ini.character?.name || FALLBACK.name,
      world: ini.character?.world || FALLBACK.world,
      vocation: ini.character?.vocation || FALLBACK.vocation,
    };
  } catch {
    cached = FALLBACK;
  }
  return cached;
}
