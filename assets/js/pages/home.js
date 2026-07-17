/**
 * Home — app start screen. Character intelligence lives on character.html;
 * this route is the doorway into the working surfaces.
 */

import { boot } from './_boot.js';
import { esc } from '../lib/text.js';
import { day, nf } from '../lib/fmt.js';
import { ICONS, ring } from '../shell.js';
import { loadCharacter, loadCharacterHistory, logbook } from '../data/sources.js';

const { stage, codex, grounds, config } = await boot('index.html', { codex: true, grounds: true, config: true });
const [profile, history] = await Promise.all([loadCharacter(), loadCharacterHistory()]);

const latest = history[history.length - 1] || null;
const hunts = logbook();
const characterName = profile?.name || config.name;

const workspaces = [
  {
    href: 'character.html',
    icon: ring(characterName, { quiet: true }),
    title: 'Character dashboard',
    text: `${characterName} profile, XP history, highscores, deaths and personal progression context.`,
  },
  {
    href: 'grounds.html',
    icon: ICONS.compass,
    title: 'Hunt planner',
    text: 'Level-fit hunting places, creature overlap, XP, profit and element advice.',
  },
  {
    href: 'submit.html',
    icon: ICONS.plus,
    title: 'Save analyser',
    text: 'Paste a Hunting Analyser session into the private logbook.',
  },
  {
    href: 'tools.html',
    icon: ICONS.tools,
    title: 'Tools',
    text: 'Stamina planning, TibiaTools-style damage logic and profit tracking.',
  },
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
];

stage.innerHTML = `
  <header class="hello">
    <p class="eyebrow">Exiva XP</p>
    <h1><span class="grad-text">Tibia character intelligence</span></h1>
    <p>A private-first workspace for ${esc(characterName)}. Start here, then open the character dashboard, planner, analyser log, tools or progression boards.</p>
    <div class="actions">
      <a class="btn btn-primary btn-lg" href="character.html">Open character dashboard</a>
      <a class="btn btn-tertiary btn-lg" href="grounds.html">Plan next hunt</a>
    </div>
  </header>

  <section class="section" style="margin-top:0">
    <div class="section-bar"><h2>Workspaces</h2><span class="fine dim">${esc(characterName)} workspace</span></div>
    <div class="tiles home-workspaces">
      ${workspaces.map((item) => `
        <a class="panel tile home-workspace" href="${esc(item.href)}">
          <div class="tile-top">
            <span class="home-workspace-icon">${item.icon}</span>
            <div>
              <div class="name">${esc(item.title)}</div>
              <p class="fine dim">${esc(item.text)}</p>
            </div>
          </div>
        </a>`).join('')}
    </div>
  </section>

  <section class="section">
    <div class="section-bar"><h2>Current context</h2><a class="fine dim" href="character.html">Character dashboard</a></div>
    <div class="pulse-row">
      <div class="panel pulse"><div class="big num">${nf(profile?.level)}</div><div class="eyebrow">Profile level</div></div>
      <div class="panel pulse"><div class="big num">${nf(latest?.level)}</div><div class="eyebrow">Tracked highscore level</div></div>
      <div class="panel pulse"><div class="big num">${nf(history.length)}</div><div class="eyebrow">Tracked days</div></div>
      <div class="panel pulse"><div class="big num">${nf(hunts.length)}</div><div class="eyebrow">Logged hunts</div></div>
      <div class="panel pulse"><div class="big num">${nf(grounds.directory.length)}</div><div class="eyebrow">Planner grounds</div></div>
      <div class="panel pulse"><div class="big num">${nf(codex.size)}</div><div class="eyebrow">Creatures</div></div>
    </div>
    <p class="fine dim">Profile update ${profile?.updatedAt ? day(profile.updatedAt) : 'pending'} · tracker row ${latest?.date || 'pending'}</p>
  </section>`;

export {};
