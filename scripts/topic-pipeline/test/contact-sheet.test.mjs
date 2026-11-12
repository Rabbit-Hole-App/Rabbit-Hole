import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { createContactSheet } from '../checks/contact-sheet.mjs';

async function previews(t) {
  const dir = await mkdtemp(join(tmpdir(), 'topic-contact-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function addPreview(root, id, diagram) {
  const dir = join(root, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'spec.json'), JSON.stringify({ version: 1, diagram }, null, 2) + '\n');
  await writeFile(join(dir, '408.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="408" height="80"><rect width="408" height="80" fill="#46a"/></svg>');
}

test('composes every selected depth from exporter previews and inventories numeric display text with provenance', async t => {
  const root = await previews(t);
  const source = join(root, 'topic.js');
  const sourceText = [
    'export const references = [{ spec: { diagram: {',
    "  title: 'Depth 4 with 16 leaves',",
    '  caption: `At ${1_000} rows, error is -0.5% and 2e-3.`,',
    "  x: { label: 'Angle 2 (degrees)' },",
    "  series: [{ label: 'Class 1' }],",
    '} } }];',
  ].join('\n');
  await writeFile(source, sourceText);
  const diagram = {
    kind: 'coordinate-plot', title: 'Depth 4 with 16 leaves',
    caption: 'At 1,000 rows, error is -0.5% and 2e-3.',
    x: { label: 'Angle 2 (degrees)', min: 0, max: 360 },
    series: [{ label: 'Class 1', points: [{ x: 0, y: 0, label: '1/2' }] }],
  };
  for (const id of ['ml-test', 'ml-test-brief', 'ml-test-detailed']) await addPreview(root, id, diagram);
  await addPreview(root, 'unrelated', { kind: 'bar-chart', title: '99 excluded' });
  const result = await createContactSheet({ previewDir: root, outDir: join(root, 'out'), sourceFiles: [source], references: ['ml-test'] });
  assert.equal(result.previewCount, 3);
  const metadata = await sharp(result.contactSheetPath).metadata();
  assert.equal(metadata.format, 'png');
  assert.ok(metadata.width >= 3 * 408, 'three full-width previews fit on the contact sheet');
  const inventory = JSON.parse(await readFile(result.numbersPath, 'utf8'));
  assert.deepEqual(new Set(inventory.previews.map(item => item.depth)), new Set(['brief', 'balanced', 'detailed']));
  assert.equal(inventory.numbers.length, 27);
  assert.equal(result.numberCount, 27);
  const balanced = inventory.numbers.filter(item => item.id === 'ml-test');
  assert.deepEqual(balanced.map(item => item.literal), ['4', '16', '1,000', '-0.5', '2e-3', '2', '1', '1', '2']);
  assert.deepEqual(balanced.map(item => item.value), [4, 16, 1000, -0.5, 0.002, 2, 1, 1, 2]);
  const title = balanced.find(item => item.field === 'diagram.title');
  assert.equal(title.referenceId, 'ml-test');
  assert.equal(title.sourceFile, source);
  assert.equal(title.sourceLine, 2);
  assert.equal(title.sourceKind, 'javascript');
  const caption = balanced.find(item => item.field === 'diagram.caption');
  assert.equal(caption.sourceLine, 3);
  assert.equal(caption.sourceKind, 'javascript');
  const generatedLabel = balanced.find(item => item.field === 'diagram.series[0].points[0].label');
  assert.equal(generatedLabel.sourceKind, 'preview-spec');
  for (const item of inventory.numbers) {
    assert.ok(item.specLine > 0);
    assert.ok(item.sourceLine > 0);
    const lines = (await readFile(item.specFile, 'utf8')).split('\n');
    assert.ok(lines[item.specLine - 1].includes(JSON.stringify(item.text)), 'exact exported text can be found at the recorded line');
  }
});

test('includes numeric matrix and tree labels and refuses missing 408 output', async t => {
  const root = await previews(t);
  await addPreview(root, 'ml-matrix', {
    kind: 'matrix', title: 'Two classes', columns: ['Class 0', 'Class 1'],
    rows: [{ heading: 'Tree 3', cells: ['0.25', '1/2'] }],
    nodes: [{ label: 'Leaf', detail: '4 rows', edgeLabel: 'x ≤ 2' }],
  });
  const result = await createContactSheet({ previewDir: root, outDir: join(root, 'out') });
  const inventory = JSON.parse(await readFile(result.numbersPath, 'utf8'));
  assert.deepEqual(inventory.numbers.map(item => item.literal), ['0', '1', '3', '0.25', '1', '2', '4', '2']);
  assert.ok(inventory.numbers.every(item => item.sourceKind === 'preview-spec'));
  await rm(join(root, 'ml-matrix', '408.svg'));
  await assert.rejects(createContactSheet({ previewDir: root, outDir: join(root, 'second') }), /408\.svg/);
});
