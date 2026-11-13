import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brokenWords, lintPreviewWrap, specWords, textLines } from '../checks/preview-wrap.mjs';

const svg = lines => `<svg xmlns="http://www.w3.org/2000/svg"><text x="1" y="1">${lines.map(line => `<tspan x="1" y="1">${line}</tspan>`).join('')}</text></svg>`;
const spec = { version: 1, diagram: { kind: 'matrix', title: 'Confusion matrix', columns: ['Predicted positive', 'Predicted negative'], rows: [{ heading: 'Actually positive', cells: ['TP', 'FN'] }] } };

async function previews(t, lines, width = '408') {
  const root = await mkdtemp(join(tmpdir(), 'wrap-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'ml-demo-matrix-brief'), { recursive: true });
  await writeFile(join(root, 'ml-demo-matrix-brief', 'spec.json'), JSON.stringify(spec));
  await writeFile(join(root, 'ml-demo-matrix-brief', `${width}.svg`), svg(lines));
  return root;
}

test('a label broken inside a word fails with the id, depth, width and the broken word', async t => {
  const flags = await lintPreviewWrap({ previewDir: await previews(t, ['Predicte', 'd positive']) });
  assert.equal(flags.length, 1);
  assert.deepEqual([flags[0].id, flags[0].depth, flags[0].rule, flags[0].width, flags[0].severity], ['ml-demo-matrix-brief', 'brief', 12, '408', 'error']);
  assert.match(flags[0].detail, /"Predicted"/u);
  assert.match(flags[0].detail, /width 408/u);
});

test('a label wrapped at a space passes, at every width', async t => {
  for (const width of ['408', 'natural', '960']) assert.deepEqual(await lintPreviewWrap({ previewDir: await previews(t, ['Predicted', 'positive'], width) }), []);
});

test('the break is found at any line of a three-line label and only inside a word of the label', () => {
  const words = specWords(spec);
  assert.equal(brokenWords(['Actual', 'ly positive'], words)[0]?.word, 'Actually');
  assert.deepEqual(brokenWords(['Actually', 'positive'], words), []);
  assert.deepEqual(brokenWords(['Predicted pos', 'itive class'], words)[0]?.word, 'positive');
  assert.deepEqual(brokenWords(['in', 'tomorrow'], words), [], 'two whole words are not a split word');
  assert.deepEqual(brokenWords(['bias-', 'variance'], new Set(['bias-variance'])), [], 'a break after a hyphen is the renderer\'s own');
  assert.deepEqual(textLines(svg(['one'])), [], 'a single line has no break');
});
