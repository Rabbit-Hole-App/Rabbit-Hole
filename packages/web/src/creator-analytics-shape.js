// Creator analytics: the dashboard response shape (owner brief 2026-10-23; docs/features/creator-analytics-contract.md
// "Dashboard read contract"). Pure and shared: the control plane's GET /api/analytics/creator builds its payload with
// `dashboard()`, and CreatorAnalytics.jsx reads the same shape. Every metric carries one of STATE; a value exists only in
// `ready` and `measured_zero`. A protected metric below COHORT_MIN is built by `suppress()`, so its raw value never
// leaves the server. No sample numbers here: development fixtures live in creator-analytics-fixtures.dev.js.

export const STATE = Object.freeze({
  LOADING: 'loading', // the client's own, before the response
  NOT_COLLECTED: 'not_collected', // nothing records this yet (section `reason` says why)
  NOT_ENOUGH: 'not_enough_learners', // protected and fewer than COHORT_MIN learners at this exact range/filter/cell
  ZERO: 'measured_zero', // measured, and it is 0
  FAILED: 'failed', // the client's own when the request fails (Retry); a server section may also report it
  READY: 'ready',
});
const STATES = new Set(Object.values(STATE));
export const COHORT_MIN = 10;
export const RANGES = Object.freeze(['7d', '30d', 'all']);
export const RANGE_DAYS = Object.freeze({ '7d': 7, '30d': 30, all: null });
export const TIMEZONE = 'UTC'; // shortcut: reporting days are UTC days; a creator-chosen zone needs hourly rollups
export const IDLE_THRESHOLD_SECONDS = 60;
export const RETURNING_LOOKBACK_DAYS = 30;
// `period` labels every metric: the selected range, a current total, or all time ("Forks · all time").
export const PERIOD = Object.freeze({ SELECTED: 'selected', CURRENT: 'current', ALL_TIME: 'all_time' });

// One metric cell. A value is kept only in ready / measured_zero; ready 0 becomes measured_zero; every other state is null.
export function metric(state, value = null, extra = {}) {
  if (!STATES.has(state)) throw new Error(`Unknown analytics state ${state}`);
  if (state === STATE.READY || state === STATE.ZERO) {
    if (value == null) throw new Error(`A ${state} metric needs a value`);
    return { ...extra, state: value === 0 ? STATE.ZERO : STATE.READY, value };
  }
  return { ...extra, state, value: null };
}

// The cohort rule for a protected cell: `count` is the distinct learners behind this exact cell (range, canvas, day,
// topic, resource, campaign). Below COHORT_MIN the cell is null + not_enough_learners and neither the value nor the count
// is returned. `value` defaults to the count itself (a learner count is its own cohort).
export function suppress(count, value = count, extra = {}) {
  if (count == null) return metric(STATE.NOT_COLLECTED, null, extra);
  if (!(count >= COHORT_MIN)) return metric(STATE.NOT_ENOUGH, null, extra);
  return metric(STATE.READY, value, extra);
}

// A public counter (canonical forks, public canvases): shown at any count, 0 is a measured zero.
export const counter = (value, period) => (typeof value === 'number' ? metric(STATE.READY, value, { period }) : metric(STATE.NOT_COLLECTED, null, { period }));

// The section-level reasons a section is not collected; one per section, never per metric.
export const REASON = Object.freeze({
  storage_not_approved: 'Rabbit Hole does not record what learners do on public canvases yet. Recording needs analytics storage, which is not approved yet.',
  assessment_evidence_unsupported: 'Shown only from checked answers on assessment cards. Public canvases do not record assessment outcomes yet.',
  campaign_links_not_built: 'Campaign links are not built yet. They will reuse your public link with a campaign tag.',
  ranged_forks_not_attributed: 'Forks by date need a record of which forks came through your public link. Until then forks are all-time totals.',
  requests_not_enabled: 'Asking learners what they would like next is not switched on. Its privacy terms are defined first.',
});
const section = (reason, body) => ({ state: STATE.NOT_COLLECTED, reason, message: REASON[reason], ...body });

// Definitions the screen shows beside each metric (tooltip): label, one-line definition, period, protected.
export const DEFINITIONS = Object.freeze({
  active_learners: { label: 'Active learners', period: PERIOD.SELECTED, protected: true, definition: 'Browsers or accounts that took at least one learning action (a card interaction, a question, a Rabbit Hole start or a Next Step). Anonymous learners are browsers, not people.' },
  avg_active_seconds: { label: 'Average active learning time', period: PERIOD.SELECTED, protected: true, definition: `Mean active time per active learner. Hidden tabs and gaps over ${IDLE_THRESHOLD_SECONDS} s without activity are not counted.` },
  rabbit_holes_started: { label: 'Rabbit Holes started', period: PERIOD.SELECTED, protected: false, definition: 'Rabbit Holes created from your public canvases. Retries, failures and reopening an existing one add nothing.' },
  forks: { label: 'Forks', period: PERIOD.ALL_TIME, protected: false, definition: 'Copies of your public canvases that still exist, counted once each when created. All time, from the canonical fork count.' },
  returning_learners: { label: 'Returning learners', period: PERIOD.SELECTED, protected: true, definition: `Active learners in this period who also learned here on an earlier day within the ${RETURNING_LOOKBACK_DAYS} days before. Shown as a count and a share of active learners.` },
  visit_to_learning: { label: 'Visits that became active learning', period: PERIOD.SELECTED, protected: true, definition: 'Visits with at least one learning action, divided by all visits in this period.' },
  public_canvases: { label: 'Public canvases', period: PERIOD.CURRENT, protected: false, definition: 'Canvases you have published to Explore now.' },
  visits: { label: 'Visits', period: PERIOD.SELECTED, protected: true, definition: 'Distinct sessions on your public canvases. Reloads and returns from a Rabbit Hole in the same session add nothing.' },
  unique_visitors: { label: 'Unique visitors', period: PERIOD.SELECTED, protected: true, definition: 'Distinct browsers or accounts that opened a public canvas. One person on two browsers counts twice.' },
  topics_explored_next: { label: 'Topics explored next', period: PERIOD.SELECTED, protected: true, definition: 'Topics learners went on to explore, ranked by distinct learners: Rabbit Holes started on a topic, recorded exploration of it, or a Next Step chosen for it. What learners did, not what they asked for.' },
  concepts_needing_support: { label: 'Concepts needing support', period: PERIOD.SELECTED, protected: true, definition: 'Concepts where checked answers on assessment cards were most often incorrect. Never inferred from time spent or repeat views.' },
  traffic: { label: 'Traffic', period: PERIOD.SELECTED, protected: true, definition: 'Visits by where they came from. Newsletter only when the link carried a newsletter tag; untagged links are Direct/unknown.' },
  campaigns: { label: 'Campaigns', period: PERIOD.SELECTED, protected: true, definition: 'Visits, active learning and forks through a tagged link to your public canvas. Campaign forks are a subset of all forks, never added to them.' },
  resources: { label: 'Most-used cards and resources', period: PERIOD.SELECTED, protected: true, definition: 'Cards learners interacted with and resources they opened, by distinct learners.' },
  requests: { label: 'What would you like next?', period: PERIOD.SELECTED, protected: true, definition: 'Topics learners chose when asked what they would like next. Separate from Topics explored next.' },
});

export const SERIES_METRICS = Object.freeze(['visits', 'unique_visitors', 'active_learners', 'rabbit_holes_started', 'forks']);
export const COMPARISON_COLUMNS = Object.freeze(['title', 'active_learners', 'avg_active_seconds', 'rabbit_holes_started', 'forks', 'returning_learners']);
export const TRAFFIC_SOURCES = Object.freeze([['newsletter', 'Newsletter'], ['linkedin', 'LinkedIn'], ['explore', 'Explore'], ['creator_profile', 'Creator profile'], ['direct', 'Direct/unknown'], ['other_referrer', 'Other referrers']]);
export const CAMPAIGN_KINDS = Object.freeze([['newsletter_issue', 'Newsletter issue'], ['linkedin_post', 'LinkedIn post'], ['website_placement', 'Website placement']]);

const DAY = 86400000;
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
// The visible range in TIMEZONE: today and the days before it; `all` runs from collection start (null until collected).
export function rangeOf(id, now = Date.now(), collectedSince = null) {
  const days = RANGE_DAYS[id];
  return { id, from: days ? isoDay(now - (days - 1) * DAY) : collectedSince, to: isoDay(now), timezone: TIMEZONE };
}

// Compare with previous period (owner extension 2026-10-23). Both periods are whole reporting days of equal length: the
// current one ends on the last complete day (yesterday), so a day still being counted never makes a change look like a
// drop. All time has none. `coverage` (below) marks a period partial when collection or processing does not span it.
export function periodsOf(id, now = Date.now(), coverage = null) {
  const days = RANGE_DAYS[id];
  if (!days) return null;
  const end = now - DAY, cur = { from: isoDay(end - (days - 1) * DAY), to: isoDay(end) };
  const prev = { from: isoDay(end - (2 * days - 1) * DAY), to: isoDay(end - days * DAY) };
  const covered = p => !!(coverage?.since && coverage?.through && coverage.since <= p.from && coverage.through.slice(0, 10) > p.to
    && !(coverage.partial || []).some(x => x.from <= p.to && x.to >= p.from));
  return { current: { ...cur, complete: covered(cur) }, previous: { ...prev, complete: covered(prev) }, tz: TIMEZONE };
}

export const CHANGE = Object.freeze({
  READY: 'ready', // abs, and pct (count, seconds) or pp (rate)
  NO_BASELINE: 'no_baseline', // the previous value is 0: abs only, never a percentage
  PARTIAL: 'partial', // a period is not fully collected or not yet complete
  NOT_ENOUGH: 'not_enough_learners', // either side is suppressed
  UNAVAILABLE: 'unavailable', // either side is not collected, failed or loading
  NOT_APPLICABLE: 'not_applicable', // All time, or a current / all-time counter
});
const CHANGE_REASON = {
  no_baseline: 'No baseline: the previous period was 0, so there is no percentage change.',
  partial: 'One of the two periods is not fully recorded yet, so no change is shown.',
  not_enough_learners: `One of the two periods has fewer than ${COHORT_MIN} learners, so no change is shown.`,
  unavailable: 'One of the two periods has no data for this metric.',
  not_applicable: 'Not compared: this is a current or all-time total.',
};
// Half away from zero, to one decimal, without float noise (17.45 -> 17.5, -17.45 -> -17.5).
export const round1 = x => Math.sign(x) * Math.round(Math.abs(x) * 10 + 1e-9) / 10;

// One metric's change. `kind`: 'count' | 'seconds' (abs and %), 'rate' (0..1, change in percentage points, never %),
// 'total' (a current or all-time counter: not compared). `periods` is periodsOf(); null means All time.
export function comparePeriods(current, previous, kind, periods = null) {
  const out = (state, extra = {}) => ({ state, current: null, previous: null, abs: null, pct: null, pp: null, reason: CHANGE_REASON[state] ?? null, periods, ...extra });
  if (!periods || kind === 'total') return out(CHANGE.NOT_APPLICABLE);
  const has = c => c && (c.state === STATE.READY || c.state === STATE.ZERO);
  if ([current, previous].some(c => c?.state === STATE.NOT_ENOUGH)) return out(CHANGE.NOT_ENOUGH);
  if (!has(current) || !has(previous)) return out(CHANGE.UNAVAILABLE);
  if (!periods.current.complete || !periods.previous.complete) return out(CHANGE.PARTIAL);
  const c = current.value, p = previous.value, values = { current: c, previous: p };
  if (kind === 'rate') return out(CHANGE.READY, { ...values, pp: round1((c - p) * 100), reason: null });
  const abs = kind === 'seconds' ? Math.round(c - p) : c - p;
  if (p === 0) return out(CHANGE.NO_BASELINE, { ...values, abs });
  return out(CHANGE.READY, { ...values, abs, pct: round1(((c - p) / p) * 100), reason: null });
}

// Data coverage ("About these metrics"): what collection and processing actually cover, never the fetch time.
// since: first recorded day; through: last processed instant; partial: gaps or incomplete periods with a reason.
export const NO_COVERAGE = Object.freeze({ since: null, through: null, partial: [], source: null,
  message: 'Nothing is collected yet, so there is no coverage. Public canvases and forks are read live from your canvases.' });

// Publication health (owner extension 2026-10-23): problems a SIGNED-OUT public viewer meets, checked on demand.
export const HEALTH = Object.freeze({ CONFIRMED: 'confirmed', TEMPORARY: 'temporary_failure', INCONCLUSIVE: 'inconclusive', UNCHECKED: 'unchecked' });
export const NO_ISSUES = 'No issues found in checked items';
// One finding: the canvas, the card or resource, what was observed, when, and where to open it.
export const finding = ({ canvas, kind, item_id, title, problem, status, checked_at, target }) => {
  if (!Object.values(HEALTH).includes(status)) throw new Error(`Unknown health status ${status}`);
  return { canvas, kind, item_id, title: title ?? null, problem, status, checked_at, target };
};
// A report: per canvas, its findings (unchecked items are counted, not listed) and the honest summary line.
export function healthReport({ groups, checked_at, canvas = null }) {
  const sum = k => groups.reduce((n, g) => n + g[k], 0);
  const message = g => (g.findings.length ? null : g.checked ? NO_ISSUES : 'Nothing on this canvas could be checked.');
  return { checked_at, canvas, on_demand: true, totals: { checked: sum('checked'), unchecked: sum('unchecked'), findings: groups.reduce((n, g) => n + g.findings.length, 0) },
    groups: groups.map(g => ({ ...g, message: message(g) })) };
}

// Comparison sort: rows whose cell has no value (not collected, not enough learners) always sort last, in either direction.
export function sortRows(rows, key, dir = 'desc') {
  const val = r => (key === 'title' ? r.title : r[key]?.value);
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null || y == null) return (x == null) - (y == null);
    return sign * (typeof x === 'string' ? x.localeCompare(y) : x - y);
  });
}

const notCollected = (period = PERIOD.SELECTED, extra = {}) => metric(STATE.NOT_COLLECTED, null, { period, ...extra });

// The payload GET /api/analytics/creator returns today. `canvases` are the session's own live public canvases
// ({ canvas, title, fork_count }); `canvas` is the selected one or null (all). Real numbers only for what exists: the
// public-canvas count and canonical forks. Everything else is not_collected with one section reason, never a zero.
export function dashboard({ range = '30d', canvas = null, canvases, now = Date.now(), compare = false }) {
  const scope = canvas ? canvases.filter(c => c.canvas === canvas) : canvases;
  const forks = scope.reduce((n, c) => n + c.fork_count, 0);
  const forkCell = c => counter(c.fork_count, PERIOD.ALL_TIME);
  const d = {
    version: 1,
    range: rangeOf(range, now),
    timezone: TIMEZONE,
    threshold: COHORT_MIN,
    collected_since: null,
    coverage: NO_COVERAGE,
    compare: { enabled: false, state: CHANGE.NOT_APPLICABLE, periods: null },
    canvas: canvas ? { canvas, title: scope[0]?.title ?? null } : null,
    canvases: canvases.map(c => ({ canvas: c.canvas, title: c.title })),
    overview: section('storage_not_approved', {
      metrics: {
        active_learners: notCollected(), avg_active_seconds: notCollected(), rabbit_holes_started: notCollected(),
        forks: counter(forks, PERIOD.ALL_TIME), returning_learners: notCollected(PERIOD.SELECTED, { share: null }),
        visit_to_learning: notCollected(), public_canvases: counter(scope.length, PERIOD.CURRENT),
      },
    }),
    audience: section('storage_not_approved', { metrics: { visits: notCollected(), unique_visitors: notCollected() } }),
    // Points: one per day of the range, each metric its own cell; an unrecorded or suppressed day is null, never 0.
    series: section('storage_not_approved', { metrics: SERIES_METRICS, points: [] }),
    topics: section('storage_not_approved', { measure: 'distinct_learners', rows: [] }),
    support: section('assessment_evidence_unsupported', { measure: 'incorrect_share', rows: [] }),
    comparison: {
      state: scope.length ? STATE.READY : STATE.ZERO, reason: 'storage_not_approved', message: REASON.storage_not_approved,
      columns: COMPARISON_COLUMNS,
      rows: scope.map(c => ({ canvas: c.canvas, title: c.title, active_learners: notCollected(), avg_active_seconds: notCollected(), rabbit_holes_started: notCollected(), forks: forkCell(c), returning_learners: notCollected(PERIOD.SELECTED, { share: null }) })),
    },
    traffic: section('storage_not_approved', { denominator: notCollected(), rows: TRAFFIC_SOURCES.map(([source, label]) => ({ source, label, visits: notCollected(), share: null })) }),
    campaigns: section('campaign_links_not_built', { rows: [] }),
    // The drill-down for one canvas (null for all canvases), keeping the range.
    canvas_detail: canvas ? {
      concepts: section('storage_not_approved', { rows: [] }),
      conversion: section('storage_not_approved', { metrics: { rabbit_hole_start_rate: notCollected(), fork_rate: notCollected(), forks: counter(forks, PERIOD.ALL_TIME) } }),
      next_steps: section('storage_not_approved', { rows: [] }),
      resources: section('storage_not_approved', { rows: [] }),
      revisions: section('storage_not_approved', { segments: [] }),
    } : null,
    tools: {
      resources: section('storage_not_approved', { measure: 'distinct_learners', rows: [] }),
      requests: section('requests_not_enabled', { rows: [] }),
    },
    definitions: DEFINITIONS,
  };
  // Today nothing is collected for any previous period either, so every compared change is `unavailable`.
  return compare ? withComparison(d, dashboard({ range, canvas, canvases, now }), periodsOf(range, now, d.coverage)) : d;
}

// The change kind of each compared metric (comparePeriods); a metric not listed is not compared.
export const CHANGE_KIND = Object.freeze({
  active_learners: 'count', avg_active_seconds: 'seconds', rabbit_holes_started: 'count', forks: 'total', returning_learners: 'count',
  visit_to_learning: 'rate', public_canvases: 'total', visits: 'count', unique_visitors: 'count', rabbit_hole_start_rate: 'rate', fork_rate: 'rate',
});
// Attach Compare with previous period to a payload `d`, given the same payload for the previous period `prev`: a `change`
// beneath every headline metric (overview, audience, the one-canvas conversion), `series.previous` aligned by day index,
// and the current range narrowed to the compared period, so the headline value is `change.current`. All time: none.
export function withComparison(d, prev, periods) {
  const out = structuredClone(d);
  out.compare = { enabled: true, state: !periods ? CHANGE.NOT_APPLICABLE : periods.current.complete && periods.previous.complete ? CHANGE.READY : CHANGE.PARTIAL, periods };
  if (periods) out.range = { id: d.range.id, from: periods.current.from, to: periods.current.to, timezone: periods.tz };
  const each = (cells, prevCells) => { for (const [k, cell] of Object.entries(cells || {})) if (CHANGE_KIND[k]) cell.change = comparePeriods(cell, prevCells?.[k], CHANGE_KIND[k], periods); };
  each(out.overview.metrics, prev.overview.metrics);
  each(out.audience.metrics, prev.audience.metrics);
  if (out.canvas_detail) each(out.canvas_detail.conversion.metrics, prev.canvas_detail?.conversion.metrics);
  out.series.previous = periods ? { label: 'Previous period', from: periods.previous.from, to: periods.previous.to, state: prev.series.state, reason: prev.series.reason,
    points: prev.series.points.map((p, index) => ({ ...p, index })) } : null;
  out.series.points = out.series.points.map((p, index) => ({ ...p, index }));
  return out;
}
