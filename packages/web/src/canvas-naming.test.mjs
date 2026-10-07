// Canvas naming in the browser (docs/features/canvas-naming.md): Duplicate on your own canvas's ⋮, through the same
// copy call as Fork with this browser's content, titled by the server; never a fork.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { postFork } from './canvas-fork.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('Duplicate posts the same copy call as Fork to its own route, and fork stays the default', async () => {
  const seen = [];
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.fetch = async (path, init) => { seen.push([path, JSON.parse(init.body)]); return new Response(JSON.stringify({ name: 'canvas-12345678', title: 'Example (2)', duplicate: true }), { status: 201 }); };
  const made = await postFork({ source: { canvas: 'canvas-aaaaaaaa' }, state: { blocks: [] } }, '/api/learn/boards/duplicate');
  await postFork({ source: { canvas: 'canvas-aaaaaaaa' } });
  assert.deepEqual(seen.map(([path]) => path), ['/api/learn/boards/duplicate', '/api/learn/boards/fork']);
  assert.equal(made.title, 'Example (2)');
});

test('the Library ⋮ offers Duplicate on your own canvases only, with this browser\'s content, and reloads the list', () => {
  const library = read('./LibraryViews.jsx');
  assert.match(library, /\{menu\?\.a\.canEdit && <MenuItem icon=\{CopyPlus\} onClick=\{\(\) => pick\(duplicate\)\}>Duplicate<\/MenuItem>\}/);
  const fn = library.slice(library.indexOf('const duplicate = async (a) => {'), library.indexOf('const pinnedNow'));
  assert.match(fn, /postFork\(\{ source: \{ canvas: a\.name \}, state: localBoard\(ctx\.storage, canvasKeys\(/);
  assert.match(fn, /'\/api\/learn\/boards\/duplicate'\)/);
  assert.match(fn, /ctx\.onForked\?\.\(\);/);
  assert.doesNotMatch(fn, /title:/, 'the server names the copy; the browser never invents a title');
});
