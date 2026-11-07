// Ask about selection: a per-card report beside the optional picture (area-evidence.js, area-crop.js). A mixed selection of a Markdown
// file card, a notebook, a PDF card and a YouTube moment tells the model what each one gives and what the picture cannot show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaTarget, cropBinding, unmountedBinding, withoutPicture } from './area-crop.js';
import { EVIDENCE_LIMITS, cardEvidence, savedCells } from './area-evidence.js';

const rect = (left, top, width, height) => ({ left, top, width, height });
const markdown = { id: 'md', type: 'file', kind: 'text', label: 'notes.md', fileRef: { source: { id: 'f1' } }, title: 'notes.md' };
const notebook = { id: 'nb', type: 'notebook', notebook_id: 'n1', title: 'Gradient descent', language: 'python', ipynb: { cells: [
  { cell_type: 'markdown', source: ['# Steps\n', 'Move downhill.'] }, { cell_type: 'code', source: 'w = 0\nfor _ in range(10):\n    w -= 0.1 * (2 * w - 4)', outputs: [{ output_type: 'stream', text: 'SECRET OUTPUT' }] }] } };
const pdf = { id: 'pdf1', type: 'pdf', label: 'lecture-3.pdf', assetKey: 'asset-1', title: 'lecture-3.pdf' };
const video = { id: 'yt', type: 'video', videoId: 'abc123', title: 'Why gradients', channel: 'Lab', start: 30, end: 95 };
const bind = (block, extra = {}) => ({ ...cropBinding(block, rect(0, 0, 100, 100), { card: rect(0, 0, 200, 200) }), ...cardEvidence(block), ...extra });

test('a mixed Markdown, Notebook, PDF and YouTube selection: every card has an entry, with what is omitted and what was saved', () => {
  const bindings = [markdown, notebook, pdf, video].map(block => bind(block));
  const text = areaTarget({ id: 'area:m', bindings, preview: 'data:image/png;base64,AAAA' }).text;
  assert.match(text, /except the cards marked "Not in the picture" below/, 'the picture is not claimed whole');
  for (const title of ['notes.md', 'Gradient descent', 'lecture-3.pdf', 'Why gradients']) assert.ok(text.includes(`"${title}"`), title);
  assert.match(text, /Not in the picture: the live notebook pane is omitted\. Saved content follows below\./);
  assert.match(text, /Not in the picture: the embedded PDF viewer is omitted and the visible page is unknown\./);
  assert.match(text, /Not in the picture: the playback frame and the current time are unavailable\./);
  assert.match(text, /Saved cells of "Gradient descent":\nSaved cells \(2 of 2\):\n\[markdown 1\] # Steps\nMove downhill\./);
  assert.match(text, /\[code 2\] w = 0/);
  assert.match(text, /YouTube moment: Why gradients \(video abc123, Lab\), window 30s-95s/);
  assert.match(text, /PDF on the canvas: lecture-3\.pdf/);
  assert.ok(!text.includes('SECRET OUTPUT'), 'cell outputs never travel');
});

test('the coverage lines come before every excerpt, so the 8000-character cap on the target cuts excerpts first', () => {
  const big = { ...notebook, ipynb: { cells: Array.from({ length: 40 }, (_, i) => ({ cell_type: 'code', source: `x${i} = ${'1 + '.repeat(500)}1` })) } };
  const bindings = [bind(markdown), bind(big), bind(pdf), bind(video)];
  const text = areaTarget({ id: 'area:big', bindings, preview: 'data:image/png;base64,AAAA' }).text;
  assert.ok(text.lastIndexOf('Not in the picture') < text.indexOf('Saved content of these cards'));
  const head = text.slice(0, text.indexOf('Saved content of these cards'));
  assert.ok(head.length < 2000, `coverage part is ${head.length} characters`);
  assert.ok(text.length - head.length < EVIDENCE_LIMITS.excerpts + 600, 'excerpts are bounded');
  assert.match(savedCells(big), /\[cut, \d+ more characters\]/, 'a long cell is cut with a marker');
  assert.ok((savedCells(big).match(/\[code /g) || []).length <= EVIDENCE_LIMITS.cells);
});

test('a card the rectangle meets that is not drawn is still named, with no bounds', () => {
  const entry = { ...unmountedBinding(notebook), ...cardEvidence(notebook) };
  assert.equal(entry.bounds, null);
  const text = areaTarget({ id: 'area:u', bindings: [entry], preview: null }).text;
  assert.match(text, /inside the rectangle but not drawn on screen when the picture was taken/);
  assert.match(text, /Saved cells of "Gradient descent"/);
  assert.match(text, /no picture of it could be attached/);
});

test('without a picture (failed capture or upload) the partial claim is withdrawn too', () => {
  const target = areaTarget({ id: 'area:w', bindings: [bind(notebook)], preview: 'data:image/png;base64,AAAA' });
  assert.match(target.text, /the attached image shows that area/);
  const plain = withoutPicture(target).text;
  assert.doesNotMatch(plain, /the attached image shows that area/);
  assert.match(plain, /no picture of it could be attached/);
  assert.match(plain, /Not in the picture: the live notebook pane is omitted/);
});

test('cards the picture shows fully add only their own text, bounded; a notebook with no saved cells says so', () => {
  assert.deepEqual(cardEvidence({ id: 'x', type: 'note', title: 'plain' }), {});
  assert.equal(savedCells({ ...notebook, ipynb: { cells: [] } }), 'No saved cells.');
  assert.deepEqual(cardEvidence({ id: 'v', type: 'video', mode: 'generate' }), {}, 'a generated video is not a YouTube moment');
  assert.match(cardEvidence({ id: 'a', type: 'animation3d', title: 'Orbit' }).omitted, /live 3D visuals are unverified/);
});

test('the single-Paper region path is unchanged: no omitted entries, the picture is claimed whole and the paper region still rides', () => {
  const paper = { id: 'p1', type: 'paper', title: 'Attention', paper: { id: '1706.03762', page: 4 } };
  const binding = cropBinding(paper, rect(150, 250, 100, 100), { card: rect(100, 100, 300, 500), page: rect(100, 200, 300, 400) });
  const target = areaTarget({ id: 'area:p', bindings: [{ ...binding, ...cardEvidence(paper) }], preview: 'data:image/png;base64,AAAA' });
  assert.ok(!/Not in the picture/.test(target.text));
  assert.deepEqual(target.paper.selection.region, binding.region);
});
