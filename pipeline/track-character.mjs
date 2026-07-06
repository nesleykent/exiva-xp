/**
 * Daily character tracker for Night'Flyn — the same mechanism as
 * tibia-xp-history's get-xp-data.mjs (github.com/mathiasbynens/tibia-xp-history):
 * the TibiaData v4 highscores expose each ranked character's exact
 * experience, so a crawl of the world+vocation pages until the character
 * appears yields {rank, level, experience}. The history key follows Tibia's
 * daily boundary: 10:00 Europe/Berlin server save time (CET or CEST). A
 * snapshot of page 1 guards against recording the same upstream day twice.
 *
 * Extended beyond the reference: skill highscore categories (magic level,
 * charm points, boss points, achievements, loyalty, fishing, Drome) are
 * tracked the same way, and the character profile (achievement points,
 * last login, account details) comes from the character endpoint. Known
 * deaths are preserved from earlier imports and extended if TibiaData
 * exposes new ones.
 *
 * Run by .github/workflows/track-character.yml on the reference project's
 * schedule (03:00 UTC daily), or locally:
 *   node pipeline/track-character.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const NAME = "Night'Flyn";
const WORLD = 'Gentebra';
const VOCATION = 'druids';
// Public api.tibiadata.com keeps highscores in "restriction mode"; the dev
// instance serves them — and is what the reference project queries too.
const API = 'https://dev.tibiadata.com/v4';
const SKILL_CATEGORIES = [
  { category: 'magiclevel', valueField: 'magicLevel', rankField: 'magicLevelRank' },
  { category: 'charmpoints', valueField: 'charmPoints', rankField: 'charmPointsRank' },
  { category: 'bosspoints', valueField: 'bossPoints', rankField: 'bossPointsRank' },
  { category: 'achievements', valueField: 'achievements', rankField: 'achievementsRank' },
  { category: 'loyaltypoints', valueField: 'loyalty', rankField: 'loyaltyRank' },
  { category: 'fishing', valueField: 'fishing', rankField: 'fishingRank' },
  { category: 'drome', valueField: 'dromeScore', rankField: 'dromeScoreRank' },
];

const HISTORY_PATH = new URL('../data/character-history.json', import.meta.url);
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
const history = readJson(HISTORY_PATH, {});
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

if (snapshotUnchanged && !Object.hasOwn(history, today)) {
  throw new Error('Highscores identical to the stored snapshot — upstream has not rolled a new day yet. Try again later.');
}

// ---- skill categories (best-effort; unranked or erroring → null) ----
const skills = {};
for (const { category } of SKILL_CATEGORIES) {
  try {
    const hit = await findInHighscores(category);
    skills[category] = hit ? { rank: hit.rank, value: hit.value } : null;
    console.log(`${category}: ${hit ? `rank ${hit.rank}, value ${hit.value}` : 'not in top 1000'}`);
  } catch (err) {
    // null means "not measured today" — never carry an old value forward as
    // if it were today's reading; the history must stay honest.
    skills[category] = null;
    console.error(`${category}: ${err.message}`);
  }
  await sleep(400);
}

// ---- character profile + deaths ----
const profileData = await fetchJson(`${API}/character/${encodeURIComponent(NAME.toLowerCase())}`);
const c = profileData?.character?.character;
if (!c || c.name !== NAME) throw new Error('character endpoint returned no matching profile');

// ---- persist ----
const todayEntry = {
  rank: xp.rank,
  level: xp.level,
  experience: xp.value,
  source: 'TibiaData highscores',
};
for (const { category, valueField, rankField } of SKILL_CATEGORIES) {
  todayEntry[valueField] = skills[category]?.value ?? null;
  todayEntry[rankField] = skills[category]?.rank ?? null;
}

let changed = false;
if (JSON.stringify(history[today] || null) !== JSON.stringify(todayEntry)) {
  history[today] = todayEntry;
  writeJson(HISTORY_PATH, history);
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
  skillRanks: Object.fromEntries(SKILL_CATEGORIES.map(({ category }) => [category, skills[category]?.rank ?? null])),
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

console.log(changed
  ? `Recorded ${today}: level ${xp.level}, ${Object.keys(history).length} day(s) of history, ${knownDeaths.length} known death(s).`
  : `No data changes for ${today}: TibiaData still reports level ${xp.level}, ${xp.value} xp.`);
