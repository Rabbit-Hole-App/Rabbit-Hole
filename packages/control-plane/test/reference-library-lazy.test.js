// START-3: the diagram reference library is loaded on first use. A Worker has no synchronous loader: reading it before referenceLibraryReady() is an explicit error; after it, the sync reader works. Node (tests, scripts) loads it synchronously.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { referenceLibrary, referenceLibraryReady } from '../src/reference-library-lazy.js';

const MODULE = pathToFileURL(new URL('../src/reference-library-lazy.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;

test('Node reads the library synchronously and the async loader returns the same library', async () => {
  const sync = referenceLibrary();
  assert.ok(sync.diagramReferences.length > 400 && Array.isArray(sync.singleDiagramReferences));
  assert.equal((await referenceLibraryReady()).diagramReferences, sync.diagramReferences);
});

test('simulated Worker (no synchronous loader): the sync read fails loudly before referenceLibraryReady() and works after it', () => {
  const script = `
    delete process.getBuiltinModule;
    const m = await import(${JSON.stringify(MODULE)});
    let before = null;
    try { m.referenceLibrary(); } catch (error) { before = error.message; }
    const ready = await m.referenceLibraryReady();
    const after = m.referenceLibrary();
    console.log(JSON.stringify({ before, afterCount: after.diagramReferences.length, same: ready === after, hasVariants: after.singleDiagramReferences.length > 0 }));
  `;
  const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).trim().split('\n').pop());
  assert.match(out.before, /read before referenceLibraryReady\(\) was awaited/);
  assert.ok(out.afterCount > 400 && out.same && out.hasVariants);
});
