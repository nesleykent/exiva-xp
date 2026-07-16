/**
 * Data sources: dataset loaders + the hunt backend abstraction.
 * One backend interface, eight implementations, selected by `BACKEND` below.
 * Whatever the backend, a copy of every hunt is kept in this browser as the
 * player's personal logbook.
 */

import { slug, fold } from '../lib/text.js';
import { Codex, ELEMENT_CHARM } from '../engine/codex.js';

const CHARM_ELEMENT = Object.fromEntries(Object.entries(ELEMENT_CHARM).map(([el, name]) => [name, el]));
/** "Curse" alone lands on a disambiguation page — the charm's real title has a qualifier. */
const CHARM_WIKI_TITLE = { Curse: 'Curse_(Charm)' };

// ---------------------------------------------------------------- settings

export const SITE = {
  owner: 'nesleykent',
  repo: 'exiva-xp',
  issueLabel: 'hunt',
  discussionCategory: 'hunts',
};

/**
 * 'github-issues' | 'browser' | 'static' | 'github-discussions'
 * | 'supabase' | 'firebase' | 'cloudflare-d1' | 'sqlite'
 */
export const BACKEND = 'browser';

/** REST backends (supabase / firebase / cloudflare-d1 / sqlite). */
export const REST = { base: '', key: '', table: 'hunts' };

const FILES = {
  codex: 'data/bestiary.json',
  codexExtra: 'data/codex-extra.json',
  grounds: 'data/grounds.json',
  sharedHunts: 'data/shared-hunts.json',
  charms: 'data/charms.json',
  access: 'data/access.json',
  character: 'data/character.json',
  characterHistory: 'data/character-history.json',
  imbuementArt: 'data/imbuement-art.json',
  imbuementPrices: 'data/imbuement-prices.json',
};

// ---------------------------------------------------------------- loaders

async function json(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

export async function loadCodex(prefix = '') {
  const [raw, extra] = await Promise.all([
    json(prefix + FILES.codex),
    json(prefix + FILES.codexExtra).catch(() => null), // enrichment is optional
  ]);
  return new Codex(raw, extra);
}

export function normalizeGrounds(raw) {
  const entries = (raw?.entries || []).map((e, i) => ({
    id: `c${i}`,
    ground: e.ground,
    groundSlug: slug(e.ground),
    vocation: e.vocation || null,
    party: !!e.party,
    level: e.level ?? null,
    levelText: e.levelText || (e.level != null ? `${e.level}+` : '—'),
    xpRaw: e.xpRaw ?? null,
    loot: e.loot ?? null,
    gear: e.gear || null,
    gearLabel: e.gearLabel || null,
  }));

  const dir = new Map();
  for (const e of entries) {
    if (!dir.has(e.groundSlug)) {
      dir.set(e.groundSlug, {
        name: e.ground, slug: e.groundSlug, key: fold(e.ground),
        vocations: new Set(), party: false, entryLevel: e.level, entries: [],
      });
    }
    const g = dir.get(e.groundSlug);
    if (e.vocation) g.vocations.add(e.vocation);
    if (e.party) g.party = true;
    if (e.level != null && (g.entryLevel == null || e.level < g.entryLevel)) g.entryLevel = e.level;
    g.entries.push(e);
  }

  return {
    origin: raw?.origin || null,
    entries,
    directory: [...dir.values()].map((g) => ({ ...g, vocations: [...g.vocations] })),
  };
}

export async function loadGrounds(prefix = '') {
  return normalizeGrounds(await json(prefix + FILES.grounds));
}

export async function loadSharedHunts(prefix = '') {
  try { return await json(prefix + FILES.sharedHunts); }
  catch { return []; }
}

/**
 * Charm catalogue (data/charms.json — same Cyclopedia export as bestiary.json).
 * Effect strings carry a single "{{}}" placeholder for the stage's value;
 * `substitute(stage)` renders it, and `effect` below already fills all three
 * stages into one "X% / Y% / Z%" sentence for a compact one-line summary.
 */
export async function loadCharms(prefix = '') {
  const raw = await json(prefix + FILES.charms);
  const base = raw?.imageBase || '';
  return (raw?.charms || []).map((c) => {
    const substitute = (value) => c.effect.replace(/\{\{\}\}%?/, `${value}%`);
    return {
      id: c.id,
      name: c.name,
      slug: slug(c.name),
      tier: c.type,
      element: CHARM_ELEMENT[c.name] || null,
      image: c.image ? base + c.image : null,
      stages: c.stages,
      cost: c.stages.map((s) => s.cost),
      effect: substitute(c.stages.map((s) => s.value).join(' / ')),
      substitute,
      wikiUrl: `https://tibia.fandom.com/wiki/${CHARM_WIKI_TITLE[c.name] || encodeURIComponent(c.name.replace(/ /g, '_'))}`,
    };
  });
}

/** Best-effort ground access notes (data/access.json — see pipeline/enrich-access.mjs). */
export async function loadAccess(prefix = '') {
  try { return await json(prefix + FILES.access); }
  catch { return {}; }
}

/** The tracked character's profile (config.ini) (data/character.json — see pipeline/track-character.mjs). */
export async function loadCharacter(prefix = '') {
  try { return await json(prefix + FILES.character); }
  catch { return null; }
}

/** { imbuements: { id: url }, items: { itemId: url } } TibiaWiki icon lookup. */
export async function loadImbuementArt(prefix = '') {
  try { return await json(prefix + FILES.imbuementArt); }
  catch { return { imbuements: {}, items: {} }; }
}

/** { world: { itemId: { price, source, updatedAt } } } TibiaMarket prefill (see pipeline/fetch-imbuement-prices.mjs). */
export async function loadImbuementPrices(prefix = '') {
  try { return await json(prefix + FILES.imbuementPrices); }
  catch { return {}; }
}

/** Daily {date: {rank, level, experience, highscores...}} history, oldest first. */
export async function loadCharacterHistory(prefix = '') {
  try {
    const raw = await json(prefix + FILES.characterHistory);
    return Object.entries(raw)
      .map(([date, entry]) => ({ date, ...entry }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch { return []; }
}

// ---------------------------------------------------------------- logbook

const BOOK_KEY = 'exiva:logbook';

export function logbook() {
  try { return JSON.parse(localStorage.getItem(BOOK_KEY) || '[]'); }
  catch { return []; }
}

export function writeLogbook(hunts) {
  localStorage.setItem(BOOK_KEY, JSON.stringify(hunts));
}

function remember(hunt) {
  try { writeLogbook([...logbook(), hunt]); }
  catch { /* best-effort */ }
}

// ---------------------------------------------------------------- backends

function issueText(hunt) {
  return [
    '<!-- exiva-xp hunt payload — leave the JSON block untouched -->',
    'Optional shared hunt from Exiva XP. A maintainer reviews and labels it.',
    '',
    '```json',
    JSON.stringify(hunt, null, 2),
    '```',
  ].join('\n');
}

function githubNewUrl(kind, hunt) {
  const title = encodeURIComponent(`[Hunt] ${hunt.ground} — ${hunt.vocation || 'Party'} ${hunt.level}`);
  const body = encodeURIComponent(issueText(hunt));
  if (kind === 'discussion') {
    return `https://github.com/${SITE.owner}/${SITE.repo}/discussions/new?category=${encodeURIComponent(SITE.discussionCategory)}&title=${title}&body=${body}`;
  }
  return `https://github.com/${SITE.owner}/${SITE.repo}/issues/new?title=${title}&labels=${encodeURIComponent(SITE.issueLabel)}&body=${body}`;
}

function restHeaders(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (REST.key) h.Authorization = `Bearer ${REST.key}`;
  return h;
}

const BACKENDS = {
  'github-issues': {
    label: 'GitHub Issues',
    blurb: 'Optional public sync: hunts become prefilled GitHub Issues; Actions validate, merge and refresh the shared datasets.',
    read: () => loadSharedHunts(),
    async send(hunt) {
      remember(hunt);
      return { ok: true, followUp: githubNewUrl('issue', hunt), message: 'Saved locally. Open the prefilled GitHub Issue only if you want to share it.' };
    },
  },
  'github-discussions': {
    label: 'GitHub Discussions',
    blurb: 'Optional public sync, like GitHub Issues, but saving here opens a prefilled Discussion instead.',
    read: () => loadSharedHunts(),
    async send(hunt) {
      remember(hunt);
      return { ok: true, followUp: githubNewUrl('discussion', hunt), message: 'Saved locally. Open the prefilled Discussion only if you want to share it.' };
    },
  },
  browser: {
    label: 'This browser',
    blurb: 'Fully offline — hunts live only in LocalStorage.',
    read: async () => logbook(),
    async send(hunt) {
      remember(hunt);
      return { ok: true, message: 'Saved to your logbook.' };
    },
  },
  static: {
    label: 'Static JSON',
    blurb: 'Read-only mirror: datasets served as JSON, saving disabled.',
    read: () => loadSharedHunts(),
    async send(hunt) {
      remember(hunt);
      return { ok: false, message: 'This mirror is read-only — your hunt was kept in your local logbook.' };
    },
  },
  supabase: {
    label: 'Supabase',
    blurb: 'Reads/writes a Supabase table over PostgREST.',
    read: () => json(`${REST.base}/rest/v1/${REST.table}?select=*`, {
      headers: { apikey: REST.key, Authorization: `Bearer ${REST.key}` },
    }),
    async send(hunt) {
      remember(hunt);
      await json(`${REST.base}/rest/v1/${REST.table}`, {
        method: 'POST',
        headers: { apikey: REST.key, ...restHeaders({ Prefer: 'return=minimal' }) },
        body: JSON.stringify(hunt),
      });
      return { ok: true, message: 'Hunt stored in Supabase.' };
    },
  },
  firebase: {
    label: 'Firebase',
    blurb: 'Reads/writes the Realtime Database REST API.',
    async read() {
      const data = await json(`${REST.base}/${REST.table}.json`);
      return data ? Object.values(data) : [];
    },
    async send(hunt) {
      remember(hunt);
      await json(`${REST.base}/${REST.table}.json`, { method: 'POST', body: JSON.stringify(hunt) });
      return { ok: true, message: 'Hunt stored in Firebase.' };
    },
  },
};

for (const [name, label] of [['cloudflare-d1', 'Cloudflare D1'], ['sqlite', 'SQLite']]) {
  BACKENDS[name] = {
    label,
    blurb: `Any REST endpoint backed by ${label} exposing GET/POST /${REST.table}.`,
    read: () => json(`${REST.base}/${REST.table}`, { headers: restHeaders() }),
    async send(hunt) {
      remember(hunt);
      await json(`${REST.base}/${REST.table}`, { method: 'POST', headers: restHeaders(), body: JSON.stringify(hunt) });
      return { ok: true, message: `Hunt stored in ${label}.` };
    },
  };
}

export function backend() {
  const b = BACKENDS[BACKEND];
  if (!b) throw new Error(`Unknown backend "${BACKEND}"`);
  return b;
}

export const BACKEND_NAMES = Object.keys(BACKENDS);
