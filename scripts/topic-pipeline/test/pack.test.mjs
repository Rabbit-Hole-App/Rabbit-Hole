import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSet } from '../sets.mjs';
import { pack } from '../../explain-bench/topic-pack.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const realRun = join(repo, 'docs/features/explain/topics/decision-trees/fixture/pack.run');
const realSet = join(repo, 'scripts/explain-bench/sets/demo-lesson04.json');
const hasFile = async path => { try { await access(path); return true; } catch { return false; } };

test('generated topic set preserves the demo set contract: bare prompt, reference, kind, one standard run', () => {
  const set = makeSet({ topic: 'logistic-regression', estUsdPerCard: 0.012, prompts: [
    { id: 1, prompt: 'why does the sigmoid flatten?', kind: 'coordinate-plot', referenceId: 'ml-logistic-regression-sigmoid' },
    { id: 2, prompt: 'what does the confusion matrix show?', kind: 'matrix', referenceId: 'ml-logistic-regression-confusion' },
  ] });
  assert.equal(set.name, 'demo-logistic-regression');
  assert.equal(set.defaultRuns, 1);
  assert.deepEqual(set.defaultDepths, ['standard']);
  assert.deepEqual(set.prompts.map(p => [p.n, p.id, p.referenceId, p.referenceKind, p.askDepths]), [
    ['01', 'ml-logistic-regression-sigmoid', 'ml-logistic-regression-sigmoid', 'coordinate-plot', ['standard']],
    ['02', 'ml-logistic-regression-confusion', 'ml-logistic-regression-confusion', 'matrix', ['standard']],
  ]);
  assert.equal(set.prompts[0].prompt, 'why does the sigmoid flatten?');
  for (const p of set.prompts) {
    assert.equal(p.group, set.name); assert.equal(p.noPicture, true); assert.equal(p.needsPicture, false);
    assert.ok(!('lesson' in p) && !('context' in p) && !('selection' in p));
  }
});

test('generalised pack exports demo-lesson04 bench-run format and arbitrary topic ids, preserving regeneration history', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'topic-pack-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const spec = { version: 1, diagram: { kind: 'bar-chart', title: 'Votes', caption: 'Two votes.', bars: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] } };
  // Synthetic bench-run fixture, as in the donor exporter's test. This proves the saved format, not a live demo run.
  for (const [topic, referencePrefix, referenceId] of [
    ['lesson04', 'ml-trees-', 'ml-trees-majority-vote'],
    ['logistic-regression', 'ml-logistic-regression-', 'ml-logistic-regression-votes'],
  ]) {
    const base = join(temp, topic), run = join(base, 'run'), raw = join(base, 'raw'), refs = join(base, 'refs'), out = join(base, 'out');
    const set = makeSet({ topic, estUsdPerCard: 0.012, prompts: [{ id: 1, prompt: 'how are the votes counted?', kind: 'bar-chart', referenceId }] });
    const setFile = join(base, 'set.json'), summary = join(base, 'rows.json');
    const folder = `${set.name}-r1-standard`;
    await mkdir(join(raw, folder, 'cards'), { recursive: true }); await mkdir(run, { recursive: true });
    await mkdir(join(refs, referenceId), { recursive: true });
    const block = { title: 'Votes', body: `Prose before.\n\n\`\`\`rh-diagram\n${JSON.stringify(spec)}\n\`\`\`\n\nProse after.` };
    const card = { id: referenceId, set: set.name, run: 1, depth: 'standard', delivered: true, repaired: true,
      repairCauses: [{ attempt: 0, error: 'samples missing' }], totalMs: 3000, costUsd: 0.01,
      references: { ids: ['shape-bar-chart', referenceId] }, plan: { kind: 'bar-chart', fixed: true, pictures: 0 },
      diagrams: [{ kind: 'bar-chart' }], judge: { factual: { score: 5, errors: [], notes: ['correct'] } } };
    await writeFile(setFile, JSON.stringify(set));
    await writeFile(join(raw, folder, 'cards', `${referenceId}.json`), JSON.stringify({ row: { steer: [{ referenceId }], modelCalls: [{ ms: 2800 }] }, response: { block } }));
    await writeFile(join(run, 'results.json'), JSON.stringify({ meta: { raw, runId: 'synthetic-demo-run' }, cards: [card] }));
    await writeFile(join(refs, referenceId, 'spec.json'), JSON.stringify(spec));
    const options = { set: set.name, topic, setFile, runs: [run], tree: repo, out, refsDir: refs, referencePrefix, noPng: true, summary };
    const result = await pack(options);
    assert.equal(result.rows.length, 1);
    const dir = join(out, topic === 'lesson04' ? '01-majority-vote' : '01-votes');
    const md = await readFile(join(dir, 'card.md'), 'utf8');
    assert.match(md, /Selector hit .*: yes; first pick .*: no/);
    assert.match(md, /References sent.*shape-bar-chart/);
    assert.match(md, /model kind = expected: yes/);
    assert.match(md, /Sent bare/); assert.match(md, /Factual \(factual-v2\): 5\/5/);
    for (const file of ['pipeline.json', 'visual-1.json', 'visual-1.svg', 'reference-408.svg', 'reference-spec.json']) assert.ok(await hasFile(join(dir, file)), file);
    assert.match(await readFile(join(out, 'index.md'), 'utf8'), new RegExp(`# Review pack ${set.name}`));
    const rows = JSON.parse(await readFile(summary, 'utf8'));
    assert.equal(rows[0].referenceSent, true); assert.equal(rows[0].kindMatch, true); assert.equal(rows[0].delivered, true);
    await writeFile(join(out, 'REVIEW.md'), 'Reviewer notes');
    await mkdir(join(out, '98-keep'));
    await pack({ ...options, only: [referenceId] });
    assert.equal(await readFile(join(out, 'REVIEW.md'), 'utf8'), 'Reviewer notes');
    assert.ok(await hasFile(join(out, '98-keep')));
    assert.ok(await hasFile(join(dir, 'previous-pipeline.json')));
    assert.match(await readFile(join(dir, 'card.md'), 'utf8'), /Previous run/);
  }
  if (!await hasFile(join(realRun, 'results.json'))) t.diagnostic('Actual saved demo-lesson04 results.json/raw run directory is absent; the test above uses an explicitly synthetic bench-format fixture.');
});

test('pack generalisation on the saved demo-lesson04 run directory', { skip: !await hasFile(join(realRun, 'results.json')) || !await hasFile(realSet) ? 'Reviewer saved demo-lesson04 bench results.json/raw run directory and set are not supplied' : false }, async t => {
  const out = await mkdtemp(join(tmpdir(), 'saved-demo-pack-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  const result = await pack({ set: 'demo-lesson04', topic: 'decision-trees', setFile: realSet, runs: [realRun], out, tree: repo,
    refsDir: join(repo, 'docs/features/explain/topics/decision-trees/fixture/references.human'), referencePrefix: 'ml-trees-', noPng: true });
  assert.equal(result.rows.length, 13);
  assert.equal(result.rows.filter(row => row.c).length, 13);
  assert.ok(await hasFile(join(out, 'index.md')));
});
