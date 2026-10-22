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
import { NO_STEPS, historyKey, recordStep, removesToken, sentCommand, travel } from './command-token.js';
import { draftSlot } from './chat-draft.js';
import { commandLine } from './learn-slash.js';

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
  assert.match(html, /<div data-command-token="true" class="relative overflow-hidden"><span class="absolute z-\[1\] flex left-1 top-0"><span data-command-pill="3d"[^>]*>.*?3D.*?aria-label="Remove 3D".*?<\/span><\/span><textarea [^>]*style="text-indent:0"/);
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
  assert.match(html, /<span class="whitespace-pre-wrap break-words"><span data-command-pill="motion" data-command-tone="motion" class="[^"]*"><span class="inline-flex items-center gap-1 font-medium">Motion<\/span><\/span>15s explain photosynthesis\nwith leaves<\/span>/);
  assert.match(html, /data-command-pill="3d"[^>]*><span [^>]*>3D<\/span><\/span>a cube<\/span>/);
  assert.match(html, />what does \/motion do\?</);
  assert.doesNotMatch(html, /Remove Motion|Remove 3D|Change the command|>\/motion 15s|>\/3d a cube/);
  assert.equal((html.match(/data-command-pill/g) || []).length, 2);
  assert.equal(JSON.stringify(msgs), before, 'stored text and command untouched');
});

test('ask.jsx wires the token: boundary Backspace, x, Undo/Redo steps, and Send clears them', () => {
  const ask = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8');
  assert.match(ask, /if \(removesToken\(event, \{ command, selectionStart: event\.target\.selectionStart, selectionEnd: event\.target\.selectionEnd \}\)\) \{ event\.preventDefault\(\); removeCommand\(\); return; \} if \(commandHistory\(event\)\) return;/);
  assert.doesNotMatch(ask, /event\.key === 'Backspace' && !input/, 'the old empty-only rule is gone');
  assert.match(ask, /if \(chosen && slash\.isCommand\?\.\(chosen\[1\]\)\) \{ changeCommand\(chosen\[1\], stash\.current \?\? ''\);/);
  assert.match(ask, /commandSteps\.current = NO_STEPS; setCommand\(null\);/);
  const messages = readFileSync(new URL('./ChatMessages.jsx', import.meta.url), 'utf8');
  assert.match(messages, /<SentText m=\{m\} \/>/);
});
