/** Character tools: stamina, element decisions and profit. */

import { boot } from './_boot.js';
import { esc } from '../lib/text.js';
import { gp, hm, kk, nf, pct } from '../lib/fmt.js';
import { $, bindSortMenu, pillEl, ring, say, sortMenu } from '../shell.js';
import { ELEMENTS, ELEMENT_NAME, elementOrder } from '../engine/codex.js';
import {
  effectiveDamage,
  formatStamina,
  parseStamina,
  profitSnapshot,
  staminaProjection,
} from '../engine/planning.js';
import {
  calculateImbuement,
  formatShoppingList,
  GOLD_TOKEN_ITEM,
  imbuementById,
  IMBUEMENTS,
  sortImbuements,
} from '../engine/imbuements.js';
import { loadWorldPrices, saveItemPrice } from '../data/imbuement-prices.js';
import { loadCharacter, loadCharacterHistory, loadImbuementArt } from '../data/sources.js';

const { stage, codex, hunts } = await boot('tools.html', { ledger: false });
const [profile, history, imbuementArt] = await Promise.all([
  loadCharacter().catch(() => null),
  loadCharacterHistory().catch(() => []),
  loadImbuementArt().catch(() => ({ imbuements: {}, items: {} })),
]);

const latest = history.at(-1) || {};
const characterLevel = profile?.level ?? latest.level ?? 465;
const defaultCreature = codex.identify('Girtablilu Warrior')?.creature ||
  codex.creatures.find((c) => c.hp > 5000) ||
  codex.creatures[0];

const creatures = [...codex.creatures].sort((a, b) => a.name.localeCompare(b.name));

stage.innerHTML = `
  <header style="padding: 8px 0 4px">
    <h1 style="font-size:26px; letter-spacing:-.4px">Character tools</h1>
    <p class="dim" style="max-width:66ch">Practical Night'Flyn tools for stamina planning, element choice and profit, using the same character files and analyser sessions that power the hub.</p>
  </header>

  <div class="tool-grid" style="margin-top:20px">
    <section class="panel panel-pad tool-card" id="stamina-tool">
      <div class="tool-head">
        <h2>Stamina calculator</h2>
        <span class="fine dim">usage and recovery</span>
      </div>
      <div class="tool-fields">
        <label class="lbl lbl-narrow"><span class="eyebrow">Current</span><input id="stamina-current" type="text" value="39:00" inputmode="numeric"></label>
        <label class="lbl lbl-narrow"><span class="eyebrow">Hunt time</span><input id="stamina-session" type="text" value="2:00" inputmode="numeric"></label>
        <label class="lbl lbl-narrow"><span class="eyebrow">Target</span><input id="stamina-target" type="text" value="42:00" inputmode="numeric"></label>
      </div>
      <div class="tool-result" id="stamina-out"></div>
      <p class="fine dim">Offline regeneration: no regen for the first 10 minutes, then 3 min per stamina minute up to 39:00 and twice that (6 min) for the 39:00–42:00 bonus hours — 39:00 → 42:00 takes 18h10m offline.</p>
    </section>

    <section class="panel panel-pad tool-card" id="damage-tool">
      <div class="tool-head">
        <h2>Element damage</h2>
        <span class="fine dim">TibiaTools-style combat logic</span>
      </div>
      <div class="tool-fields">
        <label class="lbl lbl-wide"><span class="eyebrow">Creature</span><input id="damage-creature" type="search" list="creature-list" value="${esc(defaultCreature?.name)}"></label>
        <label class="lbl"><span class="eyebrow">Element</span><select id="damage-element">${ELEMENTS.map((el) => `<option value="${el}">${ELEMENT_NAME[el]}</option>`).join('')}</select></label>
        <label class="lbl lbl-narrow"><span class="eyebrow">Min hit</span><input id="damage-min" type="number" min="0" value="307"></label>
        <label class="lbl lbl-narrow"><span class="eyebrow">Max hit</span><input id="damage-max" type="number" min="0" value="692"></label>
        <label class="lbl lbl-narrow"><span class="eyebrow">Mitigation</span><input id="damage-mitigation" type="number" min="0" max="100" step="0.1" value="0"></label>
        <label class="lbl lbl-narrow"><span class="eyebrow">Crit %</span><input id="damage-crit-chance" type="number" min="0" max="100" value="0"></label>
        <label class="lbl lbl-narrow"><span class="eyebrow">Crit dmg</span><input id="damage-crit-damage" type="number" min="0" value="50"></label>
        <label class="lbl lbl-narrow"><span class="eyebrow">Fatal %</span><input id="damage-fatal-chance" type="number" min="0" max="100" value="0"></label>
        <label class="lbl lbl-narrow"><span class="eyebrow">Fatal dmg</span><input id="damage-fatal-damage" type="number" min="0" value="60"></label>
        <label class="lbl lbl-narrow"><span class="eyebrow">Charm dmg %</span><input id="damage-charm" type="number" min="0" max="100" value="5"></label>
        <label class="lbl lbl-narrow"><span class="eyebrow">Charm proc %</span><input id="damage-charm-chance" type="number" min="0" max="100" value="11"></label>
      </div>
      <p class="fine dim">Enter your own damage range (client or analyser numbers); the calculator applies only the target's resistance, mitigation, crit/fatal expectation and the charm proc — elemental charms deal 5% of initial HP with a per-stage trigger chance (5/10/11%, maxed default). It never invents your raw roll.</p>
      <datalist id="creature-list">${creatures.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>
      <div class="tool-result" id="damage-out"></div>
    </section>

    <section class="panel panel-pad tool-card tool-wide" id="profit-tool">
      <div class="tool-head">
        <h2>Profit tracker</h2>
        <span class="fine dim">from saved analyser sessions</span>
      </div>
      <div class="tool-result" id="profit-out"></div>
    </section>

    <section class="panel panel-pad tool-card tool-wide" id="imbuement-tool">
      <div class="tool-head">
        <h2>Imbuement price calculator</h2>
        <span class="fine dim">cheapest way to gather each tier's resources</span>
      </div>
      <div class="filter-bar" id="imb-filter-bar">
        <label class="lbl lbl-narrow"><span class="eyebrow">World</span>
          ${profile?.world
    ? `<input id="imb-world" type="text" value="${esc(profile.world)}" disabled>`
    : `<input id="imb-world" type="text" value="Gentebra" placeholder="World">`}
        </label>
        <label class="lbl lbl-narrow"><span class="eyebrow">Tier</span>
          <select id="imb-tier"><option value="basic">Basic</option><option value="intricate">Intricate</option><option value="powerful" selected>Powerful</option></select>
        </label>
        <div class="filter-more" id="imb-filter-more">
          <label class="lbl"><span class="eyebrow">Sort</span>${sortMenu('imb-sort', { default: ['Default'], alphabetical: ['Alphabetical'] }, 'default')}</label>
          <label class="lbl"><span class="eyebrow">Effect type</span>
            <select id="imb-category">
              <option value="all">All types</option>
              <option value="leech">Leech &amp; Critical</option>
              <option value="utility">Utility</option>
              <option value="protection">Protection</option>
              <option value="skill">Skill</option>
              <option value="damage">Elemental damage</option>
            </select>
          </label>
          <label class="lbl"><span class="eyebrow">Cheapest by</span>
            <select id="imb-cheapest-method">
              <option value="all">Any method</option>
              <option value="market">Market</option>
              <option value="tokens">Gold Tokens</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
        </div>
        <button type="button" class="filter-toggle" id="imb-filter-toggle" aria-expanded="false" aria-controls="imb-filter-more"><span>Filters</span><span class="chevron">⌄</span></button>
      </div>
      <div class="tile-tags" id="imb-toggle-filters">
        <button type="button" class="pill" id="imb-toggle-tokens" aria-pressed="false">Gold Token supported</button>
        <button type="button" class="pill" id="imb-toggle-missing" aria-pressed="false">Missing prices</button>
      </div>
      <div class="tool-result-grid" id="imb-grid"></div>
    </section>
  </div>

  <dialog id="imb-modal"></dialog>`;

$('#damage-element').value = elementOrder(defaultCreature)[0]?.el || 'physical';

function numberInput(id) {
  const value = Number($(id)?.value || 0);
  return Number.isFinite(value) ? value : 0;
}

function renderStamina() {
  const current = parseStamina($('#stamina-current').value);
  const session = parseStamina($('#stamina-session').value);
  const target = parseStamina($('#stamina-target').value);
  if (current == null || session == null || target == null) {
    $('#stamina-out').innerHTML = '<span class="dim">Use time as HH:MM.</span>';
    return;
  }
  const plan = staminaProjection(current, session, target);
  $('#stamina-out').innerHTML = `
    <div class="tool-kpis">
      <span><b>${formatStamina(plan.afterHunt)}</b><small>after hunt</small></span>
      <span><b>${formatStamina(plan.recovery.needed)}</b><small>stamina to recover</small></span>
      <span><b>${hm(plan.recovery.readyInMinutes)}</b><small>offline time</small></span>
    </div>
    ${plan.recovery.segments.length ? `<div class="mini-list">${plan.recovery.segments.map((s) => `
      <span>${esc(s.label)}: +${formatStamina(s.gain)} in ${hm(s.offline)}</span>`).join('')}</div>` : '<span class="dim">Already at target after that hunt.</span>'}`;
}

function chosenCreature() {
  const value = $('#damage-creature').value;
  return codex.identify(value)?.creature || codex.creature(value) || defaultCreature;
}

function renderDamage() {
  const creature = chosenCreature();
  const select = $('#damage-element');
  if (!(select.value in creature.taken)) select.value = elementOrder(creature)[0]?.el || 'physical';
  const element = select.value;
  const taken = creature.taken[element] ?? 100;
  const result = effectiveDamage({
    level: characterLevel,
    rawMin: numberInput('#damage-min'),
    rawMax: numberInput('#damage-max'),
    elementTaken: taken,
    mitigation: numberInput('#damage-mitigation'),
    critChance: numberInput('#damage-crit-chance'),
    critDamage: numberInput('#damage-crit-damage'),
    fatalChance: numberInput('#damage-fatal-chance'),
    fatalDamage: numberInput('#damage-fatal-damage'),
    charmPercent: numberInput('#damage-charm'),
    charmChance: numberInput('#damage-charm-chance'),
    targetHp: creature.hp || 0,
  });
  const [best] = elementOrder(creature);
  $('#damage-out').innerHTML = `
    <div class="tool-creature-line">
      ${creature.art ? `<img class="critter" src="${esc(creature.art)}" alt="">` : ring(creature.name, { quiet: true })}
      <div><b>${esc(creature.name)}</b><span class="fine dim">HP ${nf(creature.hp)} · creature mitigation ${creature.mitigation ?? '-'}</span></div>
    </div>
    <div class="tool-kpis">
      <span><b>${kk(result.hit)}</b><small>expected hit</small></span>
      <span><b>${kk(result.charmProc)}</b><small>charm per proc</small></span>
      <span><b>${kk(result.turn)}</b><small>expected turn</small></span>
    </div>
    <div class="tile-tags">
      ${pillEl(element, pct(taken))}
      ${best ? `<span class="pill">Best: ${esc(ELEMENT_NAME[best.el])} ${pct(best.taken)}</span>` : ''}
      <span class="pill">Level ${nf(characterLevel)} base value ${nf(result.base)}</span>
    </div>`;
}

function renderProfit() {
  const snapshot = profitSnapshot(hunts);
  if (!snapshot.totals.hunts) {
    $('#profit-out').innerHTML = `
      <p class="dim">Save Hunting Analyser sessions and this becomes a personal profit board by ground, recency and hourly performance.</p>
      <a class="btn btn-secondary" href="submit.html">Save a hunt</a>`;
    return;
  }
  const best = snapshot.grounds[0];
  const worst = snapshot.grounds.at(-1);
  $('#profit-out').innerHTML = `
    <div class="tool-kpis">
      <span><b>${gp(snapshot.totals.balance)}</b><small>total balance</small></span>
      <span><b>${gp(snapshot.totals.profitRate)}</b><small>profit/h</small></span>
      <span><b>${hm(snapshot.totals.minutes)}</b><small>tracked time</small></span>
      <span><b>${nf(snapshot.totals.hunts)}</b><small>sessions</small></span>
    </div>
    <div class="tool-columns">
      <div>
        <p class="eyebrow">Ground performance</p>
        <div class="mini-list">
          ${best ? `<span>Best: ${esc(best.ground)} · ${gp(best.profitRate)}/h</span>` : ''}
          ${worst && worst !== best ? `<span>Lowest: ${esc(worst.ground)} · ${gp(worst.profitRate)}/h</span>` : ''}
          ${snapshot.grounds.slice(0, 3).map((g) => `<span>${esc(g.ground)} · ${gp(g.balance)} total · ${nf(g.hunts)} hunt${g.hunts === 1 ? '' : 's'}</span>`).join('')}
        </div>
      </div>
      <div>
        <p class="eyebrow">Recent sessions</p>
        <div class="mini-list">
          ${snapshot.recent.map((h) => `<span>${esc(h.ground || 'Unknown')} · ${gp(h.balance)} · ${hm(h.minutes)}</span>`).join('')}
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- imbuements

const imbState = { tier: 'powerful', sort: 'default', category: 'all', cheapestMethod: 'all', tokenOnly: false, missingOnly: false };

function imbWorld() {
  return $('#imb-world').value.trim() || 'Gentebra';
}

function imbPrices() {
  return loadWorldPrices(imbWorld());
}

function filteredImbuements() {
  let list = sortImbuements(IMBUEMENTS, imbState.sort);
  if (imbState.category !== 'all') list = list.filter((i) => i.category === imbState.category);
  if (imbState.tokenOnly) list = list.filter((i) => i.supportsGoldTokenExchange);
  if (imbState.missingOnly || imbState.cheapestMethod !== 'all') {
    const prices = imbPrices();
    list = list.filter((i) => {
      const calc = calculateImbuement(i, prices)[imbState.tier];
      if (imbState.missingOnly && calc.canCalculate) return false;
      if (imbState.cheapestMethod !== 'all' && calc.cheapest?.method !== imbState.cheapestMethod) return false;
      return true;
    });
  }
  return list;
}

function imbIcon(imb) {
  const src = imbuementArt.imbuements?.[imb.id];
  return src ? `<img class="imb-icon" src="${esc(src)}" alt="" loading="lazy">` : '';
}

function itemIcon(itemId, size = '') {
  const src = imbuementArt.items?.[itemId];
  return src ? `<img class="imb-icon${size ? ` ${size}` : ''}" src="${esc(src)}" alt="" loading="lazy">` : '';
}

function imbCardHtml(imb, prices) {
  const calc = calculateImbuement(imb, prices)[imbState.tier];
  return `
    <button type="button" class="tool-mini-card imb-card" data-imb="${esc(imb.id)}">
      <div class="imb-card-head">
        <div class="imb-card-id">
          ${imbIcon(imb)}
          <div><b>${esc(imb.name)}</b><span class="fine dim">${esc(imb.effect)}</span></div>
        </div>
        <span class="imb-card-price ${calc.canCalculate ? '' : 'dim'}">${calc.canCalculate ? gp(calc.cheapest.total) : '—'}</span>
      </div>
      ${imb.supportsGoldTokenExchange ? '<span class="pill pill-info imb-card-badge">Gold Token</span>' : ''}
    </button>`;
}

function renderImbuementGrid() {
  const prices = imbPrices();
  const list = filteredImbuements();
  $('#imb-grid').innerHTML = list.length
    ? list.map((imb) => imbCardHtml(imb, prices)).join('')
    : '<p class="dim">No imbuements match these filters.</p>';
  $('#imb-grid').querySelectorAll('[data-imb]').forEach((btn) => {
    btn.addEventListener('click', () => openImbuementModal(btn.dataset.imb));
  });
}

function priceInputRow(itemId, name, prices) {
  const entry = prices[itemId];
  const value = entry ? entry.price : '';
  return `
    <label class="imb-price-input" title="${esc(name)}">
      ${itemIcon(itemId, 'imb-icon-sm')}
      <input type="number" min="0" step="1" data-price-item="${esc(itemId)}" value="${value}" placeholder="${esc(name)}" aria-label="${esc(name)} price">
    </label>`;
}

const TIER_BADGE = { basic: 'badge-success', intricate: 'badge-info', powerful: 'badge-error' };

/** Compact tier tile: item list, one total (cheapest method), one alt line, copy. */
const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>';

const TIER_TEXT = { basic: 'imb-tier-text-basic', intricate: 'imb-tier-text-intricate', powerful: 'imb-tier-text-powerful' };

function tierCardHtml(imb, tierId, calc) {
  const t = calc.tier;
  const cheapest = calc.cheapest;
  const itemRow = (icon, label) => `<span class="imb-item-row">${icon}${label}</span>`;
  return `
  <div class="panel panel-pad tool-mini-card imb-tier-card">
    <div class="imb-tier-head">
      ${imbIcon(imb)}
      <span class="badge ${TIER_BADGE[tierId]}">${esc(t.name)}</span>
    </div>
    ${t.bonus ? `<p class="imb-tier-bonus ${TIER_TEXT[tierId]}">${esc(t.bonus)}</p>` : ''}
    <div class="mini-list">
      ${cheapest?.tokenQuantity
    ? itemRow(itemIcon(GOLD_TOKEN_ITEM, 'imb-icon-sm'), `${nf(cheapest.tokenQuantity)}x Gold Token`)
    : t.items.map((it) => itemRow(itemIcon(it.itemId, 'imb-icon-sm'), `${nf(it.quantity)}x ${esc(it.name)}`)).join('')}
    </div>
    <div class="imb-tier-total">
      <span>Total${cheapest && cheapest.method !== 'market' ? ` · ${esc(cheapest.label)}` : ''}</span>
      <span class="imb-tier-total-right">
        <b>${calc.canCalculate ? gp(cheapest.total) : '—'}</b>
        ${calc.canCalculate ? `<button type="button" class="imb-copy-btn" data-copy-tier="${tierId}" title="Copy shopping list" aria-label="Copy shopping list">${COPY_ICON}</button>` : ''}
      </span>
    </div>
  </div>`;
}

function renderModalTiers(imb, world) {
  const calc = calculateImbuement(imb, loadWorldPrices(world));
  $('#imb-tier-cards').innerHTML = ['basic', 'intricate', 'powerful']
    .map((tierId) => tierCardHtml(imb, tierId, calc[tierId])).join('');
  $('#imb-tier-cards').querySelectorAll('[data-copy-tier]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const c = calc[btn.dataset.copyTier];
      if (!c.canCalculate) return;
      const text = formatShoppingList(imb.name, c.tier.name, world, c.cheapest);
      try { await navigator.clipboard.writeText(text); say('Shopping list copied'); }
      catch { say('Could not copy — clipboard unavailable'); }
    });
  });
}

function openImbuementModal(id) {
  const imb = imbuementById(id);
  if (!imb) return;
  const world = imbWorld();
  const prices = loadWorldPrices(world);
  const itemIds = [...new Set(imb.tiers.powerful.items.map((it) => it.itemId))];
  const items = imb.tiers.powerful.items;
  const modal = $('#imb-modal');
  modal.innerHTML = `
    <div class="panel panel-pad" style="max-width:760px;display:grid;gap:var(--s4)">
      <div class="tool-head">
        <div>
          <h2 style="margin:0">${esc(imb.name)}</h2>
          <span class="fine dim">${esc(imb.effect)}</span>
        </div>
        <button type="button" class="btn btn-tertiary btn-sm" id="imb-modal-close">Close</button>
      </div>
      ${!imb.verified ? '<span class="pill pill-warning" style="width:fit-content">Unverified quantities — confirm at the imbuing shrine.</span>' : ''}
      <div class="tool-result-grid" id="imb-tier-cards"></div>
      <div>
        <div class="tool-head">
          <p class="eyebrow" style="margin:0">Resource prices</p>
          <span class="fine dim">World: ${esc(world)}</span>
        </div>
        <div class="tool-fields" id="imb-price-inputs">
          ${imb.supportsGoldTokenExchange ? priceInputRow(GOLD_TOKEN_ITEM, 'Gold Token', prices) : ''}
          ${itemIds.map((iid) => priceInputRow(iid, items.find((it) => it.itemId === iid).name, prices)).join('')}
        </div>
      </div>
    </div>`;
  renderModalTiers(imb, world);
  modal.querySelectorAll('[data-price-item]').forEach((input) => {
    input.addEventListener('input', () => {
      const value = input.value === '' ? null : Number(input.value);
      saveItemPrice(world, input.dataset.priceItem, value);
      renderModalTiers(imb, world);
      renderImbuementGrid();
    });
  });
  $('#imb-modal-close').addEventListener('click', () => modal.close());
  modal.showModal();
}

$('#imb-world').addEventListener('input', () => renderImbuementGrid());
$('#imb-tier').addEventListener('change', () => { imbState.tier = $('#imb-tier').value; renderImbuementGrid(); });
$('#imb-category').addEventListener('change', () => { imbState.category = $('#imb-category').value; renderImbuementGrid(); });
$('#imb-cheapest-method').addEventListener('change', () => { imbState.cheapestMethod = $('#imb-cheapest-method').value; renderImbuementGrid(); });
bindSortMenu('imb-sort', (value) => { imbState.sort = value; renderImbuementGrid(); });
$('#imb-toggle-tokens').addEventListener('click', () => {
  imbState.tokenOnly = !imbState.tokenOnly;
  $('#imb-toggle-tokens').setAttribute('aria-pressed', String(imbState.tokenOnly));
  $('#imb-toggle-tokens').classList.toggle('pill-info', imbState.tokenOnly);
  renderImbuementGrid();
});
$('#imb-toggle-missing').addEventListener('click', () => {
  imbState.missingOnly = !imbState.missingOnly;
  $('#imb-toggle-missing').setAttribute('aria-pressed', String(imbState.missingOnly));
  $('#imb-toggle-missing').classList.toggle('pill-info', imbState.missingOnly);
  renderImbuementGrid();
});
$('#imb-filter-toggle').addEventListener('click', () => {
  const open = $('#imb-filter-more').classList.toggle('open');
  $('#imb-filter-toggle').setAttribute('aria-expanded', String(open));
});

[
  '#stamina-current', '#stamina-session', '#stamina-target',
].forEach((id) => $(id).addEventListener('input', renderStamina));
[
  '#damage-creature', '#damage-element', '#damage-min', '#damage-max',
  '#damage-mitigation', '#damage-crit-chance', '#damage-crit-damage',
  '#damage-fatal-chance', '#damage-fatal-damage', '#damage-charm', '#damage-charm-chance',
].forEach((id) => $(id).addEventListener('input', renderDamage));

renderStamina();
renderDamage();
renderProfit();
renderImbuementGrid();

export {};
