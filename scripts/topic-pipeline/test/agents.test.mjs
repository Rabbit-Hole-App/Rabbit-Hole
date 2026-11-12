import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv from 'ajv';
import sharp from 'sharp';
import { run as promptsStage } from '../stages/01-prompts.mjs';
import { run as verifyStage } from '../stages/04-verify.mjs';
import { run as auditStage } from '../stages/07-audit.mjs';
import { promptsSchema, verifySchema, auditSchema, createAuthorSchema, validateAuthorFiles } from '../schemas.mjs';

test('agent schemas enforce verdict layers and authored file paths before writes', () => {
  const ajv = new Ajv();
  const verify = ajv.compile(verifySchema), audit = ajv.compile(auditSchema);
  assert.equal(verify({ topic: 'decision-trees', figures: [{ id: 'a', verdict: 'fix', reasons: ['axis units'], layer: 'label' }] }), true);
  assert.equal(verify({ topic: 'decision-trees', figures: [{ id: 'a', verdict: 'maybe', reasons: [], layer: 'label' }] }), false);
  assert.equal(audit({ topic: 'decision-trees', cards: [{ id: '08', verdict: 'hold', reason: 'wrong count', layer: 'author-prose' }] }), true);
  assert.equal(audit({ topic: 'decision-trees', cards: [{ id: '08', verdict: 'hold', reason: 'wrong count', layer: 'invented' }] }), false);
  assert.doesNotThrow(() => validateAuthorFiles({ files: [{ path: 'packages/web/src/tutor-diagrams/topic-logistic-regression-data.js', content: 'export const rows = [];' }] }, { topic: 'logistic-regression' }));
  assert.throws(() => validateAuthorFiles({ files: [{ path: 'scripts/topic-pipeline/config.local.json', content: '{}' }] }, { topic: 'logistic-regression' }));
  assert.throws(() => validateAuthorFiles({ files: [{ path: 'packages/web/src/tutor-diagrams/lesson-decision-trees-data.js', content: '{}' }] }, { topic: 'decision-trees', dryRun: true }));
});

test('fixture stages 01, 04 and 07 use source text, defective and corrected previews, and card comparisons with mocked clients', async () => {
  const root = await mkdtemp(join(tmpdir(), 'topic-agents-'));
  const topicDir = join(root, 'decision-trees'), fixtureDir = join(topicDir, 'fixture');
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(join(root, 'source.md'), 'Decision trees use a tiny labelled training dataset.');
  await writeFile(join(topicDir, 'topic.json'), JSON.stringify({ topic: 'decision-trees', title: 'Decision trees', lessons: ['04'], sources: [{ kind: 'owner', path: 'source.md', revision: '' }] }));
  const promptResult = { topic: 'decision-trees', toyData: { rows: [[0, 0], [1, 1]], features: ['x'], label: 'y', usedBy: [1] },
    prompts: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, prompt: `how does example ${i + 1} work?`, kind: i < 6 ? 'coordinate-plot' : i < 9 ? 'tree' : 'matrix',
      content: 'show the training split', keywords: ['tree split', 'training rows'], data: 'toy-exact', why: 'one point', origin: 'lesson', lesson: '04' })) };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="408" height="120"><text x="10" y="30">count 1</text></svg>';
  for (const [folder, id] of [['references.human', 'ml-trees-test'], ['references.defective', 'ml-trees-test@c3e40994']]) {
    const directory = join(fixtureDir, folder, id); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'spec.json'), JSON.stringify({ version: 1, diagram: { kind: 'tree', title: 'count 1', nodes: [{ id: 'a', label: 'one row' }] } }, null, 2));
    await writeFile(join(directory, '408.svg'), svg);
  }
  await writeFile(join(fixtureDir, 'prompts.human.json'), JSON.stringify(promptResult));
  const cardDir = join(fixtureDir, 'pack.human', '08-tree'); await mkdir(cardDir, { recursive: true });
  await writeFile(join(cardDir, 'card.md'), '# Body\nWrong count\n# Pipeline\nReferences sent ml-trees-test\nFactual false');
  await writeFile(join(cardDir, 'reference-408.svg'), svg);
  await sharp(Buffer.from(svg)).png().toFile(join(cardDir, 'card.png'));
  const calls = [];
  const ctx = { topic: 'decision-trees', topicDir, fixtureDir, fixture: true, config: { paths: { sourceRoot: root } },
    call: async (agent, inputs, options) => {
      calls.push(agent); assert.match(options.system, /docs\/features\/explain\/topics\/SOP.md/);
      if (agent === 'prompt-writer') { assert.match(inputs.sources[0].text, /training dataset/); return promptResult; }
      assert.ok(options.images.length > 0);
      if (agent === 'verifier') {
        assert.deepEqual(inputs.figures.map(row => row.id).sort(), ['ml-trees-test', 'ml-trees-test@c3e40994']);
        return { topic: 'decision-trees', figures: inputs.figures.map(row => ({ id: row.id, verdict: row.id.includes('@') ? 'fix' : 'ship', reasons: [], layer: 'label' })) };
      }
      assert.match(inputs.cards[0].bodyAndPipeline, /Factual false/);
      return { topic: 'decision-trees', cards: [{ id: '08-tree', verdict: 'hold', reason: 'wrong count', layer: 'author-prose' }] };
    } };
  assert.equal((await promptsStage(ctx)).status, 'ok');
  assert.equal((await verifyStage(ctx)).status, 'ok');
  assert.equal((await auditStage(ctx)).status, 'ok');
  assert.deepEqual(calls, ['prompt-writer', 'verifier', 'auditor']);
  assert.equal(JSON.parse(await readFile(join(topicDir, 'audit.json'))).cards[0].verdict, 'hold');
});
