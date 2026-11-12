import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pack, selectorCheck, variantId } from './demo-lesson04-pack.mjs';

test('selector check compares by base id, hit and first pick separately', () => {
  assert.deepEqual(selectorCheck(['ml-trees-a-detailed', 'ml-trees-b'], 'ml-trees-a'), { hit: true, first: true });
  assert.deepEqual(selectorCheck(['ml-trees-b', 'ml-trees-a'], 'ml-trees-a'), { hit: true, first: false });
  assert.deepEqual(selectorCheck([], 'ml-trees-a'), { hit: false, first: false });
  assert.deepEqual(selectorCheck(null, 'ml-trees-a'), { hit: null, first: null });
  assert.equal(variantId('ml-trees-a', 'deep'), 'ml-trees-a-detailed');
});

test('pack writes the per-card folder from a fixture bench run', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'demo04-')), run = join(tmp, 'run'), raw = join(tmp, 'raw'), refs = join(tmp, 'refs'), out = join(tmp, 'out');
  const spec = { version: 1, diagram: { kind: 'bar-chart', title: 'T', caption: 'C', bars: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }] } };
  const block = { title: 'Gini split', body: `Prose before.\n\n\`\`\`rh-diagram\n${JSON.stringify(spec)}\n\`\`\`\n\nProse after.`, interactions: { questions: [{ text: 'Why?' }] } };
  const c = { set: 'demo-lesson04', run: 1, depth: null, id: 'ml-trees-majority-vote', delivered: true, repaired: true, repairCauses: [{ attempt: 0, error: 'explanation_bad_diagram: samples missing' }], totalMs: 3000, costUsd: 0.01, tokens: { input: 10, output: 5 },
    references: { count: 2, ids: ['ml-trees-grown-tree', 'ml-trees-majority-vote'] }, plan: { kind: 'bar-chart', fixed: true, pictures: 0 }, planCheck: { planKind: 'bar-chart', offered: null },
    diagrams: [{ kind: 'bar-chart', spec: spec.diagram }], judge: { factual: { score: 4, errors: [], notes: ['fine'] } } };
  mkdirSync(join(raw, 'demo-lesson04-r1', 'cards'), { recursive: true }); mkdirSync(run, { recursive: true }); mkdirSync(join(refs, 'illustrations', 'ml-trees-majority-vote'), { recursive: true });
  writeFileSync(join(raw, 'demo-lesson04-r1', 'cards', 'ml-trees-majority-vote.json'), JSON.stringify({ row: { modelCalls: [{ ms: 2500 }], steer: [{ plannerKind: 'flow', referenceId: 'ml-trees-majority-vote', score: 52 }] }, response: { block } }));
  writeFileSync(join(run, 'results.json'), JSON.stringify({ meta: { runId: 'fixture', raw }, cards: [c] }));
  writeFileSync(join(refs, 'illustrations', 'ml-trees-majority-vote', 'spec.json'), JSON.stringify(spec)); // no 408.svg: rendered from the spec
  const r = await pack({ runs: [run], out, refsDir: refs, noPng: true });
  assert.equal(r.rows.length, 13);
  const md = readFileSync(join(out, '11-majority-vote', 'card.md'), 'utf8');
  assert.match(md, /Selector hit .*: yes; first pick .*: no/);
  assert.match(md, /model kind = expected: yes/);
  assert.match(md, /Steer .*: plannerKind flow, referenceId ml-trees-majority-vote, score 52/);
  assert.match(md, /cause .first attempt error.: attempt 0: explanation_bad_diagram: samples missing/);
  assert.match(md, /Sent bare/);
  assert.match(md, /Factual \(factual-v2\): 4\/5, error no - fine/);
  for (const f of ['pipeline.json', 'visual-1.json', 'visual-1.svg', 'reference-408.svg']) assert.ok(existsSync(join(out, '11-majority-vote', f)), f);
  assert.match(readFileSync(join(out, 'index.md'), 'utf8'), /Cards run 1 of 13/);
  assert.match(readFileSync(join(out, 'REVIEW.md'), 'utf8'), /author-prompt rule #8c/);
  assert.match(readFileSync(join(out, 'index.md'), 'utf8'), /sent bare, as the owner types it/);
  mkdirSync(join(out, '99-stale')); await pack({ runs: [run], out, refsDir: refs, noPng: true });
  assert.ok(!existsSync(join(out, '99-stale')), 'a new pack replaces old card folders');
  mkdirSync(join(out, '98-keep')); writeFileSync(join(out, 'REVIEW.md'), 'lead text');
  await pack({ runs: [run], out, refsDir: refs, noPng: true, only: ['majority-vote'] });
  assert.ok(existsSync(join(out, '98-keep')) && readFileSync(join(out, 'REVIEW.md'), 'utf8') === 'lead text', '--only keeps other folders and REVIEW.md');
  assert.match(readFileSync(join(out, '11-majority-vote', 'card.md'), 'utf8'), /## Previous run[^]*Steer .*plannerKind flow/);
  assert.ok(existsSync(join(out, '11-majority-vote', 'previous-pipeline.json')));
});
