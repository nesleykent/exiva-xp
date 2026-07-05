/** Character tools: stamina, element decisions and profit. */

import { boot } from './_boot.js';
import { esc } from '../lib/text.js';
import { gp, hm, kk, nf, pct } from '../lib/fmt.js';
import { $, pillEl, ring } from '../shell.js';
import { ELEMENTS, ELEMENT_NAME, elementOrder } from '../engine/codex.js';
import {
  effectiveDamage,
  formatStamina,
  parseStamina,
  profitSnapshot,
  staminaProjection,
} from '../engine/planning.js';
import { loadCharacter, loadCharacterHistory } from '../data/sources.js';

const { stage, codex, hunts } = await boot('tools.html', { ledger: false });
const [profile, history] = await Promise.all([
  loadCharacter().catch(() => null),
  loadCharacterHistory().catch(() => []),
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
  </div>`;

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

export {};
