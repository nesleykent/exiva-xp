/** Ground dossier — stats, recommendations, population and battle plan. */

import { boot, param } from './_boot.js';
import { esc } from '../lib/text.js';
import { kk, nf, pct } from '../lib/fmt.js';
import { ring, pillEl, basisPill, trustMeter, dataTable, meters, seriesTitle } from '../shell.js';
import { elementOrder, armorSpots, ELEMENT_NAME } from '../engine/codex.js';
import { population } from '../engine/locator.js';
import { readBattle } from '../engine/strategy.js';
import { groundDossier, trustOf } from '../engine/ledger.js';
import { loadAccess } from '../data/sources.js';

const { stage, codex, grounds, hunts, table } = await boot('ground.html');
const access = await loadAccess().catch(() => ({ grounds: {} }));

const slugParam = param('g');
const ground = grounds.directory.find((g) => g.slug === slugParam)
  || (table.find((r) => r.groundSlug === slugParam)
    ? { name: table.find((r) => r.groundSlug === slugParam).ground, slug: slugParam, key: slugParam, vocations: [] }
    : null);

if (!ground) {
  stage.innerHTML = `<p><a href="grounds.html" class="dim">← Hunt planner</a></p>
    <div class="note note-red">Unknown ground. It may exist under a different name — try the <a href="grounds.html" style="font-weight:600">planner</a>.</div>`;
} else {
  document.title = `${ground.name} · Exiva XP`;
  const rows = table.filter((r) => r.groundSlug === ground.slug);
  const dossier = groundDossier(ground.slug, hunts);
  const trust = trustOf(dossier.n);
  const pop = population(ground, codex, hunts);
  const battle = pop ? readBattle(pop.set) : null;
  const req = access.grounds?.[ground.slug] || null;

  stage.innerHTML = `
  <p><a href="grounds.html" class="dim">← Hunt planner</a></p>
  <header class="masthead">
    ${ring(ground.name, { quiet: !dossier.n })}
    <div>
      <h1>${esc(ground.name)}</h1>
      <div class="sub">
        ${req?.area ? `<span class="pill pill-info">${esc(req.area)}</span>` : ''}
        ${trustMeter(trust, dossier.n)}
        ${(ground.vocations || []).map((v) => `<span class="pill">${esc(v)}</span>`).join('')}
        ${pop ? (pop.evidence === 'logged' ? '<span class="badge badge-success">Log-weighted evidence</span>' : '<span class="badge">Codex spawn lists</span>') : ''}
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
    <div id="rows"></div>
  </section>

  <div id="battle"></div>

  <section class="section" style="text-align:center">
    <a class="btn btn-primary btn-lg" href="submit.html">Hunted here? Save your analyser</a>
  </section>`;

  dataTable(document.getElementById('rows'), {
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

  const battleHost = document.getElementById('battle');
  if (!battle) {
    battleHost.innerHTML = '<section class="section"><div class="note note-amber">No population data: nothing logged here yet and no codex habitat matches this ground\'s name.</div></section>';
  } else {
    const creatures = pop.set
      .map((s) => ({ ...s, share: s.n / (battle.mass || 1) }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 15);

    battleHost.innerHTML = `
    <section class="section">
      <div class="section-bar"><h2>Battle plan</h2></div>
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
        <div id="matchups"></div>
      </div>
    </section>`;

    dataTable(document.getElementById('matchups'), {
      cols: [
        { id: 'name', label: 'Creature', cell: (s) => `<a href="creature.html?c=${esc(s.creature.slug)}" style="display:inline-flex;align-items:center;gap:8px">${s.creature.art ? `<img class="critter" src="${esc(s.creature.art)}" alt="" loading="lazy" style="width:28px;height:28px" onerror="this.remove()">` : ''}${esc(s.creature.name)}</a>` },
        { id: 'share', label: pop.evidence === 'logged' ? 'Kill share' : 'Weight', num: true, cell: (s) => pct(s.share * 100) },
        { id: 'hp', label: 'HP', num: true, cell: (s) => nf(s.creature.hp) },
        { id: 'xp', label: 'XP', num: true, cell: (s) => nf(s.creature.xp) },
        { id: 'hit', label: 'Hit with', cell: (s) => { const [best] = elementOrder(s.creature); return pillEl(best.el, `<span class="num">${pct(best.taken)}</span>`); } },
        { id: 'resists', label: 'Resists', cell: (s) => armorSpots(s.creature).slice(0, 2).map((r) => pillEl(r.el, `<span class="num">${pct(r.taken)}</span>`)).join(' ') || '<span class="dim">—</span>' },
        { id: 'deals', label: 'Deals', cell: (s) => s.creature.deals.map((el) => pillEl(el)).join(' ') || '<span class="dim">—</span>' },
      ],
      rows: creatures,
    });
  }
}
export {};
