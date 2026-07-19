/**
 * Hunt planner — filterable tile grid, one card per ground.
 * Filtering happens over individual ledger rows (a ground can have several:
 * one per vocation/level bracket); sorting happens after grouping into cards,
 * against each card's own best/aggregate value — sorting the raw rows first
 * and grouping afterward would show numbers that don't match the sort (e.g.
 * "sort by Loot/h" picking a card's displayed Raw XP/h from an unrelated row).
 */

import { boot, param } from './_boot.js';
import { esc, fold } from '../lib/text.js';
import { kk, nf, pct } from '../lib/fmt.js';
import { $, ring, pillEl, basisPill, sortMenu, bindSortMenu, segmentedControl, bindSegmented, trustMeter, dataTable, meters, seriesTitle } from '../shell.js';
import { ELEMENTS, TASK_SPEEDS, TASK_SPEED_LABEL, elementOrder, armorSpots } from '../engine/codex.js';
import { population } from '../engine/locator.js';
import { readBattle } from '../engine/strategy.js';
import { groundDossier, trustOf } from '../engine/ledger.js';
import { VOCATIONS, VOCATION_ELEMENTS } from '../engine/rules.js';
import { loadAccess, loadCharacter } from '../data/sources.js';

const PAGE_TITLE = 'Hunt planner · Exiva XP';
const { stage, codex, grounds, hunts, table, config } = await boot('grounds.html', { codex: true, ledger: true, config: true });
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
  q: '', level: characterLevel, vocation: characterVocation, mode: '', playstyle: '', area: '', element: '', family: '', taskSpeed: '', sort: 'xpRawRate', dir: 'desc',
  levelBand: 'tracked', detailSlug: param('g') || null, shown: 6,
};

const PARTY_OPTIONS = [['', 'All'], ['solo', 'Solo'], ['party', 'Team']];
const LEVEL_OPTIONS = [['tracked', 'My level'], ['any', 'Any'], ['under-250', '<250'], ['250-400', '250–400'], ['400-plus', '400+']];

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
      const battle = readBattle(pop.battleSet || pop.set);
      intelCache.set(g.slug, {
        attackOrder: battle?.order || null,
        names: new Set(pop.set.map((s) => s.creature.key)),
        families: new Set(pop.set.map((s) => s.creature.family).filter(Boolean)),
        tiers: new Set(pop.set.map((s) => s.creature.tier).filter(Boolean)),
        rarities: new Set(pop.set.map((s) => s.creature.rarity).filter(Boolean)),
        taskSpeeds: new Set(pop.set.map((s) => s.creature.taskSpeed).filter(Boolean)),
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
  const ix = (tokens.length || state.element || state.family || state.taskSpeed) ? intel() : null;

  return table.filter((r) => {
    if (state.levelBand === 'tracked' && state.level != null && (r.level == null || r.level > state.level)) return false;
    if (state.levelBand === 'under-250' && (r.level == null || r.level >= 250)) return false;
    if (state.levelBand === '250-400' && (r.level == null || r.level < 250 || r.level > 400)) return false;
    if (state.levelBand === '400-plus' && (r.level == null || r.level < 400)) return false;
    if (state.levelBand === 'custom' && state.level != null && (r.level == null || r.level > state.level)) return false;
    // a row with no vocation is a party/any-vocation row — never exclude those
    if (state.vocation && r.vocation && r.vocation !== state.vocation) return false;
    if (state.mode === 'solo' && r.party) return false;
    if (state.mode === 'party' && !r.party) return false;
    if (state.playstyle && !fold(r.gear || '').includes(fold(state.playstyle))) return false;
    if (state.area && areaBySlug.get(r.groundSlug) !== fold(state.area)) return false;
    if (state.element && ix.get(r.groundSlug)?.attackOrder?.[0]?.el !== state.element) return false;
    if (state.family && !ix.get(r.groundSlug)?.families.has(state.family)) return false;
    if (state.taskSpeed && !ix.get(r.groundSlug)?.taskSpeeds.has(state.taskSpeed)) return false;
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

/**
 * The best attack element to show on a card, restricted to what the
 * selected vocation can actually deal (a Druid can't cast Holy) — falls
 * back to the population's overall weakest element with no vocation filter.
 */
function bestAttackElement(attackOrder, vocation) {
  if (!attackOrder?.length) return null;
  const allowed = VOCATION_ELEMENTS[vocation];
  if (!allowed) return attackOrder[0].el;
  return attackOrder.find((o) => allowed.includes(o.el))?.el || null;
}

stage.innerHTML = `
  <header id="planner-head" style="padding: 8px 0 4px">
    <h1 style="font-size:26px; letter-spacing:-.4px">Hunt planner</h1>
    <p class="dim" style="max-width:60ch">Pick a ground matched to ${esc(characterName)}'s level, vocation and party size. Curated values seed the list and your analyser logs sharpen it over time.</p>
  </header>
  <form class="filter-bar filter-compact" id="f" role="search">
    <div class="filter-compact-head">
      <label class="lbl lbl-wide"><span class="eyebrow">Search</span><input type="search" id="f-q" placeholder="Ground, creature or area"></label>
      <span class="fine dim" id="filter-count"></span>
    </div>
    <div class="filter-compact-groups">
      <div class="filter-segment"><span class="eyebrow">Party</span>${segmentedControl('f-party', 'Party size', PARTY_OPTIONS, state.mode)}</div>
      <div class="filter-segment"><span class="eyebrow">Level</span>${segmentedControl('f-level-band', 'Level range', LEVEL_OPTIONS, state.levelBand)}</div>
      <button type="button" class="advanced-toggle" id="f-toggle" aria-expanded="false" aria-controls="f-more">More filters</button>
    </div>
    <div class="advanced-filters" id="f-more" hidden>
      <label class="lbl lbl-narrow"><span class="eyebrow">Level</span><input type="number" id="f-level" min="8" max="2000" placeholder="Any" value="${characterLevel ?? ''}"></label>
      <label class="lbl"><span class="eyebrow">Vocation</span><select id="f-voc"><option value=""${characterVocation ? '' : ' selected'}>All</option>${[...VOCATIONS].sort().map((v) => `<option${v === characterVocation ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="lbl"><span class="eyebrow">Area</span><select id="f-area"><option value="">All</option>${areaOptions.map((area) => `<option>${esc(area)}</option>`).join('')}</select></label>
      <label class="lbl"><span class="eyebrow">Element</span><select id="f-element"><option value="">All</option>${ELEMENTS.map((el) => `<option value="${esc(el)}">${esc(el)}</option>`).join('')}</select></label>
      <label class="lbl"><span class="eyebrow">Creature type</span><select id="f-family"><option value="">All</option>${familyOptions().map((family) => `<option>${esc(family)}</option>`).join('')}</select></label>
      <label class="lbl"><span class="eyebrow">Task speed</span><select id="f-task-speed"><option value="">All</option>${TASK_SPEEDS.map((speed) => `<option value="${speed}">${TASK_SPEED_LABEL[speed]}</option>`).join('')}</select></label>
      <label class="lbl"><span class="eyebrow">Playstyle</span><input type="search" id="f-playstyle" placeholder="e.g. forked, arrows"></label>
      <label class="lbl"><span class="eyebrow">Sort</span>${sortMenu('f-sort', SORTS, state.sort)}</label>
    </div>
  </form>
  <div id="out"></div>
  <div id="detail"></div>`;

/** Ground detail — stats, requirements, population and battle plan, inline in the planner. */
function renderDetail(slug) {
  document.title = PAGE_TITLE;
  const detail = $('#detail');

  const ground = grounds.directory.find((g) => g.slug === slug)
    || (table.find((r) => r.groundSlug === slug)
      ? { name: table.find((r) => r.groundSlug === slug).ground, slug, key: slug, vocations: [] }
      : null);

  if (!ground) {
    detail.innerHTML = `<p><button type="button" class="dim" id="detail-back" style="background:none;border:none;cursor:pointer;padding:0;font:inherit">← Hunt planner</button></p>
      <div class="note note-red">Unknown ground. It may exist under a different name — try the search above.</div>`;
    $('#detail-back').addEventListener('click', () => closeDetail());
    return;
  }

  document.title = `${ground.name} · Exiva XP`;
  const rows = table.filter((r) => r.groundSlug === ground.slug);
  const dossier = groundDossier(ground.slug, hunts);
  const trust = trustOf(dossier.n);
  const pop = population(ground, codex, hunts);
  const battle = pop ? readBattle(pop.battleSet || pop.set) : null;
  const req = access.grounds?.[ground.slug] || null;

  detail.innerHTML = `
  <p><button type="button" class="dim" id="detail-back" style="background:none;border:none;cursor:pointer;padding:0;font:inherit">← Hunt planner</button></p>
  <header class="masthead">
    ${ring(ground.name, { quiet: !dossier.n })}
    <div>
      <h1>${esc(ground.name)}</h1>
      <div class="sub">
        ${req?.area ? `<span class="pill pill-info">${esc(req.area)}</span>` : ''}
        ${trustMeter(trust, dossier.n)}
        ${(ground.vocations || []).map((v) => `<span class="pill">${esc(v)}</span>`).join('')}
        ${pop ? (pop.evidence === 'logged-wiki' || pop.evidence === 'logged'
          ? '<span class="badge badge-success">Log-weighted evidence</span>'
          : pop.evidence === 'name'
            ? '<span class="badge badge-warning">Name-only match</span>'
            : '') : ''}
      </div>
    </div>
  </header>

  ${dossier.n ? `
  <div class="pulse-row">
    <div class="panel pulse"><div class="big num" title="${esc(seriesTitle(dossier.xpRawRate))}">${kk(dossier.xpRawRate.avg)}</div><div class="eyebrow">Avg raw XP/h</div></div>
    <div class="panel pulse"><div class="big num" title="${esc(seriesTitle(dossier.lootRate))}">${kk(dossier.lootRate.avg)}</div><div class="eyebrow">Avg loot/h</div></div>
    <div class="panel pulse"><div class="big num" title="${esc(seriesTitle(dossier.profitRate))}">${kk(dossier.profitRate.avg)}</div><div class="eyebrow">Avg profit/h</div></div>
    <div class="panel pulse"><div class="big num">${nf(dossier.n)}</div><div class="eyebrow">Hunts logged</div></div>
  </div>` : ''}

  <section class="section" style="margin-top:${dossier.n ? 'var(--s6)' : '0'}">
    <div class="section-bar"><h2>Requirements</h2></div>
    ${req ? `
    <div class="panel panel-pad">
      ${(req.area || req.level || req.quest || req.premium) ? `<div class="facts" style="margin-bottom:10px">
        ${req.area ? `<div class="fact"><b>${esc(req.area)}</b><span class="fine dim">Area</span></div>` : ''}
        ${req.level ? `<div class="fact"><b class="num">${nf(req.level)}+</b><span class="fine dim">Minimum level</span></div>` : ''}
        ${req.quest ? `<div class="fact"><b>${esc(req.quest)}</b><span class="fine dim">Quest</span></div>` : ''}
        ${req.premium ? `<div class="fact"><b>Yes</b><span class="fine dim">Premium account</span></div>` : ''}
      </div>` : ''}
      ${req.note ? `<p class="fine" style="margin:0 0 8px">${esc(req.note)}</p>` : ''}
      <p class="fine dim" style="margin:0">Auto-extracted from <a href="${esc(req.wikiUrl)}" target="_blank" rel="noopener">${esc(req.wikiTitle)}</a> on TibiaWiki — unverified, always confirm in-game.</p>
    </div>` : `
    <div class="panel panel-pad fine dim">No area or access requirement found for this ground — likely open access, but this is a best-effort lookup, so double-check in-game.</div>`}
  </section>

  <section class="section">
    <div class="section-bar"><h2>Recommendations</h2></div>
    <div id="ground-rows"></div>
  </section>

  <div id="ground-battle"></div>

  <section class="section" style="text-align:center">
    <a class="btn btn-primary btn-lg" href="submit.html">Hunted here? Save your analyser</a>
  </section>`;

  $('#detail-back').addEventListener('click', () => closeDetail());

  dataTable(document.getElementById('ground-rows'), {
    cols: [
      { id: 'level', label: 'Level', num: true, cell: (r) => esc(r.levelText) },
      { id: 'vocation', label: 'Vocation', cell: (r) => esc(r.vocation || 'Team') },
      { id: 'party', label: 'Hunt', cell: (r) => (r.party ? 'Team' : 'Solo') },
      { id: 'xpRawRate', label: 'Raw XP/h', num: true, cell: (r) => `<span class="num" title="${esc(seriesTitle(r.evidence?.xpRawRate))}">${kk(r.xpRawRate)}</span>` },
      { id: 'lootRate', label: 'Loot/h', num: true, cell: (r) => kk(r.lootRate) },
      { id: 'profitRate', label: 'Profit/h', num: true, cell: (r) => kk(r.profitRate) },
      { id: 'gear', label: 'Loadout', cell: (r) => (r.gear ? `<span class="fine dim" title="${esc(r.gearLabel || '')}">${esc(r.gear)}</span>` : '—') },
      { id: 'n', label: 'Hunts', num: true, cell: (r) => nf(r.n) },
      { id: 'basis', label: 'Basis', cell: (r) => basisPill(r.basis) },
    ],
    rows,
  });

  const battleHost = document.getElementById('ground-battle');
  if (!battle) {
    battleHost.innerHTML = '<section class="section"><div class="note note-amber">No trustworthy population data: nothing is logged here, TibiaWiki has no resolved hunting-place roster, and the ground name does not identify a Bestiary creature.</div></section>';
  } else {
    const creatures = pop.set
      .map((s) => ({ ...s, share: s.n / (battle.mass || 1) }))
      .sort((a, b) => b.n - a.n || a.creature.name.localeCompare(b.creature.name));

    battleHost.innerHTML = `
    <section class="section">
      <div class="section-bar"><h2>Battle plan</h2></div>
      ${pop.evidence === 'logged-wiki' ? '<p class="fine dim" style="margin:-8px 0 16px">Battle advice is weighted by your saved analyser kills. Creatures absent from the loaded hunts remain in the matchup table with no logged kill share.</p>' : ''}
      ${pop.evidence === 'wiki' ? '<p class="fine dim" style="margin:-8px 0 16px">Equal-weight planning profile for this ground.</p>' : ''}
      ${pop.evidence === 'name' ? '<p class="fine dim" style="margin:-8px 0 16px">Only creatures explicitly named by this ground label are included; no broader regional spawn is inferred.</p>' : ''}
      <div class="duo">
        <div class="panel panel-pad">
          <p class="eyebrow" style="margin:0 0 10px">Damage profile — % taken per element</p>
          ${meters(battle.profile)}
          <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap">
            ${pillEl(battle.attack.el, `<b class="num">${pct(battle.attack.taken)}</b> use`)}
            ${pillEl(battle.avoid.el, `<b class="num">${pct(battle.avoid.taken)}</b> skip`)}
          </div>
        </div>
        <div class="panel panel-pad">
          <p class="eyebrow" style="margin:0 0 10px">How to fight it</p>
          <ul class="tips">${battle.tips.map((t) => `<li>${t}</li>`).join('')}</ul>
          ${battle.threats.length ? `<p class="eyebrow" style="margin:16px 0 8px">Incoming damage</p>
            <div style="display:flex; gap:6px; flex-wrap:wrap">${battle.threats.slice(0, 4).map((t) => pillEl(t.el, `<span class="num">${pct(t.share * 100)}</span>`)).join('')}</div>` : ''}
        </div>
      </div>
      <div class="section" style="margin-top:var(--s5)">
        <div class="section-bar"><h3 style="font-size:16px">Creature matchups</h3><span class="fine dim">${nf(pop.set.length)} creatures</span></div>
        <div id="ground-matchups"></div>
      </div>
    </section>`;

    dataTable(document.getElementById('ground-matchups'), {
      cols: [
        { id: 'name', label: 'Creature', cell: (s) => `<a href="creatures.html?c=${esc(s.creature.slug)}" style="display:inline-flex;align-items:center;gap:8px">${s.creature.art ? `<img class="critter" src="${esc(s.creature.art)}" alt="" loading="lazy" style="width:28px;height:28px" onerror="this.remove()">` : ''}${esc(s.creature.name)}</a>` },
        { id: 'share', label: pop.evidence === 'logged' || pop.evidence === 'logged-wiki' ? 'Logged kill share' : 'Planning weight', num: true, cell: (s) => pop.evidence === 'logged-wiki' && !s.logged ? '<span class="dim">—</span>' : pct(s.share * 100) },
        { id: 'hp', label: 'HP', num: true, cell: (s) => nf(s.creature.hp) },
        { id: 'xp', label: 'XP', num: true, cell: (s) => nf(s.creature.xp) },
        { id: 'task', label: 'Task', cell: (s) => s.creature.taskSpeed ? `<span class="pill pill-info">${TASK_SPEED_LABEL[s.creature.taskSpeed]}</span>` : '<span class="dim">—</span>' },
        { id: 'hit', label: 'Hit with', cell: (s) => { const [best] = elementOrder(s.creature); return pillEl(best.el, `<span class="num">${pct(best.taken)}</span>`); } },
        { id: 'resists', label: 'Resists', cell: (s) => armorSpots(s.creature).slice(0, 2).map((r) => pillEl(r.el, `<span class="num">${pct(r.taken)}</span>`)).join(' ') || '<span class="dim">—</span>' },
        { id: 'deals', label: 'Deals', cell: (s) => s.creature.deals.map((el) => pillEl(el)).join(' ') || '<span class="dim">—</span>' },
      ],
      rows: creatures,
    });
  }
}

function openDetail(slug, { push = true } = {}) {
  state.detailSlug = slug;
  if (push) history.pushState({ g: slug }, '', `grounds.html?g=${encodeURIComponent(slug)}`);
  render();
  $('#detail').scrollIntoView({ block: 'start' });
}

function closeDetail({ push = true } = {}) {
  state.detailSlug = null;
  document.title = PAGE_TITLE;
  if (push) history.pushState({}, '', 'grounds.html');
  $('#detail').innerHTML = '';
  render();
}

window.addEventListener('popstate', () => {
  const slug = param('g') || null;
  if (slug) { state.detailSlug = slug; render(); }
  else closeDetail({ push: false });
});

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
  const selectedCard = state.detailSlug ? cards.find((card) => card.slug === state.detailSlug) : null;
  const visibleCards = state.detailSlug
    ? [selectedCard, ...cards.filter((card) => card !== selectedCard)].filter(Boolean).slice(0, 3)
    : cards.slice(0, state.shown);

  $('#filter-count').textContent = `${nf(cards.length)} grounds · ${nf(rows.length)} rows`;
  $('#out').innerHTML = `
    <p class="fine dim count-line">Showing ${nf(visibleCards.length)} of ${nf(cards.length)} matching grounds</p>
    <div class="tiles planner-grid">
      ${visibleCards.map((g, index) => {
        const attackEl = bestAttackElement(ix?.get(g.slug)?.attackOrder, state.vocation);
        const area = access.grounds?.[g.slug]?.area;
        const creatures = [...(ix?.get(g.slug)?.names || [])].slice(0, 3);
        const fastestTask = TASK_SPEEDS.find((speed) => ix?.get(g.slug)?.taskSpeeds.has(speed));
        return `
        <a class="panel tile planner-card${g.slug === state.detailSlug ? ' is-selected' : ''}" href="grounds.html?g=${esc(g.slug)}" data-ground-slug="${esc(g.slug)}">
          ${index === 0 ? '<span class="badge badge-info tile-rank">Top XP</span>' : ''}
          <div class="planner-card-head">
            <div class="name">${esc(g.name)}</div>
            <span class="fine dim">Level ${nf(g.minLevel)}+</span>
          </div>
          <div class="fine dim planner-card-creatures">${creatures.length ? creatures.map(esc).join(' · ') : (area ? esc(area) : 'Creature list unavailable')}</div>
          <div class="tile-stats">
            <span class="stat"><b class="num">${kk(g.bestXp)}</b><span class="fine dim">raw XP/h</span></span>
            <span class="stat"><b class="num">${kk(g.bestProfit)}</b><span class="fine dim">profit/h</span></span>
            <span class="stat"><b class="num">${g.party ? 'Team' : 'Solo'}</b><span class="fine dim">hunt</span></span>
          </div>
          <div class="tile-tags">
            ${basisPill(g.badgeRow.basis)}
            ${fastestTask ? `<span class="pill pill-info">${TASK_SPEED_LABEL[fastestTask]} task</span>` : ''}
            ${attackEl ? pillEl(attackEl) : ''}
            ${area ? `<span class="pill">${esc(area)}</span>` : ''}
          </div>
        </a>`;
      }).join('') || '<p class="dim">Nothing matches those filters.</p>'}
    </div>
    ${!state.detailSlug && cards.length > state.shown ? `<div style="text-align:center;margin-top:var(--s5)"><button type="button" class="btn btn-secondary" data-show-more>Show more (${nf(cards.length - state.shown)} left)</button></div>` : ''}`;
  if (state.detailSlug) renderDetail(state.detailSlug);
  else $('#detail').innerHTML = '';
}

const bind = (id, prop, map = (v) => v) => {
  $(id).addEventListener('input', (e) => { state[prop] = map(e.target.value); state.shown = 6; render(); });
};
$('#f').addEventListener('submit', (e) => e.preventDefault());
bind('#f-q', 'q');
$('#f-level').addEventListener('input', (e) => { state.level = e.target.value ? +e.target.value : null; state.levelBand = 'custom'; state.shown = 6; $('#f-level-band').querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', 'false')); render(); });
bind('#f-voc', 'vocation');
bind('#f-area', 'area');
bind('#f-element', 'element');
bind('#f-family', 'family');
bind('#f-task-speed', 'taskSpeed');
bind('#f-playstyle', 'playstyle');
bindSortMenu('f-sort', (key) => {
  state.sort = key;
  state.dir = SORTS[key]?.[2] || 'desc';
  state.shown = 6;
  render();
});
bindSegmented('f-party', (value) => { state.mode = value; state.shown = 6; render(); });
bindSegmented('f-level-band', (value) => { state.levelBand = value; state.shown = 6; render(); });
$('#f-toggle').addEventListener('click', () => {
  const open = $('#f-more').hidden;
  $('#f-more').hidden = !open;
  $('#f-toggle').setAttribute('aria-expanded', String(open));
  $('#f-toggle').textContent = open ? 'Fewer filters' : 'More filters';
});
$('#out').addEventListener('click', (e) => {
  if (e.target.closest('[data-show-more]')) {
    state.shown += 18;
    render();
    return;
  }
  const tile = e.target.closest('[data-ground-slug]');
  if (!tile || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  openDetail(tile.dataset.groundSlug);
});

render();
export {};
