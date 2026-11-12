// BE.01a (checklist 4.1.1, client half): one Explain on canvas entry. The button and a clear typed lesson request reach the SAME guarded create path with the same
// source revision, scope, instruction and Depth, and yield ONE draft whichever comes first, however often it is replayed. The server half (the start_lesson tool, its
// eligibility and validation) is control-plane/test/chat-lesson.test.js. Doubles only: a fake roadmap server that keeps one unfinished roadmap per board, as the real
// create route does (a second create answers 409 roadmap_unfinished_exists).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRoadmapController } from './roadmap-controller.js';
import { initialState, lessonSourcesOf, reduce } from './roadmap-client.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const body = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const BOARD = 'lb_7c1e5a90d2b84f63a1c07e92';
const SOURCE = { key: 'file:fs_41c9e0a7d2b84f63a1c07e92', rev: 'rev1', name: 'Gradient descent notes.md' };
const settle = () => new Promise(resolve => setTimeout(resolve, 10));
const conflict = () => Object.assign(new Error('unfinished'), { status: 409, data: { code: 'roadmap_unfinished_exists' } });

function setup({ invitation = true, existing = null } = {}) {
  const calls = [], roadmaps = existing ? [{ view: existing }] : [], threads = [];
  const api = async (path, opts = {}) => {
    const method = opts.method || 'GET', data = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method, path, body: data });
    await Promise.resolve();
    if (method === 'GET' && path.includes('/invitations')) return { invitation: invitation && !roadmaps.length ? body('invitation-offered').invitation : null };
    if (method === 'GET') return roadmaps.length ? roadmaps[0].view : { roadmap: null };
    if (method === 'POST' && path.endsWith('/thread')) { threads.push(data); roadmaps[0].view = { ...roadmaps[0].view, roadmap: { ...roadmaps[0].view.roadmap, threadId: data.threadId } }; return roadmaps[0].view; }
    if (method === 'POST' && path === '/api/learn/roadmap') {
      if (roadmaps.length) throw conflict();
      const proposed = body('status-proposed-plan');
      roadmaps.push({ data, view: { ...proposed, roadmap: { ...proposed.roadmap, threadId: null } } });
      return { roadmapId: proposed.roadmap.id };
    }
    throw Object.assign(new Error('not found'), { status: 404, data: { code: 'not_found' } });
  };
  let n = 0;
  const controller = createRoadmapController({ api, boardId: BOARD, host: { readOnly: () => false, depth: () => 'balanced', instruction: () => 'scraped', sourceRev: () => SOURCE.rev, hasBlock: () => false, sources: () => [SOURCE] }, schedule: () => 0, cancel() {}, random: () => `key${++n}aaaaaaaa` });
  const creates = () => calls.filter(c => c.method === 'POST' && c.path === '/api/learn/roadmap');
  return { controller, calls, roadmaps, threads, creates };
}

test('BE.01a: a click and a typed lesson request for the same source are one guarded create with the same source, scope, instruction and Depth', async () => {
  const s = setup();
  s.controller.start(); await settle();
  assert.equal(s.creates().length, 0, 'the invitation alone starts nothing');
  const click = s.controller.explain({ depth: 'detailed', instruction: 'teach me gradients' });
  const typed = s.controller.lesson({ depth: 'detailed', instruction: 'teach me gradients', source: SOURCE });
  await Promise.all([click, typed]); await settle();
  assert.equal(s.creates().length, 1, 'one request: the typed request joined the button gesture');
  const create = s.creates()[0].body;
  assert.deepEqual([create.invitationId, create.source, create.instruction, create.depth, typeof create.actionKey], [body('invitation-offered').invitation.id, { key: SOURCE.key, rev: SOURCE.rev, scope: { kind: 'whole' } }, 'teach me gradients', 'detailed', 'string']);
  assert.equal(s.roadmaps.length, 1);
});

test('BE.01a: replaying the request from both entry points, in either order, ends with one draft and no error notice', async () => {
  for (const order of ['click-first', 'typed-first']) {
    const s = setup();
    s.controller.start(); await settle();
    const click = () => s.controller.explain({ depth: 'balanced', instruction: 'teach me gradients' });
    const typed = () => s.controller.lesson({ depth: 'balanced', instruction: 'teach me gradients', source: SOURCE });
    await (order === 'click-first' ? click() : typed());
    await (order === 'click-first' ? typed() : click());
    await s.controller.lesson({ depth: 'balanced', instruction: 'teach me gradients', source: SOURCE }); // a third, once the draft exists
    await settle();
    assert.equal(s.roadmaps.length, 1, order + ': one draft on the server');
    assert.ok(s.controller.getState().view?.roadmap, order + ': the existing draft is what the Chat shows');
    assert.equal(s.controller.getState().notice, null, order + ': the refused duplicate is not an error');
    const posts = s.creates().length;
    await s.controller.lesson({ depth: 'balanced', instruction: 'again', source: SOURCE });
    assert.equal(s.creates().length, posts, order + ': an unfinished roadmap is never asked for a second draft');
  }
});

test('BE.01a: with no invitation (dismissed or none) the typed request creates from the resolved source itself; Depth defaults to the composer', async () => {
  const s = setup({ invitation: false });
  s.controller.start(); await settle();
  await s.controller.lesson({ instruction: 'explain section two of this', source: SOURCE });
  const [create] = s.creates();
  assert.equal(create.body.invitationId, undefined, 'no invitation is named');
  assert.deepEqual([create.body.source, create.body.instruction, create.body.depth, typeof create.body.actionKey], [{ key: SOURCE.key, rev: SOURCE.rev, scope: { kind: 'whole' } }, 'explain section two of this', 'balanced', 'string']);
  // The same typed request twice at once is one request.
  const t = setup({ invitation: false });
  t.controller.start(); await settle();
  await Promise.all([t.controller.lesson({ instruction: 'teach me', source: SOURCE }), t.controller.lesson({ instruction: 'teach me', source: SOURCE })]);
  assert.equal(t.creates().length, 1);
});

test('BE.01a: nothing is created without words or without a source, and the typed request binds the Chat thread it came in', async () => {
  const s = setup({ invitation: false });
  s.controller.start(); await settle();
  assert.equal(await s.controller.lesson({ instruction: '   ', source: SOURCE }), null);
  assert.equal(await s.controller.lesson({ instruction: 'teach me', source: null }), null);
  assert.equal(s.creates().length, 0);
  await s.controller.lesson({ instruction: 'teach me', source: SOURCE, threadId: 'canvaschat-thread-1' });
  assert.equal(s.threads.length, 1, 'the new roadmap is bound to the thread of the request');
  assert.equal(s.threads[0].threadId, 'canvaschat-thread-1');
});

test('BE.01a: a lesson request beside an unfinished roadmap creates nothing', async () => {
  const s = setup({ existing: body('status-proposed-plan') });
  s.controller.start(); await settle();
  assert.ok(s.controller.getState().view);
  assert.equal(await s.controller.lesson({ instruction: 'teach me', source: SOURCE }), null);
  assert.equal(s.creates().length, 0);
});

test('lessonSourcesOf: the sources a typed lesson may start from', () => {
  const on = state => ({ flag: 'on', ...state });
  const view = body('status-proposed-plan');
  assert.deepEqual(lessonSourcesOf(on({ view: null, invitation: null }), [SOURCE]), [SOURCE], 'ready sources on the canvas');
  assert.deepEqual(lessonSourcesOf(on({ view: null, invitation: { id: 'iv', sourceKeys: [SOURCE.key] } }), [SOURCE, { key: 'file:other', rev: 'r', name: 'o' }]), [SOURCE], 'an offered invitation names its own source');
  assert.equal(lessonSourcesOf(on({ view: null, invitation: { id: 'iv', sourceKeys: ['file:unknown'] } }), [SOURCE]), null, 'an invitation whose source is not on the canvas');
  assert.equal(lessonSourcesOf(on({ view, invitation: null }), [SOURCE]), null, 'an unfinished roadmap');
  assert.equal(lessonSourcesOf(on({ view: null, invitation: null }), []), null, 'no source');
  assert.equal(lessonSourcesOf(on({ view: null, invitation: null }), Array.from({ length: 6 }, (_, i) => ({ key: `file:s${i}`, rev: 'r', name: `s${i}` }))), null, 'more than five is too many to choose from');
  assert.equal(lessonSourcesOf({ ...initialState(), flag: 'off' }, [SOURCE]), null, 'flag off');
  assert.ok(reduce, 'reducer import kept for the shared state shape');
});

test('the Send path carries the lesson sources and runs the typed request through the controller, with the Chat thread and the composer Depth', () => {
  const ask = readFileSync(fileURLToPath(new URL('./ask.jsx', import.meta.url)), 'utf8');
  assert.ok(ask.includes('const lessonSources = roadmap?.lessonSources?.() || null;'));
  assert.ok(ask.includes("lessonSources?.length ? { lesson: { sources: lessonSources } } : {}"), 'only an ordinary Learn Chat turn (no command, regeneration or Edit) offers the sources');
  assert.ok(ask.includes("d.toolRequest?.command === 'explain-on-canvas'"));
  assert.ok(ask.includes("roadmap?.controller?.lesson({ depth: chat?.settings?.depth || 'balanced', instruction, source:"));
  assert.ok(ask.includes("threadId: d.threadId"), 'the saved thread of the final event, known before the roadmap starts (a new chat has no chat.thread.id when the tool event arrives)');
  const hook = readFileSync(fileURLToPath(new URL('./use-roadmap.js', import.meta.url)), 'utf8');
  assert.ok(hook.includes('lessonSources: () => lessonSourcesOf(controller.getState(), hostRef.current?.sources?.() || [])'));
  const page = readFileSync(fileURLToPath(new URL('./LearnPage.jsx', import.meta.url)), 'utf8');
  assert.ok(page.includes("block.type === 'file' && block.kind === 'markdown' && block.fileRef?.source?.id && block.fileRef.source.rev"), 'the host lists only ready Markdown sources with a stored revision');
});

// BE.01a: the typed request carries the scope the tool call named; whole is the default and never a silent override.
test('lesson: a named scope reaches the create body (invitation path and source path); no scope means the whole source', async () => {
  const passage = { kind: 'passage', start: 10, end: 90 };
  const a = setup({ invitation: false }); a.controller.start(); await settle();
  await a.controller.lesson({ depth: 'balanced', instruction: 'teach the middle part', source: SOURCE, scope: passage });
  assert.deepEqual(a.creates()[0].body.source.scope, passage);
  const b = setup({ invitation: false }); b.controller.start(); await settle();
  await b.controller.lesson({ depth: 'balanced', instruction: 'teach it', source: SOURCE });
  assert.deepEqual(b.creates()[0].body.source.scope, { kind: 'whole' });
});
