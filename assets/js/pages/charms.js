/** Charms — the full Charm catalogue (Major/Minor), from the game's own Cyclopedia data. */

import { boot, param } from './_boot.js';
import { emptyState, metric, note, pillEl } from '../shell.js';
import { esc } from '../lib/text.js';
import { kk, nf } from '../lib/fmt.js';
import { charmAdvice } from '../engine/planning.js';
import { loadCharms, loadCharacterHistory } from '../data/sources.js';

// started before boot so they download alongside boot's own codex + hunts
const pending = Promise.all([loadCharms(), loadCharacterHistory()]);
const { stage, codex, hunts } = await boot('charms.html', { codex: true, hunts: true });
let charms;
let history;
try {
  [charms, history] = await pending;
} catch (err) {
  stage.innerHTML = note('error', `Could not load the charm catalogue (${err.message}).`);
  throw err;
}

const selectedSlug = param('charm');
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
        <div class="tile-tags">${pillEl(row.charm.element)}</div>
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
        <div class="tile-tags">
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
    <p class="dim">Plan charm spending from tracked earned points, then match elemental charms to the creatures you actually hunt. Spending and assignments remain private in the Cyclopedia. <a href="https://tibia.fandom.com/wiki/Charms" target="_blank" rel="noopener">Source ↗</a></p>
  </header>

  ${selectedCharm ? `<section class="section section-tight">
    <div class="section-bar"><h2>Selected charm</h2><a class="btn btn-tertiary" href="charms.html">All charms</a></div>
    <div class="tiles">${card(selectedCharm)}</div>
  </section>` : ''}

  <div class="metric-row">
    ${metric('Earned points', nf(trackedCharmPoints?.points), trackedCharmPoints ? `tracked ${esc(trackedCharmPoints.date)}` : 'no highscore value yet')}
    ${metric('Major charms', nf(charms.filter((charm) => charm.tier === 'Major').length), 'catalogued upgrades')}
    ${metric('Elemental charms', nf(charms.filter((charm) => charm.element).length), 'damage options')}
    ${metric('Hunt evidence', nf(hunts.length), 'private analyser sessions')}
  </div>
  <p class="fine dim dossier-note">Earned points are an upper bound: the public highscore cannot see points already spent.</p>


  <section class="section">
    <div class="section-bar"><h2>Charms for your hunts</h2><span class="fine dim">elemental Major charms · per-attack expectation (maxed trigger chance × 5% of initial HP) weighted by your logged kills</span></div>
    ${advice.length ? `<div class="tiles">${advice.map(adviceCard).join('')}</div>` : emptyState('Log a hunt to personalize this row', 'Recommendations need your actual creature kills, so no charm is guessed before evidence exists.', '<a class="btn btn-primary" href="submit.html">Log a hunt</a>')}
  </section>

  <section class="section">
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
