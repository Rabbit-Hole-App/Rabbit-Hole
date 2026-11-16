// The Tutor prompt loader and the code-explain route (docs tutor-prompts-and-routing.md sections 1, 2, 9). No model call: the
// router's JEV call is a stub and nothing here reaches a provider.
import '../../web/src/agent/slash-flags-test-on.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { OVERLAY_MAX_LINES, codebaseUseId, composeTutorPrompt, repositoryChatPrompt, tutorRecord } from '../src/tutor-prompt.js';
import { TUTOR_PROMPT_FILES } from '../src/tutor-prompts.generated.js';
import { renderTutorPrompts } from '../scripts/build-tutor-prompts.mjs';
import { REPOSITORY_SYSTEM } from '../src/agents/learn-chat.js';
import { CODEBASE_USES } from '../../web/src/learn-codebase-goals.js';
import { CODE_CAPABILITIES, CHAT_CAPABILITIES, CHAT_ROUTES, chatRoutesWith } from '../../web/src/inline-ai-route.js';
import { decideChat, decideCodebaseUse, hasCodeRef, verifyChatRoute } from '../src/chat-capability-route.js';

const read = path => readFileSync(new URL(`../src/prompts/tutor/${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sha = text => createHash('sha256').update(text).digest('hex');
const body = text => text.replace(/\s+$/, '');
const FILES = { 'base.md': { text: 'BASE\n', sha256: 'b' }, 'tasks/chat.md': { text: 'CHAT\n', sha256: 't' }, 'uses/ok.md': { text: 'one\ntwo\n', sha256: 'u' } };

test('the bundled prompt module is exactly what the .md sources generate (run npm run prompts:build after editing a prompt)', () => {
  assert.equal(readFileSync(new URL('../src/tutor-prompts.generated.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), renderTutorPrompts());
});

test('composition is base, then task, then the use-case overlay, with the three hashes of the files', () => {
  const composed = composeTutorPrompt({ task: 'chat', use: 'use_codebase' });
  assert.equal(composed.text, [body(read('base.md')), body(read('tasks/chat.md')), body(read('uses/use_codebase.md'))].join('\n\n'));
  assert.deepEqual(composed.layers, { base: sha(read('base.md')), task: sha(read('tasks/chat.md')), use: sha(read('uses/use_codebase.md')) });
  assert.deepEqual([composed.task, composed.use], ['chat', 'use_codebase']);
  const bare = composeTutorPrompt({ task: 'chat' });
  assert.equal(bare.text, [body(read('base.md')), body(read('tasks/chat.md'))].join('\n\n'), 'no goal: base and task only');
  assert.deepEqual([bare.use, bare.layers.use], [null, null]);
  assert.ok(composed.text.startsWith(bare.text), 'the overlay comes last');
});

test('the seven tasks and all fourteen overlays load, and a stub says it is not built', () => {
  for (const task of ['chat', 'code-explain', 'plan', 'runbook', 'learn-intro', 'learn-fit', 'learn-plan']) assert.ok(composeTutorPrompt({ task }).text.startsWith(body(read('base.md'))), task);
  assert.equal(CODEBASE_USES.length, 14);
  for (const use of CODEBASE_USES) {
    assert.equal(use.promptFile, `uses/${use.id}.md`, `${use.id} names its overlay file`);
    const composed = composeTutorPrompt({ task: 'chat', use: use.id });
    assert.ok(composed.text.endsWith(body(read(use.promptFile))), use.id);
    assert.ok(composed.layers.use, use.id);
    if (!use.enabled) assert.equal(body(read(use.promptFile)), 'This use is not built yet. Explain as with no use-case overlay.', `${use.id} is a stub`);
  }
  assert.equal(CODEBASE_USES.filter(use => use.enabled).length, 6);
  assert.equal(Object.keys(TUTOR_PROMPT_FILES).filter(path => path.startsWith('uses/')).length, 14, 'no overlay file without a use');
  for (const use of CODEBASE_USES.filter(use => use.enabled)) assert.ok(read(use.promptFile).split('\n').length - 1 <= OVERLAY_MAX_LINES);
});

test('the loader refuses a missing task file, an unknown overlay, a long overlay and an overriding one', () => {
  assert.equal(composeTutorPrompt({ task: 'chat', use: 'ok' }, FILES).text, 'BASE\n\nCHAT\n\none\ntwo');
  assert.throws(() => composeTutorPrompt({ task: 'plan' }, FILES), /no task file for "plan"/);
  assert.throws(() => composeTutorPrompt({ task: '../base' }, FILES), /no task file/);
  assert.throws(() => composeTutorPrompt({ task: 'chat', use: 'nope' }, FILES), /no use-case overlay for "nope"/);
  assert.throws(() => composeTutorPrompt({ task: 'chat' }, {}), /base\.md is missing/);
  const over = text => composeTutorPrompt({ task: 'chat', use: 'bad' }, { ...FILES, 'uses/bad.md': { text, sha256: 'x' } });
  assert.doesNotThrow(() => over(Array.from({ length: OVERLAY_MAX_LINES }, (_, i) => `line ${i}`).join('\n') + '\n'), 'exactly 25 lines is allowed');
  assert.throws(() => over(Array.from({ length: OVERLAY_MAX_LINES + 1 }, (_, i) => `line ${i}`).join('\n')), /26 lines/);
  for (const word of ['Ignore', 'override', 'Instead of the above']) assert.throws(() => over(`Please ${word} the rules.`), /must not contain/, word);
});

test('every sentence of the earlier REPOSITORY_SYSTEM survives in the composed chat prompt', () => {
  const before = readFileSync(new URL('./repository-system-before-tutor-prompts.txt', import.meta.url), 'utf8');
  const sentences = before.split(/(?<=[.?!])\s+(?=[A-Z])/).map(sentence => sentence.trim()).filter(Boolean);
  assert.ok(sentences.length >= 15, `${sentences.length} sentences`);
  const chat = composeTutorPrompt({ task: 'chat' }).text, withGoal = repositoryChatPrompt('debug_behavior').text;
  for (const sentence of sentences) {
    assert.ok(chat.includes(sentence), `kept: ${sentence.slice(0, 60)}`);
    assert.ok(withGoal.includes(sentence), `kept with a goal: ${sentence.slice(0, 60)}`);
  }
  assert.equal(REPOSITORY_SYSTEM, chat, 'the constant the other modules import is the composed chat prompt');
  assert.ok(chat.startsWith(body(read('base.md'))) && chat.includes(body(read('tasks/chat.md')).split('\n\n')[0]), 'the doc\'s base and chat text come first, unedited');
});

test('a use is only ever one of the fourteen ids, and the record names task, use, three hashes, route and model', () => {
  assert.deepEqual(['understand_feature', 'nope', null, 7, '../x'].map(codebaseUseId), ['understand_feature', null, null, null, null]);
  assert.equal(repositoryChatPrompt('nope').use, null, 'an unknown id is no goal, never an error or a file read');
  const composed = composeTutorPrompt({ task: 'chat', use: 'use_codebase' });
  assert.deepEqual(tutorRecord(composed, { route: { use: 'use_codebase', confidence: 0.9 }, model: 'claude-sonnet-5-5' }), { task: 'chat', use: 'use_codebase', layers: composed.layers, route: { use: 'use_codebase', confidence: 0.9 }, model: 'claude-sonnet-5-5' });
  assert.deepEqual(tutorRecord(composeTutorPrompt({ task: 'chat' })), { task: 'chat', use: null, layers: { base: sha(read('base.md')), task: sha(read('tasks/chat.md')), use: null }, route: null, model: null });
});

// ---- routing: code-explain is offered only while the chat holds a code ref -------------------------------------------------
const untouchable = new Proxy({}, { get: (_, key) => { throw new Error(`touched ${String(key)}`); } });
const ENV = { INLINE_DECISION_KEY: 'k'.repeat(40), VERCEL_TYPESAFE_API_KEY: 'test-only', LEARN_DB: untouchable, DB: untouchable, LEARN_VIDEOS: untouchable };
const EMAIL = 'owner@example.test';
const CODE_REF = { sourceId: 'code:acme/lab@' + 'a'.repeat(40) + ':lab.py', kind: 'code', name: 'lab.py', version: '', range: { path: 'lab.py', start: 1, end: 5 } };
const fieldsOf = (text, source_refs = null) => ({ app: 'canvas-0a1b2c3d', text, mode: 'auto', selection: null, source_refs, motion: null });
const jev = (choice, probability, confidence = 0.9) => ({ body: { model: 'jev-1.13.0', answers: { route: { type: 'choice', choice, confidence, probabilities: { [choice]: probability } } } }, ms: 40, model: 'jev-1.13.0', inputTokens: 600, cost: 0.0004 });
const asked = reply => { const ask = async (...args) => { ask.calls.push(args); return reply; }; ask.calls = []; return ask; };
const decide = (ask, text, refs, over = {}) => decideChat(ENV, { email: EMAIL, app: 'canvas-0a1b2c3d', requestId: 'req-00000001', fields: fieldsOf(text, refs), capability: null, enabled: null, ...over }, { ask });
const offered = ask => Object.keys(ask.calls[0][1].questions.route.criteria);

test('code-explain is a declared route, not a command: never in CHAT_CAPABILITIES or the default routes, offered only through chatRoutesWith', () => {
  assert.equal(CODE_CAPABILITIES['code-explain'].flow, 'direct');
  assert.match(CODE_CAPABILITIES['code-explain'].intent, /how a specific piece of this repository's code works/);
  assert.ok(!('code-explain' in CHAT_CAPABILITIES) && !('code-explain' in CHAT_ROUTES) && !('code-explain' in chatRoutesWith()));
  assert.ok('code-explain' in chatRoutesWith(['code-explain']));
  assert.deepEqual([[CODE_REF], [{ kind: 'doc', sourceId: 'doc:1' }], [{ sourceId: 'code:x@y:z' }], [], null, undefined].map(hasCodeRef), [true, false, true, false, false, false]);
});

test('with a code ref in the chat the router is offered code-explain and an above-threshold pick routes to it, with its confidence in the signed decision', async () => {
  const ask = asked(jev('code-explain', 0.95, 0.88));
  const out = await decide(ask, 'how does attention hide later tokens?', [CODE_REF]);
  assert.ok(offered(ask).includes('code-explain'));
  assert.deepEqual([out.route, out.capability, out.flow, out.via], ['capability:code-explain', 'code-explain', 'direct', 'jev']);
  const turn = { scope: { app: 'canvas-0a1b2c3d' }, message: 'how does attention hide later tokens?', mode: 'auto', context_refs: [CODE_REF], route_token: out.token };
  assert.deepEqual(await verifyChatRoute(ENV, turn, EMAIL), { cap: 'code-explain', flow: 'direct', confidence: 0.88 });
  assert.equal(await verifyChatRoute(ENV, { ...turn, context_refs: [] }, EMAIL), null, 'the decision is bound to the refs it was made with');
});

test('with no code ref code-explain is not offered, cannot be picked, and the question stays an ordinary answer', async () => {
  for (const refs of [null, [], [{ kind: 'doc', sourceId: 'doc:1', name: 'Notes.pdf' }]]) {
    const ask = asked(jev('answer', 0.97));
    const out = await decide(ask, 'how does attention hide later tokens?', refs);
    assert.ok(!offered(ask).includes('code-explain'), JSON.stringify(refs));
    assert.equal(out.route, 'answer');
    assert.equal((await decide(asked(jev('code-explain', 0.99)), 'how does attention hide later tokens?', refs)).route, 'answer', 'a router that names it anyway is a fallback answer');
  }
  const asker = asked(jev('answer', 0.97));
  assert.equal((await decide(asker, 'how does attention hide later tokens?', [], { capability: 'code-explain' })).route, 'answer', 'a client naming it with no code ref gets no token');
  assert.equal(asker.calls.length, 0);
});

test('below the threshold a code question is an ordinary answer, never a guess', async () => {
  const out = await decide(asked(jev('code-explain', 0.4, 0.9)), 'what do these lines do?', [CODE_REF]);
  assert.deepEqual([out.route, out.via, out.token], ['answer', 'jev-low', null]);
});

test('the intake decision carries route { use, confidence }, null when nothing was chosen', async () => {
  const chosen = await decideCodebaseUse(ENV, { requestId: 'req-00000002', text: 'I just want to see it run' }, { ask: asked(jev('use_codebase', 0.96, 0.9)) });
  assert.deepEqual([chosen.use, chosen.route], ['use_codebase', { use: 'use_codebase', confidence: 0.9 }]);
  const unsure = await decideCodebaseUse(ENV, { requestId: 'req-00000003', text: 'hm' }, { ask: asked(jev('use_codebase', 0.3, 0.9)) });
  assert.deepEqual([unsure.use, unsure.route], [null, null]);
});
