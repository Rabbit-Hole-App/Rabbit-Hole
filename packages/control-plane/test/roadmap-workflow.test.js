// Section 8.0.2 (docs/features/explain-on-canvas/handoff/tutor-implementation-checklist.md) BE.00-BE.14 as one integrated route-level flow:
// Markdown drop -> Chat receipt/choice -> Explain -> whole-context planning -> Accept roadmap -> proposal -> one guarded acceptance -> one author
// call -> board save -> acknowledgement -> next offer -> second card. Real routes, store, money, outbox, board save and Chat persistence; only
// the outside is doubled (roadmap-workflow-fixture.js). Assertions encode the CHECKLIST, not current behaviour: a case that fails because its
// feature is not built yet stays a real failing assertion (verify-status.md records which). No model, no network, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { LEARN_TASKS } from '../src/learn-models.js';
import { requestSpendBound } from '../src/learn-spend.js';
import { toMicros } from '../src/learn-usage.js';
import { routes, tabAccepts, pillOf, planDelivery } from '../../web/src/roadmap-client.js';
import { draftKey } from '../../web/src/chat-draft.js';
import { withVisual } from './explanation-layout-fixture.js';
import {
  AT, FILE_NAME, INSTRUCTION, KEY, MARKER, MD, PLAN, STEPS, USERS, acceptCard, acceptPlan, boardBlocks, calm, deliver, explain, explanation, httpError,
  SHORT_PLAN, planOf, readThread, receipt, reply, saveMessage, sha, started, status, table, threadId, timeout, unsafe, workflow,
} from './roadmap-workflow-fixture.js';

const T_FRESH = threadId(1), T_BUSY = threadId(2), T_DRAFT = threadId(3), T_NEW = threadId(4), T_BOB = threadId(9);
const planText = h => h.plannerCalls.filter(c => c.role === 'roadmap_draft' || c.role === 'roadmap_revise');
const pending = h => h.rows("SELECT id, version, state FROM learn_step_proposals WHERE state IN ('checking', 'held', 'pending')");
const authorizations = h => h.rows('SELECT * FROM learn_step_authorizations');
const learnerActions = h => h.rows("SELECT * FROM usage_actions WHERE client_key LIKE 'rmact_%'");
const noLeak = (h, json) => { assert.ok(!json.includes(MARKER), 'no private source text'); assert.doesNotMatch(json, /micros|cost_|price|\$\d/i, 'no prices'); };
// The Chat fixtures: a fresh empty thread, an occupied thread (history), a draft-only thread (an unsent draft, no messages).
async function chats(h) {
  assert.equal((await saveMessage(h, T_BUSY, { client_id: 'u-old-1', role: 'user', content: 'What is overfitting?' })).status, 201);
  assert.equal((await saveMessage(h, T_BUSY, { client_id: 'a-old-1', role: 'assistant', content: 'Fitting noise as if it were signal.' })).status, 201);
  assert.equal((await saveMessage(h, T_DRAFT, { client_id: 'u-draft-0', role: 'user', content: 'placeholder so the thread exists' })).status, 201);
  h.sqlite.prepare('DELETE FROM messages WHERE thread_id = ?').run(T_DRAFT); h.sqlite.prepare('DELETE FROM chat_message_meta WHERE thread_id = ?').run(T_DRAFT);
  assert.equal((await h.send('alice', 'PUT', `/api/learn/chat/threads/${T_DRAFT}/state`, { draft: { text: 'half typed question', command: null } })).status, 200);
}

test('BE.00 one reproducible local fixture: Node 24, candidate SHA, bounded synthetic Markdown, two learners, three chats, denied network', async t => {
  const sha1 = (() => { try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })();
  t.diagnostic(`node ${process.version} candidate ${sha1} source sha256 ${await sha(MD)} chars ${MD.length}`);
  assert.equal(process.versions.node.split('.')[0], '24', 'node:sqlite on Node 24');
  assert.ok(MD.length > 8000 && MD.length <= 40000, `synthetic Markdown is ${MD.length} characters`);
  assert.ok(MD.indexOf(MARKER) > STEPS[0].passage.end + 5000, 'the distinctive fact sits far outside the first highlighted range');
  assert.deepEqual([...new Set(STEPS.map(s => s.format))].sort(), ['explanation', 'table'], 'an explanation step and a table step');
  const h = await workflow(t);
  await chats(h);
  assert.notEqual(h.boards.alice, h.boards.bob, 'two learners, two boards');
  const ids = [T_FRESH, T_BUSY, T_DRAFT, USERS.alice.fileId, USERS.bob.fileId, h.boards.alice, h.boards.bob];
  assert.equal(new Set(ids).size, ids.length, 'every thread, source and board has its own traceable id');
  assert.equal((await readThread(h, T_BUSY)).body.messages.length, 2, 'occupied chat');
  const draftOnly = (await readThread(h, T_DRAFT)).body;
  assert.deepEqual([draftOnly.messages.length, draftOnly.draft?.text], [0, 'half typed question'], 'draft-only chat');
  assert.notEqual(draftKey(USERS.alice.canvas, null), draftKey(USERS.alice.canvas, T_FRESH), 'an unsaved .new draft has its own key');
  // The production resolver, not the fixture constant, picks the author model; the first card proves it (no live call).
  h.script.push(explanation());
  const view = await started(h);
  assert.equal((await acceptCard(h, view, 'accept')).status, 202);
  assert.equal(h.authorCalls.length, 1);
  assert.equal(h.authorCalls[0].model, LEARN_TASKS.artifact.model, 'the author request uses the configured artifact model');
  assert.equal(h.authorCalls[0].body.max_tokens, LEARN_TASKS.artifact.maxTokens, 'with the configured output cap');
  assert.deepEqual(h.network, [], 'no network call escaped');
  assert.deepEqual(h.handlerErrors, [], 'no outbox handler threw');
  await receipt('fixture', h, { node: process.version, candidate: sha1 });
});

test('BE.01 drop acknowledgment and conversation choice (UI.01)', async t => {
  const h = await workflow(t);
  await chats(h);
  const source = `file:${USERS.alice.fileId}`;
  // The drop is acknowledged from metadata alone: invitation offered, no source body read, no planner/author call, no learner debit.
  const offered = await h.send('alice', 'POST', '/api/learn/roadmap/invitations', { boardId: h.boards.alice, sourceKeys: [source], idleKey: 'idle-0000000001' });
  assert.equal(offered.status, 200);
  const iv = offered.body.invitation;
  assert.equal(iv.title, FILE_NAME, 'the actual filename');
  assert.deepEqual(iv.choices, ['explain_on_canvas', 'keep_here']);
  assert.deepEqual([h.r2Reads.length, h.plannerCalls.length, h.authorCalls.length, (await h.totals()).used], [0, 0, 0, 0], 'nothing read, planned, authored or charged');
  // Replay / a second drop of the same source routes once: the same invitation.
  const again = await h.send('alice', 'POST', '/api/learn/roadmap/invitations', { boardId: h.boards.alice, sourceKeys: [source], idleKey: 'idle-0000000002' });
  assert.equal(again.body.invitation?.id, iv.id, 'the same source event is routed once');

  await t.test('BE.01 the occupied-chat receipt/choice persists as one durable Tutor entry with structured metadata', async () => {
    // Chat lane contract (1cf5a8332): request field `tutor: { v: 1, kind, seq, ... }` on an assistant message, read back as messages[].meta.tutor.
    const receipt = { client_id: `roadmap-inv-${iv.id}`, role: 'assistant', content: `You've added **${FILE_NAME}**. Start a new chat for this document or stay here?`,
      tutor: { v: 1, kind: 'source_receipt', seq: 0, invitationId: iv.id, sourceKey: source, choices: ['start_new_chat', 'stay_here'] } };
    assert.equal((await saveMessage(h, T_BUSY, receipt)).status, 201);
    assert.equal((await saveMessage(h, T_BUSY, receipt)).body.duplicate, true, 'a replayed receipt is not a second message');
    const busy = (await readThread(h, T_BUSY)).body;
    assert.deepEqual(busy.messages.map(m => m.clientId), ['u-old-1', 'a-old-1', `roadmap-inv-${iv.id}`], 'history retained, one receipt');
    assert.deepEqual(busy.messages[2].meta?.tutor, receipt.tutor, 'the Tutor metadata round-trips through the real read');
  });

  await t.test('BE.01 Start new chat: a distinct durable destination; the old history and draft stay; the roadmap binds there once', async () => {
    assert.equal((await saveMessage(h, T_NEW, { client_id: `roadmap-inv-${iv.id}`, role: 'assistant', content: `You've added **${FILE_NAME}**. Would you like me to explain it on the canvas?` })).status, 201);
    assert.equal((await readThread(h, T_DRAFT)).body.draft?.text, 'half typed question', 'the other chat keeps its unsent draft');
    assert.equal((await readThread(h, T_BUSY)).body.messages.length, 3, 'the old chat keeps its history');
    h.script.push(explanation());
    const created = await explain(h, { invitationId: iv.id });
    assert.equal(created.status, 202);
    const bound = await h.send('alice', 'POST', `/api/learn/roadmap/${created.body.roadmapId}/thread`, { boardId: h.boards.alice, threadId: T_NEW });
    assert.equal(bound.status, 200, JSON.stringify(bound.body).slice(0, 300));
    assert.equal(bound.body.roadmap.threadId, T_NEW);
    const moved = await h.send('alice', 'POST', `/api/learn/roadmap/${created.body.roadmapId}/thread`, { boardId: h.boards.alice, threadId: T_BUSY });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.roadmap.threadId, T_NEW, 'a thread switch or second device keeps the original source -> thread binding');
    assert.equal((await status(h)).roadmap.invitationId, iv.id);
    const fresh = (await readThread(h, T_NEW)).body.messages.filter(m => String(m.clientId).startsWith('roadmap-inv-'));
    assert.equal(fresh.length, 1, 'the Explain invitation appears once in the selected thread');
  });

  await t.test('BE.01 Just keep it here: no roadmap, no purchase', async () => {
    const h2 = await workflow(t);
    const iv2 = (await h2.send('alice', 'POST', '/api/learn/roadmap/invitations', { boardId: h2.boards.alice, sourceKeys: [source], idleKey: 'idle-0000000003' })).body.invitation;
    assert.equal((await h2.send('alice', 'POST', `/api/learn/roadmap/invitations/${iv2.id}/dismiss`, { boardId: h2.boards.alice, actionKey: KEY('dismiss') })).status, 200);
    assert.deepEqual([h2.rows('SELECT * FROM learn_roadmaps').length, h2.plannerCalls.length, (await h2.totals()).used], [0, 0, 0]);
  });
});

test('BE.02 whole-context planning and selected teaching scope (CORE.02, UI.03)', async t => {
  await t.test('BE.02 whole content: the serialized planner request carries the whole pinned document and every parameter', async () => {
    const h = await workflow(t);
    const created = await explain(h);
    assert.equal(created.status, 202);
    const [draft] = planText(h);
    assert.ok(draft, 'the real planner request constructor ran');
    assert.ok(draft.text.includes(JSON.stringify(MD).slice(1, -1)), 'the full exact pinned Markdown');
    assert.ok(draft.text.includes(MARKER), 'the outside-highlight marker');
    assert.ok(draft.text.includes(h.rev), 'the source revision');
    assert.ok(draft.text.includes(FILE_NAME), 'the filename');
    const request = JSON.parse(draft.body.messages[0].content.split('\n\n<source')[0]);
    assert.equal(request.instruction.original, INSTRUCTION, 'the original learner instruction');
    assert.deepEqual([request.language, request.depth], ['en', 'standard']);
    assert.deepEqual([request.scope.start, request.scope.end], [0, MD.length], 'whole teaching scope');
    // contracts.md absent: assumed planner field `mode` ('explanations' = Explanations only, roadmap 3.5).
    assert.equal(request.mode, 'explanations', 'the roadmap mode reaches the planner');
    const view = (await acceptPlan(h, await status(h))).body;
    assert.ok(view.proposal, 'the first proposal');
    assert.deepEqual([h.authorCalls.length, authorizations(h).length, (await h.totals()).used], [0, 0, 0], 'draft and plan acceptance: no author call, no card authorization or debit');
  });

  await t.test('BE.02 selected passage: same whole document as context, the passage only as teaching scope', async () => {
    const h = await workflow(t, { plans: [planOf([{ ...STEPS[0] }])] });
    const quote = 'Entropy is minus the sum of each class share times the log of that share.';
    const ref = 'sref_00000000000000000000000a';
    h.sqlite.prepare("INSERT INTO learn_source_refs (id, org, owner_email, kind, source_key, source_name, source_rev, anchor_json, anchor_hash, created_at) VALUES (?, 'team', ?, 'markdown', ?, ?, ?, ?, 'h', 1)")
      .run(ref, USERS.alice.email, `file:${USERS.alice.fileId}`, FILE_NAME, h.rev, JSON.stringify({ quote: { exact: quote } }));
    const created = await explain(h, { scope: { kind: 'passage', sourceRefId: ref } });
    assert.equal(created.status, 202, JSON.stringify(created.body).slice(0, 200));
    const [draft] = planText(h);
    assert.ok(draft.text.includes(MARKER), 'a selected section still plans with the whole bounded document');
    const request = JSON.parse(draft.body.messages[0].content.split('\n\n<source')[0]);
    const at = MD.indexOf(quote);
    assert.deepEqual([request.scope.start, request.scope.end], [at, at + quote.length], 'the selection is its own stable teaching anchor (absolute UTF-16 offsets)');
  });

  await t.test('BE.02 changed, missing and over-limit sources are refused honestly, with no planner call', async () => {
    const h = await workflow(t);
    const changed = await h.send('alice', 'POST', '/api/learn/roadmap', { boardId: h.boards.alice, source: { key: `file:${USERS.alice.fileId}`, rev: 'not-the-revision', scope: { kind: 'whole' } }, instruction: INSTRUCTION, depth: 'standard', actionKey: KEY('c1') });
    assert.deepEqual([changed.status, changed.body.code], [409, 'source_changed']);
    delete h.objects[`r2/${USERS.alice.fileId}`];
    const missing = await explain(h, { key: 'c2' });
    assert.deepEqual([missing.status, missing.body.code], [409, 'source_unavailable']);
    const big = await workflow(t, { md: `${MD}\n${'x'.repeat(40001 - MD.length)}` });
    const over = await explain(big);
    assert.equal(over.status, 422);
    assert.equal(over.body.limitation?.code, 'source_too_large', 'no fabricated full-read status');
    assert.deepEqual([h.plannerCalls.length, big.plannerCalls.length], [0, 0]);
  });
});

test('BE.03 roadmap edits, revision guards and practice readiness (UI.03, R5)', async t => {
  await t.test('BE.03 before acceptance: Depth and typed Edit roadmap revise the draft; the stale draft cannot be accepted', async () => {
    const h = await workflow(t, { plans: [PLAN, SHORT_PLAN] });
    await explain(h);
    const v1 = await status(h);
    const revised = await h.route('alice', routes.revise(v1, { instruction: 'Focus on entropy, please.', settings: { depth: 'deep' } }, KEY('revise')));
    assert.equal(revised.status, 202, JSON.stringify(revised.body).slice(0, 200));
    const v2 = await status(h);
    assert.deepEqual([v2.roadmap.depth, v2.roadmap.planVersion], ['deep', 2], 'updated canonical parameters and a new draft revision');
    const history = h.rows('SELECT version, text, origin FROM learn_roadmap_instructions ORDER BY version');
    assert.deepEqual(history.map(r => [r.version, r.text]), [[1, INSTRUCTION], [2, 'Focus on entropy, please.']], 'instruction history kept, original first');
    const revise = planText(h).at(-1);
    assert.equal(revise.role, 'roadmap_revise');
    assert.ok(revise.text.includes(INSTRUCTION) && revise.text.includes('Focus on entropy, please.'), 'original and latest instruction reach the planner');
    const stale = await h.send('alice', 'POST', `/api/learn/roadmap/${v2.roadmap.id}/accept-plan`, { boardId: h.boards.alice, revision: v2.roadmap.revision, planVersion: 1, actionKey: KEY('stale-plan') });
    assert.deepEqual([stale.status, ['stale_revision', 'stale_draft'].includes(stale.body.code)], [409, true], 'the superseded draft is refused (stale_revision|stale_draft)');
    assert.equal(v2.revisionPending, false);
    assert.equal((await acceptPlan(h, v2)).status, 200, 'the displayed revision is accepted');
  });

  await t.test('BE.03 after a delivered card and an accepted in-flight card: Edit roadmap makes a separate future draft; accepted work stays', async () => {
    const h = await workflow(t, { plans: [PLAN, SHORT_PLAN], script: [explanation()], auto: false, hold: true });
    const first = await started(h);
    const accepted = await acceptCard(h, first, 'a1');
    await h.run();
    assert.equal((await deliver(h, accepted.body.slots[0].resultId)).status, 200);
    const proposed = await h.route('alice', routes.proposeNext(await status(h), KEY('next')));
    h.script.push(table());
    assert.equal((await acceptCard(h, proposed.body, 'a2')).status, 202, 'second card accepted, still in flight');
    const before = await status(h), board = await boardBlocks(h), used = (await h.totals()).used;
    const edit = await h.route('alice', routes.revise(before, { instruction: 'Add a step on pruning later.' }, KEY('revise-active')));
    assert.equal(edit.status, 202, 'editing an accepted roadmap prepares a new unaccepted draft');
    const after = await status(h);
    // be contract 4/5: acceptedPlan { version, ... } drives the ToC, planDraft { version, steps, acceptable, instructionVersion } (named planDraft; `draft` is the R5 proposal draft) the Chat roadmap message, revisionPending while re-planning.
    assert.equal(after.acceptedPlan?.version, before.roadmap.acceptedPlanVersion, 'the accepted plan stays authoritative');
    assert.equal(after.planDraft?.version, before.roadmap.planVersion + 1, 'the draft is a separate revision');
    await h.run();
    assert.equal(h.authorCalls.length, 2, 'the in-flight card completes against its frozen inputs');
    assert.ok(h.authorCalls[1].text.includes('CLAIM-TABLE'), 'with its own accepted claims');
    assert.deepEqual(await boardBlocks(h), board, 'saved cards unchanged');
    assert.ok((await h.totals()).used >= used, 'no refund or extra charge from the edit');
    assert.deepEqual(after.acceptedPlan.steps.map(x => x.title), STEPS.map(x => x.title), 'the accepted tree is unchanged by the draft');
    assert.deepEqual([after.planDraft.instructionVersion, after.planDraft.acceptable, after.planDraft.steps.length], [2, true, SHORT_PLAN.steps.length], 'the draft carries its own instruction version and steps');
    const stale = await h.send('alice', 'POST', `/api/learn/roadmap/${before.roadmap.id}/accept-plan`, { boardId: h.boards.alice, revision: (await status(h)).roadmap.revision, planVersion: before.roadmap.acceptedPlanVersion, actionKey: KEY('old-plan') });
    assert.equal(stale.status, 409, 'accepting the superseded plan version is refused');
    const reaccepted = await acceptPlan(h, await status(h), { key: 'replan' });
    assert.equal(reaccepted.status, 200, `reacceptance publishes the new plan ${JSON.stringify(reaccepted.body).slice(0, 300)}`);
    assert.equal(reaccepted.body.acceptedPlan.version, after.planDraft.version);
    assert.equal(h.rows("SELECT state FROM learn_roadmap_steps WHERE state = 'delivered'").length >= 1, true, 'delivered work keeps its step');
  });

  await t.test('BE.03 Explanations + practice is refused at the server capability boundary until qualified', async () => {
    const h = await workflow(t);
    // be contract: 422 practice_unavailable on create (practiceMode) and on revise (settings.practiceMode).
    const refused = await explain(h, { extra: { practiceMode: 'explanations_practice' } });
    assert.equal(refused.status, 422, 'practice is refused, not silently accepted');
    assert.equal(refused.body.code, 'practice_unavailable');
    assert.equal(h.rows('SELECT * FROM learn_roadmaps').length, 0);
    await explain(h, { key: 'ok' });
    const viaRevise = await h.route('alice', routes.revise(await status(h), { settings: { practiceMode: 'explanations_practice' } }, KEY('rp')));
    assert.deepEqual([viaRevise.status, viaRevise.body.code], [422, 'practice_unavailable'], 'also through a revision');
    assert.equal((await status(h)).roadmap.practiceMode, 'explanations', 'never silently switched');
  });
});

test('BE.04 Accept roadmap and the accepted-only ToC (UI.02-03)', async t => {
  const h = await workflow(t, { plans: [PLAN, SHORT_PLAN] });
  await explain(h);
  const draft = await status(h);
  const accepted = await acceptPlan(h, draft);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.roadmap.acceptedPlanVersion, draft.roadmap.planVersion, 'the confirmed version is accepted');
  assert.equal(h.rows('SELECT * FROM learn_step_proposals').length, 1, 'exactly one first metadata proposal');
  assert.deepEqual([h.authorCalls.length, authorizations(h).length, (await h.totals()).used], [0, 0, 0], 'no author dispatch or card charge');
  const replay = await acceptPlan(h, draft);
  assert.equal(replay.status, 200, 'a repeated acceptance is idempotent');
  const second = await h.send('alice', 'POST', `/api/learn/roadmap/${draft.roadmap.id}/accept-plan`, { boardId: h.boards.alice, revision: accepted.body.roadmap.revision, planVersion: draft.roadmap.planVersion, actionKey: KEY('plan-again') });
  assert.ok(second.status === 200 || (second.status === 409 && ['stale_revision', 'stale_draft'].includes(second.body.code)), 'a second device accepting the same plan buys nothing');
  assert.equal(h.rows('SELECT * FROM learn_step_proposals').length, 1, 'still one proposal');
  // Navigation (status reads) mutates nothing.
  const r1 = (await status(h)).roadmap.revision, r2 = (await status(h)).roadmap.revision;
  assert.equal(r1, r2);
  assert.equal(h.plannerCalls.length, 1);
  // be contract: acceptedPlan = the accepted snapshot; a later draft revision does not leak into it.
  assert.deepEqual(accepted.body.acceptedPlan?.steps?.map(s => s.title), STEPS.map(s => s.title), 'accepted-only outline projection');
  const snapshot = h.rows('SELECT plan_hash, plan_json FROM learn_roadmap_plan_versions WHERE version = ?', draft.roadmap.planVersion)[0];
  assert.ok(snapshot.plan_hash, 'an immutable accepted plan snapshot with its hash');
});

test('BE.05 first proposal and one guarded acceptance (CORE.03-05, UI.04-05)', async t => {
  await t.test('BE.05 the pending payload is the same for Chat and canvas: ids, title, description, format, exact excerpt', async () => {
    const h = await workflow(t);
    const view = await started(h);
    const p = view.proposal;
    assert.deepEqual([p.title, p.description, p.format, p.version], [STEPS[0].title, STEPS[0].goal, 'explanation', 1]);
    assert.ok(p.id && p.stepId, 'proposal and step identity (the Chat entry key roadmap-step-<stepId>)');
    assert.equal(p.sourceRelation?.source?.name, FILE_NAME);
    // be contract: polling never carries source text; the verified excerpt is the step's R3 reference (steps[].sourceRef.id -> anchor.quote.exact).
    assert.doesNotMatch(JSON.stringify(view), new RegExp(MARKER), 'polling carries no source text');
    const ref = view.steps.find(x => x.id === p.stepId).sourceRef;
    assert.ok(ref?.id, 'the step of the proposal carries its source reference');
    assert.equal(p.sourceRelation.sourceRef?.id, ref.id, 'the proposal and the step name the same reference');
    const h2 = h.rows('SELECT anchor_json FROM learn_source_refs WHERE id = ?', ref.id)[0];
    const exact = JSON.parse(h2.anchor_json).quote?.exact || '';
    assert.ok(exact.length > 20 && MD.slice(STEPS[0].passage.start, STEPS[0].passage.end).includes(exact.trim().slice(0, 40)), 'the reference anchors the exact highlighted passage text');
  });

  await t.test('BE.05 Chat, canvas and a second session race: one winner, one authorization, one author dispatch', async () => {
    const h = await workflow(t, { script: [explanation(), explanation()] });
    const view = await started(h);
    const chat = routes.acceptProposal(view, KEY('chat')), canvas = routes.acceptProposal(view, KEY('canvas'));
    assert.deepEqual(Object.keys(chat.body).sort(), Object.keys(canvas.body).sort(), 'one production accept payload');
    const [a, b] = await Promise.all([h.route('alice', chat), h.route('alice', canvas)]);
    assert.deepEqual([a.status, b.status].sort(), [202, 409], 'exactly one canonical winner');
    const again = await h.route('alice', chat);
    assert.equal(again.status, 202, 'the same key replays');
    assert.deepEqual([authorizations(h).length, learnerActions(h).length, h.rows("SELECT * FROM learn_step_results WHERE decision = 'accepted'").length, h.authorCalls.length], [1, 1, 1, 1]);
    const stale = await h.send('alice', 'POST', `/api/learn/roadmap/${view.roadmap.id}/proposals/${view.proposal.id}/accept`, { boardId: h.boards.alice, revision: view.roadmap.revision, proposalVersion: 2, actionKey: KEY('stale') });
    assert.equal(stale.status, 409, 'a stale version is refused');
    const cancel = await h.route('alice', routes.cancelProposal(view, KEY('cancel')));
    assert.equal(cancel.status, 409, 'a losing Cancel does not undo the accepted work');
    assert.equal(h.rows("SELECT generation FROM learn_step_results")[0].generation, 'generated');
  });

  await t.test('BE.05 eligible Tab maps to the same accept; composer, settings, editing, IME and repeat are excluded', async () => {
    const pill = { accept: true };
    assert.equal(tabAccepts({ event: { key: 'Tab' }, pill }), true);
    for (const ctx of [{ event: { key: 'Tab', isComposing: true }, pill }, { event: { key: 'Tab', keyCode: 229 }, pill }, { event: { key: 'Tab', repeat: true }, pill }, { event: { key: 'Tab', shiftKey: true }, pill },
      { event: { key: 'Tab' }, pill, blocked: true }, { event: { key: 'Tab' }, pill, editorOpen: true }, { event: { key: 'Tab' }, pill: { accept: false } }])
      assert.equal(tabAccepts(ctx), false, JSON.stringify(ctx));
  });
});

// One accepted first card through the real author path. replies: the scripted author responses.
async function firstCard(t, replies, opts = {}) {
  const h = await workflow(t, { script: [...replies], ...opts });
  const view = await started(h, opts);
  const accepted = await acceptCard(h, view, 'accept1');
  return { h, view, accepted, resultId: accepted.body.slots?.[0]?.resultId, cardId: accepted.body.slots?.[0]?.cardId };
}
const resultRow = (h, id) => h.rows('SELECT * FROM learn_step_results WHERE id = ?', id)[0];
// The author request's context field (generateArtifact serializes the input into the user message).
const authorContext = call => { const c = call.body.messages[0].content; return JSON.parse(typeof c === 'string' ? c : c.at(-1).text).context; };
const toolNames = call => (call.body.tools || []).map(x => x.name).filter(n => n.startsWith('make_')); // the content tools offered (ask_clarifying_question is the artifact path's own)

test('BE.06 actual author request and both output formats (CORE.03-07)', async t => {
  await t.test('BE.06 explanation: one content-author call carries the whole document, accepted brief, original instruction, format, language and Depth', async () => {
    const { h, resultId } = await firstCard(t, [explanation()]);
    assert.equal(h.authorCalls.length, 1, 'exactly one ordinary content-author call');
    const [call] = h.authorCalls;
    assert.deepEqual(toolNames(call), ['make_explanation'], 'the accepted format only');
    assert.ok(authorContext(call).includes(MD), 'whole pinned Markdown');
    assert.ok(call.text.includes(MARKER), 'including the distant marker');
    assert.ok(call.text.includes('CLAIM-GINI') && call.text.includes(PLAN.outcome), 'accepted step claims and outcome');
    assert.match(call.text, /Depth: standard/i);
    assert.match(call.text, /language \\"en\\"/);
    assert.deepEqual([h.checkerCalls.length, JSON.parse(resultRow(h, resultId).check_json).grounding.validation], [0, 'not_run'], 'no citation review; grounding not_run, not passed');
    assert.ok(call.text.includes(INSTRUCTION), 'the original learner instruction reaches the writer');
  });
  await t.test('BE.06 table: the same author/publication path with the table tool only', async () => {
    const { h, resultId } = await firstCard(t, [explanation(), table()]);
    assert.equal((await deliver(h, resultId)).status, 200);
    const next = await status(h);
    assert.equal(next.proposal?.format, 'table', 'the automatic next offer is the table step');
    const second = await acceptCard(h, next, 'accept2');
    assert.equal(second.status, 202);
    assert.equal(h.authorCalls.length, 2);
    assert.deepEqual(toolNames(h.authorCalls[1]), ['make_table']);
    assert.ok(h.authorCalls[1].text.includes(MARKER) && h.authorCalls[1].text.includes('CLAIM-TABLE'));
    const row = resultRow(h, second.body.slots[0].resultId);
    assert.deepEqual([row.generation, row.primitive, row.validation], ['generated', 'table', 'passed']);
  });
  for (const [name, bad] of [['malformed output', explanation('Only a title', '')], ['the wrong tool', table()], ['a provider 5xx', httpError(500)]]) {
    await t.test(`BE.06 ${name}: one author call, terminal failure, no readable card, no automatic redispatch`, async () => {
      const { h, view, resultId } = await firstCard(t, [bad, explanation(), explanation()]);
      assert.equal(h.authorCalls.length, 1, 'no automatic author retry or repair');
      const row = resultRow(h, resultId);
      assert.equal(row.generation, 'failed');
      assert.equal((await h.send('alice', 'GET', `/api/learn/roadmap/${view.roadmap.id}/results/${resultId}?boardId=${h.boards.alice}`)).status, 404);
    });
  }
  await t.test('BE.06 a returned model mismatch is not re-sent', async () => {
    const { h } = await firstCard(t, [reply('make_explanation', { title: 'x', body: 'Gini measures mixing.' }, { served: 'claude-haiku-4-5' }), explanation()]);
    assert.equal(h.authorCalls.length, 1);
  });
});

// EXP-13 (owner 2026-11-08): one budget for every Depth, counting prose only (paragraph, heading and list text); the request asks for the 600 target and the server
// refuses only above the 700 hard limit. The title, tables and diagrams do not count.
const { EXPLANATION_BUDGET } = await import('../src/chat-depth.js');
const CAPS = { overview: EXPLANATION_BUDGET.hard, standard: EXPLANATION_BUDGET.hard, deep: EXPLANATION_BUDGET.hard };
const { explanationProseChars } = await import('../src/learn-primitives.js');
const charsOf = block => explanationProseChars(block);
// A v2 body (prose, diagram, prose) whose prose is exactly `target` code points (Unicode filler); the diagram is titled from the prose before it.
const AFTER = 'Gini splits.';
const bodyFor = (title, target) => withVisual(`Gini ${'é'.repeat(target - 'Gini '.length - 1 - AFTER.length)}`, { after: AFTER });
const RICH_BODY = 'Compare the two criteria:\n\n| criterion | range |\n| --- | --- |\n| Gini | 0 to 0.5 |\n| Entropy | 0 to 1 |\n\n```rh-diagram\n{"version":1,"diagram":{"kind":"flow","title":"Splitting a node","nodes":[{"id":"a","label":"Node","role":"process"},{"id":"b","label":"Purer children","role":"outcome"}],"edges":[{"from":"a","to":"b","label":"split"}]}}\n```\n\nNotice both reach zero for a pure node.';

test('BE.06a Tutor Explanation authoring, saved output and caps (CORE.09)', async t => {
  for (const [depth, cap] of Object.entries(CAPS)) {
    await t.test(`BE.06a ${depth}: the accepted title wins, the request asks for ${EXPLANATION_BUDGET.target}, exactly ${cap} prose characters pass and survive reload`, async () => {
      const title = STEPS[0].title;
      const body = bodyFor(title, cap);
      assert.equal(charsOf({ title, body }), cap);
      const { h, accepted, resultId } = await firstCard(t, [explanation('A different model title', body)], { depth });
      assert.equal(accepted.status, 202);
      assert.ok(h.authorCalls[0].text.includes(`at most ${EXPLANATION_BUDGET.target} characters of prose`), `the dispatched request names the ${EXPLANATION_BUDGET.target} target`);
      const row = resultRow(h, resultId);
      assert.equal(row.generation, 'generated', `exactly ${cap} code points pass`);
      assert.equal(JSON.parse(row.body_json).title, title, 'the canonical accepted title wins over the model title');
      const delivered = await deliver(h, resultId);
      assert.equal(delivered.status, 200);
      const saved = (await boardBlocks(h)).find(b => b.id === accepted.body.slots[0].cardId);
      assert.deepEqual([saved.title, saved.body], [title, body], 'the same card/result identity survives save and reload');
    });
    await t.test(`BE.06a ${depth}: one code point over ${cap} is a terminal validation failure with one settlement and no redispatch`, async () => {
      const title = STEPS[0].title;
      const { h, view, resultId } = await firstCard(t, [explanation(title, bodyFor(title, cap + 1)), explanation()], { depth });
      const row = resultRow(h, resultId);
      assert.equal(h.authorCalls.length, 1, 'no redispatch');
      assert.deepEqual([row.generation, row.failure_class], ['failed', 'terminal_validation_failure'], 'over cap fails');
      assert.equal(row.billing, 'refunded', 'one applicable settlement');
      assert.equal((await h.send('alice', 'GET', `/api/learn/roadmap/${view.roadmap.id}/results/${resultId}?boardId=${h.boards.alice}`)).status, 404, 'no ready card');
    });
  }
  await t.test('BE.06a a table and a valid rh-diagram spec in the body survive validation intact', async () => {
    const { h, resultId } = await firstCard(t, [explanation(STEPS[0].title, RICH_BODY)]);
    const row = resultRow(h, resultId);
    assert.equal(row.generation, 'generated');
    assert.deepEqual([JSON.parse(row.body_json).body, JSON.parse(row.body_json).more], [RICH_BODY, undefined]);
  });
  await t.test('BE.06a EXP-13: absent `more` passes; a folded section on a new card is refused (owner decision C1)', async () => {
    const ok = await firstCard(t, [explanation(STEPS[0].title, withVisual('Gini measures how mixed a node is.'))]);
    assert.equal(resultRow(ok.h, ok.resultId).generation, 'generated');
    for (const more of [[], [{ label: 'Worked example', text: 'A pure node has Gini 0.' }]]) {
      const { h, resultId } = await firstCard(t, [explanation(STEPS[0].title, withVisual('Gini measures how mixed a node is.'), more), explanation()]);
      assert.deepEqual([resultRow(h, resultId).generation, h.authorCalls.length], ['failed', 1], JSON.stringify(more));
    }
  });
  await t.test('BE.06a a new Mermaid fence (the superseded format) is a terminal validation failure, not a saved card', async () => {
    const bad = 'See:\n\n```mermaid\nflowchart TD\n  A["<b>Node</b>"] --> B["Leaf"]\n  click A "https://example.test"\n```';
    const { h, resultId } = await firstCard(t, [explanation(STEPS[0].title, bad), explanation()]);
    const row = resultRow(h, resultId);
    assert.deepEqual([row.generation, row.failure_class, h.authorCalls.length], ['failed', 'terminal_validation_failure', 1]);
  });
  await t.test('BE.06a a later Depth change leaves the accepted Depth of an in-flight card intact', async () => {
    const h = await workflow(t, { script: [explanation(STEPS[0].title, withVisual('Gini measures how mixed a node is.'))], hold: true });
    const view = await started(h);
    assert.equal((await acceptCard(h, view, 'accept1')).status, 202);
    const changed = await h.route('alice', routes.revise(await status(h), { settings: { depth: 'deep' } }, KEY('depth')));
    assert.equal(changed.status, 202, 'a Depth change on the active roadmap re-plans (be contract: always 202 and a new draft)');
    await h.run();
    assert.equal(h.authorCalls.length, 1);
    assert.match(h.authorCalls[0].text, /Depth: standard/i, 'the frozen accepted Depth');
    assert.doesNotMatch(h.authorCalls[0].text, /Depth: deep/i);
  });
});

test('BE.07 real reservation, debit and settlement (CORE.04-06)', async t => {
  await t.test('BE.07 planning, proposal review and navigation spend nothing; one accepted card is one hold covering its actual request', async () => {
    const h = await workflow(t, { script: [explanation()] });
    const view = await started(h);
    await status(h); await status(h);
    assert.deepEqual([learnerActions(h).length, authorizations(h).length, (await h.totals()).used], [0, 0, 0], 'no learner spend before acceptance');
    assert.equal((await acceptCard(h, view, 'accept1')).status, 202);
    const [auth] = authorizations(h), [call] = h.authorCalls;
    assert.equal(authorizations(h).length, 1, 'one hold/authorization per accepted card');
    assert.equal(learnerActions(h).length, 1, 'one learner action identity');
    assert.ok(auth.per_card_bound_micros >= toMicros(requestSpendBound(call.body, call.model)), 'the reserved bound covers the actual serialized request');
    const calls = h.rows("SELECT * FROM learn_roadmap_calls WHERE stage = 'generate'");
    assert.equal(calls.length, 1);
    assert.deepEqual([calls[0].provider, calls[0].model], ['anthropic', call.model], 'the call row names the actual provider and model');
    // be: request_fingerprint = sha256(JSON.stringify([provider, model, outgoing body])) (roadmap-generate.js requestFingerprint).
    assert.equal(calls[0].request_fingerprint, await sha(JSON.stringify([calls[0].provider, call.model, call.body])), 'the call is bound to the actual outgoing body');
  });
  await t.test('BE.07 duplicate acceptance, polling and restore add no debit', async () => {
    const { h, view, resultId } = await firstCard(t, [explanation()]);
    const used = (await h.totals()).used;
    assert.ok(used > 0, 'the card is charged');
    await acceptCard(h, view, 'accept1'); await status(h);
    assert.equal((await deliver(h, resultId)).status, 200);
    await h.route('alice', routes.deliver(await status(h), resultId, KEY('restore')));
    assert.equal((await h.totals()).used, used);
    assert.equal(learnerActions(h).length, 1);
  });
  await t.test('BE.07 exactly sufficient allowance is admitted, one micro less is a truthful non-started refusal', async () => {
    const probe = await firstCard(t, [explanation()]);
    const aggregate = authorizations(probe.h)[0].aggregate_micros;
    const enough = await firstCard(t, [explanation()], { allowanceMicros: aggregate });
    assert.equal(enough.accepted.status, 202, 'exactly sufficient');
    const short = await firstCard(t, [explanation()], { allowanceMicros: aggregate - 1 });
    assert.equal(short.accepted.status, 429);
    assert.equal(short.accepted.body.current.proposal.acceptable, true, 'the proposal stays acceptable');
    assert.deepEqual([short.h.authorCalls.length, authorizations(short.h).length, (await short.h.totals()).used], [0, 0, 0], 'zero author calls, no hold');
  });
  await t.test('BE.07 a known failed generation refunds once with no second author call', async () => {
    const { h, resultId } = await firstCard(t, [httpError(529), explanation()]);
    assert.equal(h.authorCalls.length, 1, 'no automatic author redispatch');
    const totals = await h.totals(), adjustments = h.rows('SELECT * FROM usage_adjustments').length;
    assert.deepEqual([totals.used, totals.reserved], [0, 0], 'nothing charged and nothing left held');
    assert.deepEqual(h.rows('SELECT state, remaining_micros FROM learn_step_authorizations').map(a => [a.state, a.remaining_micros]), [['released', 0]], 'the hold is released once');
    assert.ok(['refunded', 'failed'].includes(resultRow(h, resultId).billing), 'settled as not charged');
    assert.ok(adjustments <= 1, 'at most one refund');
    await h.run();
    assert.equal(h.rows('SELECT * FROM usage_adjustments').length, adjustments, 'a replay refunds nothing more');
  });
  await t.test('BE.07 an unknown outcome stays reconciling without a second author call', async () => {
    const { h, resultId } = await firstCard(t, [timeout(), explanation()]);
    assert.equal(h.authorCalls.length, 1);
    assert.ok(h.rows("SELECT * FROM learn_roadmap_calls WHERE result_id = ? AND checkpoint IN ('unknown', 'reconciling')", resultId).length >= 1 || resultRow(h, resultId).reconciliation === 'required', 'the uncertain call is not relabelled');
    await h.run();
    assert.equal(h.authorCalls.length, 1, 'never resent blind');
  });
});

test('BE.08 same identity, board save, acknowledgment and reload (CORE.07, UI.04/06)', async t => {
  const geometry = { x: 520, y: 40, w: 420 };
  await t.test('BE.08 a failed save sends no ack and no successor; the lost ack reconciles the same card without regeneration', async () => {
    const { h, view, resultId, cardId } = await firstCard(t, [explanation(), explanation()]);
    const used = (await h.totals()).used;
    const got = await h.route('alice', routes.deliver(await status(h), resultId, KEY('d1')));
    assert.equal(got.body.cards[0].block.id, cardId, 'the server-minted card id');
    const board = await h.send('alice', 'GET', `/api/learn/boards/${USERS.alice.canvas}/main`);
    const stale = await h.send('alice', 'PUT', `/api/learn/boards/${USERS.alice.canvas}/main`, { state: { blocks: [...board.body.state.blocks, { ...got.body.cards[0].block, ...geometry }] }, version: board.body.version - 1 });
    assert.equal(stale.status, 409, 'the save failed');
    const early = await h.send('alice', 'POST', `/api/learn/roadmap/${view.roadmap.id}/results/${resultId}/ack`, { boardId: h.boards.alice, revision: (await status(h)).roadmap.revision, actionKey: KEY('early'), resultVersion: 1, cardId, boardRevision: board.body.version });
    assert.deepEqual([early.status, early.body.code], [422, 'card_not_saved'], 'no premature ack');
    const now = await status(h);
    assert.equal(now.results[0].delivery, 'not_delivered');
    assert.equal(now.proposal, null, 'no successor before a saved delivery');
    const done = await deliver(h, resultId, { geometry, key: 'ack1' });
    assert.equal(done.status, 200);
    const lost = await h.send('alice', 'POST', `/api/learn/roadmap/${view.roadmap.id}/results/${resultId}/ack`, { boardId: h.boards.alice, revision: done.body.roadmap.revision, actionKey: KEY('ack1'), resultVersion: 1, cardId, boardRevision: done.boardVersion });
    assert.equal(lost.status, 200, 'a lost ack response retried with the same key replays');
    const blocks = await boardBlocks(h);
    assert.equal(blocks.filter(b => b.id === cardId).length, 1, 'no duplicate board block');
    const restored = await h.route('alice', routes.deliver(await status(h), resultId, KEY('d2')));
    assert.deepEqual(planDelivery(restored.body, id => blocks.some(b => b.id === id)).insert, [], 'a fresh client restores without inserting again');
    assert.deepEqual([h.authorCalls.length, (await h.totals()).used], [1, used], 'no regeneration, no new debit');
    assert.equal(h.rows("SELECT * FROM learn_roadmap_outbox WHERE kind = 'card_delivered'").length, 1);
    assert.equal(pending(h).length, 1, 'one next offer after the acknowledged delivery');
  });
  await t.test('BE.08 the saved card keeps the minted id, source relationship, slot top-left/width and accepted title through reload', async () => {
    const h = await workflow(t, { script: [explanation()] });
    const view = await started(h);
    // Canvas lane contract (roadmap-slots.js): POST /api/learn/roadmap/:rm/slots { boardId, stepId, proposalId, x, y, w }, persisted once per offer; GET returns the map.
    const slotUrl = `/api/learn/roadmap/${view.roadmap.id}/slots`;
    const place = (over = {}) => h.send('alice', 'POST', slotUrl, { boardId: h.boards.alice, stepId: view.proposal.stepId, proposalId: view.proposal.id, ...geometry, ...over });
    assert.equal((await place()).status, 200);
    assert.equal((await place({ x: 9, y: 9 })).body.slot.x, geometry.x, 'a repeat or later measurement never moves the slot');
    const accepted = await acceptCard(h, view, 'accept1');
    const { resultId, cardId } = accepted.body.slots[0];
    const placed = (await h.send('alice', 'GET', `${slotUrl}?boardId=${h.boards.alice}`)).body.slots[view.proposal.stepId];
    assert.deepEqual([placed.x, placed.y, placed.w], [geometry.x, geometry.y, geometry.w], 'the private slot geometry survives acceptance and reload');
    assert.equal((await h.send('bob', 'GET', `${slotUrl}?boardId=${h.boards.bob}`)).status, 404, 'private to its roadmap owner');
    assert.equal((await deliver(h, resultId, { geometry })).status, 200);
    const saved = (await boardBlocks(h)).find(b => b.id === cardId);
    assert.deepEqual([saved.x, saved.y, saved.w], [geometry.x, geometry.y, geometry.w]);
    assert.equal(saved.sourceRef?.source?.key, `file:${USERS.alice.fileId}`, 'the source relationship');
    assert.deepEqual([placed.x, placed.y, placed.w], [saved.x, saved.y, saved.w], 'the stored slot geometry is the saved card geometry');
    assert.doesNotMatch(JSON.stringify(await boardBlocks(h)), /slots|proposalId/, 'slot state never rides in the board');
    assert.equal(saved.title, STEPS[0].title, 'the accepted title');
  });
  await t.test('BE.08 the view distinguishes generated from board-saved and acknowledged', async () => {
    const { h, resultId } = await firstCard(t, [explanation()]);
    // be contract: results[].stage generating|checking|saving|ready|failed; 'saving' = generated and passed, not yet acknowledged.
    assert.equal((await status(h)).results[0].stage, 'saving', 'generated is not ready before durable delivery');
    assert.equal((await deliver(h, resultId)).status, 200);
    assert.equal((await status(h)).results[0].stage, 'ready');
  });
});

test('BE.09 durable Chat lifecycle and late events (UI.01/04/08)', async t => {
  const { h, view, resultId, cardId } = await firstCard(t, [explanation()]);
  await chats(h);
  const clientId = `roadmap-step-${view.proposal.stepId}`;
  // Chat lane contract: one message per client_id, re-POSTed with a higher tutor.seq to advance it in place; an equal or older seq changes nothing.
  const entry = (version, stage, extra = {}) => ({ client_id: clientId, role: 'assistant', content: `${STEPS[0].title}: ${stage}`, tutor: { v: 1, kind: 'roadmap_step', seq: version, stage, stepId: view.proposal.stepId, proposalId: view.proposal.id, proposalVersion: view.proposal.version, ...extra } });
  assert.equal((await saveMessage(h, T_BUSY, entry(1, 'proposed'))).status, 201);
  // The learner switches Chat to another thread; the late result still lands in the entry's own thread.
  assert.equal((await h.send('alice', 'PUT', '/api/learn/chat/active', { app: USERS.alice.canvas, thread_id: T_DRAFT })).status, 200);
  for (const [v, stage] of [[2, 'accepting'], [3, 'generating'], [4, 'saving']]) await saveMessage(h, T_BUSY, entry(v, stage));
  assert.equal((await deliver(h, resultId)).status, 200);
  await saveMessage(h, T_BUSY, entry(5, 'ready', { resultId, cardId }));
  await saveMessage(h, T_BUSY, entry(3, 'generating')); // a duplicate, older outbox/poll event
  const thread = (await readThread(h, T_BUSY)).body;
  const mine = thread.messages.filter(m => m.clientId === clientId);
  assert.equal(mine.length, 1, 'one logical Chat entry per card');
  assert.deepEqual(thread.messages.slice(0, 2).map(m => m.clientId), ['u-old-1', 'a-old-1'], 'older history preserved');
  assert.equal((await readThread(h, T_DRAFT)).body.draft?.text, 'half typed question', 'the unsent draft preserved');
  assert.equal((await h.send('bob', 'GET', `/api/ask/threads/${T_BUSY}`)).status, 404, 'another learner cannot read it');
  assert.ok([403, 404].includes((await saveMessage(h, T_BUSY, entry(6, 'failed'), 'bob')).status), 'or write into it');
  assert.equal(mine[0].meta?.tutor?.stage, 'ready', 'the entry advanced to ready and a late duplicate did not regress it');
  assert.deepEqual([mine[0].meta.tutor.cardId, mine[0].meta.tutor.resultId], [cardId, resultId], 'card and result ids restore from storage');
});

test('BE.10 automatic next offer and an actual second card (CORE.07, UI.08, R6)', async t => {
  const { h, resultId, cardId } = await firstCard(t, [explanation(), table()]);
  assert.equal((await deliver(h, resultId)).status, 200);
  const offered = await status(h);
  assert.equal(pending(h).length, 1, 'exactly one checked next metadata proposal');
  assert.equal(offered.proposal.title, STEPS[1].title);
  assert.deepEqual([h.authorCalls.length, authorizations(h).length], [1, 1], 'no second hold or author call before its acceptance');
  await h.run(); await h.run(); // duplicate outbox wakes converge on the same offer
  assert.equal(pending(h).length, 1);
  assert.equal((await status(h)).proposal.id, offered.proposal.id);
  assert.equal(pillOf({ flag: 'on', view: offered, busy: [], editing: false, mode: 'auto' })?.accept, true, 'the projected pill targets the ready offer');
  const next = await acceptCard(h, offered, 'next'); // Next card: the ready proposal's own accept route, once
  assert.equal(next.status, 202);
  const second = next.body.slots[0];
  assert.equal((await deliver(h, second.resultId, { geometry: { x: 520, y: 600, w: 420 } })).status, 200);
  const blocks = await boardBlocks(h);
  assert.ok(blocks.some(b => b.id === cardId) && blocks.some(b => b.id === second.cardId), 'both cards saved; the first is preserved');
  assert.notEqual(second.cardId, cardId);
  const settled = h.rows("SELECT id, card_id, delivery, billing FROM learn_step_results WHERE decision = 'accepted'");
  assert.deepEqual(settled.map(r => [r.delivery, r.billing]), [['delivered', 'settled'], ['delivered', 'settled']]);
  assert.deepEqual([h.authorCalls.length, learnerActions(h).length, authorizations(h).length], [2, 2, 2], 'two author dispatches, two learner card actions, no extras');
  assert.ok(h.authorCalls[1].text.includes('CLAIM-TABLE') && !h.authorCalls[1].text.includes('CLAIM-GINI'), 'the second card has its own accepted context');
  const refs = h.rows('SELECT card_id, ref_id FROM learn_source_ref_cards WHERE board_id = ?', h.boards.alice);
  assert.equal(new Set(refs.map(r => r.ref_id)).size, 2, 'each card keeps its own source anchor');
  assert.deepEqual(h.handlerErrors, []);
  await receipt('twoCardFlow', h, { cards: [cardId, second.cardId] });
});

test('BE.11 manual pacing, cancellation, end and finite completion (UI.08, R6)', async t => {
  await t.test('BE.11 Auto-suggest off: no unsolicited successor; Propose next step is metadata only; Next card accepts it directly', async () => {
    const h = await workflow(t, { script: [explanation(), table()] });
    h.sqlite.prepare("INSERT INTO learn_user_settings (org, owner_user_id, auto_suggest, updated_at) VALUES ('team', 'u-alice', 0, 'x')").run();
    const view = await started(h);
    assert.ok(view.proposal, 'explicit Accept roadmap still offers the first card with Auto-suggest off');
    const first = await acceptCard(h, view, 'a1');
    assert.equal((await deliver(h, first.body.slots[0].resultId)).status, 200);
    assert.equal(pending(h).length, 0, 'no unsolicited successor');
    const proposed = await h.route('alice', routes.proposeNext(await status(h), KEY('propose')));
    assert.equal(proposed.status, 200);
    assert.deepEqual([h.authorCalls.length, authorizations(h).length], [1, 1], 'Propose next step creates metadata only');
    assert.equal((await acceptCard(h, proposed.body, 'a2')).status, 202, 'Next card accepts the ready offer directly');
    assert.equal(h.authorCalls.length, 2);
    assert.equal(h.rows('SELECT auto_suggest FROM learn_user_settings')[0].auto_suggest, 0, 'the setting is unchanged');
  });
  await t.test('BE.11 Cancel removes only the pending offer and pauses; End keeps delivered cards; no author call or debit', async () => {
    const { h, resultId, cardId } = await firstCard(t, [explanation()]);
    assert.equal((await deliver(h, resultId)).status, 200);
    const offered = await status(h), used = (await h.totals()).used;
    assert.equal((await h.route('alice', routes.cancelProposal(offered, KEY('cancel')))).status, 200);
    const paused = await status(h);
    assert.deepEqual([paused.roadmap.state, paused.proposal], ['paused', null]);
    await h.run();
    assert.equal(pending(h).length, 0, 'automatic progression paused');
    assert.equal((await h.route('alice', routes.end(paused, KEY('end')))).status, 200);
    assert.ok((await boardBlocks(h)).some(b => b.id === cardId), 'delivered cards remain');
    assert.deepEqual([h.authorCalls.length, (await h.totals()).used], [1, used]);
    assert.equal(pillOf({ flag: 'on', view: await status(h), busy: [], editing: false, mode: 'auto' }), null, 'no pill after End');
  });
  await t.test('BE.11 the finite endpoint completes with no extra offer', async () => {
    const h = await workflow(t, { plans: [planOf([STEPS[0]], { coverage: { uncovered: [{ start: AT.entropy, end: MD.length, reason: 'Only Gini was asked for.' }] } })], script: [explanation()] });
    const view = await started(h);
    const first = await acceptCard(h, view, 'a1');
    assert.equal((await deliver(h, first.body.slots[0].resultId)).status, 200);
    const done = (await h.send('alice', 'GET', `/api/learn/roadmap/${view.roadmap.id}?boardId=${h.boards.alice}`)).body;
    assert.deepEqual([done.roadmap.state, done.proposal, pending(h).length], ['completed', null, 0]);
  });
});

test('BE.12 terminal failures, refusals and uncertain outcomes (CORE.04/06, UI.04/08)', async t => {
  for (const [name, bad] of [['provider 4xx', httpError(400)], ['provider 5xx', httpError(503)], ['timeout', timeout()]]) {
    await t.test(`BE.12 ${name}: truthful failure on the same slot, one settlement, no redispatch, no Retry/Replace/Omit`, async () => {
      const { h, view, resultId, cardId } = await firstCard(t, [bad, explanation(), explanation()]);
      assert.equal(h.authorCalls.length, 1, 'zero automatic author redispatch');
      const now = await status(h);
      const result = now.results.find(r => r.id === resultId);
      assert.equal(result.slot.cardId, cardId, 'the original slot identity');
      assert.doesNotMatch(JSON.stringify(now), /"(retry|replace|omit|recovery)"/i, 'no ordinary recovery action is advertised');
      assert.ok(result.failure || result.generation === 'failed' || result.reconciliation === 'required' || h.rows("SELECT 1 FROM learn_roadmap_calls WHERE result_id = ? AND checkpoint IN ('unknown','reconciling')", resultId).length, 'a truthful stage');
      assert.ok(h.rows('SELECT * FROM usage_adjustments').length <= 1, 'at most one refund');
      void view;
    });
  }
  await t.test('BE.12 a valid safety refusal stops automatic successors', async () => {
    const { h, resultId } = await firstCard(t, [explanation()], { classifier: async ({ role } = {}) => (role === 'output' ? unsafe : calm) });
    const row = resultRow(h, resultId);
    assert.equal(row.failure_class, 'policy_block');
    await h.run();
    assert.equal(pending(h).length, 0, 'no automatic offer after a refusal');
  });
  await t.test('BE.12 an ordinary failed step continues to one next offer only after settlement', async () => {
    const { h, resultId } = await firstCard(t, [explanation('t', ''), explanation()]);
    assert.equal(resultRow(h, resultId).generation, 'failed');
    await h.run(); await h.run();
    assert.equal(pending(h).length, 1, 'one successor after the settled failure');
  });
});

test('BE.13 source anchors, placement data and invalidation (CORE.02, UI.06-07)', async t => {
  const { h, resultId, cardId } = await firstCard(t, [explanation(), table()]);
  assert.equal((await deliver(h, resultId)).status, 200);
  const second = await acceptCard(h, await status(h), 'a2');
  assert.equal((await deliver(h, second.body.slots[0].resultId, { geometry: { x: 520, y: 600, w: 420 } })).status, 200);
  const blocks = await boardBlocks(h);
  const cards = [blocks.find(b => b.id === cardId), blocks.find(b => b.id === second.body.slots[0].cardId)];
  for (const [i, card] of cards.entries()) {
    assert.deepEqual([card.sourceRef?.source?.key, card.sourceRef?.source?.rev], [`file:${USERS.alice.fileId}`, h.rev], `card ${i + 1}: exact source revision`);
    const quote = card.sourceRef?.anchor?.quote?.exact || '';
    assert.ok(quote && MD.slice(STEPS[i].passage.start, STEPS[i].passage.end).includes(quote.slice(0, 40)), `card ${i + 1}: the anchor quotes its own passage`);
  }
  const index = h.rows('SELECT card_id, ref_id, status FROM learn_source_ref_cards WHERE board_id = ? ORDER BY position', h.boards.alice);
  assert.deepEqual(index.map(r => [r.card_id, r.status]).sort(), cards.map(c => [c.id, 'current']).sort(), 'source -> card index for both delivered cards');
  // A repeated/ambiguous quotation is refused, not guessed.
  const ref = 'sref_00000000000000000000000b';
  h.sqlite.prepare("INSERT INTO learn_source_refs (id, org, owner_email, kind, source_key, source_name, source_rev, anchor_json, anchor_hash, created_at) VALUES (?, 'team', ?, 'markdown', ?, ?, ?, ?, 'h', 1)")
    .run(ref, USERS.alice.email, `file:${USERS.alice.fileId}`, FILE_NAME, h.rev, JSON.stringify({ quote: { exact: 'A decision tree asks one question' } }));
  const h2 = await workflow(t);
  h2.sqlite.prepare("INSERT INTO learn_source_refs (id, org, owner_email, kind, source_key, source_name, source_rev, anchor_json, anchor_hash, created_at) VALUES (?, 'team', ?, 'markdown', ?, ?, ?, ?, 'h', 1)")
    .run(ref, USERS.alice.email, `file:${USERS.alice.fileId}`, FILE_NAME, h2.rev, JSON.stringify({ quote: { exact: 'A decision tree asks one question' } }));
  const ambiguous = await explain(h2, { scope: { kind: 'passage', sourceRefId: ref } });
  assert.deepEqual([ambiguous.status, ambiguous.body.code], [422, 'needs_clarification']);
  // A source change: the delivered cards and history stay; the index reports it honestly; nothing regenerates.
  h.sqlite.prepare('UPDATE file_sources SET sha256 = ? WHERE id = ?').run('changed-revision', USERS.alice.fileId);
  const resave = await h.send('alice', 'PUT', `/api/learn/boards/${USERS.alice.canvas}/main`, { state: { blocks }, version: (await h.send('alice', 'GET', `/api/learn/boards/${USERS.alice.canvas}/main`)).body.version });
  assert.equal(resave.status, 200);
  assert.ok(h.rows('SELECT status FROM learn_source_ref_cards WHERE board_id = ?', h.boards.alice).every(r => r.status === 'changed'), 'changed revision is reported, not hidden');
  assert.equal((await boardBlocks(h)).length, blocks.length, 'delivered cards preserved');
  assert.equal(h.authorCalls.length, 2, 'no silent regeneration');
});

test('BE.14 access, entitlement and private projections (CORE.05, UI.01-08)', async t => {
  const { h, view, resultId, cardId } = await firstCard(t, [explanation(), explanation()]);
  const rm = view.roadmap.id;
  // Missing identity: 401 on every surface, nothing spent.
  for (const [method, path, body] of [['GET', `/api/learn/roadmap?boardId=${h.boards.alice}`], ['POST', `/api/learn/roadmap/${rm}/proposals/${view.proposal.id}/accept`, { boardId: h.boards.alice }],
    ['GET', `/api/ask/threads/${T_BUSY}`], ['PUT', `/api/learn/boards/${USERS.alice.canvas}/main`, { state: { blocks: [] } }]])
    assert.equal((await h.send(null, method, path, body)).status, 401, `${method} ${path}`);
  // A second learner: another board, forged roadmap/proposal/result ids.
  const bob = await started(h, { who: 'bob' });
  assert.equal((await h.send('bob', 'GET', `/api/learn/roadmap?boardId=${h.boards.alice}`)).status, 404, 'another board is not found');
  assert.equal((await h.send('bob', 'POST', `/api/learn/roadmap/${rm}/proposals/${view.proposal.id}/accept`, { boardId: h.boards.bob, revision: bob.roadmap.revision, proposalVersion: 1, actionKey: KEY('forge') })).status, 404, 'a forged proposal id');
  assert.equal((await h.send('bob', 'POST', `/api/learn/roadmap/${bob.roadmap.id}/results/${resultId}/deliver`, { boardId: h.boards.bob })).status, 404, 'a forged result id');
  assert.equal((await h.send('bob', 'GET', `/api/learn/roadmap/${rm}/results/${resultId}?boardId=${h.boards.bob}`)).status, 404);
  assert.equal((await h.send('bob', 'GET', `/api/learn/boards/${USERS.alice.canvas}/main`)).status, 403, 'another learner\'s board');
  assert.equal(h.rows("SELECT * FROM learn_step_authorizations WHERE owner_user_id = 'u-bob'").length, 0, 'no hold or charge for bob');
  // Status, share and history projections carry no private source text, drafts, evidence or prices.
  noLeak(h, JSON.stringify(await status(h)));
  assert.equal((await deliver(h, resultId)).status, 200);
  const shared = await h.send('alice', 'POST', `/api/learn/boards/${USERS.alice.canvas}/main/share`, { shared: true, view: true });
  assert.equal(shared.status, 200);
  const token = h.rows('SELECT view_token FROM learn_boards WHERE id = ?', h.boards.alice)[0].view_token;
  const open = await h.send('bob', 'GET', `/api/learn/boards/shared/${token}`);
  assert.equal(open.status, 200);
  const sharedJson = JSON.stringify(open.body);
  assert.ok(sharedJson.includes(cardId), 'the delivered card is shared');
  assert.doesNotMatch(sharedJson, /pr_[0-9a-f]{24}|rm_[0-9a-f]{24}|rs_[0-9a-f]{24}|authorization|proposal/i, 'no private roadmap state in the share');
  noLeak(h, sharedJson);
  // Source revocation: a new accept spends nothing and calls no author; delivered card stays.
  h.sqlite.prepare('DELETE FROM file_sources WHERE id = ?').run(USERS.alice.fileId);
  const next = await status(h);
  if (next.proposal) {
    const tried = await acceptCard(h, next, 'after-revoke');
    assert.ok(tried.status >= 400 || resultRow(h, tried.body.slots[0].resultId).generation === 'failed', 'revoked source: refused or a zero-call failure');
  }
  assert.equal(h.authorCalls.length, 1, 'no author call after revocation');
  assert.ok((await boardBlocks(h)).some(b => b.id === cardId), 'delivered material preserved');
  // contracts.md absent: assumed documented denial code on a forged accept is `not_found` with the existing NOT_AVAILABLE body.
  const forged = await h.send('alice', 'POST', `/api/learn/roadmap/${rm}/proposals/pr_000000000000000000000000/accept`, { boardId: h.boards.alice, revision: next.roadmap.revision, proposalVersion: 1, actionKey: KEY('forged') });
  assert.deepEqual([forged.status, forged.body.code], [404, 'not_found'], 'the exact error contract');
});

// ---- Offer readiness and recovery in place (checklist 4.1.1, BE.04 extension, BE.05a). Built-in formats only (explanation, table); ROADMAP_FORMATS_OFF is the
// runtime fact that changes after a roadmap was approved. Nothing here may start an author call, a hold or a debit for an offer that is not ready.
const TABLE_FIRST = (required = false) => planOf([{ ...STEPS[1], passage: { start: 0, end: AT.entropy }, ...(required ? { formatRequired: true } : {}) }, { ...STEPS[0], passage: { start: AT.entropy, end: AT.background } }], { coverage: { uncovered: [{ start: AT.background, end: MD.length, reason: 'The learner asked to focus on the criteria.' }] } });
const noWork = (h, before) => assert.deepEqual([h.authorCalls.length, authorizations(h).length, learnerActions(h).length, pending(h).length, JSON.stringify(h.totals())], [0, 0, 0, 0, before], 'zero author dispatch, hold, debit and offer');
const recover = (h, view, choice, key) => h.send('alice', 'POST', `/api/learn/roadmap/${view.roadmap.id}/steps/recover`, { boardId: h.boards.alice, revision: view.roadmap.revision, stepId: view.offerRecovery?.stepId ?? view.steps[0].id, choice, actionKey: KEY(key) });
const stepAcceptedSnapshot = h => JSON.parse(h.rows("SELECT payload_json FROM learn_roadmap_outbox WHERE kind = 'step_accepted' ORDER BY rowid DESC LIMIT 1")[0].payload_json).snapshot;

test('BE.04 the first metadata proposal exists only when the first format qualifies (extension)', async t => {
  await t.test('BE.04 ready first format: one proposal, no author dispatch; a repeated plan acceptance changes nothing', async () => {
    const h = await workflow(t);
    const view = await started(h);
    assert.equal(pending(h).length, 1);
    assert.deepEqual([view.proposal.format, view.offerRecovery], ['explanation', null]);
    const again = await acceptPlan(h, view, { key: 'plan' });
    assert.deepEqual([again.status, pending(h).length, h.authorCalls.length, authorizations(h).length], [200, 1, 0, 0], 'idempotent acceptance, still one offer, no charge');
  });
  await t.test('BE.04 a first format that does not qualify offers no proposal; the accepted tree is unchanged and the step stays planned', async () => {
    const h = await workflow(t, { plans: [TABLE_FIRST(true)] });
    h.env.ROADMAP_FORMATS_OFF = 'table';
    const before = JSON.stringify(h.totals());
    const view = await started(h);
    assert.equal(view.roadmap.state, 'active');
    assert.equal(view.acceptedPlan.steps.length, 2, 'the accepted tree is published whole');
    assert.equal(view.proposal, null, 'no proposal became actionable');
    assert.deepEqual([view.steps[0].state, view.offerRecovery?.stepId === view.steps[0].id, view.offerRecovery?.question?.options.map(o => o.id)], ['planned', true, ['alternative', 'edit']]);
    noWork(h, before);
  });
});

test('BE.05a tool readiness and recovery at the card offer (CORE.03-05, UI.04, R6)', async t => {
  await t.test('BE.05a ready format: offered as planned, approval binds the exact format, settings and source revision, and that binding reaches the writer', async () => {
    const h = await workflow(t, { script: [explanation()] });
    const view = await started(h);
    const accepted = await acceptCard(h, view, 'ready');
    assert.equal(accepted.status, 202);
    const snap = stepAcceptedSnapshot(h);
    assert.deepEqual([snap.format, snap.sourceRevision, snap.source.rev, snap.settings.depth, snap.depth], ['explanation', h.rev, h.rev, 'standard', 'standard']);
    assert.equal(h.authorCalls.length, 1);
    assert.deepEqual(h.authorCalls[0].body.tools.map(x => x.name).filter(n => n.startsWith('make_')), ['make_explanation'], 'the writer was offered exactly the approved format');
  });

  await t.test('BE.05a first offer: an unavailable suggested format with a free alternative is offered as that alternative for the SAME step, with its own review', async () => {
    const h = await workflow(t, { plans: [TABLE_FIRST(false)], script: [explanation()] });
    h.env.ROADMAP_FORMATS_OFF = 'table';
    const view = await started(h);
    assert.equal(pending(h).length, 1, 'one step, one offer');
    assert.deepEqual([view.proposal.stepId === view.steps[0].id, view.proposal.format, view.steps[0].format, view.offerRecovery], [true, 'explanation', 'table', null], 'the same step; the alternative is the offer');
    assert.equal(h.authorCalls.length, 0, 'offering charges and authors nothing');
    const accepted = await acceptCard(h, view, 'alt');
    assert.equal(accepted.status, 202);
    assert.deepEqual([stepAcceptedSnapshot(h).format, h.authorCalls[0].body.tools.map(x => x.name).filter(n => n.startsWith('make_'))], ['explanation', ['make_explanation']]);
  });

  await t.test('BE.05a first offer: a REQUIRED format is never changed silently: one focused question in Chat, step undelivered; choosing the alternative offers it once', async () => {
    const h = await workflow(t, { plans: [TABLE_FIRST(true)], script: [explanation()] });
    h.env.ROADMAP_FORMATS_OFF = 'table';
    const before = JSON.stringify(h.totals());
    const view = await started(h);
    assert.equal(view.proposal, null);
    assert.match(view.offerRecovery.question.text, /table card cannot be prepared right now/);
    assert.deepEqual(view.offerRecovery.question.options.map(o => o.id), ['alternative', 'edit']);
    noWork(h, before);
    const chosen = await recover(h, view, 'alternative', 'choose');
    assert.equal(chosen.status, 200);
    assert.deepEqual([chosen.body.proposal.format, chosen.body.proposal.stepId === view.steps[0].id, chosen.body.offerRecovery], ['explanation', true, null], 'the alternative is the same step, with its own review, and the recovery is cleared');
    assert.equal(pending(h).length, 1);
    assert.equal((await recover(h, view, 'alternative', 'choose-again')).status, 409, 'a repeated or stale choice is refused');
    assert.equal((await recover(h, view, 'edit', 'edit')).status, 400, 'Edit roadmap is the Chat edit target and sends no recovery request');
    assert.equal(h.authorCalls.length, 0);
  });

  await t.test('BE.05a no qualified tool: useful help and a next step in Chat, step undelivered, zero work', async () => {
    const h = await workflow(t, { plans: [TABLE_FIRST(false)] });
    h.env.ROADMAP_FORMATS_OFF = 'table,explanation';
    const before = JSON.stringify(h.totals());
    const view = await started(h);
    assert.equal(view.proposal, null);
    assert.match(view.offerRecovery.help, /Edit roadmap/);
    assert.equal(view.offerRecovery.question, undefined);
    assert.equal(view.steps[0].state, 'planned');
    noWork(h, before);
    const manual = await h.route('alice', routes.proposeNext(view, KEY('manual-help')));
    assert.deepEqual([manual.status, manual.body.proposal, pending(h).length], [200, null, 0], 'a manual retry runs the same check and offers nothing');
  });

  await t.test('BE.05a manual next offer and automatic next offer run the same guard after the roadmap was approved', async () => {
    for (const manualPath of [true, false]) {
      const h = await workflow(t, { script: [explanation()], auto: !manualPath });
      const view = await started(h);
      const card = await acceptCard(h, view, 'first');
      assert.equal(card.status, 202);
      h.env.ROADMAP_FORMATS_OFF = 'table'; // the suggested format of step 2 stops being ready after approval
      assert.equal((await deliver(h, card.body.slots[0].resultId)).status, 200);
      await h.run();
      let next = await status(h);
      if (manualPath) { assert.equal(next.proposal, null, 'Auto-suggest off: nothing unsolicited'); next = (await h.route('alice', routes.proposeNext(next, KEY('manual-next')))).body; }
      assert.deepEqual([next.proposal.stepId === next.steps[1].id, next.proposal.format, next.steps[1].format], [true, 'explanation', 'table'], (manualPath ? 'manual' : 'automatic') + ': the eligible alternative for the same step');
      assert.equal(h.authorCalls.length, 1, 'only the first card was authored: the successor offer authored nothing');
      assert.equal(authorizations(h).length, 1);
      assert.deepEqual(h.handlerErrors, []);
    }
  });

  await t.test('BE.05a automatic offer with a required format and no ready alternative routes to Chat recovery, undelivered', async () => {
    const plan = planOf(STEPS.map((s, i) => (i === 1 ? { ...s, formatRequired: true } : s)));
    const h = await workflow(t, { plans: [plan], script: [explanation()] });
    const view = await started(h);
    const card = await acceptCard(h, view, 'first');
    h.env.ROADMAP_FORMATS_OFF = 'table';
    assert.equal((await deliver(h, card.body.slots[0].resultId)).status, 200);
    await h.run();
    const next = await status(h);
    assert.equal(next.proposal, null);
    assert.deepEqual([next.offerRecovery.stepId === next.steps[1].id, next.offerRecovery.question.options.map(o => o.id), next.steps[1].state], [true, ['alternative', 'edit'], 'planned']);
    assert.equal(pending(h).length, 0);
    assert.equal(h.authorCalls.length, 1, 'no author dispatch for the unready offer');
  });

  await t.test('BE.05a acceptance of an offer that stopped being eligible: refused with zero author call, hold or debit; the eligible alternative is offered for the same step', async () => {
    const h = await workflow(t, { plans: [TABLE_FIRST(false)], script: [explanation()] });
    const view = await started(h); // table is ready now: the offer is the table card
    assert.equal(view.proposal.format, 'table');
    h.env.ROADMAP_FORMATS_OFF = 'table'; // after the offer, before Accept
    const before = JSON.stringify(h.totals());
    const refused = await acceptCard(h, view, 'stale');
    assert.deepEqual([refused.status, refused.body.code], [409, 'offer_unready']);
    assert.deepEqual([h.authorCalls.length, authorizations(h).length, learnerActions(h).length, JSON.stringify(h.totals())], [0, 0, 0, before], 'nothing was priced, held or debited');
    const cur = refused.body.current;
    assert.deepEqual([cur.proposal.stepId === view.proposal.stepId, cur.proposal.format, cur.proposal.id === view.proposal.id], [true, 'explanation', false], 'a new current review for the same step');
    assert.equal(pending(h).length, 1);
    assert.equal((await acceptCard(h, cur, 'now')).status, 202, 'the alternative accepts normally');
    assert.equal(h.authorCalls.length, 1);
  });

  await t.test('BE.05a the successor offer waits for the saved acknowledgment of the approved card', async () => {
    const h = await workflow(t, { script: [explanation()] });
    const view = await started(h);
    const card = await acceptCard(h, view, 'first');
    await h.run(); await h.run();
    assert.equal((await status(h)).proposal, null, 'no successor while the approved card is not saved and acknowledged');
    assert.equal((await deliver(h, card.body.slots[0].resultId)).status, 200);
    await h.run();
    assert.equal((await status(h)).proposal.stepId === view.steps[1].id, true, 'the next offer appears only after the acknowledgment');
  });
});
