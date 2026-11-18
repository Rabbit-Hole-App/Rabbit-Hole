// R4.08: the trusted, server-only roadmap text/table adapter over generateArtifact (v1.4 4.1; D2 as a scoped routing exception).
// Not a route, not callable from a request: it runs inside the roadmap job with an access object the server built. The primitive
// set is a server constant (ROADMAP_FORMATS) passed as a trusted option; it is never read from a body, a client-writable job or the
// model. Typed and Quick Edit /explain are untouched (startExplain first). This module never writes a board, a job or a URL.
import { generateArtifact, prepareArtifactAuthorRequest } from '../learn-artifact.js';
import { archiveExplanation } from '../learn-storage.js';
import { CHAT_GEMINI, MODEL, autoModel, loggedModel, planUsesOpenAI } from '../learn-models.js';
import { planModel } from '../ask.js';
import { requestSpendBound } from '../learn-spend.js';
import { toMicros } from '../learn-usage.js';
import { sha256 } from './roadmap-source.js';
import { ROADMAP_CARD_PROFILE, explanationProfileBinding, resolveExplanationProfile } from '../explanation-models.js';
import { roadmapCardSuffix } from '../agents/roadmap-card.js';
import { deriveVisualRequirements, requirementText } from '../explanation-visuals.js';
import { ROADMAP_LIMITS } from './roadmap-policy.js';
import { depthOf } from '../chat-depth.js';
import { ROADMAP_FORMATS } from './roadmap-tools.js';
import { figuresBoundMicros } from '../explanation-figures.js';
import { validateAccess } from './roadmap-contract.js';

const fail = (failure_class, code, extra = {}) => ({ outcome: 'failed', failure_class, code, ...extra });
const ARGS_CAP = 1000; // learn-artifact.js route cap on args

/// The provider and model the author call is routed to: the same choice planModel/anthropic make (the artifact task passes no org, so no org row).
// shortcut: org-level Bedrock/OpenAI routing is not read because the artifact path never passes an org; read aiSettings if it ever does.
export const authorRoute = (env, model) => (env.SUBSCRIPTION_ONLY === 'true' ? { provider: 'subscription', model: model || MODEL }
  : model === CHAT_GEMINI ? { provider: 'google', model } // priced and held as Google, as ask.js geminiChat settles it
    : planUsesOpenAI(env) ? { provider: 'openai', model: env.LEARN_PLAN_MODEL } : { provider: 'anthropic', model: model || autoModel(env) || MODEL });
export const requestFingerprint = (body, route) => sha256(JSON.stringify([route.provider, route.model, body]));
const boundOf = (body, route) => toMicros(requestSpendBound(body, route.model, route.provider === 'subscription' ? 'anthropic' : route.provider));

// Owner 2026-11-14: roadmap and course cards are authored on Gemini Flash (the roadmap-gemini profile) wherever the server holds a Gemini key; ROADMAP_CARD_PROFILE overrides, and a server
// with no Gemini key keeps the plan model, so nothing is ever sent to a provider that has no credential here.
export const cardProfileId = env => env?.ROADMAP_CARD_PROFILE || (env?.GEMINI_API_KEY ? ROADMAP_CARD_PROFILE : 'plan-default');

// Owner 2026-11-14: Gemini Flash all through. A table step of an older roadmap is authored as an explanation card (its table inside it, the way the planner now asks for it) wherever cards run on Gemini,
// because the table tool still belongs to the plan model (Opus). The step keeps its own format; only the card that answers it changes.
export const authoredFormat = (rec, env) => (rec.format === 'table' && cardProfileId(env) !== 'plan-default' ? 'explanation' : rec.format);

// The author input of an accepted record, shared by the quote and the dispatch so both build the same request. -> { input, options } | { failed }
export function authorInput(rec, limits = ROADMAP_LIMITS, env = {}) {
  // Allowlist before any model call: an unsupported format costs nothing.
  if (!ROADMAP_FORMATS.includes(rec.format)) return { failed: fail('unsupported_capability', 'format_not_enabled') };
  const passage = String(rec.passageText ?? '');
  if (!passage.trim()) return { failed: fail('terminal_validation_failure', 'passage_empty') };
  // The whole document is the writer's context when it fits the whole-source limit; otherwise the anchored passage alone (the existing
  // long-source path), never a silent cut. The passage offsets stay the highlight anchor only.
  const document = typeof rec.documentText === 'string' && rec.documentText.length <= limits.source.chars ? rec.documentText : null;
  if (!document && passage.length > limits.source.passageChars) return { failed: fail('terminal_validation_failure', 'passage_too_long') };
  // A fresh object: no field of any request, job record or model output is copied in. CORE.03: the learner's accepted words and the teaching scope ride beside the step.
  const said = rec.learnerInstruction, scope = rec.teachingScope;
  const brief = [`Step: ${rec.stepTitle}`, `Goal: ${rec.stepGoal}`, ...(rec.claimsToCover?.length ? [`Claims to cover:\n${rec.claimsToCover.map(c => `- ${c}`).join('\n')}`] : []), ...(rec.outcome ? [`Learning outcome of the roadmap: ${rec.outcome}`] : []),
    ...(said?.original?.trim() ? [`The learner's original request:\n${said.original}`] : []),
    ...(said?.revisions?.length ? [`The learner's accepted changes to the roadmap, in order:\n${said.revisions.map(r => `- ${r.text}`).join('\n')}`] : []),
    ...(scope ? [`Teaching scope of the roadmap: ${scope.kind === 'passage' ? `characters ${scope.start}-${scope.end} of the document, the part the learner chose to learn` : 'the whole document'}`] : [])].join('\n');
  const context = document
    ? `${brief}\n\nHighlighted passage (the step's anchor):\n<passage>\n${passage}\n</passage>\n\nWhole document:\n<document>\n${document}\n</document>`
    : `${brief}\n\nPassage:\n<passage>\n${passage}\n</passage>`;
  // E1: the visuals the learner explicitly asked this step for, from the accepted learner instruction (the planner's own title and goal are not a request). An
  // unsupported picture stops here with zero author calls. A table-format step is a table already.
  const format = authoredFormat(rec, env);
  const visuals = format === 'explanation' ? (rec.visualRequirements ?? deriveVisualRequirements(requirementText({ original: said?.original, revisions: said?.revisions }))) : null;
  if (visuals?.unsupported) return { failed: fail('unsupported_capability', 'required_visual_unsupported', { error: visuals.unsupported }) };
  // CORE.09: the frozen Depth rides as the request's Depth, so the roadmap gets the same Explanation target and budget as a direct question.
  // GEN-1 G6: no `planned` flag any more. Its reason (the quote hashed a body without a plan, so a planned dispatch never matched: owner 2026-11-14) went with the equality check, so
  // generateArtifact runs the planner once for the card as the typed route does (one TypeSafe call, 1.2 s timeout, outside the card's hold and meter) and the roadmap gets the same kind draw.
  return { input: { command: 'explain', args: `${rec.stepTitle}: ${rec.stepGoal}`.slice(0, ARGS_CAP), selection: null, context, ...(rec.depth && depthOf(rec.depth) !== 'balanced' ? { depth: depthOf(rec.depth) } : {}), ...(visuals?.items?.length ? { visualRequirements: visuals } : {}) },
    format,
    options: { only: [format], systemSuffix: roadmapCardSuffix({ ...rec, format }), repairs: 0, title: rec.stepTitle, profile: resolveExplanationProfile(cardProfileId(env)) } };
}

// GEN-1 G6: the dispatch body is not the quoted body: it carries the card's own seed (other numbers in a varied example), the planner's statement and kind bundle, and (R2 and later) a block of
// up to EXAMPLES_BLOCK_MAX_CHARS of examples. So the quote bounds the worst such body: the quoted one with room for a full examples block and the plan's delta added to its system text.
// '一' is three UTF-8 bytes, the dearest character the byte-priced bound (learn-spend.js requestSpendBound) can see, so the room holds whatever the examples and the plan write.
export const EXAMPLES_BLOCK_MAX_CHARS = 14_000; // = MAX_CONTEXT of explanation-references.js (a test pins both)
export const PLAN_DELTA_MAX_CHARS = 10_000; // the most the plan's statement, shape example and kind bundle add over an unplanned body, in 3-byte characters: measured 24,356 bytes (roadmap-gemini) over the library prompts x 24 kinds, rounded up to 30,000 bytes; a test re-measures
const worstCaseBody = body => (typeof body.system === 'string' ? { ...body, system: body.system + '一'.repeat(EXAMPLES_BLOCK_MAX_CHARS + PLAN_DELTA_MAX_CHARS) } : body);

// CORE.05: the quote of the actual full first author request of an accepted record. Zero model calls.
// -> { outcome: 'quoted', boundMicros, requestFingerprint, provider, model } | a failure
export async function quoteRoadmapCard(env, rec, { limits = ROADMAP_LIMITS } = {}) {
  const built = authorInput(rec, limits, env);
  if (built.failed) return built.failed;
  const prepared = prepareArtifactAuthorRequest(env, built.input, built.options);
  if (prepared.result) return fail('unsupported_capability', String(prepared.result));
  // EXP-13: an explanation step's hold also covers its pictures (two, three attempts each) at the image quote; a deployment that cannot price a picture adds nothing and makes none.
  const route = authorRoute(env, prepared.model), author = boundOf(worstCaseBody(prepared.body), route), boundMicros = author + (built.format === 'explanation' && Number.isSafeInteger(author) ? figuresBoundMicros(env) : 0);
  if (!Number.isSafeInteger(boundMicros) || boundMicros <= 0) return fail('unsupported_capability', 'unpriced_request');
  // EXP-11-C02: the profile the request was built from rides with the quote, for the accepted record to keep (the model is already in the fingerprint).
  return { outcome: 'quoted', boundMicros, requestFingerprint: await requestFingerprint(prepared.body, route), provider: route.provider, model: route.model, ...(prepared.profile ? { profile: await explanationProfileBinding(prepared.profile) } : {}) };
}

// ref = { authorizationId, resultId, resultVersion } (checklist R4.08). Everything else comes from the accepted, immutable records:
//   deps.loadAccepted(env, access, ref) -> null | { cardId, stepId, proposalId, proposalVersion, format, stepTitle, stepGoal,
//       passageText, documentText (the whole document when it fits the whole-source limit, else null), claimsToCover, outcome,
//       learnerInstruction, teachingScope, sourceRef (R3 publicRef or null), language, depth, retry, requestFingerprint?, boundMicros? }
//       (requestFingerprint/boundMicros: the acceptance quote; when present the outgoing body must stay under boundMicros or nothing is sent; the fingerprint is kept as the audit of the quoted body)
//   deps.withProviderCall(env, { proposalId, proposalVersion, cardId, stage, call, retry, authorizationId }) -> env carrying the
//       deterministic operation identity (State/Money's withRoadmapProviderCall). Required: without it nothing is spent.
//   deps.callModel / deps.generate: the provider transport and generateArtifact; defaults are the production ones.
//   deps.figureStore: { org, email, app, boardId } the roadmap's board owner, where an EXP-13 picture is kept; deps.figureAdapter: an image adapter double (tests).
export async function generateRoadmapCard(env, access, ref, deps = {}) {
  if (!validateAccess(access).ok) return { outcome: 'forbidden' };
  const { loadAccepted, withProviderCall, limits = ROADMAP_LIMITS, generate = generateArtifact, callModel = loggedModel('artifact', planModel), callModelFor = null, figureStore = null, figureAdapter = null } = deps; // callModelFor(transport): roadmap-run's call-row and checkpoint wrapper around a given transport (a fast-chain step)
  if (typeof loadAccepted !== 'function' || typeof withProviderCall !== 'function') return { outcome: 'unavailable', code: 'adapter_not_wired' };
  const rec = await loadAccepted(env, access, ref);
  if (!rec) return { outcome: 'unavailable', code: 'not_accepted' };
  const built = authorInput(rec, limits, env);
  if (built.failed) return built.failed;
  // An accepted record that kept its profile binding dispatches with exactly that profile; if the registry no longer resolves to the same hash, nothing is sent.
  if (rec.profile) {
    let pinned = null; try { pinned = resolveExplanationProfile(rec.profile.id); } catch { /* unknown: refused below */ }
    if (!pinned || (await explanationProfileBinding(pinned)).hash !== rec.profile.hash) return fail('terminal_validation_failure', 'profile_changed');
    built.options.profile = pinned;
  }
  let call = 0;
  const meter = inner => async (e, body, model, org) => {
    // CORE.04: one authoring call per accepted card (generationPerCard 1, repairs 0); a second fails closed before any admission.
    if (call >= limits.calls.generationPerCard) throw new Error('operation_budget');
    // CORE.05: the body about to be sent stays under the bound quoted at acceptance, or nothing is sent. GEN-1 G6: it need not be the quoted body (the dispatch has its own seed and plan, and later its
    // examples), so there is no equality check; the quote bounds the worst such body (quoteRoadmapCard) and the fingerprint stays stored as the audit of what was quoted.
    if (rec.requestFingerprint && !(boundOf(body, authorRoute(e, model)) <= rec.boundMicros)) throw new Error('request_over_bound');
    const n = call++;
    // withProviderCall is State's withRoadmapProviderCall (async, answers { env, opId, key }); a plain env-returning double is also accepted.
    const scoped = await withProviderCall(e, { proposalId: rec.proposalId, proposalVersion: rec.proposalVersion, cardId: rec.cardId, stage: n === 0 ? 'generate' : 'repair', call: n, retry: rec.retry ?? 0, authorizationId: ref.authorizationId });
    return inner(scoped?.opId ? scoped.env : scoped, body, model, org);
  };
  const metered = meter(callModel);
  // EXP-13: each picture attempt is its own stable operation on the step hold (stage illustration), never the author's one call.
  const scope = async (e, n) => { const scoped = await withProviderCall(e, { proposalId: rec.proposalId, proposalVersion: rec.proposalVersion, cardId: rec.cardId, stage: 'illustration', call: n, retry: rec.retry ?? 0, authorizationId: ref.authorizationId }); return scoped?.opId ? scoped.env : scoped; };
  // GEN-1 G6: the card's own seed (made at dispatch: a call that may have reached the provider is never retried blind, so a seed need not survive a replay) and the archive record the typed
  // route writes (learn-artifact.js artifactFetch), so a roadmap card is reproducible from its record. No email: the user id only. Logged, never thrown (learn-storage.js archiveExplanation).
  const requestSeed = crypto.randomUUID(), trace = { requestSeed }, started = Date.now();
  built.input = { ...built.input, requestSeed };
  const archive = (outcome, extra = {}) => archiveExplanation(env, { id: crypto.randomUUID(), at: new Date(started).toISOString(), ms: Date.now() - started, release: env.RELEASE_SHA ?? null, userId: access.actorUserId ?? null, app: access.app ?? null, board: access.boardId ?? null,
    request: { command: built.input.command, args: built.input.args, selection: null, hasContext: true, depth: built.input.depth ?? 'balanced', sourceRefId: null }, source: 'roadmap', cardId: rec.cardId, proposalId: rec.proposalId, proposalVersion: rec.proposalVersion, retry: rec.retry ?? 0, ...trace, outcome, ...extra });
  let out;
  try { out = await generate(env, built.input, { callModel: metered, meterStep: inner => meter(callModelFor ? callModelFor(inner) : inner), ...built.options, figures: { store: figureStore, scope, ...(figureAdapter ? { adapter: figureAdapter } : {}) }, trace }); }
  catch (error) {
    await archive('error', { error: String(error?.message || error).slice(0, 300), code: error?.code ?? null });
    if (['operation_budget', 'request_over_bound'].includes(error?.message)) return fail('terminal_validation_failure', error.message, { calls: call });
    // A call that may have reached the provider (roadmap-run.js marks it) is never retried blind: its outcome is reconciled first.
    if (error?.code === 'unknown_provider_outcome') return fail('unknown_provider_outcome', 'outcome_unknown', { calls: call });
    return fail('transient_provider_failure', 'provider_error', { calls: call });
  }
  await archive(out?.result ?? null, { repaired: out?.repaired ?? null, profile: out?.profile ?? null, steps: out?.attempts ?? null, error: out?.error ?? null, returned: out?.block ?? null });
  const calls = call;
  switch (out?.result) {
    case 'artifact':
      // Defense in depth: the card must be the requested format, whatever the model named.
      if (out.primitive !== built.format) return fail('unsupported_capability', 'wrong_primitive', { calls });
      // id, stepId and sourceRef are metadata the adapter sets, never the model.
      return { outcome: 'ok', primitive: out.primitive, repaired: !!out.repaired, calls, ...(out.diagramsDropped ? { diagramsDropped: out.diagramsDropped } : {}), block: { ...out.block, id: rec.cardId, stepId: rec.stepId, ...(rec.sourceRef ? { sourceRef: rec.sourceRef } : {}) } };
    case 'clarification': return { outcome: 'clarification', failure_class: 'clarification', question: out.question, calls };
    // A stable internal reason: explanation_over_budget / explanation_bad_diagram (CORE.09), else validation_error.
    case 'validation_error': return fail('terminal_validation_failure', String(out.error || '').match(/^((?:explanation|required_visual)_[a-z_]+):/)?.[1] || 'validation_error', { calls, error: out.error });
    default: return fail('unsupported_capability', String(out?.result || 'unknown'), { calls });
  }
}
