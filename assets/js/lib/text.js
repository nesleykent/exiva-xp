/** Text normalisation & matching primitives. Node-safe. */

export function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slug(s) {
  return fold(s).replace(/['\s]+/g, '-').replace(/-+/g, '-');
}

/** Best-effort English singular ("cyclopes" → "cyclope" → fuzzy handles rest). */
export function depluralize(word) {
  const w = String(word);
  if (/(ss|us|is)$/i.test(w)) return w;
  if (/ies$/i.test(w)) return `${w.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|sses)$/i.test(w)) return w.slice(0, -2);
  if (/ves$/i.test(w)) return `${w.slice(0, -3)}f`;
  if (/men$/i.test(w)) return `${w.slice(0, -3)}man`;
  if (/oes$/i.test(w)) return w.slice(0, -2);
  if (/s$/i.test(w)) return w.slice(0, -1);
  return w;
}

export function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** 0..1 closeness. */
export function closeness(a, b) {
  const span = Math.max(a.length, b.length);
  return span ? 1 - editDistance(a, b) / span : 1;
}

/** Whitespace-insensitive FNV-1a fingerprint (duplicate detection). */
export function fingerprint(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
}
