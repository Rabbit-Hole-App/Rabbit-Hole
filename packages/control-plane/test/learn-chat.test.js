import { paperSelectionImage } from '../src/learn-preview-review.js';
import { canvasSeed, threadTurns } from '../src/canvas-conversation.js';
import { arxivId, paperDocument } from '../src/arxiv.js';
import { OUTLINE_TOOL, OUTLINE_SYSTEM, validateOutlineOps } from '../src/learn-outline-tool.js';
import { SEARCH_WIKIPEDIA_TOOL, READ_WIKIPEDIA_TOOL, SHOW_WIKIPEDIA_TOOL, WIKI_SYSTEM, wikiTitle, validateShowWikipedia } from '../src/learn-wiki.js';
import { validateVideoContext, FIND_VIDEO_MOMENTS_TOOL, SHOW_VIDEO_TOOL, VIDEO_SYSTEM, validateShowVideo, videoSearchAvailable } from '../src/learn-youtube.js';
import { isUploadedPaperId, uploadedPaperAsDocument, paperIdentity, PAPER_PAGE_LIMIT } from '../src/learn-paper.js';
import { isUploadedMediaId } from '../src/learn-media.js';
import { LEARN_SYSTEM, LEARN_SNAPSHOT_SYSTEM, validateLessonSnapshot, validateOutline, renderOutline } from '../src/learn-context.js';
import { canvasApp, canvasAskSeam } from '../src/canvases.js';
import { validateLearnContext, validateCanvasTarget, appendCanvasTarget, appendOutline, readLearnSource } from '../src/learn-ask-context.js';
import { VIDEO_SHOWN_NOTE, WIKI_SHOWN_NOTE } from '../src/agents/learn-chat.js';
import { ATTACHMENT_LIMIT, attachmentBlocks, readAskRequest, askStream } from '../src/ask.js';
import { askModel, MESSAGE_LIMIT, MENTION_LIMIT, HISTORY_TURNS } from '../src/learn-models.js';
import { findVideoMoments, videoMomentTools } from '../src/learn-youtube.js';
import { liveDb, memoryBucket } from './live-storage-spy.js';
import { learnMedia } from '../src/learn-storage.js';
import { randomHex } from '../src/token.js';
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
    env.answers.push({ history: [...history], question, context, toolOpts, model, system, org, blocks, research, db: env.DB });
    await onFull('Answer: ' + question);
    return json(metadata);
  },
  askModel,
  MESSAGE_LIMIT,
  MENTION_LIMIT,
  HISTORY_TURNS,
  ATTACHMENT_LIMIT,
  attachmentBlocks,
  readAskRequest,
  learnMedia,
  randomHex,
  ASK_TOOLS: [],
  LEARN_SYSTEM,
  LEARN_SNAPSHOT_SYSTEM,
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
  isUploadedMediaId,
  // Shaped like the real one: bytes come back as an Anthropic image block.
  uploadedMediaAsImage: async (env, identity, id) => ({
    id, title: 'diagram.png',
    image: { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aWFtYXBuZw==' } },
  }),
  OUTLINE_TOOL,
  OUTLINE_SYSTEM,
  validateOutlineOps,
  canvasSeed,
  threadTurns,
  videoMomentTools,
  validateLearnContext,
  validateCanvasTarget,
  appendCanvasTarget,
  appendOutline,
  readLearnSource,
  validateVideoContext,
  FIND_VIDEO_MOMENTS_TOOL,
  SHOW_VIDEO_TOOL,
  VIDEO_SYSTEM,
  videoSearchAvailable,
  VIDEO_SHOWN_NOTE,
  WIKI_SHOWN_NOTE,
  validateShowVideo,
  // Shaped like the real one: one video with passages, one without.
  findVideoMoments: async query => ({
    videos: [
      { videoId: 'Ilg3gGewQ5U', title: 'Backprop, intuitively', channel: '3Blue1Brown', hasCaptions: true, hasPassages: true, duration: 767 },
      { videoId: 'FaHHWdsIYQg', title: 'Silent one', channel: null, hasCaptions: false, hasPassages: false, captionNote: 'no-track', duration: null },
    ],
    passages: [{ videoId: 'Ilg3gGewQ5U', title: 'Backprop, intuitively', start: 240, end: 300, text: '[4:12] backpropagation computes the gradient' }],
  }),
  SEARCH_WIKIPEDIA_TOOL,
  READ_WIKIPEDIA_TOOL,
  SHOW_WIKIPEDIA_TOOL,
  WIKI_SYSTEM,
  wikiTitle,
  validateShowWikipedia,
  searchWikipedia: async query => [{ title: 'Machine_learning', displayTitle: 'Machine learning', description: 'A field of study', url: 'https://en.wikipedia.org/wiki/Machine_learning' }],
  // Shaped like the real one: section 1 is History, anything else the contents
  // list does not name is refused, so the fallback to the lead is exercised.
  readWikipedia: async (title, section) => {
    const key = wikiTitle(title).title;
    const named = section == null || section === '' ? 0 : /^history$/i.test(String(section)) ? 1 : Number(section);
    if (named !== 0 && named !== 1) throw new Error(`No section ${JSON.stringify(String(section))} in ${key}`);
    return {
      title: key, displayTitle: key.replace(/_/g, ' '),
      section: named, sectionTitle: named === 0 ? 'Introduction' : 'History',
      toc: [{ index: 1, level: 1, title: 'History', anchor: 'History' }],
      text: named === 0 ? 'Lead text.' : 'History text.', truncated: false,
      url: `https://en.wikipedia.org/wiki/${key}`,
    };
  },
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
  for (const table of ['threads', 'messages', 'proposals']) db.exec(schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([^]*?\\n\\);`))[0]);
  return {
    ANTHROPIC_API_KEY: 'test-only', EXA_API_KEY: 'test-only', answers: [],
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

// C4 models-1: the picker key resolves through the allowlist; no key (Auto)
// or an unknown one reaches askStream as null, the server-side-fallback path.
test('a chat ask resolves its model key through the allowlist, and Auto or an unknown key is null', async t => {
  const env = fixture(t);
  for (const [model, expected] of [[undefined, null], ['sonnet-5', 'claude-sonnet-5'], ['gpt-5', null], ['constructor', null], ['__proto__', null]]) {
    await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'Hi', ...(model ? { model } : {}) }), env, {}, owner, 'learn');
    assert.equal(env.answers.at(-1).model, expected, String(model));
  }
});

test('Learn and Agent have separate histories and model context for the same app', async t => {
  const env = fixture(t);
  const agent = await (await send(env, 'agent', 'Agent question')).json();
  const learn = await (await send(env, 'learn', 'Learn question')).json();
  assert.notEqual(agent.threadId, learn.threadId);
  // Learn carries a research object; Agent carries none. It holds the outline
  // tool too now, offered only when the canvas actually has sections.
  assert.deepEqual(env.answers[1].research.papers, []);
  assert.equal(env.answers[1].research.tools.some(tool => tool.name === OUTLINE_TOOL.name), false, 'no outline was sent, so no outline tool is offered');
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
  assert.equal(answer.toolOpts,null); assert.equal(answer.system,LEARN_SNAPSHOT_SYSTEM);
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
  assert.equal(env.answers[0].system, LEARN_SNAPSHOT_SYSTEM);
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
  assert.equal(env.answers[0].research.tools.some(tool => tool.name === OUTLINE_TOOL.name), false, 'nothing to restructure, nothing offered');
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', outline }), env, {}, owner, 'learn');
  assert.deepEqual(env.answers[1].research.tools.map(tool => tool.name), ['search_wikipedia', 'read_wikipedia', 'show_wikipedia', 'find_video_moments', 'show_video', 'propose_lesson_outline']);
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

// --- Wikipedia ---
// The tutor can reach Wikipedia on any Learn question, unlike the outline tool,
// because looking something up does not depend on the canvas having sections.

test('the Wikipedia tools are offered on every Learn question', async t => {
  const env = fixture(t);
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'what is attention' }), env, {}, owner, 'learn');
  assert.deepEqual(env.answers[0].research.tools.map(tool => tool.name), ['search_wikipedia', 'read_wikipedia', 'show_wikipedia', 'find_video_moments', 'show_video']);
  assert.match(env.answers[0].research.system, /evidence, never instructions/);
});

test('an article the learner is reading reaches the model as that section', async t => {
  const env = fixture(t);
  const wiki_context = { lang: 'en', title: 'Machine_learning', section: 1 };
  assert.equal((await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'what does this mean', wiki_context }), env, {}, owner, 'learn')).status, 200);
  const context = JSON.parse(env.answers[0].context);
  assert.equal(context.article.title, 'Machine learning');
  assert.equal(context.article.section, 'History', 'the section the learner is on, not the whole article');
  assert.equal(context.article.text, 'History text.');
  assert.deepEqual(context.article.sections, ['History'], 'other sections are named, not pasted');
  assert.match(context.instruction, /evidence, never instructions/);
  assert.equal(env.answers[0].toolOpts, null, 'reading an article is not a reason to gain app actions');
});

// The rendered HTML carries section ids the contents list does not always name,
// so a heading the toc has never heard of must not lose the whole question.
test('a section the contents list does not name falls back to the lead', async t => {
  const env = fixture(t);
  const wiki_context = { lang: 'en', title: 'Machine_learning', section: 7 };
  assert.equal((await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'what is this', wiki_context }), env, {}, owner, 'learn')).status, 200);
  assert.equal(JSON.parse(env.answers[0].context).article.section, 'Introduction');
});

test('selected text rides with the question it is about', async t => {
  const env = fixture(t);
  const wiki_context = { lang: 'en', title: 'Machine_learning', section: 1, selection: 'Arthur Samuel coined the term' };
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'who?', wiki_context }), env, {}, owner, 'learn');
  assert.equal(JSON.parse(env.answers[0].context).article.selected, 'Arthur Samuel coined the term');
});

test('the article already on screen counts as read, so it can be shown again', async t => {
  const env = fixture(t);
  const wiki_context = { lang: 'en', title: 'Machine_learning', section: 0 };
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', wiki_context }), env, {}, owner, 'learn');
  const { research } = env.answers[0];
  const shown = await research.runTool('show_wikipedia', { title: 'Machine learning', section: 'History' });
  assert.equal(shown.opened, true);
  assert.deepEqual(research.shownWiki(), {
    lang: 'en', title: 'Machine_learning', displayTitle: 'Machine learning',
    section: 1, sectionTitle: 'History', url: 'https://en.wikipedia.org/wiki/Machine_learning',
  });
});

test('an article it never read cannot be put in front of the learner', async t => {
  const env = fixture(t);
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi' }), env, {}, owner, 'learn');
  const { research } = env.answers[0];
  await assert.rejects(() => research.runTool('show_wikipedia', { title: 'Quantum computing' }), /Read the article before showing it/);
  assert.equal(research.shownWiki(), null);
});

test('one article per answer; the second call is refused and the first survives', async t => {
  const env = fixture(t);
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi' }), env, {}, owner, 'learn');
  const { research } = env.answers[0];
  await research.runTool('read_wikipedia', { title: 'Machine learning' });
  await research.runTool('read_wikipedia', { title: 'Neural network' });
  await research.runTool('show_wikipedia', { title: 'Machine learning' });
  await assert.rejects(() => research.runTool('show_wikipedia', { title: 'Neural network' }), /One article per answer/);
  assert.equal(research.shownWiki().title, 'Machine_learning');
});

test('a fourth article is refused rather than reading the whole encyclopedia', async t => {
  const env = fixture(t);
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi' }), env, {}, owner, 'learn');
  const { research } = env.answers[0];
  for (const title of ['Machine learning', 'Neural network', 'Backpropagation']) await research.runTool('read_wikipedia', { title });
  await assert.rejects(() => research.runTool('read_wikipedia', { title: 'Gradient descent' }), /already read/);
  await assert.doesNotReject(() => research.runTool('read_wikipedia', { title: 'Machine learning', section: 'History' }), 'another section of one it has is fine');
});

test('a malformed Wikipedia context is refused before anything is fetched', async t => {
  const env = fixture(t);
  const bad = [
    { title: 'Special:Random', section: 0 },
    { title: 'https://example.com/wiki/X', section: 0 },
    { title: 'Machine_learning' },
    { title: 'Machine_learning', section: -1 },
    { title: 'Machine_learning', section: 1.5 },
    { title: 'Machine_learning', section: 0, selection: 'x'.repeat(2001) },
    { title: '', section: 0 },
  ];
  for (const wiki_context of bad) {
    assert.equal((await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', wiki_context }), env, {}, owner, 'learn')).status, 400, JSON.stringify(wiki_context));
  }
  assert.equal(env.answers.length, 0);
});

test('Wikipedia context outside Learn is refused; it is a Learn idea', async t => {
  const env = fixture(t);
  const body = { scope: { app: 'counter' }, message: 'hi', wiki_context: { title: 'Machine_learning', section: 0 } };
  assert.equal((await handlers.apiAsk(request(body), env, {}, owner, 'agent')).status, 400);
  assert.equal(env.answers.length, 0);
});


// --- YouTube moments (phase 1: display only, no transcript) ---

test('a video the learner is watching reaches the model as a window, not a transcript', async t => {
  const env = fixture(t);
  const video_context = { videoId: 'Ilg3gGewQ5U', start: 252, end: 338, title: 'Backpropagation, intuitively' };
  assert.equal((await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'what is he showing here?', video_context }), env, {}, owner, 'learn')).status, 200);
  const context = JSON.parse(env.answers[0].context);
  assert.equal(context.video.title, 'Backpropagation, intuitively');
  assert.equal(context.video.window, '4:12 to 5:38');
  assert.match(context.video.url, /watch\?v=Ilg3gGewQ5U&t=252s/);
  assert.match(context.instruction, /not read its transcript yet.*never invent quotes/);
  assert.equal(env.answers[0].toolOpts, null, 'watching a video is not a reason to gain app actions');
});

test('a reader outranks a video card: paper context wins when both ride', async t => {
  const env = fixture(t);
  const body = {
    scope: { app: 'counter' }, message: 'hi',
    paper_context: { id: '1706.03762', page: 2 },
    video_context: { videoId: 'Ilg3gGewQ5U', start: 0 },
  };
  assert.equal((await handlers.apiAsk(request(body), env, {}, owner, 'learn')).status, 200);
  const context = JSON.parse(env.answers[0].context);
  assert.equal(context.video, undefined, 'one context at a time');
  assert.ok(context.paper);
});

test('an open article also outranks a video card', async t => {
  const env = fixture(t);
  const body = {
    scope: { app: 'counter' }, message: 'hi',
    wiki_context: { title: 'Machine_learning', section: 1 },
    video_context: { videoId: 'Ilg3gGewQ5U', start: 0 },
  };
  assert.equal((await handlers.apiAsk(request(body), env, {}, owner, 'learn')).status, 200);
  const context = JSON.parse(env.answers[0].context);
  assert.equal(context.video, undefined, 'one context at a time');
  assert.equal(context.article.title, 'Machine learning');
});

test('a malformed video context is refused before anything is sent', async t => {
  const env = fixture(t);
  for (const video_context of [
    { videoId: 'nope' },
    { videoId: 'Ilg3gGewQ5U', start: 90, end: 10 },
    { videoId: 'https://evil.example/watch?v=Ilg3gGewQ5U' },
    null,
  ]) {
    assert.equal((await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', video_context }), env, {}, owner, 'learn')).status, 400, JSON.stringify(video_context));
  }
  assert.equal(env.answers.length, 0);
});

test('video context outside Learn is refused; it is a Learn idea', async t => {
  const env = fixture(t);
  const body = { scope: { app: 'counter' }, message: 'hi', video_context: { videoId: 'Ilg3gGewQ5U', start: 0 } };
  assert.equal((await handlers.apiAsk(request(body), env, {}, owner, 'agent')).status, 400);
  assert.equal(env.answers.length, 0);
});

// --- the tutor finds and shows a moment (phase 2) ---

test('show_video takes a window only from passages the answer actually read', async t => {
  const env = fixture(t);
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi' }), env, {}, owner, 'learn');
  const { research } = env.answers[0];
  await research.runTool('find_video_moments', { query: 'backpropagation' });
  const shown = await research.runTool('show_video', { videoId: 'Ilg3gGewQ5U', start: 252, end: 338, reason: 'shows the update rule' });
  assert.equal(shown.opened, true);
  assert.deepEqual(research.shownVideo(), { videoId: 'Ilg3gGewQ5U', title: 'Backprop, intuitively', start: 252, end: 338, unverified: false, confidence: null, reason: 'shows the update rule' });
});

test('a video never searched for cannot be shown', async t => {
  const env = fixture(t);
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi' }), env, {}, owner, 'learn');
  const { research } = env.answers[0];
  await assert.rejects(() => research.runTool('show_video', { videoId: 'aircAruvnKk', start: 0, end: 60 }), /from this answer/);
  assert.equal(research.shownVideo(), null);
});

test('a captionless video is shown without a window, never with an invented one', async t => {
  const env = fixture(t);
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi' }), env, {}, owner, 'learn');
  const { research } = env.answers[0];
  await research.runTool('find_video_moments', { query: 'backpropagation' });
  await assert.rejects(() => research.runTool('show_video', { videoId: 'FaHHWdsIYQg', start: 10, end: 70 }), /without a window/);
  const shown = await research.runTool('show_video', { videoId: 'FaHHWdsIYQg' });
  assert.equal(shown.opened, true);
  assert.equal(research.shownVideo().unverified, true);
});

test('one video per answer; the second is refused and the first survives', async t => {
  const env = fixture(t);
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi' }), env, {}, owner, 'learn');
  const { research } = env.answers[0];
  await research.runTool('find_video_moments', { query: 'backpropagation' });
  await research.runTool('show_video', { videoId: 'Ilg3gGewQ5U', start: 252, end: 338 });
  await assert.rejects(() => research.runTool('show_video', { videoId: 'FaHHWdsIYQg' }), /One video per answer/);
  assert.equal(research.shownVideo().videoId, 'Ilg3gGewQ5U');
});

test('the card the learner is watching counts as found, but only window-less', async t => {
  const env = fixture(t);
  const video_context = { videoId: 'aircAruvnKk', start: 30, title: 'NN chapter 1' };
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', video_context }), env, {}, owner, 'learn');
  const { research } = env.answers[0];
  const shown = await research.runTool('show_video', { videoId: 'aircAruvnKk' });
  assert.equal(shown.opened, true);
  await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi again', video_context }), env, {}, owner, 'learn');
  await assert.rejects(() => env.answers[1].research.runTool('show_video', { videoId: 'aircAruvnKk', start: 40, end: 100 }), /without a window/);
});

test('canvas Learn asks keep their threads in LEARN_DB and never touch the live DB', async t => {
  const env = fixture(t);
  env.DB = { prepare: sql => { throw new Error(`live D1 touched: ${sql}`); }, batch: async () => { throw new Error('live D1 touched: batch'); } };
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  env.LEARN_DB = { batch: async statements => Promise.all(statements.map(statement => statement.run())), prepare: sql => ({ bind: (...params) => ({
    first: async () => sqlite.prepare(sql).get(...params) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => ({ meta: sqlite.prepare(sql).run(...params) }),
  }) }) };
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('workspace-a','canvas-0a1b2c3d','owner@example.test','Attention'),('workspace-a','canvas-99999999','owner@example.test','Other')");
  const ask = (name, body, user = owner) => handlers.apiAsk(request({ scope: { app: name }, ...body }), env, {}, user, 'learn',
    canvasAskSeam(env, canvasApp(sqlite.prepare('SELECT * FROM canvases WHERE name=?').get(name), user)));
  const first = await (await ask('canvas-0a1b2c3d', { message: 'What is attention?' })).json();
  assert.match(String(first.threadId), /^canvaschat-/);
  assert.match(env.answers[0].context, /canvas "Attention"/);
  assert.equal(env.answers[0].system, LEARN_SYSTEM);
  assert.equal(env.answers[0].db, env.LEARN_DB, 'askStream gets LEARN_DB, so its moment log cannot reach live D1');
  assert.equal((await ask('canvas-0a1b2c3d', { message: 'And softmax?', thread_id: first.threadId })).status, 200);
  assert.deepEqual(env.answers[1].history.map(m => m.content), ['What is attention?', 'Answer: What is attention?']);
  await ask('canvas-0a1b2c3d', { message: 'Explain further', canvas_seed: { question: 'Q', answer: 'A' } });
  assert.deepEqual(env.answers[2].history.map(m => m.content), ['Q', 'A']);
  assert.equal((await ask('canvas-99999999', { message: 'Wrong canvas', thread_id: first.threadId })).status, 409);
  assert.equal((await ask('canvas-0a1b2c3d', { message: 'Not mine', thread_id: first.threadId }, { ...owner, email: 'colleague@example.test' })).status, 404);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM threads WHERE scope_ref='canvas-0a1b2c3d'").get().n, 2);
  assert.equal(env.answers.length, 3);
});

// C1: the same canvas turn with the real askStream and findVideoMoments, the video tools called
// and the hot path bound (AI, MOMENTS). The runTool closes over apiAsk's own env, so the proof
// is that the live DB spy records nothing: no moment log, no hot-path read.
test('a canvas video answer with the real moment code never reads or writes the live DB', async t => {
  const env = fixture(t), live = liveDb(), original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('workspace-a','canvas-0a1b2c3d','owner@example.test','Backprop')");
  Object.assign(env, {
    DB: live, LEARN_MEDIA: memoryBucket(), EXA_API_KEY: 'test',
    LEARN_DB: { batch: async statements => Promise.all(statements.map(statement => statement.run())), prepare: sql => { const statement = sqlite.prepare(sql); return { bind: (...params) => ({
      first: async () => statement.get(...params) || null,
      all: async () => ({ results: statement.all(...params) }),
      run: async () => ({ meta: statement.run(...params) }),
    }) }; } },
    AI: { run: async (model, { text }) => ({ data: text.map(() => [0.1, 0.2]) }) },
    MOMENTS: { query: async (vector, options) => (options.namespace?.startsWith('questions:') ? { matches: [{ id: 'q:7', score: 0.99, metadata: { momentId: 7 } }] } : { matches: [] }) },
  });
  const replies = [{ content: [{ type: 'tool_use', id: 'find', name: 'find_video_moments', input: { query: 'backprop' } }] }, { content: [{ type: 'tool_use', id: 'show', name: 'show_video', input: { videoId: 'Ilg3gGewQ5U' } }] }, { content: [{ type: 'text', text: 'Watch the chain rule.' }], stop_reason: 'end_turn' }];
  globalThis.fetch = async url => {
    const host = new URL(String(url)).hostname;
    if (host === 'api.exa.ai') return Response.json({ results: [{ url: 'https://www.youtube.com/watch?v=Ilg3gGewQ5U', title: 'Backprop' }] });
    if (host === 'api.anthropic.com') return Response.json(replies.shift());
    return new Response('', { status: 404 });
  };
  const real = new Function(...Object.keys(deps), `${functions}; return { ${names.join(',')} };`)(...Object.values({ ...deps, askStream, findVideoMoments }));
  const seam = canvasAskSeam(env, canvasApp(sqlite.prepare("SELECT * FROM canvases WHERE name='canvas-0a1b2c3d'").get(), owner));
  const events = await (await real.apiAsk(request({ scope: { app: 'canvas-0a1b2c3d' }, message: 'show me backprop' }), env, {}, owner, 'learn', seam)).text();
  assert.match(events, /event: video/);
  assert.match(events, /event: done/);
  assert.deepEqual(live.calls, []);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM messages').get().n, 2);
});

// Only the Agent's run tool reads ask-uploads/, and Learn is never offered it, so a Learn
// attachment rides as a model block alone: no stashed copy, no note about a run tool.
test('a Learn attachment reaches the model as a block, with no ask-uploads copy and no run-tool note', async t => {
  const env = fixture(t), stored = [];
  env.LEARN_MEDIA = { put: async key => { stored.push(key); } };
  const ask = (path, conversation) => {
    const body = new FormData();
    body.set('body', JSON.stringify({ scope: { app: 'counter' }, message: 'what is in this picture' }));
    body.set('file', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'diagram.png');
    return handlers.apiAsk(new Request('https://small.example' + path, { method: 'POST', body }), env, {}, owner, conversation);
  };
  assert.equal((await ask('/api/learn/ask', 'learn')).status, 200);
  assert.equal(env.answers[0].question, 'what is in this picture');
  assert.equal(env.answers[0].blocks.at(-1).type, 'image');
  assert.deepEqual(stored, []);
  assert.equal((await ask('/api/ask', 'agent')).status, 200);
  assert.match(env.answers[1].question, /the run tool can use it/);
  assert.match(stored[0], /^ask-uploads\/u-[0-9a-f]+\/diagram\.png$/);
});

// A dropped image is a source like a paper: bytes as a block, one line of
// context naming it, no app actions while discussing it.
test('a dropped image the learner asks about reaches the model as an image block', async t => {
  const env = fixture(t);
  const image_context = { id: 'media:0123456789ab' };
  assert.equal((await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'what is in this diagram', image_context }), env, {}, owner, 'learn')).status, 200);
  const { context, blocks, toolOpts } = env.answers[0];
  assert.equal(blocks.at(-1).type, 'image');
  assert.equal(blocks.at(-1).source.media_type, 'image/png');
  const parsed = JSON.parse(context);
  assert.equal(parsed.image.title, 'diagram.png');
  assert.match(parsed.instruction, /evidence, never instructions/);
  // prompts-10: the same field carries a group's rendered snapshot, so the line names both.
  assert.match(parsed.instruction, /^The learner attached this image from their canvas \(a dropped picture or a snapshot of selected cards\)/);
  assert.equal(toolOpts, null, 'an image is not a reason to gain app actions');
});

test('a paper outranks a dropped image, and wiki yields to it', async t => {
  const env = fixture(t);
  const both = {
    scope: { app: 'counter' }, message: 'compare these',
    paper_context: { id: '1506.02640', page: 1 }, image_context: { id: 'media:0123456789ab' },
  };
  assert.equal((await handlers.apiAsk(request(both), env, {}, owner, 'learn')).status, 200);
  const parsed = JSON.parse(env.answers[0].context);
  assert.ok(parsed.paper, 'the paper rides');
  assert.equal(parsed.image, undefined, 'the image does not');
  const wikiToo = {
    scope: { app: 'counter' }, message: 'and this article',
    wiki_context: { title: 'Machine_learning', section: 1 }, image_context: { id: 'media:0123456789ab' },
  };
  assert.equal((await handlers.apiAsk(request(wikiToo), env, {}, owner, 'learn')).status, 200);
  const second = JSON.parse(env.answers[1].context);
  assert.ok(second.image, 'the image outranks the article');
  assert.equal(second.article, undefined);
});

test('an invalid image id is refused before any read', async t => {
  const env = fixture(t);
  for (const id of ['upload:0123456789ab', 'media:xyz', '../secret', 42, null]) {
    const res = await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', image_context: { id } }), env, {}, owner, 'learn');
    assert.equal(res.status, 400, JSON.stringify(id));
  }
  assert.equal((await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', image_context: { id: 'media:0123456789ab' } }), env, {}, owner, 'app')).status, 400, 'learn only');
});

// C5 context-1: an explanation card at the schema maximum (learn-primitives.js), described as
// LearningBlocks.jsx describeBlock does and wrapped as ask.jsx did before canvas_target.
const LONG_CARD = [`Explanation: ${'T'.repeat(120)}`, 'b'.repeat(2000), ...[1, 2, 3].map(n => `[${'L'.repeat(40)}] ${String(n).repeat(800)}`)].join('\n');
const wrappedCardQuestion = question => `Question about this Explanation block on the lesson canvas:\n${LONG_CARD}\n\nLearner question: ${question}`;
test('a long card wrapped into the message is refused by the 4000-character limit (context-1)', async t => {
  const env = fixture(t);
  assert.ok(wrappedCardQuestion('why?').length > 4000);
  const res = await send(env, 'learn', wrappedCardQuestion('why?'));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'message required (max 4000 chars)' });
});

// duplication-14: apiAsk reads JSON and multipart through readAskRequest; a file over 4 MB is refused.
test('a multipart ask with a file over 4 MB is refused before the model', async t => {
  const env = fixture(t), body = new FormData();
  body.set('body', JSON.stringify({ scope: { app: 'counter' }, message: 'what is this' }));
  body.set('file', new Blob([new Uint8Array(ATTACHMENT_LIMIT + 1)], { type: 'image/png' }), 'big.png');
  const res = await handlers.apiAsk(new Request('https://small.example/api/learn/ask', { method: 'POST', body }), env, {}, owner, 'learn');
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'attachment too large - 4 MB max' });
  assert.equal(env.answers.length, 0);
});

// Owner decision 2 (context-1): the card rides as canvas_target, bounded apart from the question.
test('a canvas_target card rides as its own bounded context section; the message stays the question', async t => {
  const env = fixture(t);
  const ask = body => handlers.apiAsk(request({ scope: { app: 'counter' }, ...body }), env, {}, owner, 'learn');
  const res = await ask({ message: 'why?', canvas_target: { id: 'block-1', kind: 'Explanation', title: 'T'.repeat(120), text: LONG_CARD } });
  assert.equal(res.status, 200);
  const { question, context } = env.answers[0];
  assert.equal(question, 'why?');
  assert.ok(context.includes(JSON.stringify(LONG_CARD)), 'the whole card, under the bound, reaches the model');
  assert.match(context, /"id":"block-1"/);
  assert.match(context, /untrusted/);
  assert.doesNotMatch(context, /truncated/);
  const { threadId } = await res.json();
  assert.deepEqual((await (await handlers.apiAskThread(env, owner, threadId)).json()).messages[0].content, 'why?');
  await ask({ message: 'and this?', canvas_target: { id: 'block-2', kind: 'Table', title: 'Big', text: 'x'.repeat(9000) } });
  assert.ok(env.answers[1].context.includes(`"text":"${'x'.repeat(8000)}"`));
  assert.doesNotMatch(env.answers[1].context, /x{8001}/);
  assert.match(env.answers[1].context, /\[card text truncated: showing 8000 of 9000 characters\]/);
  const legacy = `Question about this Explanation block on the lesson canvas:\n${'b'.repeat(3000)}\n\nLearner question: why?`;
  assert.equal((await ask({ message: legacy })).status, 200, 'old wrapped messages under the limit still work');
  for (const canvas_target of [null, 'card', { id: '', kind: 'Explanation', text: 'x' }, { id: 'b', kind: 'Explanation', text: '' }, { id: 'b', kind: 'Explanation', text: 'x'.repeat(32001) }, { id: 'b', kind: 'Explanation', title: 7, text: 'x' }]) {
    assert.equal((await ask({ message: 'q', canvas_target })).status, 400, JSON.stringify(canvas_target)?.slice(0, 60));
  }
  assert.equal((await handlers.apiAsk(request({ scope: { app: 'counter' }, message: 'q', canvas_target: { id: 'b', kind: 'Explanation', text: 'x' } }), env, {}, owner, 'agent')).status, 400, 'learn only');
});

test('a canvas seam thread is titled by the learner question, not the card', async t => {
  const env = fixture(t);
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  env.LEARN_DB = { batch: async statements => Promise.all(statements.map(statement => statement.run())), prepare: sql => ({ bind: (...params) => ({
    first: async () => sqlite.prepare(sql).get(...params) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => ({ meta: sqlite.prepare(sql).run(...params) }),
  }) }) };
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('workspace-a','canvas-0a1b2c3d','owner@example.test','Attention')");
  const seam = canvasAskSeam(env, canvasApp(sqlite.prepare("SELECT * FROM canvases WHERE name='canvas-0a1b2c3d'").get(), owner));
  const res = await handlers.apiAsk(request({ scope: { app: 'canvas-0a1b2c3d' }, message: 'why?', canvas_target: { id: 'block-1', kind: 'Explanation', title: 'Softmax', text: LONG_CARD } }), env, {}, owner, 'learn', seam);
  assert.equal(res.status, 200);
  assert.equal(sqlite.prepare('SELECT title FROM threads').get().title, 'why?');
  assert.match(env.answers[0].context, /canvas "Attention"/);
  assert.match(env.answers[0].context, /"title":"Softmax"/);
});

// context-14: switching every Sources toggle off sends [], which is a choice, not "everything".
test('an empty sources list reads no toggleable section; no sources field still reads them all', async t => {
  const env = fixture(t), uses = [];
  const recorded = new Function(...Object.keys(deps), `${functions}; return { ${names.join(',')} };`)(...Object.values({ ...deps, appContext: async (env, app, use) => { uses.push(use); return `APP ${app.name}`; } }));
  await recorded.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', sources: [] }), env, {}, owner, 'agent');
  await recorded.apiAsk(request({ scope: { app: 'counter' }, message: 'hi' }), env, {}, owner, 'agent');
  await recorded.apiAsk(request({ scope: { app: 'counter' }, message: 'hi', sources: ['runs'] }), env, {}, owner, 'agent');
  assert.deepEqual(uses.map(use => use && [...use]), [[], null, ['runs']]);
});
