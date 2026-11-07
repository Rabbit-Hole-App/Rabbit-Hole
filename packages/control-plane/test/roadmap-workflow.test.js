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
import {
  AT, FILE_NAME, INSTRUCTION, KEY, MARKER, MD, PLAN, STEPS, USERS, acceptCard, acceptPlan, boardBlocks, calm, deliver, explain, explanation, httpError,
  SHORT_PLAN, planOf, readThread, saveMessage, sha, started, status, table, threadId, timeout, unsafe, workflow,
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
    // contracts.md absent at writing: assumed message field `meta.tutor` (BRIEF contract 6: structured metadata through the existing message/meta seam).
    const receipt = { client_id: `roadmap-inv-${iv.id}`, role: 'assistant', content: `You've added **${FILE_NAME}**. Start a new chat for this document or stay here?`,
      meta: { version: 1, tutor: { kind: 'source_receipt', invitationId: iv.id, sourceKey: source, choices: ['start_new_chat', 'stay_here'] } } };
    assert.equal((await saveMessage(h, T_BUSY, receipt)).status, 201);
    assert.equal((await saveMessage(h, T_BUSY, receipt)).body.duplicate, true, 'a replayed receipt is not a second message');
    const busy = (await readThread(h, T_BUSY)).body;
    assert.deepEqual(busy.messages.map(m => m.clientId), ['u-old-1', 'a-old-1', `roadmap-inv-${iv.id}`], 'history retained, one receipt');
    assert.deepEqual(busy.messages[2].meta?.tutor, receipt.meta.tutor, 'the Tutor metadata round-trips through the real read');
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
    assert.equal(stale.status, 409, 'the superseded draft is refused');
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
    // contracts.md absent: assumed view fields `acceptedPlan` (drives ToC) and `draft` (drives the Chat roadmap message), BRIEF contract 5.
    assert.equal(after.acceptedPlan?.version, before.roadmap.acceptedPlanVersion, 'the accepted plan stays authoritative');
    assert.equal(after.draft?.version, before.roadmap.planVersion + 1, 'the draft is a separate revision');
    await h.run();
    assert.equal(h.authorCalls.length, 2, 'the in-flight card completes against its frozen inputs');
    assert.ok(h.authorCalls[1].text.includes('CLAIM-TABLE'), 'with its own accepted claims');
    assert.deepEqual(await boardBlocks(h), board, 'saved cards unchanged');
    assert.ok((await h.totals()).used >= used, 'no refund or extra charge from the edit');
  });

  await t.test('BE.03 Explanations + practice is refused at the server capability boundary until qualified', async () => {
    const h = await workflow(t);
    // contracts.md absent: assumed create field `practiceMode: 'explanations_practice'` and refusal code `capability_unavailable`.
    const refused = await explain(h, { extra: { practiceMode: 'explanations_practice' } });
    assert.ok(refused.status >= 400 && refused.status < 500, `practice is refused, not silently accepted (got ${refused.status})`);
    assert.equal(refused.body.code, 'capability_unavailable');
    assert.equal(h.rows('SELECT * FROM learn_roadmaps').length, 0);
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
  assert.ok([200, 409].includes(second.status), 'a second device accepting the same plan buys nothing');
  assert.equal(h.rows('SELECT * FROM learn_step_proposals').length, 1, 'still one proposal');
  // Navigation (status reads) mutates nothing.
  const r1 = (await status(h)).roadmap.revision, r2 = (await status(h)).roadmap.revision;
  assert.equal(r1, r2);
  assert.equal(h.plannerCalls.length, 1);
  // contracts.md absent: assumed view field `acceptedPlan` = the accepted snapshot; a later draft revision does not leak into it.
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
    // contracts.md absent: assumed `proposal.excerpt` (BRIEF contract 4 "sourceRef/excerpt"): the exact highlighted text.
    assert.equal(p.excerpt, MD.slice(STEPS[0].passage.start, STEPS[0].passage.end).trim(), 'the exact source excerpt');
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
