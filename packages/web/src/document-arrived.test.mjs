// A dropped Markdown or PDF starts the Tutor (roadmap-unplug-spec.md section B): the page tells the flow once, the body carries only what the server takes, and the flow answers with the same
// opening as a repository's, named after the file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOC_PAGES_MAX, DOC_TEXT_MAX, documentArrived, documentBody, takeDocument } from './document-arrived.js';
import { askIntake, flowMessages, indexDoc, repositoryArrival } from './rehearsal-flow.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('a dropped document waits for the flow and is taken once; only markdown and pdf, with a name', () => {
  documentArrived('canvas-aaaa1111', { kind: 'markdown', name: 'notes.md', text: '# Hi' });
  assert.equal(takeDocument('canvas-bbbb2222'), null, 'another canvas has none');
  assert.deepEqual(takeDocument('canvas-aaaa1111'), { kind: 'markdown', name: 'notes.md', text: '# Hi' });
  assert.equal(takeDocument('canvas-aaaa1111'), null, 'taken once');
  for (const detail of [null, { kind: 'docx', name: 'a' }, { kind: 'pdf', name: '' }, { kind: 'markdown' }]) { documentArrived('canvas-cccc3333', detail); assert.equal(takeDocument('canvas-cccc3333'), null); }
});

test('the body carries the markdown text or the pdf pages, cut to what the server takes', () => {
  assert.deepEqual(documentBody({ kind: 'markdown', name: 'notes.md', text: '# Hi', blockId: 'b1', assetKey: 'import:1' }), { action: 'learn_index', layer: 'overview', source: { kind: 'markdown', name: 'notes.md', blockId: 'b1', text: '# Hi' } });
  assert.equal(documentBody({ kind: 'markdown', name: 'big.md', text: 'x'.repeat(DOC_TEXT_MAX + 10) }).source.text.length, DOC_TEXT_MAX);
  assert.deepEqual(documentBody({ kind: 'pdf', name: 'p.pdf', pages: ['one', 'two'] }).source, { kind: 'pdf', name: 'p.pdf', pages: ['one', 'two'] });
  assert.equal(documentBody({ kind: 'pdf', name: 'p.pdf', pages: Array.from({ length: 900 }, () => 'x') }).source.pages.length, DOC_PAGES_MAX);
  const long = documentBody({ kind: 'pdf', name: 'p.pdf', pages: Array.from({ length: 10 }, () => 'y'.repeat(100 * 1024)) }).source.pages;
  assert.ok(long.length < 10 && long.join('\f').length <= DOC_TEXT_MAX, 'the pages that fit');
});

test('the opening for a document is the repository\'s, named after the file, with no Run it row', () => {
  const index = { summary: 'A short note on gradient descent.', options: [{ id: 'the-step', label: 'The step itself', what: 'How one step moves.', anchors: ['#the-step'], kind: 'algorithm' }], cannot: [] };
  const arrival = repositoryArrival(indexDoc('notes.md', index));
  assert.deepEqual([arrival.kind, arrival.canRun, arrival.summary], ['repository', false, '**notes.md**: A short note on gradient descent.']);
  const state = { log: [], lines: [], doc: indexDoc('notes.md', index), get: { indexing: 'ready', catalogue: { status: 'ready' } } };
  assert.equal(askIntake(state, { run: false }).opening, 'loading');
  assert.deepEqual(flowMessages({ log: [], lines: [], get: { indexing: 'indexing', catalogue: { status: 'queued' } } }, { repo: 'notes.md', run: false }).map(m => m.pending), ['Reading notes.md']);
  assert.equal(flowMessages({ log: [], lines: [], docError: true }, { repo: 'notes.md', run: false })[0].text, "I couldn't read **notes.md** well enough to say what it offers. Try again.");
});

test('the wiring: the page reports a dropped Markdown file and a dropped PDF, and the flow starts once, opens Chat, reads the file and retries from the same drop', () => {
  const page = read('LearnPage.jsx'), flow = read('TutorRehearsal.jsx');
  assert.match(page, /if \(block\.type === 'file' && block\.kind === 'markdown'\) documentArrived\(app\.name, \{ kind: 'markdown', name: file\.name, text: await file\.text\(\), blockId: block\.id, assetKey \}\);/);
  assert.match(page, /pageTexts = await readPageTexts\(pdf, [^;]*; body\.append\('pages', JSON\.stringify\(pageTexts\)\);/);
  assert.match(page, /if \(pageTexts\?\.length\) \{ panels\.openChat\(\); documentArrived\(app\.name, \{ kind: 'pdf', name: stored\.title \|\| file\.name, pages: pageTexts,/);
  assert.match(flow, /if \(docDrop\.current \|\| repoRef\.current \|\| st\.current\.asked \|\| st\.current\.learn \|\| storedLearn\(chatRef\.current\?\.coaching\?\.state\)\) return;/, 'one document, and never on a canvas with a plan, a source or an opening');
  assert.match(flow, /chatRef\.current\?\.panels\?\.openChat\?\.\(\);\n\s+startDocument\(detail\);/);
  assert.match(flow, /start\(takeDocument\(canvas\)\); \/\/ dropped before this flow was mounted/);
  assert.match(flow, /codebasePost\(chatRef\.current, board, documentBody\(detail\)\)/);
  assert.match(flow, /if \(docDrop\.current && !repoRef\.current\) \{ startDocument\(docDrop\.current\); return; \}/, 'Retry reads the same file again');
  assert.match(flow, /repo: repository\.name \|\| repository\.repo/, 'the opening names the file');
});
