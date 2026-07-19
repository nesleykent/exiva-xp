/** Codex explorer — searchable creature tiles. */

import { boot, param } from './_boot.js';
import { esc, fold, slug } from '../lib/text.js';
import { nf, pct } from '../lib/fmt.js';
import { $, ring, pillEl, sortMenu, bindSortMenu, meters, note } from '../shell.js';
import { weakSpots, elementOrder, armorSpots, ELEMENT_NAME, ELEMENT_CHARM } from '../engine/codex.js';
import { nearestGround } from '../engine/locator.js';

const PAGE_TITLE = 'Creature codex · Exiva XP';
const { stage, codex, grounds, hunts } = await boot('creatures.html', { codex: true, grounds: true, hunts: true });

const families = [...new Set(codex.creatures.map((c) => c.family).filter(Boolean))].sort();
const tiers = [...new Set(codex.creatures.map((c) => c.tier).filter(Boolean))].sort();

const state = { q: '', tier: '', family: '', sort: 'name', shown: 72, detailSlug: param('c') || null };

const SORTS = {
  name: ['Name', (c) => c.name, 'asc'],
  hp: ['Hitpoints', (c) => c.hp ?? -1, 'desc'],
  xp: ['Experience', (c) => c.xp ?? -1, 'desc'],
  charm: ['Charm points', (c) => c.charm?.points ?? -1, 'desc'],
};

stage.innerHTML = `
  <header id="codex-head" style="padding: 8px 0 4px">
    <h1 style="font-size:26px; letter-spacing:-.4px">Creature codex</h1>
    <p class="dim">${nf(codex.size)} creatures with resistances, weaknesses, damage types, charm data and habitats.</p>
  </header>
  <form class="filter-bar" id="c-filter" role="search">
    <label class="lbl lbl-wide"><span class="eyebrow">Search</span><input type="search" id="c-q" placeholder="Creature name"></label>
    <button type="button" class="filter-toggle" id="c-toggle" aria-expanded="false" aria-controls="c-more"><span>Filters</span><span class="chevron">⌄</span></button>
    <div class="filter-more" id="c-more">
      <label class="lbl"><span class="eyebrow">Difficulty</span><select id="c-tier"><option value="">Any</option>${tiers.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label class="lbl"><span class="eyebrow">Class</span><select id="c-family"><option value="">Any</option>${families.map((f) => `<option>${esc(f)}</option>`).join('')}</select></label>
      <label class="lbl"><span class="eyebrow">Sort</span>${sortMenu('c-sort', SORTS, state.sort)}</label>
    </div>
  </form>
  <div id="out"></div>
  <div style="text-align:center; margin-top:var(--s5)"><button type="button" class="btn btn-secondary" id="more" hidden>Show more</button></div>
  <div id="detail"></div>`;

/** Creature dossier — artwork, lore, stats, resistances, strategy, loot, habitats — inline in the codex. */
function renderDetail(creatureSlug) {
  document.title = PAGE_TITLE;
  const detail = $('#detail');

  const c = codex.creature(creatureSlug);
  const backLink = `<p><button type="button" class="dim" id="detail-back" style="background:none;border:none;cursor:pointer;padding:0;font:inherit">← Codex</button></p>`;

  if (!c) {
    detail.innerHTML = `${backLink}${note('red', 'No such creature in the codex.')}`;
    $('#detail-back').addEventListener('click', () => closeDetail());
    return;
  }

  document.title = `${c.name} · Exiva XP`;
  const loggedKills = hunts.reduce((total, h) => total + (h.kills || [])
    .filter((k) => codex.identify(k.name)?.creature.key === c.key)
    .reduce((a, k) => a + (k.n || 0), 0), 0);

  const order = elementOrder(c);
  const weak = weakSpots(c);
  const armor = armorSpots(c);
  const [best] = order;
  const worst = order[order.length - 1];

  const plan = [];
  plan.push(weak.length
    ? `Hit it with ${ELEMENT_NAME[best.el]} — it takes ${pct(best.taken)} of that damage.`
    : `No elemental weakness: ${ELEMENT_NAME[best.el]} (${pct(best.taken)}) is merely least-resisted, so bring raw damage.`);
  if (armor.length) plan.push(`Skip ${armor.slice(0, 2).map((r) => `${ELEMENT_NAME[r.el]} (${pct(r.taken)})`).join(' and ')}.`);
  if (c.deals.length) plan.push(`It deals ${c.deals.map((el) => ELEMENT_NAME[el]).join(', ')} damage${c.afflicts.length ? ` and can inflict ${c.afflicts.join(', ')}` : ''} — gear your defence accordingly.`);
  if (c.paralysable === false) plan.push('It cannot be paralysed.');
  if (c.seeInvisible) plan.push('It sees through invisibility.');
  if (c.charm && weak.length) {
    const charmName = ELEMENT_CHARM[weak[0].el];
    plan.push(`The <a href="charms.html?charm=${esc(slug(charmName))}">${esc(charmName)} Charm</a> procs at ${pct(weak[0].taken)} on this creature; finishing its Bestiary entry (${c.charm.stages.map(nf).join(' / ')} kills) grants ${c.charm.points} charm points.`);
  }

  const habitatLinks = [...c.habitats].sort((a, b) => a.localeCompare(b)).map((h) => {
    const g = nearestGround(h, grounds.directory);
    return g
      ? `<a class="pill pill-info" href="grounds.html?g=${esc(g.slug)}">${esc(h)}</a>`
      : `<span class="pill">${esc(h)}</span>`;
  });

  const lootPills = [...(c.lootList || [])].sort((a, b) => a.localeCompare(b))
    .map((item) => `<span class="pill">${esc(item)}</span>`);

  detail.innerHTML = `
  ${backLink}
  <header class="masthead">
    ${c.art
      ? `<span class="art-disc"><img class="critter critter-lg" src="${esc(c.art)}" alt="${esc(c.name)}" onerror="this.parentElement.remove()"></span>`
      : ring(c.name, { quiet: !weak.length })}
    <div>
      <h1>${esc(c.name)}</h1>
      <div class="sub">
        ${c.family ? `<span class="pill">${esc(c.family)}</span>` : ''}
        ${c.tier ? `<span class="pill">${esc(c.tier)}</span>` : ''}
        ${c.rarity ? `<span class="pill">${esc(c.rarity)}</span>` : ''}
        ${c.caster ? '<span class="pill">Caster</span>' : ''}
        ${c.seeInvisible ? '<span class="pill">Sees invisible</span>' : ''}
        ${loggedKills ? `<span class="pill" title="across your saved analyser logs">${nf(loggedKills)} logged kills</span>` : ''}
      </div>
    </div>
  </header>

  ${c.lore ? `<p style="max-width:72ch; font-size:15px; line-height:22px; margin:0 0 var(--s5)">${esc(c.lore)}</p>` : ''}

  <div class="facts" style="margin-bottom:var(--s4)">
    <div class="fact"><b class="num">${nf(c.hp)}</b><span class="fine dim">Hitpoints</span></div>
    <div class="fact"><b class="num">${nf(c.xp)}</b><span class="fine dim">Experience</span></div>
    <div class="fact"><b class="num">${nf(c.armor)}</b><span class="fine dim">Armor</span></div>
    <div class="fact"><b class="num">${c.mitigation ?? '—'}</b><span class="fine dim">Mitigation</span></div>
    <div class="fact"><b class="num">${nf(c.speed)}</b><span class="fine dim">Speed</span></div>
    <div class="fact"><b>${esc(c.attack || '—')}</b><span class="fine dim">Attack type</span></div>
    <div class="fact"><b class="num">${c.summonMana ? nf(c.summonMana) : 'No'}</b><span class="fine dim">Summon mana</span></div>
    <div class="fact"><b class="num">${c.convinceMana ? nf(c.convinceMana) : 'No'}</b><span class="fine dim">Convince mana</span></div>
  </div>

  <div class="duo">
    <div class="panel panel-pad">
      <p class="eyebrow" style="margin:0 0 10px">Elemental resistances — % taken</p>
      ${meters(c.taken)}
      <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap">
        ${pillEl(best.el, `<b class="num">${pct(best.taken)}</b> best`)}
        ${pillEl(worst.el, `<b class="num">${pct(worst.taken)}</b> worst`)}
      </div>
    </div>
    <div class="panel panel-pad">
      <p class="eyebrow" style="margin:0 0 10px">Battle plan</p>
      <ul class="tips">${plan.map((t) => `<li>${t}</li>`).join('')}</ul>
      <p class="eyebrow" style="margin:16px 0 8px">Damage ranking</p>
      <div style="display:flex; gap:6px; flex-wrap:wrap">${order.map((r) => pillEl(r.el, `<span class="num">${pct(r.taken)}</span>`)).join('')}</div>
    </div>
  </div>

  ${c.behaviour ? `
  <section class="section">
    <div class="section-bar"><h2>Behaviour</h2></div>
    <p class="dim" style="max-width:72ch; margin:0">${esc(c.behaviour)}</p>
  </section>` : ''}

  ${lootPills.length ? `
  <section class="section">
    <div class="section-bar"><h2>Loot</h2><span class="fine dim">${nf(lootPills.length)} known drops</span></div>
    <div style="display:flex; gap:8px; flex-wrap:wrap">${lootPills.join('')}</div>
  </section>` : ''}

  <section class="section">
    <div class="section-bar"><h2>Habitats</h2><span class="fine dim">linked pills open the matching ground</span></div>
    ${habitatLinks.length ? `<div style="display:flex; gap:8px; flex-wrap:wrap">${habitatLinks.join('')}</div>` : '<p class="dim">No recorded habitats.</p>'}
  </section>

  ${c.charm ? `
  <section class="section">
    <div class="section-bar"><h2>Bestiary progress</h2></div>
    <div class="facts">
      ${c.charm.stages.map((s, i) => `<div class="fact"><b class="num">${nf(s)}</b><span class="fine dim">Stage ${i + 1} kills</span></div>`).join('')}
      <div class="fact"><b class="num">${nf(c.charm.points)}</b><span class="fine dim">Charm points</span></div>
    </div>
    ${loggedKills ? `<p class="fine dim" style="margin:10px 0 0">Your saved analyser logs record ${nf(loggedKills)} kills — the in-game Bestiary counts every kill ever, so treat this as a floor.</p>` : ''}
  </section>` : ''}`;

  $('#detail-back').addEventListener('click', () => closeDetail());
}

function openDetail(creatureSlug, { push = true } = {}) {
  state.detailSlug = creatureSlug;
  if (push) history.pushState({ c: creatureSlug }, '', `creatures.html?c=${encodeURIComponent(creatureSlug)}`);
  render();
  $('#detail').scrollIntoView({ block: 'start' });
}

function closeDetail({ push = true } = {}) {
  state.detailSlug = null;
  document.title = PAGE_TITLE;
  if (push) history.pushState({}, '', 'creatures.html');
  $('#detail').innerHTML = '';
  render();
}

window.addEventListener('popstate', () => {
  const creatureSlug = param('c') || null;
  if (creatureSlug) { state.detailSlug = creatureSlug; render(); }
  else closeDetail({ push: false });
});

function render() {
  const q = fold(state.q);
  const [, val, dir] = SORTS[state.sort];
  const all = codex.creatures
    .filter((c) => {
      if (q && !c.key.includes(q)) return false;
      if (state.tier && c.tier !== state.tier) return false;
      if (state.family && c.family !== state.family) return false;
      return true;
    })
    .sort((a, b) => {
      const va = val(a), vb = val(b);
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * (dir === 'asc' ? 1 : -1);
    });

  $('#out').innerHTML = `
    <p class="fine dim count-line">${nf(all.length)} creatures</p>
    <div class="tiles codex-grid">
      ${all.slice(0, state.detailSlug ? 8 : state.shown).map((c) => {
        const weak = weakSpots(c).slice(0, 3);
        return `
        <a class="panel tile" href="creatures.html?c=${esc(c.slug)}" data-creature-slug="${esc(c.slug)}">
          <div class="tile-top">
            ${c.art
              ? `<span class="art-disc"><img class="critter" src="${esc(c.art)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></span>`
              : ring(c.name, { quiet: !weak.length })}
            <div>
              <div class="name">${esc(c.name)}</div>
              <div class="fine dim">${nf(c.hp)} HP · ${nf(c.xp)} XP${c.tier ? ` · ${esc(c.tier)}` : ''}</div>
            </div>
          </div>
          <div class="tile-tags">
            ${weak.length ? weak.map((w) => pillEl(w.el, `<span class="num">${pct(w.taken)}</span>`)).join('') : '<span class="pill">No weakness</span>'}
          </div>
        </a>`;
      }).join('') || '<p class="dim">No creatures match.</p>'}
    </div>`;

  const more = $('#more');
  more.hidden = !!state.detailSlug || all.length <= state.shown;
  if (!more.hidden) more.textContent = `Show more (${nf(all.length - state.shown)} left)`;
  if (state.detailSlug) renderDetail(state.detailSlug);
  else $('#detail').innerHTML = '';
}

for (const [sel, prop] of [['#c-q', 'q'], ['#c-tier', 'tier'], ['#c-family', 'family']]) {
  $(sel).addEventListener('input', (e) => { state[prop] = e.target.value; state.shown = 72; render(); });
}
$('#c-filter').addEventListener('submit', (e) => e.preventDefault());
bindSortMenu('c-sort', (key) => { state.sort = key; state.shown = 72; render(); });
$('#more').addEventListener('click', () => { state.shown += 144; render(); });
$('#c-toggle').addEventListener('click', () => {
  const open = $('#c-more').classList.toggle('open');
  $('#c-toggle').setAttribute('aria-expanded', String(open));
});
$('#out').addEventListener('click', (e) => {
  const tile = e.target.closest('[data-creature-slug]');
  if (!tile || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  openDetail(tile.dataset.creatureSlug);
});

render();
export {};
