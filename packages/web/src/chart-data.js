// Pure data shaping for runbook chart blocks: rows in, nivo props out.
// No fetch, no React — node --test runs this file's test directly.

const parse = (s) => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z'); // D1 datetime or ISO

// /api/runs rows → flat chart rows, oldest first. Inputs spread as columns (§3c).
export function flattenRuns(runs) {
  return (runs || [])
    .slice()
    .reverse()
    .map((r) => ({
      run: (r.run_id || '').slice(0, 7),
      status: r.status,
      started_at: r.started_at,
      duration_s: r.finished_at && r.started_at
        ? Math.max(0, Math.round((parse(r.finished_at) - parse(r.started_at)) / 1000))
        : null,
      ...(r.inputs || {}),
    }));
}

// A CSV/JSON output file → flat rows. Arrays of objects pass through;
// a plain object becomes key/value rows so {"people": 2} still charts.
export function parseOutput(name, text) {
  if (name.endsWith('.csv')) return parseCsv(text);
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data.filter((r) => r && typeof r === 'object');
  if (data && typeof data === 'object') {
    return Object.entries(data)
      .filter(([, v]) => typeof v !== 'object')
      .map(([key, value]) => ({ key, value }));
  }
  return [];
}

// ponytail: naive CSV — no quoted commas; add a real parser when an output needs one.
function parseCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  if (!head) return [];
  const cols = head.split(',').map((c) => c.trim());
  return lines.map((l) => {
    const vals = l.split(',');
    return Object.fromEntries(cols.map((c, i) => {
      const v = (vals[i] ?? '').trim();
      return [c, v !== '' && Number.isFinite(+v) ? +v : v];
    }));
  });
}

export function columns(rows) {
  const all = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const numeric = all.filter((c) => rows.some((r) => r[c] != null) &&
    rows.every((r) => r[c] == null || Number.isFinite(+r[c])));
  return { all, numeric };
}

// group by x; numeric y sums, non-numeric (or missing) y counts rows.
function groupBy(rows, x, y) {
  const acc = new Map();
  for (const r of rows) {
    if (r[x] == null) continue;
    const k = String(r[x]);
    const v = y && Number.isFinite(+r[y]) ? +r[y] : 1;
    acc.set(k, (acc.get(k) || 0) + v);
  }
  return [...acc.entries()];
}

// nivo data for each chart type. Line plots raw points in row order; bar and
// pie aggregate by x so repeated categories don't overwrite each other.
export function toNivo(type, rows, x, y) {
  if (!rows.length || !x) return null;
  if (type === 'line') {
    const pts = rows.filter((r) => r[x] != null && Number.isFinite(+r[y])).map((r) => ({ x: String(r[x]), y: +r[y] }));
    return pts.length ? [{ id: y, data: pts }] : null;
  }
  const groups = groupBy(rows, x, y);
  if (!groups.length) return null;
  if (type === 'bar') return groups.map(([k, v]) => ({ [x]: k, [y || 'count']: v }));
  return groups.map(([k, v]) => ({ id: k, value: v })); // pie
}
