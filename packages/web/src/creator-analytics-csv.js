// Export CSV (docs/features/creator-analytics-contract.md "Export CSV", owner extension 2026-10-23): the dashboard payload
// as one aggregate table, built on the server from the SAME payload the screen reads (GET /api/analytics/creator.csv), so
// it carries exactly what the screen may show. A hidden or unavailable value is an empty cell with its reason, never 0.
// RFC 4180: CRLF rows, fields with a comma, quote, CR or LF quoted, quotes doubled. Text cells that start with = + - @
// tab or CR get a leading ' (spreadsheet formula injection); numbers the payload holds are written as plain numerals.
import { COHORT_MIN, DEFINITIONS, STATE } from './creator-analytics-shape.js';

const UNIT = {
  active_learners: 'count', avg_active_seconds: 'seconds', rabbit_holes_started: 'count', forks: 'count', returning_learners: 'count',
  visit_to_learning: 'ratio', public_canvases: 'count', visits: 'count', unique_visitors: 'count', rabbit_hole_start_rate: 'ratio', fork_rate: 'ratio',
  learners: 'count', attempts: 'count', incorrect_share: 'ratio', active_learning: 'ratio', attributed_forks: 'count', share: 'ratio',
};
const CRLF = String.fromCharCode(13, 10);
const BASE = ['section', 'item', 'metric', 'label', 'value', 'unit', 'period', 'from', 'to', 'timezone', 'state', 'reason'];
const COMPARE = ['previous_value', 'previous_from', 'previous_to', 'change_abs', 'change_pct', 'change_pp', 'change_state', 'change_reason'];

export function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v), quote = /[",\r\n]/.test(s);
  if (/^[=+\-@\t\r]/.test(s)) { s = `'${s}`; quote = true; }
  return quote ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvLine = cells => cells.map(csvCell).join(',');

const cellReason = (cell, section) => (cell?.state === STATE.NOT_ENOUGH ? `Fewer than ${COHORT_MIN} learners in this cell, so it is hidden.`
  : cell?.state === STATE.NOT_COLLECTED || cell?.state === STATE.FAILED ? section?.message ?? section?.reason ?? 'Not available.' : null);

export function toCsv(d) {
  const compare = !!d.compare?.enabled;
  const rows = [], { from, to, timezone } = d.range;
  const row = (section, item, metric, cell, { label = DEFINITIONS[metric]?.label ?? metric, unit = UNIT[metric] ?? null, sec = null, period = cell?.period ?? DEFINITIONS[metric]?.period ?? 'selected', span = null } = {}) => {
    // A current or all-time total has no date range of its own; its period column says so.
    span ??= period === 'selected' ? { from, to } : { from: null, to: null };
    const value = cell && (cell.state === STATE.READY || cell.state === STATE.ZERO) ? cell.value : null;
    const out = [section, item, metric, label, value, unit, period, span.from, span.to, timezone, cell?.state ?? null, cellReason(cell, sec)];
    if (compare) {
      const c = cell?.change;
      const prev = c && c.state !== 'not_applicable' ? d.compare.periods?.previous : null;
      out.push(c?.previous ?? null, prev?.from ?? null, prev?.to ?? null, c?.abs ?? null, c?.pct ?? null, c?.pp ?? null, c?.state ?? null, c?.reason ?? null);
    }
    rows.push(out);
  };
  // A section with nothing to list still says why (one row, empty value).
  const empty = (name, sec, label = DEFINITIONS[name]?.label ?? name) => { if (sec && !(sec.rows?.length || sec.points?.length)) row(name, null, name, { state: sec.state }, { label, sec }); };
  const cells = (name, sec, item = null) => { for (const [k, cell] of Object.entries(sec?.metrics || {})) {
    row(name, item, k, cell, { sec });
    if ('share' in (cell || {})) row(name, item, `${k}_share`, cell.share == null ? { state: cell.state === STATE.READY || cell.state === STATE.ZERO ? STATE.NOT_COLLECTED : cell.state } : { state: STATE.READY, value: cell.share }, { label: `${DEFINITIONS[k]?.label ?? k} (share)`, unit: 'ratio', sec });
  } };

  cells('overview', d.overview);
  cells('audience', d.audience);
  for (const p of d.series?.points || []) for (const m of d.series.metrics) row('series', p.day, m, p[m], { sec: d.series, span: { from: p.day, to: p.day } });
  for (const p of (compare && d.series?.previous?.points) || []) for (const m of d.series.metrics) row('series_previous', p.day, m, p[m], { sec: d.series.previous, span: { from: p.day, to: p.day } });
  empty('series', d.series, 'Activity over time');
  for (const r of d.topics?.rows || []) row('topics', r.label ?? r.topic_id, 'learners', r.learners, { label: `Topics explored next (${r.via})`, sec: d.topics });
  empty('topics_explored_next', d.topics);
  for (const r of d.support?.rows || []) for (const k of ['attempts', 'incorrect_share']) row('support', r.label ?? r.concept_id, k, r[k], { label: `Concepts needing support (${k === 'attempts' ? 'answers checked' : 'share incorrect'})`, sec: d.support });
  empty('concepts_needing_support', d.support);
  for (const r of d.comparison?.rows || []) for (const k of d.comparison.columns.filter(c => c !== 'title')) {
    row('canvas_comparison', r.title, k, r[k], { sec: d.comparison });
    if ('share' in (r[k] || {})) row('canvas_comparison', r.title, `${k}_share`, r[k].share == null ? { state: r[k].state === STATE.READY ? STATE.NOT_COLLECTED : r[k].state } : { state: STATE.READY, value: r[k].share }, { label: `${DEFINITIONS[k]?.label ?? k} (share)`, unit: 'ratio', sec: d.comparison });
  }
  if (d.traffic) {
    row('traffic', null, 'visits', d.traffic.denominator, { label: 'Traffic denominator: all visits', sec: d.traffic });
    for (const r of d.traffic.rows) {
      row('traffic', r.label, 'visits', r.visits, { label: `Traffic: ${r.label}`, sec: d.traffic });
      row('traffic', r.label, 'share', r.share == null ? { state: r.visits?.state === STATE.READY ? STATE.NOT_ENOUGH : r.visits?.state } : { state: STATE.READY, value: r.share }, { label: `Traffic: ${r.label} (share of visits)`, sec: d.traffic });
    }
  }
  for (const r of d.campaigns?.rows || []) for (const k of ['visits', 'active_learning', 'attributed_forks']) row('campaigns', r.label, k, r[k], { label: `Campaign (${r.kind}): ${k.replace('_', ' ')}`, sec: d.campaigns });
  empty('campaigns', d.campaigns);
  if (d.canvas_detail) {
    cells('canvas_conversion', d.canvas_detail.conversion, d.canvas?.title ?? null);
    for (const k of ['concepts', 'next_steps', 'resources', 'revisions']) empty(`canvas_${k}`, d.canvas_detail[k]);
  }
  for (const r of d.tools?.resources?.rows || []) row('tools_resources', r.label ?? r.item_id, 'learners', r.learners, { label: `Most-used ${r.kind}${r.exists === false ? ' (no longer on the canvas)' : ''}`, sec: d.tools.resources });
  empty('resources', d.tools?.resources);
  empty('requests', d.tools?.requests);

  const cov = d.coverage || {};
  // About these metrics: the same columns (a rectangular file), section 'about', the text in `value`.
  const about = [
    ['export', 'Creator analytics export', 'aggregate only; no learner records'],
    ['canvas_scope', 'Canvas scope', d.canvas ? d.canvas.title ?? d.canvas.canvas : 'All public canvases'],
    ['range', 'Range', d.range.id],
    ['compare', 'Compare with previous period', compare ? (d.compare.periods ? `${d.compare.periods.previous.from} to ${d.compare.periods.previous.to} (${d.compare.state})` : 'not applicable to All time') : 'off'],
    ['collected_since', 'Collection start', d.collected_since ?? 'not collected yet'],
    ['coverage_since', 'Data available since', cov.since],
    ['coverage_through', 'Updated through', cov.through],
    ['coverage_partial', 'Partial periods', (cov.partial || []).map(p => `${p.from} to ${p.to}: ${p.reason}`).join('; ')],
    ['coverage_note', 'Coverage note', cov.message],
    ['threshold', 'Minimum learners per shown cell', COHORT_MIN],
    ...Object.entries(DEFINITIONS).map(([k, v]) => [`definition:${k}`, `Definition: ${v.label}`, `${v.definition} (${v.period}${v.protected ? `, hidden below ${COHORT_MIN} learners` : ''})`]),
  ];
  const header = compare ? [...BASE, ...COMPARE] : BASE;
  const pad = cells => [...cells, ...Array(header.length - cells.length).fill(null)];
  const aboutRows = about.map(([metric, label, value]) => pad(['about', null, metric, label, value ?? null, null, null, from, to, timezone]));
  return [header, ...aboutRows, ...rows].map(csvLine).join(CRLF) + CRLF;
}
