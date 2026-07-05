/**
 * 15-minute online sampler for Night'Flyn.
 *
 * This records what the public world endpoint can honestly observe:
 * whether the character appears in Gentebra's online_players list at the
 * polling slot, and the level/vocation shown there when online. It is not
 * continuous telemetry; each online sample represents one 15-minute slot.
 *
 * Run by .github/workflows/track-online.yml, or locally:
 *   node pipeline/track-online.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const NAME = "Night'Flyn";
const WORLD = 'Gentebra';
const API = 'https://api.tibiadata.com/v4';
// ONLINE_LOG_PATH override exists for dry-run testing against a copy —
// synthetic samples must never enter the real observation log.
const OUT_PATH = process.env.ONLINE_LOG_PATH
  ? new URL(process.env.ONLINE_LOG_PATH, `file://${process.cwd()}/`)
  : new URL('../data/character-online.json', import.meta.url);
const CADENCE_MINUTES = 15;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (path, fallback) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
};
const writeJson = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`);

function slotFor(date = new Date()) {
  const slot = new Date(date);
  slot.setUTCMinutes(Math.floor(slot.getUTCMinutes() / CADENCE_MINUTES) * CADENCE_MINUTES, 0, 0);
  return slot.toISOString();
}

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': 'exiva-xp-online-tracker (github.com/nesleykent/exiva-xp)' } });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt <= 5) {
      await sleep((res.status === 429 ? 15_000 : 2_000) * attempt);
      return fetchJson(url, attempt + 1);
    }
    throw new Error(`${res.status} for ${url}`);
  }
  return res.json();
}

const now = new Date();
const data = await fetchJson(`${API}/world/${encodeURIComponent(WORLD)}`);
const world = data?.world;
if (!world?.online_players) throw new Error(`TibiaData returned no online_players list for ${WORLD}`);

const match = world.online_players.find((p) => p.name.toLowerCase() === NAME.toLowerCase()) || null;
const sample = {
  slot: slotFor(now),
  sampledAt: now.toISOString(),
  online: !!match,
  level: match?.level ?? null,
  vocation: match?.vocation ?? null,
  worldPlayersOnline: world.players_online ?? null,
  worldStatus: world.status || null,
};

const log = readJson(OUT_PATH, {
  character: NAME,
  world: WORLD,
  cadenceMinutes: CADENCE_MINUTES,
  source: `TibiaData ${API}/world/${WORLD} online_players`,
  updatedAt: null,
  days: [],
  levelUps: [],
  samples: [],
});

log.character = NAME;
log.world = WORLD;
log.cadenceMinutes = CADENCE_MINUTES;
log.source = `TibiaData ${API}/world/${WORLD} online_players`;
log.updatedAt = sample.sampledAt;
log.days ||= [];
log.levelUps ||= [];

const previousLatest = log.samples.at(-1) || null;

const ix = log.samples.findIndex((row) => row.slot === sample.slot);
if (ix >= 0) log.samples[ix] = sample;
else log.samples.push(sample);
log.samples.sort((a, b) => a.slot.localeCompare(b.slot));

// ---- level-ups: capture from consecutive observed online levels, before
// any raw sample is compacted away. Keyed by slot+level for idempotency.
const levelUpKeys = new Set(log.levelUps.map((u) => `${u.slot}|${u.level}`));
let previousLevel = null;
for (const s of log.samples) {
  if (!s.online || !Number.isFinite(s.level)) continue;
  if (previousLevel != null && s.level > previousLevel && !levelUpKeys.has(`${s.slot}|${s.level}`)) {
    log.levelUps.push({ slot: s.slot, from: previousLevel, level: s.level });
    levelUpKeys.add(`${s.slot}|${s.level}`);
  }
  previousLevel = s.level;
}
log.levelUps.sort((a, b) => a.slot.localeCompare(b.slot));

// ---- compaction: raw samples are kept for the trailing window only; each
// fully-elapsed older UTC day collapses to one summary row. Bounds the file
// (~96 samples/day forever otherwise) while keeping the full observation
// record: `observed` says how many slots were actually sampled that day —
// absence of observation is never rewritten as "offline".
const RAW_WINDOW_DAYS = 14;
const cutoff = new Date(now);
cutoff.setUTCHours(0, 0, 0, 0);
cutoff.setUTCDate(cutoff.getUTCDate() - (RAW_WINDOW_DAYS - 1));
const cutoffIso = cutoff.toISOString();

const daysByDate = new Map(log.days.map((d) => [d.date, d]));
const keep = [];
for (const s of log.samples) {
  if (s.slot >= cutoffIso) { keep.push(s); continue; }
  const date = s.slot.slice(0, 10);
  const day = daysByDate.get(date) || { date, observed: 0, online: 0, minutes: 0, maxLevel: null };
  day.observed += 1;
  if (s.online) {
    day.online += 1;
    day.minutes = day.online * CADENCE_MINUTES;
    if (Number.isFinite(s.level)) day.maxLevel = Math.max(day.maxLevel ?? 0, s.level);
  }
  daysByDate.set(date, day);
}
log.samples = keep;
log.days = [...daysByDate.values()].sort((a, b) => a.date.localeCompare(b.date));

writeJson(OUT_PATH, log);

// ---- deploy policy: a Pages build every 15 minutes is waste. Redeploy only
// when the sampled state is worth showing promptly: she is online, she just
// went offline (closes a session), a level-up landed, or a new UTC day began
// (keeps the offline-stretch dashboard no more than a day stale).
const newDay = previousLatest && previousLatest.slot.slice(0, 10) !== sample.slot.slice(0, 10);
const deploy = sample.online || previousLatest?.online === true || !previousLatest || newDay;
if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
}

console.log(`${sample.online ? 'online' : 'offline'} sample for ${NAME} at ${sample.slot}${sample.level ? `, level ${sample.level}` : ''}; ${world.players_online} players online in ${WORLD}. ${log.samples.length} raw sample(s), ${log.days.length} compacted day(s), ${log.levelUps.length} observed level-up(s), deploy=${deploy}.`);
