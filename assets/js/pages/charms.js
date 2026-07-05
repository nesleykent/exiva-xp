/** Charms — the full Charm catalogue (Major/Minor), from the game's own Cyclopedia data. */

import { mountShell, $, pillEl } from '../shell.js';
import { esc } from '../lib/text.js';
import { kk, nf } from '../lib/fmt.js';
import { charmAdvice } from '../engine/planning.js';
import { backend, loadCharms, loadCharacterHistory, loadCodex } from '../data/sources.js';

mountShell('charms.html');
const stage = $('#stage');

let charms;
let history;
let codex;
let hunts;
try {
  [charms, history, codex, hunts] = await Promise.all([
    loadCharms(),
    loadCharacterHistory(),
    loadCodex(),
    backend().read(),
  ]);
} catch (err) {
  stage.innerHTML = `<div class="note note-red">Could not load the charm catalogue (${err.message}).</div>`;
  throw err;
}

const elemental = charms.filter((c) => c.element);
const major = charms.filter((c) => c.tier === 'Major' && !c.element);
const minor = charms.filter((c) => c.tier === 'Minor');

function latestTrackedCharmPoints() {
  for (let i = history.length - 1; i >= 0; i--) {
    const points = Number(history[i].charmPoints);
    if (history[i].charmPoints != null && Number.isFinite(points)) return { points, date: history[i].date };
  }
  return null;
}

const trackedCharmPoints = latestTrackedCharmPoints();
const advice = charmAdvice(hunts, codex, charms).slice(0, 3);

function adviceCard(row) {
  const creatures = row.topCreatures.map((c) => `${esc(c.name)} (${nf(c.n)} kills)`).join(', ');
  return `
  <div class="panel panel-pad">
    <div class="tile-top" style="margin-bottom:10px">
      <div>
        <a class="name" href="#${esc(row.charm.slug)}">${esc(row.charm.name)}</a>
        <div class="tile-tags" style="margin-top:6px">${pillEl(row.charm.element)}</div>
      </div>
    </div>
    <div class="fact"><b class="num">${kk(row.total)}</b><span class="fine dim">expected proc damage</span></div>
    <p class="fine dim" style="margin:10px 0 0">${creatures}</p>
  </div>`;
}

function card(c) {
  const total = c.stages.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);
  const stages = c.stages.map((s, i) => `
    <div class="fact"${trackedCharmPoints && Number(s.cost) <= trackedCharmPoints.points ? ' title="within tracked earned points"' : ''}>
      <b class="num">${nf(s.cost)}${trackedCharmPoints && Number(s.cost) <= trackedCharmPoints.points ? ' ✓' : ''}</b><span class="fine dim">Stage ${i + 1} · ${s.value}%</span>
    </div>`).join('');
  return `
  <div class="panel panel-pad" id="${esc(c.slug)}">
    <div class="tile-top" style="margin-bottom:10px">
      ${c.image ? `<span class="art-disc"><img class="critter" src="${esc(c.image)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></span>` : ''}
      <div>
        <div class="name">${esc(c.name)}</div>
        <div class="tile-tags" style="margin-top:6px">
          <span class="pill">${esc(c.tier)}</span>
          ${c.element ? pillEl(c.element) : ''}
        </div>
      </div>
    </div>
    <p class="fine" style="margin:0 0 10px">${esc(c.effect)}</p>
    <div class="facts" style="grid-template-columns:repeat(3,1fr)">${stages}</div>
    <p class="fine dim" style="margin:10px 0 0">Cost in charm points, per upgrade stage. Total to max: ${nf(total)} points · <a href="${esc(c.wikiUrl)}" rel="noopener" target="_blank">TibiaWiki ↗</a></p>
  </div>`;
}

stage.innerHTML = `
  <header style="padding: 8px 0 4px">
    <h1 style="font-size:26px; letter-spacing:-.4px">Charms</h1>
    <p class="dim" style="max-width:64ch">Charms are unlocked with Charm Points, earned by completing a creature's Bestiary entry, then assigned free of charge to that creature — one charm per creature. Free accounts can have 2 charms assigned at once; Premium accounts can have 6. Detaching an assigned charm costs gold (your level × 100). Major charms cost more points and hit harder; Minor charms are cheaper utility/defensive effects. Neither tier has a character-level requirement. <a href="https://tibia.fandom.com/wiki/Charms" target="_blank" rel="noopener">Source ↗</a></p>
  </header>

  ${trackedCharmPoints ? `<div class="pulse-row">
    <div class="panel pulse"><div class="big num">${nf(trackedCharmPoints.points)}</div><div class="eyebrow">tracked charm points</div></div>
    <div class="panel pulse"><div class="big num">${esc(trackedCharmPoints.date)}</div><div class="eyebrow">tracked date</div></div>
  </div>
  <p class="fine dim" style="margin:8px 0 0">earned points from the daily highscore tracker; spent points are not visible — check the Cyclopedia in game.</p>` : ''}

  ${advice.length ? `<section class="section" style="margin-top:0">
    <div class="section-bar"><h2>Charms for your hunts</h2><span class="fine dim">elemental Major charms · per-attack expectation (maxed trigger chance × 5% of initial HP) weighted by your logged kills</span></div>
    <div class="tiles">${advice.map(adviceCard).join('')}</div>
  </section>` : ''}

  <section class="section" style="margin-top:0">
    <div class="section-bar"><h2>Elemental damage charms</h2><span class="fine dim">one per element — the Codex and Ground pages recommend these by name</span></div>
    <div class="tiles">${elemental.map(card).join('')}</div>
  </section>

  <section class="section">
    <div class="section-bar"><h2>Other Major charms</h2><span class="fine dim">higher point cost, offensive/defensive utility</span></div>
    <div class="tiles">${major.map(card).join('')}</div>
  </section>

  <section class="section">
    <div class="section-bar"><h2>Minor charms</h2><span class="fine dim">lower point cost, available from the start</span></div>
    <div class="tiles">${minor.map(card).join('')}</div>
  </section>`;

if (location.hash) {
  document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });
}
export {};
