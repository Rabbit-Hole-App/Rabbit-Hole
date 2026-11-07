// The Tutor's Chat entries (BRIEF contract 6; checklist UI.01, UI.03, UI.08; BE.01/BE.03/BE.04/BE.09/BE.11): one logical persisted message per
// stable client_id derived from the server view (roadmap-transcript.js entriesOf), drawn by the existing ChatMessage (RoadmapTranscript.jsx).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { initialState, invitationOf, reduce } from './roadmap-client.js';
import { ensureTutorThread, entriesOf, historyActions, invitationClientId, invitationThreadId, mdName, occupied, restoredDraft, roadmapEditTarget, roadmapThreadClientId, stepClientId, threadCandidate, toSave } from './roadmap-transcript.js';
import { responseKind } from './chat-response-kind.js';
import { createRoadmapController } from './roadmap-controller.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const body = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const at = (name, patch = v => v) => reduce(initialState(), { type: 'view', view: patch(body(name)) });
const offered = () => reduce(initialState(), { type: 'invitation', invitation: body('invitation-offered').invitation });
const ids = entries => entries.map(e => e.clientId);
const labels = entry => entry.actions.map(a => a.label);

test('UI.01: occupied = messages, a nonempty unsent draft (text or command) or a conversation not loaded; a fresh empty chat is not', () => {
  assert.equal(occupied({ status: 'ready', messages: [], draft: { text: '  ', command: null } }), false, 'fresh: no chooser');
  assert.equal(occupied({ status: 'ready', messages: [{ role: 'user', content: 'hi' }] }), true);
  assert.equal(occupied({ status: 'ready', messages: [], draft: { text: 'half a question', command: null } }), true, 'draft-only (an unsaved .new draft)');
  assert.equal(occupied({ status: 'ready', messages: [], draft: { text: '', command: 'graph' } }), true);
  assert.equal(occupied({ status: 'loading', messages: [] }), true, 'loading is never mistaken for empty');
  assert.equal(occupied({ status: 'error', messages: [] }), true);
});

test('UI.01: occupied Chat shows Start new chat / Stay here first, then exactly one invitation after the choice; fresh Chat gets the invitation directly', () => {
  const state = offered(), invitation = invitationOf(state), name = invitation.title;
  const fresh = entriesOf(state, { invitation });
  assert.deepEqual(ids(fresh), [invitationClientId(invitation.id)]);
  assert.equal(fresh[0].content, `You’ve added **${mdName(name)}**. Would you like me to explain it on the canvas?`);
  assert.deepEqual(labels(fresh[0]), ['Explain on canvas', 'Just keep it here']);
  const choosing = entriesOf(state, { invitation, route: { invitationId: invitation.id, threadId: 'canvaschat-t' } });
  assert.deepEqual(choosing.map(e => e.kind), ['route'], 'no invitation before a destination wins');
  assert.deepEqual(labels(choosing[0]), ['Start new chat', 'Stay here']);
  assert.match(choosing[0].content, /Start a new chat for this document or stay here\?$/);
  for (const choice of ['new', 'stay']) {
    const chosen = entriesOf(state, { invitation, route: { invitationId: invitation.id, threadId: 'canvaschat-t', choice } });
    assert.deepEqual(chosen.map(e => e.kind), ['route', 'invitation'], 'exactly one invitation, as the follow-up');
    assert.ok(chosen[0].actions.every(a => a.disabled), 'the choice is spent: a double click or second tab cannot choose again');
    assert.ok(chosen[0].seq > choosing[0].seq, 'the resolved chooser updates the same message in place');
  }
  assert.equal(mdName('*notes*_v1.md'), '\\*notes\\*\\_v1.md', 'the filename is escaped, never emphasis');
  assert.match(fresh[0].content, /^You’ve added/, 'a filename acknowledgement, never a claim the document was read');
});

test('UI.01: the drop invitation shows in Ask with Auto-suggest off; a second source over an unfinished roadmap gets the boundary message, never a second roadmap', () => {
  const ask = reduce({ ...initialState(), mode: 'ask' }, { type: 'invitation', invitation: body('invitation-offered').invitation });
  assert.equal(entriesOf(ask, { invitation: invitationOf(ask) })[0].kind, 'invitation');
  const busy = reduce(at('status-active-proposal-pending'), { type: 'boundary', boundary: { key: 'file:fs_2', name: 'Second.md' } });
  const entries = entriesOf(busy, { invitation: invitationOf(busy), boundary: busy.boundary });
  const boundary = entries.find(e => e.kind === 'boundary');
  assert.match(boundary.content, /already has a roadmap in progress/);
  assert.match(boundary.content, /End roadmap/);
  assert.equal(entries.filter(e => e.kind === 'invitation').length, 0, 'no invitation over an unfinished roadmap');
});

test('BE.09: polling yields the same entries under the same ids and seq; toSave writes only what changed; every entry is a versioned tutor record', () => {
  for (const name of ['create-response-draft', 'status-proposed-plan', 'status-questioning', 'status-active-proposal-pending', 'status-delivered-next-ready', 'status-failed-card', 'status-held-for-checking', 'status-completed', 'status-cancelled-paused']) {
    const once = entriesOf(at(name)), twice = entriesOf(reduce(at(name), { type: 'view', view: body(name) }));
    assert.deepEqual(twice.map(e => [e.clientId, e.seq]), once.map(e => [e.clientId, e.seq]), name);
    assert.equal(new Set(ids(once)).size, once.length, `${name}: one entry per client_id`);
    for (const e of once) { assert.equal(e.tutor.v, 1); assert.equal(e.tutor.kind, e.kind); assert.equal(e.tutor.seq, e.seq); assert.match(e.clientId, /^roadmap-[A-Za-z0-9_-]{1,72}$/); assert.ok(JSON.stringify(e.tutor).length < 4000, 'within the server cap'); }
    const saved = new Map(once.map(e => [e.clientId, `${e.seq}|${e.content}`]));
    assert.deepEqual(toSave(twice, saved), [], `${name}: a poll that changed nothing saves nothing`);
  }
});

test('UI.03: planning is one activity entry, then the draft in the SAME entry with parameters and Accept roadmap / Edit roadmap; a revision is a new entry', () => {
  const planning = entriesOf(at('create-response-draft')).find(e => e.kind === 'draft');
  assert.equal(planning.activity, 'Generating roadmap');
  assert.equal(planning.clientId, 'roadmap-draft-' + body('create-response-draft').roadmap.id + '-v1');
  const draft = entriesOf(at('status-proposed-plan')).find(e => e.kind === 'draft');
  assert.equal(draft.clientId, planning.clientId, 'the activity entry becomes the draft');
  assert.ok(draft.seq > planning.seq);
  assert.deepEqual(labels(draft), ['Accept roadmap', 'Edit roadmap']);
  assert.equal(draft.draft.steps.length, body('status-proposed-plan').plan.steps.length);
  assert.equal(draft.draft.practiceMode, 'explanations');
  const revising = entriesOf(at('status-proposed-plan', v => ({ ...v, revisionPending: true })));
  const next = revising.find(e => e.kind === 'draft');
  assert.notEqual(next.clientId, draft.clientId, 'the new revision has its own entry; the reviewed one stays as history');
  assert.equal(next.activity, 'Generating roadmap');
  assert.ok(historyActions(draft.tutor).every(a => a.disabled), 'a superseded draft keeps its labels, disabled');
  assert.deepEqual(historyActions(draft.tutor).map(a => a.label), ['Accept roadmap', 'Edit roadmap']);
  const backend = entriesOf(at('status-active-proposal-pending', v => ({ ...v, planDraft: { version: 3, outcome: 'o', steps: [{ position: 1, title: 'New future step', format: 'explanation' }], settings: { depth: 'deep' }, acceptable: true } })));
  const after = backend.find(e => e.kind === 'draft');
  assert.equal(after.clientId, `roadmap-draft-${body('status-active-proposal-pending').roadmap.id}-v3`, 'Edit roadmap after acceptance: contracts.md draft');
  assert.ok(backend.some(e => e.kind === 'accepted'), 'the accepted roadmap stays authoritative while the draft is reviewed');
  assert.equal(after.actions.find(a => a.id === 'accept_roadmap').run.planVersion, 3);
});

test('UI.03 / BE.03: Edit roadmap targets the existing composer pill, stashes the unsent draft and gives it back; attachments are not part of it', () => {
  const target = roadmapEditTarget({ roadmapId: 'rm_1', planVersion: 2, threadId: 'canvaschat-t', canvas: 'c', draft: { text: 'my unsent question', command: 'graph' } });
  assert.equal(target.command, 'roadmap');
  assert.equal(target.proposalId, 'rm_1');
  assert.deepEqual(restoredDraft(target), { text: 'my unsent question', command: 'graph' });
  assert.equal(restoredDraft({ command: 'motion' }), null, 'other edit targets restore nothing');
  const ask = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8');
  assert.match(ask, /edit\?\.command === 'roadmap'[\s\S]{0,400}roadmap\.controller\.revise\(\{ instruction: raw\.trim\(\) \}\)/, 'the typed text is the revision instruction');
  assert.doesNotMatch(readFileSync(new URL('./use-roadmap.js', import.meta.url), 'utf8'), /data-toc-composer|divert/, 'no ToC composer diversion');
});

test('UI.02/UI.03: acceptance adds one summary entry with Open table of contents (primary blue), Edit roadmap, End roadmap; Propose next step only with no offer', () => {
  const pending = entriesOf(at('status-active-proposal-pending')).find(e => e.kind === 'accepted');
  assert.deepEqual(labels(pending), ['Open table of contents', 'Edit roadmap', 'End roadmap']);
  assert.equal(pending.actions[0].blue, true);
  assert.match(pending.content, /^Your roadmap is ready\. We’ll start with “/);
  const paused = entriesOf(at('status-cancelled-paused')).find(e => e.kind === 'accepted');
  assert.deepEqual(labels(paused), ['Open table of contents', 'Edit roadmap', 'Propose next step', 'End roadmap']);
  const completed = entriesOf(at('status-completed'));
  assert.deepEqual(labels(completed.find(e => e.kind === 'accepted')), ['Open table of contents'], 'no End or Edit after the finite end');
  assert.equal(completed.at(-1).kind, 'done');
  assert.match(completed.at(-1).content, /stopping point/);
});

test('UI.08: one lifecycle entry per card, Accept first then Next card, stale or busy actions disabled, ready keeps Go to card, never Retry', () => {
  const first = at('status-active-proposal-pending'), view = first.view;
  const step = entriesOf(first).find(e => e.kind === 'step');
  assert.equal(step.clientId, stepClientId(view.proposal.stepId));
  assert.deepEqual(labels(step), ['Accept', 'Cancel', 'Go to card', 'Go to highlighted text']);
  assert.equal(step.tutor.proposalId, view.proposal.id);
  assert.match(step.content, /Proposed card/);
  const accepting = entriesOf(reduce(first, { type: 'begin', gesture: `accept:${view.proposal.id}:${view.proposal.version}` })).find(e => e.kind === 'step');
  assert.equal(accepting.clientId, step.clientId, 'the same entry advances');
  assert.equal(accepting.tutor.stage, 'accepting');
  assert.ok(accepting.seq > step.seq);
  assert.equal(accepting.actions.find(a => a.id === 'accept').disabled, true, 'busy: disabled');
  const ask = entriesOf({ ...first, mode: 'ask' }).find(e => e.kind === 'step');
  assert.equal(ask.actions.find(a => a.id === 'accept').disabled, false, 'explicit Accept works in Ask');
  const later = entriesOf(at('status-delivered-next-ready'));
  const steps = later.filter(e => e.kind === 'step');
  assert.equal(steps[0].tutor.stage, 'ready');
  assert.deepEqual(labels(steps[0]), ['Go to card', 'Go to highlighted text']);
  assert.match(steps[0].tutor.cardId, /^cd_/);
  assert.equal(steps[1].actions[0].label, 'Next card', 'a subsequent proposal is Next card');
  const failed = entriesOf(at('status-failed-card')).filter(e => e.kind === 'step' && e.tutor.stage === 'failed');
  assert.equal(failed.length, 1);
  assert.match(failed[0].content, /could not be made/);
  for (const name of ['status-failed-card', 'status-delivered-next-ready', 'status-cancelled-paused']) for (const e of entriesOf(at(name))) assert.ok(!labels(e).some(l => /retry|replace|omit|accept plan|edit plan/i.test(l)), name);
  const cancelled = entriesOf(at('status-cancelled-paused')).find(e => e.tutor.stage === 'cancelled');
  assert.deepEqual(labels(cancelled), [], 'a cancelled card has no actions');
});

test('a Tutor entry is not an ordinary answer (no Regenerate, Add as card, Explore next)', () => {
  assert.equal(responseKind({ role: 'assistant', content: 'x', clientId: 'roadmap-inv-iv_1' }, null).ordinary, false);
  assert.equal(responseKind({ role: 'assistant', content: 'x', meta: { roadmap: 'roadmap-step-st_1' } }, null).ordinary, false);
  assert.equal(responseKind({ role: 'assistant', content: 'x' }, { role: 'user', content: 'hi' }).ordinary, true);
});

// The component: ChatMessage text inside the transcript, the entry's buttons, the draft containers.
const tmp = mkdtempSync(join(tmpdir(), 'roadmap-transcript-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
// As answer-footer.test.mjs: Vite's ?url imports and assets are stubbed, so ChatMessage bundles for node.
const viteUrl = { name: 'vite-url', setup(build) {
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
  build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { default as RoadmapTranscript, TutorMessage } from './RoadmapTranscript.jsx'; export { stepExcerpt, forgetExcerpts } from './source-refs.js'; export { footerShown } from './AnswerFooter.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const lib = createRequire(import.meta.url)(outfile);
const chat = { canvas: 'canvas-0a1b2c3d', thread: { id: null, status: 'loading', mode: 'auto' }, panels: { openChat() {} }, composer: { draft: null }, canvasOps: { hasBlock: () => true, locate() {} } };
const roadmapOf = state => ({ controller: {}, state, invitation: invitationOf(state), go() {}, acceptPlan() {} });
const render = (state, msgs = []) => lib.renderToStaticMarkup(lib.createElement(lib.RoadmapTranscript, { roadmap: roadmapOf(state), chat, msgs }));

test('RoadmapTranscript renders entries through ChatMessage with the controls the checks look for; parameters and draft live in the message', () => {
  const invite = render(offered());
  assert.match(invite, /data-roadmap-invitation=/);
  assert.match(invite, /data-roadmap-explain[^>]*>Explain on canvas</);
  assert.match(invite, /data-roadmap-keep[^>]*>Just keep it here</);
  assert.match(invite, /data-answer-body/, 'the sentence is a ChatMessage answer body');
  assert.equal(render(initialState()), '');
  const plan = render(at('status-proposed-plan'));
  assert.match(plan, /data-roadmap-parameters[\s\S]*Roadmap parameters[\s\S]*Scope[\s\S]*Full content · [\s\S]*type="range"[^>]*max="2"[\s\S]*Explanations only[\s\S]*disabled=""[^>]*>Explanations \+ practice · Practice is not available yet</);
  assert.match(plan, /data-roadmap-steps[\s\S]*Roadmap draft/);
  assert.match(plan, /data-roadmap-accept-plan[^>]*>Accept roadmap</);
  assert.match(plan, /data-roadmap-edit-plan[^>]*>Edit roadmap</);
  const pending = render(at('status-active-proposal-pending'));
  assert.match(pending, /data-roadmap-review[^>]*>Open table of contents</);
  assert.match(pending, /bg-primary-fill[^"]*"[^>]*data-roadmap-review|data-roadmap-review[^>]*bg-primary-fill/, 'main ui.jsx Button primary');
  assert.match(pending, /data-roadmap-accept[^>]*>Accept<\/button>/);
  assert.match(pending, /data-roadmap-cancel[^>]*>Cancel</);
  assert.doesNotMatch(render(at('status-failed-card')), />(Retry|Replace|Omit)</);
  assert.match(render(at('create-response-draft')), /Generating roadmap/);
});

test('a saved entry renders in place: live when its ids are current, else as history with no button and a one-line outcome', () => {
  const state = at('status-proposed-plan');
  const live = entriesOf(state).find(e => e.kind === 'draft');
  const m = { role: 'assistant', content: live.content, clientId: live.clientId, meta: { tutor: live.tutor } };
  const shown = lib.renderToStaticMarkup(lib.createElement(lib.TutorMessage, { m, roadmap: roadmapOf(state), chat }));
  assert.doesNotMatch(shown, /data-roadmap-stale/);
  assert.match(shown, /data-roadmap-accept-plan="true" class="[^"]*">Accept roadmap/, 'live: enabled');
  const stale = lib.renderToStaticMarkup(lib.createElement(lib.TutorMessage, { m, roadmap: roadmapOf(at('status-active-proposal-pending')), chat }));
  assert.match(stale, /data-roadmap-stale/);
  assert.doesNotMatch(stale, /<button[^>]*data-roadmap-accept-plan/, 'a superseded draft has no button at all, greyed or not');
  assert.match(stale, /data-roadmap-outcome[^>]*>Replaced by a newer draft/);
  // The live tail does not draw an entry the thread already holds.
  assert.doesNotMatch(render(state, [m]), /data-roadmap-accept-plan/);
});

test('Explain on canvas creates the roadmap with the composer Depth and no scraped instruction, and only then (BE.01: no paid call before Explain)', async () => {
  const calls = [];
  const api = async (path, opts = {}) => { calls.push({ path, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null }); if (path.includes('/invitations') && !opts.method) return body('invitation-offered'); if (!opts.method) return { roadmap: null }; return body('create-response-draft'); };
  const controller = createRoadmapController({ api, boardId: 'lb_7c1e5a90d2b84f63a1c07e92', host: { readOnly: () => false, depth: () => 'standard', instruction: () => 'scraped', sourceRev: () => 'rev1', hasBlock: () => false }, schedule: () => 0, cancel() {}, random: () => 'k1aaaaaaaa' });
  controller.start(); await new Promise(r => setTimeout(r, 10));
  assert.equal(calls.filter(c => c.method === 'POST').length, 0, 'the invitation alone starts nothing');
  await controller.explain({ depth: 'deep', instruction: '' });
  const create = calls.find(c => c.method === 'POST' && c.body?.invitationId);
  assert.equal(create.body.depth, 'deep');
  assert.equal(create.body.instruction, '', 'the explicit (empty) instruction of this flow, not a host read');
});

// The Tutor thread is the roadmap's, kept on the server (owner 2026-11-06): the same on every device.
test('an invitation has one Tutor thread id on every device: derived from the invitation, in the Chat thread id format', async () => {
  const a = await invitationThreadId('inv_a1b2c3'), again = await invitationThreadId('inv_a1b2c3'), other = await invitationThreadId('inv_zzz');
  assert.equal(a, again, 'a second device computes the same thread');
  assert.notEqual(a, other);
  assert.match(a, /^canvaschat-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.match(roadmapThreadClientId('rm_5f0c1a7e9b3d4c2a8e6f1b07'), /^[A-Za-z0-9_-]{1,80}$/);
});
test('the thread recorded for an unbound roadmap: the browser\'s old binding, else the open thread only if it holds THIS roadmap\'s invitation', () => {
  const inv = [{ role: 'assistant', clientId: invitationClientId('inv_1') }], plain = [{ role: 'user', clientId: 'turn-1' }];
  assert.equal(threadCandidate({ legacy: 'canvaschat-old', openId: 'canvaschat-open', msgs: inv, invitationId: 'inv_1' }), 'canvaschat-old');
  assert.equal(threadCandidate({ openId: 'canvaschat-open', msgs: inv, invitationId: 'inv_1' }), 'canvaschat-open');
  assert.equal(threadCandidate({ openId: 'canvaschat-open', msgs: inv, invitationId: 'inv_2' }), null, 'an older roadmap\'s invitation thread is never taken');
  assert.equal(threadCandidate({ openId: 'canvaschat-open', msgs: inv }), null, 'a roadmap made without an invitation takes no open thread');
  assert.equal(threadCandidate({ openId: 'canvaschat-open', msgs: plain, invitationId: 'inv_1' }), null, 'an unrelated thread is never taken over');
  assert.equal(threadCandidate({ openId: null, msgs: inv, invitationId: 'inv_1' }), null, 'a new chat (the bound thread was just deleted)');
});

// Release 91 fix: recording never opens a thread (no Chat jump), never runs for a finished roadmap, and makes at most one fresh thread per roadmap per session.
const sessionStore = () => { const m = new Map(); return { get: k => m.get(k) ?? null, set: (k, v) => m.set(k, v), m }; };
const doubles = ({ saved = new Set() } = {}) => {
  const calls = { bind: [], fresh: [], ids: 0 };
  return { calls, deps: (session) => ({ session, newId: () => `canvaschat-fresh-${++calls.ids}`, saveFresh: async id => { calls.fresh.push(id); saved.add(id); },
    bindThread: async id => { calls.bind.push(id); if (!saved.has(id)) throw Object.assign(new Error('Save the thread first'), { status: 404 }); return { roadmap: { threadId: id } }; } }) };
};
test('ensureTutorThread binds THIS roadmap\'s invitation thread silently, and does nothing for a bound, ended or completed roadmap', async () => {
  const derived = await invitationThreadId('inv_1'), session = sessionStore();
  const d = doubles({ saved: new Set([derived]) });
  assert.equal(await ensureTutorThread({ id: 'rm_1', state: 'active', invitationId: 'inv_1', threadId: null }, { openId: 'canvaschat-other', msgs: [] }, d.deps(session)), 'bound');
  assert.deepEqual(d.calls.bind, [derived], 'the derived invitation thread, not the open one');
  assert.deepEqual(d.calls.fresh, [], 'no new thread');
  for (const rm of [{ id: 'rm_2', state: 'completed', threadId: null }, { id: 'rm_3', state: 'ended', threadId: null }, { id: 'rm_4', state: 'active', threadId: derived }]) {
    assert.equal(await ensureTutorThread(rm, {}, d.deps(session)), 'skipped');
  }
  assert.equal(d.calls.bind.length, 1, 'nothing more was sent');
});
test('ensureTutorThread makes at most one fresh thread per roadmap per session, even when its bind keeps failing', async () => {
  const session = sessionStore(), d = doubles();
  const failing = { ...d.deps(session), bindThread: async id => { d.calls.bind.push(id); throw new Error('503'); } };
  const rm = { id: 'rm_9', state: 'active', invitationId: null, threadId: null };
  await assert.rejects(ensureTutorThread(rm, { openId: 'canvaschat-open', msgs: [] }, failing));
  assert.deepEqual(d.calls.fresh, ['canvaschat-fresh-1']);
  for (let restore = 0; restore < 3; restore += 1) assert.equal(await ensureTutorThread(rm, { openId: 'canvaschat-open', msgs: [] }, failing), 'kept');
  assert.deepEqual(d.calls.fresh, ['canvaschat-fresh-1'], 'every later restore re-binds the same thread: no orphan thread per restore');
  assert.equal(d.calls.bind.filter(id => id === 'canvaschat-fresh-1').length, 4);
  const ok = doubles();
  assert.equal(await ensureTutorThread({ id: 'rm_10', state: 'active', threadId: null }, {}, ok.deps(sessionStore())), 'fresh');
  assert.deepEqual(ok.calls.bind, ['canvaschat-fresh-1'], 'saved first, then bound; the caller opens nothing');
});
test('RoadmapTranscript opens a thread only for an invitation: the silent binding path never calls thread.open', () => {
  const source = readFileSync(new URL('./RoadmapTranscript.jsx', import.meta.url), 'utf8');
  const binding = source.slice(source.indexOf('ensureTutorThread(rm'), source.indexOf('}).catch(() => {}); // a failed save or bind'));
  assert.ok(binding.length > 0);
  assert.doesNotMatch(binding, /\.open\(|openChat/);
});

// UI.04 / roadmap 3.8: the Chat step entry shows the same exact passage as the canvas slot (useStepExcerpt), only when ready and non-empty;
// an unreadable one says so; the excerpt is never part of the saved message.
test('a step entry shows the slot\'s exact excerpt when ready, the honest line when unavailable, nothing when there is no reference or while loading', async () => {
  const state = at('status-active-proposal-pending'), step = state.view.steps[0], id = step.sourceRef?.id;
  assert.ok(id, 'the fixture step has a minted reference');
  const entry = entriesOf(state).find(e => e.kind === 'step');
  assert.equal(entry.sourceRef.id, id);
  assert.ok(!entry.content.includes('EXACT'), 'the excerpt is not in the stored content');
  assert.ok(!JSON.stringify(entry.tutor).includes('EXACT'), 'nor in the tutor record');
  lib.forgetExcerpts();
  assert.doesNotMatch(render(state), /data-roadmap-excerpt/, 'loading: nothing');
  await lib.stepExcerpt(async () => ({ refs: [{ id, status: 'current', excerpt: 'EXACT quoted passage' }] }), chat.canvas, id);
  const ready = render(state);
  assert.match(ready, /<blockquote data-roadmap-excerpt[^>]*>EXACT quoted passage<\/blockquote>/);
  lib.forgetExcerpts();
  await lib.stepExcerpt(async () => ({ refs: [{ id, status: 'changed' }] }), chat.canvas, id);
  assert.match(render(state), /data-roadmap-excerpt-unavailable[^>]*>The passage is not available right now\.</);
  assert.doesNotMatch(render(state), /data-roadmap-excerpt[ >]/);
  const noRef = at('status-active-proposal-pending', v => ({ ...v, steps: v.steps.map(s => ({ ...s, sourceRef: null })), proposal: { ...v.proposal, sourceRelation: { ...v.proposal.sourceRelation, sourceRef: null } } }));
  assert.doesNotMatch(render(noRef), /data-roadmap-excerpt/, 'no reference: no excerpt, no unavailable line');
  lib.forgetExcerpts();
});
