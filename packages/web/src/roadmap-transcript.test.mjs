// Fix B (T4): the roadmap's Chat lines as transcript items (roadmap-transcript.js), drawn by the existing ChatMessage and
// ChatOutputs (RoadmapTranscript.jsx); the old Tutor entry yields to the roadmap; roadmap lines are not ordinary answers.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { initialState, invitationOf, reduce } from './roadmap-client.js';
import { invitationClientId, transcriptOf } from './roadmap-transcript.js';
import { responseKind } from './chat-response-kind.js';
import { retiredForRoadmap } from './learn-coaching-entry.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const body = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const at = name => reduce(initialState(), { type: 'view', view: body(name) });
const offered = () => reduce(initialState(), { type: 'invitation', invitation: body('invitation-offered').invitation });

test('the old Tutor entry (welcome, "no active lesson" choices) yields to the roadmap; a saved activity return does not', () => {
  for (const kind of ['welcome', 'existing_work']) {
    assert.equal(retiredForRoadmap({ kind }, true), true, kind);
    assert.equal(retiredForRoadmap({ kind }, false), false, `${kind} with the roadmap off`);
  }
  for (const kind of ['resume', 'completed', 'quiet', 'loading']) assert.equal(retiredForRoadmap({ kind }, true), false, kind);
});

test('the invitation: its sentence and the two choices; once saved in the thread only the choices are added', () => {
  const state = offered(), invitation = invitationOf(state);
  const [item] = transcriptOf(state, { invitation });
  assert.equal(item.m.content, invitation.text);
  assert.deepEqual(item.actions.map(a => a.run.kind), ['explain_on_canvas', 'keep_here']);
  const [kept] = transcriptOf(state, { invitation, saved: true });
  assert.equal(kept.m, null, 'the saved message already shows the sentence');
  assert.equal(kept.key, item.key);
  assert.match(invitationClientId(invitation.id), /^roadmap-inv-[A-Za-z0-9_-]{1,68}$/);
});

test('polling redraws the same keys, never a second planning or ready line; nothing is a learner message', () => {
  for (const name of ['create-response-draft', 'status-proposed-plan', 'status-questioning', 'status-limitation', 'status-delivered-next-ready', 'status-failed-card', 'status-held-for-checking']) {
    const once = transcriptOf(at(name)), twice = transcriptOf(reduce(at(name), { type: 'view', view: body(name) }));
    assert.deepEqual(twice.map(i => i.key), once.map(i => i.key), name);
    assert.equal(new Set(once.map(i => i.key)).size, once.length, `${name}: unique keys`);
    for (const item of once) if (item.m) assert.equal(item.m.role, 'assistant', name);
  }
});

test('planning and checking use the waiting row; plan ready is text; a question carries its options', () => {
  const planning = transcriptOf(at('create-response-draft')).find(i => i.key.endsWith(':planning'));
  assert.equal(planning.m.content, '');
  assert.equal(planning.m.status, 'Planning your roadmap');
  assert.match(transcriptOf(at('status-proposed-plan')).find(i => i.key.endsWith(':plan')).m.content, /ready to review/);
  const question = transcriptOf(at('status-questioning')).find(i => i.actions?.some(a => a.run.kind === 'answer'));
  assert.ok(question, 'the plan question offers its options');
  const held = transcriptOf(at('status-held-for-checking')).find(i => /:held:/.test(i.key));
  assert.equal(held.m.content, '');
});

test('a delivered card is reached by Go to card; a failed one is an error row with no Retry, Replace or Omit', () => {
  const delivered = transcriptOf(at('status-delivered-next-ready')).filter(i => i.outputs);
  assert.ok(delivered.length >= 1);
  for (const item of delivered) { assert.match(item.outputs[0].cardId, /^cd_/); assert.equal(item.outputs[0].kind, 'explanation'); }
  const failed = transcriptOf(at('status-failed-card')).filter(i => i.m?.content.startsWith('✗ '));
  assert.equal(failed.length, 1);
  assert.match(failed[0].m.content, /could not be made/);
  assert.equal(failed[0].actions, undefined);
  for (const item of transcriptOf(at('status-failed-card'))) assert.ok(!(item.actions || []).some(a => /retry|replace|omit/i.test(a.label)));
});

test('a roadmap line is not an ordinary answer (no Regenerate, Add as card, Explore next) and has no rating footer', () => {
  const [line] = transcriptOf(at('status-proposed-plan'));
  assert.equal(responseKind(line.m, null).ordinary, false);
  assert.equal(responseKind({ role: 'assistant', content: 'x', clientId: 'roadmap-inv-iv_1' }, null).ordinary, false, 'the saved invitation after a reload');
  assert.equal(responseKind({ role: 'assistant', content: 'x' }, { role: 'user', content: 'hi' }).ordinary, true);
});

// The component: ChatMessage text inside the transcript, the invitation's two buttons, Go to card through ChatOutputs.
const tmp = mkdtempSync(join(tmpdir(), 'roadmap-transcript-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
// As answer-footer.test.mjs: Vite's ?url imports and assets are stubbed, so ChatMessage bundles for node.
const viteUrl = { name: 'vite-url', setup(build) {
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
  build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { default as RoadmapTranscript } from './RoadmapTranscript.jsx'; export { footerShown } from './AnswerFooter.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const lib = createRequire(import.meta.url)(outfile);
const chat = { canvas: 'canvas-0a1b2c3d', thread: { id: null, status: 'loading', mode: 'auto' }, panels: { openChat() {} }, canvasOps: { hasBlock: () => true, locate() {} } };
const render = (state, msgs = []) => lib.renderToStaticMarkup(lib.createElement(lib.RoadmapTranscript, { roadmap: { controller: {}, state, invitation: invitationOf(state), editPlan() {} }, chat, msgs }));

test('RoadmapTranscript renders through ChatMessage and ChatOutputs, with the invitation buttons the checks look for', () => {
  const invite = render(offered());
  assert.match(invite, /data-roadmap-invitation=/);
  assert.match(invite, /data-roadmap-explain[^>]*>Explain on canvas</);
  assert.match(invite, /data-roadmap-keep[^>]*>Just keep it here</);
  assert.match(invite, /data-answer-body/, 'the sentence is a ChatMessage answer body');
  assert.match(render(at('status-delivered-next-ready')), /data-chat-output="cd_/);
  assert.match(render(at('status-failed-card')), /role="alert"/);
  assert.doesNotMatch(render(at('status-failed-card')), />(Retry|Replace|Omit)</);
  assert.equal(render(initialState()), '');
  assert.equal(lib.footerShown(transcriptOf(at('status-proposed-plan'))[0].m), false, 'a roadmap line has no rating footer');
});
