/** Creature dossier — artwork, lore, stats, resistances, strategy, loot, habitats. */

import { boot, param } from './_boot.js';
import { esc, slug } from '../lib/text.js';
import { nf, pct } from '../lib/fmt.js';
import { ring, pillEl, meters, note } from '../shell.js';
import { elementOrder, weakSpots, armorSpots, ELEMENT_NAME, ELEMENT_CHARM } from '../engine/codex.js';
import { nearestGround } from '../engine/locator.js';

const { stage, codex, grounds, hunts } = await boot('creature.html', { ledger: false });

const c = codex.creature(param('c'));

/** Kills of this creature across the saved analyser logs — a floor, not
 * the in-game Bestiary counter (which counts every kill ever). */
const loggedKills = c ? hunts.reduce((total, h) => total + (h.kills || [])
  .filter((k) => codex.identify(k.name)?.creature.key === c.key)
  .reduce((a, k) => a + (k.n || 0), 0), 0) : 0;

if (!c) {
  stage.innerHTML = `<p><a href="creatures.html" class="dim">← Codex</a></p>${note('red', 'No such creature in the codex.')}`;
} else {
  document.title = `${c.name} · Exiva XP`;
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
    plan.push(`The <a href="charms.html#${esc(slug(charmName))}">${esc(charmName)} Charm</a> procs at ${pct(weak[0].taken)} on this creature; finishing its Bestiary entry (${c.charm.stages.map(nf).join(' / ')} kills) grants ${c.charm.points} charm points.`);
  }

  const habitatLinks = [...c.habitats].sort((a, b) => a.localeCompare(b)).map((h) => {
    const g = nearestGround(h, grounds.directory);
    return g
      ? `<a class="pill pill-info" href="ground.html?g=${esc(g.slug)}">${esc(h)}</a>`
      : `<span class="pill">${esc(h)}</span>`;
  });

  const lootPills = [...(c.lootList || [])].sort((a, b) => a.localeCompare(b))
    .map((item) => `<span class="pill">${esc(item)}</span>`);

  stage.innerHTML = `
  <p><a href="creatures.html" class="dim">← Codex</a></p>
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
}
export {};
