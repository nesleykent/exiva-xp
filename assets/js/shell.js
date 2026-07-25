/**
 * App shell: sidebar/tab-bar navigation, appearance switching, and the shared
 * DOM fragment builders every page uses. The only place chrome lives.
 */

import { esc, initials } from './lib/text.js';
import { kk, pct } from './lib/fmt.js';
import { ELEMENT_NAME } from './engine/codex.js';
import { SITE } from './data/sources.js';

// ---------------------------------------------------------------- icons

const stroke = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`;

export const ICONS = {
  home: stroke('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>'),
  user: stroke('<circle cx="12" cy="7.5" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>'),
  compass: stroke('<circle cx="12" cy="12" r="9"/><polygon points="16 8 13.5 13.5 8 16 10.5 10.5 16 8"/>'),
  tools: stroke('<path d="M14.7 6.3a4 4 0 0 0-5 5L3.8 17.2a2 2 0 1 0 3 3l5.9-5.9a4 4 0 0 0 5-5l-2.5 2.5-3-3 2.5-2.5Z"/><path d="M16 16l4 4"/>'),
  book: stroke('<path d="M12 6.5c-1.8-1.3-4.1-2-6.5-2A2 2 0 0 0 3.5 6.5V17a1 1 0 0 0 1.4.9c1.9-.9 4.3-.6 6.1.6.3.2.6.2.9 0 1.8-1.2 4.2-1.5 6.1-.6a1 1 0 0 0 1.4-.9V6.5a2 2 0 0 0-2-2c-2.4 0-4.7.7-6.5 2Z"/><line x1="12" y1="6.5" x2="12" y2="18.5"/>'),
  plus: stroke('<rect x="3" y="3" width="18" height="18" rx="6"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'),
  chart: stroke('<line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="11" width="3.4" height="9" rx="1"/><rect x="12" y="6" width="3.4" height="14" rx="1"/><rect x="18" y="14" width="3.4" height="6" rx="1" transform="translate(-2.4)"/>'),
  shield: stroke('<path d="M12 3 5 6v5c0 5 3.2 8.4 7 10 3.8-1.6 7-5 7-10V6l-7-3Z"/><polyline points="9 12 11.2 14.2 15.5 9.5"/>'),
  gem: stroke('<path d="M6 3h12l4 6-10 12L2 9Z"/><path d="M2 9h20M9 3 6 9l6 12M15 3l3 6-6 12"/>'),
  moon: stroke('<path d="M20 14A8.5 8.5 0 0 1 10 4a8 8 0 1 0 10 10Z"/>'),
  github: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.8-.22 1.65-.33 2.5-.33.85 0 1.7.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.02 10.02 0 0 0 22 12c0-5.52-4.48-10-10-10Z"/></svg>',
  sun: stroke('<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5.3" y1="5.3" x2="7" y2="7"/><line x1="17" y1="17" x2="18.7" y2="18.7"/><line x1="18.7" y1="5.3" x2="17" y2="7"/><line x1="7" y1="17" x2="5.3" y2="18.7"/>'),
};

const GLYPH = `<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="xg" x1="0" y1="1" x2="1" y2="0">
  <stop offset="0%" stop-color="#FFD600"/><stop offset="35%" stop-color="#FF0169"/><stop offset="100%" stop-color="#7638FA"/></linearGradient></defs>
  <rect x="2" y="2" width="28" height="28" rx="9" fill="none" stroke="url(#xg)" stroke-width="2.6"/>
  <path d="M10 21.5 16 9l6 12.5" fill="none" stroke="url(#xg)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="16" cy="17.2" r="1.6" fill="url(#xg)"/></svg>`;

// ---------------------------------------------------------------- shell

/* 4th field: true = also a mobile tab-bar destination. The tab bar holds
   exactly the five daily-loop surfaces (Instagram keeps five too); every
   other page stays in the desktop sidebar and on the home workspace grid. */
const NAV = [
  ['index.html', 'Home', 'home', true],
  ['character.html', 'Character', 'user', true],
  ['grounds.html', 'Planner', 'compass', true],
  ['tools.html', 'Tools', 'tools', true],
  ['creatures.html', 'Codex', 'book', false],
  ['charms.html', 'Charms', 'gem', false],
  ['submit.html', 'Log a hunt', 'plus', true],
  ['analytics.html', 'Progress', 'chart', false],
  ['admin.html', 'Logbook', 'shield', false],
];

const LOOK_KEY = 'exiva:appearance';

function applyLook(mode) {
  const dark = mode === 'dark' || (mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.appearance = dark ? 'dark' : 'light';
}

/** Build the rail and wire appearance. `active` = current page file. */
export function mountShell(active) {
  applyLook(localStorage.getItem(LOOK_KEY) || 'auto');

  document.querySelector('[data-skip-stage]')?.addEventListener('click', () => {
    const stage = document.getElementById('stage');
    if (!stage) return;
    stage.tabIndex = -1;
    stage.scrollIntoView({ block: 'start' });
    setTimeout(() => stage.focus({ preventScroll: true }), 0);
  });

  const rail = document.getElementById('rail');
  rail.innerHTML = `
    <a class="wordmark" href="index.html">${GLYPH}<span>Exiva&nbsp;XP</span></a>
    <nav class="rail-nav" aria-label="Primary">
      ${NAV.map(([href, label, icon, mobile]) => `
        <a class="rail-item${mobile ? '' : ' rail-desktop-only'}" href="${href}" ${href === active ? 'aria-current="page"' : ''} title="${esc(label)}">
          ${ICONS[icon]}<span>${esc(label)}</span>
        </a>`).join('')}
    </nav>
    <div class="rail-foot">
      <a class="rail-item" href="https://github.com/${SITE.owner}/${SITE.repo}" target="_blank" rel="noopener" title="Source on GitHub">
        ${ICONS.github}<span class="theme-label">GitHub</span>
      </a>
      <button type="button" class="rail-item" id="look-flip" title="Switch appearance">
        ${ICONS.moon}<span class="theme-label">Appearance</span>
      </button>
    </div>`;

  rail.querySelector('#look-flip').addEventListener('click', () => {
    const now = document.documentElement.dataset.appearance === 'dark' ? 'light' : 'dark';
    localStorage.setItem(LOOK_KEY, now);
    applyLook(now);
  });
}

// ---------------------------------------------------------------- helpers

export const $ = (sel, root = document) => root.querySelector(sel);

export function say(message, ms = 3000) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.role = 'status';
  t.textContent = message;
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

// ---------------------------------------------------------------- fragments

export function ring(name, { quiet = false, cls = '' } = {}) {
  return `<span class="ring ${quiet ? 'ring-quiet' : ''} ${cls}"><span class="ring-core">${esc(initials(name))}</span></span>`;
}

export function pillEl(el, extra = '') {
  return `<span class="pill el-${esc(el)}">${ELEMENT_NAME[el] || esc(el)}${extra ? ` ${extra}` : ''}</span>`;
}

/** Compact mutually-exclusive filter buttons, shared by planner and codex. */
export function segmentedControl(id, label, options, selected) {
  return `<div class="segmented" id="${esc(id)}" role="group" aria-label="${esc(label)}">
    ${options.map(([value, text]) => `<button type="button" data-value="${esc(value)}" aria-pressed="${value === selected}">${esc(text)}</button>`).join('')}
  </div>`;
}

export function bindSegmented(id, onSelect) {
  const root = document.getElementById(id);
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    root.querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    onSelect(button.dataset.value);
  });
}

const CHEVRON = '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
const CHECK = '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

/**
 * Sort control markup — a button that opens an anchored menu with a
 * checkmark on the current choice (Apple HIG's pattern for a small
 * mutually-exclusive option set), not a native <select>. `sorts` is an
 * object of `id -> [label, ...]` (grounds.js/creatures.js's SORTS table).
 */
export function sortMenu(id, sorts, selected) {
  return `
  <div class="sort-menu" id="${id}">
    <button type="button" class="sort-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}-list">
      <span class="value">${esc(sorts[selected]?.[0] || '')}</span>${CHEVRON}
    </button>
    <div class="sort-menu-list" id="${id}-list" role="menu" hidden>
      ${Object.entries(sorts).map(([key, [label]]) => `
        <button type="button" class="sort-menu-item" role="menuitemradio" aria-checked="${key === selected}" data-value="${esc(key)}">
          ${CHECK}<span>${esc(label)}</span>
        </button>`).join('')}
    </div>
  </div>`;
}

/**
 * Wires a sortMenu()'d element up; calls onSelect(key) when a choice is made.
 * Keydown is bound on `root`, not `list` — some browsers keep focus on
 * `.sort-menu-btn` after opening rather than moving it into the list (the
 * `.focus()` calls below are attempted regardless, since they do work in
 * most browsers), so both the button and the items must be able to drive
 * arrow-key navigation for the widget to be keyboard-operable everywhere.
 */
export function bindSortMenu(id, onSelect) {
  const root = document.getElementById(id);
  const btn = root.querySelector('.sort-menu-btn');
  const list = root.querySelector('.sort-menu-list');
  const items = [...root.querySelectorAll('.sort-menu-item')];
  const close = () => { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const open = (focusTarget) => {
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    (focusTarget || items.find((item) => item.getAttribute('aria-checked') === 'true') || items[0])?.focus();
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); list.hidden ? open() : close(); });
  list.addEventListener('click', (e) => {
    const item = e.target.closest('.sort-menu-item');
    if (!item) return;
    root.querySelectorAll('.sort-menu-item').forEach((el) => el.setAttribute('aria-checked', String(el === item)));
    btn.querySelector('.value').textContent = item.querySelector('span').textContent;
    close();
    btn.focus();
    onSelect(item.dataset.value);
  });
  root.addEventListener('keydown', (e) => {
    const item = e.target.closest('.sort-menu-item');
    if ((e.key === 'Enter' || e.key === ' ') && item) {
      e.preventDefault();
      item.click();
      return;
    }
    if (e.key === 'Tab') {
      close();
      return;
    }
    if (e.key === 'Escape') {
      if (list.hidden) return;
      e.preventDefault();
      close();
      btn.focus();
      return;
    }
    const opening = list.hidden;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const current = items.indexOf(document.activeElement);
    let next;
    if (e.key === 'ArrowDown') next = items[opening ? 0 : (current + 1) % items.length];
    if (e.key === 'ArrowUp') next = items[opening ? items.length - 1 : (current - 1 + items.length) % items.length];
    if (e.key === 'Home') next = items[0];
    if (e.key === 'End') next = items[items.length - 1];
    if (opening) open(next); else next?.focus();
  });
  document.addEventListener('click', (e) => { if (!root.contains(e.target)) close(); });
}

export function basisPill(basis) {
  if (basis === 'logged') return '<span class="badge badge-success">Logged</span>';
  if (basis === 'blended') return '<span class="badge badge-info">Blended</span>';
  return '<span class="badge">Curated</span>';
}

/**
 * Marks a raw XP/h that is a cross-vocation stand-in rather than a figure
 * published for this vocation — currently druid grounds falling back to
 * tibiapal's retired Mage table. Never render such a number without it.
 */
export function standInPill(from) {
  if (!from) return '';
  const title = `No druid raw XP/h published for this ground yet — showing tibiapal's retired ${from.vocation} figure for "${from.place}" (${from.levelText}). A rough stand-in, not a druid measurement.`;
  return `<span class="pill pill-warning" title="${esc(title)}">${esc(from.vocation)} stand-in</span>`;
}

export function trustMeter(trust, n) {
  const segs = Array.from({ length: 5 }, (_, i) => `<i class="${i < trust.bars ? 'on' : ''}"></i>`).join('');
  return `<span class="trust" title="${n} logged hunt${n === 1 ? '' : 's'}"><span class="seg">${segs}</span>${esc(trust.label)}</span>`;
}

/** Element meters for a damage profile (scale caps at 150%). */
export function meters(profile) {
  return Object.entries(profile).map(([el, taken]) => {
    const w = Math.min(100, (taken / 150) * 100);
    return `<div class="meter el-${esc(el)}">
      <span>${ELEMENT_NAME[el]}</span>
      <span class="lane"><span class="fill" style="width:${w.toFixed(1)}%"></span><span class="baseline" style="left:${(100 / 150 * 100).toFixed(1)}%"></span></span>
      <span class="val num">${pct(taken)}</span>
    </div>`;
  }).join('');
}

export function seriesTitle(s, fmt = kk) {
  if (!s || !s.n) return '';
  return `median ${fmt(s.med)} · ${fmt(s.lo)}–${fmt(s.hi)}${s.sd != null ? ` · σ ${fmt(s.sd)}` : ''} · n=${s.n}`;
}

/**
 * Sortable, chunk-rendered table.
 * cols: [{id, label, num?, cell(row) → html, sortVal?(row)}]
 */
export function dataTable(host, { cols, rows, sortId, sortDir = 'desc', onSort, onPick }) {
  host.innerHTML = `<div class="panel sheet"><table class="grid">
    <thead><tr>${cols.map((c) => `<th class="${c.num ? 'num ' : ''}${sortId === c.id ? 'on' : ''}" data-col="${esc(c.id)}" scope="col">${esc(c.label)}${sortId === c.id ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
    <tbody></tbody></table></div>
    <p class="fine dim count-line" style="margin-top:var(--s2)">${rows.length.toLocaleString('en-US')} rows</p>`;

  const tbody = host.querySelector('tbody');
  let at = 0;
  (function chunk() {
    if (!tbody.isConnected) return;
    const slice = rows.slice(at, at + 80);
    tbody.insertAdjacentHTML('beforeend', slice.map((row, i) =>
      `<tr data-i="${at + i}">${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.cell(row)}</td>`).join('')}</tr>`).join(''));
    at += 80;
    if (at < rows.length) requestAnimationFrame(chunk);
  }());

  if (onSort) {
    host.querySelector('thead').addEventListener('click', (e) => {
      const th = e.target.closest('th[data-col]');
      if (th) onSort(th.dataset.col);
    });
  }
  if (onPick) {
    tbody.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const tr = e.target.closest('tr[data-i]');
      if (tr) onPick(rows[+tr.dataset.i]);
    });
  }
}

export function note(kind, text) {
  return `<div class="note note-${kind}">${esc(text)}</div>`;
}
