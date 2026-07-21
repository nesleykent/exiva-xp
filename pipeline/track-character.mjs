/**
 * Daily character tracker for the character configured in config.ini — the same mechanism as
 * tibia-xp-history's get-xp-data.mjs (github.com/mathiasbynens/tibia-xp-history):
 * the TibiaData v4 highscores expose each ranked character's exact
 * experience, so a crawl of the world+vocation pages until the character
 * appears yields {rank, level, experience}. The history key follows Tibia's
 * daily boundary: 10:00 Europe/Berlin server save time (CET or CEST). A
 * snapshot of page 1 guards against recording the same upstream day twice.
 *
 * Extended beyond the reference: every TibiaData highscore category for the
 * character is tracked in its own history file, and the character profile (achievement points,
 * last login, account details) comes from the character endpoint. Known
 * deaths are preserved from earlier imports and extended if TibiaData
 * exposes new ones.
 *
 * Run by .github/workflows/track-character.yml every hour, or locally:
 *   node pipeline/track-character.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { HIGHSCORE_CATEGORIES, TRACKED_HIGHSCORE_CATEGORIES } from '../assets/js/engine/highscores.js';
import { CHARACTER } from './config.mjs';

const { name: NAME, world: WORLD, vocation: VOCATION } = CHARACTER;
// Public api.tibiadata.com keeps highscores in "restriction mode"; the dev
// instance serves them — and is what the reference project queries too.
const API = 'https://dev.tibiadata.com/v4';
const HISTORY_PATHS = Object.fromEntries(HIGHSCORE_CATEGORIES.map(({ category }) => [
  category,
  new URL(`../data/highscores/${category}.json`, import.meta.url),
]));
const PROFILE_PATH = new URL('../data/character.json', import.meta.url);
const SNAPSHOT_PATH = new URL('../data/character-snapshot.json', import.meta.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const berlinParts = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
}).formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
const serverSaveDate = (date = new Date()) => {
  const p = berlinParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day - (p.hour < 10 ? 1 : 0))).toISOString().slice(0, 10);
};
const readJson = (path, fallback) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
};
const writeJson = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`);

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': 'exiva-xp-tracker (github.com/nesleykent/exiva-xp)' } });
  if (!res.ok) {
    // the dev instance rate-limits (429) and intermittently 5xxs under a
    // page crawl — back off and retry, harder for rate limits
    if ((res.status === 429 || res.status >= 500) && attempt <= 5) {
      await sleep((res.status === 429 ? 15_000 : 2_000) * attempt);
      return fetchJson(url, attempt + 1);
    }
    throw new Error(`${res.status} for ${url}`);
  }
  return res.json();
}

const today = serverSaveDate();
const histories = Object.fromEntries(HIGHSCORE_CATEGORIES.map(({ category }) => [
  category,
  readJson(HISTORY_PATHS[category], {}),
]));
const experienceHistory = histories.experience;
const previousProfile = readJson(PROFILE_PATH, {});

let pendingSnapshot = null;
let snapshotUnchanged = false;

/** Crawl one highscore category's pages until NAME appears; null if unranked. */
async function findInHighscores(category, { snapshotFirstPage = false } = {}) {
  for (let page = 1; page <= 20; page++) {
    const data = await fetchJson(`${API}/highscores/${WORLD}/${category}/${VOCATION}/${page}`);
    const scores = data?.highscores;
    if (!scores?.highscore_list?.length) return null;

    if (snapshotFirstPage && page === 1) {
      // The timestamp churns per-request; strip volatile fields before comparing.
      delete scores.highscore_age;
      delete data.information;
      const previous = readJson(SNAPSHOT_PATH, null);
      snapshotUnchanged = previous && JSON.stringify(previous) === JSON.stringify(data);
      // Stash rather than write: a crawl that dies mid-way must not leave a
      // snapshot that blocks its own retry. Persisted at the end of the run.
      pendingSnapshot = data;
    }

    const hit = scores.highscore_list.find((e) => e.name === NAME);
    if (hit) return { rank: hit.rank, level: hit.level, value: hit.value };
    if (page >= scores.highscore_page.total_pages) return null;
    await sleep(1200);
  }
  return null;
}

// ---- experience (the reference project's core record) ----
const xp = await findInHighscores('experience', { snapshotFirstPage: true });
if (!xp) throw new Error(`${NAME} not found in the ${WORLD} ${VOCATION} experience highscores.`);
console.log(`experience: rank ${xp.rank}, level ${xp.level}, xp ${xp.value}`);

if (snapshotUnchanged && !Object.hasOwn(experienceHistory, today)) {
  throw new Error('Highscores identical to the stored snapshot — upstream has not rolled a new day yet. Try again later.');
}

// ---- secondary highscore categories (best-effort; unranked or erroring → null) ----
const highscores = {};
for (const { category } of TRACKED_HIGHSCORE_CATEGORIES) {
  try {
    const hit = await findInHighscores(category);
    highscores[category] = hit ? { rank: hit.rank, value: hit.value } : null;
    console.log(`${category}: ${hit ? `rank ${hit.rank}, value ${hit.value}` : 'not in top 1000'}`);
  } catch (err) {
    // Leave the category unset — "not measured this run", distinct from a
    // confirmed "not in top 1000". A run's transient failure must not
    // overwrite an observation an earlier run today already recorded.
    console.error(`${category}: ${err.message}`);
  }
  await sleep(400);
}

// ---- character profile + deaths ----
const profileData = await fetchJson(`${API}/character/${encodeURIComponent(NAME.toLowerCase())}`);
const c = profileData?.character?.character;
if (!c || c.name !== NAME) throw new Error('character endpoint returned no matching profile');

// ---- persist ----
// Stamped once per day: reused across same-day reruns so an unchanged
// reading doesn't get a fresh timestamp (and false-trigger the diff below).
const capturedAt = experienceHistory[today]?.capturedAt || new Date().toISOString();
const observations = {
  experience: {
    value: xp.value,
    rank: xp.rank,
    level: xp.level,
    source: 'TibiaData highscores',
    capturedAt,
  },
};
for (const { category } of TRACKED_HIGHSCORE_CATEGORIES) {
  if (!Object.hasOwn(highscores, category)) continue;
  observations[category] = {
    value: highscores[category]?.value ?? null,
    rank: highscores[category]?.rank ?? null,
    source: 'TibiaData highscores',
  };
}

let changed = false;
for (const { category } of HIGHSCORE_CATEGORIES) {
  const observation = observations[category];
  if (!observation || JSON.stringify(histories[category][today] || null) === JSON.stringify(observation)) continue;
  histories[category][today] = observation;
  writeJson(HISTORY_PATHS[category], histories[category]);
  changed = true;
}

const knownDeaths = previousProfile.deaths || [];
const seen = new Set(knownDeaths.map((d) => d.time));
for (const d of profileData.character.deaths || []) {
  if (!seen.has(d.time)) knownDeaths.push({ time: d.time, level: d.level, reason: d.reason });
}
knownDeaths.sort((a, b) => a.time.localeCompare(b.time));

const nextProfile = {
  updatedAt: previousProfile.updatedAt || new Date().toISOString(),
  name: c.name,
  title: c.title || null,
  sex: c.sex,
  vocation: c.vocation,
  level: c.level,
  world: c.world,
  residence: c.residence,
  achievementPoints: c.achievement_points,
  lastLogin: c.last_login,
  accountStatus: c.account_status,
  accountCreated: profileData.character.account_information?.created || null,
  loyaltyTitle: profileData.character.account_information?.loyalty_title || null,
  houses: (c.houses || []).map((h) => ({ name: h.name, town: h.town, paidUntil: h.paid })),
  highscoreRanks: Object.fromEntries(HIGHSCORE_CATEGORIES.map(({ category }) => [
    category,
    category === 'experience'
      ? xp.rank
      : Object.hasOwn(highscores, category) ? highscores[category]?.rank ?? null : previousProfile.highscoreRanks?.[category] ?? null,
  ])),
  skillRanks: Object.fromEntries(TRACKED_HIGHSCORE_CATEGORIES.map(({ category }) => [
    category,
    Object.hasOwn(highscores, category) ? highscores[category]?.rank ?? null : previousProfile.skillRanks?.[category] ?? null,
  ])),
  deaths: knownDeaths,
};

const stableProfile = (profile) => {
  const { updatedAt, ...stable } = profile || {};
  return stable;
};
if (JSON.stringify(stableProfile(previousProfile)) !== JSON.stringify(stableProfile(nextProfile))) {
  nextProfile.updatedAt = new Date().toISOString();
  writeJson(PROFILE_PATH, nextProfile);
  changed = true;
}

if (pendingSnapshot && !snapshotUnchanged) {
  writeJson(SNAPSHOT_PATH, pendingSnapshot);
  changed = true;
}

if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, `commit-message=data: character snapshot for ${today}\n`);
}

console.log(changed
  ? `Recorded ${today}: level ${xp.level}, ${Object.keys(experienceHistory).length} XP day(s), ${Object.keys(observations).length} highscore category observation(s), ${knownDeaths.length} known death(s).`
  : `No data changes for ${today}: TibiaData still reports level ${xp.level}, ${xp.value} xp.`);
