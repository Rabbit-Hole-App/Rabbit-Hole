// Battery: main (b29b6bdd7) vs branch (08eab4313) visualFence via composeVisuals, and the stripUnknownKeys -> composeVisuals pipeline.
import { readFileSync } from 'node:fs';
const B = await import('file:///C:/s/sj-four/packages/control-plane/src/learn-primitives.js');
const M = await import('file:///C:/s/sj-four-out/main/packages/control-plane/src/learn-primitives.js');

const CYCLE = { version: 1, diagram: { title: 'The Thermostat Feedback Cycle', caption: 'c', kind: 'cycle', steps: ['a', 'b', 'c', 'd'] } };
const BARS = { version: 1, diagram: { kind: 'bar-chart', title: 'Two rows', variant: 'grouped', categories: ['A', 'B'], series: [{ label: 'One', values: [1, 2] }, { label: 'Two', values: [3, 4] }] } };
const DIRTY = { version: 1, extra: 1, diagram: { ...BARS.diagram, extraKey: 2, series: BARS.diagram.series.map(s => ({ ...s, stray: 3 })) } };
const PIC = { p: 'A wall thermostat cutaway, no text, labels, titles or icons', a: 'A thermostat', c: 'Bends' };
const BODY = 'Intro.\n\n[[visual:1]]\n\nAfter.', BODY2 = 'Intro.\n\n[[visual:1]]\n\nMid.\n\n[[visual:2]]\n\nAfter.';

const cases = [];
const add = (name, visuals, body = BODY) => cases.push({ name, body, visuals });
// the three existing kinds, with and without spec
for (const k of ['diagram', 'spec', 'picture']) {
  add(`${k} + cycle`, [{ k, spec: CYCLE }]); add(`${k} + bars`, [{ k, spec: BARS }]); add(`${k} no spec`, [{ k }]);
  add(`${k} + string spec`, [{ k, spec: 'x' }]); add(`${k} + array spec`, [{ k, spec: [CYCLE] }]); add(`${k} + spec w/o diagram`, [{ k, spec: { version: 1 } }]);
  add(`${k} + spec diagram string`, [{ k, spec: { version: 1, diagram: 'x' } }]); add(`${k} + dirty spec`, [{ k, spec: DIRTY }]);
  add(`${k} + pic fields`, [{ k, ...PIC }]); add(`${k} + pic fields + spec`, [{ k, ...PIC, spec: BARS }]);
}
// odd tags with a valid spec
for (const k of ['heatmap', 'bar-chart', 'cycle', '', ' ', 'Diagram', 'DIAGRAM', 'Spec', 'Picture', 'diagram ', ' diagram', 'diagrams', 'constructor', '__proto__', 'toString', 'rh-diagram', 'illustration']) add(`tag ${JSON.stringify(k)} + bars`, [{ k, spec: BARS }]);
for (const k of [7, 0, null, undefined, true, false, ['diagram'], { k: 'diagram' }, NaN]) add(`tag nontring ${String(JSON.stringify(k))} + bars`, [{ k, spec: BARS }]);
// malformed specs under a rescued-looking tag
for (const [n, spec] of [['no spec', undefined], ['null spec', null], ['array spec', [BARS]], ['string spec', 'x'], ['number spec', 5], ['empty object', {}], ['version only', { version: 1 }], ['diagram string', { version: 1, diagram: 'x' }], ['diagram array', { version: 1, diagram: [BARS.diagram] }], ['diagram null', { version: 1, diagram: null }], ['diagram number', { version: 1, diagram: 3 }], ['diagram empty object', { version: 1, diagram: {} }], ['dirty spec', DIRTY], ['spec with only diagram key', { diagram: BARS.diagram }]]) add(`heatmap + ${n}`, [{ k: 'heatmap', spec }]);
add('heatmap + spec + junk key', [{ k: 'heatmap', spec: BARS, junk: 1 }]);
add('heatmap + spec + p/a/c', [{ k: 'heatmap', spec: BARS, ...PIC }]);
add('heatmap + spec + p only', [{ k: 'heatmap', spec: BARS, p: 'x' }]);
// shapes of the item itself
for (const [n, v] of [['null', null], ['undefined', undefined], ['string', 'diagram'], ['number', 3], ['array', [{ k: 'heatmap', spec: BARS }]], ['empty', {}]]) add(`item ${n}`, [v]);
// placement
add('two rescued, both placed', [{ k: 'heatmap', spec: BARS }, { k: 'bar-chart', spec: CYCLE }], BODY2);
add('rescued + picture', [{ k: 'heatmap', spec: BARS }, { k: 'picture', ...PIC }], BODY2);
add('picture + rescued, no marker', [{ k: 'picture', ...PIC }, { k: 'heatmap', spec: BARS }], 'Intro only.');
add('rescued, marker repeated', [{ k: 'heatmap', spec: BARS }], 'A.\n\n[[visual:1]]\n\nB.\n\n[[visual:1]]\n\nC.');
add('rescued, marker for 2 but one visual', [{ k: 'heatmap', spec: BARS }], BODY2);
add('rescued mid-sentence marker', [{ k: 'heatmap', spec: BARS }], 'See [[visual:1]] where the bars rise. Next.');

const rows = [];
let diffs = 0, bad = 0, n = 0;
for (const c of cases) {
  for (const mode of ['compose', 'strip+compose']) {
    n++;
    const run = lib => { try { const v = mode === 'compose' ? c.visuals : lib.stripUnknownKeys(structuredClone(c.visuals)).visuals; return { out: lib.composeVisuals(c.body, v) }; } catch (e) { return { err: String(e.message) }; } };
    const m = run(M), b = run(B);
    const same = JSON.stringify(m) === JSON.stringify(b);
    const rescued = c.visuals.some(v => B.rescuedVisualTag(v) !== null);
    // after strip the tag test is on the stripped item, as learn-artifact does
    const rescuedAfter = mode === 'strip+compose' && (() => { try { return B.stripUnknownKeys(structuredClone(c.visuals)).visuals.some(v => B.rescuedVisualTag(v) !== null); } catch { return false; } })();
    if (!same) { diffs++; const allowed = mode === 'compose' ? rescued : rescuedAfter; if (!allowed) bad++; rows.push({ name: c.name, mode, allowed, main: m, branch: b }); }
    else if ((mode === 'compose' ? rescued : rescuedAfter)) rows.push({ name: c.name, mode, note: 'rescued-looking but SAME output', out: b.out });
  }
}
console.log(`runs ${n} (cases ${cases.length}), differences ${diffs}, differences NOT on a rescued item ${bad}`);
for (const r of rows) {
  if (r.note) console.log(`SAME  [${r.mode}] ${r.name}: ${r.note}`);
  else console.log(`DIFF  [${r.mode}] ${r.name} (allowed=${r.allowed})\n   main:   ${JSON.stringify(r.main).slice(0, 110)}\n   branch: ${JSON.stringify(r.branch).slice(0, 110)}`);
}
// stripped events: kind reported for the item's own stripped keys, tag vs 'diagram'
for (const tag of ['diagram', 'heatmap']) console.log('stripped events for tag', tag, JSON.stringify(B.stripUnknownKeys([{ k: tag, note: 'x', spec: DIRTY }]).stripped));
// frozen strings in the branch test vs MAIN's output
const t = readFileSync('C:/s/sj-four/packages/control-plane/test/explanation-rescued-visual.test.js', 'utf8');
const start = t.indexOf('const FROZEN = ['), end = t.indexOf('\n];', start);
const FROZEN = new Function(t.slice(start, end + 3).replace('const FROZEN =', 'return') )();
let fm = 0, fb = 0; for (const [name, body, visuals, expected] of FROZEN) { if (M.composeVisuals(body, visuals) !== expected) { fm++; console.log('FROZEN != main:', name); } if (B.composeVisuals(body, visuals) !== expected) { fb++; console.log('FROZEN != branch:', name); } }
console.log(`FROZEN entries ${FROZEN.length}; differing from MAIN output ${fm}; differing from BRANCH output ${fb}`);
