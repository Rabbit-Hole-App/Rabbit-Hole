import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDrop, DROP_LIMITS } from './learn-drop.js';

const file = (type, size, name = 'f') => ({ type, size, name });

test('each accepted type maps to its card kind', () => {
  assert.equal(classifyDrop(file('image/png', 10)).kind, 'image');
  assert.equal(classifyDrop(file('image/jpeg', 10)).kind, 'image');
  assert.equal(classifyDrop(file('image/webp', 10)).kind, 'image');
  assert.equal(classifyDrop(file('image/gif', 10)).kind, 'gif');
  assert.equal(classifyDrop(file('video/mp4', 10)).kind, 'clip');
  assert.equal(classifyDrop(file('video/webm', 10)).kind, 'clip');
  assert.equal(classifyDrop(file('application/pdf', 10)).kind, 'pdf');
  assert.equal(classifyDrop(file('', 10, 'paper.PDF')).kind, 'pdf', 'Windows drops PDFs with no MIME sometimes');
});

test('limits are per kind and the refusal names the file and the rule', () => {
  assert.equal(classifyDrop(file('image/png', DROP_LIMITS.image)).kind, 'image');
  assert.match(classifyDrop(file('image/png', DROP_LIMITS.image + 1, 'big.png')).error, /^big\.png: images up to 5 MB/);
  assert.match(classifyDrop(file('image/gif', DROP_LIMITS.gif + 1, 'a.gif')).error, /GIFs up to 10 MB/);
  assert.match(classifyDrop(file('video/mp4', DROP_LIMITS.clip + 1, 'a.mp4')).error, /videos up to 50 MB/);
  assert.match(classifyDrop(file('application/pdf', DROP_LIMITS.pdf + 1, 'a.pdf')).error, /PDFs up to 5 MB/);
});

test('unknown types and empty files are refused with a visible reason', () => {
  assert.match(classifyDrop(file('text/html', 10, 'page.html')).error, /drop an image, GIF, video, PDF, notebook \(\.ipynb\) or Python file \(\.py\)/);
  assert.match(classifyDrop(file('image/svg+xml', 10, 'icon.svg')).error, /drop an image/, 'svg is scriptable, not an image here');
  assert.match(classifyDrop(file('image/png', 0, 'empty.png')).error, /empty/);
  assert.match(classifyDrop({ type: 'text/plain', size: 5 }).error, /^That file:/);
});
