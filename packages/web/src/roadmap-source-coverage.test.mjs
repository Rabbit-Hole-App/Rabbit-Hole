// R7a UI limitation handling: the coverage lines and part choices a long source adds to the Chat strip, the create call a chosen part sends, and the
// R4 notice-only behavior when the server sent no choices (long Markdown off).
import test, { after } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as esbuild from 'esbuild';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRoadmapController } from './roadmap-controller.js';
import { chatOf, initialState, reduce, texts } from './roadmap-client.js';
import { COVERAGE_STRINGS, coverageLines, choicesOf } from './roadmap-source-coverage.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const view = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const fail = (status, data) => Object.assign(new Error(data.error || 'x'), { status, data });
const limitation = (over = {}) => ({ code: 'source_too_large', message: 'This source is longer than one roadmap can read completely. Choose a section or a passage and it will be covered fully.', readChars: 0, sourceChars: 900000,
  offers: [{ kind: 'passage', label: 'Select a passage' }], coverage: { totalChars: 900000, indexedThrough: 900000, complete: true, summarizedChars: 0, unread: [], notes: [] },
  choices: [{ locationId: 's0', part: 1, parts: 1, label: 'Chapter 1', chars: 30000 }, { locationId: 's41', part: 2, parts: 3, label: 'Appendix, part 2 of 3', chars: 30000 }], ...over });

test('coverage lines say what is covered, summarized and unread, in plain sentences', () => {
  assert.deepEqual(coverageLines(limitation()), [COVERAGE_STRINGS.outlined(900000)]);
  assert.match(coverageLines(limitation({ coverage: { totalChars: 900000, complete: true, summarizedChars: 300000, unread: [], notes: [] } }))[1], /Short summaries exist for 300,000 of 900,000 characters\. The rest is outlined only\./);
  assert.deepEqual(coverageLines({ coverage: { totalChars: null, complete: false, summarizedChars: 0, notes: [], unread: [{ start: 0, end: null, reason: 'source_over_read_limit' }] } }), [COVERAGE_STRINGS.unread('source_over_read_limit')]);
  assert.deepEqual(coverageLines(null), []);
  assert.deepEqual(choicesOf(limitation()).map(c => c.label), ['Chapter 1', 'Appendix, part 2 of 3']);
});

test('a refused create keeps the server limitation; the Chat strip shows the coverage line and a button per part; a view clears it', () => {
  let state = reduce(initialState(), { type: 'refused', message: 'long', limitation: limitation() });
  const line = chatOf({ ...state, flag: 'on' }).find(l => l.kind === 'coverage');
  assert.equal(line.text, COVERAGE_STRINGS.choose);
  assert.equal(line.choices.length, 2);
  assert.ok(texts({ ...state, flag: 'on' }).includes('Appendix, part 2 of 3') || line.choices.some(c => c.label === 'Appendix, part 2 of 3'));
  state = reduce(state, { type: 'view', view: view('status-proposed-plan') });
  assert.equal(state.limitation, null);
  assert.ok(!chatOf(state).some(l => l.kind === 'coverage'));
});

test('without choices (switch off) the R4 notice is all there is', () => {
  const state = reduce(initialState(), { type: 'refused', message: 'long', limitation: { code: 'source_too_large', message: 'x', offers: [] } });
  assert.ok(!chatOf({ ...state, flag: 'on' }).some(l => l.kind === 'coverage'));
});

test('choosing a part creates the roadmap with that section scope, once; a bad choice sends nothing', async () => {
  const calls = [], routes = { 'GET ': () => ({ roadmap: null }), 'GET /invitations': () => view('invitation-offered'), 'POST ': body => { calls.push(body); if (calls.length === 1) throw fail(422, { error: 'long', code: 'source_too_large', limitation: limitation() }); return view('create-response-draft'); } };
  const api = async (path, opts = {}) => {
    const key = `${opts.method || 'GET'} ${path.replace('/api/learn/roadmap', '').replace(/\?.*/, '')}`;
    for (const [pattern, handler] of Object.entries(routes)) if (key.match(new RegExp(`^${pattern}$`))) return handler(opts.body ? JSON.parse(opts.body) : null);
    throw fail(404, { error: 'Not available', code: 'not_found' });
  };
  const controller = createRoadmapController({ api, boardId: 'lb_7c1e5a90d2b84f63a1c07e92', host: { hasBlock: () => false, insertCard() {}, persist: async () => {}, sourceRev: () => 'sha256:' + 'a'.repeat(64) }, schedule: () => 1, cancel() {}, random: (() => { let n = 0; return () => `key${++n}aaaaaaaa`; })() });
  controller.start(); await new Promise(r => setTimeout(r, 5));
  await controller.explain();
  assert.equal(calls[0].source.scope.kind, 'whole');
  assert.equal(controller.getState().limitation.choices.length, 2);
  assert.equal(await controller.explainPart({}), null);
  assert.equal(await controller.explainPart(null), null);
  assert.equal(calls.length, 1);
  await controller.explainPart(controller.getState().limitation.choices[1]);
  assert.deepEqual(calls[1].source.scope, { kind: 'section', locationId: 's41', part: 2 });
  assert.equal(controller.getState().limitation, null);
  assert.ok(controller.getState().view);
});

test('no coverage string has an ellipsis or a price', () => {
  const all = [COVERAGE_STRINGS.choose, COVERAGE_STRINGS.outlined(5), COVERAGE_STRINGS.summarized(1, 2), COVERAGE_STRINGS.unread('x'), COVERAGE_STRINGS.unread('source_over_read_limit')];
  for (const text of all) assert.doesNotMatch(text, /\.\.\.|…|\$|credit|cost|price|token/i);
});

test('the Chat strip renders the coverage line and one choice button per part, and a click hands back that part', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'roadmap-coverage-'));
  after(() => rmSync(tmp, { recursive: true, force: true }));
  const outfile = join(tmp, 'bundle.cjs');
  await esbuild.build({ stdin: { contents: "export { default as RoadmapInvitation } from './RoadmapInvitation.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
    bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent' });
  const lib = createRequire(import.meta.url)(outfile);
  const state = reduce(initialState(), { type: 'refused', message: 'long', limitation: limitation() });
  const markup = lib.renderToStaticMarkup(lib.createElement(lib.RoadmapInvitation, { invitation: null, lines: chatOf({ ...state, flag: 'on' }), onExplain() {}, onKeep() {}, onAnswer() {}, onRecover() {}, onOffer() {}, onChoose() {} }));
  assert.match(markup, /data-roadmap-line="coverage"/);
  assert.match(markup, /data-roadmap-coverage[^>]*>The outline covers all 900,000 characters of the source\./);
  assert.deepEqual([...markup.matchAll(/data-roadmap-choice="([^"]+)"[^>]*>([^<]+)</g)].map(m => `${m[1]}=${m[2]}`), ['s0:1=Chapter 1', 's41:2=Appendix, part 2 of 3']);
  assert.doesNotMatch(markup, /\.\.\.|…/);
});

test('R7b: PDF coverage names unreadable pages and cut pages in plain sentences, offers page ranges, and never calls a scan readable', () => {
  const pdf = limitation({ code: 'pdf_partial', coverage: { totalChars: 5000, complete: false, summarizedChars: 0, unread: [{ start: 40, end: 80, reason: 'no_text_layer' }], notes: [],
    pages: { total: 9, readable: 6, cut: [4], unreadable: [{ from: 5, to: 7, reason: 'no_text_layer' }, { from: 9, to: 9, reason: 'damaged_text' }] } }, choices: [{ locationId: 'pg1', part: 1, parts: 1, label: 'Pages 1 to 4', chars: 100 }] });
  assert.deepEqual(coverageLines(pdf), [COVERAGE_STRINGS.pagesUnreadable(5, 7), COVERAGE_STRINGS.pagesUnreadable(9, 9), COVERAGE_STRINGS.pagesCut(1)]);
  assert.equal(COVERAGE_STRINGS.pagesUnreadable(5, 7), 'Pages 5 to 7 have no readable text, so they cannot be explained yet.');
  assert.deepEqual(coverageLines(limitation({ coverage: { totalChars: 1, complete: true, summarizedChars: 0, unread: [], notes: [], pages: { total: 40, readable: 40, cut: [], unreadable: [] } } })), [COVERAGE_STRINGS.pagesAll(40)]);
  const state = reduce(initialState(), { type: 'refused', message: 'x', limitation: pdf });
  assert.equal(chatOf({ ...state, flag: 'on' }).find(l => l.kind === 'coverage').text, COVERAGE_STRINGS.chooseRange);
  for (const text of [COVERAGE_STRINGS.chooseRange, COVERAGE_STRINGS.pagesUnreadable(1, 2), COVERAGE_STRINGS.pagesCut(2), COVERAGE_STRINGS.pagesAll(3)]) assert.doesNotMatch(text, /\.\.\.|…|\$|credit|cost|price|token|ocr|scan/i);
});
