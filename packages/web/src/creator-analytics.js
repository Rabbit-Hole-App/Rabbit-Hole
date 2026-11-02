// Creator analytics, the client's pure half (docs/features/creator-analytics-contract.md "Read API"). The server owns every
// number, its cohort suppression and its coverage; this module only reads the response: formats a Metric, writes the CSV
// export from the same response the screen shows, and builds the follow-up prompt. A hidden value (value null) is never 0.
// Pure, so it is tested (creator-analytics.test.mjs).
export const RANGES = [{ id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: 'all', label: 'All time' }];
export const TABS = [{ id: 'overview', label: 'Overview' }, { id: 'boards', label: 'Boards' }, { id: 'learning', label: 'Learning' }, { id: 'sources', label: 'Sources' }];
export const THRESHOLD = 10;
export const SOURCES = { linkedin: 'LinkedIn', explore: 'Explore', creator_profile: 'Creator profile', stars: 'Stars', direct: 'Direct / unknown', other_referrer: 'Other referrers' };
export const LAUNCH_COPY = 'Ready for your first audience. Collection is active. Your own visits do not count. Share a public learning board to begin collecting audience activity.';

// The read route for a scope: null is every public board of the session's own, a canvas id that one board.
export const analyticsUrl = (canvas, range) => (canvas ? `/api/analytics/publications/${encodeURIComponent(canvas)}` : '/api/analytics/creator') + `?range=${range}`;

export const hidden = metric => !metric || metric.value === null || metric.value === undefined;
// Why a value is not shown, in words. Suppression is a privacy rule, never an absence of activity.
export function hiddenReason(metric) {
  const reason = metric?.reason;
  if (reason === 'insufficient_cohort') return `Hidden: fewer than ${THRESHOLD} visitors`;
  if (reason === 'complementary') return 'Hidden so a small group cannot be worked out by subtraction';
  if (reason === 'not_collected') return 'Not collected yet';
  return 'Unavailable';
}

const fmtCount = n => Number(n).toLocaleString('en-US');
export const fmtSeconds = s => `${Math.floor(s / 60)}m ${String(Math.round(s) % 60).padStart(2, '0')}s`;
export const fmtRate = r => `${(100 * r).toFixed(1)}%`;
// A Metric as text: '—' when hidden or unavailable, else the number in its kind ('count' | 'seconds' | 'rate').
export function metricText(metric, kind = 'count') {
  if (hidden(metric)) return '—';
  return kind === 'seconds' ? fmtSeconds(metric.value) : kind === 'rate' ? fmtRate(metric.value) : fmtCount(metric.value);
}

// No audience yet: no open recorded in range, and the visitor count is not hidden for some other reason than an empty cohort.
export const noAudience = data => !!data && data.overview?.total_opens?.value === 0 && data.overview?.unique_visitors?.reason !== 'not_collected';

// "Oct 4 – Nov 2, 2026 · UTC" from the response's period; with no start (nothing collected yet) "Through Nov 2, 2026 · UTC".
const day = iso => new Date(`${iso}T00:00:00Z`);
const md = iso => day(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export function periodText(period) {
  if (!period?.to) return '';
  const year = day(period.to).getUTCFullYear();
  return `${period.from ? `${md(period.from)} – ${md(period.to)}` : `Through ${md(period.to)}`}, ${year} · ${period.timezone || 'UTC'}`;
}
export const dateText = iso => (iso ? `${new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false })} UTC` : null);

// The follow-up board's composer text (contract "Create next"): labels and the board title only, never learner text.
export const followUpPrompt = (label, title) => `Create a short interactive learning board about ${label}, informed by what visitors explored in my ${title || 'learning'} board.`;
export const PREFILL_KEY = name => `rh-composer-prefill:${name}`;
// Take (and drop) a pending composer prefill for this canvas. Reading the storage may throw (a blocked one): no prefill then.
export function takePrefill(name, storage) {
  try {
    const store = storage ?? globalThis.sessionStorage;
    const text = name && store?.getItem(PREFILL_KEY(name));
    if (text) store.removeItem(PREFILL_KEY(name));
    return text || null;
  } catch { return null; }
}

// The CSV export: the response on screen, row by row, with its scope, range, dates, coverage and definitions. A hidden value
// is an empty cell with its reason beside it, never 0.
// A text cell starting with a formula character (a board title, a campaign tag) is kept as text when a spreadsheet opens the file.
const cell = v => `"${(typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v ?? '')).replaceAll('"', '""')}"`;
export function analyticsCsv(data) {
  const rows = [['Section', 'Item', 'Metric', 'Value', 'Hidden reason']];
  const add = (section, item, metric, m) => rows.push([section, item, metric, hidden(m) ? '' : m.value, hidden(m) ? hiddenReason(m) : '']);
  rows.push(['Scope', data.scope?.title || 'All public learning boards', data.scope?.canvas || '', '', '']);
  rows.push(['Range', data.range, `${data.period?.from || 'collection start'} to ${data.period?.to}`, data.period?.timezone || 'UTC', data.period?.partial ? 'Partial coverage: earlier days were not collected' : '']);
  rows.push(['Privacy', '', 'Minimum cohort', data.threshold ?? THRESHOLD, '']);
  for (const [key, m] of Object.entries(data.overview || {})) add('Overview', '', key, m);
  for (const [key, m] of Object.entries(data.stars || {})) add('Stars', '', key, m);
  for (const b of data.boards || []) for (const [key, m] of Object.entries(b)) if (m && typeof m === 'object') add('Boards', b.title, key, m);
  for (const t of data.trend || []) add('Trend', t.day, 'opens', t.opens);
  const learning = data.learning || {};
  for (const c of learning.cards || []) { add('Cards', c.label, 'seen', c.seen); add('Cards', c.label, 'interacted', c.interacted); }
  for (const c of learning.concepts || []) for (const k of ['seen', 'explored_rate', 'deeper_rate']) add('Concepts', c.label || c.concept_id, k, c[k]);
  if (learning.next_steps) {
    add('Next Steps', '', 'impressions', learning.next_steps.impressions);
    add('Next Steps', '', 'selections', learning.next_steps.selections);
    for (const p of learning.next_steps.positions || []) for (const k of ['impressions', 'selections', 'rate']) add('Next Steps', `position ${p.position}`, k, p[k]);
  }
  for (const r of learning.resources || []) add('Resources', r.label || r.resource_id, 'opens', r.opens);
  for (const f of learning.friction || []) for (const k of ['assessed', 'incorrect', 'incorrect_rate']) add('Friction', f.label, k, f[k]);
  for (const [name, side] of [['before', learning.revisions?.before], ['after', learning.revisions?.after]]) {
    if (side) for (const k of ['visitors', 'avg_active_seconds', 'start_rate']) add('Revision', `${name} ${side.from} to ${side.to}`, k, side[k]);
  }
  for (const s of data.sources?.visitors || []) add('Sources', SOURCES[s.source] || s.source, 'visitors', s.visitors);
  for (const c of data.sources?.campaigns || []) { add('Campaigns', c.campaign, 'visitors', c.visitors); add('Campaigns', c.campaign, 'start_rate', c.start_rate); }
  for (const r of data.sources?.referrers || []) add('Referrers', r.host, 'visitors', r.visitors);
  for (const [key, p] of Object.entries(data.producers || {})) rows.push(['Coverage', key, p.readiness, p.started_at || '', p.note || '']);
  for (const [key, text] of Object.entries(data.definitions || {})) rows.push(['Definition', key, text, '', '']);
  return rows.map(r => r.map(cell).join(',')).join('\r\n');
}
