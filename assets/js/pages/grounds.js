/**
 * Hunt planner — filterable tile grid, one card per ground.
 * Filtering happens over individual ledger rows (a ground can have several:
 * one per vocation/level bracket); sorting happens after grouping into cards,
 * against each card's own best/aggregate value — sorting the raw rows first
 * and grouping afterward would show numbers that don't match the sort (e.g.
 * "sort by Loot/h" picking a card's displayed Raw XP/h from an unrelated row).
 */

import { boot } from './_boot.js';
import { esc, fold } from '../lib/text.js';
import { kk, nf } from '../lib/fmt.js';
import { $, ring, pillEl, basisPill, sortMenu, bindSortMenu } from '../shell.js';
import { ELEMENTS } from '../engine/codex.js';
import { population } from '../engine/locator.js';
import { readBattle } from '../engine/strategy.js';
import { VOCATIONS } from '../engine/rules.js';
import { loadAccess, loadCharacter } from '../data/sources.js';

const { stage, codex, grounds, hunts, table, config } = await boot('grounds.html');
const [access, profile] = await Promise.all([
  loadAccess().catch(() => ({ grounds: {} })),
  loadCharacter().catch(() => null),
]);
const characterName = profile?.name || config.name;
const characterLevel = profile?.level ?? null;
// Tibia's promoted title ("Elder Druid") always contains its base vocation
// name — match the same way character.js's isVocationCompatible does.
const characterVocation = VOCATIONS.find((v) => (profile?.vocation || '').toLowerCase().includes(v.toLowerCase())) || '';
const areaBySlug = new Map(Object.entries(access.grounds || {})
  .map(([slug, entry]) => [slug, fold(entry.area || '')]));
const areaOptions = [...new Set(Object.values(access.grounds || {})
  .map((entry) => entry.area)
  .filter(Boolean))]
  .sort((a, b) => a.localeCompare(b));

const state = {
  q: '', level: characterLevel, vocation: characterVocation, mode: '', playstyle: '', area: '', element: '', family: '', sort: 'level', dir: 'asc',
};

/** Card-level sorts — computed after grouping, never on raw per-vocation rows. */
const SORTS = {
  ground: ['Ground (A–Z)', (c) => c.name, 'asc'],
  xpRawRate: ['Raw XP/h', (c) => c.bestXp ?? -1, 'desc'],
  lootRate: ['Loot/h', (c) => c.bestLoot ?? -1, 'desc'],
  profitRate: ['Profit/h', (c) => c.bestProfit ?? -1, 'desc'],
  level: ['Level', (c) => c.minLevel ?? -1, 'asc'],
  n: ['Logged hunts', (c) => c.n, 'desc'],
};

let intelCache = null;
function intel() {
  if (!intelCache) {
    intelCache = new Map();
    for (const g of grounds.directory) {
      const pop = population(g, codex, hunts);
      if (!pop) continue;
      const battle = readBattle(pop.set);
      intelCache.set(g.slug, {
        attackEl: battle?.attack.el || null,
        names: new Set(pop.set.map((s) => s.creature.key)),
        families: new Set(pop.set.map((s) => s.creature.family).filter(Boolean)),
        tiers: new Set(pop.set.map((s) => s.creature.tier).filter(Boolean)),
        rarities: new Set(pop.set.map((s) => s.creature.rarity).filter(Boolean)),
        weak: new Set(ELEMENTS.filter((el) => pop.set.some((s) => s.creature.taken[el] > 100))),
      });
    }
  }
  return intelCache;
}

const familyOptions = () => [...new Set([...intel().values()].flatMap((i) => [...i.families]))]
  .sort((a, b) => a.localeCompare(b));

const questText = (groundSlug) => {
  const entry = access.grounds?.[groundSlug];
  return fold(`${entry?.quest || ''} ${entry?.note || ''}`);
};

function filteredRows() {
  const tokens = fold(state.q).split(/\s+/).filter(Boolean);
  const ix = (tokens.length || state.element || state.family) ? intel() : null;

  return table.filter((r) => {
    if (state.level != null && (r.level == null || r.level > state.level)) return false;
    // a row with no vocation is a party/any-vocation row — never exclude those
    if (state.vocation && r.vocation && r.vocation !== state.vocation) return false;
    if (state.mode === 'solo' && r.party) return false;
    if (state.mode === 'party' && !r.party) return false;
    if (state.playstyle && !fold(r.gear || '').includes(fold(state.playstyle))) return false;
    if (state.area && areaBySlug.get(r.groundSlug) !== fold(state.area)) return false;
    if (state.element && ix.get(r.groundSlug)?.attackEl !== state.element) return false;
    if (state.family && !ix.get(r.groundSlug)?.families.has(state.family)) return false;
    if (tokens.length) {
      const i = ix.get(r.groundSlug);
      const searchSets = [
        ...(i ? [...i.names, ...i.families, ...i.tiers, ...i.rarities].map(fold) : []),
      ];
      const textSources = [fold(r.ground), areaBySlug.get(r.groundSlug) || '', questText(r.groundSlug)];
      const hit = (token) => textSources.some((s) => s.includes(token)) || searchSets.some((s) => s.includes(token));
      if (!tokens.every(hit)) return false;
    }
    return true;
  });
}

/** Group rows into one card per ground, tracking each metric's own best value. */
function groundCards(rows) {
  const per = new Map();
  for (const r of rows) {
    if (!per.has(r.groundSlug)) {
      per.set(r.groundSlug, {
        slug: r.groundSlug, name: r.ground, minLevel: r.level,
        vocations: new Set(), party: false, n: 0,
        bestXp: null, bestLoot: null, bestProfit: null, badgeRow: r,
      });
    }
    const g = per.get(r.groundSlug);
    if (r.xpRawRate != null && (g.bestXp == null || r.xpRawRate > g.bestXp)) { g.bestXp = r.xpRawRate; g.badgeRow = r; }
    if (r.lootRate != null && (g.bestLoot == null || r.lootRate > g.bestLoot)) g.bestLoot = r.lootRate;
    if (r.profitRate != null && (g.bestProfit == null || r.profitRate > g.bestProfit)) g.bestProfit = r.profitRate;
    if (r.level != null && (g.minLevel == null || r.level < g.minLevel)) g.minLevel = r.level;
    if (r.vocation) g.vocations.add(r.vocation);
    if (r.party) g.party = true;
    g.n += r.n;
  }
  return [...per.values()];
}

stage.innerHTML = `
  <header style="padding: 8px 0 4px">
    <h1 style="font-size:26px; letter-spacing:-.4px">Hunt planner</h1>
    <p class="dim" style="max-width:60ch">${nf(table.length)} recommendations across ${nf(grounds.directory.length)} grounds. The planner opens around ${esc(characterName)}'s tracked level${characterLevel ? ` (${nf(characterLevel)})` : ''}${characterVocation ? ` and vocation (${esc(characterVocation)})` : ''}; curated values seed the list and your analyser logs sharpen it over time.</p>
  </header>
  <form class="filter-bar" id="f">
    <label class="lbl lbl-wide"><span class="eyebrow">Search</span><input type="search" id="f-q" placeholder="Ground, creature or area"></label>
    <button type="button" class="filter-toggle" id="f-toggle" aria-expanded="false" aria-controls="f-more"><span>Filters</span><span class="chevron">⌄</span></button>
    <div class="filter-more" id="f-more">
      <label class="lbl lbl-narrow"><span class="eyebrow">Level</span><input type="number" id="f-level" min="8" max="2000" placeholder="Any" value="${characterLevel ?? ''}"></label>
      <label class="lbl"><span class="eyebrow">Vocation</span><select id="f-voc"><option value=""${characterVocation ? '' : ' selected'}>All</option>${[...VOCATIONS].sort().map((v) => `<option${v === characterVocation ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="lbl"><span class="eyebrow">Hunt type</span><select id="f-mode"><option value="">All</option><option value="solo">Solo</option><option value="party">Team hunt</option></select></label>
      <label class="lbl"><span class="eyebrow">Area</span><select id="f-area"><option value="">All</option>${areaOptions.map((area) => `<option>${esc(area)}</option>`).join('')}</select></label>
      <label class="lbl"><span class="eyebrow">Element</span><select id="f-element"><option value="">All</option>${ELEMENTS.map((el) => `<option value="${esc(el)}">${esc(el)}</option>`).join('')}</select></label>
      <label class="lbl"><span class="eyebrow">Creature type</span><select id="f-family"><option value="">All</option>${familyOptions().map((family) => `<option>${esc(family)}</option>`).join('')}</select></label>
      <label class="lbl"><span class="eyebrow">Playstyle</span><input type="search" id="f-playstyle" placeholder="e.g. forked, arrows"></label>
      <label class="lbl"><span class="eyebrow">Sort</span>${sortMenu('f-sort', SORTS, state.sort)}</label>
    </div>
  </form>
  <div id="out"></div>`;

function render() {
  const rows = filteredRows();
  const cards = groundCards(rows);
  const ix = intel();

  const val = SORTS[state.sort]?.[1] || SORTS.ground[1];
  const dir = state.dir === 'asc' ? 1 : -1;
  cards.sort((a, b) => {
    const va = val(a); const vb = val(b);
    return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir;
  });

  $('#out').innerHTML = `
    <p class="fine dim count-line">${nf(cards.length)} grounds · ${nf(rows.length)} matching rows</p>
    <div class="tiles">
      ${cards.map((g) => {
        const attackEl = ix?.get(g.slug)?.attackEl;
        const area = access.grounds?.[g.slug]?.area;
        return `
        <a class="panel tile" href="ground.html?g=${esc(g.slug)}">
          <div class="tile-top">
            ${ring(g.name, { quiet: !g.n })}
            <div>
              <div class="name">${esc(g.name)}</div>
              <div class="fine dim">${area ? `${esc(area)} · ` : ''}from level ${nf(g.minLevel)}${g.party ? ' · team hunt' : ''}</div>
            </div>
          </div>
          <div class="tile-stats">
            <span class="stat"><b class="num">${kk(g.bestXp)}</b><span class="fine dim">raw XP/h</span></span>
            <span class="stat"><b class="num">${kk(g.bestLoot)}</b><span class="fine dim">loot/h</span></span>
            <span class="stat"><b class="num">${nf(g.n)}</b><span class="fine dim">logged</span></span>
          </div>
          <div class="tile-tags">
            ${basisPill(g.badgeRow.basis)}
            ${attackEl ? pillEl(attackEl) : ''}
            ${[...g.vocations].sort().slice(0, 3).map((v) => `<span class="pill">${esc(v)}</span>`).join('')}
          </div>
        </a>`;
      }).join('') || '<p class="dim">Nothing matches those filters.</p>'}
    </div>`;
}

const bind = (id, prop, map = (v) => v) => {
  $(id).addEventListener('input', (e) => { state[prop] = map(e.target.value); render(); });
};
bind('#f-q', 'q');
bind('#f-level', 'level', (v) => (v ? +v : null));
bind('#f-voc', 'vocation');
bind('#f-mode', 'mode');
bind('#f-area', 'area');
bind('#f-element', 'element');
bind('#f-family', 'family');
bind('#f-playstyle', 'playstyle');
bindSortMenu('f-sort', (key) => {
  state.sort = key;
  state.dir = SORTS[key]?.[2] || 'desc';
  render();
});
$('#f-toggle').addEventListener('click', () => {
  const open = $('#f-more').classList.toggle('open');
  $('#f-toggle').setAttribute('aria-expanded', String(open));
});

render();
export {};
