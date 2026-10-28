// Why a Motion job ended without a video, as a stable machine-readable code (owner brief 2026-10-25, failed production job
// 61f70171: the orchestrator reported every limit as cause 'limit', the card said "This video reached its AI spending limit." and the
// learner was charged for a failure caused by our own per-job ceiling).
//
// A leaf module: the orchestrator (learn-render/motion/orchestrator.mjs) names the code, the Worker (learn-video.js) charges, explains
// and decides recovery by it. `cause` (pipeline.mjs CAUSES) stays as the coarse legacy field; `failure_code` refines it.
//   zeroCredit      the learner is charged nothing and the whole reservation is released. The provider's real cost is still recorded
//                   internally (usage_operations.cost_usd, job.providerCost) and counts toward the video's ceiling.
//   deterministic   a new paid attempt of the same request hits the same blocker, so "Generate again" is not offered.
// A user message never shows an amount, a model name, a stage name or an internal limit, and says "AI credits" only when the learner's
// own allowance is the reason (allowance_exhausted). What a card says about money is a separate, dynamic line (charged, refunded, hold).

export const FAILURE_CODES = Object.freeze({
  // The next call's worst case, or the least the required steps after it can cost, exceeds what is left of THIS JOB's ceiling
  // (our configured per-job limit), or the ceiling cannot fit the mandatory pipeline at all (refused before any paid work).
  job_ceiling_insufficient: Object.freeze({ zeroCredit: true, deterministic: true, message: "This video needed more processing than Motion allows for a single video, so it stopped before finishing. This is a limit on our side, not your AI credits." }),
  // A call (or its size, a resend, a re-ask) outside the production policy, or a required stage the policy does not allow.
  policy_rejected: Object.freeze({ zeroCredit: true, deterministic: true, message: 'This video needs a step Motion does not allow yet, so it stopped before finishing. This is a limit on our side, not your AI credits.' }),
  // The job's model-call count (configured, or the policy's per-stage count) was spent.
  call_limit: Object.freeze({ zeroCredit: true, deterministic: false, message: 'This video used every model step Motion allows for a single video, so it stopped before finishing. This is a limit on our side, not your AI credits.' }),
  // A call whose maximum cost cannot be bounded (an unpriced model, an unsupported tool): nothing is sent that cannot be capped.
  unknown_cost_bound: Object.freeze({ zeroCredit: true, deterministic: true, message: 'Motion could not confirm a safe cost limit for this video, so nothing more was run. This is a limit on our side, not your AI credits.' }),
  // The job ran past the overall time Motion allows.
  job_timeout: Object.freeze({ zeroCredit: true, deterministic: false, message: 'This video took longer than Motion allows and was stopped. The work done so far is saved.' }),
  // The learner's own monthly allowance cannot cover the video (the Worker's admission, learn-spend-ledger.js spendMessage gives the
  // full sentence with the renewal date). Nothing is started and nothing charged.
  allowance_exhausted: Object.freeze({ zeroCredit: false, deterministic: false, message: 'You do not have enough AI credits left for this video.' }),
  // The render service failed or timed out (cause renderer).
  renderer_failed: Object.freeze({ zeroCredit: true, deterministic: false, message: null }),
  // Our own infrastructure failed (the orchestrator crashed, lost the job, or storage could not keep the video).
  infrastructure: Object.freeze({ zeroCredit: true, deterministic: false, message: 'Our video service had a problem and stopped this video. The work done so far is saved.' }),
  // Reviewer or check findings the job could not resolve inside its one repair (cause content). Charged as before.
  content_rejected: Object.freeze({ zeroCredit: false, deterministic: false, message: null }),
  // A model call failed partway (cause model). Charged as before.
  model_failed: Object.freeze({ zeroCredit: false, deterministic: false, message: null }),
  missing_context: Object.freeze({ zeroCredit: false, deterministic: false, message: null }),
  // PROPOSED, NOT APPROVED (feat/motion-billing-correction): a stop is charged only when it is the learner's confirmed Stop of THIS attempt
  // (isZeroCredit learnerStop); a stop of any other origin, or of an origin the Worker did not record, charges nothing.
  stopped: Object.freeze({ zeroCredit: false, deterministic: false, message: null }),
  // A limit reported by an older orchestrator that named no code (cause 'limit' alone): every such limit is ours, never the learner's allowance.
  limit_unspecified: Object.freeze({ zeroCredit: true, deterministic: true, message: "This video stopped at one of Motion's per-video limits. This is a limit on our side, not your AI credits." }),
});

const BY_CAUSE = Object.freeze({ renderer: 'renderer_failed', infra: 'infrastructure', content: 'content_rejected', model: 'model_failed', missing_context: 'missing_context', stopped: 'stopped', limit: 'limit_unspecified' });
export const codeOfCause = cause => BY_CAUSE[cause] ?? null;
// The code of an orchestrator view: its own failure_code when it names a known one, else what its cause implies.
export const failureCodeOf = view => (view?.failure_code in FAILURE_CODES ? view.failure_code : codeOfCause(view?.cause));
// Our own per-job limits: the codes the orchestrator names for a timeout or a refused call (its cause is 'limit').
export const LIMIT_CODES = Object.freeze(['job_ceiling_insufficient', 'policy_rejected', 'call_limit', 'unknown_cost_bound', 'job_timeout', 'limit_unspecified']);
// The system limits whose message replaces the orchestrator's failure_reason (which carries internal amounts) in what the learner reads.
export const hasUserMessage = code => !!FAILURE_CODES[code]?.message;
export const failureMessage = code => FAILURE_CODES[code]?.message ?? null;
// A failed job is charged nothing: our own limits and our own infrastructure, never the learner's work or choice.
// PROPOSED, NOT APPROVED: a cancelled job is charged (its measured cost) only for the learner's confirmed Stop of this attempt (learnerStop,
// from the Worker's own record); a system-originated stop or one whose origin is unknown is charged nothing. Provider cost is recorded either way.
export const isZeroCredit = (view, { learnerStop = false } = {}) => !view || (view.status === 'failed' && !!FAILURE_CODES[failureCodeOf(view)]?.zeroCredit) || (view.status === 'cancelled' && !learnerStop);
export const isDeterministic = code => !!FAILURE_CODES[code]?.deterministic;

// A stored or relayed message that carries the orchestrator's internal refusal text (a job recorded before codes existed: "stopped before
// spending more: the next step ... could cost up to $0.74, more than the $0.72 left of this job's $2.00 hold") is never shown as it is.
// Only that text: a reviewer's finding may legitimately contain a dollar sign (a formula).
export const INTERNAL_LIMIT = /stopped before spending more|could cost up to \$|left of this job|job ceiling|more than the \$\d/i;
export const userSafeError = (error, code = null) => (typeof error === 'string' && INTERNAL_LIMIT.test(error) ? failureMessage(code) || FAILURE_CODES.limit_unspecified.message : error);
