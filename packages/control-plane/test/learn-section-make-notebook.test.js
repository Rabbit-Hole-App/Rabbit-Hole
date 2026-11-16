import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, UNAVAILABLE_SENTENCE } from '../src/learn-section-make/notebook.js';

// The runtime list is injected (CONTRACT.md: BROWSER's notebook-runtime.js unavailableImports); here only numpy and the standard library run.
const RUNS = new Set(['numpy', 'math', 'random']);
const unavailableImports = code => [...code.matchAll(/^\s*(?:import|from)\s+(\w+)/gm)].map(m => m[1]).filter(p => !RUNS.has(p));
const ctx = { item: { id: 'i4', content: 'authored' }, beat: { anchors: [] }, snapshot: { files: {} }, section: { id: '2.1' } };
const md = text => ({ type: 'markdown', source: text }), code = text => ({ type: 'code', source: text });
const notebook = cells => ({ notebooks: [{ path: 'see.ipynb', cells }] });

test('C §3e.4: a torch cell is kept, marked runtime unavailable, and its markdown carries the sentence', async () => {
  const cells = [md('Set the sizes.'), code('import numpy as np\nn = 8'), md('The same step with the library the source uses.'), code('import torch\nx = torch.zeros(n)'), md('Change n and rerun.')];
  const out = await validate(notebook(cells), ctx, { unavailableImports });
  assert.deepEqual(out.perform.runtime, [{ path: 'see.ipynb', cell: 3, package: 'torch' }]);
  const ipynb = JSON.parse(out.perform.files[0].content);
  assert.equal(ipynb.nbformat, 4);
  assert.equal(ipynb.cells[3].source, 'import torch\nx = torch.zeros(n)');
  assert.deepEqual(ipynb.cells[3].metadata, { runtime: 'unavailable', package: 'torch' });
  assert.ok(ipynb.cells[2].source.endsWith(UNAVAILABLE_SENTENCE('torch')));
  assert.equal(ipynb.cells[1].metadata.runtime, undefined);
});

test('C §3e.5: a planted while True cell is refused', async () => {
  const cells = [md('Count up.'), code('i = 0\nwhile True:\n    i += 1'), md('Change the step and rerun.')];
  assert.match((await validate(notebook(cells), ctx, { unavailableImports })).error, /while True loop with no break/);
});
