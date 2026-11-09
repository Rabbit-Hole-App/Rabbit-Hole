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
  const c = { set: 'demo-lesson04', run: 1, depth: null, id: 'ml-trees-majority-vote', delivered: true, repaired: false, repairCauses: [], totalMs: 3000, costUsd: 0.01, tokens: { input: 10, output: 5 },
    references: { count: 2, ids: ['ml-trees-grown-tree', 'ml-trees-majority-vote'] }, plan: { kind: 'bar-chart', fixed: true, pictures: 0 }, planCheck: { planKind: 'bar-chart', offered: null },
    diagrams: [{ kind: 'bar-chart', spec: spec.diagram }], judge: { factual: { score: 4, errors: [], notes: ['fine'] } } };
  mkdirSync(join(raw, 'demo-lesson04-r1', 'cards'), { recursive: true }); mkdirSync(run, { recursive: true }); mkdirSync(join(refs, 'illustrations', 'ml-trees-majority-vote'), { recursive: true });
  writeFileSync(join(raw, 'demo-lesson04-r1', 'cards', 'ml-trees-majority-vote.json'), JSON.stringify({ row: { modelCalls: [{ ms: 2500 }] }, response: { block } }));
  writeFileSync(join(run, 'results.json'), JSON.stringify({ meta: { runId: 'fixture', raw }, cards: [c] }));
  writeFileSync(join(refs, 'illustrations', 'ml-trees-majority-vote', 'spec.json'), JSON.stringify(spec)); // no 408.svg: rendered from the spec
  const r = await pack({ runs: [run], out, refsDir: refs, noPng: true });
  assert.equal(r.rows.length, 15);
  const md = readFileSync(join(out, '11-majority-vote', 'card.md'), 'utf8');
  assert.match(md, /Selector hit .*: yes; first pick .*: no/);
  assert.match(md, /model kind = expected: yes/);
  assert.match(md, /Factual \(factual-v2\): 4\/5, error no - fine/);
  for (const f of ['pipeline.json', 'visual-1.json', 'visual-1.svg', 'reference-408.svg']) assert.ok(existsSync(join(out, '11-majority-vote', f)), f);
  assert.match(readFileSync(join(out, 'index.md'), 'utf8'), /Cards run 1 of 15/);
  assert.ok(existsSync(join(out, 'REVIEW.md')));
});
