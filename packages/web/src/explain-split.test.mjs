// Owner 2026-11-07: /explain is split into the written /explain (internal id `explanation`) and the playable /interactive (internal id
// `explain`, every saved binding kept). This file pins: typed and picker routing through the real functions, the visible section label
// (Tutor, internal key learn), both previews (the written one drawn by the real Explanation card with a rendered Markdown table), what
// "Use example" fills (never sends), and that a saved request carrying `explain` still means the interactive flow.
// Not seen in a browser: the owner checks the picker, Ctrl+K and the Slash Commands window on the deployed build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';
import { EXAMPLES, commandLine, lineCommand, parseSlash, pickerSections, runLearnCommand } from './learn-slash.js';
import { LEARN_MENU, MENU_TITLES, SLASH, commandsFor, idOfTyped, learnRequest, resolveCommand, typedOf } from './agent/slash.js';
import { ctrlkCommands } from './inline-ai-command.js';
import { PREVIEWS, previewBlock } from './slash-sheet.js';
import { draftSlot } from './chat-draft.js';
import { sentCommand } from './command-token.js';
import { explanationProblem, explanationProseChars } from '../../control-plane/src/learn-primitives.js';
import { EXPLANATION_CAPS } from '../../control-plane/src/chat-depth.js';

const WRITTEN = '/explain Why does coffee cool faster at first? Include a small table comparing early and late cooling.';
const WRITTEN_ARGS = 'Why does coffee cool faster at first? Include a small table comparing early and late cooling.';
const INTERACTIVE = '/interactive how a hot coffee cools in a cold room, and let me change the room temperature';

// ---- routing: typed and picked ----------------------------------------------------------------------------------------------------

test('typed words resolve to the right id: /explain is the written command, /interactive keeps the saved id explain', () => {
  assert.deepEqual([typedOf('explanation'), typedOf('explain')], ['explain', 'interactive']);
  assert.deepEqual([idOfTyped('explain'), idOfTyped('interactive')], ['explanation', 'explain']);
  for (const [line, id, args] of [['/explain how a heap works', 'explanation', 'how a heap works'], ['/EXPLAIN how a heap works', 'explanation', 'how a heap works'], ['/interactive a heap', 'explain', 'a heap'], ['/Interactive a heap', 'explain', 'a heap']]) {
    const parsed = parseSlash(line), resolved = resolveCommand(line, 'learn');
    assert.deepEqual([resolved.command.name, resolved.arg], [id, args], line);
    assert.equal(parsed.args, args, line);
  }
  // The outgoing line and the stored id agree both ways, so a saved message restores the same command.
  assert.equal(commandLine('a heap', { command: 'explanation' }), '/explain a heap');
  assert.equal(commandLine('a heap', { command: 'explain' }), '/interactive a heap');
  assert.deepEqual([lineCommand('/explain a heap'), lineCommand('/interactive a heap')], ['explanation', 'explain']);
});

test('the picker and Ctrl+K list both, Explanation then Interactive, first in the first section, from the one registry', () => {
  const sections = pickerSections('/');
  assert.deepEqual(sections.map(section => section.title), ['Tutor', 'Create', 'Search']);
  assert.deepEqual(sections[0].items.map(item => item.name).slice(0, 2), ['explanation', 'explain']);
  assert.deepEqual(sections[0].items.slice(0, 2).map(item => item.typed ?? typedOf(item.name)), ['explain', 'interactive']);
  const ctrlk = ctrlkCommands({ motionDev: true }).map(command => command.name);
  assert.deepEqual(ctrlk.filter(name => ['explanation', 'explain'].includes(name)), ['explanation', 'explain'], 'Ctrl+K lists the same two, in the same order');
  assert.ok(ctrlk.indexOf('explanation') < ctrlk.indexOf('practice'));
  // Typing the word narrows to its own command.
  assert.deepEqual(pickerSections('/inter').flatMap(section => section.items.map(item => item.name)), ['explain']);
  assert.ok(pickerSections('/explain').flatMap(section => section.items.map(item => item.name)).includes('explanation'));
});

test('the visible first section reads Tutor; its internal group key, places and the other commands are unchanged', () => {
  assert.equal(MENU_TITLES.learn, 'Tutor');
  assert.deepEqual(Object.keys(MENU_TITLES), ['learn', 'create', 'search'], 'the keys are unchanged');
  assert.deepEqual(Object.keys(LEARN_MENU), ['learn', 'create', 'search']);
  assert.ok(!Object.values(MENU_TITLES).includes('Learn'), 'the label Learn is gone from the section titles');
  // Every command that existed before the split keeps its id, group and places (a permission is a place plus availability, never the label).
  const before = ['explain', 'practice', 'quiz', 'flashcards', 'goal', 'code', 'graph', 'diagram', 'notebook', 'generate-image', 'motion', 'cad', 'animation', 'whiteboard-video', '3d', 'browser', 'image', 'youtube', 'arxiv', 'wikipedia'];
  assert.deepEqual(before.filter(name => !SLASH.some(command => command.name === name)), [], 'no saved id was dropped');
  assert.deepEqual(SLASH.map(command => command.name).filter(name => !before.includes(name)), ['explanation'], 'only the written command is new');
  const written = SLASH.find(command => command.name === 'explanation'), playable = SLASH.find(command => command.name === 'explain');
  assert.deepEqual([written.group, playable.group], ['learn', 'learn']);
  assert.deepEqual(written.places, playable.places, 'both are offered wherever /explain was');
  assert.ok(commandsFor('learn').some(command => command.name === 'explanation') && commandsFor('ctrlk').some(command => command.name === 'explanation'));
});

// ---- replay: a saved request that carries the old id --------------------------------------------------------------------------------

test('replay: a saved message, proposal or job that carries explain still means the interactive flow, word for word', async () => {
  // The saved id resolves to the playable command and its original request shape: same family, same narrowing words, no new primitive.
  assert.deepEqual(learnRequest('explain').allowedPrimitives, ['explanation', 'table', 'animation', 'narration']);
  assert.deepEqual(learnRequest('explain', { args: 'an interactive heap' }).allowedPrimitives, ['animation']);
  assert.deepEqual(learnRequest('explain', { args: 'in plain text: a heap' }).allowedPrimitives, ['explanation']);
  // A saved chat message {content: '/explain …', command: 'explain'} restores its pill from the stored id, not from the typed word.
  assert.equal(commandLine('a heap', { command: 'explain' }), '/interactive a heap');
  // A message saved before the split — `/explain …` with command explain, or with no command field at all — restores the interactive pill;
  // a new /explain stores explanation; the stored id always wins over the line's word.
  assert.deepEqual(sentCommand({ content: '/explain a heap', command: 'explain' }), { command: 'explain', text: 'a heap' });
  assert.deepEqual(sentCommand({ content: '/explain a heap' }), { command: 'explain', text: 'a heap' }, 'an old record with no command field');
  assert.deepEqual(sentCommand({ content: '/explain a heap', command: 'explanation' }), { command: 'explanation', text: 'a heap' });
  assert.deepEqual(sentCommand({ content: '/interactive a heap', command: 'explain' }), { command: 'explain', text: 'a heap' });
  // Running the saved id through the real runner starts the explain job (the same call the interactive command makes), never a direct card.
  const started = [], posts = [];
  const canvas = { startExplain: async (words, options) => { started.push([words, options.promptUsed]); return { blockId: 'ex-1' }; }, reserve: () => 'slot', release: () => {}, insertBlock: () => 'direct' };
  const post = async path => { posts.push(path); return { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 'T', body: 'b' } }; };
  const out = await runLearnCommand('/interactive how a heap keeps its order', { app: 'demo', target: null, canvas, post, openSearch: () => {} });
  assert.deepEqual([out.notice.blockId, started.length, posts.length], ['ex-1', 1, 0]);
  // The old line a stale client or a saved suggestion still sends resolves too: the typed /explain is now the written command, so the
  // saved COMMAND ID (not the typed word) is what pins the interactive flow, and it does.
  assert.equal(resolveCommand('/explain a heap', 'learn').command.name, 'explanation');
  assert.equal(resolveCommand(commandLine('a heap', { command: 'explain' }), 'learn').command.name, 'explain');
});

test('the written command makes a card directly: no job, the Explanation primitive only, with Depth and the selected source riding the request', async () => {
  const started = [], posts = [];
  const canvas = { startExplain: async () => { started.push(1); return { blockId: 'ex-1' }; }, reserve: () => 'slot', release: () => {}, insertBlock: block => { posts.push(['inserted', block.type]); return 'card-1'; } };
  const post = async (path, body) => { posts.push([path, body]); return { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 'T', body: 'b' } }; };
  const out = await runLearnCommand('/explain how a heap keeps its order', { app: 'demo', target: { id: 'c', title: 'Heap', text: 'a tree' }, canvas, post, openSearch: () => {} });
  assert.equal(started.length, 0, 'no explain job');
  const request = posts.find(([path]) => path === '/api/learn/artifact')[1];
  assert.deepEqual([request.command, request.args, request.context], ['explanation', 'how a heap keeps its order', 'a tree']);
  assert.deepEqual([out.notice, out.prompt], [null, undefined], 'no "Added an explanation" notice (owner 2026-11-08) and no prompt to the chat');
  assert.deepEqual(posts.filter(([path]) => path !== '/api/learn/artifact').map(entry => entry[0]), ['inserted'], 'the card is inserted by the same canvas hook');
});

// ---- previews: the written one is drawn by the real Explanation card ------------------------------------------------------------------

test('the written preview is the example\'s answer: a saved Explanation block with a 2 to 4 row early-versus-late table, valid at every Depth', () => {
  const preview = PREVIEWS.explanation, block = previewBlock(preview);
  assert.equal(EXAMPLES.explanation, WRITTEN, 'the exact owner prompt');
  assert.equal(preview.kind, 'card');
  assert.equal(preview.card, 'explanation');
  assert.equal(block.type, 'explanation');
  const fixture = JSON.parse(readFileSync(new URL('./slash-examples/explanation-cooling.json', import.meta.url), 'utf8'));
  assert.equal(fixture.prompt, WRITTEN_ARGS, 'the fixture answers exactly the prompt Use example fills');
  assert.deepEqual([block.title, block.body], [fixture.block.title, fixture.block.body]);
  for (const depth of Object.keys(EXPLANATION_CAPS)) assert.equal(explanationProblem(block, depth), null, `${depth}: within ${EXPLANATION_CAPS[depth]} characters and every diagram supported`);
  assert.ok(explanationProseChars(block) <= EXPLANATION_CAPS.overview, 'its prose fits the 600 target (EXP-13: only prose counts), with one visual between prose');
  const rows = block.body.split('\n').filter(line => /^\|/.test(line));
  assert.match(rows[0], /Early/); assert.match(rows[0], /Late/);
  const dataRows = rows.slice(2);
  assert.ok(dataRows.length >= 2 && dataRows.length <= 4, `${dataRows.length} data rows`);
  assert.ok(dataRows.every(row => row.split('|').length === rows[0].split('|').length), 'every row has the header\'s columns');
  assert.match(preview.note, /\/explain/);
});

test('the interactive preview keeps the playable cooling scene and says /interactive', () => {
  assert.equal(EXAMPLES.explain, INTERACTIVE);
  assert.equal(PREVIEWS.explain.kind, 'card');
  assert.equal(PREVIEWS.explain.card, 'animation');
  assert.ok(PREVIEWS.explain.program, 'the saved cooling program');
  assert.match(PREVIEWS.explain.note, /\/interactive/);
  assert.deepEqual(PREVIEWS.explain.size(), { width: 660, height: 620 });
});

// SSR of the real window component: SlashCommandPreview -> CardPreview -> LearningBlockBody -> ExplanationBody, bundled as
// explanation-card.test.mjs does. Mermaid and Shiki are stubbed (the cooling answer has neither).
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, Node: window.Node, Element: window.Element, IS_REACT_ACT_ENVIRONMENT: true });
window.location = { pathname: '/', origin: 'http://localhost', href: 'http://localhost/', search: '', hash: '', host: 'localhost', hostname: 'localhost', protocol: 'http:' };
globalThis.location = window.location;
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
window.Element.prototype.getBoundingClientRect = () => ({ width: 700, height: 520, top: 0, left: 0, right: 700, bottom: 520 });
const requests = [];
globalThis.fetch = async url => { requests.push(String(url)); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }); };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node', clipboard: { writeText: async () => {} } } });
const dir = mkdtempSync(join(tmpdir(), 'explain-split-')), outfile = join(dir, 'preview.cjs');
await esbuild.build({
  stdin: { contents: "export { default as SlashCommandPreview } from './SlashCommandPreview.jsx'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
    build.onResolve({ filter: /^mathlive$/ }, args => ({ path: args.path, namespace: 'mathlive-stub' }));
    build.onLoad({ filter: /.*/, namespace: 'mathlive-stub' }, () => ({ contents: 'export class MathfieldElement {} export default {};' }));
    build.onResolve({ filter: /^(mermaid|shiki)$/ }, args => ({ path: args.path, namespace: 'stub' }));
    build.onLoad({ filter: /^mermaid$/, namespace: 'stub' }, () => ({ contents: 'export default { initialize() {}, async render() { return { svg: "<svg data-stub-diagram></svg>" }; } };' }));
    build.onLoad({ filter: /^shiki$/, namespace: 'stub' }, () => ({ contents: 'export async function codeToHtml() { throw new Error("no shiki in node"); }' }));
  } }],
});
globalThis.MessageChannel = class { constructor() { const port1 = { onmessage: null }; this.port1 = port1; this.port2 = { postMessage: data => setImmediate(() => port1.onmessage?.({ data })) }; } };
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

test('View > Slash Commands draws the written preview in the real Explanation card, with a rendered table and no request', async () => {
  const root = B.createRoot(document.getElementById('app'));
  await B.act(async () => root.render(B.createElement(B.SlashCommandPreview, { name: 'explanation', preview: PREVIEWS.explanation, view: 'result', example: EXAMPLES.explanation, appName: 'demo', narrow: false })));
  await B.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const card = document.querySelector('[data-slash-card="explanation"]');
  assert.ok(card, 'the window draws a card of the canvas\'s explanation type');
  assert.ok(card.querySelector('[data-explanation]'), 'the real ExplanationBody');
  const table = card.querySelector('table');
  assert.ok(table, 'the Markdown pipe table is a rendered <table>');
  assert.match(card.querySelector('thead').textContent, /Early/);
  assert.match(card.querySelector('thead').textContent, /Late/);
  const bodyRows = card.querySelectorAll('tbody tr').length;
  assert.ok(bodyRows >= 2 && bodyRows <= 4, `${bodyRows} rows`);
  assert.match(card.textContent, /Why coffee cools fastest at the start/);
  assert.deepEqual(requests.filter(url => !/source-refs\/resolve/.test(url)), [], 'nothing is generated, saved or searched from the window');
  await B.act(async () => root.unmount());
});

// ---- Use example: fills the composer, never sends ---------------------------------------------------------------------------------------

test('Use example fills the composer with the command pill and the example\'s words for each command, and sends, runs and generates nothing', () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (...args) => { calls.push(args); return Promise.reject(new Error('Use example must not call anything')); };
  try {
    // The sheet's own handler builds { command: id, text: args } (SlashCommandsSheet.jsx onUseExample); the page hands it to composer.prepare.
    const fill = name => ({ command: name, text: parseSlash(EXAMPLES[name])?.args || '' });
    assert.deepEqual(fill('explanation'), { command: 'explanation', text: WRITTEN_ARGS });
    assert.deepEqual(fill('explain'), { command: 'explain', text: 'how a hot coffee cools in a cold room, and let me change the room temperature' });
    for (const name of ['explanation', 'explain']) {
      const next = draftSlot({ text: '', command: null, savedAt: 0 }, { type: 'prepare', ...fill(name), at: 1 });
      assert.deepEqual([next.command, next.text], [name, fill(name).text], `${name}: pill and words in the composer`);
      // What would be sent is the typed line: it carries the typed word, never the internal id.
      assert.equal(commandLine(next.text, { command: next.command }), EXAMPLES[name], `${name}: the line reads exactly like the example`);
    }
    // A draft the learner already wrote is kept (A6): the example follows a blank line and the pill is the example's.
    assert.deepEqual(draftSlot({ text: 'mine', command: 'quiz', savedAt: 0 }, { type: 'prepare', ...fill('explanation'), at: 2 }), { text: `mine\n\n${WRITTEN_ARGS}`, command: 'explanation', savedAt: 2 });
    assert.equal(calls.length, 0, 'no request');
  } finally { globalThis.fetch = realFetch; }
  const sheet = readFileSync(new URL('./SlashCommandsSheet.jsx', import.meta.url), 'utf8');
  assert.match(sheet, /onUseExample\(\{ command: name, text: parseSlash\(example\)\?\.args \|\| '' \}\)/, 'the window only fills');
});
