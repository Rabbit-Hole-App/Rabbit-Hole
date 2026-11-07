// R4 integration glue, planning side: the focused question and its answer, instruction preservation, a typed model limitation that retries, an invalid
// plan, a changed or oversize source, R3 passage scopes and plan-time reference minting, the flag, and what a revision may and may not change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRoadmapHandlers } from '../src/roadmap/roadmap-wire.js';
import { runDueRoadmapEvents } from '../src/roadmap/roadmap-events.js';
import { rows } from './roadmap-fixture.js';
import { AT, BOARD, FULL, GOOD, ID_B, INSTRUCTION, KEY, MD, classify, loop, models, planInput, toolUse } from './roadmap-loop-fixture.js';

const create = (h, extra = {}, source = {}) => h.json('POST', '/api/learn/roadmap', { boardId: BOARD, source: { key: `file:${ID_B}`, rev: h.rev, scope: { kind: 'whole' }, ...source }, instruction: INSTRUCTION, depth: 'standard', actionKey: KEY('create'), ...extra });
const QUESTION = { ...planInput([]), question: { kind: 'focus', text: 'This note covers several topics. Which should the explanation focus on?', options: [{ label: 'Gradients' }, { label: 'Learning rate' }] } };
const R3 = `CREATE TABLE IF NOT EXISTS learn_source_refs (id TEXT PRIMARY KEY, org TEXT NOT NULL, owner_email TEXT NOT NULL, kind TEXT NOT NULL, source_key TEXT NOT NULL, source_home TEXT, source_name TEXT NOT NULL, source_rev TEXT NOT NULL,
  anchor_json TEXT NOT NULL, anchor_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'current', checked_at INTEGER, created_at INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS learn_source_refs_passage ON learn_source_refs (org, owner_email, source_key, source_rev, anchor_hash);`; // mirrors learn-migrations/0038 on the R3 branch

test('generic context asks one focused question; the answer is appended (never replacing the original) and planning resumes to a plan', async t => {
  const h = await loop(t, { plans: [QUESTION, FULL] });
  const made = await create(h);
  let view = made.body;
  assert.equal(view.roadmap.state, 'questioning');
  assert.deepEqual(view.plan.steps ?? view.steps, []);
  assert.deepEqual(view.question, { id: 'q_1', kind: 'focus', text: 'This note covers several topics. Which should the explanation focus on?', options: [{ id: 'o1', label: 'Gradients' }, { id: 'o2', label: 'Learning rate' }] });
  const wrong = await h.json('POST', `/api/learn/roadmap/${made.body.roadmapId}/answer`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('answer0'), questionId: 'q_9', optionId: 'o1' });
  assert.equal(wrong.status, 400);
  const answered = await h.json('POST', `/api/learn/roadmap/${made.body.roadmapId}/answer`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('answer'), questionId: 'q_1', optionId: 'o2' });
  assert.equal(answered.status, 202);
  view = answered.body;
  assert.equal(view.roadmap.state, 'proposed');
  assert.equal(view.question, null);
  assert.equal(view.roadmap.instruction, INSTRUCTION, 'the original instruction is what the roadmap reports');
  assert.deepEqual(rows(h.w.sqlite, 'SELECT version, origin, text FROM learn_roadmap_instructions ORDER BY version').map(r => [r.version, r.origin, r.text]), [[1, 'create', INSTRUCTION], [2, 'answer', 'Learning rate']]);
  // The same answer again replays; another key is a stale revision (the question was answered).
  const replay = await h.json('POST', `/api/learn/roadmap/${made.body.roadmapId}/answer`, { boardId: BOARD, revision: made.body.roadmap.revision, actionKey: KEY('answer'), questionId: 'q_1', optionId: 'o2' });
  assert.equal(replay.status, 202);
  assert.equal(rows(h.w.sqlite, 'SELECT * FROM learn_roadmap_instructions').length, 2);
});

test('the original instruction reaches the planner unchanged on the draft and on a revision, and the plan must honor "I already know"', async t => {
  const seen = [];
  const h = await loop(t, { plans: [FULL, FULL] });
  registerRoadmapHandlers({ callModel: async (role, body) => { seen.push([role, JSON.parse(String(body.messages[0].content).split('\n\n<source')[0])]); return h.m.callModel(role, body); }, checkCallModel: h.m.callModel, classify, base: h.p.base });
  const made = await create(h);
  const revised = await h.json('POST', `/api/learn/roadmap/${made.body.roadmapId}/revise`, { boardId: BOARD, revision: made.body.roadmap.revision, actionKey: KEY('revise'), instruction: 'Make it shorter.' });
  assert.equal(revised.status, 202);
  assert.deepEqual(seen.map(s => s[0]), ['roadmap_draft', 'roadmap_revise']);
  assert.equal(seen[0][1].instruction.original, INSTRUCTION);
  assert.equal(seen[1][1].instruction.original, INSTRUCTION, 'a revision still carries version 1 verbatim');
  assert.equal(seen[1][1].instruction.latest, 'Make it shorter.');
  assert.equal(seen[1][1].change, 'Make it shorter.');
  // A plan that reteaches the skipped topic is rejected by the validator (one repair, then a typed failure), never recorded.
  const reteach = planInput([['What a derivative is', 0, MD.length]]);
  reteach.instructionAck.skips = [];
  const bad = await loop(t, { plans: [reteach] });
  const failed = await create(bad);
  assert.equal(failed.body.roadmap.state, 'questioning');
  assert.equal(failed.body.limitation.code, 'plan_failed');
  assert.deepEqual(failed.body.steps, [], 'a rejected plan records no steps');
});

test('a typed model limitation retries later and records nothing; the same event then completes', async t => {
  const h = await loop(t);
  let calls = 0;
  registerRoadmapHandlers({ callModel: async (role, body) => { if (calls++ === 0) throw new Error('model down'); return h.m.callModel(role, body); }, checkCallModel: h.m.callModel, classify, base: h.p.base });
  const made = await create(h);
  assert.equal(made.body.roadmap.state, 'draft', 'planning is waiting, not failed');
  const [event] = rows(h.w.sqlite, "SELECT processed_at, attempts, next_at FROM learn_roadmap_outbox WHERE kind = 'plan_requested'");
  assert.equal(event.processed_at, null);
  assert.equal(event.attempts, 1);
  assert.equal(rows(h.w.sqlite, 'SELECT * FROM learn_roadmap_plan_versions').length, 0);
  assert.equal(await runDueRoadmapEvents(h.env), 0, 'not due yet: the backoff holds');
  assert.equal(await runDueRoadmapEvents(h.env, { now: event.next_at + 1 }), 1);
  assert.equal((await h.status()).roadmap.state, 'proposed');
});

test('no new planning while the flag is off: the event waits and completes when the flag is restored', async t => {
  const h = await loop(t);
  h.deps.startPlanning = async () => {};
  const made = await create(h);
  assert.equal(made.body.roadmap.state, 'draft');
  const dark = { ...h.env, ROADMAP_ENABLED: undefined };
  const [event] = rows(h.w.sqlite, "SELECT next_at FROM learn_roadmap_outbox WHERE kind = 'plan_requested'");
  await runDueRoadmapEvents(dark);
  assert.equal(rows(h.w.sqlite, 'SELECT * FROM learn_roadmap_plan_versions').length, 0);
  assert.equal(h.m.calls.length, 0, 'no model call while off');
  await runDueRoadmapEvents(h.env, { now: event.next_at + 10 });
  assert.equal((await h.status()).roadmap.state, 'proposed');
});

test('a source that changed before planning ran is a limitation the learner sees, with no model call', async t => {
  const h = await loop(t);
  h.deps.startPlanning = async () => {};
  const made = await create(h);
  h.w.sqlite.prepare("UPDATE file_sources SET sha256 = 'changed' WHERE id = ?").run(ID_B);
  await runDueRoadmapEvents(h.env);
  const view = (await h.status());
  assert.equal(view.limitation.code, 'source_changed');
  assert.equal(view.limitation.message, 'The source changed since this plan was made. Update the plan to continue.');
  assert.equal(h.m.calls.length, 0);
  assert.equal(made.body.roadmap.state, 'draft');
});

test('an oversize source is explained with selectable scopes and never read as a prefix: 422, zero model calls, no roadmap', async t => {
  const h = await loop(t, { md: `# Long\n${'word '.repeat(9000)}` });
  const made = await create(h);
  assert.equal(made.status, 422);
  assert.equal(made.body.code, 'source_too_large');
  assert.equal(made.body.limitation.message, 'This source is longer than one roadmap can read completely. Choose a section or a passage and it will be covered fully.');
  assert.deepEqual(made.body.limitation.offers.map(o => o.label), ['Select a passage', 'Pick a section']);
  assert.equal(h.m.calls.length, 0);
  assert.equal(rows(h.w.sqlite, 'SELECT * FROM learn_roadmaps').length, 0);
});

test('a passage scope is R3\'s reference resolved on the server: the quote is found exactly once and the plan covers exactly that passage', async t => {
  const exact = 'One update subtracts the learning rate times the gradient from the weight.';
  const start = MD.indexOf(exact), end = start + exact.length;
  const h = await loop(t, { plans: [planInput([['One update', start, end]])] });
  h.w.sqlite.exec(R3);
  const anchor = JSON.stringify({ quote: { exact, prefix: '', suffix: '' } });
  const ref = 'sref_' + '1'.repeat(24);
  h.w.sqlite.prepare("INSERT INTO learn_source_refs (id, org, owner_email, kind, source_key, source_name, source_rev, anchor_json, anchor_hash, created_at) VALUES (?, 'team', 'u-alice@example.test', 'markdown', ?, 'n', ?, ?, 'h', 1)").run(ref, `file:${ID_B}`, h.rev, anchor);
  const made = await create(h, {}, { scope: { kind: 'passage', sourceRefId: ref } });
  assert.equal(made.status, 202);
  const view = made.body;
  assert.equal(view.roadmap.scope.kind, 'passage');
  assert.equal(view.roadmap.scope.chars, exact.length);
  assert.equal(view.roadmap.state, 'proposed');
  assert.deepEqual(rows(h.w.sqlite, 'SELECT passage_start, passage_end FROM learn_roadmap_steps').map(r => [r.passage_start, r.passage_end]), [[start, end]]);
  // A reference that is not this learner's, or not for this source, is unsupported; nothing is guessed.
  assert.equal((await create(h, { actionKey: KEY('c2') }, { scope: { kind: 'passage', sourceRefId: 'sref_' + '2'.repeat(24) } })).status, 422);
});

test('a quote that occurs twice and cannot be settled by its context is a clarification, not a guess', async t => {
  const h = await loop(t, { md: `${'Same line.\n'.repeat(2)}\n${MD}` });
  h.w.sqlite.exec(R3);
  const ref = 'sref_' + '3'.repeat(24);
  h.w.sqlite.prepare("INSERT INTO learn_source_refs (id, org, owner_email, kind, source_key, source_name, source_rev, anchor_json, anchor_hash, created_at) VALUES (?, 'team', 'u-alice@example.test', 'markdown', ?, 'n', ?, ?, 'h', 1)").run(ref, `file:${ID_B}`, h.rev, JSON.stringify({ quote: { exact: 'Same line.', prefix: '', suffix: '' } }));
  const made = await create(h, {}, { scope: { kind: 'passage', sourceRefId: ref } });
  assert.equal(made.status, 422);
  assert.equal(made.body.code, 'needs_clarification');
  assert.equal(h.m.calls.length, 0);
});

test('Accept plan mints one R3 reference per step; the delivered card carries it; a changed source refuses the acceptance', async t => {
  const h = await loop(t);
  h.w.sqlite.exec(R3);
  const made = await create(h);
  const id = made.body.roadmapId, view = made.body;
  const plan = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('plan'), planVersion: 1 });
  assert.equal(plan.status, 200);
  const refs = rows(h.w.sqlite, 'SELECT s.position, s.source_ref_id, r.anchor_json FROM learn_roadmap_steps s JOIN learn_source_refs r ON r.id = s.source_ref_id ORDER BY s.position');
  assert.equal(refs.length, 3);
  assert.equal(JSON.parse(refs[1].anchor_json).quote.exact, MD.slice(AT.update, AT.rate));
  assert.match(refs[0].source_ref_id, /^sref_[0-9a-f]{24}$/);
  const proposed = plan; // accepting the plan offers the first proposal
  assert.equal(proposed.body.steps[0].sourceRef.id, refs[0].source_ref_id, 'the view carries the reference of each step');
  assert.equal(proposed.body.proposal.sourceRelation.sourceRef.source.key, `file:${ID_B}`);
  const accept = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${proposed.body.proposal.id}/accept`, { boardId: BOARD, revision: proposed.body.roadmap.revision, actionKey: KEY('accept'), proposalVersion: 1 });
  const result = accept.body.results[0];
  assert.equal(result.generation, 'generated');
  const deliver = await h.json('POST', `/api/learn/roadmap/${id}/results/${result.id}/deliver`, { boardId: BOARD, revision: accept.body.roadmap.revision, actionKey: KEY('deliver') });
  const card = deliver.body.cards[0].block;
  assert.deepEqual([card.sourceRef.v, card.sourceRef.id, card.sourceRef.kind, card.sourceRef.source.key], [1, refs[0].source_ref_id, 'markdown', `file:${ID_B}`]);
  assert.equal(card.sourceRef.anchor.quote.exact, MD.slice(0, AT.update));
  // A second roadmap on a source that changed refuses the plan acceptance: nothing is accepted, the plan stays proposed.
  const h2 = await loop(t);
  h2.w.sqlite.exec(R3);
  h2.deps.startPlanning = deps => deps;
  const made2 = await create(h2);
  h2.w.sqlite.prepare("UPDATE file_sources SET sha256 = 'changed' WHERE id = ?").run(ID_B);
  const refused = await h2.json('POST', `/api/learn/roadmap/${made2.body.roadmapId}/accept-plan`, { boardId: BOARD, revision: made2.body.roadmap.revision, actionKey: KEY('plan'), planVersion: 1 });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'source_changed');
});

// UI.03 (owner 2026-11-06, superseding the earlier set-Depth-at-once rule): Depth and typed edits are new draft revisions; accepted work keeps its Depth.
test('UI.03: after acceptance a Depth change and a typed edit make new unaccepted drafts; the accepted Depth and ToC stay; refused inputs', async t => {
  const h = await loop(t, { plans: [FULL, FULL, FULL] });
  const made = await create(h);
  const id = made.body.roadmapId;
  const plan = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: made.body.roadmap.revision, actionKey: KEY('plan'), planVersion: 1 });
  let view = plan.body;
  assert.equal(view.planDraft, null, 'no draft once the plan is accepted');
  const depth = await h.json('POST', `/api/learn/roadmap/${id}/revise`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('depth'), settings: { depth: 'overview' } });
  assert.equal(depth.status, 202);
  assert.deepEqual([depth.body.roadmap.depth, depth.body.roadmap.ceiling], ['standard', 10], 'the accepted roadmap keeps its Depth until a draft is accepted');
  assert.deepEqual([depth.body.planDraft.version, depth.body.planDraft.settings.depth, depth.body.planDraft.acceptable], [2, 'overview', true]);
  assert.deepEqual([depth.body.plan.version, depth.body.acceptedPlan.version], [1, 1], 'the ToC still shows the accepted plan');
  assert.equal(depth.body.proposal.state, 'pending', 'the accepted plan\'s offer is untouched');
  view = depth.body;
  const edit = await h.json('POST', `/api/learn/roadmap/${id}/revise`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('edit'), instruction: 'Skip the learning rate.' });
  assert.equal(edit.status, 202);
  assert.equal(edit.body.planDraft.version, 3);
  assert.equal(rows(h.w.sqlite, 'SELECT text FROM learn_roadmap_instructions WHERE version = 3')[0].text, 'Skip the learning rate.', 'the typed words are kept verbatim');
  const stale = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: edit.body.roadmap.revision, actionKey: KEY('stale'), planVersion: 2 });
  assert.equal(stale.status, 409, 'a superseded draft cannot be accepted');
  view = edit.body;
  for (const settings of [{ practiceMode: 'explanations_practice' }, { practiceMode: 'practice' }]) {
    const refused = await h.json('POST', `/api/learn/roadmap/${id}/revise`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY(`pr${settings.practiceMode.length}`), instruction: 'x', settings });
    assert.deepEqual([refused.status, refused.body.code], [422, 'practice_unavailable']);
  }
  const h2 = await loop(t);
  const practice = await create(h2, { practiceMode: 'explanations_practice' });
  assert.deepEqual([practice.status, practice.body.code], [422, 'practice_unavailable'], 'never silently made explanations-only');
  assert.equal(rows(h2.w.sqlite, 'SELECT COUNT(*) AS n FROM learn_roadmaps')[0].n, 0);
  assert.equal((await h.json('POST', `/api/learn/roadmap/${id}/revise`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('scope'), scope: { kind: 'whole' } })).status, 400);
  assert.equal((await h.json('POST', `/api/learn/roadmap/${id}/revise`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('bad'), settings: { depth: 'enormous' } })).status, 400);
  assert.equal((await h.json('POST', `/api/learn/roadmap/${id}/revise`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('none') })).status, 400);
  // The mode fact needs no client key (api.md 17): Ask, Tutor, Ask are distinct events.
  for (const mode of ['ask', 'tutor', 'ask']) assert.equal((await h.json('POST', `/api/learn/roadmap/${id}/mode`, { boardId: BOARD, mode })).status, 200);
  assert.equal(rows(h.w.sqlite, "SELECT * FROM learn_roadmap_outbox WHERE kind = 'mode_changed'").length, 3);
});

test('Explain on canvas from an invitation carries no typed words: an empty instruction is allowed only there, and the planner receives it empty', async t => {
  const seen = [];
  const h = await loop(t, { plans: [FULL] });
  registerRoadmapHandlers({ callModel: async (role, body) => { seen.push(JSON.parse(String(body.messages[0].content).split('\n\n<source')[0]).instruction); return h.m.callModel(role, body); }, checkCallModel: h.m.callModel, classify, base: h.p.base });
  const blank = await create(h, { instruction: '   ' });
  assert.equal(blank.status, 400, 'a typed request must say something');
  const iv = (await h.json('POST', '/api/learn/roadmap/invitations', { boardId: BOARD, sourceKeys: [`file:${ID_B}`], idleKey: 'idle-1-aaaaaaaa' })).body.invitation;
  const made = await create(h, { invitationId: iv.id, instruction: '', actionKey: KEY('create2') });
  assert.equal(made.status, 202);
  assert.equal(made.body.roadmap.instruction, '');
  assert.equal(made.body.roadmap.state, 'proposed');
  assert.deepEqual(seen, [{ original: '' }]);
});

// CORE.02: whole content and a selected passage send the planner the identical whole bounded document; only the teaching scope differs.
test('CORE.02: a selected passage plans from the whole bounded document (over 8,000 characters) with the passage as explicit teaching scope', async t => {
  const LONG = `${MD}\n## Notes\n${'Trees split the data by asking one question at a time. '.repeat(160)}\n## Far away\nThe momentum term remembers earlier gradients.\n`;
  assert.ok(LONG.length > 8000 && LONG.length < 40000);
  const exact = 'One update subtracts the learning rate times the gradient from the weight.';
  const start = LONG.indexOf(exact), end = start + exact.length;
  const capture = async (scope, plan) => {
    const seen = [];
    const h = await loop(t, { plans: [plan], md: LONG });
    h.w.sqlite.exec(R3);
    h.w.sqlite.prepare("INSERT INTO learn_source_refs (id, org, owner_email, kind, source_key, source_name, source_rev, anchor_json, anchor_hash, created_at) VALUES (?, 'team', 'u-alice@example.test', 'markdown', ?, 'n', ?, ?, 'h', 1)").run('sref_' + '1'.repeat(24), `file:${ID_B}`, h.rev, JSON.stringify({ quote: { exact, prefix: '', suffix: '' } }));
    registerRoadmapHandlers({ callModel: async (role, body) => { seen.push(String(body.messages[0].content)); return h.m.callModel(role, body); }, checkCallModel: h.m.callModel, classify, base: h.p.base });
    const made = await create(h, {}, { scope });
    assert.equal(made.status, 202, JSON.stringify(made.body).slice(0, 200));
    assert.equal(made.body.roadmap.state, 'proposed', JSON.stringify(made.body.limitation));
    assert.equal(seen.length, 1);
    const [json, ...rest] = seen[0].split('\n\n<source');
    return { request: JSON.parse(json), source: rest.join('\n\n<source') };
  };
  const wholePlan = { ...planInput([['One update', start, end]]), coverage: { uncovered: [{ start: 0, end: start, reason: 'not asked for' }, { start: end, end: LONG.length, reason: 'not asked for' }] } };
  const whole = await capture({ kind: 'whole' }, wholePlan);
  const part = await capture({ kind: 'passage', sourceRefId: 'sref_' + '1'.repeat(24) }, planInput([['One update', start, end]]));
  assert.equal(part.source, whole.source, 'identical source text for both choices');
  assert.ok(part.source.includes('The momentum term remembers earlier gradients.'), 'a fact outside the selected passage reaches the planner');
  assert.ok(part.source.includes(`range="0-${LONG.length}"`), 'the source block is the whole document');
  assert.deepEqual(whole.request.scope, { start: 0, end: LONG.length });
  assert.deepEqual(part.request.scope, { start, end }, 'the selected passage is the explicit teaching scope');
  assert.equal(part.request.instruction.original, INSTRUCTION);
  assert.deepEqual([part.request.source.name, part.request.mode], ['Gradient descent notes.md', 'explanations'], 'verify-to-be-2: the planner knows the file and the roadmap mode');
});

// GEN1 (checklist 2.1.3, "Bounded source"): the whole-document reread of a selected passage may fall back to the passage ONLY for the supported
// over-limit document. A reread that finds the source changed or gone refuses the draft: no model call, no plan, a limitation the learner sees.
const EXACT = 'One update subtracts the learning rate times the gradient from the weight.';
async function passageRoadmap(t, { md, reread } = {}) {
  const h = await loop(t, { md, plans: [planInput([['One update', MD.indexOf(EXACT), MD.indexOf(EXACT) + EXACT.length]])] });
  h.w.sqlite.exec(R3);
  const ref = 'sref_' + '7'.repeat(24);
  h.w.sqlite.prepare("INSERT INTO learn_source_refs (id, org, owner_email, kind, source_key, source_name, source_rev, anchor_json, anchor_hash, created_at) VALUES (?, 'team', 'u-alice@example.test', 'markdown', ?, 'n', ?, ?, 'h', 1)")
    .run(ref, `file:${ID_B}`, h.rev, JSON.stringify({ quote: { exact: EXACT, prefix: '', suffix: '' } }));
  // The planning handler's own reads go through this reader: the first is the passage read, the second the whole-document reread.
  const { readMarkdownForActor } = await import('../src/roadmap/roadmap-source-reader.js');
  let reads = 0;
  registerRoadmapHandlers({ callModel: h.m.callModel, checkCallModel: h.m.callModel, classify, base: h.p.base,
    readSourceForActor: async (env, access, source) => (++reads === 2 && reread ? reread(source) : readMarkdownForActor(env, access, source)) });
  h.deps.startPlanning = async () => {};
  const made = await create(h, {}, { scope: { kind: 'passage', sourceRefId: ref } });
  assert.equal(made.status, 202);
  await runDueRoadmapEvents(h.env);
  return { h, made, reads: () => reads };
}

test('a passage roadmap whose whole-document reread finds the source changed refuses the draft: no model call, no plan', async t => {
  const { h, reads } = await passageRoadmap(t, { reread: ({ key }) => ({ status: 'changed', key, rev: 'sha256:' + 'e'.repeat(64) }) });
  assert.equal(reads(), 2, 'the passage read, then the whole reread');
  const view = await h.status();
  assert.equal(view.limitation?.code, 'source_changed');
  assert.equal(h.m.calls.length, 0, 'no model call');
  assert.deepEqual(rows(h.w.sqlite, 'SELECT plan_json FROM learn_roadmap_plan_versions').map(r => JSON.parse(r.plan_json).steps), [[]], 'the refusal records no steps');
});

test('a passage roadmap whose whole-document reread finds the source missing refuses the draft with the source_unavailable limitation', async t => {
  const { h } = await passageRoadmap(t, { reread: () => ({ status: 'missing' }) });
  const view = await h.status();
  assert.equal(view.limitation?.code, 'source_unavailable');
  assert.equal(h.m.calls.length, 0);
});

test('a passage roadmap over a document above the whole-source limit keeps the passage read as the source (the supported fallback)', async t => {
  const big = `${MD}\n${'x'.repeat(40001)}`;
  const { h } = await passageRoadmap(t, { md: big });
  const view = await h.status();
  assert.equal(view.limitation ?? null, null, 'no refusal');
  assert.equal(view.roadmap.state, 'proposed');
  assert.equal(h.m.calls.length, 1, 'planned over the selected passage');
});
