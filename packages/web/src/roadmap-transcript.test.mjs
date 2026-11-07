// Fix B (T4): the roadmap's Chat lines as transcript items (roadmap-transcript.js), drawn by the existing ChatMessage and
// ChatOutputs (RoadmapTranscript.jsx); roadmap lines are not ordinary answers; Depth is confirmed for this source before planning.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { initialState, invitationOf, reduce } from './roadmap-client.js';
import { invitationClientId, invitationThreadId, roadmapThreadClientId, threadCandidate, transcriptOf } from './roadmap-transcript.js';
import { responseKind } from './chat-response-kind.js';
import { createRoadmapController } from './roadmap-controller.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const body = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const at = name => reduce(initialState(), { type: 'view', view: body(name) });
const offered = () => reduce(initialState(), { type: 'invitation', invitation: body('invitation-offered').invitation });

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
  const ready = transcriptOf(at('status-proposed-plan')).find(i => i.key.endsWith(':plan'));
  assert.equal(ready.review, 'Your plan is ready to review.', 'the existing line is itself the link to Contents');
  assert.equal(ready.m, null);
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
  const line = transcriptOf(at('status-questioning')).find(i => i.m?.content);
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
  assert.equal(lib.footerShown(transcriptOf(at('status-questioning')).find(i => i.m?.content).m), false, 'a roadmap line has no rating footer');
  assert.match(render(at('status-proposed-plan')), /data-roadmap-review[^>]*>[\s\S]*Your plan is ready to review\./);
  const pending = render(at('status-active-proposal-pending'));
  assert.match(pending, /data-roadmap-pill/);
  // Owner 2026-11-06 (J2): the Chat copy of the pill has no [Tab] hint, Tab does not accept in Chat; the canvas pill keeps it (roadmap-view.test.mjs).
  assert.match(pending, /data-roadmap-accept[^>]*>Accept<\/button>/);
  assert.doesNotMatch(pending, /<kbd[^>]*>Tab<\/kbd>/);
  assert.match(pending, /data-roadmap-cancel[^>]*>Cancel</);
});

test('Explain on canvas asks for this source Depth first: the line, the depth row, no other choice; nothing is created yet', () => {
  const state = offered(), invitation = invitationOf(state);
  const items = transcriptOf(state, { invitation, choosing: true });
  assert.equal(items[0].actions, undefined, 'the two choices give way to the Depth row');
  const depth = items.find(i => i.depth);
  assert.equal(depth.m.content, `Choose a depth for ${state.invitation.title}.`);
  assert.doesNotMatch(depth.m.content, /\.\.\.|…|\$|credit/);
});

test('the pending proposal in Chat is the same pill and version as the canvas; none while checking or in Ask', () => {
  const state = at('status-active-proposal-pending');
  const item = transcriptOf(state).find(i => i.pill);
  assert.equal(item.pill.version, state.view.proposal.version);
  assert.ok(item.key.endsWith(`:proposal:${state.view.proposal.id}:${state.view.proposal.version}`));
  assert.match(item.m.content, new RegExp(state.view.proposal.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(transcriptOf({ ...state, mode: 'ask' }).some(i => i.pill), false);
});

test('Start planning creates the roadmap with the confirmed Depth and the flow instruction, never the canvas setting', async () => {
  const calls = [];
  const api = async (path, opts = {}) => { calls.push({ path, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null }); if (path.includes('/invitations') && !opts.method) return body('invitation-offered'); if (!opts.method) return { roadmap: null }; return body('create-response-draft'); };
  const controller = createRoadmapController({ api, boardId: 'lb_7c1e5a90d2b84f63a1c07e92', host: { readOnly: () => false, depth: () => 'standard', instruction: () => 'scraped', sourceRev: () => 'rev1', hasBlock: () => false }, schedule: () => 0, cancel() {}, random: () => 'k1aaaaaaaa' });
  controller.start(); await new Promise(r => setTimeout(r, 10));
  await controller.explain({ depth: 'deep', instruction: '' });
  const create = calls.find(c => c.method === 'POST' && c.body?.invitationId);
  assert.equal(create.body.depth, 'deep');
  assert.equal(create.body.instruction, '', 'the explicit (empty) instruction of this flow, not a host read');
});

// T8 (owner plan): the Chat proposal message offers the existing R5 Edit only when the server says editing is on (view.edit, ROADMAP_EDIT_ENABLED); in production it is off.
test('the proposal message shows the existing Edit (ProposalTools) only when view.edit is true, and it opens the one editor (controller.openEditor)', () => {
  const plain = at('status-active-proposal-pending');
  assert.doesNotMatch(render(plain), /data-roadmap-edit/, 'flag off: no Edit');
  const editable = reduce(initialState(), { type: 'view', view: { ...plain.view, edit: true } });
  const markup = render(editable);
  assert.match(markup, /data-roadmap-pill=[\s\S]*data-roadmap-edit="true"[^>]*>Edit</, 'the same Edit button, beside the pill');
  assert.doesNotMatch(markup, /data-roadmap-editor/, 'the editor itself opens in the proposal overlay, never here');
  assert.doesNotMatch(render(reduce(initialState(), { type: 'view', view: { ...plain.view, edit: true, proposal: { ...plain.view.proposal, link: { cardId: 'c' } } } })), /data-roadmap-edit/, 'a linked card has nothing to edit');
});

// The Tutor thread is the roadmap's, kept on the server (owner 2026-11-06): the same on every device.
test('an invitation has one Tutor thread id on every device: derived from the invitation, in the Chat thread id format', async () => {
  const a = await invitationThreadId('inv_a1b2c3'), again = await invitationThreadId('inv_a1b2c3'), other = await invitationThreadId('inv_zzz');
  assert.equal(a, again, 'a second device computes the same thread');
  assert.notEqual(a, other);
  assert.match(a, /^canvaschat-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.match(roadmapThreadClientId('rm_5f0c1a7e9b3d4c2a8e6f1b07'), /^[A-Za-z0-9_-]{1,80}$/);
});
test('the thread recorded for an unbound roadmap: the browser\'s old binding, else the open thread only if it holds an invitation, else a fresh one', () => {
  const inv = [{ role: 'assistant', clientId: invitationClientId('inv_1') }], plain = [{ role: 'user', clientId: 'turn-1' }];
  assert.equal(threadCandidate({ legacy: 'canvaschat-old', openId: 'canvaschat-open', msgs: inv }), 'canvaschat-old');
  assert.equal(threadCandidate({ openId: 'canvaschat-open', msgs: inv }), 'canvaschat-open');
  assert.equal(threadCandidate({ openId: 'canvaschat-open', msgs: plain }), null, 'an unrelated thread is never taken over');
  assert.equal(threadCandidate({ openId: null, msgs: inv }), null, 'a new chat (the bound thread was just deleted): a fresh thread');
});
