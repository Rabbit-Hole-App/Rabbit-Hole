import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Notebook iframes load from a separate site (docs/features/rabbit-hole-production.md, Notebooks). No build may
// default to the quarantined personal-account hosts (*.zeroshothq.workers.dev): dev defaults are the rabbit-hole
// account's, and production sets VITE_NOTEBOOK_ORIGIN and VITE_LESSON_NOTEBOOK_ORIGIN.
const src = new URL('./', import.meta.url);
const files = readdirSync(src, { recursive: true }).filter(f => /\.(jsx?|mjs)$/.test(f) && !/\.test\.mjs$/.test(f));

test('no app source names a personal-account notebook host', () => {
  const hits = files.filter(f => /notebook[\w-]*\.zeroshothq\.workers\.dev/.test(readFileSync(new URL(f.split(String.fromCharCode(92)).join('/'), src), 'utf8')));
  assert.deepEqual(hits, []);
});

test('both notebook origins come from build variables, with rabbit-hole account dev defaults', () => {
  assert.match(readFileSync(new URL('learn-notebook.js', src), 'utf8'), /VITE_NOTEBOOK_ORIGIN \|\| 'https:\/\/small-learn-canvas-notebook-dev\.tryrabbithole\.workers\.dev'/);
  assert.match(readFileSync(new URL('LearnExtras.jsx', src), 'utf8'), /VITE_LESSON_NOTEBOOK_ORIGIN \|\| 'https:\/\/small-learn-notebook-dev\.tryrabbithole\.workers\.dev'/);
});
