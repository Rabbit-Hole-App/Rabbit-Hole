import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forkAction, postFork } from './canvas-fork.js';

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

// Owner, 2026-10-08: the Library's Duplicate posted localBoard's null for a canvas this browser holds none of, and the
// server answered "state must be a board object". postFork, the one call every Duplicate and Fork goes through, never
// sends a null state: the server copy decides.
test('postFork never sends a null state; a real copy still travels', async t => {
  const fetched = [], realFetch = globalThis.fetch, realStorage = globalThis.localStorage;
  globalThis.fetch = async (path, init) => { fetched.push([path, JSON.parse(init.body)]); return Response.json({ name: 'canvas-00000001' }, { status: 201 }); };
  globalThis.localStorage = { getItem: () => null };
  t.after(() => { globalThis.fetch = realFetch; globalThis.localStorage = realStorage; });
  await postFork({ source: { canvas: 'canvas-0a1b2c3d' }, state: null }, '/api/learn/boards/duplicate');
  await postFork({ source: { canvas: 'canvas-0a1b2c3d' }, state: { blocks: [] } });
  assert.deepEqual(fetched, [
    ['/api/learn/boards/duplicate', { source: { canvas: 'canvas-0a1b2c3d' } }],
    ['/api/learn/boards/fork', { source: { canvas: 'canvas-0a1b2c3d' }, state: { blocks: [] } }],
  ]);
});

test('the shared canvas page shows the product top left: the aperture mark and the name, linking home (owner, 2026-10-04)', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('./SharedBoardPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(page, /<header[^>]*>\n\s+\{\/\* The product, top left[^\n]*\n\s+<a href="\/" data-shared-brand[^>]*>\n\s+<img src="\/landing\/favicon-32-v1\.png"[^>]*\/>\n\s+<span[^>]*>\{PRODUCT\}<\/span>/);
});

// The shared header (owner, 2026-10-06): one GitHub-style control, [fork icon  Fork  N], with the same lucide GitFork the
// Library/Home cards draw; no separate "N forks" label beside it. The number is the server's: shared.fork_count, and after a
// fork the reply's source_fork_count - never a local +1, so a failed fork leaves it untouched.
test('the shared header shows one Fork control carrying the canonical count, zero included', async () => {
  const { readFileSync } = await import('node:fs');
  const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const page = read('./SharedBoardPage.jsx'), button = read('./ForkButton.jsx'), cards = read('./home/Provenance.jsx');
  assert.match(page, /<ForkButton source=\{\{ token \}\}[^\n]* count=\{shared\.fork_count\} \/>/);
  assert.doesNotMatch(page, /<Forks\b|forkLabel/, 'no second fork-count label in the header');
  assert.match(button, /import \{ Check, GitFork, Loader2 \} from 'lucide-react';/);
  assert.match(cards, /<GitFork size=\{12\}[^>]*\/>\{m\.forks\}/, 'the cards draw the same icon');
  assert.match(button, /if \(typeof made\.source_fork_count === 'number'\) setCounted\(made\.source_fork_count\);/);
  assert.doesNotMatch(button, /\+ ?1\b|\+\+|setCounted\([^)]*\+/, 'never an optimistic count');
  assert.match(button, /\{counts && <span data-fork-count-value[^>]*>\{forkNumber\(n\)\}<\/span>\}/);
  assert.match(button, /aria-label=\{counts \? `\$\{label\}, \$\{forkLabel\(n\) \|\| '0 forks'\}` : undefined\}/);
  // The canvas top bar's icon-only Fork and the Library cards' Fork are unchanged: no count prop there.
  assert.doesNotMatch(read('./LearnPage.jsx'), /<ForkButton[^>]*count=/);
});

test('the canvas top bar opens the new fork with navigate, which LearnPage imports (lost once in a rebase onto goBack)', async () => {
  const { readFileSync } = await import('node:fs');
  const learn = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8');
  assert.match(learn, /onForked=\{fork => navigate\(fork\.url\)\}/);
  assert.match(learn, /^import \{[^}]*\bnavigate\b[^}]*\} from '\.\/api\.js';/m);
});
