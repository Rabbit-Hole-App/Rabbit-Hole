// SEL.02 (web side): the area target names its own uploaded picture, and an open Paper never displaces it. Pure helpers plus source pins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ownAreaImage } from './area-crop.js';
import { canvasTargetField } from './learn-ask-target.js';

const read = name => readFileSync(new URL('./' + name, import.meta.url), 'utf8');

test('ownAreaImage: an area target with its uploaded picture and no Paper region', () => {
  assert.equal(ownAreaImage({ id: 'area:1', image: 'media:0123456789ab' }), 'media:0123456789ab');
  assert.equal(ownAreaImage({ id: 'area:1' }), null, 'upload failed or no blob');
  assert.equal(ownAreaImage({ id: 'area:1', image: 'media:0123456789ab', paper: { id: 'upload:x', page: 1 } }), null, 'a single-Paper region rides as the page region');
  assert.equal(ownAreaImage({ id: 'card-1', image: 'media:0123456789ab' }), null, 'a card is not an area');
  assert.equal(ownAreaImage(null), null);
});

test('the request target names the picture: the id for an area, null when it has none, nothing for other targets', () => {
  assert.equal(canvasTargetField({ id: 'area:1', kind: 'Canvas selection', text: 't', image: 'media:0123456789ab' }).image, 'media:0123456789ab');
  assert.equal(canvasTargetField({ id: 'area:1', kind: 'Canvas selection', text: 't' }).image, null);
  assert.equal('image' in canvasTargetField({ id: 'card-1', kind: 'Card', text: 't', image: 'media:0123456789ab' }), false);
});

test('Chat sends the area picture and drops an open Paper for that turn; the Paper region path keeps its paper (source pin)', () => {
  const ask = read('ask.jsx');
  assert.match(ask, /const questionPaper = ownAreaImage\(canvasTarget\) && !keepDraft \? null : board\?\.paper;/);
  assert.match(ask, /const imageId = !target\?\.paper && !questionPaper \? target\?\.image \|\| questionImage\?\.id : null;/);
  assert.match(ask, /target\?\.paper \? \{ paper_context: target\.paper \}/, 'the single-Paper region still rides as paper_context');
});
