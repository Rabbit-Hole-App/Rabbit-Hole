// scripts/explain-bench/layer-report.mjs on fixture run dirs (tiny synthetic results.json, no model call): one section per layer, a verdict line per layer, 'n/a' where the new run is absent,
// the planner collateral flag, the setup-step cycle scan, the prose pass criteria and the commits listed for a regressed layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerReport } from './explain-bench/layer-report.mjs';

const cycle = first => ({ kind: 'cycle', spec: { diagram: { kind: 'cycle', steps: [first, 'Assign', 'Update'] } } });
const card = (id, o = {}) => ({ set: 'baseline', id, depth: null, run: 1, delivered: true, score: 'right', plan: { kind: 'flow' }, repaired: false, repairCauses: [], corrections: {}, diagrams: [{ kind: 'flow', spec: { diagram: { nodes: [{ id: 'a', role: 'decision' }, { id: 'b' }, { id: 'c' }], edges: [{ from: 'a', to: 'b', label: 'Yes' }, { from: 'a', to: 'c', label: 'No' }] } } }], mix: ['D:flow'], ...o });
const run = cards => { const d = mkdtempSync(join(tmpdir(), 'layer-')); writeFileSync(join(d, 'results.json'), JSON.stringify({ cards })); return d; };
const prose = (right, pointed, voc, yes) => ({ rubric: Object.fromEntries(['overview', 'standard', 'deep'].map(d => [d, { yes: d === 'standard' ? yes : 20, possible: 42, perQuestion: { 'opens-concrete': 3, 'visual-pointed-at': pointed, vocabulary: voc, } }])), persona: Object.fromEntries(['overview', 'standard', 'deep'].map(d => [d, { level: { right: d === 'deep' ? right : 3, 'too basic': 1 } }])), blind: [{ hits: 2, judged: 2 }] });
const proseDir = r => { const d = mkdtempSync(join(tmpdir(), 'prose-')); writeFileSync(join(d, 'prose-results.json'), JSON.stringify(r)); return d; };

test('layer report: one section and one verdict per layer, flat when nothing moved, n/a without a new run', async () => {
  const old = run([card('a'), card('b', { diagrams: [cycle('Initialize k centroids')] , plan: { kind: 'cycle' } })]);
  const same = await layerReport({ new: run([card('a'), card('b', { diagrams: [cycle('Initialize k centroids')], plan: { kind: 'cycle' } })]), old });
  for (const s of ['### Planner', '### Prompt', '### Server', '### Codex', '### Prose pass']) assert.ok(same.includes(s), s);
  for (const l of ['PLANNER', 'PROMPT', 'SERVER', 'CODEX', 'PROSE']) assert.match(same, new RegExp(`- ${l}: flat`));
  assert.match(same, /No layer regressed/);
  const none = await layerReport({ new: 'none', old });
  assert.match(none, /n\/a: no new run/);
});

test('planner: a kind change that lands outside the accepted labels is collateral; the cycle setup scan sees the removed setup step; repairs by cause', async () => {
  const old = run([card('a'), card('b', { diagrams: [cycle('Initialize k centroids')], plan: { kind: 'cycle' } }), card('c', { repaired: true, repairCauses: [{ attempt: 0, cause: 'two roots' }] })]);
  const nw = run([card('a', { plan: { kind: 'tree' }, score: 'wrong' }), card('b', { diagrams: [cycle('Assign points')], plan: { kind: 'cycle' } }), card('c')]);
  const r = await layerReport({ new: nw, old, repo: tmpdir(), ref: 'nope', since: 'nope' });
  assert.match(r, /baseline\/a\/-\/r1: flow -> tree, label R -> W COLLATERAL/);
  assert.match(r, /Cycles whose first step is a setup step: 1\/1 -> 0\/1/);
  assert.match(r, /\| two roots \| 1 \| 0 \|/);
  assert.match(r, /Repaired cards: 1\/3 -> 0\/3/);
});

test('prose pass: the owner criteria decide the verdict; a regressed layer prints its commit list or why git failed', async () => {
  const old = run([card('a')]), nw = run([card('a', { plan: { kind: 'tree' }, score: 'wrong' }), card('b', { plan: { kind: 'tree' }, score: 'wrong' }), card('c', { plan: { kind: 'tree' }, score: 'wrong' }), card('d', { plan: { kind: 'tree' }, score: 'wrong' })].slice(0, 1));
  const good = await layerReport({ new: nw, old, 'prose-old': proseDir(prose(0, 0, 2, 19)), 'prose-new': proseDir(prose(5, 5, 2, 26)) });
  assert.match(good, /- PROSE: improved \(4\/4 owner criteria pass\)/);
  const bad = await layerReport({ new: nw, old, 'prose-old': proseDir(prose(0, 0, 2, 26)), 'prose-new': proseDir(prose(2, 1, 1, 19)), repo: tmpdir(), ref: 'nope', since: 'nope' });
  assert.match(bad, /- PROSE: regressed/);
  assert.match(bad, /Regressed.*PLANNER|Regressed layer PROSE|Regressed: PLANNER, PROSE|Regressed: PROSE|n\/a: git log failed/);
});
