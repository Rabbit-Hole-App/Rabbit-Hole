// DRAFT CONTRACT, unmounted and unreferenced (Tutor ladder R4 contracts lane; docs/features/explain-on-canvas/contracts/states.md).
// Named roadmap-contract.js as the implementation checklist asks (BASE.02, R4.01); it replaces the lane's earlier states.js. Its siblings
// roadmap-policy.js (ROADMAP_LIMITS) and roadmap-tools.js (capability catalogue and dispatch allowlist) import it; it imports nothing.
// The one shared enum/schema module the roadmap spec asks for (tutor-roadmap v1.3 section 4.3): server validation, client
// rendering and tests import this file and nothing else for state names and transition rules. Pure: no imports, no env, no clock.
// Nothing on main imports it yet; R4's State engineer moves or keeps it where the Lead's file manifest says.

const freeze = value => Object.freeze(value);
const set = list => freeze([...list]);

// --- 4.3 enums, verbatim from the roadmap table ------------------------------------------------------------------------
export const ROADMAP_STATES = set(['draft', 'questioning', 'proposed', 'active', 'paused', 'completed', 'ended', 'failed']);
export const STEP_STATES = set(['planned', 'proposed', 'generating', 'delivered', 'incomplete', 'cancelled', 'skipped', 'already_understood']);
export const PROPOSAL_STATES = set(['checking', 'held', 'pending', 'accepted', 'cancelled', 'superseded', 'blocked']);
export const RESULT_GENERATION = set(['pending', 'generating', 'generated', 'failed', 'expired']);
export const RESULT_VALIDATION = set(['pending', 'checking', 'passed', 'held', 'blocked']);
export const RESULT_DECISION = set(['none', 'accepted', 'cancelled', 'superseded']);
export const RESULT_DELIVERY = set(['not_delivered', 'delivered', 'removed']);
// "Explicitly pending, settled, refunded, failed or zero-priced".
export const BILLING_OUTCOME = set(['pending', 'settled', 'refunded', 'failed', 'zero_priced']);
// Extension (not in 4.3, see README Gaps): an unknown provider outcome must be reconciled before any retry (5.1, 5.2). It is its own
// dimension, never a sixth billing outcome, so the 4.3 list stays exactly as written.
// Depth (R2 owns the setting; checklist 2.1): the same three values reach Chat, slash paths and roadmap inputs. Default standard.
export const DEPTHS = set(['overview', 'standard', 'deep']);
export const DEFAULT_DEPTH = 'standard';
export const RECONCILIATION = set(['none', 'required', 'complete']);

// --- transition tables: state -> the states it may move to. A state absent from a table does not exist. --------------
export const ROADMAP_TRANSITIONS = freeze({
  draft: ['questioning', 'proposed', 'failed', 'ended'],
  questioning: ['draft', 'proposed', 'failed', 'ended'],
  // A revision of a proposed plan is a new plan version (own version and acceptance), not a state change.
  proposed: ['active', 'questioning', 'failed', 'ended'],
  active: ['paused', 'completed', 'failed', 'ended'],
  paused: ['active', 'completed', 'ended', 'failed'],
  // Continuing past the stopping point needs a new explicit request / accepted revision (2.4): guard 'accepted_revision'.
  completed: ['active', 'ended'],
  ended: [],
  failed: ['draft', 'ended'],
});
export const STEP_TRANSITIONS = freeze({
  planned: ['proposed', 'skipped', 'already_understood', 'cancelled'],
  proposed: ['generating', 'cancelled', 'skipped', 'already_understood'],
  // Accepted work is never cancelled by Cancel (that belongs to the proposal): it ends delivered or, failed, closed.
  // A failed card closes its step (skipped): there is no Retry, Replace or Omit (owner 2026-11-06, replacing D36).
  generating: ['delivered', 'skipped'],
  // Legacy: steps a failure left incomplete before 2026-11-06 stay as they are; they no longer block the next step.
  incomplete: [],
  delivered: [],
  // Cancel pauses automatic progression; only an explicit learner action re-proposes (2.3): guard 'explicit_learner_action'.
  cancelled: ['proposed', 'skipped'],
  skipped: [],
  already_understood: [],
});
export const PROPOSAL_TRANSITIONS = freeze({
  checking: ['held', 'pending', 'blocked', 'superseded', 'cancelled'],
  held: ['checking', 'pending', 'blocked', 'superseded', 'cancelled'],
  // A changed input marks the proposal stale and sends it back to checking; only a checked pending version can be accepted.
  pending: ['accepted', 'cancelled', 'superseded', 'checking'],
  accepted: [],
  cancelled: [],
  superseded: [],
  blocked: ['superseded'],
});
export const GENERATION_TRANSITIONS = freeze({
  pending: ['generating', 'expired'],
  generating: ['generated', 'failed'],
  generated: ['expired'],
  // A later retry has its own operation identity and bounded authorization: guard 'new_operation'.
  failed: ['pending', 'expired'],
  expired: [],
});
export const VALIDATION_TRANSITIONS = freeze({
  pending: ['checking'],
  checking: ['passed', 'held', 'blocked', 'pending'],
  held: ['checking', 'blocked'],
  // A changed input sets stale = true and invalidates cached checks (see invalidateValidation).
  passed: ['pending'],
  blocked: [],
});
export const DECISION_TRANSITIONS = freeze({ none: ['accepted', 'cancelled', 'superseded'], accepted: [], cancelled: [], superseded: [] });
// A deleted card changes delivery metadata only; the delivery record stays (D7).
export const DELIVERY_TRANSITIONS = freeze({ not_delivered: ['delivered'], delivered: ['removed'], removed: ['delivered'] });
export const BILLING_TRANSITIONS = freeze({
  pending: ['settled', 'refunded', 'failed', 'zero_priced'],
  settled: ['refunded'],
  zero_priced: [],
  // 5.2: a refunded or failed result cannot be silently charged or published again; a new authorized recovery action must
  // establish its billing outcome. Those two edges are listed in RECOVERY_ONLY.
  failed: ['pending', 'refunded'],
  refunded: ['pending'],
});
export const RECOVERY_ONLY = freeze({ billing: ['failed>pending', 'refunded>pending'] });

// Call checkpoints (R4.06): planned -> admitted -> dispatched -> response_recorded -> settled, with explicit unknown/reconciling.
export const CALL_CHECKPOINTS = set(['planned', 'admitted', 'dispatched', 'response_recorded', 'settled', 'unknown', 'reconciling', 'failed', 'released']);
export const CALL_TRANSITIONS = freeze({
  planned: ['admitted', 'released'],
  admitted: ['dispatched', 'released', 'failed'],
  dispatched: ['response_recorded', 'unknown', 'failed'],
  response_recorded: ['settled', 'failed'],
  // An admitted or dispatched call whose outcome is not known is never retried blindly: reconcile first (a timeout is not zero cost).
  unknown: ['reconciling'],
  reconciling: ['settled', 'failed', 'released'],
  settled: [],
  failed: [],
  released: [],
});

export const TABLES = freeze({
  call: CALL_TRANSITIONS,
  roadmap: ROADMAP_TRANSITIONS, step: STEP_TRANSITIONS, proposal: PROPOSAL_TRANSITIONS, generation: GENERATION_TRANSITIONS,
  validation: VALIDATION_TRANSITIONS, decision: DECISION_TRANSITIONS, delivery: DELIVERY_TRANSITIONS, billing: BILLING_TRANSITIONS,
});

export const isTerminal = (table, state) => TABLES[table]?.[state]?.length === 0;
// One unfinished roadmap per learner and board, paused and questioning included (4.3). completed, ended and failed are finished.
export const UNFINISHED_ROADMAP = set(['draft', 'questioning', 'proposed', 'active', 'paused']);
export const isUnfinishedRoadmap = state => UNFINISHED_ROADMAP.includes(state);

export class StateError extends Error {
  constructor(code, message, status = 409) { super(message); this.name = 'StateError'; this.code = code; this.status = status; }
}

// -> true when `from` may move to `to` in `table`. `recovery`: a new authorized recovery action is making the move.
export function canTransition(table, from, to, { recovery = false } = {}) {
  const allowed = TABLES[table]?.[from];
  if (!allowed || !allowed.includes(to)) return false;
  if ((RECOVERY_ONLY[table] || []).includes(`${from}>${to}`) && !recovery) return false;
  return true;
}
export function transition(table, from, to, options) {
  if (!canTransition(table, from, to, options)) throw new StateError('invalid_transition', `${table}: ${from} cannot move to ${to}`);
  return to;
}

// --- derived rules the roadmap states in prose ----------------------------------------------------------------------
// 4.3 "Only a checked pending version can be accepted"; the step must be the roadmap's one offered step and the roadmap active.
export function canAcceptProposal({ roadmap, proposal, validation = 'passed', stale = false }) {
  if (roadmap !== 'active') return { ok: false, code: 'roadmap_not_active' };
  if (proposal !== 'pending') return { ok: false, code: 'proposal_not_pending' };
  if (stale || validation !== 'passed') return { ok: false, code: 'proposal_not_checked' };
  return { ok: true };
}
// 4.4 first publication: generation succeeded, checks passed (not stale), the result version belongs to an accepted decision, the
// billing outcome permits delivery, and the actor has access. Nothing is deliverable twice.
export function canDeliver({ generation, validation, stale = false, decision, billing, delivery = 'not_delivered', access = false, reconciliation = 'none' }) {
  if (!access) return { ok: false, code: 'forbidden' };
  if (decision !== 'accepted') return { ok: false, code: 'not_accepted' };
  if (generation !== 'generated') return { ok: false, code: 'not_generated' };
  if (stale || validation !== 'passed') return { ok: false, code: 'not_checked' };
  if (reconciliation === 'required') return { ok: false, code: 'reconciliation_required' };
  if (!['settled', 'zero_priced'].includes(billing)) return { ok: false, code: 'billing_blocks_delivery' };
  if (delivery !== 'not_delivered') return { ok: false, code: 'already_delivered' };
  return { ok: true };
}
// 4.4 "Polling returns only proposal metadata before acceptance": the result body, answer keys and asset locations are readable
// only once the same predicate that governs delivery passes. A delivered result stays readable to its entitled actor.
export function resultReadable({ decision, generation, validation, stale = false, billing, delivery = 'not_delivered', access = false }) {
  if (!access || decision !== 'accepted' || generation !== 'generated') return false;
  if (delivery === 'delivered' || delivery === 'removed') return true; // already published; the record is the history
  return !stale && validation === 'passed' && ['settled', 'zero_priced'].includes(billing);
}
// A changed input invalidates the relevant cached checks (4.3).
export const invalidateValidation = () => ({ validation: 'pending', stale: true });

// --- replay invariants (4.3): first valid action wins; repeats return the recorded outcome; conflicting stale actions 409 --
// recorded: the action-replay row for this action key, or null. fingerprint: hash of (actor, action, target ids, versions).
// -> { kind: 'apply' } | { kind: 'replay', outcome } | { kind: 'conflict', code, status: 409 }
export function resolveAction({ recorded = null, fingerprint, expectedRevision, currentRevision }) {
  if (recorded) {
    if (recorded.fingerprint === fingerprint) return { kind: 'replay', outcome: recorded.outcome };
    return { kind: 'conflict', code: 'action_key_reused', status: 409 };
  }
  if (!Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) return { kind: 'conflict', code: 'stale_revision', status: 409 };
  return { kind: 'apply' };
}

// Which roadmap states each learner/server action may start from. Guards beyond state (versions, keys, access) are in api.md.
export const ACTIONS = freeze({
  create_roadmap: [], // needs no unfinished roadmap on the board
  answer_question: ['questioning'],
  revise_plan: ['questioning', 'proposed', 'active', 'paused', 'completed'],
  accept_plan: ['proposed'],
  propose_step: ['active', 'paused'], // manual Propose next step also works while paused by Cancel
  accept_proposal: ['active'],
  cancel_proposal: ['active'],
  deliver: ['active', 'paused'], // accepted work may finish and deliver while paused or Ask mode
  retry_step: ['active', 'paused'],
  replace_step: ['active', 'paused'],
  omit_step: ['active', 'paused'],
  end_roadmap: ['draft', 'questioning', 'proposed', 'active', 'paused', 'completed'],
});
export const actionStartsFrom = (action, roadmapState) => (action === 'create_roadmap' ? true : !!ACTIONS[action]?.includes(roadmapState));

// Error codes shared by routes, the client and tests. status mirrors api.md.
export const ERROR_CODES = freeze({
  roadmap_disabled: 404, not_found: 404, forbidden: 403, invalid_request: 400, stale_revision: 409, action_key_reused: 409, source_unavailable: 409,
  invalid_transition: 409, roadmap_unfinished_exists: 409, proposal_not_pending: 409, proposal_not_checked: 409, roadmap_not_active: 409,
  allowance_limited: 429, spend_limited: 429, source_changed: 409, source_unsupported: 422,
  source_too_large: 422, needs_clarification: 422, held_for_checking: 409, reconciliation_required: 409,
});

// --- implementation checklist 2.1 / R4.01 / R4.06 / R4.09 / R4.11 additions ------------------------------------------------
// Tool results (checklist 2.1): every tool answers with exactly one of these.
export const TOOL_STATUS = set(['ok', 'partial', 'needs_clarification', 'unsupported', 'unavailable']);
// Evidence classes (v1.3 6.2) and the deterministic safety decisions (D43).
export const EVIDENCE_CLASSES = set(['source_supported', 'externally_supported', 'computed', 'inferred', 'unresolved']);
export const SAFETY_DECISIONS = set(['allow', 'restrain', 'block', 'unknown']);
// Failure classes the money/recovery code branches on (R4.11). Only transient_provider_failure earns one automatic retry.
export const FAILURE_CLASSES = set(['clarification', 'unsupported_capability', 'denied_access', 'policy_block', 'unknown_provider_outcome',
  'transient_provider_failure', 'checking_unavailable', 'terminal_validation_failure']);
export const AUTOMATIC_RETRY_CLASSES = set(['transient_provider_failure']);
// Provider-call stages (R4.06): the stage names inside a deterministic operation identity.
export const PROVIDER_STAGES = set(['subject', 'draft', 'revise', 'proposal', 'generate', 'repair', 'grounding_check', 'grounding_escalation', 'safety', 'safety_adjudicate', 'illustration']); // illustration: EXP-13 pictures of an explanation card, drawn on the step hold
export const BLIND_RETRY_FORBIDDEN = set(['admitted', 'dispatched', 'unknown', 'reconciling']);
export const mayRetryCall = checkpoint => !BLIND_RETRY_FORBIDDEN.includes(checkpoint) && CALL_CHECKPOINTS.includes(checkpoint);

// withRoadmapProviderCall's identity fields (checklist 2.1, R4.06). The canonical key is hashed by the server into the ledger op_id;
// this function only fixes the field set, order and validation. Public clients never supply any of it.
export const OPERATION_FIELDS = set(['proposalId', 'proposalVersion', 'cardId', 'stage', 'call', 'retry', 'authorizationId']);
export function operationKey(fields) {
  const f = fields || {};
  const id = /^[A-Za-z0-9_-]{8,64}$/;
  if (![f.proposalId, f.cardId, f.authorizationId].every(v => typeof v === 'string' && id.test(v))) throw new StateError('invalid_request', 'operation ids must be server ids', 400);
  if (!PROVIDER_STAGES.includes(f.stage)) throw new StateError('invalid_request', 'unknown provider stage', 400);
  if (![f.proposalVersion, f.call, f.retry].every(v => Number.isInteger(v) && v >= 0 && v < 1000)) throw new StateError('invalid_request', 'versions and counters are small integers', 400);
  return ['rm', ...OPERATION_FIELDS.map(k => f[k])].join('.');
}

// RoadmapAccess (checklist 2.1/R4.01): from the authenticated session and policy, never from request JSON. Before R14 the actor owns the
// board and pays. R14 widens role/payer; the shape stays.
export const ACCESS_FIELDS = set(['org', 'actorUserId', 'actorEmail', 'boardId', 'boardOwnerEmail', 'role', 'payerUserId']);
export function validateAccess(access, { beforeR14 = true } = {}) {
  if (!access || typeof access !== 'object') return { ok: false, code: 'forbidden' };
  for (const k of ACCESS_FIELDS) if (typeof access[k] !== 'string' || !access[k]) return { ok: false, code: 'forbidden' };
  if (beforeR14 && (access.role !== 'owner' || access.actorEmail !== access.boardOwnerEmail || access.payerUserId !== access.actorUserId)) return { ok: false, code: 'forbidden' };
  return { ok: true };
}
// entitledRoadmapResult(access, result) (checklist 2.1): scope match (a result id is never access) plus the 4.4 predicate.
export function entitledRoadmapResult(access, result, options) {
  const scoped = validateAccess(access, options).ok && !!result && result.org === access.org && result.ownerUserId === access.actorUserId && result.boardId === access.boardId;
  return resultReadable({ ...result, access: scoped });
}
// Common conflict reply (R4.01): a 409 carries the current revision and proposal version.
export const conflictReply = ({ code = 'stale_revision', currentRevision, currentProposalVersion = null }) => ({ code, currentRevision, currentProposalVersion });

// R3's source reference (web/src/source-ref.js, lane tutor-r3) against the checklist's locator {source_key, source_rev, kind, anchor}.
// R3's camelCase shape is the implemented one and wins; the checklist locator is a derived view. current/changed/missing/unavailable are
// R3's statuses; resolved/changed/missing/inaccessible are the checklist's words; 'unsupported' has no R3 status (rejected before minting).
export const SOURCE_STATUS_MAP = freeze({ current: 'resolved', changed: 'changed', missing: 'missing', unavailable: 'inaccessible' });
export function sourceLocator(ref) {
  if (!ref || ref.v !== 1 || !ref.source || !ref.source.key || !ref.source.rev) return null;
  return { source_key: ref.source.key, source_rev: ref.source.rev, kind: ref.kind, anchor: ref.anchor };
}
