import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJob } from './start-job.js';

const memory = () => { const m = new Map(); return { setItem: (k, v) => m.set(k, v), getItem: (k) => m.get(k) ?? null, removeItem: (k) => m.delete(k), m }; };
const file = (name, size = 100) => ({ name, size, type: '', lastModified: 7 });

// A job against fakes: every outside effect is recorded, nothing touches the network or the page.
function world(over = {}) {
  const log = [];
  const storage = over.storage || memory();
  let path = '/apps';
  const deps = {
    storage,
    command: async (name, args) => {
      log.push(['command', name, args]);
      if (over.command) return over.command(name, args);
      if (name === 'create_canvas') { path = '/apps/canvas-1a2b3c4d'; return { href: path, data: { name: 'canvas-1a2b3c4d' } }; }
      path = '/apps/repo-1a2b3c4d-nanogpt';
      return { href: path, data: { name: 'repo-1a2b3c4d-nanogpt' } };
    },
    uploadContextDoc: async (slug, f) => { log.push(['context', slug, f.name]); if (over.upload) return over.upload(f); return { id: `d-${f.name}`, name: f.name }; },
    uploadSource: async (f, o) => { log.push(['source', o.app, f.name]); return { source: { id: `fs_${f.name}`, rev: `rev-${f.name}`, name: f.name, type: 'text/plain', size: f.size, family: o.family } }; },
    contextFromSource: async (slug, source) => { log.push(['fromSource', slug, source.id]); if (over.fromSource) return over.fromSource(source); return { id: `d-${source.name}`, name: source.name }; },
    contextLink: async (slug, url) => { log.push(['link', slug, url]); if (over.link) return over.link(url); return { id: `d-${url}`, name: url }; },
    repository: async (slug) => { log.push(['repository', slug]); return over.project ? over.project() : { repo: 'karpathy/nanoGPT', commit_sha: 'abc123', status: 'ready' }; },
    navigate: (href) => { log.push(['navigate', href]); path = href; },
    here: () => path,
    wait: async () => {},
    notify: (text) => log.push(['notify', text]),
    setTimer: (fn) => { log.push(['timer']); return fn && 1; },
    clearTimer: () => {},
  };
  return { job: createJob(deps), log, storage, deps, kinds: (kind) => log.filter((entry) => entry[0] === kind) };
}
const placeAll = (job, slug, calls = []) => job.attach(slug, async (item) => { calls.push(item); return { label: item.kind === 'link' ? 'Resolved title' : undefined }; });
const repoAction = { type: 'add-repository', url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT', branch: 'master', connect: { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT', branch: 'master', defaulted: true } };
const statuses = (job) => job.getDraft().rows.map((r) => `${r.label}:${r.status}`);

test('blank with no sources creates one canvas and imports nothing', async () => {
  const w = world();
  assert.equal(await w.job.blank({}), true);
  assert.deepEqual(w.kinds('command').map((c) => c.slice(1)), [['create_canvas', { title: 'Untitled canvas', open: true }]]);
  assert.equal(w.job.getDraft().rows.length, 0);
});

test('blank with sources listed imports none of them and leaves no draft behind', async () => {
  const w = world();
  w.job.addFiles([file('a.pdf')]);
  await w.job.blank({});
  assert.equal(w.kinds('context').length, 0);
  assert.equal(w.job.getDraft().rows.length, 0);
  assert.equal(w.storage.m.size, 0);
});

test('a failed blank keeps the draft and says why', async () => {
  const w = world({ command: () => { throw Error('The server is busy.'); } });
  w.job.addFiles([file('a.pdf')]);
  await w.job.blank({});
  assert.equal(w.job.getDraft().rows.length, 1);
  assert.equal(w.job.getDraft().error, 'The server is busy.');
  assert.equal(w.job.getDraft().phase, 'editing');
  assert.ok(w.storage.m.size > 0);
});

test('start: one destination, a context document stored once, the card handed to the page, then ready and the draft cleared', async () => {
  const w = world();
  const placed = [];
  w.job.addFiles([file('a.pdf')]);
  const run = w.job.start({});
  placeAll(w.job, 'canvas-1a2b3c4d', placed);
  assert.equal(await run, true);
  assert.deepEqual(w.kinds('command').map((c) => c[1]), ['create_canvas']);
  assert.deepEqual(w.kinds('context'), [['context', 'canvas-1a2b3c4d', 'a.pdf']]);
  assert.equal(placed.length, 1);
  assert.deepEqual([placed[0].kind, placed[0].doc], ['file', { id: 'd-a.pdf', name: 'a.pdf' }]);
  assert.deepEqual(w.kinds('notify'), [['notify', 'Sources added.']]);
  assert.equal(w.job.getDraft().rows.length, 0);
  assert.equal(w.storage.m.size, 0);
});

test('context only: no card is handed over; canvas only: no context document is stored', async () => {
  const w = world();
  w.job.addFiles([file('a.pdf'), file('b.docx')]);
  w.job.dispatch({ type: 'set-option', id: 's1', option: 'canvas', value: false });
  const placed = [];
  const run = w.job.start({});
  placeAll(w.job, 'canvas-1a2b3c4d', placed);
  await run;
  assert.deepEqual(w.kinds('context').map((c) => c[2]), ['a.pdf']);
  assert.deepEqual(placed.map((p) => [p.file.name, p.doc]), [['b.docx', null]]);
});

test('a duplicate Start while one runs does nothing, and the destination is created once', async () => {
  const w = world();
  w.job.addFiles([file('a.pdf')]);
  const first = w.job.start({});
  assert.equal(await w.job.start({}), false);
  placeAll(w.job, 'canvas-1a2b3c4d');
  await first;
  assert.equal(w.kinds('command').length, 1);
});

test('a failed copy into the context fails only that row; Start again retries only it, on the same destination, sending nothing twice', async () => {
  let attempts = 0;
  const w = world({ fromSource: (source) => { if (++attempts === 1) throw Error('The context list is full.'); return { id: `d-${source.name}`, name: source.name }; } });
  w.job.addFiles([file('a.pdf'), file('b.md')]);
  const placed = [];
  const run = w.job.start({});
  placeAll(w.job, 'canvas-1a2b3c4d', placed);
  await run;
  assert.deepEqual(statuses(w.job), ['a.pdf:ready', 'b.md:failed']);
  assert.equal(w.job.getDraft().phase, 'partial');
  assert.equal(w.job.getDraft().rows[1].reason, 'The context list is full.');
  assert.deepEqual(placed.map((p) => p.file.name), ['a.pdf']);
  await w.job.start({});
  assert.deepEqual(w.kinds('context').map((c) => c[2]), ['a.pdf']); // a.pdf stored once
  assert.deepEqual(w.kinds('source').map((c) => c[2]), ['b.md']); // b.md sent once: the retry reuses the stored source
  assert.equal(w.kinds('fromSource').length, 2); // failed once, then copied
  assert.deepEqual(w.kinds('command').map((c) => c[1]), ['create_canvas']); // never a second canvas
  assert.deepEqual(placed.map((p) => p.file.name), ['a.pdf', 'b.md']);
  assert.equal(w.job.getDraft().rows.length, 0); // done: cleared
});

test('a .txt or .md for both: one upload as a file source, copied into the context by the server, the card made from that source', async () => {
  const w = world();
  w.job.addFiles([file('notes.md')]);
  const placed = [];
  const run = w.job.start({});
  placeAll(w.job, 'canvas-1a2b3c4d', placed);
  await run;
  assert.deepEqual(w.kinds('source'), [['source', 'canvas-1a2b3c4d', 'notes.md']]);
  assert.deepEqual(w.kinds('fromSource'), [['fromSource', 'canvas-1a2b3c4d', 'fs_notes.md']]);
  assert.equal(w.kinds('context').length, 0, 'no second upload');
  assert.deepEqual([placed[0].source.id, placed[0].doc.id], ['fs_notes.md', 'd-notes.md']);
});

test('context only: a .md is stored once as a context document, no card is handed over; canvas only: no source, no context', async () => {
  const w = world();
  w.job.addFiles([file('a.md'), file('b.docx')]);
  w.job.dispatch({ type: 'set-option', id: 's1', option: 'canvas', value: false });
  const placed = [];
  const run = w.job.start({});
  placeAll(w.job, 'canvas-1a2b3c4d', placed);
  await run;
  assert.deepEqual(w.kinds('context').map((c) => c[2]), ['a.md']);
  assert.equal(w.kinds('source').length + w.kinds('fromSource').length, 0);
  assert.deepEqual(placed.map((p) => [p.file.name, p.doc, p.source]), [['b.docx', null, null]]);
});

test('a page that fails to place a card fails its row with the reason; the other card still lands', async () => {
  const w = world();
  w.job.addFiles([file('a.docx'), file('b.docx')]);
  const run = w.job.start({});
  w.job.attach('canvas-1a2b3c4d', async (item) => { if (item.file.name === 'a.docx') throw Error('No card was added.'); return {}; });
  await run;
  assert.deepEqual(statuses(w.job), ['a.docx:failed', 'b.docx:ready']);
  assert.equal(w.job.getDraft().rows[0].reason, 'No card was added.');
});

test('cards wait for the page: queued before it attaches, placed in order once it does', async () => {
  const w = world();
  w.job.addFiles([file('a.docx'), file('b.docx')]);
  const order = [];
  const run = w.job.start({});
  await Promise.resolve();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(statuses(w.job), ['a.docx:importing', 'b.docx:importing']);
  w.job.attach('canvas-1a2b3c4d', async (item) => { order.push(item.file.name); });
  await run;
  assert.deepEqual(order, ['a.docx', 'b.docx']);
});

test('a page that goes away fails what it had not placed, and Start again re-queues it', async () => {
  const w = world();
  w.job.addFiles([file('a.docx'), file('b.docx')]);
  const run = w.job.start({});
  await new Promise((r) => setImmediate(r)); // both cards are queued, no page yet
  const detach = w.job.attach('canvas-1a2b3c4d', async () => { await Promise.resolve(); detach(); });
  await run;
  assert.deepEqual(statuses(w.job), ['a.docx:ready', 'b.docx:failed']);
  assert.match(w.job.getDraft().rows[1].reason, /canvas was closed/);
  const placed = [];
  const again = w.job.start({});
  placeAll(w.job, 'canvas-1a2b3c4d', placed);
  await again;
  assert.deepEqual(placed.map((p) => p.file.name), ['b.docx']);
});

test('no page within the wait fails the queued cards instead of waiting forever', async () => {
  const fired = [];
  const w = world();
  w.deps.setTimer = (fn) => { fired.push(fn); return fired.length; };
  const job = createJob(w.deps);
  job.addFiles([file('a.docx')]);
  const run = job.start({});
  await new Promise((r) => setImmediate(r));
  fired.forEach((fn) => fn());
  await run;
  assert.deepEqual(job.getDraft().rows.map((r) => [r.status, r.reason]), [['failed', 'The canvas did not open. Start again to retry.']]);
});

test('a link for both: its context note is kept once and its card comes from the page', async () => {
  const w = world();
  w.job.dispatch({ type: 'add-link', text: 'https://example.com/post' });
  const run = w.job.start({});
  const placed = [];
  placeAll(w.job, 'canvas-1a2b3c4d', placed);
  await run;
  assert.equal(placed[0].link.url, 'https://example.com/post');
  assert.deepEqual(w.kinds('link'), [['link', 'canvas-1a2b3c4d', 'https://example.com/post']]);
});

test('a link for context only needs no card and no page at all', async () => {
  const w = world();
  w.job.dispatch({ type: 'add-link', text: 'https://arxiv.org/abs/1706.03762' });
  w.job.dispatch({ type: 'set-option', id: 's1', option: 'canvas', value: false });
  await w.job.start({}); // no page ever attaches: nothing waits for one
  assert.deepEqual(w.kinds('link').map((c) => c[2]), ['https://arxiv.org/abs/1706.03762']);
  assert.equal(w.job.getDraft().rows.length, 0);
  assert.equal(w.kinds('timer').length, 0);
});

test('a link whose context could not be read fails that row; Start again does not repeat what worked', async () => {
  let attempts = 0;
  const w = world({ link: () => { if (++attempts === 1) throw Error('This link could not be read: arXiv metadata unavailable (503)'); return { id: 'd1', name: 'n' }; } });
  w.job.dispatch({ type: 'add-link', text: 'https://arxiv.org/abs/1706.03762' });
  w.job.dispatch({ type: 'add-link', text: 'https://example.com/post' });
  w.job.dispatch({ type: 'set-option', id: 's1', option: 'canvas', value: false });
  w.job.dispatch({ type: 'set-option', id: 's2', option: 'canvas', value: false });
  await w.job.start({});
  assert.deepEqual(statuses(w.job), ['arXiv 1706.03762:failed', 'example.com/post:ready']);
  assert.match(w.job.getDraft().rows[0].reason, /arXiv metadata unavailable/);
  await w.job.start({});
  assert.deepEqual(w.kinds('link').map((c) => c[2]), ['https://arxiv.org/abs/1706.03762', 'https://example.com/post', 'https://arxiv.org/abs/1706.03762']);
});

test('a link whose page could not be read says why on its row and keeps the card the page made', async () => {
  const w = world();
  w.job.dispatch({ type: 'add-link', text: 'https://example.com/post' });
  const run = w.job.start({});
  w.job.attach('canvas-1a2b3c4d', async () => ({ warning: 'This page could not be captured.' }));
  await run;
  const row = w.job.getDraft().rows[0];
  assert.deepEqual([row.status, row.reason, row.done.canvas, row.done.context], ['failed', 'This page could not be captured.', true, true]);
});

test('repository: connected once, its project is the destination, a supported file keeps its context and gets its card, the overview waits for the index', async () => {
  let polls = 0;
  const w = world({ project: () => (++polls < 3 ? { status: 'indexing' } : { repo: 'karpathy/nanoGPT', commit_sha: 'abc123', status: 'ready' }) });
  w.job.dispatch(repoAction);
  w.job.addFiles([file('a.pdf')]);
  w.job.dispatch({ type: 'set-option', id: 's1', option: 'canvas', value: true });
  const run = w.job.start({});
  const placed = [];
  placeAll(w.job, 'repo-1a2b3c4d-nanogpt', placed);
  await run;
  assert.deepEqual(w.kinds('command').map((c) => c[1]), ['connect_repository']);
  assert.deepEqual(w.kinds('context'), [['context', 'repo-1a2b3c4d-nanogpt', 'a.pdf']]); // owner decisions 2026-10-23: files supplement the repository
  assert.deepEqual(placed.map((p) => p.kind), ['file', 'overview']);
  assert.deepEqual(placed[0].doc, { id: 'd-a.pdf', name: 'a.pdf' });
  assert.deepEqual(placed[1].repository, { app: 'repo-1a2b3c4d-nanogpt', repo: 'karpathy/nanoGPT', commit: 'abc123' });
  assert.equal(polls, 3);
});

test('repository without the overview is ready when the project is connected', async () => {
  const w = world();
  w.job.dispatch(repoAction);
  await w.job.start({});
  assert.equal(w.kinds('repository').length, 0);
  assert.equal(w.job.getDraft().rows.length, 0);
});

test('a repository that cannot be connected fails its row, creates nothing else, and the draft survives', async () => {
  const w = world({ command: () => { throw Error("Can't connect a/b: no public repository found there."); } });
  w.job.dispatch(repoAction);
  w.job.addFiles([file('a.pdf')]);
  await w.job.start({});
  const draft = w.job.getDraft();
  assert.deepEqual(draft.rows.map((r) => r.status), ['failed', 'idle']);
  assert.match(draft.rows[0].reason, /no public repository/);
  assert.equal(draft.destination, null);
  assert.equal(w.kinds('context').length, 0);
});

test('an already connected repository is opened and the other sources attach to its project', async () => {
  const w = world();
  w.job.dispatch({ ...repoAction, existing: { slug: 'repo-9f9f9f9f-old', kind: 'repository', title: 'karpathy/nanoGPT' } });
  w.job.addFiles([file('a.docx')]);
  const run = w.job.start({});
  const placed = [];
  placeAll(w.job, 'repo-9f9f9f9f-old', placed);
  await run;
  assert.deepEqual(w.kinds('command'), []);
  assert.deepEqual(w.kinds('navigate'), [['navigate', '/apps/repo-9f9f9f9f-old']]);
  assert.deepEqual(placed.map((p) => p.file.name), ['a.docx']);
});

test('a retry from another page navigates to the destination it already made', async () => {
  const w = world({ upload: () => { throw Error('Offline.'); } });
  w.job.addFiles([file('a.pdf')]);
  await w.job.start({});
  assert.equal(w.job.getDraft().destination.slug, 'canvas-1a2b3c4d');
  w.deps.navigate('/apps');
  w.log.length = 0;
  const again = w.job.start({});
  placeAll(w.job, 'canvas-1a2b3c4d');
  await again;
  assert.deepEqual(w.kinds('navigate'), [['navigate', '/apps/canvas-1a2b3c4d']]);
  assert.equal(w.kinds('command').length, 0);
});

test('a start that cannot create its canvas keeps every row idle for another try', async () => {
  let fail = true;
  const w = world({ command: () => { if (fail) throw Error('The server is busy.'); return { data: { name: 'canvas-1a2b3c4d' } }; } });
  w.job.addFiles([file('a.docx')]);
  await w.job.start({});
  assert.deepEqual(statuses(w.job), ['a.docx:idle']);
  assert.equal(w.job.getDraft().error, 'The server is busy.');
  fail = false;
  const run = w.job.start({});
  placeAll(w.job, 'canvas-1a2b3c4d');
  await run;
  assert.equal(w.job.getDraft().rows.length, 0);
});

test('a reload mid-start comes back as a list to retry: the held files are gone and are asked for again', async () => {
  const storage = memory();
  const first = world({ storage, upload: () => new Promise(() => {}) }); // never answers: the page went away
  first.job.addFiles([file('a.pdf')]);
  first.job.start({});
  await new Promise((r) => setImmediate(r));
  const second = world({ storage });
  const row = second.job.getDraft().rows[0];
  assert.deepEqual([row.status, row.needsFile, row.reason], ['failed', true, 'Add this file again.']);
  assert.equal(second.job.getDraft().destination.slug, 'canvas-1a2b3c4d');
  second.job.addFiles([file('a.pdf')]);
  const run = second.job.start({});
  placeAll(second.job, 'canvas-1a2b3c4d');
  await run;
  assert.equal(second.kinds('command').length, 0); // the canvas the first page made is reused
  assert.equal(second.job.getDraft().rows.length, 0);
});

test('timers are called plainly, as a browser requires: setTimeout throws Illegal invocation as a method of another object', async () => {
  const w = world();
  const plain = function plain(fn) { if (this !== undefined) throw new TypeError('Illegal invocation'); return fn && 1; };
  const job = createJob({ ...w.deps, setTimer: plain, clearTimer: function clear() { if (this !== undefined) throw new TypeError('Illegal invocation'); } });
  job.addFiles([file('a.docx')]);
  const run = job.start({});
  await new Promise((r) => setImmediate(r)); // queued with no page: arms the timer
  job.attach('canvas-1a2b3c4d', async () => {}); // a page arrives: clears it, drains
  await run;
  assert.equal(job.getDraft().rows.length, 0);
});

test('Stop: what is queued fails as stopped, nothing further starts, successes stay, and Start again continues', async () => {
  const w = world();
  w.job.addFiles([file('a.docx'), file('b.docx'), file('c.docx')]);
  const placed = [];
  const run = w.job.start({});
  await new Promise((r) => setImmediate(r)); // all three queued, no page yet
  w.job.stop();
  await run;
  assert.deepEqual(statuses(w.job), ['a.docx:failed', 'b.docx:failed', 'c.docx:failed']);
  assert.equal(w.job.getDraft().rows[0].reason, 'Stopped. Start again to continue.');
  assert.equal(w.job.getDraft().phase, 'partial');
  const again = w.job.start({});
  placeAll(w.job, 'canvas-1a2b3c4d', placed);
  await again;
  assert.deepEqual(placed.map((p) => p.file.name), ['a.docx', 'b.docx', 'c.docx']);
  assert.equal(w.kinds('command').length, 1, 'the same canvas');
});

test('a source with neither option is not submitted: nothing is stored or placed for it', async () => {
  const w = world();
  w.job.addFiles([file('a.md'), file('b.docx')]);
  w.job.dispatch({ type: 'set-option', id: 's1', option: 'context', value: false });
  w.job.dispatch({ type: 'set-option', id: 's1', option: 'canvas', value: false });
  const placed = [];
  const run = w.job.start({});
  placeAll(w.job, 'canvas-1a2b3c4d', placed);
  await run;
  assert.deepEqual(placed.map((p) => p.file.name), ['b.docx']);
  assert.equal(w.kinds('context').length + w.kinds('source').length, 0);
});

test('a board that is still saving is waited for, then the .md goes once', async () => {
  let tries = 0;
  const w = world();
  const fine = w.deps.uploadSource;
  const job = createJob({ ...w.deps, uploadSource: async (f, o) => { if (++tries < 3) throw Object.assign(Error('This canvas is still saving.'), { boardNotSaved: true }); return fine(f, o); } });
  job.addFiles([file('late.md')]);
  const run = job.start({});
  job.attach('canvas-1a2b3c4d', async () => {});
  await run;
  assert.equal(tries, 3);
  assert.equal(job.getDraft().rows.length, 0);
  assert.equal(w.kinds('source').length, 1);
});
