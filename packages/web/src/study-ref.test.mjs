import test from 'node:test';
import assert from 'node:assert/strict';
import { SWITCH_ROW, currentPin, pinRef, pinnedAttachRef, studyOffsets, versionLine } from './study-ref.js';
import { excerptChatRef } from './pdf-excerpt.js';
import { studyLayout } from './study-state.js';

const note = text => ({ id: 'n1', kind: 'sticky', x: 0, y: 0, text });
const explanation = body => ({ id: 'e1', type: 'explanation', title: 'Tides', body });
const pdf = { id: 'p1', type: 'pdf', assetKey: 'doc:ctx:aaaaaaaaaaaa', label: 'Paper.pdf' };
const pinOf = object => ({ cardId: object.id, kind: object.type === 'pdf' ? 'pdf' : object.type === 'explanation' ? 'explanation' : 'text', ref: pinRef(object) });

test('Add pinned reference attaches the note as it is now: an edit after pinning sends only the edited text', () => {
  const pin = pinOf(note('The old words about tides.'));
  const edited = note('New words only.');
  const ref = pinnedAttachRef({ pin, object: edited });
  assert.equal(ref.text, 'New words only.');
  assert.ok(!JSON.stringify(ref).includes('old words'), 'nothing of the old text rides along');
  assert.equal(ref.sourceId, 'card:n1', 'the same card');
  assert.notEqual(ref.version, pin.ref.version, 'its fingerprint is the edited content');
});

test('an edited Explanation attaches its current title, body and sections, none of the old', () => {
  const pin = pinOf(explanation('The moon pulls the near ocean.'));
  const ref = pinnedAttachRef({ pin, object: { ...explanation('Gravity differs across the Earth.'), more: [{ label: 'More', text: 'Two bulges.' }] } });
  assert.match(ref.text, /Gravity differs across the Earth\./);
  assert.match(ref.text, /Two bulges\./);
  assert.ok(!ref.text.includes('moon pulls'), 'the old body is gone');
});

test('currentPin: the stored pin names the card; a missing card or a changed kind attaches nothing', () => {
  const pin = pinOf(note('a'));
  assert.equal(currentPin(pin, null), null);
  assert.equal(currentPin(pin, { ...note('a'), id: 'other' }), null, 'never another card');
  assert.equal(currentPin(pin, { id: 'n1', kind: 'text', mode: 'code', text: 'x = 1' }), null, 'a code box is not a note');
  assert.equal(pinnedAttachRef({ pin, object: null }), null);
});

test('a PDF pin attaches the reader page, or the text selected in it as that selection\'s own excerpt ref', () => {
  const pin = pinOf(pdf);
  assert.deepEqual(pinnedAttachRef({ pin, object: pdf, reader: { page: 3 } }).range, { page: 3 });
  const selection = { id: 'pdfx_bbbbbbbbbbbbbbbbbbbbbbbb', kind: 'text', source: { key: 'doc:ctx:aaaaaaaaaaaa', name: 'Paper.pdf', home: null }, page: { index: 3, label: null }, quote: { exact: 'The tide is a wave.' } };
  assert.deepEqual(pinnedAttachRef({ pin, object: pdf, reader: { page: 3 }, excerpt: selection }), excerptChatRef(selection));
  assert.equal(pinnedAttachRef({ pin, object: pdf, reader: { page: 3 }, unavailable: true }), null, 'an unavailable reader attaches nothing');
});

test('versionLine: a doc or paper PDF ref says version verification is unavailable; a ref with its own version says nothing', () => {
  assert.equal(versionLine(pinRef(pdf)), 'Version verification unavailable');
  assert.equal(versionLine(pinRef(note('a'))), null, 'a note ref carries its content fingerprint');
  assert.equal(versionLine(null), null);
  assert.doesNotMatch(versionLine(pinRef(pdf)), /exact/i);
});

test('studyOffsets: the working-view row has its own strip; the canvas starts below it, beside or below the reference', () => {
  const wide = studyOffsets({ layout: studyLayout({ width: 1000, height: 800, split: 0.4 }), frameTop: 0, top: 48 });
  assert.deepEqual(wide, { marginLeft: 400, marginTop: 48 + SWITCH_ROW, paneTop: 48, switchTop: 48, switchLeft: 400, canvasTop: 48 + SWITCH_ROW });
  const stacked = studyOffsets({ layout: studyLayout({ width: 500, height: 800, split: 0.4 }), frameTop: 10, top: 10 });
  assert.equal(stacked.switchTop, 10 + 320, 'the row sits right under the reference');
  assert.equal(stacked.canvasTop, stacked.switchTop + SWITCH_ROW, 'the canvas starts under the row');
  assert.equal(stacked.marginTop + 10, stacked.canvasTop, 'the frame margin puts the canvas there');
  assert.equal(stacked.switchLeft, 0);
});
