// A dropped Markdown or PDF starts the Tutor (roadmap-unplug-spec.md section B): its text is cut into sections that the repository tools and the anchors checks read, its overview is
// built once by its text's hash with no research tools, one document starts a canvas's Tutor, and the Learn actions read the document where they read a repository. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { scripted, toolUse } from './learn-section-fixture.js';
import { codebaseRoute } from '../src/learn-codebase-source-map.js';
import { canvasApp } from '../src/canvases.js';
import { SUBMIT_OVERVIEW_TOOL } from '../src/learn-index.js';
import { canvasDocument, documentDigest, documentSnapshot, loadDocumentSnapshot, runDocumentIndex, sectionsOf, sha256 } from '../src/learn-document.js';
import { repositoryAnchors } from '../src/learn-section-brief.js';
import { repositoryTool } from '../src/repository-context.js';
import { composeTutorPrompt } from '../src/tutor-prompt.js';
import { fileRole } from '../../web/src/learn-codebase-goals.js';

const MD = '# Gradient descent\n\nA way to find a minimum.\n\n## The step\n\nMove against the slope.\n\n```\n# not a heading\n```\n\n## The step\n\nAgain.\n\n## Learning rate\n\nHow far one step goes.\n';
const OVERVIEW = {
  summary: 'A short note on how gradient descent finds a minimum by repeated small steps.',
  options: [
    { id: 'the-step', label: 'The step itself', what: 'How one step moves against the slope.', anchors: ['#the-step', '#gradient-descent'], kind: 'algorithm' },
    { id: 'step-size', label: 'How far a step goes', what: 'How the learning rate sets the size of a step.', anchors: ['#learning-rate'], kind: 'practice' },
  ],
  cannot: [],
};
const CANVAS = 'canvas-0000dddd', ORG = 'ws';
function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t), stored = new Map();
  const env = { SMALL_ENV: 'test', ANTHROPIC_API_KEY: 'test-only', LEARN_DB, REPOSITORY_SNAPSHOTS: {
    get: async key => (stored.has(key) ? { json: async () => JSON.parse(stored.get(key)) } : null), head: async key => (stored.has(key) ? { key } : null), put: async (key, value) => stored.set(key, value) } };
  sqlite.exec(`INSERT INTO canvases(org,name,owner_email,title) VALUES('${ORG}','${CANVAS}','ana@test','Notes');`);
  const access = { org: ORG, email: 'ana@test', user_id: 'u-ana' };
  return { env, sqlite, stored, access };
}
const rows = f => f.sqlite.prepare('SELECT status, usd FROM repository_index').all().map(r => ({ ...r }));

test('markdown is cut at its headings (a fenced # is not one, a repeated heading gets its own anchor) and a pdf at its pages', () => {
  const sections = sectionsOf({ kind: 'markdown', name: 'notes.md', text: MD });
  assert.deepEqual(sections.map(s => s.key), ['#gradient-descent', '#the-step', '#the-step-2', '#learning-rate']);
  assert.match(sections[1].text, /^## The step\n/);
  assert.match(sections[1].text, /not a heading/, 'a fenced line stays in its section');
  assert.deepEqual(sectionsOf({ kind: 'markdown', name: 'x.md', text: 'Just words.\nNo headings.' }).map(s => s.key), ['#document']);
  assert.deepEqual(sectionsOf({ kind: 'markdown', name: 'x.md', text: 'Intro words\n# Title\nbody' }).map(s => s.key), ['#start', '#title']);
  assert.deepEqual(sectionsOf({ kind: 'markdown', name: 'x.md', text: '# Learn mode (owner 2026-11-18 15:19 to 15:38) the walk is a layout\nbody' }).map(s => s.key), ['#learn-mode-owner-2026-11-18-15-19-to-15'], 'a long heading is cut with no trailing dash');
  assert.deepEqual(sectionsOf({ kind: 'pdf', name: 'p.pdf', pages: ['one', '   ', 'three'] }).map(s => [s.key, s.title]), [['p.1', 'Page 1'], ['p.3', 'Page 3']]);
});

test('the snapshot of a document is read by the repository tools and the anchors checks as a repository is', async () => {
  const sha = await sha256(MD), snapshot = documentSnapshot({ sha, name: 'notes.md', kind: 'markdown', sections: sectionsOf({ kind: 'markdown', name: 'notes.md', text: MD }) });
  assert.deepEqual([snapshot.repo, snapshot.commit], [`file:${sha}`, sha]);
  assert.match(repositoryTool(snapshot, 'read_source', { path: '#learning-rate', start: 1, end: 3 }).content, /How far one step goes/);
  assert.ok(repositoryTool(snapshot, 'search_code', { query: 'slope' }).matches.some(m => m.path === '#the-step'));
  const exists = repositoryAnchors(snapshot);
  assert.ok(exists('#the-step') && exists('#the-step:1-3') && !exists('#nowhere') && !exists('p.3'));
  assert.equal(fileRole('#the-step'), 'source');
  assert.equal(fileRole('p.3'), 'source');
  const pdf = documentSnapshot({ sha, name: 'paper.pdf', kind: 'pdf', sections: sectionsOf({ kind: 'pdf', pages: ['alpha', 'beta'] }) });
  assert.ok(repositoryAnchors(pdf)('p.2') && repositoryTool(pdf, 'read_source', { path: 'p.2' }).content.includes('beta'));
});

test('the digest is deterministic: the outline first with each anchor, then the text, cut at 24 KB', async () => {
  const sha = await sha256(MD), make = text => documentSnapshot({ sha, name: 'notes.md', kind: 'markdown', sections: sectionsOf({ kind: 'markdown', name: 'notes.md', text }) });
  assert.equal(documentDigest(make(MD)), documentDigest(make(MD)));
  const text = documentDigest(make(MD));
  assert.match(text, /^Document: notes\.md \(Markdown, 4 sections\)\n\nOutline/);
  assert.ok(text.indexOf('#learning-rate | Learning rate') < text.indexOf('Text (the first 24 KB'), 'the outline comes first');
  const big = documentDigest(make(`# Big\n${'word '.repeat(20000)}`));
  assert.ok(big.length < 27 * 1024, 'the text is cut');
});

test('a dropped markdown file: stored by its hash, recorded as the canvas document, its overview built with no research tools and read free the second time', async t => {
  const f = setup(t), callModel = scripted(toolUse(SUBMIT_OVERVIEW_TOOL.name, OVERVIEW));
  const res = await runDocumentIndex(f.env, { access: f.access, canvas: CANVAS, blockId: 'b1' }, { layer: 'overview', source: { kind: 'markdown', name: 'notes.md', text: MD } }, { callModel });
  const body = await res.json(), sha = await sha256(MD);
  assert.deepEqual([res.status, body.status, body.index.options.map(o => o.id)], [200, 'ready', ['the-step', 'step-size']]);
  assert.deepEqual(body.repository, { app: CANVAS, repo: `file:${sha}`, commit: sha, name: 'notes.md', kind: 'markdown' });
  assert.deepEqual(callModel.calls[0].body.tools.map(tool => tool.name), [SUBMIT_OVERVIEW_TOOL.name], 'a document is read in one turn: no research tools');
  assert.match(callModel.calls[0].body.system[0]?.text ?? callModel.calls[0].body.system, /You index a document for a learner/);
  assert.ok(body.index.meta.usd > 0);
  assert.deepEqual([...f.stored.keys()].sort(), [`learn-repositories-dev/shared/files/${sha}/index/overview.json`, `learn-repositories-dev/shared/files/${sha}/text.json`]);
  assert.deepEqual(f.sqlite.prepare('SELECT repo, commit_sha, layer, status FROM repository_index').all().map(r => ({ ...r })), [{ repo: `file:${sha}`, commit_sha: sha, layer: 'overview', status: 'ready' }]);
  assert.deepEqual({ ...f.sqlite.prepare('SELECT sha, kind, name, block_id FROM canvas_document WHERE app=?').get(CANVAS) }, { sha, kind: 'markdown', name: 'notes.md', block_id: 'b1' });
  const doc = await canvasDocument(f.env, f.access, CANVAS);
  assert.deepEqual([doc.repo, doc.name, doc.kind], [`file:${sha}`, 'notes.md', 'markdown']);
  assert.ok(Object.hasOwn((await loadDocumentSnapshot(f.env, doc)).files, '#learning-rate'), 'the Learn actions read the stored text');
  const again = await runDocumentIndex(f.env, { access: f.access, canvas: CANVAS }, { layer: 'overview', source: { kind: 'markdown', name: 'notes.md', text: MD } }, { callModel: scripted() });
  assert.deepEqual([(await again.json()).status, rows(f).length], ['ready', 1], 'no model call the second time');
});

test('a pdf comes as its pages; one document per canvas: a different file is ignored, never a second Tutor', async t => {
  const f = setup(t), pdf = { kind: 'pdf', name: 'paper.pdf', pages: ['Page one text about attention.', 'Page two text about heads.'] };
  const ok = await runDocumentIndex(f.env, { access: f.access, canvas: CANVAS }, { layer: 'overview', source: pdf }, { callModel: scripted(toolUse(SUBMIT_OVERVIEW_TOOL.name, { ...OVERVIEW, options: [{ ...OVERVIEW.options[0], id: 'attention', label: 'What attention does', anchors: ['p.1', 'p.2'] }] })) });
  assert.equal((await ok.json()).status, 'ready');
  const second = await runDocumentIndex(f.env, { access: f.access, canvas: CANVAS }, { layer: 'overview', source: { kind: 'markdown', name: 'other.md', text: MD } }, { callModel: scripted() });
  assert.deepEqual(await second.json(), { status: 'ignored', reason: 'one_document_per_canvas' });
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM canvas_document').get().n, 1);
});

test('the body is checked: a kind, a name, text or pages, and the overview layer', async t => {
  const f = setup(t), run = (source, layer = 'overview') => runDocumentIndex(f.env, { access: f.access, canvas: CANVAS }, { layer, source });
  for (const source of [null, { kind: 'docx', name: 'a', text: 'x' }, { kind: 'markdown', name: '', text: 'x' }, { kind: 'markdown', name: 'a.md', text: '   ' }, { kind: 'markdown', name: 'a.md', text: 'x'.repeat(512 * 1024 + 1) },
    { kind: 'pdf', name: 'a.pdf', pages: [] }, { kind: 'pdf', name: 'a.pdf', pages: Array.from({ length: 401 }, () => 'x') }, { kind: 'pdf', name: 'a.pdf', pages: [1, 2] }]) assert.equal((await run(source)).status, 400, JSON.stringify(source).slice(0, 60));
  assert.equal((await run({ kind: 'markdown', name: 'a.md', text: 'x' }, 'topic')).status, 400);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM canvas_document').get().n, 0, 'nothing stored for a refused body');
});

test('the document prompt is the repository one with the source paragraphs swapped: the rules after them are the same', () => {
  const repo = composeTutorPrompt({ task: 'learn-index', use: 'learn_concept' }).text, doc = composeTutorPrompt({ task: 'learn-index-document', use: 'learn_concept' }).text;
  const tail = text => text.slice(text.indexOf('summary:'));
  assert.match(doc, /dropped on the canvas/);
  assert.notEqual(repo, doc);
  assert.match(tail(doc), /^summary: one or two plain sentences/);
  assert.match(tail(doc), /Write in plain words\. A name from the document may appear in backticks\. Never a path, a file name or a flag/);
  assert.match(tail(repo), /Write in plain words\. A name from the code may appear in backticks\. Never a path, a file name or a flag/);
});

test('the route: a drop starts the Tutor, a reload finds it, and the Learn actions read the document where they read a repository', async t => {
  const f = setup(t), deps = {}, realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('no network in this test'); }; t.after(() => { globalThis.fetch = realFetch; });
  const user = { email: 'ana@test', org: ORG, orgName: null }, access = () => ({ ...canvasApp(f.sqlite.prepare('SELECT * FROM canvases WHERE name = ?').get(CANVAS), user), user_id: 'u-ana' });
  const call = (method, body) => codebaseRoute('/api/learn/codebase', new Request(`https://dev.test/api/learn/codebase${method === 'GET' ? `?app=${CANVAS}&board=main` : ''}`, { method, headers: { 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify({ app: CANVAS, board: 'main', ...body }) } : {}) }), f.env, { authorize: async () => access(), ...deps });
  const none = await (await call('GET')).json();
  assert.equal(none.repository, null, 'before a drop: no source');
  deps.callModel = scripted(toolUse(SUBMIT_OVERVIEW_TOOL.name, OVERVIEW));
  const dropped = await call('POST', { action: 'learn_index', layer: 'overview', source: { kind: 'markdown', name: 'notes.md', text: MD, blockId: 'blk-1' } });
  assert.equal(dropped.status, 200); assert.equal((await dropped.json()).status, 'ready');
  const sha = await sha256(MD), found = (await (await call('GET')).json()).repository;
  assert.deepEqual(found, { app: CANVAS, repo: `file:${sha}`, commit: sha, name: 'notes.md', kind: 'markdown' }, 'a reload finds the document');
  deps.callModel = scripted();
  const again = await (await call('POST', { action: 'learn_index', layer: 'overview' })).json();
  assert.deepEqual([again.status, again.index.options.length], ['ready', 2], 'a reload reads the stored overview with no source and no model call');
  deps.callModel = scripted({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'Gradient descent moves against the slope, one small step at a time.' }], usage: { input_tokens: 10, output_tokens: 10 } }) });
  const intro = await call('POST', { action: 'learn_intro', learn: { ...OVERVIEW.options[0], what: OVERVIEW.options[0].what } });
  assert.equal(intro.status, 200, JSON.stringify(await intro.clone().json()));
  assert.match((await intro.json()).text, /slope/);
  assert.match(deps.callModel.calls[0].body.messages[0].content, /Files: #the-step, #gradient-descent/, 'the model reads the sections the topic names');
  assert.match(deps.callModel.calls[0].body.messages[0].content, /Move against the slope/);
});
