// UI-16 (owner, 2026-10-21): the chosen / command is one inline token at the start of the Chat composer, and a sent
// message shows the same pill read-only. The token rules (command-token.js) run directly; ChatComposer and ChatMessages
// are bundled with esbuild and rendered with react-dom/server, as answer-footer.test.mjs does. The owner checks light/dark,
// narrow width and keyboard use in the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import * as token from './command-token.js';
import { draftSlot } from './chat-draft.js';
import { commandLine, lineCommand, runLearnCommand } from './learn-slash.js';
import { setImageGeneration } from './agent/slash.js';

const { NO_STEPS, historyKey, recordStep, removesToken, sentCommand, travel } = token;

const dir = mkdtempSync(join(tmpdir(), 'command-token-')), outfile = join(dir, 'token.cjs');
const viteUrl = { name: 'vite-url', setup(build) {
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
  build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { default as ChatComposer } from './ChatComposer.jsx'; export { default as CommandPill } from './CommandPill.jsx'; export { ChatMessages } from './ChatMessages.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
const noop = () => {};
const pill = name => B.createElement(B.CommandPill, { name, onOpen: noop, onRemove: noop });
const composer = props => B.renderToStaticMarkup(B.createElement(B.ChatComposer, { value: '', onChange: noop, onSubmit: noop, stacked: true, ...props }));
const transcript = msgs => B.renderToStaticMarkup(B.createElement(B.ChatMessages, { msgs, learnChat: true, busy: false, setMsgs: noop, setFilePeek: noop, setRunPeek: noop }));
const backspace = (command, selectionStart, selectionEnd = selectionStart) => removesToken({ key: 'Backspace' }, { command, selectionStart, selectionEnd });

// Every fetch made while a test runs; none is allowed (no AI call on select, change, remove or display).
const calls = [];
const realFetch = globalThis.fetch;
test.beforeEach(() => { calls.length = 0; globalThis.fetch = (...args) => { calls.push(args); return Promise.reject(new Error('no fetch in UI-16')); }; });
test.afterEach(() => { globalThis.fetch = realFetch; assert.equal(calls.length, 0, 'no network call'); });

test('Backspace right after the pill removes it, even with text after it; anywhere else it edits the text', () => {
  assert.equal(backspace('3d', 0), true, 'caret at the start of "Create a camera..."');
  assert.equal(backspace('3d', 0), true);
  assert.equal(backspace('3d', 5), false, 'caret inside the text');
  assert.equal(backspace('3d', 0, 6), false, 'a selection from the start deletes the selected words, not the pill');
  assert.equal(backspace(null, 0), false, 'no pill: nothing to remove');
  assert.equal(removesToken({ key: 'Delete' }, { command: '3d', selectionStart: 0, selectionEnd: 0 }), false);
  assert.equal(removesToken({ key: 'a' }, { command: '3d', selectionStart: 0, selectionEnd: 0 }), false);
});

test('picking, switching and removing change only the command: the prompt stays and Send runs no hidden command', () => {
  let draft = { text: 'Create a camera frustum with a cube inside it', command: null, savedAt: 0 };
  draft = draftSlot(draft, { type: 'command', command: '3d', at: 1 });
  assert.deepEqual([draft.command, draft.text], ['3d', 'Create a camera frustum with a cube inside it']);
  assert.equal(commandLine(draft.text, { command: draft.command }), '/3d Create a camera frustum with a cube inside it');
  draft = draftSlot(draft, { type: 'command', command: 'motion', at: 2 }); // switching replaces the pill
  assert.deepEqual([draft.command, draft.text], ['motion', 'Create a camera frustum with a cube inside it']);
  draft = draftSlot(draft, { type: 'command', command: null, at: 3 }); // x or boundary Backspace
  assert.deepEqual([draft.command, draft.text], [null, 'Create a camera frustum with a cube inside it']);
  // Removed: the Send is a plain chat turn, never "/motion ..." (commandLine null means no command line).
  assert.equal(commandLine(draft.text, { command: draft.command }), null);
  assert.equal(commandLine('', { command: null }), null);
});

test('Undo and Redo bring back the pill and its command together, step by step, and leave text undo to the field', () => {
  const scope = 't1', text = 'a cube';
  let steps = recordStep(NO_STEPS, { scope, text, from: null, to: '3d' }); // picked
  steps = recordStep(steps, { scope, text, from: '3d', to: 'motion' }); // switched
  steps = recordStep(steps, { scope, text, from: 'motion', to: null }); // removed
  assert.equal(recordStep(steps, { scope, text, from: null, to: null }), steps, 'a no-change is no step');
  const walk = [];
  let state = { scope, text, command: null };
  for (const direction of ['undo', 'undo', 'undo', 'redo', 'redo', 'redo']) {
    const next = travel(steps, direction, state);
    assert.ok(next, direction);
    steps = next.steps; state = { ...state, command: next.command }; walk.push(next.command);
  }
  assert.deepEqual(walk, ['motion', '3d', null, '3d', 'motion', null]);
  assert.equal(travel(steps, 'redo', state), null, 'nothing left to redo');
  // Text typed since the step: the field undoes the typing first (travel answers null and the key is not taken).
  assert.equal(travel(steps, 'undo', { ...state, text: 'a cube!' }), null);
  // Another thread's steps never act here.
  assert.equal(travel(steps, 'undo', { ...state, scope: 't2' }), null);
  // A new step after an undo drops the redo branch.
  const undone = travel(steps, 'undo', state);
  assert.deepEqual(recordStep(undone.steps, { scope, text, from: 'motion', to: 'cad' }).redo, []);
  assert.equal(historyKey({ key: 'z', ctrlKey: true }), 'undo');
  assert.equal(historyKey({ key: 'z', metaKey: true }), 'undo');
  assert.equal(historyKey({ key: 'Z', ctrlKey: true, shiftKey: true }), 'redo');
  assert.equal(historyKey({ key: 'y', ctrlKey: true }), 'redo');
  assert.equal(historyKey({ key: 'z' }), null);
  assert.equal(historyKey({ key: 'Backspace', ctrlKey: true }), null);
});

test('the composer draws the pill inline before the text, and without a command draws no token', () => {
  const html = composer({ value: 'Create a camera frustum', token: pill('3d') });
  assert.match(html, /<div data-command-token="true" class="relative overflow-hidden"><span class="absolute z-\[1\] flex left-1 top-0"><span data-command-pill="3d"[^>]*>.*?>3d<.*?aria-label="Remove 3D scene".*?<\/span><\/span><textarea [^>]*style="text-indent:0"/);
  assert.ok(html.indexOf('data-command-pill') < html.indexOf('<textarea'), 'the pill comes before the text');
  assert.ok(html.indexOf('<textarea') < html.indexOf('data-composer-toolbar'), 'and the toolbar holds no pill');
  const plain = composer({ value: 'hi' });
  assert.doesNotMatch(plain, /data-command-token|data-command-pill|text-indent/);
  // The dock's single-line field gets the same token; with Voice on the pill stays visible beside the voice node.
  assert.match(composer({ stacked: false, dock: true, token: pill('motion') }), /data-command-token[^>]*>.*data-command-pill="motion".*<input [^>]*style="text-indent:0"/);
  const spoken = composer({ token: pill('motion'), voice: B.createElement('div', { 'data-voice-field': '' }) });
  assert.match(spoken, /data-command-token[^>]*><span data-command-pill="motion".*data-voice-field/);
  // Picked or typed, a chosen command makes Send ready even with no words (a bare /dive).
  assert.doesNotMatch(composer({ value: '', ready: true, token: pill('dive') }), /aria-label="Send" disabled/);
});

test('a sent message shows the command as a read-only pill, from its saved command or a legacy leading /command', () => {
  // New (recordCommand) and restored (repositories.js threadMessages: command from meta) messages.
  assert.deepEqual(sentCommand({ content: '/motion 15s explain photosynthesis', command: 'motion' }), { command: 'motion', text: '15s explain photosynthesis' });
  // A command whose words went to the chat route: the content is the prompt as sent, kept whole.
  assert.deepEqual(sentCommand({ content: 'Explain photosynthesis', command: 'explain' }), { command: 'explain', text: 'Explain photosynthesis' });
  // Legacy: no command saved, a registered command at the very start.
  assert.deepEqual(sentCommand({ content: '/3d a cube inside a frustum' }), { command: '3d', text: 'a cube inside a frustum' });
  assert.deepEqual(sentCommand({ content: '/MOTION', command: null }), { command: 'motion', text: '' });
  assert.deepEqual(sentCommand({ content: '/motion\nline two\n  indented' }), { command: 'motion', text: 'line two\n  indented' });
  // Owner, 2026-10-26: saved ids keep their meaning. A message saved by the old /image (command image) is still the photo search,
  // labelled by its id; a saved /generate-image line still reads as the generation; /photos and the new /image line read too.
  assert.deepEqual(sentCommand({ content: '/image Mount Fuji', command: 'image' }), { command: 'image', text: 'Mount Fuji' });
  assert.deepEqual(sentCommand({ content: '/image Mount Fuji' }), { command: 'image', text: 'Mount Fuji' }, 'no metadata: an old /image line is the photo search');
  assert.deepEqual(sentCommand({ content: '/generate-image a fox', command: 'generate-image' }), { command: 'generate-image', text: 'a fox' });
  assert.deepEqual(sentCommand({ content: '/image a fox', command: 'generate-image' }), { command: 'generate-image', text: 'a fox' });
  assert.deepEqual(sentCommand({ content: '/photos Mount Fuji' }), { command: 'image', text: 'Mount Fuji' });
  assert.deepEqual(sentCommand({ content: '/photos Mount Fuji', command: 'image' }), { command: 'image', text: 'Mount Fuji' });
  // Prose, code, a path and an unknown /word stay plain text.
  for (const content of ['make a /motion of this', '```\n/motion 15s\n```', '  /motion indented', '/usr/bin/env', '/motions are fun', '/nope hello', 'plain'])
    assert.deepEqual(sentCommand({ content }), { command: null, text: content }, content);
  assert.deepEqual(sentCommand({ content: '' }), { command: null, text: '' });
});

test('the transcript renders the pill inline with the words, with no x and no action, and leaves other messages as they were', () => {
  const msgs = [
    { role: 'user', messageId: 'local-q-1', content: '/motion 15s explain photosynthesis\nwith leaves', command: 'motion', status: 'done' },
    { role: 'user', messageId: '41', content: '/3d a cube', status: 'done' },
    { role: 'user', messageId: '42', content: 'what does /motion do?', command: null, status: 'done' },
  ];
  const before = JSON.stringify(msgs);
  const html = transcript(msgs);
  assert.match(html, /<span class="whitespace-pre-wrap break-words"><span data-command-pill="motion" data-command-tone="motion" class="[^"]*"><span class="inline-flex items-center gap-1 font-medium">motion<\/span><\/span>15s explain photosynthesis\nwith leaves<\/span>/);
  assert.match(html, /data-command-pill="3d"[^>]*><span [^>]*>3d<\/span><\/span>a cube<\/span>/);
  assert.match(html, />what does \/motion do\?</);
  assert.doesNotMatch(html, /Remove Animated explainer|Remove 3D scene|Change the command|>\/motion 15s|>\/3d a cube/);
  assert.equal((html.match(/data-command-pill/g) || []).length, 2);
  assert.equal(JSON.stringify(msgs), before, 'stored text and command untouched');
});

test('ask.jsx wires the token: boundary Backspace, x, Undo/Redo steps, and Send clears them', () => {
  const ask = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8');
  assert.match(ask, /if \(removesToken\(event, \{ command, selectionStart: event\.target\.selectionStart, selectionEnd: event\.target\.selectionEnd \}\)\) \{ event\.preventDefault\(\); removeCommand\(\); return; \} if \(commandHistory\(event\)\) return;/);
  assert.doesNotMatch(ask, /event\.key === 'Backspace' && !input/, 'the old empty-only rule is gone');
  assert.match(ask, /commandSteps\.current = NO_STEPS; setCommand\(null\);/);
  const messages = readFileSync(new URL('./ChatMessages.jsx', import.meta.url), 'utf8');
  assert.match(messages, /<SentText m=\{m\} \/>/);
});

// Slash pills (owner brief 2026-10-29, BRIEF-PILLS 1-4): what the Chat composer stores, shows and sends for a picked, typed or pasted
// command. typed is what a learner types; id the stable command id stored in the draft and the saved message (agent/slash.js typed).
const EIGHTEEN = [
  ['explain', 'explain'], ['practice', 'practice'], ['quiz', 'quiz'], ['flashcards', 'flashcards'], ['goal', 'goal'], ['code', 'code'],
  ['graph', 'graph'], ['diagram', 'diagram'], ['notebook', 'notebook'], ['image', 'generate-image'], ['motion', 'motion'], ['cad', 'cad'],
  ['3d', '3d'], ['browser', 'browser'], ['photos', 'image'], ['youtube', 'youtube'], ['arxiv', 'arxiv'], ['wikipedia', 'wikipedia'],
];
const LIVE = { motionDev: true };
const withImages = (on, run) => { setImageGeneration(on); try { return run(); } finally { setImageGeneration(false); } };
const shownPill = name => B.renderToStaticMarkup(B.createElement(B.CommandPill, { name })).match(/data-command-pill="([^"]+)".*?font-medium">([^<]*)</).slice(1);

test('Chat: each of the 18 picked, typed, uppercase or pasted stores its id, shows its typed pill and sends its typed line', () => withImages(true, () => {
  assert.equal(EIGHTEEN.length, 18);
  for (const [typed, id] of EIGHTEEN) {
    // Picked (LearnSlash choose writes "/typed ") and typed with a separator: the pill, and the words typed before the palette come back.
    assert.deepEqual(token.composerCommand(`/${typed} `, 'my draft', LIVE), { command: id, text: 'my draft' }, `picked /${typed}`);
    assert.deepEqual(token.composerCommand(`/${typed} `, null, LIVE), { command: id, text: '' }, `typed /${typed}`);
    assert.deepEqual(token.composerCommand(`/${typed.toUpperCase()} `, null, LIVE), { command: id, text: '' }, `uppercase /${typed.toUpperCase()}`);
    // Pasted with its words: the words stay exactly as pasted.
    const words = 'two  words\nand a line';
    assert.deepEqual(token.composerCommand(`/${typed} ${words}`, 'my draft', LIVE), { command: id, text: words }, `pasted /${typed}`);
    // The visible pill is the typed name; the outgoing line is the typed line; the saved message restores the same pill.
    assert.deepEqual(shownPill(id), [id, typed], `pill ${id}`);
    const line = commandLine(words, { command: id });
    assert.equal(line, `/${typed} ${words}`, `line /${typed}`);
    assert.equal(lineCommand(line), id, `sent id /${typed}`);
    assert.deepEqual(sentCommand({ content: line, command: lineCommand(line) }), { command: id, text: words }, `restored /${typed}`);
  }
  // Not a command and its separator: text.
  for (const value of ['/image', '/', 'the /image of it', ' /image ', '/usr/bin/env ', '/nope ']) assert.equal(token.composerCommand(value, null, LIVE), null, value);
}));

test('Chat: /image is the generation and /photos the search; aliases resolve; a typed command replaces the pill; nothing else changes', () => withImages(true, () => {
  // The confirmed bug: "/image " became the photos pill (id image) and sent /photos; "/photos " made no pill and left the old one.
  assert.deepEqual(token.composerCommand('/image ', null), { command: 'generate-image', text: '' });
  assert.deepEqual(token.composerCommand('/photos ', null), { command: 'image', text: '' });
  // Registered aliases: /generate-image is /image; /photo is /photos (one command, photos stays its pill and menu name).
  assert.deepEqual(token.composerCommand('/generate-image a fox', null), { command: 'generate-image', text: 'a fox' });
  assert.deepEqual(token.composerCommand('/photo Mount Fuji', null), { command: 'image', text: 'Mount Fuji' });
  assert.deepEqual(token.composerCommand('/PHOTO ', null), { command: 'image', text: '' });
  assert.deepEqual(shownPill('image'), ['image', 'photos']);
  assert.equal(commandLine('Mount Fuji', { command: 'image' }), '/photos Mount Fuji');
  // Replacing a stale pill: the draft's command becomes the newly typed one and the text stays (draftSlot is the Chat's draft store).
  let draft = { text: 'keep me', command: 'image', savedAt: 0 };
  draft = draftSlot(draft, { type: 'command', command: token.composerCommand('/image ', null).command, at: 1 });
  assert.deepEqual([draft.command, draft.text], ['generate-image', 'keep me']);
  draft = draftSlot(draft, { type: 'command', command: token.composerCommand('/photos ', null).command, at: 2 });
  assert.deepEqual([draft.command, draft.text], ['image', 'keep me']);
  draft = draftSlot(draft, { type: 'command', command: null, at: 3 });
  assert.deepEqual([draft.command, draft.text], [null, 'keep me']);
}));

test('Chat: unavailable /image says image generation is unavailable and never becomes the photo search; removed commands stay text', async () => {
  setImageGeneration(false);
  for (const value of ['/image ', '/IMAGE a cat', '/generate-image a cat']) assert.equal(token.composerCommand(value, null), null, value);
  const inserted = [];
  const canvas = { insertBlock: block => { inserted.push(block); return 'b1'; } };
  const post = () => { throw Error('no request'); };
  for (const line of ['/image a cat', '/IMAGE a cat', '/generate-image a cat']) {
    const out = await runLearnCommand(line, { app: 'a', canvas, post, openSearch: () => { throw Error('no search'); } });
    assert.match(out.notice.text, /^Image generation is not available here\./, line);
  }
  assert.deepEqual(inserted, [], 'no photo search card');
  // /photo still searches with generation off.
  assert.deepEqual(token.composerCommand('/photo ', null), { command: 'image', text: '' });
  // Removed commands, and /motion where it is not offered, stay text: Send says they are unavailable.
  for (const name of ['dive', 'whiteboard', 'video']) {
    assert.equal(token.composerCommand(`/${name} x`, null, LIVE), null, name);
    assert.match((await runLearnCommand(`/${name} x`, { app: 'a', canvas, post })).notice.text, new RegExp(`^/${name} is no longer available`), name);
  }
  assert.equal(token.composerCommand('/motion ', null, { motionDev: false }), null);
});

test('saved messages and drafts keep their ids: legacy image messages and drafts restore their original pill', () => withImages(true, () => {
  // An old message saved by the photo search (command image), with or without metadata, is still photos; a generation is image.
  assert.deepEqual(sentCommand({ content: '/image Mount Fuji', command: 'image' }), { command: 'image', text: 'Mount Fuji' });
  assert.deepEqual(sentCommand({ content: '/image Mount Fuji' }), { command: 'image', text: 'Mount Fuji' });
  assert.deepEqual(sentCommand({ content: '/generate-image a fox', command: 'generate-image' }), { command: 'generate-image', text: 'a fox' });
  assert.deepEqual(sentCommand({ content: '/photo Mount Fuji', command: 'image' }), { command: 'image', text: 'Mount Fuji' });
  const html = transcript([
    { role: 'user', messageId: '1', content: '/image Mount Fuji', command: 'image', status: 'done' },
    { role: 'user', messageId: '2', content: '/image a fox', command: 'generate-image', status: 'done' },
  ]);
  assert.match(html, /data-command-pill="image"[^>]*><span [^>]*>photos<\/span><\/span>Mount Fuji/);
  assert.match(html, /data-command-pill="generate-image"[^>]*><span [^>]*>image<\/span><\/span>a fox/);
  // A restored draft (chat-draft.js keeps the id): the pill reads from the id, never from a rename.
  for (const [id, typed] of [['image', 'photos'], ['generate-image', 'image']]) assert.deepEqual(shownPill(draftSlot({ text: '', command: null, savedAt: 0 }, { type: 'command', command: id, at: 1 }).command), [id, typed]);
}));
