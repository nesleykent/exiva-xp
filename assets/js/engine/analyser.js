/**
 * Hunting Analyser reader. Line-classifier design: every line of the pasted
 * log is classified once (session header, labelled stat, section marker,
 * count entry) and folded into the session record. Tolerates label case and
 * punctuation variance, comma/dot/space separators, k/kk/m suffixes, and both
 * "312x cyclops" and "cyclops x312" count forms. Missing values are derived
 * only when arithmetic allows (duration from timestamps, rates from gains);
 * a genuinely absent value stays null. `raw` keeps the paste verbatim.
 * Node-safe.
 */

import { toNumber, toMinutes } from '../lib/fmt.js';

const STATS = [
  ['xpRawRate', /^raw\s*xp\s*\/\s*h/i],
  ['xpRaw', /^raw\s*xp\s*gain/i],
  ['xpRate', /^xp\s*\/\s*h/i],
  ['xp', /^xp\s*gain/i],
  ['loot', /^loot\b(?!ed)/i],
  ['supplies', /^supplies/i],
  ['balance', /^balance/i],
  ['damageRate', /^damage\s*\/\s*h/i],
  ['damage', /^damage\b/i],
  ['healingRate', /^healing\s*\/\s*h/i],
  ['healing', /^healing\b/i],
];

const RANGE = /from\s+(\d{4}-\d{2}-\d{2})[,\s]+(\d{2}:\d{2}(?::\d{2})?)\s+to\s+(\d{4}-\d{2}-\d{2})[,\s]+(\d{2}:\d{2}(?::\d{2})?)/i;

function classify(line) {
  if (RANGE.test(line)) return { kind: 'range', match: line.match(RANGE) };
  if (/^(killed\s+monsters|kills)\b/i.test(line)) return { kind: 'section', list: 'kills' };
  if (/^(looted\s+items|loot\s+items)\b/i.test(line)) return { kind: 'section', list: 'drops' };
  if (/^session\s*:?\s*\d/i.test(line)) {
    return { kind: 'clock', minutes: toMinutes(line.replace(/^session\s*:?\s*/i, '')) };
  }
  for (const [field, re] of STATS) {
    if (re.test(line)) {
      return { kind: 'stat', field, value: toNumber(line.replace(/^[^:]*:\s*/, '').replace(re, '')) };
    }
  }
  let m = line.match(/^(\d[\d,.]*)\s*x\s+(.+)$/i) || null;
  if (m) return { kind: 'entry', n: toNumber(m[1]), name: m[2].trim() };
  m = line.match(/^(.+?)\s+x\s*(\d[\d,.]*)$/i);
  if (m) return { kind: 'entry', n: toNumber(m[2]), name: m[1].trim() };
  m = line.match(/^(\d[\d,.]*)\s+(\D.*)$/);
  if (m) return { kind: 'entry', n: toNumber(m[1]), name: m[2].trim() };
  return { kind: 'noise' };
}

function stamp(date, time) {
  const d = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** @param {string} text pasted analyser @returns session record */
export function readAnalyser(text) {
  const session = {
    startedAt: null, endedAt: null, minutes: null,
    xpRaw: null, xp: null, xpRawRate: null, xpRate: null,
    loot: null, supplies: null, balance: null,
    damage: null, damageRate: null, healing: null, healingRate: null,
    kills: [], drops: [],
    raw: String(text ?? ''),
  };

  let list = null;
  for (const rawLine of session.raw.split(/\r?\n/)) {
    const line = rawLine.replace(/^[\s•*-]+/, '').trim();
    if (!line) continue;
    const c = classify(line);
    switch (c.kind) {
      case 'range':
        session.startedAt = stamp(c.match[1], c.match[2]);
        session.endedAt = stamp(c.match[3], c.match[4]);
        list = null;
        break;
      case 'clock':
        if (c.minutes != null) session.minutes = c.minutes;
        list = null;
        break;
      case 'section':
        list = c.list;
        break;
      case 'stat':
        if (c.value != null && session[c.field] == null) session[c.field] = c.value;
        list = null;
        break;
      case 'entry':
        if (list && c.name && c.n != null) session[list].push({ name: c.name, n: c.n });
        break;
      default:
        if (list && /^none$/i.test(line)) list = null;
    }
  }

  if (session.minutes == null && session.startedAt && session.endedAt) {
    const ms = new Date(session.endedAt) - new Date(session.startedAt);
    if (ms > 0) session.minutes = ms / 60_000;
  }
  const hours = session.minutes > 0 ? session.minutes / 60 : null;
  if (hours) {
    for (const [gain, rate] of [['xpRaw', 'xpRawRate'], ['xp', 'xpRate'], ['damage', 'damageRate'], ['healing', 'healingRate']]) {
      if (session[rate] == null && session[gain] != null) session[rate] = session[gain] / hours;
    }
  }
  return session;
}

/** Does the text plausibly contain a hunting analyser at all? */
export function isAnalyser(session) {
  return session.xpRaw != null || session.xpRawRate != null || session.xp != null
    || session.loot != null || session.kills.length > 0;
}
