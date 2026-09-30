/** Descriptive statistics over numeric series. Node-safe. */

export const total = (xs) => xs.reduce((a, b) => a + b, 0);

export const average = (xs) => (xs.length ? total(xs) / xs.length : null);

export function middle(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

export function spread(xs) {
  if (xs.length < 2) return null;
  const m = average(xs);
  return Math.sqrt(total(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}

/** {n, avg, med, lo, hi, sd} — nulls filtered out. */
export function series(values) {
  const xs = values.filter((x) => x != null && Number.isFinite(x));
  return {
    n: xs.length,
    avg: average(xs),
    med: middle(xs),
    lo: xs.length ? Math.min(...xs) : null,
    hi: xs.length ? Math.max(...xs) : null,
    sd: spread(xs),
  };
}

/**
 * Trailing mean over a time window: for each point of `points` ([{t, n}] in t
 * order) the mean of the points whose t lies in (t - span, t]. Null until
 * `minCount` points fall inside, so a trend never claims a pace from one
 * lonely reading after a tracker gap.
 */
export function rollingMean(points, span, minCount = 1) {
  let lo = 0;
  let sum = 0;
  return points.map((p, i) => {
    sum += p.n;
    while (points[lo].t <= p.t - span) { sum -= points[lo].n; lo += 1; }
    const count = i - lo + 1;
    return count >= minCount ? sum / count : null;
  });
}

/** Count occurrences into a sorted [{key, n}] list. */
export function tally(items, keyOf, weightOf = () => 1) {
  const map = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (key == null || key === '') continue;
    map.set(key, (map.get(key) || 0) + weightOf(item));
  }
  return [...map.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
}
