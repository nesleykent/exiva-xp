/**
 * Browser-side reader for the repo-root config.ini — same source of truth
 * pipeline/config.mjs uses, so the tracked character's name isn't
 * hardcoded twice. Fetched as plain text (no build step in this project)
 * and parsed with the same minimal INI rules as the Node loader.
 *
 * Only `name` lives in config.ini; world isn't, since the browser already
 * gets the pipeline-resolved value from data/character.json (`profile.world`)
 * wherever it renders one — this is purely the last-resort fallback for
 * before that file exists (e.g. a fresh fork's first deploy).
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

const FALLBACK_NAME = 'the tracked character';
const FALLBACK_WORLD = 'Tibia';
let cached = null;

/** { name, world } — name from config.ini; world is a last-resort placeholder until data/character.json exists. */
export async function loadConfig(prefix = '') {
  if (cached) return cached;
  try {
    const res = await fetch(`${prefix}config.ini`);
    if (!res.ok) throw new Error(`config.ini → HTTP ${res.status}`);
    const ini = parseIni(await res.text());
    cached = { name: ini.character?.name || FALLBACK_NAME, world: FALLBACK_WORLD };
  } catch {
    cached = { name: FALLBACK_NAME, world: FALLBACK_WORLD };
  }
  return cached;
}
