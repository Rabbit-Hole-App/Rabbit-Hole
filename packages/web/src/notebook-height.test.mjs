import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTEBOOK_CHROME, notebookHeight } from './notebook-height.js';

const code = (source, outputs = []) => ({ cell_type: 'code', source, outputs });
// A 1 x 1 PNG header is enough: only its stated size is read.
const png = (w, h) => { const bytes = new Uint8Array(24); new DataView(bytes.buffer).setUint32(16, w); new DataView(bytes.buffer).setUint32(20, h); return btoa(String.fromCharCode(...bytes)); };

test('an empty notebook is its chrome; every cell and every line adds height', () => {
  assert.equal(notebookHeight({ cells: [] }, 640), NOTEBOOK_CHROME);
  assert.equal(notebookHeight(undefined, 640), NOTEBOOK_CHROME);
  const one = notebookHeight({ cells: [code('x = 1')] }, 640), two = notebookHeight({ cells: [code('x = 1'), code('y = 2')] }, 640);
  assert.ok(one > NOTEBOOK_CHROME && two > one);
  const tall = notebookHeight({ cells: [code(Array.from({ length: 50 }, (_, i) => `x${i} = ${i}`).join('\n'))] }, 640);
  assert.ok(tall - one >= 49 * 17, 'each source line adds a line height');
  assert.equal(notebookHeight({ cells: [code(['a = 1\n', 'b = 2'])] }, 640), notebookHeight({ cells: [code('a = 1\nb = 2')] }, 640), 'nbformat source arrays read as one text');
});

test('outputs add height: stream text wraps with the width, an image takes its own height, an error its traceback', () => {
  const bare = notebookHeight({ cells: [code('print(1)')] }, 640);
  const text = 'word '.repeat(200);
  const narrow = notebookHeight({ cells: [code('print(1)', [{ output_type: 'stream', text }])] }, 400), wide = notebookHeight({ cells: [code('print(1)', [{ output_type: 'stream', text }])] }, 1200);
  assert.ok(narrow > wide && wide > bare, 'a narrower card wraps the same output onto more lines');
  const plot = notebookHeight({ cells: [code('plot()', [{ output_type: 'display_data', data: { 'image/png': png(500, 300) } }])] }, 640);
  assert.ok(plot - notebookHeight({ cells: [code('plot()')] }, 640) >= 300, 'a 500 x 300 plot at 640 wide is drawn 300 high');
  const huge = notebookHeight({ cells: [code('plot()', [{ output_type: 'display_data', data: { 'image/png': png(4000, 2000) } }])] }, 640);
  assert.ok(huge - notebookHeight({ cells: [code('plot()')] }, 640) < 2000, 'a wide image is scaled down to the card');
  const failed = notebookHeight({ cells: [code('1/0', [{ output_type: 'error', traceback: ['\u001b[31mZeroDivisionError\u001b[0m', 'line 2', 'line 3'] }])] }, 640);
  assert.ok(failed > notebookHeight({ cells: [code('1/0')] }, 640) + 3 * 17);
});

test('markdown cells count their wrapped lines and weigh headings more', () => {
  const plain = notebookHeight({ cells: [{ cell_type: 'markdown', source: 'text' }] }, 640), heading = notebookHeight({ cells: [{ cell_type: 'markdown', source: '# text' }] }, 640);
  assert.ok(heading > plain && plain > NOTEBOOK_CHROME);
  const long = 'sentence '.repeat(100);
  assert.ok(notebookHeight({ cells: [{ cell_type: 'markdown', source: long }] }, 400) > notebookHeight({ cells: [{ cell_type: 'markdown', source: long }] }, 1200));
});
