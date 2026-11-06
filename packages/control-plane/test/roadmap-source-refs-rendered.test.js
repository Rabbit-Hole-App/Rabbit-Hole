// Fix C part 3: the reference a roadmap step mints keeps the RAW quote (grounding reads it) and now also the passage folded for the viewer (markdown-anchor.js), so a
// heading, bold, link or table passage can be found in the text the file card shows. The stored anchor round-trips through the public read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { d1MintSourceRef } from '../src/roadmap/roadmap-source-refs.js';
import { anchorOfRange, foldText, resolveFolded } from '../../web/src/markdown-anchor.js';
import { world, rows } from './roadmap-fixture.js';

const RAW = '# Gradient descent\n\nThe **gradient** of the loss is the *slope*. See [notes](https://x.test/n?a=1).\n\n| a | b |\n| - | - |\n| one | two |\n';
const KEY = 'file:fs_000000000000000000000001', REV = 'a'.repeat(64);

test('a minted step reference stores the raw quote and the rendered anchor, and the anchor finds the passage in the text the card shows', async t => {
  const w = world(t);
  const start = RAW.indexOf('The **gradient**'), end = RAW.indexOf('x.test/n?a=1).') + 'x.test/n?a=1).'.length;
  const exact = RAW.slice(start, end);
  const rendered = anchorOfRange(RAW, start, end);
  const made = await d1MintSourceRef(w.env, w.access, { key: KEY, rev: REV, name: 'n.md', quote: { exact, prefix: RAW.slice(0, start), suffix: '' }, rendered });
  if (made.skipped) return t.skip('this schema has no learn_source_refs');
  const [row] = rows(w.sqlite, 'SELECT anchor_json FROM learn_source_refs WHERE id = ?', made.ref.id);
  const anchor = JSON.parse(row.anchor_json);
  assert.equal(anchor.quote.exact, exact, 'grounding still reads the raw passage');
  assert.deepEqual(anchor.rendered, rendered);
  const shown = 'Gradient descentThe gradient of the loss is the slope. See notes.onetwo'; // what the card draws (Md.jsx), tags and syntax gone
  const found = resolveFolded(shown, anchor.rendered);
  assert.equal(found.status, 'resolved');
  assert.equal(shown.slice(found.start, found.end), 'The gradient of the loss is the slope. See notes');
  assert.equal(foldText(shown).folded.includes(anchor.rendered.exact), true);
});

test('without a rendered anchor (an older caller) the stored anchor is exactly what it was', async t => {
  const w = world(t);
  const made = await d1MintSourceRef(w.env, w.access, { key: KEY, rev: REV, name: 'n.md', quote: { exact: 'plain words', prefix: '', suffix: '' } });
  if (made.skipped) return t.skip('this schema has no learn_source_refs');
  const [row] = rows(w.sqlite, 'SELECT anchor_json FROM learn_source_refs WHERE id = ?', made.ref.id);
  assert.deepEqual(Object.keys(JSON.parse(row.anchor_json)), ['quote']);
});
