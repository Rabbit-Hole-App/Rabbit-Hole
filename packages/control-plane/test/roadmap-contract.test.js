// Contract tests for the draft roadmap state module (src/roadmap/roadmap-contract.js; docs/features/explain-on-canvas/contracts/states.md).
// Pure and offline. The enum lists below are copied from tutor-roadmap v1.3/v1.4 section 4.3 on purpose: a rename in the module must
// fail here, not pass by being compared with itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/roadmap/roadmap-contract.js';

const SPEC = {
  roadmap: ['draft', 'questioning', 'proposed', 'active', 'paused', 'completed', 'ended', 'failed'],
  step: ['planned', 'proposed', 'generating', 'delivered', 'incomplete', 'cancelled', 'skipped', 'already_understood'],
  proposal: ['checking', 'held', 'pending', 'accepted', 'cancelled', 'superseded', 'blocked'],
  generation: ['pending', 'generating', 'generated', 'failed', 'expired'],
  validation: ['pending', 'checking', 'passed', 'held', 'blocked'],
  decision: ['none', 'accepted', 'cancelled', 'superseded'],
  delivery: ['not_delivered', 'delivered', 'removed'],
  billing: ['pending', 'settled', 'refunded', 'failed', 'zero_priced'],
};
const ENUMS = { roadmap: S.ROADMAP_STATES, step: S.STEP_STATES, proposal: S.PROPOSAL_STATES, generation: S.RESULT_GENERATION,
  validation: S.RESULT_VALIDATION, decision: S.RESULT_DECISION, delivery: S.RESULT_DELIVERY, billing: S.BILLING_OUTCOME };

test('the enums are exactly the 4.3 lists', () => {
  for (const [name, list] of Object.entries(SPEC)) assert.deepEqual([...ENUMS[name]], list, name);
});

test('every table has a row per state, every target is a state, and no state moves to itself', () => {
  for (const [name, list] of Object.entries(SPEC)) {
    const table = S.TABLES[name];
    assert.deepEqual(Object.keys(table).sort(), [...list].sort(), `${name}: one row per state`);
    for (const [from, targets] of Object.entries(table)) for (const to of targets) {
      assert.ok(list.includes(to), `${name}: ${from} -> ${to} names an unknown state`);
      assert.notEqual(from, to, `${name}: ${from} loops`);
    }
  }
});

test('terminal states have no way out; the delivered card and the decision are final', () => {
  for (const [table, state] of [['roadmap', 'ended'], ['step', 'delivered'], ['step', 'skipped'], ['step', 'already_understood'], ['proposal', 'accepted'],
    ['proposal', 'cancelled'], ['proposal', 'superseded'], ['generation', 'expired'], ['validation', 'blocked'], ['decision', 'accepted']]) {
    assert.ok(S.isTerminal(table, state), `${table}:${state}`);
  }
  assert.ok(!S.isTerminal('roadmap', 'paused'));
});

test('transition returns the target or throws an invalid_transition 409', () => {
  assert.equal(S.transition('proposal', 'pending', 'accepted'), 'accepted');
  assert.throws(() => S.transition('proposal', 'accepted', 'pending'), e => e instanceof S.StateError && e.code === 'invalid_transition' && e.status === 409);
  assert.throws(() => S.transition('nope', 'a', 'b'), /cannot move/);
});

test('only a checked pending proposal in an active roadmap can be accepted', () => {
  assert.deepEqual(S.canAcceptProposal({ roadmap: 'active', proposal: 'pending' }), { ok: true });
  for (const proposal of ['checking', 'held', 'accepted', 'cancelled', 'superseded', 'blocked']) assert.equal(S.canAcceptProposal({ roadmap: 'active', proposal }).code, 'proposal_not_pending', proposal);
  assert.equal(S.canAcceptProposal({ roadmap: 'active', proposal: 'pending', stale: true }).code, 'proposal_not_checked');
  assert.equal(S.canAcceptProposal({ roadmap: 'active', proposal: 'pending', validation: 'held' }).code, 'proposal_not_checked');
  for (const roadmap of S.ROADMAP_STATES.filter(s => s !== 'active')) assert.equal(S.canAcceptProposal({ roadmap, proposal: 'pending' }).code, 'roadmap_not_active', roadmap);
});

const READY = { generation: 'generated', validation: 'passed', decision: 'accepted', billing: 'settled', access: true };
test('first publication needs every 4.4 condition; each missing one names its reason', () => {
  assert.deepEqual(S.canDeliver(READY), { ok: true });
  assert.deepEqual(S.canDeliver({ ...READY, billing: 'zero_priced' }), { ok: true }); // an explicit zero-price link
  const cases = [[{ access: false }, 'forbidden'], [{ decision: 'none' }, 'not_accepted'], [{ decision: 'superseded' }, 'not_accepted'],
    [{ generation: 'generating' }, 'not_generated'], [{ generation: 'failed' }, 'not_generated'], [{ validation: 'held' }, 'not_checked'],
    [{ validation: 'checking' }, 'not_checked'], [{ stale: true }, 'not_checked'], [{ reconciliation: 'required' }, 'reconciliation_required'],
    [{ billing: 'pending' }, 'billing_blocks_delivery'], [{ billing: 'refunded' }, 'billing_blocks_delivery'], [{ billing: 'failed' }, 'billing_blocks_delivery'],
    [{ delivery: 'delivered' }, 'already_delivered'], [{ delivery: 'removed' }, 'already_delivered']];
  for (const [change, code] of cases) assert.equal(S.canDeliver({ ...READY, ...change }).code, code, JSON.stringify(change));
});

test('a prepared result that passed its checks stays private until it is accepted and its billing permits (4.4)', () => {
  const prepared = { generation: 'generated', validation: 'passed', decision: 'none', billing: 'pending', access: true };
  assert.equal(S.resultReadable(prepared), false);
  assert.equal(S.resultReadable({ ...prepared, decision: 'accepted' }), false, 'accepted but billing not settled');
  assert.equal(S.resultReadable({ ...prepared, decision: 'accepted', billing: 'settled' }), true);
  assert.equal(S.resultReadable({ ...prepared, decision: 'accepted', billing: 'settled', access: false }), false, 'a result id is not access');
  assert.equal(S.resultReadable({ ...prepared, decision: 'accepted', billing: 'settled', stale: true }), false);
  assert.equal(S.resultReadable({ ...prepared, decision: 'accepted', billing: 'refunded', delivery: 'delivered' }), true, 'a delivered card stays readable to its entitled actor');
  assert.equal(S.resultReadable({ ...prepared, decision: 'cancelled', billing: 'settled' }), false);
});

test('a refunded or failed result needs a new authorized recovery action to be charged again', () => {
  assert.equal(S.canTransition('billing', 'refunded', 'pending'), false);
  assert.equal(S.canTransition('billing', 'refunded', 'pending', { recovery: true }), true);
  assert.equal(S.canTransition('billing', 'failed', 'pending'), false);
  assert.equal(S.canTransition('billing', 'settled', 'refunded'), true);
  assert.equal(S.canTransition('billing', 'zero_priced', 'settled'), false);
  assert.equal(S.canTransition('billing', 'settled', 'pending', { recovery: true }), false, 'recovery opens only the listed edges');
});

test('an invalidated check goes back to pending and is stale', () => {
  assert.deepEqual(S.invalidateValidation(), { validation: 'pending', stale: true });
  assert.ok(S.canTransition('validation', 'passed', 'pending'));
  assert.ok(S.canTransition('proposal', 'pending', 'checking'));
});

test('cancel pauses progression: a cancelled step returns only by an explicit proposal; accepted work cannot be cancelled', () => {
  assert.ok(S.canTransition('step', 'cancelled', 'proposed'));
  assert.ok(!S.canTransition('step', 'generating', 'cancelled'));
  assert.deepEqual(S.STEP_TRANSITIONS.generating, ['delivered', 'skipped'], 'a failed card closes its step: no Retry, Replace or Omit (owner 2026-11-06)');
  assert.deepEqual(S.STEP_TRANSITIONS.incomplete, [], 'legacy incomplete steps stay as they are');
});

test('one unfinished roadmap per learner and board includes paused and questioning', () => {
  assert.deepEqual([...S.UNFINISHED_ROADMAP], ['draft', 'questioning', 'proposed', 'active', 'paused']);
  for (const state of ['completed', 'ended', 'failed']) assert.ok(!S.isUnfinishedRoadmap(state), state);
  assert.ok(S.isUnfinishedRoadmap('paused') && S.isUnfinishedRoadmap('questioning'));
});

test('replay: the first valid action wins, a repeat returns the recorded outcome, a stale or reused action is a 409', () => {
  const outcome = { status: 200, body: { proposal: { id: 'p1', state: 'accepted' } } };
  assert.deepEqual(S.resolveAction({ fingerprint: 'f1', expectedRevision: 4, currentRevision: 4 }), { kind: 'apply' });
  assert.deepEqual(S.resolveAction({ recorded: { fingerprint: 'f1', outcome }, fingerprint: 'f1', expectedRevision: 4, currentRevision: 5 }), { kind: 'replay', outcome });
  assert.deepEqual(S.resolveAction({ recorded: { fingerprint: 'f1', outcome }, fingerprint: 'f2', expectedRevision: 5, currentRevision: 5 }), { kind: 'conflict', code: 'action_key_reused', status: 409 });
  assert.deepEqual(S.resolveAction({ fingerprint: 'f9', expectedRevision: 3, currentRevision: 4 }), { kind: 'conflict', code: 'stale_revision', status: 409 });
  assert.equal(S.resolveAction({ fingerprint: 'f9', currentRevision: 4 }).code, 'stale_revision', 'a missing revision guard is refused, never defaulted');
});

test('actions start only from the roadmap states the spec allows; Ask-mode pause still lets accepted work deliver', () => {
  assert.ok(S.actionStartsFrom('accept_plan', 'proposed') && !S.actionStartsFrom('accept_plan', 'active'));
  assert.ok(S.actionStartsFrom('propose_step', 'paused'), 'manual next step after Cancel');
  assert.ok(!S.actionStartsFrom('accept_proposal', 'paused'), 'a paused roadmap does not accept a new proposal');
  assert.ok(S.actionStartsFrom('deliver', 'paused'));
  assert.ok(S.actionStartsFrom('end_roadmap', 'completed') && !S.actionStartsFrom('end_roadmap', 'ended'));
  assert.ok(S.actionStartsFrom('create_roadmap', 'ended'));
  assert.ok(!S.actionStartsFrom('made_up', 'active'));
});

test('every action target state is a roadmap state, and every error code carries an HTTP status', () => {
  for (const states of Object.values(S.ACTIONS)) for (const s of states) assert.ok(S.ROADMAP_STATES.includes(s), s);
  for (const [code, status] of Object.entries(S.ERROR_CODES)) assert.ok(Number.isInteger(status) && status >= 400 && status < 600, code);
});

test('the module is dependency free: no imports and no global access', async () => {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(new URL('../src/roadmap/roadmap-contract.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/^\s*import\s/m.test(text), 'no import statements');
  assert.ok(!/\b(process|env|Date\.now|crypto|fetch|globalThis)\b/.test(text), 'no clock, env or network');
});

// ---- implementation checklist additions (BASE.02, R4.01, R4.06, R4.11) ----
const ACCESS = { org: 'o1', actorUserId: 'u1', actorEmail: 'a@x.test', boardId: 'lb_1', boardOwnerEmail: 'a@x.test', role: 'owner', payerUserId: 'u1' };

test('RoadmapAccess needs every field; before R14 only an owner paying for their own board', () => {
  assert.deepEqual(S.validateAccess(ACCESS), { ok: true });
  for (const k of S.ACCESS_FIELDS) assert.equal(S.validateAccess({ ...ACCESS, [k]: '' }).code, 'forbidden', k);
  assert.equal(S.validateAccess({ ...ACCESS, role: 'editor' }).code, 'forbidden');
  assert.equal(S.validateAccess({ ...ACCESS, actorEmail: 'b@x.test' }).code, 'forbidden', 'a visible board is not an owned board');
  assert.equal(S.validateAccess({ ...ACCESS, payerUserId: 'u2' }).code, 'forbidden', 'the payer is never another learner before R14');
  assert.equal(S.validateAccess(null).code, 'forbidden');
  assert.equal(S.validateAccess({ ...ACCESS, role: 'editor', actorEmail: 'b@x.test' }, { beforeR14: false }).ok, true, 'R14 widens roles without changing the shape');
});

const RESULT = { org: 'o1', ownerUserId: 'u1', boardId: 'lb_1', generation: 'generated', validation: 'passed', decision: 'accepted', billing: 'settled' };
test('entitledRoadmapResult: a result id is never access; scope and the 4.4 predicate both hold', () => {
  assert.equal(S.entitledRoadmapResult(ACCESS, RESULT), true);
  for (const change of [{ org: 'o2' }, { ownerUserId: 'u2' }, { boardId: 'lb_2' }, { decision: 'none' }, { billing: 'pending' }, { validation: 'held' }, { stale: true }]) {
    assert.equal(S.entitledRoadmapResult(ACCESS, { ...RESULT, ...change }), false, JSON.stringify(change));
  }
  assert.equal(S.entitledRoadmapResult({ ...ACCESS, actorUserId: 'u2', payerUserId: 'u2' }, RESULT), false, 'another learner on the same board');
  assert.equal(S.entitledRoadmapResult(null, RESULT), false);
});

test('provider operation identity is deterministic, server-shaped and refuses forged fields', () => {
  const f = { proposalId: 'pr_aaaaaaaa', proposalVersion: 2, cardId: 'cd_bbbbbbbb', stage: 'generate', call: 1, retry: 0, authorizationId: 'au_cccccccc' };
  assert.equal(S.operationKey(f), 'rm.pr_aaaaaaaa.2.cd_bbbbbbbb.generate.1.0.au_cccccccc');
  assert.equal(S.operationKey(f), S.operationKey({ ...f }));
  assert.notEqual(S.operationKey(f), S.operationKey({ ...f, call: 2 }), 'the repair call has its own identity');
  assert.notEqual(S.operationKey(f), S.operationKey({ ...f, retry: 1 }));
  for (const bad of [{ stage: 'free' }, { call: -1 }, { retry: 1.5 }, { proposalId: 'x' }, { cardId: 'a b c d e f g h' }, { authorizationId: undefined }, { proposalVersion: '2' }]) {
    assert.throws(() => S.operationKey({ ...f, ...bad }), e => e.code === 'invalid_request', JSON.stringify(bad));
  }
  assert.deepEqual([...S.OPERATION_FIELDS], ['proposalId', 'proposalVersion', 'cardId', 'stage', 'call', 'retry', 'authorizationId']);
});

test('call checkpoints: unknown outcomes reconcile before any retry; settled work is never re-dispatched', () => {
  assert.ok(S.canTransition('call', 'planned', 'admitted') && S.canTransition('call', 'admitted', 'dispatched') && S.canTransition('call', 'dispatched', 'response_recorded') && S.canTransition('call', 'response_recorded', 'settled'));
  assert.ok(!S.canTransition('call', 'dispatched', 'settled'), 'a response must be recorded first');
  assert.ok(!S.canTransition('call', 'unknown', 'dispatched') && S.canTransition('call', 'unknown', 'reconciling'));
  for (const c of ['admitted', 'dispatched', 'unknown', 'reconciling']) assert.equal(S.mayRetryCall(c), false, c);
  assert.equal(S.mayRetryCall('failed'), true);
  assert.ok(S.isTerminal('call', 'settled'));
});

test('only a transient provider failure earns the one automatic retry', () => {
  assert.deepEqual([...S.AUTOMATIC_RETRY_CLASSES], ['transient_provider_failure']);
  for (const c of S.FAILURE_CLASSES.filter(c => c !== 'transient_provider_failure')) assert.ok(!S.AUTOMATIC_RETRY_CLASSES.includes(c), c);
});

test('R3 source references: statuses map to the checklist words; the locator is a view of the implemented camelCase shape', () => {
  assert.deepEqual(S.SOURCE_STATUS_MAP, { current: 'resolved', changed: 'changed', missing: 'missing', unavailable: 'inaccessible' });
  const ref = { v: 1, id: 'sref_0123456789abcdef01234567', kind: 'markdown', source: { key: 'file:fs_0123456789abcdef01234567', rev: 'a'.repeat(64), name: 'n.md', home: null }, anchor: { quote: { exact: 'x', prefix: '', suffix: '' } } };
  assert.deepEqual(S.sourceLocator(ref), { source_key: ref.source.key, source_rev: ref.source.rev, kind: 'markdown', anchor: ref.anchor });
  assert.equal(S.sourceLocator({ ...ref, v: 2 }), null);
  assert.equal(S.sourceLocator({ v: 1, kind: 'markdown', source: { name: 'shared copy' } }), null, 'a shared reader label has no locator');
});

test('conflict replies carry the current revision and proposal version; Depth is the R2 triple', () => {
  assert.deepEqual(S.conflictReply({ currentRevision: 8, currentProposalVersion: 1 }), { code: 'stale_revision', currentRevision: 8, currentProposalVersion: 1 });
  assert.deepEqual([...S.DEPTHS], ['brief', 'balanced', 'detailed']);
  assert.equal(S.DEFAULT_DEPTH, 'balanced');
  assert.deepEqual([...S.TOOL_STATUS], ['ok', 'partial', 'needs_clarification', 'unsupported', 'unavailable']);
  assert.deepEqual([...S.SAFETY_DECISIONS], ['allow', 'restrain', 'block', 'unknown']);
  assert.deepEqual([...S.EVIDENCE_CLASSES], ['source_supported', 'externally_supported', 'computed', 'inferred', 'unresolved']);
});
