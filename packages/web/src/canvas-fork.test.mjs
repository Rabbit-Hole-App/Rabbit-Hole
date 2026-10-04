import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forkAction } from './canvas-fork.js';

// One user action, one fork (docs/features/canvas-forking.md): the client half of the idempotency key.
const recorder = (replies) => {
  const sent = [];
  const send = body => { sent.push(body); const next = replies.shift(); return next instanceof Error ? Promise.reject(next) : Promise.resolve(next); };
  let n = 0;
  return { sent, send, newKey: () => `key-${++n}-abcdefgh` };
};

test('a double click is one request; the press after a finished fork is a new fork with a new key', async () => {
  const r = recorder([{ name: 'canvas-00000001' }, { name: 'canvas-00000002' }]);
  const fork = forkAction(r.send, r.newKey);
  const [a, b] = await Promise.all([fork({ source: { canvas: 'canvas-0a1b2c3d' } }), fork({ source: { canvas: 'canvas-0a1b2c3d' } })]);
  assert.equal(r.sent.length, 1, 'the second click joined the first');
  assert.equal(a, b);
  await fork({ source: { canvas: 'canvas-0a1b2c3d' } });
  assert.deepEqual(r.sent.map(body => body.key), ['key-1-abcdefgh', 'key-2-abcdefgh']);
});

test('a retry after a failure sends the same key, so a fork made before the reply was lost comes back', async () => {
  const r = recorder([new Error('network'), { name: 'canvas-00000001', replayed: true }]);
  const fork = forkAction(r.send, r.newKey);
  await assert.rejects(fork({ source: { token: 't' } }), /network/);
  assert.equal((await fork({ source: { token: 't' } })).replayed, true);
  assert.deepEqual(r.sent.map(body => body.key), ['key-1-abcdefgh', 'key-1-abcdefgh']);
});

test('the request carries the source and, only when given, this browser\'s copy', async () => {
  const r = recorder([{}, {}]);
  const fork = forkAction(r.send, r.newKey);
  await fork({ source: { token: 't' } });
  await fork({ source: { canvas: 'canvas-0a1b2c3d' }, state: { blocks: [] } });
  assert.deepEqual(r.sent, [{ source: { token: 't' }, key: 'key-1-abcdefgh' }, { source: { canvas: 'canvas-0a1b2c3d' }, key: 'key-2-abcdefgh', state: { blocks: [] } }]);
});

test('the shared canvas page shows the product top left: the aperture mark and the name, linking home (owner, 2026-10-04)', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('./SharedBoardPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(page, /<header[^>]*>\n\s+\{\/\* The product, top left[^\n]*\n\s+<a href="\/" data-shared-brand[^>]*>\n\s+<img src="\/landing\/favicon-32-v1\.png"[^>]*\/>\n\s+<span[^>]*>\{PRODUCT\}<\/span>/);
});

test('the canvas top bar opens the new fork with navigate, which LearnPage imports (lost once in a rebase onto goBack)', async () => {
  const { readFileSync } = await import('node:fs');
  const learn = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8');
  assert.match(learn, /onForked=\{fork => navigate\(fork\.url\)\}/);
  assert.match(learn, /^import \{[^}]*\bnavigate\b[^}]*\} from '\.\/api\.js';/m);
});
