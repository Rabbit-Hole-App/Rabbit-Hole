// The ratchet for docs/features/tldraw-removal.md: the files that still import tldraw. A slice that removes an import
// deletes its name here; a new import fails this test, so the list only ever shrinks. Empty means the dependency can go.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const REMAINING = [
  'InteractiveGraphShape.jsx', 'LearnNotes.jsx', 'LearnVideoShape.jsx', 'ThreeDShape.jsx', 'WhiteboardBlock.jsx',
  'learn-board-renderer.js', 'sigmoid-board.js',
];
const IMPORT = /(?:from|import\()\s*['"](?:tldraw|@tldraw\/[^'"]*)(?:\/[^'"]*)?['"]|^\s*import\s+['"]tldraw/m;

test('only the files named in the removal spec import tldraw', () => {
  const dir = new URL('./', import.meta.url);
  const importers = readdirSync(dir, { recursive: true }).map(name => name.replaceAll('\\', '/')).filter(name => /\.(jsx?|mjs)$/.test(name) && !/\.test\.mjs$|^__fixtures__\//.test(name))
    .filter(name => IMPORT.test(readFileSync(new URL(name, dir), 'utf8'))).sort();
  assert.deepEqual(importers, [...REMAINING].sort());
});
