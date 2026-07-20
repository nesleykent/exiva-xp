/**
 * Hand-rolled SVG visualisations — zero dependencies, GitHub Pages friendly.
 *
 * One convention for every chart on the site:
 * - Gridlines/axes: solid hairlines in rgb(var(--line)), recessive; y-ticks
 *   snap to clean rounded values (1/2/5-style steps). Ranked bar lists carry
 *   no grid — every bar is direct-labelled, so the labels are the axis.
 * - Marks: 2px lines, ≤24px bars rounded only at the data end, dots with a
 *   2px surface ring; dots hide past 48 points and reappear under the cursor.
 * - Labels: short "Jul 19"-style dates on axes; the canonical ISO date stays
 *   in tooltips, tables and the inspector. Text wears text tokens, never the
 *   series colour.
 * - Colour: three deliberate gradient-as-data-colour exceptions (see
 *   AGENTS.md §5), everything else stays blue. (1) The primary time-series
 *   line/area in flow()/sparkline() wears the brand hero gradient (rose →
 *   magenta → purple). (2) bars(): the row holding the actual max value
 *   (by value, not row order) wears the gradient; every other row is a flat
 *   de-emphasis grey, never blue — the gradient marks the answer in a
 *   ranking, not just the longest bar. (3) .badge-highlight (pages.css) for
 *   a single top-ranked list item. green/red are reserved for level-up/death
 *   markers and signed deltas. categorical()/donut() use a fixed brand-hue
 *   set (--brand-*) for non-elemental groupings only — assigned in fixed
 *   order, never cycled, overflow folds into a grey "Other". Real elemental
 *   data keeps the --c-* element palette so fire and ice stay distinguishable.
 * - Tooltips: one shared hover layer (attachVizHover) — value leads, label
 *   follows; a crosshair snaps to the nearest point on line charts, and every
 *   bar/segment/cell is its own hit target. Native <title> stays as the
 *   no-JS fallback on SVG marks.
 * - Empty states: chart bodies render vizEmpty(...) so missing data is
 *   stated, never a blank plot.
 * - Sizing: charts render at their container's true pixel width via
 *   chartInto(), so one SVG unit is one CSS pixel — text, strokes and
 *   markers land exactly on the design-system tokens at every viewport
 *   instead of scaling with the viewBox.
 */

import { esc } from '../lib/text.js';
import { kk, nf } from '../lib/fmt.js';

const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

// Unique per-chart gradient ids — url(#id) references resolve document-wide,
// so two charts sharing an id would silently repaint each other on redraw.
let gradSeq = 0;
function flowGradientDefs() {
  const id = gradSeq++;
  const line = `viz-grad-line-${id}`;
  const area = `viz-grad-area-${id}`;
  return {
    line, area,
    defs: `<defs>
      <linearGradient id="${line}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" style="stop-color:var(--grad-rose)"/>
        <stop offset="50%" style="stop-color:var(--grad-magenta)"/>
        <stop offset="100%" style="stop-color:var(--grad-purple)"/>
      </linearGradient>
      <linearGradient id="${area}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style="stop-color:var(--grad-rose);stop-opacity:.2"/>
        <stop offset="100%" style="stop-color:var(--grad-rose);stop-opacity:0"/>
      </linearGradient>
    </defs>`,
  };
}

/** Standard in-panel empty state — one look for every chart with no rows. */
export function vizEmpty(message = 'No data for this range yet.') {
  return `<p class="viz-empty">${esc(message)}</p>`;
}

/**
 * Mount a chart into a container at the container's true pixel width, and
 * re-render whenever that width changes (resize, rotation, tab reveal).
 * `build(width)` returns the chart's HTML. A hidden container (width 0)
 * renders on the first refresh after it gains a size. ResizeObserver drives
 * refreshes where available, with a window-resize fallback — some embedded
 * browsers deliver resize events but not observer callbacks; refreshCharts()
 * also lets tab reveals refresh explicitly.
 */
const vizMounts = new Set();
let vizObserver = null;
let vizResizeTimer = 0;
function renderMount(el) {
  if (!el.isConnected) { vizMounts.delete(el); vizObserver?.unobserve(el); return; }
  const w = Math.round(el.getBoundingClientRect().width);
  if (!w || w === el.__vizW) return;
  el.__vizW = w;
  el.innerHTML = el.__vizBuild(w);
}
export function refreshCharts() {
  vizMounts.forEach(renderMount);
}
export function chartInto(el, build) {
  if (!el || !build) return;
  el.__vizBuild = build;
  el.__vizW = 0; // force a rebuild even at an unchanged width — the data may have changed
  if (!vizMounts.size) {
    if (typeof ResizeObserver !== 'undefined') {
      vizObserver = new ResizeObserver((entries) => entries.forEach((entry) => renderMount(entry.target)));
    }
    window.addEventListener('resize', () => {
      clearTimeout(vizResizeTimer);
      vizResizeTimer = setTimeout(refreshCharts, 120);
    });
  }
  if (!vizMounts.has(el)) { vizMounts.add(el); vizObserver?.observe(el); }
  renderMount(el);
}

/**
 * Clean axis ticks: a 1/2/2.5/5 × 10^k step covering [min, max] with at most
 * `n` intervals. The 2.5 step is only offered once it lands on integers —
 * every series here (XP, gold, counts, ranks) is integer-valued.
 */
function niceTicks(min, max, n = 4) {
  const span = Math.max(max - min, 1);
  const pow = 10 ** Math.floor(Math.log10(span / n));
  const steps = pow >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10];
  const step = Math.max(steps.map((m) => m * pow).find((s) => span / s <= n) || 10 * pow, 1);
  const lo = Math.floor(min / step) * step;
  const ticks = [];
  // the last tick must clear the data max, or the line would overshoot the grid
  for (let k = 0; k < 12; k++) {
    ticks.push(lo + k * step);
    if (ticks.at(-1) >= max) break;
  }
  if (ticks.length < 2) ticks.push(lo + step);
  return { lo, hi: ticks.at(-1), ticks };
}

/**
 * Horizontal bars: data = [{key, n}]. Whichever row holds the max value wears
 * the brand hero gradient (found by value, not row 0 — weekday-style callers
 * list rows chronologically, not ranked), matching the reference mockup's
 * ranked-bar treatment (creature damage sources, XP/h by ground, ground
 * population); every other row is a muted de-emphasis grey so the leader
 * reads as the answer, not just the longest bar. Direct-labelled, so no grid.
 */
export function bars(data, { width = 720, rowH = 22, gap = 10, labelW, fmt = kk, empty } = {}) {
  if (!data.length) return vizEmpty(empty);
  // the label column keeps its share of a narrow chart instead of a fixed
  // 290px that would swallow the whole lane on a phone
  labelW ??= Math.max(120, Math.min(290, Math.round(width * 0.4)));
  const labelChars = Math.max(14, Math.floor(labelW / 6.5));
  const height = data.length * (rowH + gap) + gap;
  const top = Math.max(...data.map((d) => d.n), 1);
  // the leader is whichever row actually holds the max value, not row 0 —
  // some callers (weekday averages) list rows chronologically, not ranked
  const topIdx = data.findIndex((d) => d.n === top);
  const laneW = width - labelW - 86;
  const gradId = `viz-grad-bar-${gradSeq++}`;
  const defs = `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" style="stop-color:var(--grad-rose)"/>
    <stop offset="50%" style="stop-color:var(--grad-magenta)"/>
    <stop offset="100%" style="stop-color:var(--grad-purple)"/>
  </linearGradient></defs>`;
  const body = data.map((d, i) => {
    const y = gap + i * (rowH + gap);
    const w = Math.max(2, (d.n / top) * laneW);
    const r = Math.min(4, w / 2);
    // rounded at the data end only; square where the bar meets its label
    const bar = `M${labelW},${y} h${(w - r).toFixed(1)} a${r},${r} 0 0 1 ${r},${r} v${rowH - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${(w - r).toFixed(1)} Z`;
    const isLead = i === topIdx;
    const fill = isLead ? ` fill="url(#${gradId})"` : '';
    return `<g>
      <text class="vlabel" x="${labelW - 8}" y="${y + rowH / 2}" text-anchor="end" dominant-baseline="central">${esc(clip(d.key, labelChars))}</text>
      <path class="vbar${isLead ? '' : ' vbar-rest'}" d="${bar}"${fill} data-v="${esc(fmt(d.n))}" data-l="${esc(d.key)}"><title>${esc(d.key)}: ${fmt(d.n)}</title></path>
      <text class="vvalue" x="${labelW + w + 8}" y="${y + rowH / 2}" dominant-baseline="central">${fmt(d.n)}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" xmlns="http://www.w3.org/2000/svg">${defs}${body}</svg>`;
}

/**
 * Time series line + area: data = [{key, n, id?, label?, events?}] in order.
 * `key` is the short axis label; `label` (default: key) is the tooltip line.
 * `baseline: 'min'` anchors the y-axis at the series minimum instead of 0 —
 * for cumulative series (total XP) whose interesting movement is far above
 * zero; rate-style series keep the honest zero baseline.
 */
export function flow(data, { width = 720, height = 210, baseline = 'zero', fmt = kk, axisFmt = fmt, empty } = {}) {
  if (!data.length) return vizEmpty(empty);
  const pad = { t: 16, r: 16, b: 26, l: 46 }; // t/r on the spacing scale; b = axis band, l = tick gutter
  const max = Math.max(...data.map((d) => d.n), baseline === 'min' ? -Infinity : 1);
  const min = baseline === 'min' ? Math.min(...data.map((d) => d.n)) : 0;
  const { lo, hi, ticks } = niceTicks(min, max);
  const span = Math.max(hi - lo, 1);
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const x = (i) => pad.l + (data.length === 1 ? w / 2 : (i / (data.length - 1)) * w);
  const y = (v) => pad.t + h - ((v - lo) / span) * h;
  const last = data.length - 1;

  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.n).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${x(last).toFixed(1)},${pad.t + h} L${x(0).toFixed(1)},${pad.t + h} Z`;
  // past 48 points the dot row reads as noise — hide the marks and let the
  // hover layer surface the nearest one (data-r is each dot's resting size).
  // The current/last point stays visible regardless — the reference mockup
  // always marks "you are here" with a small solid dot at the line's end.
  const dotR = data.length > 48 ? 0 : 3;
  const dots = data.map((d, i) => {
    const r = i === last ? Math.max(dotR, 3) : dotR;
    const cls = i === last ? 'vdot vdot-current' : 'vdot';
    return `<circle class="${cls}" cx="${x(i).toFixed(1)}" cy="${y(d.n).toFixed(1)}" r="${r}" data-r="${dotR}" data-id="${esc(d.id ?? d.key)}" data-key="${esc(d.key)}" data-value="${esc(d.n)}" data-v="${esc(fmt(d.n))}" data-l="${esc(d.label ?? d.key)}"><title>${esc(d.label ?? d.key)}: ${fmt(d.n)}</title></circle>`;
  }).join('');
  const events = data.flatMap((d, i) => (d.events || []).map((event, eventIndex) => {
    const cx = x(i) + (eventIndex * 8);
    const cy = y(d.n) - 9;
    const cls = event.type === 'death' ? 'vevent-death' : 'vevent-level';
    return `<circle class="vevent ${cls}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5"><title>${esc(event.label)}</title></circle>`;
  })).join('');
  const grid = ticks.map((v) =>
    `<line class="vaxis" x1="${pad.l}" y1="${y(v).toFixed(1)}" x2="${width - pad.r}" y2="${y(v).toFixed(1)}"/>
      <text class="vtick" x="${pad.l - 6}" y="${y(v).toFixed(1)}" text-anchor="end" dominant-baseline="central">${axisFmt(v)}</text>`).join('');
  // a narrow chart carries three date labels, a wide one four
  const xIdx = [...new Set(data.length >= 8 && width >= 520
    ? [0, Math.round(last / 3), Math.round((2 * last) / 3), last]
    : [0, last >> 1, last])];
  // edge labels anchor inward so they never clip at the viewBox
  const anchor = (i) => (i === 0 ? 'start' : i === last ? 'end' : 'middle');
  const marks = xIdx.map((i) =>
    `<text class="vtick" x="${x(i).toFixed(1)}" y="${height - 6}" text-anchor="${anchor(i)}">${esc(data[i].key)}</text>`).join('');
  const grad = flowGradientDefs();

  return `<svg viewBox="0 0 ${width} ${height}" role="img" data-pt="${pad.t}" data-ph="${h}" xmlns="http://www.w3.org/2000/svg">${grad.defs}${grid}<path class="varea" fill="url(#${grad.area})" d="${area}"/><path class="vline" stroke="url(#${grad.line})" d="${line}"/>${dots}${events}${marks}</svg>`;
}

/**
 * Legend row for a flow() chart: series swatch + value, plus level-up/death
 * keys only when the series actually carries those event types — an unused
 * key would promise markers the data never shows.
 */
export function flowLegend(data, seriesLabel, fmt = kk) {
  if (!data.length) return '';
  const last = data.at(-1);
  const hasLevel = data.some((d) => (d.events || []).some((e) => e.type === 'level'));
  const hasDeath = data.some((d) => (d.events || []).some((e) => e.type === 'death'));
  return `<ul class="viz-legend">
    <li><i class="viz-legend-swatch viz-legend-line"></i>${esc(seriesLabel)} <b class="num">${fmt(last.n)}</b></li>
    ${hasLevel ? '<li><i class="viz-legend-swatch viz-legend-level"></i>Level-up</li>' : ''}
    ${hasDeath ? '<li><i class="viz-legend-swatch viz-legend-death"></i>Death</li>' : ''}
  </ul>`;
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
  const grad = flowGradientDefs();
  // fs-11 tabular numerals average ~6.5px/char (same estimate clip() uses);
  // a narrow card (e.g. a 4-up KPI grid at in-between viewports, ~90-130px)
  // has too little room for both edge labels — drop the start label rather
  // than let them collide into unreadable overlapping text.
  const labelW = (s) => s.length * 6.5;
  const roomForBoth = labelW(start.key) + labelW(end.key) + 12 <= w;
  return `<svg class="sparkline-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`${start.key} ${fmt(start.n)} to ${end.key} ${fmt(end.n)}`)}" xmlns="http://www.w3.org/2000/svg">
    ${grad.defs}
    <path class="varea" fill="url(#${grad.area})" d="${area}"/>
    <path class="vline" stroke="url(#${grad.line})" d="${line}"/>
    <circle class="vdot" cx="${x(data.length - 1).toFixed(1)}" cy="${y(end.n).toFixed(1)}" r="3.5"><title>${esc(end.key)}: ${fmt(end.n)}</title></circle>
    ${roomForBoth ? `<text class="vtick" x="${pad.l}" y="${height - 3}">${esc(start.key)}</text>` : ''}
    <text class="vtick" x="${width - pad.r}" y="${height - 3}" text-anchor="end">${esc(end.key)}</text>
  </svg>`;
}

/**
 * Brand-family categorical set for non-elemental groupings (grounds, sources
 * — never real element data, which stays on the --c-* palette so a reader
 * can still tell fire from ice). Matches the reference mockup's donut/ranked
 * charts, which use the brand hue family rather than the element palette for
 * these breakdowns. Fixed assignment order; grey is reserved for the "Other"
 * fold so a real category never wears it.
 */
export const CATEGORICAL = ['--brand-rose', '--brand-magenta', '--brand-purple', '--brand-orange', '--brand-yellow'];
const OTHER_COLOR = '--c-physical';

/**
 * Assign categorical colours in fixed order, capped at `max` slots — the tail
 * folds into one grey "Other" row instead of cycling hues (a reused hue would
 * make two categories indistinguishable). Returns [{key, n, color, other?}].
 */
export function categorical(data, max = 6) {
  const rows = data.length > max
    ? [...data.slice(0, max - 1), {
      key: `Other (${data.length - (max - 1)} more)`,
      n: data.slice(max - 1).reduce((sum, d) => sum + d.n, 0),
      other: true,
    }]
    : data;
  return rows.map((d, i) => ({ ...d, color: d.other ? OTHER_COLOR : CATEGORICAL[i] }));
}

/**
 * Part-to-whole donut over categorical() rows (stacked stroke-dasharray arcs
 * on one circle). Segments keep a 2px surface gap — the gap separates them,
 * never a stroke. Center carries the formatted total.
 */
export function donut(rows, { size = 160, fmt = kk, label = '' } = {}) {
  const total = rows.reduce((sum, d) => sum + d.n, 0);
  if (!total) return vizEmpty();
  const r = Math.round(size * 0.37);
  const cx = size / 2;
  const cy = size / 2;
  const sw = Math.round(size * 0.15);
  const circumference = 2 * Math.PI * r;
  const gap = rows.length > 1 ? 2 : 0;
  let offset = 0;
  const arcs = rows.map((d) => {
    const frac = d.n / total;
    const dash = Math.max(0.5, frac * circumference - gap);
    const pctShare = Math.round(frac * 100);
    const seg = `<circle class="vdonut-seg" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgb(var(${d.color}))" stroke-width="${sw}" stroke-dasharray="${dash.toFixed(1)} ${(circumference - dash).toFixed(1)}" stroke-dashoffset="${(-(offset + gap / 2)).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" data-v="${esc(`${fmt(d.n)} · ${pctShare}%`)}" data-l="${esc(d.key)}"><title>${esc(d.key)}: ${fmt(d.n)} (${pctShare}%)</title></circle>`;
    offset += frac * circumference;
    return seg;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" role="img"${label ? ` aria-label="${esc(label)}"` : ''} xmlns="http://www.w3.org/2000/svg">${arcs}<text class="vdonut-total" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central">${fmt(total)}</text></svg>`;
}

/**
 * Shared hover layer for every chart panel: a two-line tooltip (value leads,
 * label follows) plus a crosshair that snaps to the nearest point on flow()
 * charts. Any mark carrying data-v/data-l (bars, donut segments, heatmap
 * cells) is its own hit target. Binds once per container (dataset flag) and
 * reads the live marks on every move, so it survives chart re-renders inside
 * the same container (metric/range switches replace the svg, not the wrapper).
 */
export function attachVizHover(container) {
  if (!container || container.dataset.vizHover) return;
  container.dataset.vizHover = '1';
  const tip = document.createElement('div');
  tip.className = 'viz-tip';
  tip.hidden = true;
  const tipValue = document.createElement('b');
  const tipLabel = document.createElement('span');
  tip.append(tipValue, tipLabel);
  const cross = document.createElement('div');
  cross.className = 'viz-cross';
  cross.hidden = true;
  container.append(cross, tip);

  const reset = () => {
    tip.hidden = true;
    cross.hidden = true;
    container.querySelectorAll('.vdot').forEach((d) => d.setAttribute('r', d.dataset.r ?? 3));
  };

  const place = (xPx, topPx, box) => {
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max(xPx, 40), box.width - 40)}px`;
    tip.style.top = `${topPx}px`;
  };

  const pick = (e) => {
    const box = container.getBoundingClientRect();
    // per-mark tips: bars, donut segments, heatmap cells
    const mark = e.target.closest?.('[data-v]');
    if (mark && !mark.classList.contains('vdot')) {
      cross.hidden = true;
      container.querySelectorAll('.vdot').forEach((d) => d.setAttribute('r', d.dataset.r ?? 3));
      tipValue.textContent = mark.dataset.v;
      tipLabel.textContent = mark.dataset.l || '';
      const r = mark.getBoundingClientRect();
      return place(e.clientX - box.left, r.top - box.top, box);
    }
    // nearest-point crosshair for flow() charts
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
    dots.forEach((d) => d.setAttribute('r', d === best ? 5 : (d.dataset.r ?? 3)));
    tipValue.textContent = best.dataset.v || '';
    tipLabel.textContent = best.dataset.l || '';
    if (!best.dataset.v) return reset();
    container.dispatchEvent(new CustomEvent('viz:pick', {
      bubbles: true,
      detail: { id: best.dataset.id, key: best.dataset.key, value: Number(best.dataset.value), label: `${best.dataset.l}: ${best.dataset.v}` },
    }));
    const dotBox = best.getBoundingClientRect();
    const dotX = dotBox.left + dotBox.width / 2 - box.left;
    place(dotX, dotBox.top - box.top, box);
    // crosshair spans the plot area (data-pt/data-ph on the svg, in viewBox
    // units) — scale to rendered pixels via the svg's current size
    const svg = best.ownerSVGElement;
    const svgBox = svg.getBoundingClientRect();
    const vbH = svg.viewBox?.baseVal?.height;
    const k = vbH ? svgBox.height / vbH : 1;
    const plotH = Number(svg.dataset.ph || 0) * k;
    if (plotH > 0) {
      cross.style.left = `${dotX.toFixed(1)}px`;
      cross.style.top = `${(svgBox.top - box.top + Number(svg.dataset.pt || 0) * k).toFixed(1)}px`;
      cross.style.height = `${plotH.toFixed(1)}px`;
      cross.hidden = false;
    }
  };
  container.addEventListener('pointermove', pick);
  container.addEventListener('pointerdown', pick);
  container.addEventListener('pointerleave', reset);
  // a resize (phone rotation, devtools) invalidates the tip's inline px
  // position — it would otherwise render stranded outside the container
  window.addEventListener('resize', reset);
}
