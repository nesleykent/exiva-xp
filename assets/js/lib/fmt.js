/** Number & duration parsing/formatting. Node-safe (no DOM). */

/** "1,234,567" | "1.5kk" | "2k" | "3.2m" | "12 345" → number | null */
export function toNumber(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = String(input).trim().toLowerCase();
  if (!s || s === '-' || s === 'n/a') return null;
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);

  const suffix = (s.match(/(kk|k|m)$/) || [])[1];
  if (suffix) s = s.slice(0, -suffix.length).trim();
  const scale = suffix === 'k' ? 1e3 : suffix ? 1e6 : 1;

  s = s.replace(/\s+/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');

  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? (negative ? -n : n) * scale : null;
}

/** "02:31h" | "2:31:12" | "1h 30m" → minutes | null */
export function toMinutes(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  let m = s.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?\s*h?$/);
  if (m) return +m[1] * 60 + +m[2] + (m[3] ? +m[3] / 60 : 0);
  m = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/);
  if (m && (m[1] || m[2])) return +(m[1] || 0) * 60 + +(m[2] || 0);
  return null;
}

export function nf(n) {
  return n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('en-US');
}

/** Tibia-style compact: 1500000 → "1.5kk", 60000 → "60k" */
export function kk(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const trim = (s) => s.replace(/\.?0+$/, '');
  if (abs >= 1e6) return sign + trim((abs / 1e6).toFixed(2)) + 'kk';
  if (abs >= 1e3) return sign + trim((abs / 1e3).toFixed(1)) + 'k';
  return sign + String(Math.round(abs));
}

/** Dashboard compact notation: 1,200,000 → "1.2M", 8,410,000,000 → "8.41B". */
export function compact(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const trim = (value) => value.replace(/\.0+$|(?<=\.[0-9])0+$/, '');
  if (abs >= 1e9) return `${sign}${trim((abs / 1e9).toFixed(2))}B`;
  if (abs >= 1e6) return `${sign}${trim((abs / 1e6).toFixed(2))}M`;
  if (abs >= 1e3) return `${sign}${trim((abs / 1e3).toFixed(1))}k`;
  return `${sign}${Math.round(abs)}`;
}

export function gp(n) { return n == null || !Number.isFinite(n) ? '—' : `${kk(n)} gp`; }

export function pct(n) { return n == null || !Number.isFinite(n) ? '—' : `${Math.round(n)}%`; }

export function hm(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function day(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Chart-axis date labels. Tooltips, tables and the inspector keep the site's
 * canonical ISO form; axes use these short human labels (same style as the
 * month filter buttons and the heatmap's month markers). String-parsed, so
 * no timezone can shift the day.
 */

/** "2026-07-19" → "Jul 19" */
export function md(iso) {
  const m = String(iso ?? '').match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${MONTHS[+m[1] - 1]} ${+m[2]}` : '—';
}

/** "2026-07" (or any longer ISO date) → "Jul 2026" */
export function ym(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})/);
  return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : '—';
}
