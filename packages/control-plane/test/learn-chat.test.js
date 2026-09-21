import { paperSelectionImage } from '../src/learn-preview-review.js';
import { canvasSeed } from '../src/canvas-conversation.js';
import { arxivId, paperDocument } from '../src/arxiv.js';
import { OUTLINE_TOOL, OUTLINE_SYSTEM, validateOutlineOps } from '../src/learn-outline-tool.js';
import { isUploadedPaperId, uploadedPaperAsDocument, paperIdentity, PAPER_PAGE_LIMIT } from '../src/learn-paper.js';
import { LEARN_SYSTEM, validateLessonSnapshot, validateOutline, renderOutline } from '../src/learn-context.js';
import { captureSelection, selectionSnapshot, sigmoidObjects } from '../../web/src/sigmoid-context.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Execute the actual handlers against SQLite without importing the bundled HTML.
const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const names = ['apiAsk', 'askThreadForUser', 'apiAskThreads', 'apiAskThread', 'apiAskThreadRename', 'apiAskThreadDelete'];
const functions = names.map(name => source.match(new RegExp(`async function ${name}\\([^]*?\\n\\}`))[0]).join('\n');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
// One object, so adding a dependency to apiAsk is one line here instead of
// three in parallel lists. Getting that wrong surfaces as a ReferenceError
// swallowed into a 502, which reads like a broken feature; it has cost this
// file four debugging rounds already.
const deps = {
  json,
  appForUser: async (env, user, name) => env.apps[name],
  appContext: async (env, app) => ({ name: app.name }),
  askStream: async (env, context, history, question, onFull, metadata, blocks, toolOpts, model, org, system, research) => {
    env.answers.push({ history: [...history], question, context, toolOpts, system, org, blocks, research });
    await onFull('Answer: ' + question);
    return json(metadata);
  },
  ASK_MODELS: {},
  ASK_TOOLS: [],
  LEARN_SYSTEM,
  validateLessonSnapshot,
  validateOutline,
  renderOutline,
  arxivId,
  readArxivPaper: async id => ({ id, title: 'Test paper', pdfUrl: `https://arxiv.org/pdf/${id}` }),
  paperDocument,
  paperSelectionImage,
  isUploadedPaperId,
  uploadedPaperAsDocument,
  paperIdentity,
  PAPER_PAGE_LIMIT,
  OUTLINE_TOOL,
  OUTLINE_SYSTEM,
  validateOutlineOps,
  canvasSeed,
};
const handlers = new Function(...Object.keys(deps), `${functions}; return { ${names.join(',')} };`)(...Object.values(deps));
const owner = { email: 'owner@example.test', org: 'workspace-a' };
const request = (body, path = '/api/learn/ask') => new Request('https://small.example' + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  for (const table of ['threads', 'messages']) db.exec(schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([^]*?\\n\\);`))[0]);
  return {
    ANTHROPIC_API_KEY: 'test-only', answers: [],
    apps: { counter: { name: 'counter', canView: true, canEdit: false }, other: { name: 'other', canView: true, canEdit: false } },
    DB: { batch: async statements => Promise.all(statements.map(statement => statement.run())), prepare: sql => ({ bind: (...params) => ({
      first: async () => db.prepare(sql).get(...params) || null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => { const result = db.prepare(sql).run(...params); return { meta: { last_row_id: Number(result.lastInsertRowid), changes: Number(result.changes) } }; },
    }) }) },
  };
}
const send = (env, conversation, message, thread_id, app = 'counter', user = owner) => handlers.apiAsk(request({ scope: { app }, message, thread_id }), env, {}, user, conversation);
const list = (env, scope) => handlers.apiAskThreads(new Request(`https://small.example/api/ask/threads?scope=${scope}&ref=counter`), env, owner);

test('canvas follow-ups seed separate Learn threads for normal deployed apps', async t => {
  const env = fixture(t);
  const start = label => handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'Explain further', canvas_seed: { question: label, answer: `Answer ${label}` } }), env, {}, owner, 'learn');
  const a = await (await start('Alpha')).json(), b = await (await start('Beta')).json();
  assert.notEqual(a.threadId, b.threadId);
  assert.deepEqual(env.answers[0].history.map(m => m.content), ['Alpha', 'Answer Alpha']);
  assert.deepEqual(env.answers[1].history.map(m => m.content), ['Beta', 'Answer Beta']);
  await send(env, 'learn', 'Again', a.threadId);
  assert.doesNotMatch(JSON.stringify(env.answers[2].history), /Beta/);
  env.apps.counter.canView = false;
  assert.equal((await start('Blocked')).status, 403);
});

test('Learn and Agent have separate histories and model context for the same app', async t => {
  const env = fixture(t);
  const agent = await (await send(env, 'agent', 'Agent question')).json();
  const learn = await (await send(env, 'learn', 'Learn question')).json();
  assert.notEqual(agent.threadId, learn.threadId);
  // Learn carries a research object; Agent carries none. It holds the outline
  // tool too now, offered only when the canvas actually has sections.
  assert.deepEqual(env.answers[1].research.papers, []);
  assert.deepEqual(env.answers[1].research.tools, [], 'no outline was sent, so no outline tool is offered');
  assert.equal(env.answers[1].system, LEARN_SYSTEM);
  assert.equal(env.answers[0].research, null);
  assert.equal(env.answers[1].history.length, 0);
  assert.equal((await send(env, 'learn', 'Learn follow-up', learn.threadId)).status, 200);
  assert.deepEqual(env.answers[2].history.map(m => m.content), ['Learn question', 'Answer: Learn question']);
  assert.deepEqual((await (await list(env, 'app')).json()).threads.map(t => t.id), [agent.threadId]);
  assert.deepEqual((await (await list(env, 'learn')).json()).threads.map(t => t.id), [learn.threadId]);
});

test('Learn rejects Agent threads, other apps, other users, and other workspaces', async t => {
  const env = fixture(t);
  const agent = await (await send(env, 'agent', 'Agent question')).json();
  const learn = await (await send(env, 'learn', 'Learn question')).json();
  assert.equal((await send(env, 'learn', 'Wrong thread', agent.threadId)).status, 409);
  assert.equal((await send(env, 'agent', 'Wrong thread', learn.threadId)).status, 409);
  assert.equal((await send(env, 'learn', 'Wrong app', learn.threadId, 'other')).status, 409);
  assert.equal((await send(env, 'learn', 'Wrong owner', learn.threadId, 'counter', { ...owner, email: 'colleague@example.test' })).status, 404);
  assert.equal((await send(env, 'learn', 'Wrong workspace', learn.threadId, 'counter', { ...owner, org: 'workspace-b' })).status, 404);
  assert.equal(env.answers.length, 2);
});

test('New chat, rename, and delete affect only the selected Learn conversation', async t => {
  const env = fixture(t);
  const agent = await (await send(env, 'agent', 'Agent question')).json();
  const first = await (await send(env, 'learn', 'First lesson')).json();
  const second = await (await send(env, 'learn', 'Second lesson')).json();
  assert.notEqual(first.threadId, second.threadId);
  assert.equal(env.answers[2].history.length, 0);
  assert.equal((await handlers.apiAskThreadRename(request({ title: 'Renamed lesson' }), env, owner, second.threadId)).status, 200);
  assert.equal((await (await list(env, 'learn')).json()).threads[0].title, 'Renamed lesson');
  assert.equal((await handlers.apiAskThreadDelete(env, owner, first.threadId)).status, 200);
  assert.equal((await handlers.apiAskThread(env, owner, first.threadId)).status, 404);
  assert.deepEqual((await (await list(env, 'learn')).json()).threads.map(t => t.id), [second.threadId]);
  const unchanged = await (await handlers.apiAskThread(env, owner, agent.threadId)).json();
  assert.deepEqual(unchanged.messages.map(m => m.content), ['Agent question', 'Answer: Agent question']);
});

test('revoked app access blocks listing, reading, continuing, renaming, and deleting Learn history', async t => {
  const env = fixture(t);
  const { threadId } = await (await send(env, 'learn', 'Learn question')).json();
  env.apps.counter.canView = false;
  assert.equal((await list(env, 'learn')).status, 403);
  assert.equal((await handlers.apiAskThread(env, owner, threadId)).status, 404);
  assert.equal((await send(env, 'learn', 'Follow-up', threadId)).status, 403);
  assert.equal((await handlers.apiAskThreadRename(request({ title: 'No access' }), env, owner, threadId)).status, 404);
  assert.equal((await handlers.apiAskThreadDelete(env, owner, threadId)).status, 404);
  assert.equal(env.answers.length, 1);
});

test('Learn requires an app and never falls back to workspace or run chat', async t => {
  const env = fixture(t);
  for (const scope of [{}, { run: 'r-example' }, { app: 'counter', run: 'r-example' }, null]) {
    assert.equal((await handlers.apiAsk(request({ scope, message: 'Hello' }), env, {}, owner, 'learn')).status, 400);
  }
  assert.equal(env.answers.length, 0);
});

function board() {
  const lesson = { runId: 'test-run', currentStage: 'complete', recentExplanations: ['At x = 0, sigmoid is 0.5.'] };
  const shapes = ['midpoint', 'equation', 'curve'].map(objectId => ({ id: 'shape:' + objectId, type: 'geo',
    meta: { ...sigmoidObjects[objectId], objectId, lessonId: 'sigmoid-demo', runId: lesson.runId, author: 'script', renderStatus: 'complete' } }));
  const bounds = { x: 100, y: 200, w: 12, h: 12 };
  const editor = { getSelectedShapeIds: () => ['shape:midpoint'], getShape: id => shapes.find(s => s.id === id), getCurrentPageShapes: () => shapes, getShapePageBounds: () => bounds };
  return { lesson, shapes, bounds, editor };
}

test('snapshot preserves meaning, reads moved bounds, and rejects deletion and replay', () => {
  const b = board(); const pinned = captureSelection(b.editor, b.lesson);
  b.bounds.x = 999;
  const snapshot = selectionSnapshot(b.editor, b.lesson, pinned);
  assert.equal(snapshot.target.shapes[0].pageBounds.x, 999);
  assert.deepEqual(snapshot.target.mathPosition, {x:0,y:0.5});
  assert.equal(snapshot.relatedObjects.find(o => o.kind === 'equation').originalText, sigmoidObjects.equation.originalText);
  assert.equal(snapshot.relatedObjects.find(o => o.kind === 'curve').points, undefined);
  assert.equal(validateLessonSnapshot(snapshot), snapshot);
  b.lesson.runId = 'new-run';
  assert.throws(() => selectionSnapshot(b.editor, b.lesson, pinned), /replayed/);
  b.lesson.runId = 'test-run'; b.shapes.shift();
  assert.throws(() => selectionSnapshot(b.editor, b.lesson, pinned), /deleted/);
});

test('selection questions authorize app access, disable tools, and use the tutor prompt', async t => {
  const env=fixture(t), b=board();
  const snapshot=selectionSnapshot(b.editor,b.lesson,captureSelection(b.editor,b.lesson));
  env.apps.counter.canEdit=true;
  const req=()=>request({scope:{app:'counter'},message:'Why is this 0.5?',lesson_snapshot:snapshot});
  assert.equal((await handlers.apiAsk(req(),env,{},owner,'learn')).status,200);
  const answer=env.answers[0];
  assert.equal(answer.toolOpts,null); assert.equal(answer.system,LEARN_SYSTEM);
  assert.equal(JSON.parse(answer.context).target.objectId,'midpoint');
  env.apps.counter.canView=false;
  assert.equal((await handlers.apiAsk(req(),env,{},owner,'learn')).status,403);
  assert.equal((await handlers.apiAsk(req(),env,{},owner,'agent')).status,400);
  snapshot.target.runId='wrong-run';
  assert.equal((await handlers.apiAsk(req(),env,{},owner,'learn')).status,400);
  assert.equal(env.answers.length,1);
});

test('general lesson questions include only visible objects and use the protected tutor path', async t => {
  const env = fixture(t), b = board();
  b.shapes.splice(0, 1); // No midpoint has been introduced yet.
  b.lesson.currentStage = 'equation';
  b.lesson.recentExplanations = ['The sigmoid formula maps x between zero and one.'];
  const snapshot = selectionSnapshot(b.editor, b.lesson, null);
  assert.equal(snapshot.target, null);
  assert.equal(snapshot.method, 'lesson');
  assert.equal(snapshot.relatedObjects.some(o => o.objectId === 'midpoint'), false);
  assert.equal(validateLessonSnapshot(snapshot), snapshot);
  env.apps.counter.canEdit = true;
  const req = () => request({ scope: { app: 'counter' }, message: 'Explain this step again', lesson_snapshot: snapshot });
  assert.equal((await handlers.apiAsk(req(), env, {}, owner, 'learn')).status, 200);
  assert.equal(env.answers[0].toolOpts, null);
  assert.equal(env.answers[0].system, LEARN_SYSTEM);
  assert.equal(JSON.parse(env.answers[0].context).lessonContext.currentStage, 'equation');
  env.apps.counter.canView = false;
  assert.equal((await handlers.apiAsk(req(), env, {}, owner, 'learn')).status, 403);
  assert.equal((await handlers.apiAsk(req(), env, {}, owner, 'agent')).status, 400);
  snapshot.method = 'invalid';
  assert.throws(() => validateLessonSnapshot(snapshot), /Invalid selected target/);
});

test('paused partial objects retain displayed text and drawing status', () => {
  const b = board();
  b.shapes[0].meta.renderStatus = 'drawing';
  b.shapes[0].type = 'text';
  b.shapes[0].props = { richText: { content: [{ content: [{ text: 'σ(0)' }] }] } };
  const snapshot = selectionSnapshot(b.editor, b.lesson, captureSelection(b.editor, b.lesson));
  assert.equal(snapshot.target.renderStatus, 'drawing');
  assert.equal(snapshot.target.shapes[0].displayedText, 'σ(0)');
  assert.equal(validateLessonSnapshot(snapshot), snapshot);
});

test('assistant canvas objects retain authorship and can be selected for follow-ups', () => {
  const b = board(); b.shapes[0].meta.author = 'assistant'; b.shapes[0].meta.kind = 'code';
  b.shapes[0].meta.originalText = 'return 1 / (1 + exp(-x))';
  const selected = captureSelection(b.editor, b.lesson);
  assert.ok(selected);
  const snapshot = selectionSnapshot(b.editor, b.lesson, selected);
  assert.equal(validateLessonSnapshot(snapshot).target.author, 'assistant');
  assert.equal(snapshot.target.kind, 'code');
});

test('paper questions attach the actual PDF, disable app actions, and validate access', async t => {
  const env = fixture(t);
  const body = { scope: { app: 'counter' }, message: 'Explain Figure 1', paper_context: { id: '1506.02640v5', page: 1 } };
  assert.equal((await handlers.apiAsk(request(body), env, {}, owner, 'learn')).status, 200);
  assert.equal(env.answers[0].blocks[0].source.url, 'https://arxiv.org/pdf/1506.02640v5');
  assert.equal(env.answers[0].toolOpts, null);
  assert.match(env.answers[0].context, /Test paper/);
  assert.equal((await handlers.apiAsk(request({ ...body, paper_context: { id: 'https://evil.test/paper', page: 1 } }), env, {}, owner, 'learn')).status, 400);
  assert.equal((await handlers.apiAsk(request(body), env, {}, owner, 'agent')).status, 400);
  env.apps.counter.canView = false;
  assert.equal((await handlers.apiAsk(request(body), env, {}, owner, 'learn')).status, 403);
  assert.equal(env.answers.length, 1);
});

// The lesson's structure is the one thing the model could not see: heading
// blocks live on the canvas and describeBlock has no branch for them.
test('the lesson outline reaches the model, with depth and what is done', async t => {
  const env = fixture(t);
  const outline = [
    { id: 'h1', level: 1, label: 'Attention', done: true },
    { id: 'h2', level: 2, label: 'Queries and keys', done: false },
    { id: 'h3', level: 1, label: 'Training', done: false },
  ];
  const response = await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'what sections are there?', outline }), env, {}, owner, 'learn');
  assert.equal(response.status, 200, await response.clone().text());
  const { context } = env.answers[0];
  assert.match(context, /table of contents/i);
  assert.match(context, /- \[x\] Attention/);
  assert.match(context, /  - \[ \] Queries and keys/, 'a sub-section is indented');
  assert.match(context, /- \[ \] Training/);
});

test('the outline tool is offered only when the lesson has sections', async t => {
  const env = fixture(t);
  const outline = [{ id: 'h1', level: 1, label: 'Attention', done: false }];
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi' }), env, {}, owner, 'learn');
  assert.deepEqual(env.answers[0].research.tools, [], 'nothing to restructure, nothing offered');
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', outline }), env, {}, owner, 'learn');
  assert.deepEqual(env.answers[1].research.tools.map(tool => tool.name), ['propose_lesson_outline']);
  assert.match(env.answers[1].research.system, /learner presses Apply/);
});

// The tool records; it never mutates. Canvas blocks are browser state and the
// worker cannot reach them, which is exactly why the learner has to apply.
test('calling the tool records a proposal and says it was not applied', async t => {
  const env = fixture(t);
  const outline = [{ id: 'h1', level: 1, label: 'Attention', done: false }];
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'add a section', outline }), env, {}, owner, 'learn');
  const { research } = env.answers[0];
  assert.equal(research.proposed(), null, 'nothing proposed until the tool is called');
  const result = await research.runTool('propose_lesson_outline', { ops: [{ op: 'add', text: 'Positional encoding', level: 1, after: 'h1' }] });
  assert.deepEqual(result, { proposed: 1, applied: false, note: 'Shown to the learner for approval. Say what you proposed.' });
  assert.deepEqual(research.proposed(), [{ op: 'add', text: 'Positional encoding', level: 1, after: 'h1' }]);
});

test('a second call in one answer is refused, and the first proposal survives', async t => {
  const env = fixture(t);
  const outline = [{ id: 'h1', level: 1, label: 'Attention', done: false }];
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'x', outline }), env, {}, owner, 'learn');
  const { research } = env.answers[0];
  await research.runTool('propose_lesson_outline', { ops: [{ op: 'retitle', id: 'h1', text: 'Self-attention' }] });
  await assert.rejects(() => research.runTool('propose_lesson_outline', { ops: [{ op: 'add', text: 'Other', level: 1 }] }), /one outline proposal/i);
  assert.equal(research.proposed()[0].text, 'Self-attention');
});

test('the tool cannot reach a heading the learner never sent', async t => {
  const env = fixture(t);
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'x', outline: [{ id: 'h1', level: 1, label: 'A', done: false }] }), env, {}, owner, 'learn');
  const { research } = env.answers[0];
  await assert.rejects(() => research.runTool('propose_lesson_outline', { ops: [{ op: 'retitle', id: 'somewhere-else', text: 'x' }] }), /No section/);
  await assert.rejects(() => research.runTool('some_other_tool', {}), /Unknown Learn tool/);
  assert.equal(research.proposed(), null);
});

test('a malformed outline is refused rather than half-read', async t => {
  const env = fixture(t);
  const bad = [
    'not an array at all',
    [{ id: 'h1', level: 4, label: 'Too deep', done: false }],
    [{ id: 'h1', level: 1, label: 'No done flag' }],
    [{ id: 'h1', level: 1, label: 'Twice', done: false }, { id: 'h1', level: 1, label: 'Twice', done: false }],
    [{ id: 'h1', level: 1, label: 'x'.repeat(201), done: false }],
    Array.from({ length: 61 }, (_, i) => ({ id: `h${i}`, level: 1, label: 'x', done: false })),
  ];
  for (const outline of bad) {
    assert.equal((await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', outline }), env, {}, owner, 'learn')).status, 400, JSON.stringify(outline).slice(0, 40));
  }
  assert.equal(env.answers.length, 0);
});

test('an outline outside Learn is refused; it is a Learn idea', async t => {
  const env = fixture(t);
  const outline = [{ id: 'h1', level: 1, label: 'Attention', done: false }];
  assert.equal((await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', outline }), env, {}, owner, 'agent')).status, 400);
});

test('no outline leaves the context exactly as it was', async t => {
  const env = fixture(t);
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi' }), env, {}, owner, 'learn');
  // the harness's appContext double answers with an object; production returns a string
  assert.doesNotMatch(String(JSON.stringify(env.answers[0].context)), /table of contents/i);
});

// A PDF the learner uploaded is private, so the model gets the bytes rather than
// a URL - but everything around it, the page especially, is the arXiv contract.
test('an uploaded PDF reaches the model as bytes, with the page the learner is on', async t => {
  const env = fixture(t);
  const pdf = new TextEncoder().encode('%PDF-1.4 uploaded');
  env.RUNS = {
    async get() { return { arrayBuffer: async () => pdf.buffer, customMetadata: { title: 'lecture-notes.pdf' } }; },
  };
  const body = { scope: { app: 'counter' }, message: 'Explain this page', paper_context: { id: 'upload:0123456789ab', page: 7 } };
  const response = await handlers.apiAsk(request(body), env, {}, owner, 'learn');
  assert.equal(response.status, 200, await response.clone().text());
  const [answer] = env.answers;
  const document = answer.blocks.find(block => block.type === 'document');
  assert.ok(document, 'the whole PDF is attached');
  assert.equal(document.source.type, 'base64', 'as bytes, not a public URL');
  assert.equal(document.source.media_type, 'application/pdf');
  assert.equal(new TextDecoder().decode(Uint8Array.from(atob(document.source.data), c => c.charCodeAt(0))), '%PDF-1.4 uploaded');
  assert.equal(document.title, 'lecture-notes.pdf');
  // The page is what the whole feature is for.
  assert.match(answer.context, /"page":7/);
  // The bytes must never ride on what is serialised back to the browser.
  assert.equal(JSON.stringify(answer.research).includes(document.source.data), false);
  assert.match(JSON.stringify(answer.research), /lecture-notes\.pdf/);
});

test('a malformed upload id is refused before anything is read', async t => {
  const env = fixture(t);
  env.RUNS = { async get() { throw new Error('should not be reached'); } };
  for (const id of ['upload:xyz', 'upload:0123456789abc', 'upload:../secret']) {
    assert.equal((await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', paper_context: { id, page: 1 } }), env, {}, owner, 'learn')).status, 400, id);
  }
  // and the page ceiling still holds for an upload
  assert.equal((await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', paper_context: { id: 'upload:0123456789ab', page: 101 } }), env, {}, owner, 'learn')).status, 400);
  assert.equal(env.answers.length, 0);
});

test('paper selection sends cropped pixels and page coordinates, rejecting invalid regions', async t => {
  const env = fixture(t);
  const selection = { region: { x: 0.2, y: 0.3, w: 0.4, h: 0.2 }, preview: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' };
  const body = { scope: { app: 'counter' }, message: 'Explain this section', paper_context: { id: '1506.02640v5', page: 2, selection } };
  assert.equal((await handlers.apiAsk(request(body), env, {}, owner, 'learn')).status, 200);
  assert.equal(env.answers[0].blocks[1].type, 'image');
  assert.equal(env.answers[0].blocks[1].source.type, 'base64');
  assert.match(env.answers[0].context, /selectedRegion/);
  assert.equal(env.answers[0].toolOpts, null);
  for (const bad of [{ ...selection, region: { ...selection.region, x: 0.9 } }, { ...selection, preview: 'https://example.test/private.png' }]) assert.equal((await handlers.apiAsk(request({ ...body, paper_context: { ...body.paper_context, selection: bad } }), env, {}, owner, 'learn')).status, 400);
  assert.equal(env.answers.length, 1);
});
