// DEVELOPMENT FIXTURES ONLY - sample numbers, not real data (owner brief 2026-10-23: sample data belongs only in clearly
// labelled development fixtures). For unit tests and local UI work on the Creator analytics screen. Never import this
// from a production view: creator-analytics-shape.test.mjs fails if any non-test source under src/ imports it.
// One fixture per state; `mixed` puts every state on one screen. Built with the shape's own constructors, so a fixture
// can never hold a suppressed raw value.
import { COHORT_MIN, PERIOD, STATE, TRAFFIC_SOURCES, dashboard, metric, suppress } from './creator-analytics-shape.js';

const LABEL = 'DEVELOPMENT FIXTURE - sample numbers, not real data';
const NOW = Date.parse('2026-10-23T12:00:00Z');
const CANVASES = [
  { canvas: 'dev-fixture-attention', title: '[Dev fixture] Attention, step by step', fork_count: 12 },
  { canvas: 'dev-fixture-backprop', title: '[Dev fixture] Backprop by hand', fork_count: 0 },
  { canvas: 'dev-fixture-tokenizers', title: '[Dev fixture] Tokenizers', fork_count: 3 },
];
const base = (extra = {}) => ({ ...dashboard({ range: '30d', canvases: CANVASES, now: NOW, ...extra }), fixture: LABEL });
const sel = { period: PERIOD.SELECTED };
const days = n => Array.from({ length: n }, (_, i) => new Date(NOW - (n - 1 - i) * 86400000).toISOString().slice(0, 10));

// Every section measured: the cohort is large enough everywhere except where a cell says otherwise.
function ready() {
  const d = base();
  const active = 140, visits = 410;
  d.collected_since = '2026-09-01';
  d.overview = { state: STATE.READY, reason: null, message: null, metrics: {
    active_learners: suppress(active, active, sel), avg_active_seconds: suppress(active, 312, sel),
    rabbit_holes_started: metric(STATE.READY, 37, sel), forks: d.overview.metrics.forks,
    returning_learners: suppress(active, 31, { ...sel, share: 31 / active }), visit_to_learning: suppress(visits, active / visits, sel),
    public_canvases: d.overview.metrics.public_canvases } };
  d.audience = { state: STATE.READY, reason: null, message: null, metrics: { visits: suppress(visits, visits, sel), unique_visitors: suppress(260, 260, sel) } };
  // A day below the cohort is null for every protected metric; a public counter stays shown (Rabbit Holes started).
  d.series = { state: STATE.READY, reason: null, message: null, metrics: d.series.metrics, points: days(30).map((day, i) => {
    const v = i % 7 === 3 ? 6 : 10 + i;
    return { day, visits: suppress(v, v + 4), unique_visitors: suppress(v), active_learners: suppress(v, Math.round(v * 0.4)), rabbit_holes_started: metric(STATE.READY, i % 4), forks: metric(STATE.NOT_COLLECTED) };
  }) };
  d.topics = { state: STATE.READY, reason: null, message: null, measure: 'distinct_learners', rows: [
    { topic_id: 'concept:multi-head', label: 'Multi-head attention', via: 'rabbit_hole', learners: suppress(24) },
    { topic_id: 'concept:positional-encoding', label: 'Positional encoding', via: 'next_step', learners: suppress(15) },
    { topic_id: 'concept:kv-cache', label: 'KV cache', via: 'exploration', learners: suppress(7) },
  ] };
  d.support = { state: STATE.READY, reason: null, message: null, measure: 'incorrect_share', rows: [
    { concept_id: 'concept:softmax-scaling', label: 'Softmax scaling', attempts: suppress(18, 18), incorrect_share: suppress(18, 0.44) },
    { concept_id: 'concept:chain-rule', label: 'Chain rule', attempts: suppress(4, 4), incorrect_share: suppress(4, 0.5) },
  ] };
  d.comparison.rows = CANVASES.map((c, i) => ({ canvas: c.canvas, title: c.title,
    active_learners: suppress([96, 6, 38][i]), avg_active_seconds: suppress([96, 6, 38][i], [340, 200, 255][i]),
    rabbit_holes_started: metric(STATE.READY, [30, 0, 7][i], sel), forks: d.comparison.rows[i].forks,
    returning_learners: suppress([96, 6, 38][i], [22, 1, 9][i], { ...sel, share: [22 / 96, 1 / 6, 9 / 38][i] }) }));
  const traffic = { newsletter: 60, linkedin: 140, explore: 110, creator_profile: 8, direct: 80, other_referrer: 12 };
  d.traffic = { state: STATE.READY, reason: null, message: null, denominator: suppress(visits, visits, sel),
    rows: TRAFFIC_SOURCES.map(([source, label]) => ({ source, label, visits: suppress(traffic[source]), share: traffic[source] >= COHORT_MIN ? traffic[source] / visits : null })) };
  d.campaigns = { state: STATE.READY, reason: null, message: null, rows: [
    { campaign_id: 'dev-fixture-nl-12', kind: 'newsletter_issue', label: 'Newsletter #12', canvas: CANVASES[0].canvas, visits: suppress(60), active_learning: suppress(60, 0.38), attributed_forks: suppress(60, 2) },
    { campaign_id: 'dev-fixture-li-1', kind: 'linkedin_post', label: 'LinkedIn launch post', canvas: CANVASES[0].canvas, visits: suppress(120), active_learning: suppress(120, 0.21), attributed_forks: suppress(120, 0) },
    { campaign_id: 'dev-fixture-web-1', kind: 'website_placement', label: 'Blog sidebar', canvas: CANVASES[2].canvas, visits: suppress(5), active_learning: suppress(5, 0.6), attributed_forks: suppress(5, 1) },
  ] };
  d.tools = {
    resources: { state: STATE.READY, reason: null, message: null, measure: 'distinct_learners', rows: [
      { kind: 'card', item_id: 'b-attn-demo', label: 'Attention heatmap', canvas: CANVASES[0].canvas, exists: true, learners: suppress(70) },
      { kind: 'resource', item_id: 'paper:1706.03762', label: 'Attention Is All You Need', canvas: CANVASES[0].canvas, exists: true, learners: suppress(22) },
      { kind: 'card', item_id: 'b-removed', label: null, canvas: CANVASES[0].canvas, exists: false, learners: suppress(11) },
    ] },
    requests: d.tools.requests,
  };
  return d;
}

// Measured zeros: enough learners came, but none returned, started a Rabbit Hole or explored a topic next. A measured
// zero on a protected metric needs the cohort (140 active learners here); a public counter is a zero at any size.
function zero() {
  const d = ready();
  d.overview.metrics.returning_learners = suppress(140, 0, { ...sel, share: 0 });
  d.overview.metrics.rabbit_holes_started = metric(STATE.READY, 0, sel);
  d.topics = { ...d.topics, state: STATE.ZERO, rows: [] };
  d.campaigns = { ...d.campaigns, state: STATE.ZERO, rows: [] };
  return d;
}

// Collected, but every protected cell is under the cohort: null + not_enough_learners, never the raw value.
function notEnough() {
  const d = ready();
  for (const k of ['active_learners', 'avg_active_seconds', 'returning_learners', 'visit_to_learning']) d.overview.metrics[k] = suppress(4, 99, sel);
  d.overview.state = STATE.NOT_ENOUGH;
  d.audience = { ...d.audience, state: STATE.NOT_ENOUGH, metrics: { visits: suppress(5), unique_visitors: suppress(4) } };
  d.series = { ...d.series, state: STATE.NOT_ENOUGH, points: d.series.points.map(p => ({ ...p, visits: suppress(3), unique_visitors: suppress(2), active_learners: suppress(1) })) };
  d.topics = { ...d.topics, state: STATE.NOT_ENOUGH, rows: [] };
  d.traffic = { ...d.traffic, state: STATE.NOT_ENOUGH, denominator: suppress(5), rows: d.traffic.rows.map(r => ({ ...r, visits: suppress(1), share: null })) };
  return d;
}

export const FIXTURES = Object.freeze({
  loading: { state: STATE.LOADING, fixture: LABEL },
  failed: { state: STATE.FAILED, error: 'Could not load analytics', fixture: LABEL },
  not_collected: base(), // what the server returns today
  not_collected_one_canvas: base({ canvas: CANVASES[0].canvas }),
  no_public_canvases: { ...dashboard({ range: '30d', canvases: [], now: NOW }), fixture: LABEL },
  not_enough_learners: notEnough(),
  measured_zero: zero(),
  ready: ready(),
  mixed: (() => { const d = ready(); d.audience = base().audience; d.support = base().support; d.campaigns = { ...d.campaigns, state: STATE.FAILED, rows: [] }; return d; })(),
});
