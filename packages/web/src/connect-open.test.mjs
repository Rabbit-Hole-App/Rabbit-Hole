// Fresh-repo connect (owner 2026-11-19 09:00): Chat opens once on a canvas Start just connected; the Tutor waits for indexing instead of reading once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markConnected, takeConnected } from './connect-open.js';
import { flowMessages } from './rehearsal-flow.js';
import { SENTENCES } from './tutor-rehearsal-text.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('a connected canvas opens Chat once: the mark is taken once, never for another canvas, never on a later visit', () => {
  markConnected('canvas-aaaa1111');
  assert.equal(takeConnected('canvas-bbbb2222'), false);
  assert.equal(takeConnected('canvas-aaaa1111'), true);
  assert.equal(takeConnected('canvas-aaaa1111'), false, 'a later visit is not a connect');
  markConnected(undefined);
  assert.equal(takeConnected(undefined), false);
  assert.match(read('start-run.js'), /executeCommand\('create_canvas', \{ title, project: slug, open: true \}, ctx\); markConnected\(made\?\.data\?\.name\)/);
  assert.match(read('LearnPage.jsx'), /const open = \(\) => \{ if \(takeConnected\(app\.name\)\) panels\.openChat\(\); \};\n\s+open\(\);\n\s+window\.addEventListener\(CONNECTED_EVENT, open\)/);
});

test('while the repository indexes, the Tutor says Reading <name> and asks again; an indexing failure says so and stops', () => {
  const base = { log: [], lines: [] };
  assert.deepEqual(flowMessages({ ...base, get: { indexing: 'indexing', catalogue: { status: 'queued' } } }, { repo: 'simonw/datasette' }).map(m => m.pending), ['Reading datasette']);
  assert.deepEqual(flowMessages({ ...base, get: { indexing: 'failed', catalogue: { status: 'failed' } } }, { repo: 'simonw/datasette' }).map(m => m.key), ['indexing-failed']);
  const ui = read('TutorRehearsal.jsx');
  assert.match(ui, /if \(!out\.repository\) return api\(url\(\)\)\.then\(get => \{/, 'an unindexed repository is asked about, not dropped');
  assert.match(ui, /if \(get\.indexing !== 'failed'\) wait = setTimeout\(read, REHEARSAL_POLL_MS\);/, 'asked again until indexed');
  assert.match(ui, /clearTimeout\(wait\); \};/, 'the wait ends with the canvas');
});

test('the catalogue failing is said Learn first, with no run language', () => {
  const text = SENTENCES.catalogueFailed('datasette');
  assert.equal(text, "I read **datasette** but couldn't work out what it offers yet. Try again, or tell me what you want to learn from it.");
  assert.doesNotMatch(text, /\b(run|route|script|starts it)\b/i);
});
