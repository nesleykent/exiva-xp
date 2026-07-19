/**
 * Home — app start screen. Character intelligence lives on character.html;
 * this route is the doorway into the working surfaces.
 */

import { boot } from './_boot.js';
import { esc } from '../lib/text.js';
import { ICONS, ring } from '../shell.js';

const { stage, config } = await boot('index.html', { config: true });
const characterName = config.name;

const dailyWorkspaces = [
  {
    href: 'character.html',
    icon: ring(characterName, { quiet: true }),
    title: 'Character dashboard',
    text: `${characterName} profile, XP history, highscores, deaths and personal progression context.`,
  },
  {
    href: 'tools.html',
    icon: ICONS.tools,
    title: 'Tools',
    text: 'Stamina planning, TibiaTools-style damage logic and profit tracking.',
  },
];

const referenceWorkspaces = [
  {
    href: 'analytics.html',
    icon: ICONS.chart,
    title: 'Progress',
    text: 'XP, highscores, sessions, kill volume, loot and performance boards.',
  },
  {
    href: 'creatures.html',
    icon: ICONS.book,
    title: 'Creature codex',
    text: 'Creature data, elemental weaknesses, habitats, loot and charm context.',
  },
  {
    href: 'charms.html',
    icon: ICONS.gem,
    title: 'Charms',
    text: 'Charm costs, effects, affordability and recommendations from your saved kills.',
  },
  {
    href: 'admin.html',
    icon: ICONS.shield,
    title: 'Logbook',
    text: 'Review, validate, import and export the analyser evidence stored in this browser.',
  },
];

function workspaceTiles(items) {
  return items.map((item) => `
    <a class="panel tile home-workspace" href="${esc(item.href)}">
      <div class="tile-top">
        <span class="home-workspace-icon">${item.icon}</span>
        <div>
          <div class="name">${esc(item.title)}</div>
          <p class="fine dim">${esc(item.text)}</p>
        </div>
      </div>
    </a>`).join('');
}

stage.innerHTML = `
  <header class="hello">
    <p class="eyebrow">Exiva XP</p>
    <h1><span class="grad-text">${esc(characterName)}</span></h1>
    <p>Plan your next hunt, read progression and turn saved analyser evidence into better decisions.</p>
  </header>

  <section class="section home-workspace-group" style="margin-top:0">
    <div class="section-bar"><h2>Daily loop</h2><span class="fine dim">Plan, hunt, save, review</span></div>
    <div class="panel home-primary-action">
      <span class="home-workspace-icon">${ICONS.compass}</span>
      <div class="home-primary-copy">
        <h3>Plan your next hunt</h3>
        <p class="fine dim">Find level-fit places, compare evidence and choose an element before you leave the depot.</p>
      </div>
      <div class="home-primary-actions">
        <a class="btn btn-primary" href="grounds.html">Open planner</a>
        <a class="btn btn-tertiary" href="submit.html">Log a hunt</a>
      </div>
    </div>
    <div class="tiles home-workspaces">
      ${workspaceTiles(dailyWorkspaces)}
    </div>
  </section>

  <section class="section home-workspace-group">
    <div class="section-bar"><h2>Reference and records</h2><span class="fine dim">Deep dives when you need them</span></div>
    <div class="tiles home-workspaces">
      ${workspaceTiles(referenceWorkspaces)}
    </div>
  </section>`;

export {};
