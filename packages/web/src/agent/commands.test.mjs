import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openedNotice } from '../connections.js';
import { learnPreview } from '../flags.js';
import { canvasKeys } from '../home/canvas-local.js';
import { readPinned } from '../home/pinned.js';
import { AI_READS_REASON, COMMANDS, D7_REASON, ctxOf, executeCommand, noDefaultBranch, policy, prepareCommand } from './commands.js';

// Just enough browser for api.js, navigate() and setTheme(): fetch, history, storage, theme.
const memory = () => { const items = new Map(); return { getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value)), removeItem: (key) => items.delete(key) }; };
const calls = [], opened = [];
let reply = () => ({});
globalThis.localStorage = memory();
globalThis.window = Object.assign(new EventTarget(), { localStorage: globalThis.localStorage, history: { pushState: (_state, _title, to) => opened.push(to) }, location: { pathname: '/apps' }, matchMedia: () => ({ matches: false }) });
globalThis.document = { documentElement: { classList: { toggle() {} } } };
globalThis.PopStateEvent = class extends Event {};
globalThis.fetch = async (path, init = {}) => {
  calls.push({ path, method: init.method || 'GET', body: init.body && JSON.parse(init.body) });
  const { status = 200, body = {} } = reply(path, init) || {};
  return Response.json(body, { status });
};

const CATALOG = [
  { name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT' },
  { name: 'canvas-0f9e8d7c', kind: 'canvas', title: 'Attention deep dive' },
  { name: 'counter', kind: 'server' },
  { name: 's3-log', kind: 'job' },
];
const SURFACE = { place: 'app', org: 'gmail-com', email: 'a@gmail.com', orgName: null, catalog: CATALOG, resource: { kind: 'app', slug: 's3-log', title: 's3-log' }, selected: null, barHidden: false, resultsHost: 'sheet', handlers: {} };
const CTX = { ...ctxOf(SURFACE), devBuild: true, storage: memory() };
const LIVE = { ...CTX, devBuild: false };
const ASK = ['run', 'run_again', 'set_schedule', 'pause_schedule', 'resume_schedule', 'share', 'unshare'];
const CANVAS = { name: 'canvas-0f9e8d7c', org: 'gmail-com', title: 'Causal masks', kind: 'canvas', project: null, device_id: null };

test('every caller builds the one ctx from the surface; only the frozen scope overrides it', () => {
  assert.equal(learnPreview, false);
  const s3log = { org: 'gmail-com', kind: 'app', slug: 's3-log', title: 's3-log', selected: null };
  assert.deepEqual(ctxOf(SURFACE), {
    org: 'gmail-com', email: 'a@gmail.com', orgName: null, devBuild: learnPreview, storage: window.localStorage, catalog: CATALOG,
    scope: s3log, surface: SURFACE,
  });
  // The bar freezes the scope at Send (T02 §6.3); the page may move on before the command runs.
  const later = ctxOf({ ...SURFACE, place: 'home', resource: null }, { scope: s3log, devBuild: true });
  assert.deepEqual(later.scope, s3log);
  assert.equal(later.devBuild, learnPreview);
});

test('risk comes from the registry and matches T02 §7.2', () => {
  const byRisk = {};
  for (const [name, command] of Object.entries(COMMANDS)) (byRisk[command.risk] ||= []).push(name);
  for (const names of Object.values(byRisk)) names.sort();
  assert.deepEqual(byRisk, {
    immediate: ['explain', 'filter_library', 'find_apps_ai', 'find_runs_ai', 'new_thread', 'open_recent', 'open_resource', 'open_settings', 'open_start', 'open_tab', 'search_resources'],
    undo: ['create_canvas', 'pin', 'set_theme', 'unpin'],
    confirm: ['connect_repository', 'pause_schedule', 'resume_schedule', 'run', 'run_again', 'set_schedule', 'share', 'unshare'],
  });
});

test('D7: on the preview every live-touching Confirm card is blocked, and nothing else is', () => {
  for (const name of ASK) assert.equal(COMMANDS[name].touchesLive, true, name);
  for (const [name, command] of Object.entries(COMMANDS)) {
    const expected = command.risk === 'confirm' && command.touchesLive ? { risk: 'confirm', blocked: true, reason: D7_REASON }
      : ['find_apps_ai', 'find_runs_ai'].includes(name) ? { risk: 'immediate', blocked: true, reason: AI_READS_REASON } : { risk: command.risk, blocked: false };
    assert.deepEqual(policy(name, CTX), expected, name);
  }
  assert.equal(D7_REASON, 'Blocked on this preview: it would change live apps.');
  assert.deepEqual(policy('share', LIVE), { risk: 'confirm', blocked: false });
});

// T02 §16, verified in code: LEARN_DB rows (repositories.js:124) and learn-repositories-dev/ keys (:90) only.
test('connect_repository runs on the preview: its writes stay in LEARN_DB and learn-repositories-dev', () => {
  assert.deepEqual(policy('connect_repository', CTX), { risk: 'confirm', blocked: false });
});

test('an unknown command, or one the scope cannot serve, is blocked with its reason, and execute refuses it too', async () => {
  const home = { ...LIVE, scope: { org: 'gmail-com', kind: 'workspace', slug: null, title: null, selected: null } };
  assert.deepEqual(policy('rename', CTX), { risk: null, blocked: true, reason: 'Unknown command: rename' });
  assert.deepEqual(policy('find_runs_ai', home), { risk: 'immediate', blocked: true, reason: 'Open an app to search its runs.' });
  await assert.rejects(executeCommand('find_runs_ai', { q: 'failed yesterday' }, home), { message: 'Open an app to search its runs.' });
});

test('prepare resolves the default branch before the card, so the card shows the exact branch', async () => {
  reply = () => ({ body: { repo: 'karpathy/minGPT', defaultBranch: 'master', branches: ['master'], hasMore: false, page: 1 } });
  const prepared = await prepareCommand('connect_repository', { url: 'https://github.com/karpathy/minGPT', repo: 'karpathy/minGPT' }, CTX);
  assert.equal(calls.at(-1).path, '/api/repositories/branches?url=https%3A%2F%2Fgithub.com%2Fkarpathy%2FminGPT');
  assert.deepEqual(prepared, {
    args: { url: 'https://github.com/karpathy/minGPT', repo: 'karpathy/minGPT', branch: 'master', defaulted: true },
    card: {
      workspace: 'Personal', title: 'Connect karpathy/minGPT', target: 'karpathy/minGPT · public GitHub · https://github.com/karpathy/minGPT',
      operation: 'connect_repository', params: { branch: 'master' }, effect: "Only you can see it. Connected repositories can't be deleted yet.", // owner-only (Privacy P0), never a domain audience
    },
    policy: { risk: 'confirm', blocked: false },
  });
});

test('a repository that is not public says so before any card', async () => {
  reply = () => ({ status: 400, body: { error: 'Public repository was not found or GitHub is unavailable' } });
  await assert.rejects(prepareCommand('connect_repository', { url: 'https://github.com/acme/private-tools', repo: 'acme/private-tools' }, CTX),
    { message: "Can't connect acme/private-tools: no public repository found there. Private repositories aren't supported yet; public GitHub works." });
});

test('Connect posts the repository and run opens its project; the caller never navigates', async () => {
  reply = (path) => (path === '/api/apps' ? { body: { apps: CATALOG } } : { status: 202, body: { name: 'repo-5e6f7a8b-mingpt' } });
  const done = await executeCommand('connect_repository', { url: 'https://github.com/karpathy/minGPT', repo: 'karpathy/minGPT', branch: 'master' }, CTX);
  assert.deepEqual(done, { href: '/apps/repo-5e6f7a8b-mingpt', data: { name: 'repo-5e6f7a8b-mingpt' } });
  assert.deepEqual(calls.at(-1), { path: '/api/repositories', method: 'POST', body: { url: 'https://github.com/karpathy/minGPT', branch: 'master' } });
  assert.equal(opened.at(-1), '/apps/repo-5e6f7a8b-mingpt');
});

test('an Ask proposal becomes a card naming workspace, target, operation, parameters and effect; D7 blocks it', async () => {
  assert.deepEqual(await prepareCommand('share', { proposal_id: 'p-1a2b3c', app: 'counter', email: 'y@example.com', role: 'view' }, CTX), {
    args: { proposal_id: 'p-1a2b3c', app: 'counter', email: 'y@example.com', role: 'view' },
    card: { workspace: 'Personal', title: 'Share counter', target: 'counter (server) · /apps/counter', operation: 'share', params: { app: 'counter', email: 'y@example.com', role: 'view' }, effect: 'y@example.com gets view access to counter now.' },
    policy: { risk: 'confirm', blocked: true, reason: D7_REASON },
  });
  const before = calls.length;
  await assert.rejects(executeCommand('share', { proposal_id: 'p-1a2b3c', app: 'counter' }, CTX), { message: D7_REASON });
  assert.equal(calls.length, before);
});

test('off the preview an Ask tool executes only by approving the proposal Ask made', async () => {
  await assert.rejects(executeCommand('share', { app: 'counter', email: 'y@example.com' }, LIVE), { message: 'Share needs a proposal from Ask first.' });
  reply = () => ({ body: { ok: true, runId: 'r-abc' } });
  assert.deepEqual(await executeCommand('run', { proposal_id: 'p-4d5e6f', app: 's3-log' }, LIVE), { href: '/apps/s3-log/runs/r-abc', data: { ok: true, runId: 'r-abc' } });
  assert.deepEqual(calls.at(-1), { path: '/api/ask/approve', method: 'POST', body: { proposal_id: 'p-4d5e6f' } });
});

test('sharing a project or canvas says it is not available yet: no card, no API call (T02 §11)', async () => {
  const before = calls.length;
  for (const app of ['repo-1a2b3c4d-nanogpt', 'canvas-0f9e8d7c']) {
    const args = { app, email: 'y@example.com', role: 'view' };
    assert.deepEqual(await prepareCommand('share', args, CTX), { args, card: null, policy: { risk: 'immediate', blocked: false } });
    assert.deepEqual(await executeCommand('share', args, CTX), { message: "Sharing projects and canvases isn't available yet." });
  }
  assert.equal(calls.length, before);
});

test('opens and Library filters navigate inside run; Settings opens by event with the Connections notice', async () => {
  for (const [name, args] of [['open_resource', { slug: 'canvas-0f9e8d7c' }], ['open_tab', { slug: 'repo-1a2b3c4d-nanogpt', tab: 'map' }], ['filter_library', { type: 'canvases' }],
    ['filter_library', { section: 'shared' }], ['filter_library', { folder: 'Data team' }], ['filter_library', {}]]) {
    assert.deepEqual(await executeCommand(name, args, CTX), {});
  }
  assert.deepEqual(opened.slice(-6), ['/apps/canvas-0f9e8d7c', '/apps/repo-1a2b3c4d-nanogpt?tab=map', '/library?type=canvases', '/library?s=shared', '/library?f=Data+team', '/library']);
  let detail;
  window.addEventListener('small:settings', (event) => { detail = event.detail; }, { once: true });
  assert.deepEqual(await executeCommand('open_settings', { tab: 'connections', focus: 'google-slides' }, CTX), { notice: 'Opened Settings → Connections. Google Slides is planned; nothing was connected.' });
  assert.deepEqual(detail, { tab: 'connections', focus: 'google-slides' });
  assert.deepEqual(await executeCommand('open_settings', {}, CTX), { notice: openedNotice(undefined, undefined) });
});

test('search lists catalog titles; the AI finds list what their endpoints return', async () => {
  assert.deepEqual(await executeCommand('search_resources', { text: 'attention' }, CTX), { results: [{ slug: 'canvas-0f9e8d7c', title: 'Attention deep dive', kind: 'canvas', detail: 'Canvas' }] });
  reply = () => ({ body: { apps: ['s3-log'], note: '' } });
  assert.deepEqual(await executeCommand('find_apps_ai', { q: 'the job that copies logs to s3' }, LIVE), { results: [{ slug: 's3-log', title: 's3-log', kind: 'job', detail: 'App · job' }] });
  assert.deepEqual(calls.at(-1), { path: '/api/apps/find', method: 'POST', body: { q: 'the job that copies logs to s3' } });
  reply = () => ({ body: { apps: [], note: 'Nothing here copies logs yet.' } });
  assert.deepEqual(await executeCommand('find_apps_ai', { q: 'log copier' }, LIVE), { results: [], message: 'Nothing here copies logs yet.' });
  reply = () => ({ body: { runs: ['r-abc'], note: '' } });
  assert.deepEqual(await executeCommand('find_runs_ai', { q: 'the failed run yesterday' }, LIVE), { results: [{ slug: 's3-log/runs/r-abc', title: 'r-abc', kind: 'run', detail: 'Run of s3-log' }] });
  assert.deepEqual(calls.at(-1), { path: '/api/runs/find', method: 'POST', body: { app: 's3-log', q: 'the failed run yesterday' } });
});

test('new_thread tells the bar to start a new thread in the frozen scope', async () => {
  assert.deepEqual(await executeCommand('new_thread', {}, CTX), { resetThread: true });
});

test('create_canvas records this device; from the bar it stays put with Undo, from a button it opens the canvas', async () => {
  const ctx = { ...CTX, storage: memory() };
  reply = () => ({ status: 201, body: CANVAS });
  const before = opened.length;
  assert.deepEqual(await executeCommand('create_canvas', { title: 'Causal masks', project: 'repo-1a2b3c4d-nanogpt', open: false }, ctx),
    { message: 'Canvas created · Causal masks', href: '/apps/canvas-0f9e8d7c', undoable: true, data: CANVAS });
  assert.equal(opened.length, before);
  const device = ctx.storage.getItem('small.device');
  assert.match(device, /^[0-9a-f-]{36}$/);
  assert.deepEqual(calls.at(-1), { path: '/api/canvases', method: 'POST', body: { title: 'Causal masks', project: 'repo-1a2b3c4d-nanogpt', device_id: device } });
  assert.deepEqual(await executeCommand('create_canvas', { open: true }, ctx), { href: '/apps/canvas-0f9e8d7c', data: CANVAS });
  assert.deepEqual(calls.at(-1).body, { title: 'Untitled canvas', device_id: device });
  assert.equal(opened.at(-1), '/apps/canvas-0f9e8d7c');
});

test('Undo deletes a canvas only while it is untouched here, and the server has the last word on threads', async () => {
  const ctx = { ...CTX, storage: memory() }, keys = canvasKeys({ org: 'gmail-com', email: 'a@gmail.com', slug: 'canvas-0f9e8d7c' });
  const created = { message: 'Canvas created · Causal masks', href: '/apps/canvas-0f9e8d7c', undoable: true, data: CANVAS };
  ctx.storage.setItem(keys.ink, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [{ id: 'b1' }] }));
  const before = calls.length;
  await assert.rejects(COMMANDS.create_canvas.undo(created, ctx), { message: 'This canvas has content now. Archive it from Library instead.' });
  assert.equal(calls.length, before);
  ctx.storage.setItem(keys.ink, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [] }));
  ctx.storage.setItem(keys.chat, '[]');
  reply = () => ({ body: { ok: true } });
  await COMMANDS.create_canvas.undo(created, ctx);
  assert.deepEqual(calls.at(-1), { path: '/api/apps/canvas-0f9e8d7c', method: 'DELETE', body: undefined });
  reply = () => ({ status: 405, body: { error: 'This canvas has been used. Archive it instead.' } });
  await assert.rejects(COMMANDS.create_canvas.undo(created, ctx), { message: 'This canvas has been used. Archive it instead.' });
});

test('set_theme is undone by restoring the previous theme', async () => {
  localStorage.setItem('small.theme', 'light');
  const done = await executeCommand('set_theme', { theme: 'dark' }, CTX);
  assert.deepEqual(done, { message: 'Theme set to dark', undoable: true, data: { previous: 'light' } });
  assert.equal(localStorage.getItem('small.theme'), 'dark');
  await COMMANDS.set_theme.undo(done, CTX);
  assert.equal(localStorage.getItem('small.theme'), 'light');
  await assert.rejects(executeCommand('set_theme', { theme: 'purple' }, CTX), { message: 'Theme is system, light or dark.' });
});

test('pin and unpin change the device list once, name what changed, and Undo reverses only a real change', async () => {
  const ctx = { ...CTX, storage: memory() };
  let heard = 0;
  window.addEventListener('small:pinned', () => { heard += 1; });
  assert.deepEqual(await executeCommand('pin', { slug: 'repo-1a2b3c4d-nanogpt' }, ctx), { message: 'Pinned · karpathy/nanoGPT', undoable: true, data: { slug: 'repo-1a2b3c4d-nanogpt', changed: true } });
  assert.deepEqual(await executeCommand('pin', { slug: 'repo-1a2b3c4d-nanogpt' }, ctx), { message: 'Already pinned · karpathy/nanoGPT', undoable: false, data: { slug: 'repo-1a2b3c4d-nanogpt', changed: false } });
  const unpinned = await executeCommand('unpin', { slug: 'repo-1a2b3c4d-nanogpt' }, ctx);
  assert.deepEqual(unpinned, { message: 'Unpinned · karpathy/nanoGPT', undoable: true, data: { slug: 'repo-1a2b3c4d-nanogpt', changed: true } });
  await COMMANDS.unpin.undo(unpinned, ctx);
  assert.deepEqual(readPinned(ctx.storage, 'gmail-com', 'a@gmail.com'), ['repo-1a2b3c4d-nanogpt']);
  const noop = await executeCommand('unpin', { slug: 'counter' }, ctx);
  assert.deepEqual(noop, { message: 'Not pinned · counter', undoable: false, data: { slug: 'counter', changed: false } });
  await COMMANDS.unpin.undo(noop, ctx);
  assert.deepEqual(readPinned(ctx.storage, 'gmail-com', 'a@gmail.com'), ['repo-1a2b3c4d-nanogpt']);
  assert.equal(heard, 3);
});

test('G5: on the preview, model-backed find is unavailable and never reaches the network', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => { calls.push(args); throw new Error('no network in this test'); };
  try {
    const ctx = { devBuild: true, scope: { kind: 'app', slug: 'counter' }, catalog: [] };
    for (const name of ['find_apps_ai', 'find_runs_ai']) {
      assert.deepEqual(COMMANDS[name].available(ctx), { ok: false, reason: AI_READS_REASON }, name);
      assert.deepEqual(await executeCommand(name, { q: 'failed runs from yesterday morning' }, ctx), { message: AI_READS_REASON }, name);
    }
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Gate C G2: a repository without a known default branch stops and asks; nothing is assumed', async () => {
  reply = () => ({ body: { repo: 'o/r', defaultBranch: 'alpha', defaultBranchKnown: false, branches: ['alpha', 'zeta'], hasMore: false, page: 1 } });
  const before = calls.length;
  await assert.rejects(prepareCommand('connect_repository', { url: 'https://github.com/o/r', repo: 'o/r' }, CTX), { message: noDefaultBranch('o/r', ['alpha', 'zeta']) });
  assert.equal(calls.slice(before).some((c) => c.path === '/api/repositories' && c.method === 'POST'), false);
});

test('Gate C G2: an explicit branch link is used as given', async () => {
  reply = () => ({ body: { repo: 'o/r', defaultBranch: 'alpha', defaultBranchKnown: false, branches: ['alpha', 'zeta'], hasMore: false, page: 1 } });
  const prepared = await prepareCommand('connect_repository', { url: 'https://github.com/o/r', repo: 'o/r', branch: 'zeta' }, CTX);
  assert.equal(prepared.args.branch, 'zeta');
});

// A /tree/ link can go on into a folder, and branch names can hold '/', so the listing decides where the branch ends.
test('Gate C G2: a branch link into a folder uses the longest real branch it starts with', async () => {
  reply = () => ({ body: { repo: 'o/r', defaultBranch: 'main', defaultBranchKnown: true, branches: ['feature', 'feature/x', 'main'], hasMore: false, page: 1 } });
  assert.equal((await prepareCommand('connect_repository', { url: 'https://github.com/o/r', repo: 'o/r', branch: 'feature/x/docs/model.py' }, CTX)).args.branch, 'feature/x');
  assert.equal((await prepareCommand('connect_repository', { url: 'https://github.com/o/r', repo: 'o/r', branch: 'gone/docs' }, CTX)).args.branch, 'gone/docs');
});

// One repository, one project, whatever the router did (user decision, 2026-09-24).
test('connect never creates a second project for a repository already connected, however it is spelled', async () => {
  const before = calls.length;
  const prepared = await prepareCommand('connect_repository', { url: 'https://github.com/KARPATHY/nanogpt', repo: 'KARPATHY/nanogpt' }, CTX);
  assert.deepEqual(prepared, { args: { url: 'https://github.com/KARPATHY/nanogpt', repo: 'KARPATHY/nanogpt', existing: 'repo-1a2b3c4d-nanogpt' }, card: null, policy: { risk: 'immediate', blocked: false } });
  assert.equal(calls.length, before);
  assert.deepEqual(await executeCommand('connect_repository', prepared.args, CTX),
    { message: 'KARPATHY/nanogpt is already connected; opened its project.', href: '/apps/repo-1a2b3c4d-nanogpt', data: { name: 'repo-1a2b3c4d-nanogpt', existing: true } });
  assert.equal(opened.at(-1), '/apps/repo-1a2b3c4d-nanogpt');
  assert.equal(calls.length, before);
});

test('connect re-reads the catalog before creating, so a stale page cannot make a duplicate', async () => {
  const stale = { ...CTX, catalog: [] };
  reply = (path) => (path === '/api/apps' ? { body: { apps: [{ name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'Karpathy/NanoGPT', branch: 'master' }] } } : { status: 202, body: { name: 'repo-duplicate' } });
  const before = calls.length;
  const done = await executeCommand('connect_repository', { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT', branch: 'master' }, stale);
  assert.deepEqual(done.data, { name: 'repo-1a2b3c4d-nanogpt', existing: true });
  assert.deepEqual(calls.slice(before).map((c) => `${c.method} ${c.path}`), ['GET /api/apps']);
});

test('an explicit different branch of a connected repository is never a silent duplicate or overwrite', async () => {
  const ctx = { ...CTX, catalog: [{ name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT', branch: 'master' }] };
  const nano = { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT' };
  const before = calls.length;
  await assert.rejects(prepareCommand('connect_repository', { ...nano, branch: 'dev' }, ctx),
    { message: 'karpathy/nanoGPT is already connected on master. Open it, or connect dev as a separate project.' });
  assert.equal((await prepareCommand('connect_repository', { ...nano, branch: 'master/model.py' }, ctx)).args.existing, 'repo-1a2b3c4d-nanogpt');
  assert.equal(calls.length, before);
  // Chosen explicitly (the router's "Connect ... at dev" option): a separate project, said so on the card.
  reply = (path) => (path.startsWith('/api/repositories/branches') ? { body: { repo: 'karpathy/nanoGPT', defaultBranch: 'master', defaultBranchKnown: true, branches: ['dev', 'master'], hasMore: false, page: 1 } }
    : path === '/api/apps' ? { body: { apps: ctx.catalog } } : { status: 202, body: { name: 'repo-2b3c4d5e-nanogpt' } });
  const prepared = await prepareCommand('connect_repository', { ...nano, branch: 'dev', newBranch: true }, ctx);
  assert.deepEqual(prepared.args, { ...nano, branch: 'dev', newBranch: true });
  assert.equal(prepared.card.effect, "karpathy/nanoGPT is already connected on master; this connects dev as a separate project. Only you can see it. Connected repositories can't be deleted yet.");
  await executeCommand('connect_repository', prepared.args, ctx);
  assert.deepEqual(calls.at(-1), { path: '/api/repositories', method: 'POST', body: { url: 'https://github.com/karpathy/nanoGPT', branch: 'dev' } });
});

test('the executor keys on the URL it will send, not on a label beside it', async () => {
  const prepared = await prepareCommand('connect_repository', { url: 'https://github.com/karpathy/nanoGPT', repo: 'someone/else' }, CTX);
  assert.deepEqual(prepared.args, { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT', existing: 'repo-1a2b3c4d-nanogpt' });
  reply = (path) => (path === '/api/apps' ? { body: { apps: CATALOG } } : { status: 202, body: { name: 'repo-duplicate' } });
  const before = calls.length;
  assert.equal((await executeCommand('connect_repository', { url: 'https://github.com/karpathy/nanoGPT.git', repo: 'x/y', branch: 'master' }, { ...CTX, catalog: [] })).data.existing, true);
  assert.equal(calls.slice(before).some((c) => c.method === 'POST'), false);
});

test('only connect_repository resolves to an existing project; no other command can skip its card that way', async () => {
  const prepared = await prepareCommand('share', { existing: 'counter', proposal_id: 'p-1', app: 'counter', email: 'y@example.com', role: 'view' }, LIVE);
  assert.notEqual(prepared.card, null);
  assert.deepEqual(prepared.policy, { risk: 'confirm', blocked: false });
});

test('connect refuses to create when it cannot read which repositories are connected', async () => {
  reply = (path) => (path === '/api/apps' ? { body: { org: 'gmail-com' } } : { status: 202, body: { name: 'repo-duplicate' } });
  const before = calls.length;
  await assert.rejects(executeCommand('connect_repository', { url: 'https://github.com/karpathy/minGPT', repo: 'karpathy/minGPT', branch: 'master' }, CTX),
    { message: "Couldn't check which repositories are already connected. Try again." });
  assert.equal(calls.slice(before).some((c) => c.method === 'POST'), false);
});

test('a bare link on a stale page opens the project connected on another branch instead of erroring', async () => {
  reply = (path) => (path.startsWith('/api/repositories/branches') ? { body: { repo: 'karpathy/nanoGPT', defaultBranch: 'master', defaultBranchKnown: true, branches: ['dev', 'master'], hasMore: false, page: 1 } }
    : path === '/api/apps' ? { body: { apps: [{ name: 'repo-2b3c4d5e-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT', branch: 'dev' }] } } : { status: 202, body: { name: 'repo-duplicate' } });
  const stale = { ...CTX, catalog: [] };
  const prepared = await prepareCommand('connect_repository', { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT' }, stale);
  assert.equal((await executeCommand('connect_repository', prepared.args, stale)).data.name, 'repo-2b3c4d5e-nanogpt');
});

test('the separate-branch card names every connected branch, and never undefined', async () => {
  reply = () => ({ body: { repo: 'karpathy/nanoGPT', defaultBranch: 'master', defaultBranchKnown: true, branches: ['dev', 'master', 'x'], hasMore: false, page: 1 } });
  const two = { ...CTX, catalog: [{ name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT', branch: 'master' }, { name: 'repo-2b3c4d5e-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT', branch: 'dev' }] };
  const nano = { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT', branch: 'x', newBranch: true };
  assert.match((await prepareCommand('connect_repository', nano, two)).card.effect, /^karpathy\/nanoGPT is already connected on master, dev; this connects x as a separate project\. /);
  assert.match((await prepareCommand('connect_repository', nano, { ...CTX, catalog: [] })).card.effect, /^Only you can see it\./); // owner-only (Privacy P0)
});

test('search_resources can narrow to kinds; open_recent opens the newest of a kind opened in this browser', async () => {
  assert.deepEqual((await executeCommand('search_resources', { text: 'a', kinds: ['canvas'] }, CTX)).results.map((r) => r.kind), ['canvas']);
  const storage = memory();
  storage.setItem('small.recent', JSON.stringify(['s3-log', 'repo-1a2b3c4d-nanogpt']));
  const before = opened.length;
  await executeCommand('open_recent', { kind: 'repository' }, { ...CTX, storage });
  assert.equal(opened.at(-1), '/apps/repo-1a2b3c4d-nanogpt');
  assert.deepEqual(await executeCommand('open_recent', { kind: 'canvas' }, { ...CTX, storage }), { message: 'No canvas opened in this browser yet.' });
  assert.equal(opened.length, before + 1);
});

test('with a stale list, a different branch found at Confirm comes back as the open-or-connect choice, never a dead end', async () => {
  const stale = { ...CTX, catalog: [] };
  reply = (path) => (path === '/api/apps' ? { body: { apps: [{ name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT', branch: 'master' }] } } : { status: 202, body: { name: 'repo-duplicate' } });
  const before = calls.length;
  const done = await executeCommand('connect_repository', { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT', branch: 'dev' }, stale);
  assert.deepEqual(done.choose.map((o) => [o.label, o.name]), [['karpathy/nanoGPT (master) · Project', 'open_resource'], ['Connect karpathy/nanoGPT at dev', 'connect_repository']]);
  assert.deepEqual(done.choose[1].args, { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT', branch: 'dev', newBranch: true });
  assert.deepEqual(calls.slice(before).map((c) => `${c.method} ${c.path}`), ['GET /api/apps']); // nothing created
});

test('open_start opens the Start dialog on its path and creates nothing', async () => {
  let detail;
  window.addEventListener('small:start', (event) => { detail = event.detail; }, { once: true });
  const before = calls.length;
  assert.deepEqual(await executeCommand('open_start', { path: 'question' }, CTX), {});
  assert.deepEqual(detail, { path: 'question' });
  assert.equal(calls.length, before);
});

test('explain answers from the built-in product model and calls nothing', async () => {
  const before = calls.length;
  const { answer } = await executeCommand('explain', { concept: 'project' }, CTX);
  assert.match(answer, /learning hub/);
  assert.match(answer, /Overview, Learn and Map/);
  assert.match((await executeCommand('explain', { concept: 'help' }, CTX)).answer, /type \/ to see every shortcut/);
  assert.equal(calls.length, before);
});
