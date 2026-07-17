/** Hand-rolled SVG visualisations — zero dependencies, GitHub Pages friendly. */

import { esc } from '../lib/text.js';
import { kk, nf } from '../lib/fmt.js';

const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

/** Horizontal bars: data = [{key, n}]. */
export function bars(data, { width = 720, rowH = 22, gap = 10, labelW = 290, fmt = kk } = {}) {
  const height = data.length * (rowH + gap) + gap;
  const top = Math.max(...data.map((d) => d.n), 1);
  const laneW = width - labelW - 86;
  const body = data.map((d, i) => {
    const y = gap + i * (rowH + gap);
    const w = Math.max(2, (d.n / top) * laneW);
    return `<g>
      <text class="vlabel" x="${labelW - 8}" y="${y + rowH / 2}" text-anchor="end" dominant-baseline="central">${esc(clip(d.key, 42))}</text>
      <rect class="vbar" x="${labelW}" y="${y}" width="${w.toFixed(1)}" height="${rowH}" rx="4"><title>${esc(d.key)}: ${fmt(d.n)}</title></rect>
      <text class="vvalue" x="${labelW + w + 8}" y="${y + rowH / 2}" dominant-baseline="central">${fmt(d.n)}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

/**
 * Time series line + area: data = [{key, n}] in order.
 * `baseline: 'min'` anchors the y-axis at the series minimum instead of 0 —
 * for cumulative series (total XP) whose interesting movement is far above
 * zero; rate-style series keep the honest zero baseline.
 */
export function flow(data, { width = 720, height = 210, baseline = 'zero', fmt = kk, axisFmt = fmt } = {}) {
  if (!data.length) return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"></svg>`;
  const pad = { t: 14, r: 14, b: 26, l: 42 };
  const top = Math.max(...data.map((d) => d.n), 1);
  const lo = baseline === 'min' ? Math.min(...data.map((d) => d.n)) : 0;
  const span = Math.max(top - lo, 1);
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const x = (i) => pad.l + (data.length === 1 ? w / 2 : (i / (data.length - 1)) * w);
  const y = (v) => pad.t + h - ((v - lo) / span) * h;

  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.n).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${x(data.length - 1).toFixed(1)},${pad.t + h} L${x(0).toFixed(1)},${pad.t + h} Z`;
  const dots = data.map((d, i) =>
    `<circle class="vdot" cx="${x(i).toFixed(1)}" cy="${y(d.n).toFixed(1)}" r="3" data-id="${esc(d.id ?? d.key)}" data-key="${esc(d.key)}" data-value="${esc(d.n)}" data-label="${esc(`${d.key}: ${fmt(d.n)}`)}"><title>${esc(d.key)}: ${fmt(d.n)}</title></circle>`).join('');
  const events = data.flatMap((d, i) => (d.events || []).map((event, eventIndex) => {
    const cx = x(i) + (eventIndex * 8);
    const cy = y(d.n) - 9;
    if (event.type === 'death') {
      return `<g class="vevent vevent-death"><path d="M${(cx - 4).toFixed(1)} ${(cy - 4).toFixed(1)}L${(cx + 4).toFixed(1)} ${(cy + 4).toFixed(1)}M${(cx + 4).toFixed(1)} ${(cy - 4).toFixed(1)}L${(cx - 4).toFixed(1)} ${(cy + 4).toFixed(1)}"/><title>${esc(event.label)}</title></g>`;
    }
    return `<circle class="vevent vevent-level" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5"><title>${esc(event.label)}</title></circle>`;
  })).join('');
  const grid = [0, 0.5, 1].map((f) => {
    const gy = (pad.t + h - f * h).toFixed(1);
    return `<line class="vaxis" x1="${pad.l}" y1="${gy}" x2="${width - pad.r}" y2="${gy}"/>
      <text class="vtick" x="${pad.l - 6}" y="${gy}" text-anchor="end" dominant-baseline="central">${axisFmt(lo + span * f)}</text>`;
  }).join('');
  const marks = [...new Set([0, (data.length - 1) >> 1, data.length - 1])].map((i) =>
    `<text class="vtick" x="${x(i).toFixed(1)}" y="${height - 6}" text-anchor="middle">${esc(data[i].key)}</text>`).join('');

  return `<svg viewBox="0 0 ${width} ${height}" role="img" xmlns="http://www.w3.org/2000/svg">${grid}<path class="varea" d="${area}"/><path class="vline" d="${line}"/>${dots}${events}${marks}</svg>`;
}

/** Compact independently-scaled trend, for table/card rows where a full axis would overstate precision. */
export function sparkline(data, { width = 220, height = 58, fmt = nf } = {}) {
  if (!data.length) return '';
  const pad = { t: 6, r: 8, b: 16, l: 8 };
  const top = Math.max(...data.map((d) => d.n), 1);
  const lo = Math.min(...data.map((d) => d.n));
  const span = Math.max(top - lo, 1);
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const x = (i) => pad.l + (data.length === 1 ? w / 2 : (i / (data.length - 1)) * w);
  const y = (v) => pad.t + h - ((v - lo) / span) * h;
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.n).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${x(data.length - 1).toFixed(1)},${pad.t + h} L${x(0).toFixed(1)},${pad.t + h} Z`;
  const start = data[0];
  const end = data.at(-1);
  return `<svg class="sparkline-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`${start.key} ${fmt(start.n)} to ${end.key} ${fmt(end.n)}`)}" xmlns="http://www.w3.org/2000/svg">
    <path class="varea" d="${area}"/>
    <path class="vline" d="${line}"/>
    <circle class="vdot" cx="${x(data.length - 1).toFixed(1)}" cy="${y(end.n).toFixed(1)}" r="3"><title>${esc(end.key)}: ${fmt(end.n)}</title></circle>
    <text class="vtick" x="${pad.l}" y="${height - 3}">${esc(start.key)}</text>
    <text class="vtick" x="${width - pad.r}" y="${height - 3}" text-anchor="end">${esc(end.key)}</text>
  </svg>`;
}

/**
 * Pointer tooltip for flow() charts: highlights the nearest dot and shows
 * its key/value readout. Binds once per container (dataset flag) and reads
 * the live dots on every move, so it survives chart re-renders inside the
 * same container (metric/range switches replace the svg, not the wrapper).
 */
export function attachFlowHover(container) {
  if (!container || container.dataset.vizHover) return;
  container.dataset.vizHover = '1';
  const tip = document.createElement('div');
  tip.className = 'viz-tip';
  tip.hidden = true;
  container.append(tip);

  const reset = () => {
    tip.hidden = true;
    container.querySelectorAll('.vdot').forEach((d) => d.setAttribute('r', 3));
  };

  const pick = (e) => {
    const dots = [...container.querySelectorAll('.vdot')];
    if (!dots.length) return reset();
    let best = null;
    let bestDx = Infinity;
    for (const d of dots) {
      const r = d.getBoundingClientRect();
      const dx = Math.abs(r.left + r.width / 2 - e.clientX);
      if (dx < bestDx) { bestDx = dx; best = d; }
    }
    if (!best) return reset();
    dots.forEach((d) => d.setAttribute('r', d === best ? 5 : 3));
    tip.textContent = best.querySelector('title')?.textContent || '';
    if (!tip.textContent) return reset();
    container.dispatchEvent(new CustomEvent('viz:pick', {
      bubbles: true,
      detail: { id: best.dataset.id, key: best.dataset.key, value: Number(best.dataset.value), label: best.dataset.label },
    }));
    const box = container.getBoundingClientRect();
    const r = best.getBoundingClientRect();
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max(r.left + r.width / 2 - box.left, 40), box.width - 40)}px`;
    tip.style.top = `${r.top - box.top}px`;
  };
  container.addEventListener('pointermove', pick);
  container.addEventListener('pointerdown', pick);
  container.addEventListener('pointerleave', reset);
  // a resize (phone rotation, devtools) invalidates the tip's inline px
  // position — it would otherwise render stranded outside the container
  window.addEventListener('resize', reset);
}
