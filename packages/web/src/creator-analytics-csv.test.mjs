// Export CSV (owner extension 2026-10-23; creator-analytics-contract.md "Export CSV"): RFC 4180 quoting, formula-injection
// defence, an empty cell plus its reason for every hidden value (never 0), and every visible metric of the payload present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, csvLine, toCsv } from './creator-analytics-csv.js';
import { FIXTURES } from './creator-analytics-fixtures.dev.js';
import { STATE, dashboard } from './creator-analytics-shape.js';

// A small RFC 4180 reader, so the tests read the file back the way a spreadsheet would.
function parse(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += ch;
  }
  return rows;
}
const table = text => { const [head, ...rest] = parse(text); return rest.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]]))); };

test('csv: RFC 4180 quoting for commas, quotes and line breaks; CRLF rows', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell('cr\r\nlf'), '"cr\r\nlf"');
  assert.equal(csvLine(['a', null, 0, 'b,c']), 'a,,0,"b,c"');
  const out = toCsv(dashboard({ canvases: [{ canvas: 'canvas-0a1b2c3d', title: 'Line one\nline "two", three', fork_count: 1 }] }));
  assert.ok(out.endsWith('\r\n'));
  const rows = parse(out);
  assert.ok(rows.every(r => r.length === rows[0].length), 'rectangular');
  assert.ok(table(out).some(r => r.item === 'Line one\nline "two", three'), 'a title round-trips');
});

test('csv: a cell that starts like a formula is neutralised with a leading quote; numbers stay numbers', () => {
  for (const s of ['=HYPERLINK("x")', '+1', '-2+3', '@SUM(A1)', '\tx', '\rx']) {
    const c = csvCell(s);
    assert.ok(c.startsWith(`"'`), `${JSON.stringify(s)} -> ${c}`);
    assert.equal(parse(`${c}\r\n`)[0][0], `'${s}`);
  }
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell(17.5), '17.5');
  const out = toCsv(dashboard({ canvases: [{ canvas: 'canvas-0a1b2c3d', title: '=cmd|calc', fork_count: 0 }] }));
  assert.ok(table(out).some(r => r.item === "'=cmd|calc"));
});

test('csv: hidden and unavailable values are empty with their reason, never 0; a measured zero is 0', () => {
  const rows = table(toCsv(FIXTURES.not_enough_learners));
  const active = rows.find(r => r.section === 'overview' && r.metric === 'active_learners');
  assert.deepEqual([active.value, active.state], ['', STATE.NOT_ENOUGH]);
  assert.match(active.reason, /Fewer than 10 learners/);
  assert.ok(!rows.some(r => r.state === STATE.NOT_ENOUGH && r.value !== ''), 'no suppressed raw value');
  const today = table(toCsv(FIXTURES.not_collected));
  const nc = today.find(r => r.metric === 'active_learners');
  assert.deepEqual([nc.value, nc.state], ['', 'not_collected']);
  assert.match(nc.reason, /not approved yet/);
  const zero = today.find(r => r.section === 'canvas_comparison' && r.item === '[Dev fixture] Backprop by hand' && r.metric === 'forks');
  assert.deepEqual([zero.value, zero.state], ['0', STATE.ZERO]);
  for (const r of [...rows, ...today]) if (r.section !== 'about' && !['ready', 'measured_zero'].includes(r.state)) assert.equal(r.value, '', `${r.section} ${r.metric}`);
});

test('csv: parity - every metric value the payload shows appears once, with its unit, period and dates', () => {
  const d = FIXTURES.ready;
  const rows = table(toCsv(d));
  const find = (section, metric, item = '') => rows.filter(r => r.section === section && r.metric === metric && r.item === item);
  for (const [k, cell] of Object.entries(d.overview.metrics)) {
    const [r] = find('overview', k);
    assert.equal(r.value, cell.value == null ? '' : String(cell.value), k);
    assert.equal(r.period, cell.period, k);
  }
  for (const k of Object.keys(d.audience.metrics)) assert.equal(find('audience', k).length, 1, k);
  assert.equal(rows.filter(r => r.section === 'series').length, d.series.points.length * d.series.metrics.length);
  assert.equal(rows.filter(r => r.section === 'topics').length, d.topics.rows.length);
  assert.equal(rows.filter(r => r.section === 'canvas_comparison' && r.metric === 'forks').length, d.comparison.rows.length);
  assert.equal(rows.filter(r => r.section === 'traffic' && r.metric === 'visits').length, d.traffic.rows.length + 1, 'rows plus the explicit denominator');
  assert.equal(rows.filter(r => r.section === 'campaigns').length, d.campaigns.rows.length * 3);
  assert.equal(rows.filter(r => r.section === 'tools_resources').length, d.tools.resources.rows.length);
  assert.equal(find('overview', 'avg_active_seconds')[0].unit, 'seconds');
  assert.equal(find('overview', 'visit_to_learning')[0].unit, 'ratio');
  const forks = find('overview', 'forks')[0];
  assert.deepEqual([forks.period, forks.from, forks.to], ['all_time', '', ''], 'an all-time total carries no range');
  const about = Object.fromEntries(rows.filter(r => r.section === 'about').map(r => [r.metric, r.value]));
  assert.equal(about.coverage_since, '2026-09-01');
  assert.equal(about.coverage_through, '2026-10-23T11:45:00Z');
  assert.match(about.coverage_partial, /Today is still being recorded/);
  assert.equal(about.canvas_scope, 'All public canvases');
  assert.match(about['definition:returning_learners'], /30 days/);
  assert.ok(!/learner_key|session_key|visitor_id|@test|email/i.test(toCsv(d)), 'aggregate only: no learner or person identifier');
});

test('csv: with Compare on, each headline row carries the previous period and its change', () => {
  const rows = table(toCsv(FIXTURES.compare_previous_period));
  const active = rows.find(r => r.section === 'overview' && r.metric === 'active_learners');
  assert.deepEqual([active.value, active.previous_value, active.change_abs, active.change_pct, active.change_state, active.previous_from], ['140', '118', '22', '18.6', 'ready', '2026-08-24']);
  const rate = rows.find(r => r.section === 'overview' && r.metric === 'visit_to_learning');
  assert.deepEqual([rate.change_pp, rate.change_pct], ['5.1', '']);
  const holes = rows.find(r => r.section === 'overview' && r.metric === 'rabbit_holes_started');
  assert.deepEqual([holes.change_state, holes.change_pct], ['no_baseline', '']);
  assert.ok(rows.some(r => r.section === 'series_previous'));
  assert.equal(rows.find(r => r.metric === 'compare').value, '2026-08-24 to 2026-09-22 (ready)');
  assert.ok(!('previous_value' in table(toCsv(FIXTURES.ready))[0]), 'no comparison columns when Compare is off');
});
