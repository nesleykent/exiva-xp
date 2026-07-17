/** Codex explorer — searchable creature tiles. */

import { boot } from './_boot.js';
import { esc, fold } from '../lib/text.js';
import { nf, pct } from '../lib/fmt.js';
import { $, ring, pillEl, sortMenu, bindSortMenu } from '../shell.js';
import { weakSpots } from '../engine/codex.js';

const { stage, codex } = await boot('creatures.html', { codex: true });

const families = [...new Set(codex.creatures.map((c) => c.family).filter(Boolean))].sort();
const tiers = [...new Set(codex.creatures.map((c) => c.tier).filter(Boolean))].sort();

const state = { q: '', tier: '', family: '', sort: 'name', shown: 72 };

const SORTS = {
  name: ['Name', (c) => c.name, 'asc'],
  hp: ['Hitpoints', (c) => c.hp ?? -1, 'desc'],
  xp: ['Experience', (c) => c.xp ?? -1, 'desc'],
  charm: ['Charm points', (c) => c.charm?.points ?? -1, 'desc'],
};

stage.innerHTML = `
  <header style="padding: 8px 0 4px">
    <h1 style="font-size:26px; letter-spacing:-.4px">Creature codex</h1>
    <p class="dim">${nf(codex.size)} creatures with resistances, weaknesses, damage types, charm data and habitats.</p>
  </header>
  <form class="filter-bar">
    <label class="lbl lbl-wide"><span class="eyebrow">Search</span><input type="search" id="c-q" placeholder="Creature name"></label>
    <button type="button" class="filter-toggle" id="c-toggle" aria-expanded="false" aria-controls="c-more"><span>Filters</span><span class="chevron">⌄</span></button>
    <div class="filter-more" id="c-more">
      <label class="lbl"><span class="eyebrow">Difficulty</span><select id="c-tier"><option value="">Any</option>${tiers.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label class="lbl"><span class="eyebrow">Class</span><select id="c-family"><option value="">Any</option>${families.map((f) => `<option>${esc(f)}</option>`).join('')}</select></label>
      <label class="lbl"><span class="eyebrow">Sort</span>${sortMenu('c-sort', SORTS, state.sort)}</label>
    </div>
  </form>
  <div id="out"></div>
  <div style="text-align:center; margin-top:var(--s5)"><button class="btn btn-secondary" id="more" hidden>Show more</button></div>`;

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
    <div class="tiles">
      ${all.slice(0, state.shown).map((c) => {
        const weak = weakSpots(c).slice(0, 3);
        return `
        <a class="panel tile" href="creature.html?c=${esc(c.slug)}">
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
  more.hidden = all.length <= state.shown;
  if (!more.hidden) more.textContent = `Show more (${nf(all.length - state.shown)} left)`;
}

for (const [sel, prop] of [['#c-q', 'q'], ['#c-tier', 'tier'], ['#c-family', 'family']]) {
  $(sel).addEventListener('input', (e) => { state[prop] = e.target.value; state.shown = 72; render(); });
}
bindSortMenu('c-sort', (key) => { state.sort = key; state.shown = 72; render(); });
$('#more').addEventListener('click', () => { state.shown += 144; render(); });
$('#c-toggle').addEventListener('click', () => {
  const open = $('#c-more').classList.toggle('open');
  $('#c-toggle').setAttribute('aria-expanded', String(open));
});

render();
export {};
