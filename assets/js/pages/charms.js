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

const selectedSlug = new URLSearchParams(location.search).get('charm');
const selectedCharm = charms.find((charm) => charm.slug === selectedSlug) || null;
const withoutSelected = (list) => list.filter((charm) => charm !== selectedCharm);
const elemental = withoutSelected(charms.filter((c) => c.element));
const major = withoutSelected(charms.filter((c) => c.tier === 'Major' && !c.element));
const minor = withoutSelected(charms.filter((c) => c.tier === 'Minor'));
if (selectedCharm) document.title = `${selectedCharm.name} Charm · Exiva XP`;

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
    <div class="tile-top tile-top-gap">
      <div>
        <div class="name">${esc(row.charm.name)}</div>
        <div class="tile-tags" style="margin-top:6px">${pillEl(row.charm.element)}</div>
      </div>
    </div>
    <div class="fact"><b class="num">${kk(row.total)}</b><span class="fine dim">expected proc damage</span></div>
    <p class="fine dim dossier-note">${creatures}</p>
  </div>`;
}

function card(c) {
  const total = c.stages.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);
  const stages = c.stages.map((s, i) => `
    <div class="fact"${trackedCharmPoints && Number(s.cost) <= trackedCharmPoints.points ? ' title="within tracked earned points"' : ''}>
      <b class="num">${nf(s.cost)}</b><span class="fine dim">Stage ${i + 1} · ${s.value}%</span>
    </div>`).join('');
  return `
  <div class="panel panel-pad">
    <div class="tile-top tile-top-gap">
      ${c.image ? `<span class="art-disc"><img class="critter" src="${esc(c.image)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></span>` : ''}
      <div>
        <div class="name">${esc(c.name)}</div>
        <div class="tile-tags" style="margin-top:6px">
          <span class="pill">${esc(c.tier)}</span>
          ${c.element ? pillEl(c.element) : ''}
        </div>
      </div>
    </div>
    <p class="fine eyebrow-lede">${esc(c.effect)}</p>
    <div class="facts" style="grid-template-columns:repeat(3,1fr)">${stages}</div>
    <p class="fine dim dossier-note">Cost in charm points, per upgrade stage. Total to max: ${nf(total)} points · <a href="${esc(c.wikiUrl)}" rel="noopener" target="_blank">TibiaWiki ↗</a></p>
  </div>`;
}

stage.innerHTML = `
  <header class="page-head">
    <h1>Charms</h1>
    <p class="dim" style="max-width:64ch">Plan charm spending from tracked earned points, then match elemental charms to the creatures you actually hunt. Spending and assignments remain private in the Cyclopedia. <a href="https://tibia.fandom.com/wiki/Charms" target="_blank" rel="noopener">Source ↗</a></p>
  </header>

  <div class="pulse-row">
    <div class="panel pulse"><div class="eyebrow">Earned points</div><div class="big num">${trackedCharmPoints ? nf(trackedCharmPoints.points) : '—'}</div><div class="fine dim">${trackedCharmPoints ? `tracked ${esc(trackedCharmPoints.date)}` : 'no highscore value yet'}</div></div>
    <div class="panel pulse"><div class="eyebrow">Major charms</div><div class="big num">${nf(charms.filter((charm) => charm.tier === 'Major').length)}</div><div class="fine dim">catalogued upgrades</div></div>
    <div class="panel pulse"><div class="eyebrow">Elemental charms</div><div class="big num">${nf(charms.filter((charm) => charm.element).length)}</div><div class="fine dim">damage options</div></div>
    <div class="panel pulse"><div class="eyebrow">Hunt evidence</div><div class="big num">${nf(hunts.length)}</div><div class="fine dim">private analyser sessions</div></div>
  </div>
  <p class="fine dim dossier-note">Earned points are an upper bound: the public highscore cannot see points already spent.</p>

  ${selectedCharm ? `<section class="section section-flush">
    <div class="section-bar"><h2>Selected charm</h2><a class="btn btn-tertiary" href="charms.html">All charms</a></div>
    <div class="tiles">${card(selectedCharm)}</div>
  </section>` : ''}

  <section class="section section-flush">
    <div class="section-bar"><h2>Charms for your hunts</h2><span class="fine dim">elemental Major charms · per-attack expectation (maxed trigger chance × 5% of initial HP) weighted by your logged kills</span></div>
    ${advice.length ? `<div class="tiles">${advice.map(adviceCard).join('')}</div>` : `<div class="panel panel-pad charm-empty"><div><b>Log a hunt to personalize this row</b><p class="fine dim">Recommendations need your actual creature kills, so no charm is guessed before evidence exists.</p></div><a class="btn btn-primary" href="submit.html">Log a hunt</a></div>`}
  </section>

  <section class="section section-flush">
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

export {};
