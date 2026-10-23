import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COPY, STATES, canBlank, canMove, canStart, capabilities, classifyFile, classifyLink, clearDraft, createDraft, destinationKind,
  editable, effective, blankPlan, loadDraft, needs, planStart, problems, reduce, restore, saveDraft, serialize, statusText, summary, summaryText,
} from './start-draft.js';

const file = (name, size = 1000, extra = {}) => ({ name, size, type: '', lastModified: 1, ...extra });
const files = (...list) => (d) => reduce(d, { type: 'add-files', files: list });
const pipe = (d, ...steps) => steps.reduce((acc, step) => step(acc), d);
const repo = (d, extra = {}) => reduce(d, { type: 'add-repository', url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT', branch: 'master', ...extra });
const row = (d, id) => d.rows.find((r) => r.id === id);
const move = (d, id, status, extra = {}) => reduce(d, { type: 'row', id, status, ...extra });

test('the owner copy is exact', () => {
  assert.equal(COPY.title, 'Start a rabbit hole');
  assert.equal(COPY.subtitle, 'Add files, links or a repository. You can combine them.');
  assert.deepEqual([COPY.addFiles, COPY.addLink, COPY.connectRepository], ['Add files', 'Add link', 'Connect repository']);
  assert.equal(COPY.explainContext, 'Context lets Chat and Tutor use a source.');
  assert.equal(COPY.explainCanvas, 'Canvas shows it as a card in your workspace.');
  assert.deepEqual([COPY.context, COPY.canvas, COPY.overview], ['Use as context', 'Add to canvas', 'Add overview to canvas']);
  assert.deepEqual([COPY.blank, COPY.start, COPY.choose], ['Start with a blank canvas', 'Start rabbit hole', 'Choose context, canvas, or both.']);
  for (const text of Object.values(COPY)) assert.doesNotMatch(text, /\.\.\.|…/);
});

test('links are recognised by pattern: arXiv, YouTube, Wikipedia, any other web page', () => {
  const arxiv = classifyLink('https://arxiv.org/pdf/2401.01234v2.pdf');
  assert.deepEqual([arxiv.type, arxiv.id, arxiv.url], ['arxiv', '2401.01234', 'https://arxiv.org/abs/2401.01234v2']);
  assert.equal(classifyLink('arxiv.org/abs/hep-th/9901001').type, 'arxiv');
  for (const text of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ']) {
    const link = classifyLink(text);
    assert.deepEqual([link.type, link.id, link.key], ['youtube', 'dQw4w9WgXcQ', 'youtube:dQw4w9WgXcQ'], text);
  }
  const wiki = classifyLink('https://en.wikipedia.org/wiki/Attention_(machine_learning)#History');
  assert.deepEqual([wiki.type, wiki.label, wiki.detail], ['wikipedia', 'Attention (machine learning)', 'Wikipedia article']);
  const page = classifyLink('https://www.example.com/post/?a=1#top');
  assert.deepEqual([page.type, page.label, page.url], ['webpage', 'example.com/post', 'https://example.com/post?a=1']);
  assert.equal(classifyLink('example.com/post').ok, true); // a missing scheme is https
});

test('links that cannot be added say why', () => {
  for (const [text, error] of [
    ['', 'Paste a link.'], ['two links https://a.com https://b.com', 'Add one link at a time.'], ['ftp://example.com/x', 'Only web links can be added.'],
    ['https://user:pw@example.com/x', 'Links with a sign-in in them cannot be added.'], ['http://localhost:3000', 'That is not a public web link.'],
    ['http://192.168.0.1/admin', 'That is not a public web link.'], ['https://[::1]/', 'That is not a public web link.'],
  ]) assert.deepEqual(classifyLink(text), { ok: false, error }, text);
  assert.equal(classifyLink('https://youtube.com/watch?v=short').type, 'webpage'); // not a video id: an ordinary page
});

test('files: supported families pass; empty, oversize, model parts and unknown types are refused by name', () => {
  assert.equal(classifyFile(file('paper.pdf')).family, 'pdf');
  assert.equal(classifyFile(file('notes.md')).family, 'markdown');
  assert.equal(classifyFile(file('data.xlsx')).family, 'workbook');
  assert.match(classifyFile(file('empty.txt', 0)).error, /^empty\.txt: the file is empty/);
  assert.match(classifyFile(file('big.png', 6 * 1024 * 1024)).error, /^big\.png is 6 MiB; Image files up to 5 MiB/);
  assert.match(classifyFile(file('scene.glb')).error, /^scene\.glb: this kind of file is added from the canvas/);
  assert.match(classifyFile(file('thing.xyz')).error, /^thing\.xyz:/);
});

test('adding files: defaults, one row per file, duplicates and refused files named in one notice list', () => {
  const d = files(file('a.pdf'), file('b.docx'), file('a.pdf'), file('c.xyz'), file('d.txt'))(createDraft());
  assert.deepEqual(d.rows.map((r) => [r.id, r.label, r.context, r.canvas]), [['s1', 'a.pdf', true, true], ['s2', 'b.docx', false, true], ['s3', 'd.txt', true, true]]);
  assert.deepEqual(d.notices, ['a.pdf is already in the list.', 'c.xyz: this kind of file is added from the canvas.']);
  assert.match(d.rows[0].detail, /^PDF, /); // detail shows the family and the size
  // a later add replaces the notices and adds to, never replaces, the list
  const more = files(file('e.md'))(d);
  assert.equal(more.rows.length, 4);
  assert.deepEqual(more.notices, []);
});

test('a file the context road cannot keep defaults to canvas only and its context is unavailable', () => {
  const d = files(file('b.docx'))(createDraft());
  assert.deepEqual(capabilities(d.rows[0], d), { context: false, canvas: true });
  assert.deepEqual(reduce(d, { type: 'set-option', id: 's1', option: 'context', value: true }), d); // refused, unchanged
  assert.deepEqual(effective(d.rows[0], d), { context: false, canvas: true });
  assert.deepEqual(problems(d), []);
});

test('link rows: both on; context follows the card, so it is unavailable while the canvas option is off', () => {
  let d = reduce(createDraft(), { type: 'add-link', text: 'https://en.wikipedia.org/wiki/Transformer' });
  assert.deepEqual([d.rows[0].context, d.rows[0].canvas], [true, true]);
  d = reduce(d, { type: 'set-option', id: 's1', option: 'canvas', value: false });
  assert.deepEqual(capabilities(d.rows[0], d), { context: false, canvas: true });
  assert.deepEqual(effective(d.rows[0], d), { context: false, canvas: false });
  assert.deepEqual(problems(d).map((p) => [p.id, p.message]), [['s1', 'Choose context, canvas, or both.']]);
  d = reduce(d, { type: 'set-option', id: 's1', option: 'canvas', value: true });
  assert.deepEqual(effective(d.rows[0], d), { context: true, canvas: true }); // the stored choice came back
});

test('webpage rows say they are resolved when you start; typed links show their type at once; duplicates are named', () => {
  let d = pipe(createDraft(), (x) => reduce(x, { type: 'add-link', text: 'https://example.com/a' }), (x) => reduce(x, { type: 'add-link', text: 'https://youtu.be/dQw4w9WgXcQ' }));
  assert.equal(statusText(d.rows[0]), 'Will be resolved when you start');
  assert.equal(statusText(d.rows[1]), '');
  assert.equal(d.rows[1].detail, 'YouTube video');
  d = reduce(d, { type: 'add-link', text: 'https://www.example.com/a/#x' });
  assert.equal(d.rows.length, 2);
  assert.deepEqual(d.notices, ['That link is already in the list.']);
  d = reduce(d, { type: 'add-link', text: 'nonsense words' });
  assert.deepEqual(d.notices, ['Add one link at a time.']);
  assert.equal(d.rows.length, 2);
});

test('repository: one only, context on and overview off, files lose context while it is in the list and get it back after', () => {
  let d = pipe(createDraft(), files(file('a.pdf'), file('b.docx')), repo);
  const r = d.rows[2];
  assert.deepEqual([r.kind, r.context, r.canvas, r.label], ['repository', true, false, 'karpathy/nanoGPT']);
  assert.deepEqual(capabilities(d.rows[0], d), { context: false, canvas: true });
  assert.deepEqual(effective(d.rows[0], d), { context: false, canvas: true });
  assert.equal(destinationKind(d), 'repository');
  d = repo(d, { url: 'https://github.com/a/b', repo: 'a/b' });
  assert.equal(d.rows.length, 3);
  assert.deepEqual(d.notices, [COPY.oneRepository]);
  d = reduce(d, { type: 'remove', id: 's3' });
  assert.deepEqual(effective(d.rows[0], d), { context: true, canvas: true });
  assert.equal(destinationKind(d), 'canvas');
});

test('a repository row alone with both options off asks for a destination', () => {
  let d = repo(createDraft());
  d = reduce(d, { type: 'set-option', id: 's1', option: 'context', value: false });
  assert.equal(canStart(d), false);
  assert.deepEqual(problems(d).map((p) => p.message), [COPY.choose]);
  d = reduce(d, { type: 'set-option', id: 's1', option: 'canvas', value: true });
  assert.equal(canStart(d), true);
});

test('Start needs a source, no row without a destination, and at most ten files as context', () => {
  assert.equal(canStart(createDraft()), false);
  assert.equal(canBlank(createDraft()), true);
  assert.equal(summaryText(createDraft()), 'No sources added.');
  const many = files(...Array.from({ length: 11 }, (_, i) => file(`n${i}.txt`)))(createDraft());
  assert.equal(canStart(many), false);
  assert.equal(problems(many)[0].code, 'context-limit');
  const fewer = reduce(many, { type: 'set-option', id: 's1', option: 'context', value: false });
  assert.equal(canStart(fewer), true);
});

test('the summary counts context sources and canvas cards from the effective options', () => {
  const d = pipe(createDraft(), files(file('a.pdf'), file('b.docx')), (x) => reduce(x, { type: 'add-link', text: 'https://example.com/p' }), repo);
  assert.deepEqual(summary(d), { context: 2, cards: 3, sources: 4 }); // repository context + link context ride; the pdf lost context to the repository
  assert.equal(summaryText(d), '2 context sources, 3 canvas cards');
  const o = reduce(d, { type: 'set-option', id: 's4', option: 'canvas', value: true });
  assert.equal(summary(o).cards, 4); // the overview is one card, never a card per file
  assert.equal(summaryText(files(file('a.pdf'))(createDraft())), '1 context source, 1 canvas card');
});

test('row states move only along the machine, and ready needs every chosen destination done', () => {
  assert.deepEqual(STATES, ['idle', 'checking', 'uploading', 'importing', 'ready', 'failed']);
  assert.equal(canMove('idle', 'uploading'), true);
  assert.equal(canMove('uploading', 'checking'), false);
  assert.equal(canMove('ready', 'idle'), false);
  assert.equal(canMove('failed', 'ready'), false);
  assert.equal(canMove('failed', 'idle'), true);
  let d = files(file('a.pdf'))(createDraft());
  d = reduce(d, { type: 'begin' });
  d = move(d, 's1', 'uploading');
  assert.equal(statusText(row(d, 's1')), 'Uploading');
  d = move(d, 's1', 'importing', { done: { context: true } });
  assert.equal(statusText(row(d, 's1')), 'Adding');
  assert.equal(move(d, 's1', 'ready').rows[0].status, 'importing'); // the card is not done yet: refused
  d = move(d, 's1', 'ready', { done: { canvas: true } });
  assert.equal(statusText(row(d, 's1')), 'Ready');
  assert.equal(move(d, 's1', 'uploading').rows[0].status, 'ready'); // terminal
});

test('a repository overview waits for the index, and says so until the card is added', () => {
  let d = repo(createDraft());
  d = reduce(d, { type: 'set-option', id: 's1', option: 'canvas', value: true });
  d = reduce(d, { type: 'begin' });
  d = move(d, 's1', 'importing', { done: { context: true }, waiting: 'index' });
  assert.equal(statusText(row(d, 's1')), 'Waiting for the index');
  assert.deepEqual(needs(row(d, 's1'), d), { context: false, canvas: true });
  d = move(d, 's1', 'ready', { done: { canvas: true } });
  assert.equal(row(d, 's1').waiting, '');
});

test('partial failure: successes stay, only the failed row is planned again, and nothing is stored twice', () => {
  let d = pipe(createDraft(), files(file('a.pdf'), file('b.txt')), (x) => reduce(x, { type: 'add-link', text: 'https://example.com/p' }));
  d = reduce(d, { type: 'begin' });
  assert.deepEqual(planStart(d).steps.map((s) => s.id), ['s1', 's2', 's3']);
  d = reduce(d, { type: 'destination', kind: 'canvas', slug: 'canvas-1a2b3c4d' });
  d = move(d, 's1', 'importing', { done: { context: true, canvas: true } });
  d = move(d, 's1', 'ready');
  d = move(d, 's2', 'uploading');
  d = move(d, 's2', 'failed', { reason: 'The upload stopped. Retry it.', done: { context: true } }); // context stored, card not placed
  d = move(d, 's3', 'checking');
  d = move(d, 's3', 'failed', { reason: 'This page could not be captured.' });
  d = reduce(d, { type: 'finish' });
  assert.equal(d.phase, 'partial');
  assert.equal(statusText(row(d, 's2')), 'The upload stopped. Retry it.');
  assert.equal(canStart(d), true);
  d = reduce(d, { type: 'begin' });
  assert.equal(d.attempt, 2);
  assert.deepEqual(row(d, 's2').status, 'idle');
  const plan = planStart(d);
  assert.deepEqual(plan.steps, [{ id: 's2', kind: 'file', needs: { context: false, canvas: true } }, { id: 's3', kind: 'link', needs: { context: true, canvas: true } }]);
  assert.deepEqual(plan.destination, { kind: 'canvas', create: false, slug: 'canvas-1a2b3c4d' });
});

test('the destination is created once: a repeated report changes nothing, and blank reuses it', () => {
  let d = files(file('a.pdf'))(createDraft());
  assert.deepEqual(blankPlan(d), { create: true, slug: null, kind: 'canvas' });
  d = reduce(d, { type: 'destination', kind: 'canvas', slug: 'canvas-1a2b3c4d' });
  const again = reduce(d, { type: 'destination', kind: 'canvas', slug: 'canvas-ffffffff' });
  assert.equal(again, d);
  assert.deepEqual(blankPlan(d), { create: false, slug: 'canvas-1a2b3c4d', kind: 'canvas' });
  assert.equal(planStart(d).destination.create, false);
  // a repository cannot join a start whose destination is already a canvas
  const refused = repo(d);
  assert.equal(refused.rows.length, 1);
  assert.match(refused.notices[0], /canvas was already created/);
});

test('an already connected repository is opened, not created again', () => {
  const existing = { slug: 'repo-1a2b3c4d-nanogpt', kind: 'repository', title: 'karpathy/nanoGPT' };
  const d = repo(createDraft(), { existing });
  assert.match(d.rows[0].detail, /already connected/);
  assert.deepEqual(planStart(d).destination, { kind: 'repository', create: false, slug: 'repo-1a2b3c4d-nanogpt' });
});

test('a duplicate Start is refused while one runs, and the list is locked until it finishes', () => {
  let d = files(file('a.pdf'))(createDraft());
  d = reduce(d, { type: 'begin' });
  assert.equal(d.phase, 'starting');
  assert.equal(reduce(d, { type: 'begin' }), d);
  assert.equal(canStart(d), false);
  assert.equal(canBlank(d), false);
  assert.equal(editable(d.rows[0], d), false);
  for (const action of [{ type: 'remove', id: 's1' }, { type: 'set-option', id: 's1', option: 'canvas', value: false }, { type: 'add-files', files: [file('b.pdf')] }, { type: 'add-link', text: 'https://a.com/x' }]) {
    assert.equal(reduce(d, action), d, action.type);
  }
});

test('a ready row is locked; a failed row can be fixed by unchecking what failed, and then completes with no work', () => {
  let d = files(file('a.pdf'))(createDraft());
  d = reduce(d, { type: 'begin' });
  d = move(d, 's1', 'importing', { done: { context: true } });
  d = move(d, 's1', 'failed', { reason: 'The card could not be placed.' });
  d = reduce(d, { type: 'finish' });
  assert.equal(editable(row(d, 's1'), d), true);
  d = reduce(d, { type: 'set-option', id: 's1', option: 'canvas', value: false });
  assert.deepEqual(planStart(d).steps, []);
  assert.deepEqual(planStart(d).complete, ['s1']);
  d = reduce(d, { type: 'begin' });
  d = move(d, 's1', 'ready');
  d = reduce(d, { type: 'finish' });
  assert.equal(d.phase, 'done');
  assert.equal(editable(row(d, 's1'), d), false);
  assert.equal(reduce(d, { type: 'remove', id: 's1' }), d);
});

test('reload recovery: links and the repository survive, running work is failed with a reason, files are asked for again', () => {
  let d = pipe(createDraft(), files(file('a.pdf'), file('b.txt')), (x) => reduce(x, { type: 'add-link', text: 'https://example.com/p' }));
  d = reduce(d, { type: 'begin' });
  d = move(d, 's1', 'importing', { done: { context: true, canvas: true } });
  d = move(d, 's1', 'ready');
  d = move(d, 's2', 'uploading');
  d = move(d, 's3', 'checking');
  const back = restore(serialize(d));
  assert.equal(back.phase, 'partial');
  assert.equal(row(back, 's1').status, 'ready');
  assert.deepEqual([row(back, 's2').status, row(back, 's2').needsFile, row(back, 's2').reason], ['failed', true, 'Add this file again.']);
  assert.deepEqual([row(back, 's3').status, row(back, 's3').reason], ['failed', 'Interrupted by a reload. Retry to continue.']);
  assert.equal(canStart(back), false); // the lost file blocks until it is chosen again
  assert.deepEqual(problems(back).map((p) => [p.id, p.code]), [['s2', 'file-needed']]);
  // choosing the same file again restores the row instead of adding a second one
  const again = reduce(back, { type: 'add-files', files: [file('b.txt')] });
  assert.equal(again.rows.length, 3);
  assert.deepEqual([row(again, 's2').needsFile, row(again, 's2').status], [false, 'idle']);
  assert.equal(canStart(again), true);
});

test('reload recovery keeps what a done destination holds, and refuses a snapshot it cannot read', () => {
  let d = pipe(createDraft(), files(file('a.pdf')));
  d = reduce(d, { type: 'destination', kind: 'canvas', slug: 'canvas-1a2b3c4d' });
  assert.deepEqual(restore(serialize(d)).destination, { kind: 'canvas', slug: 'canvas-1a2b3c4d', existing: false });
  for (const text of ['', 'not json', '{"v":2,"draft":{}}', '{"v":1}', 'null']) assert.equal(restore(text), null, text);
});

test('storage is honest: a missing, full or throwing storage reports not saved and never throws', () => {
  const memory = () => { const m = new Map(); return { setItem: (k, v) => m.set(k, v), getItem: (k) => m.get(k) ?? null, removeItem: (k) => m.delete(k), m }; };
  const s = memory();
  const d = files(file('a.pdf'))(createDraft());
  assert.deepEqual(saveDraft(d, s), { ok: true });
  assert.equal(loadDraft(s).rows[0].label, 'a.pdf');
  assert.deepEqual(saveDraft(createDraft(), s), { ok: true }); // an empty draft with nothing created is forgotten
  assert.equal(s.m.size, 0);
  assert.equal(loadDraft(s), null);
  saveDraft(d, s);
  clearDraft(s);
  assert.equal(loadDraft(s), null);
  const full = { setItem() { throw new Error('QuotaExceededError'); }, getItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.deepEqual(saveDraft(d, full), { ok: false });
  assert.equal(loadDraft(full), null);
  assert.doesNotThrow(() => clearDraft(full));
});

test('removing and toggling clear the notices; an unknown row or option changes nothing', () => {
  let d = files(file('a.pdf'), file('a.pdf'))(createDraft());
  assert.equal(d.notices.length, 1);
  d = reduce(d, { type: 'set-option', id: 's1', option: 'canvas', value: false });
  assert.deepEqual(d.notices, []);
  assert.equal(reduce(d, { type: 'set-option', id: 'nope', option: 'canvas', value: true }), d);
  assert.equal(reduce(d, { type: 'set-option', id: 's1', option: 'color', value: true }), d);
  assert.equal(reduce(d, { type: 'remove', id: 'nope' }), d);
});
