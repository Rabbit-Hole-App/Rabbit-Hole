export const parameters = Object.freeze({ keys: [-1, 0, 1, 2], queries: [-.5, 1.5], precision: 3, widths: { local: 1, narrow: .5, broad: 2 } });
export function derived() {
  const p = parameters, round = x => +x.toFixed(p.precision);
  const controls = ['local', 'uniform', 'narrow', 'broad'].map(id => {
    const width = p.widths[id];
    const weights = p.queries.map(q => { const s = p.keys.map(k => id === 'uniform' ? 0 : -.5 * ((q - k) / width) ** 2), max = Math.max(...s), e = s.map(x => Math.exp(x - max)), total = e.reduce((n, x) => n + x, 0); return e.map(x => x / total); });
    const display = weights.map(row => { const shown = row.map(round), index = row.indexOf(Math.max(...row)); shown[index] = round(shown[index] + 1 - shown.reduce((n, x) => n + x, 0)); return shown; });
    return { id, ...(width ? { width } : {}), weights, display };
  });
  return { parameters: p, controls, counts: { queries: p.queries.length, keys: p.keys.length }, queryLabels: p.queries.map(q => String(q)), keyLabels: p.keys.map(k => String(k)) };
}
