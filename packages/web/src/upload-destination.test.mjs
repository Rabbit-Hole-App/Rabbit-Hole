import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESTINATIONS, destinationsFor, isPdf, takesContext } from './upload-destination.js';

// Owner brief 2026-10-22 item 3: after Upload a file, Add to canvas / Use as AI context / Both.
const file = (name, type = '') => ({ name, type });

test('the three destinations are named as the brief says', () => {
  assert.deepEqual(DESTINATIONS.map(entry => entry[1]), ['Add to canvas', 'Use as AI context', 'Both']);
});

test('context takes the files the Context panel takes (PDF, .txt, .md) on a canvas that keeps context; anything else can only go to the canvas', () => {
  assert.deepEqual(destinationsFor([file('notes.md')], { contextCanvas: true }), { canvas: true, context: true, both: true });
  assert.deepEqual(destinationsFor([file('a.pdf'), file('b.TXT')], { contextCanvas: true }), { canvas: true, context: true, both: true });
  assert.deepEqual(destinationsFor([file('photo.png')], { contextCanvas: true }), { canvas: true, context: false, both: false });
  assert.deepEqual(destinationsFor([file('a.pdf'), file('photo.png')], { contextCanvas: true }), { canvas: true, context: false, both: false }, 'one file the road cannot take keeps the batch off it');
  assert.deepEqual(destinationsFor([file('a.pdf')], { contextCanvas: false }), { canvas: true, context: false, both: false }, 'a project board keeps no context documents');
  assert.ok(takesContext(file('x.markdown')) && !takesContext(file('x.docx')));
});

test('Both adds a PDF to the canvas from its stored copy, one PDF at a time', () => {
  assert.equal(destinationsFor([file('a.pdf'), file('b.pdf')], { contextCanvas: true }).both, false);
  assert.equal(destinationsFor([file('a.pdf'), file('b.md')], { contextCanvas: true }).both, true);
  assert.ok(isPdf(file('x.PDF')) && isPdf(file('x', 'application/pdf')) && !isPdf(file('x.txt')));
});

test('LearnPage: the picker asks first; context is the Context panel upload, Both reuses the stored copy, nothing is added to context unasked', () => {
  const page = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /if \(files\.length\) setUploadAsk\(files\);/, 'choosing a file only opens the question');
  assert.doesNotMatch(page, /onChange=\{event => \{ takeDrop\(\[\.\.\.\(event\.target\.files/, 'the picker no longer adds straight to the canvas');
  assert.match(page, /if \(choice === 'canvas'\) \{ await takeDrop\(files\); return; \}/, 'Add to canvas is the drop road, unchanged');
  assert.match(page, /doc = await uploadContextDoc\(app\.name, file\)/);
  assert.match(page, /new CustomEvent\('small:pdf-to-canvas', \{ detail: \{ sourceId: `doc:\$\{doc\.id\}`, kind: 'doc'/, 'a PDF is added from the stored context copy, not uploaded again');
  assert.equal((page.match(/uploadContextDoc\(/g) || []).length, 1, 'one context upload per file');
  const dialog = readFileSync(new URL('./UploadDestinationDialog.jsx', import.meta.url), 'utf8');
  assert.match(dialog, /disabled=\{!open\[value\]\}/, 'a choice that does not fit stays, greyed');
});
