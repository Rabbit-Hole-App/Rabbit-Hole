import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onAnotherDevice, openHref, readContinue, readRecent, recentCard, recentItems } from './continue.js';

const store = (entries = {}) => { const m = new Map(Object.entries(entries)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const EMAIL = 'a@gmail.com';
const repo = { name: 'repo-1', kind: 'repository', repo: 'karpathy/nanoGPT', org: 'gmail-com', email: EMAIL, status: 'ready', commit_sha: '3f2a1c9aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', visibility: 'domain' };
const job = { name: 's3-log', kind: 'job', org: 'gmail-com', visibility: 'domain', schedule: '0 9 * * *', lastRun: { runId: 'r-1', status: 'finished', startedAt: '2026-09-23 08:00:00' } };
const server = { name: 'counter', kind: 'server', org: 'acme-com', visibility: 'private', deployed_at: '2026-09-22 10:00:00', url: 'https://x.example/a/acme-com/counter/' };
const canvas = { name: 'canvas-1a2b3c4d', kind: 'canvas', title: 'Attention deep dive', org: 'gmail-com', email: EMAIL, project: 'repo-1', device_id: 'dev-a' };
const catalog = [repo, job, server, canvas];
// The keys LearnPage writes (LearnPage.jsx:143,158,794): the row's own org, the viewer's email.
const key = (a) => `small.adaptive-canvas:${a.org}:${EMAIL}:${a.name}`;
const ink = (blocks) => JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks });
const h = (id, text, done = false) => ({ id, type: 'heading', level: 1, text, done });
const base = { org: 'gmail-com', email: EMAIL, catalog };

test('recent reads small.recent, survives junk, and keeps five catalog items in order', () => {
  assert.deepEqual(readRecent(store({ 'small.recent': '["a","b",3]' })), ['a', 'b']);
  assert.deepEqual(readRecent(store({ 'small.recent': '{' })), []);
  assert.deepEqual(readRecent(store()), []);
  const many = Array.from({ length: 7 }, (_, i) => ({ name: `app-${i}` }));
  assert.deepEqual(recentItems(['gone', 'app-6', 'app-0', 'app-1', 'app-2', 'app-3', 'app-4'], many).map((a) => a.name), ['app-6', 'app-0', 'app-1', 'app-2', 'app-3']);
});

test('nothing recent in this catalog means no Continue block (T02 §3.1.5)', () => {
  assert.equal(readContinue({ ...base, recent: [], storage: store() }), null);
  assert.equal(readContinue({ ...base, recent: ['other-workspace-app'], storage: store() }), null);
});

test('Continue picks the first recent item with local content: last question, first unticked heading', () => {
  const storage = store({
    [`${key(repo)}:ink`]: ink([h('a', 'Tokens', true), { id: 'x', type: 'explanation' }, h('b', 'Masked self-attention'), h('c', 'Training loop')]),
    [`${key(repo)}:chat`]: JSON.stringify([{ id: '1', question: 'what is a token?' }, { id: '2', question: '  why sqrt(dk)?  ' }]),
  });
  assert.deepEqual(readContinue({ ...base, recent: ['s3-log', 'repo-1'], storage }),
    { slug: 'repo-1', title: 'karpathy/nanoGPT', kind: 'repository', canvas: true, lastExplored: 'why sqrt(dk)?', next: 'Masked self-attention' });
});

test('a shared app is read under its own org, not the workspace org', () => {
  const storage = store({ [`${key(server)}:chat`]: JSON.stringify([{ id: '1', question: 'how does it count?' }]) });
  assert.equal(readContinue({ ...base, recent: ['counter'], storage }).lastExplored, 'how does it count?');
});

test('an opened but empty canvas has nothing to continue; Next and Last explored drop out on their own', () => {
  assert.equal(readContinue({ ...base, recent: ['repo-1'], storage: store({ [`${key(repo)}:ink`]: ink([]) }) }).canvas, false);
  const ticked = readContinue({ ...base, recent: ['repo-1'], storage: store({ [`${key(repo)}:ink`]: ink([h('a', 'Tokens', true)]) }) });
  assert.deepEqual([ticked.canvas, ticked.lastExplored, ticked.next], [true, null, null]);
});

test('changed or corrupt blobs drop their lines and never throw (T02 §3.1)', () => {
  const chat = JSON.stringify([{ id: '1', question: 'kept' }]);
  for (const bad of ['not json', '{"blocks":{"not":"a list"}}', '{"blocks":[null]}']) {
    const c = readContinue({ ...base, recent: ['repo-1'], storage: store({ [`${key(repo)}:ink`]: bad, [`${key(repo)}:chat`]: chat }) });
    assert.deepEqual([c.canvas, c.lastExplored, c.next], [true, 'kept', null]);
  }
  const c = readContinue({ ...base, recent: ['repo-1'], storage: store({ [`${key(repo)}:ink`]: ink([h('b', 'Next one')]), [`${key(repo)}:chat`]: '[{"nope":1},"x"]' }) });
  assert.deepEqual([c.canvas, c.lastExplored, c.next], [true, null, 'Next one']);
});

test('with no local content, Continue offers the first recent item to open (T02 §3.1.4)', () => {
  assert.deepEqual(readContinue({ ...base, recent: ['gone', 's3-log', 'repo-1'], storage: store() }),
    { slug: 's3-log', title: 's3-log', kind: 'job', canvas: false, lastExplored: null, next: null });
});

test('Continue opens Learn: a canvas route itself, any other kind its Learn tab', () => {
  assert.equal(openHref({ slug: 'repo-1', kind: 'repository', canvas: true }), '/apps/repo-1?tab=learn');
  assert.equal(openHref({ slug: 'canvas-1a2b3c4d', kind: 'canvas', canvas: true }), '/apps/canvas-1a2b3c4d');
  assert.equal(openHref({ slug: 's3-log', kind: 'job', canvas: false }), '/apps/s3-log');
});

test('a canvas made in another browser is flagged, never opened as empty (T02 §8.3)', () => {
  assert.equal(onAnotherDevice(canvas, EMAIL, store({ 'small.device': 'dev-b' })), true);
  assert.equal(onAnotherDevice(canvas, EMAIL, store({ 'small.device': 'dev-a' })), false);
  assert.equal(onAnotherDevice(canvas, EMAIL, store({ 'small.device': 'dev-b', [`${key(canvas)}:chat`]: '[{"id":"1","question":"q"}]' })), false);
  assert.equal(onAnotherDevice({ ...canvas, device_id: null }, EMAIL, store({ 'small.device': 'dev-b' })), false);
  assert.equal(onAnotherDevice(repo, EMAIL, store({ 'small.device': 'dev-b' })), false);
});

test('recent cards carry per-kind metadata and a next action (T02 §3.2)', () => {
  const ctx = { catalog, email: EMAIL, storage: store({ 'small.device': 'dev-a' }) };
  assert.deepEqual(recentCard(repo, ctx), { meta: ['3f2a1c9', 'Map ready', '1 canvas', 'Workspace'], action: { label: 'Open project', to: '/apps/repo-1' } });
  assert.deepEqual(recentCard(canvas, ctx), { meta: ['In karpathy/nanoGPT', 'Content in this browser'], action: { label: 'Continue learning', to: '/apps/canvas-1a2b3c4d' } });
  assert.deepEqual(recentCard(canvas, { ...ctx, storage: store({ 'small.device': 'dev-b' }) }), { meta: ['On another device'], action: null });
  const jobCard = recentCard(job, ctx);
  assert.match(jobCard.meta[0], /^✓ /);
  assert.deepEqual(jobCard.meta.slice(1), ['daily 09:00', 'Runs: anyone @gmail.com']);
  assert.deepEqual(jobCard.action, { label: 'View last run', to: '/apps/s3-log/runs/r-1' });
  const serverCard = recentCard(server, ctx);
  assert.match(serverCard.meta[0], /^Deployed /);
  assert.equal(serverCard.meta[1], 'only shared');
  assert.deepEqual(serverCard.action, { label: 'Open app', href: server.url });
});
