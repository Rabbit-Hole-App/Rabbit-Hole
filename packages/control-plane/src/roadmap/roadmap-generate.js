// R4.08: the trusted, server-only roadmap text/table adapter over generateArtifact (v1.4 4.1; D2 as a scoped routing exception).
// Not a route, not callable from a request: it runs inside the roadmap job with an access object the server built. The primitive
// set is a server constant (ROADMAP_FORMATS) passed as a trusted option; it is never read from a body, a client-writable job or the
// model. Typed and Quick Edit /explain are untouched (startExplain first). This module never writes a board, a job or a URL.
import { generateArtifact } from '../learn-artifact.js';
import { loggedModel } from '../learn-models.js';
import { planModel } from '../ask.js';
import { roadmapCardSuffix } from '../agents/roadmap-card.js';
import { ROADMAP_LIMITS } from './roadmap-policy.js';
import { ROADMAP_FORMATS } from './roadmap-tools.js';
import { validateAccess } from './roadmap-contract.js';

const fail = (failure_class, code, extra = {}) => ({ outcome: 'failed', failure_class, code, ...extra });
const ARGS_CAP = 1000; // learn-artifact.js route cap on args

// ref = { authorizationId, resultId, resultVersion } (checklist R4.08). Everything else comes from the accepted, immutable records:
//   deps.loadAccepted(env, access, ref) -> null | { cardId, stepId, proposalId, proposalVersion, format, stepTitle, stepGoal,
//       passageText, documentText (the whole document when it fits the whole-source limit, else null), claimsToCover, outcome,
//       passageStart, passageEnd, sourceRef (R3 publicRef or null), language, depth, retry }
//   deps.withProviderCall(env, { proposalId, proposalVersion, cardId, stage, call, retry, authorizationId }) -> env carrying the
//       deterministic operation identity (State/Money's withRoadmapProviderCall). Required: without it nothing is spent.
//   deps.callModel / deps.generate: the provider transport and generateArtifact; defaults are the production ones.
export async function generateRoadmapCard(env, access, ref, deps = {}) {
  if (!validateAccess(access).ok) return { outcome: 'forbidden' };
  const { loadAccepted, withProviderCall, limits = ROADMAP_LIMITS, generate = generateArtifact, callModel = loggedModel('artifact', planModel) } = deps;
  if (typeof loadAccepted !== 'function' || typeof withProviderCall !== 'function') return { outcome: 'unavailable', code: 'adapter_not_wired' };
  const rec = await loadAccepted(env, access, ref);
  if (!rec) return { outcome: 'unavailable', code: 'not_accepted' };
  // Allowlist before any model call: an unsupported format costs nothing.
  if (!ROADMAP_FORMATS.includes(rec.format)) return fail('unsupported_capability', 'format_not_enabled');
  const passage = String(rec.passageText ?? '');
  if (!passage.trim()) return fail('terminal_validation_failure', 'passage_empty');
  // The whole document is the writer's context when it fits the whole-source limit; otherwise the anchored passage alone (the existing
  // long-source path), never a silent cut. The passage offsets stay the highlight anchor only.
  const document = typeof rec.documentText === 'string' && rec.documentText.length <= limits.source.chars ? rec.documentText : null;
  if (!document && passage.length > limits.source.passageChars) return fail('terminal_validation_failure', 'passage_too_long');
  let call = 0;
  const metered = async (e, body, model, org) => {
    // generateArtifact makes the first call and at most one repair (ARTIFACT_REPAIRS); a third fails closed before any admission.
    if (call >= limits.calls.generationPerCard) throw new Error('operation_budget');
    const n = call++;
    // withProviderCall is State's withRoadmapProviderCall (async, answers { env, opId, key }); a plain env-returning double is also accepted.
    const scoped = await withProviderCall(e, { proposalId: rec.proposalId, proposalVersion: rec.proposalVersion, cardId: rec.cardId, stage: n === 0 ? 'generate' : 'repair', call: n, retry: rec.retry ?? 0, authorizationId: ref.authorizationId });
    return callModel(scoped?.opId ? scoped.env : scoped, body, model, org);
  };
  // A fresh object: no field of any request, job record or model output is copied in.
  const brief = [`Step: ${rec.stepTitle}`, `Goal: ${rec.stepGoal}`, ...(rec.claimsToCover?.length ? [`Claims to cover:\n${rec.claimsToCover.map(c => `- ${c}`).join('\n')}`] : []), ...(rec.outcome ? [`Learning outcome of the roadmap: ${rec.outcome}`] : [])].join('\n');
  const context = document
    ? `${brief}\n\nHighlighted passage (the step's anchor):\n<passage>\n${passage}\n</passage>\n\nWhole document:\n<document>\n${document}\n</document>`
    : `${brief}\n\nPassage:\n<passage>\n${passage}\n</passage>`;
  const input = { command: 'explain', args: `${rec.stepTitle}: ${rec.stepGoal}`.slice(0, ARGS_CAP), selection: null, context };
  let out;
  try { out = await generate(env, input, { callModel: metered, only: [rec.format], systemSuffix: roadmapCardSuffix(rec), repairs: 0 }); }
  catch (error) {
    if (error?.message === 'operation_budget') return fail('terminal_validation_failure', 'operation_budget', { calls: call });
    // A call that may have reached the provider (roadmap-run.js marks it) is never retried blind: its outcome is reconciled first.
    if (error?.code === 'unknown_provider_outcome') return fail('unknown_provider_outcome', 'outcome_unknown', { calls: call });
    return fail('transient_provider_failure', 'provider_error', { calls: call });
  }
  const calls = call;
  switch (out?.result) {
    case 'artifact':
      // Defense in depth: the card must be the requested format, whatever the model named.
      if (out.primitive !== rec.format) return fail('unsupported_capability', 'wrong_primitive', { calls });
      // id, stepId and sourceRef are metadata the adapter sets, never the model.
      return { outcome: 'ok', primitive: out.primitive, repaired: !!out.repaired, calls, block: { ...out.block, id: rec.cardId, stepId: rec.stepId, ...(rec.sourceRef ? { sourceRef: rec.sourceRef } : {}) } };
    case 'clarification': return { outcome: 'clarification', failure_class: 'clarification', question: out.question, calls };
    case 'validation_error': return fail('terminal_validation_failure', 'validation_error', { calls, error: out.error });
    default: return fail('unsupported_capability', String(out?.result || 'unknown'), { calls });
  }
}
