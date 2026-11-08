// Learn Artifact Generation v1 (docs/features/learn-artifact-generation.md):
// learner command -> semantic family -> constrained primitive choice ->
// validated declarative spec -> canvas block.
//
// The allowed primitives come from the shared command contract (agent/slash.js)
// here on the server, never from the request: a modified browser can name any
// command, but not widen what that command may produce. The model is offered
// one tool per ready primitive in that family plus a clarifying question, so a
// primitive outside the family is not even callable - and is rejected if it
// comes back anyway. Paid primitives come back as proposals; nothing here
// starts a job.
import { learnRequest, primitive as contract } from '../../web/src/agent/slash.js';
import { BRIEF_LIMITS, generationArgs, isBriefCommand } from '../../web/src/material-brief.js';
import { consumeProposal, releaseProposal, verifyProposal } from './generation-proposal.js';
import { repositoryIdentity } from './repositories.js';
import { contextDocumentBlocks } from './learn-context-docs.js';
import { PRIMITIVES, isReady, artifactBlock, EXPLANATION_GUIDANCE, explanationProblem, dropInvalidDiagrams } from './learn-primitives.js';
import { planModel } from './ask.js';
import { LEARN_TASKS, ARTIFACT_REPAIRS, loggedModel, notConfiguredMessage } from './learn-models.js';
import { explanationProfileBinding, explanationProfileFor } from './explanation-models.js';
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { tutorImageContext } from './learn-image-context.js';
import { IMAGE_EXTRACTION_SYSTEM, imageExtractionTool, checkImageExtraction } from './inline-image-extraction.js';
import { SCENE_AUTHORING } from './agents/learn-scene-author.js';
import { calculationProblem, cardAtSettings, sceneProblem, withDataSizes, withSamplesNote } from './learn-scene-gates.js';
import { DEFAULT_DEPTH, DEPTH_COMMANDS, depthInstruction, explanationTarget, validDepth } from './chat-depth.js';
import { readDepth } from './learn-user-settings.js';
import { VERIFY_SYSTEM, VERIFY_TOOL, falseItems, verifyMessage } from './agents/learn-scene-verify.js';

const CLARIFY = { name: 'ask_clarifying_question', description: 'Ask the learner one short question when the request is too underspecified to make a correct artifact.', input_schema: { type: 'object', additionalProperties: false, required: ['question'], properties: { question: { type: 'string', minLength: 1, maxLength: 300 } } } };
const toolName = id => `make_${id}`;
const VERIFIER = 'scene verifier', VERIFY_MAX_TOKENS = 2000;
// A long text field's limit, said in words in the tool's description: a schema maxLength alone was overrun twice, repair
// included (inline lane R, 2026-10-13: an explanation body over 2,000 characters, nothing added, $0.12).
const lengths = schema => Object.entries(schema.properties || {}).filter(([, field]) => field.type === 'string' && field.maxLength >= 500)
  .map(([key, field]) => ` Keep ${key} under ${field.maxLength.toLocaleString('en-US')} characters (about ${Math.floor(field.maxLength / 7 / 10) * 10} words): longer is refused.`).join('');

import { ARTIFACT_SYSTEM } from './agents/learn-artifact.js';
// Server-only parts of a primitive, kept out of the browser bundle learn-primitives.js is also in: the interactive scene's
// authoring contract (appended to its tool description) and its gates, which run the existing scene validators on the block
// the shared adapter built. A gate's first problem goes to the model as the one repair; a scene that still fails is no card.
const CONTRACTS = { animation: SCENE_AUTHORING };
const GATES = {
  animation: block => {
    const scene = withSamplesNote(withDataSizes(block.scene), block.calculation);
    const problem = calculationProblem(block.scene, block.calculation) || sceneProblem(scene);
    if (problem) throw new Error(problem);
    return { ...block, scene };
  },
};
import { withAttemptKind, noteUsageResult } from './learn-usage.js';
import { celerisExplainRoute } from './explain-celeris-dev.js';
export { ARTIFACT_SYSTEM };

// A paid renderer this deployment has not provisioned is unavailable BEFORE it is proposed, so no proposal, hold or charge
// follows (audit c015534a; owner has not chosen provision vs retire, so nothing is retired). Each test mirrors the provider's
// own not-configured check (videoProvider, ManimProvider); the unit test pins them together.
const PROVISIONED = {
  video_generate: [env => env.LEARN_VIDEO_PROVIDER === 'fal-seedance-lite' && !!env.FAL_API_KEY, 'Video generation is not set up here yet, so nothing was proposed or charged.'],
  maths_animation: [env => !!env.MATH_WORKER_URL && !!env.MATH_WORKER_TOKEN, 'Maths animation is not set up here yet, so nothing was proposed or charged.'],
};
const notProvisioned = (env, id) => !!env && !!PROVISIONED[id] && !PROVISIONED[id][0](env);

// What a command resolves to before any model runs. `ready` is the command's
// family (after /practice narrowing) intersected with what can be generated.
// env is optional: the pre-auth shape check passes none and skips the provisioning test.
// `only` (R4, trusted server code only, never read from a request): a narrower primitive set than the command's family; it can restrict, never widen,
// and the narrowing words in args are ignored so a step titled "interactive ..." cannot empty the intersection.
export function artifactPlan(command, { args = '', selection = null } = {}, env = null, only = null) {
  const request = learnRequest(command, { args: only ? '' : args, selection });
  if (request.deterministic) return { result: 'direct', action: request.action };
  if (!request.allowedPrimitives) return { result: 'not_artifact', error: `/${command} is answered in chat, not as an artifact.` };
  const ready = (only ? request.allowedPrimitives.filter(id => only.includes(id)) : request.allowedPrimitives).filter(id => isReady(id) && !PRIMITIVES[id].direct && !notProvisioned(env, id)); // a direct primitive is never a model-written card
  if (!ready.length) {
    const blocked = request.allowedPrimitives.find(id => isReady(id) && notProvisioned(env, id));
    const reason = blocked ? PROVISIONED[blocked][1] : request.allowedPrimitives.map(id => PRIMITIVES[id]?.unavailable).find(Boolean);
    return { result: 'unsupported', message: reason || `/${command} isn't available yet.` };
  }
  return { request, ready };
}

// CORE.05: the exact first author request (system with any trusted suffix, tools, messages, output cap), so a quote and the dispatch hash
// the same full body. -> a plan refusal ({ result }) | { request, ready, messages, model, body }
export function prepareArtifactAuthorRequest(env, input, { only = null, systemSuffix = '', profile = null } = {}) {
  const plan = artifactPlan(input.command, input, env, only);
  if (plan.result) return plan;
  const { request, ready } = plan;
  // EXP-11-C02: the written Explanation (its card is the only one on offer) takes its model from the server profile (EXPLANATION_MODEL_PROFILE, default =
  // the plan transport LEARN_TASKS.artifact pins, so the default request is unchanged). A profile that cannot be used is a plan refusal, never a silent default.
  let bound = null;
  if (ready.length === 1 && ready[0] === 'explanation') { try { bound = profile ?? explanationProfileFor(env); } catch (error) { return { result: 'unsupported', message: error.message }; } }
  const tools = [...ready.map(id => ({
    name: toolName(id),
    description: `${PRIMITIVES[id].about}${lengths(PRIMITIVES[id].schema)}${contract(id).paid ? ' Paid: it is proposed to the learner, who confirms before anything is generated.' : ''}${CONTRACTS[id] || ''}${id === 'explanation' ? ` ${EXPLANATION_GUIDANCE} ${explanationTarget(input.depth)}` : ''}`, // CORE.09: shared teaching guidance, this request's Depth target and budget
    input_schema: PRIMITIVES[id].schema,
  })).map(tool => input.imageSource ? imageExtractionTool(tool) : tool), CLARIFY];
  // R2: the learner's Depth for this canvas, for the commands that make an explanation (chat-depth.js DEPTH_COMMANDS); Standard sends nothing.
  const depthNote = depthInstruction(input.depth, 'card');
  const text = JSON.stringify({ command: `/${request.command}`, request: request.prompt, learnerText: input.args || '', selection: request.selection, context: input.context || null, ...(depthNote ? { depth: input.depth } : {}) });
  // The canvas's switched-on context documents come first (canvas-context-docs.md), then the request.
  const messages = [{ role: 'user', content: input.documents?.length ? [...input.documents, { type: 'text', text }] : text }];
  // The task's cap, or a longer one a primitive on offer needs (the interactive scene's 16,000); spend admission bounds it.
  const maxTokens = Math.max(bound ? bound.roles.author.maxOutputTokens : LEARN_TASKS.artifact.maxTokens, ...ready.map(id => PRIMITIVES[id].maxTokens || 0));
  const system = (input.imageSource ? `${ARTIFACT_SYSTEM}\n${IMAGE_EXTRACTION_SYSTEM}` : ARTIFACT_SYSTEM) + (depthNote ? `\n${depthNote}` : '') + (systemSuffix ? `\n${systemSuffix}` : '');
  return { request, ready, messages, model: bound ? bound.roles.author.model : LEARN_TASKS.artifact.model, profile: bound, repairModel: bound ? bound.roles.repair.model : null, body: { max_tokens: maxTokens, system, tools, tool_choice: { type: 'any', disable_parallel_tool_use: true }, messages } };
}

export async function generateArtifact(env, input, { callModel: baseCall = loggedModel('artifact', planModel), only = null, systemSuffix = '', repairs = ARTIFACT_REPAIRS, title = null, profile = null } = {}) {
  // `repairs` (trusted, server-only; the roadmap passes 0 for one authoring call per accepted card) caps the automatic repair calls.
  // R4 trusted options: `only` restricts the primitives offered, `systemSuffix` is appended to the system prompt of every call (initial and repair),
  // `title` (the roadmap's accepted step title) replaces the model's title before any check.
  const prepared = prepareArtifactAuthorRequest(env, input, { only, systemSuffix, profile });
  if (prepared.result) return prepared;
  const { request, ready, messages, body, model } = prepared;
  const binding = prepared.profile ? await explanationProfileBinding(prepared.profile) : null; // what this card's model was chosen by, saved with the result
  const callModel = systemSuffix ? (e, b, m, org) => baseCall(e, { ...b, system: `${b.system}\n${systemSuffix}` }, m, org) : baseCall; // the verifier's call
  const ask = async (history, kind) => {
    const response = await baseCall(kind ? withAttemptKind(env, kind) : env, { ...body, messages: history }, kind === 'repair' && prepared.repairModel ? prepared.repairModel : model, null); // the repair role: the author's model unless the profile pins another
    // A refused spend admission says why (learn-spend.js spendMessage), never only its status.
    const refused = response.status === 429 ? (await response.clone().json().catch(() => null)) : null;
    if (refused?.code === 'spend_limited' && refused.error) throw new Error(refused.error);
    if (!response.ok) throw new Error((await notConfiguredMessage(response)) || `Artifact generation unavailable (model HTTP ${response.status}). Try again.`);
    const result = await response.json();
    const calls = result.content?.filter(part => part.type === 'tool_use') || [];
    if (calls.length !== 1) throw new Error('The model returned no artifact.');
    return { result, call: calls[0] };
  };
  const verify = block => sceneVerdict(env, callModel, input.args, block);
  let { result, call } = await ask(messages);
  // At most one repair: the first failure goes back to the model once.
  for (let attempt = 0; ; attempt++) {
    if (call.name === CLARIFY.name) {
      const question = typeof call.input?.question === 'string' ? call.input.question.trim().slice(0, 300) : '';
      if (question) return { result: 'clarification', question };
    }
    const id = ready.find(candidate => toolName(candidate) === call.name);
    // Outside the family is a contract violation, not a format slip: no repair.
    if (!id && call.name !== CLARIFY.name) return { result: 'validation_error', error: `Rejected ${call.name}: /${request.command} allows only ${ready.join(', ')}.` };
    try {
      if (result.stop_reason === 'max_tokens') throw new Error('The artifact was cut off before it was complete');
      if (!id) throw new Error('The clarifying question was empty');
      let block, extraction, diagramsDropped = 0;
      if (input.imageSource) {
        const checked = checkImageExtraction(call.input, content => ({ result: artifactBlock(id, content) }), input.imageSource);
        if (checked.error) throw new Error(checked.error);
        if (checked.result.kind === 'clarify') return { result: 'clarification', question: checked.result.question };
        ({ extraction, ...block } = checked.result);
      } else block = artifactBlock(id, call.input);
      if (title && typeof block.title === 'string') block = { ...block, title };
      // CORE.09: the final title first, then the Depth's display-text budget and supported Mermaid, on every path that makes an explanation.
      // No repair left: an rh-diagram that cannot be drawn is dropped and the written explanation is delivered (the prose still passes its own checks).
      if (id === 'explanation') {
        if (attempt >= repairs) ({ block, dropped: diagramsDropped } = dropInvalidDiagrams(block));
        const problem = explanationProblem(block, input.depth); if (problem) throw new Error(problem);
      }
      if (GATES[id]) block = GATES[id](block);
      if (id === 'animation' && env.LEARN_SCENE_VERIFIER !== 'off') { const problem = await verify(block); if (problem) throw new Error(problem); }
      if (contract(id).paid) return { result: 'paid_proposal', primitive: id, block, message: 'This uses paid generation.', estimatedCost: contract(id).estimatedCost ?? null, repaired: attempt > 0, ...(extraction ? { extraction } : {}) };
      return { result: 'artifact', primitive: id, block, repaired: attempt > 0, ...(diagramsDropped ? { diagramsDropped } : {}), ...(extraction ? { extraction } : {}), ...(binding && id === 'explanation' ? { profile: binding } : {}) };
    } catch (error) {
      // Which check refused which attempt: the validator's words only, never the spec (a repair's cause is otherwise invisible).
      console.log(JSON.stringify({ event: 'learn_artifact_invalid', primitive: id || null, attempt, error: String(error.message).slice(0, 300) }));
      if (error.cause === VERIFIER) throw error; // the check could not run: nothing for the model to repair
      if (input.imageSource || attempt >= repairs) return { result: 'validation_error', primitive: id || null, error: error.message };
      ({ result, call } = await ask([...messages, { role: 'assistant', content: result.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `Validation failed: ${error.message}. Return the complete corrected input with one of the same tools. This is the only correction attempt.` }] }], 'repair'));
    }
  }
}

// The verifier pass (owner, 2026-10-21): a scene that passed the gates is read back setting by setting by a second call,
// through the same spend admission; a statement it reports goes to the one repair, and a scene still reported is no card.
// LEARN_SCENE_VERIFIER=off turns it off.
export async function sceneVerdict(env, callModel, request, block) {
  const card = cardAtSettings(block.scene);
  const response = await callModel(withAttemptKind(env, 'evaluation'), { max_tokens: VERIFY_MAX_TOKENS, system: VERIFY_SYSTEM, tools: [VERIFY_TOOL],
    tool_choice: { type: 'any', disable_parallel_tool_use: true },
    messages: [{ role: 'user', content: verifyMessage({ request, title: block.title, calculation: block.calculation, card }) }] }, LEARN_TASKS.artifact.model, null);
  const refused = response.status === 429 ? (await response.clone().json().catch(() => null)) : null;
  if (refused?.code === 'spend_limited' && refused.error) throw new Error(refused.error, { cause: VERIFIER });
  if (!response.ok) throw new Error(`The interactive explanation could not be checked (model HTTP ${response.status}), so nothing was added. Try again.`, { cause: VERIFIER });
  const problems = (await response.json()).content?.find(part => part.type === 'tool_use' && part.name === VERIFY_TOOL.name)?.input?.problems;
  if (!Array.isArray(problems)) throw new Error('The interactive explanation could not be checked (the check gave no verdict), so nothing was added. Try again.', { cause: VERIFIER });
  const kept = falseItems(problems, card);
  return kept.length ? `A check of the card found statements that are false: ${kept.map((problem, i) => `${i + 1}) ${problem.setting ? `with ${problem.setting}, ` : ''}"${problem.object}" says "${problem.says}", against "${problem.against}": ${problem.finding}`).join(' ')}` : null;
}

// EXP-T15: what an attached image is for, said to the author beside the pixels. Only a layout reference exists yet: using an
// image's facts needs verification (T13/T16), so no other role is accepted.
export const IMAGE_ROLES = Object.freeze({
  layout_reference: 'The learner attached the image below as a layout reference for this explanation: follow its arrangement, grouping and reading order where they fit the request. Do not take facts, numbers, labels or claims from it as true; the request and the other context decide the content.',
});

// POST /api/learn/artifact {app, command, args, selection, context, image_context?, image_role?}. Any
// family or allowedPrimitives in the body is ignored: the command decides.
// images: the existing authorized image reader (learn-image-context.js), injected by tests.
// proposal (owner spec 2026-10-29 section 6): Generate on a simple material brief (web/src/material-brief.js). The signed brief must be
// this person's, for this command and canvas, and its current unused revision; it is consumed once by this press (a double press gets
// proposal_used) BEFORE any model call, and the generator takes the brief's own words, selection and context, never the body's. A press
// that makes no card (a question back, a refusal, an error) gives the consumption back. Without a proposal the route is unchanged (the
// Tutor's create_material, Ctrl+K's automatic routing and the internal material tools never draw a brief).
export async function artifactFetch(req, env, generate = generateArtifact, { images = tutorImageContext, identity = null, sourceRef = null } = {}) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 20000) return json({ error: 'Request too large' }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body.command !== 'string' || typeof (body.args ?? '') !== 'string' || (body.args || '').length > 1000 || (body.context != null && (typeof body.context !== 'string' || body.context.length > 8000))) throw new Error('Invalid artifact request');
    artifactPlan(body.command, body); // unknown command or selection: 400 before auth or model
    if (body.depth !== undefined && !validDepth(body.depth)) throw new Error('depth must be overview, standard or deep'); // R2: an explicit Depth the server does not know is refused, never normalized
    if (body.image_context !== undefined && body.command !== 'explain') throw new Error('Only /explain takes an attached image');
    if ((body.image_role ?? 'layout_reference') !== 'layout_reference' || (body.image_role !== undefined && body.image_context === undefined)) throw new Error('image_role must be layout_reference, with an image_context');
  } catch (error) { return json({ error: error.message }, 400); }
  const access = await authorizedBoardApp(req, env, body.app, body.pending);
  if (access instanceof Response) return access;
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  // R3: the card's sourceRef is the id the server minted for this learner's selected passage, read again now (source-refs.js). It is
  // metadata on the card the command makes, never model input; a changed or unavailable source refuses before any model call.
  let passage = null;
  if (body.sourceRefId != null) {
    if (!env.LEARN_DB) return json({ error: 'Source references are not available here yet.', code: 'not_configured' }, 503);
    const user = await (identity || repositoryIdentity)(req, env);
    if (user instanceof Response) return user;
    const got = await (sourceRef || (await import('./source-refs.js')).trustedSourceRef)(req, env, user, body.app, body.sourceRefId);
    if (got.error) return json({ error: got.error, code: got.code }, got.status);
    passage = got.ref;
  }
  let brief = null;
  if (body.proposal !== undefined) {
    const p = body.proposal;
    if (!isBriefCommand(body.command) || p?.command !== body.command) return json({ error: 'This brief is for another command. Send the command again.', code: 'proposal_refused' }, 409);
    if (!env.LEARN_DB) return json({ error: 'Briefs are not available here yet.', code: 'not_configured' }, 503);
    const user = await (identity || repositoryIdentity)(req, env);
    if (user instanceof Response) return user;
    const refused = await verifyProposal(env, p, user.email);
    if (refused) return json({ error: refused, code: 'proposal_refused' }, 409);
    if (generationArgs(p.input).length > BRIEF_LIMITS.args) return json({ error: 'This brief is too long to make. Send the command again with a shorter request.', code: 'brief_too_long' }, 409);
    const key = crypto.randomUUID();
    const spent = await consumeProposal(env.LEARN_DB, p, user.email, { org: user.org, app: body.app }, key);
    if (spent) return json(spent, 409);
    brief = { p, user, key };
    Object.assign(body, { args: generationArgs(p.input), selection: p.input.selection ?? null, context: p.input.context ?? null });
  }
  const giveBack = () => (brief ? releaseProposal(env.LEARN_DB, brief.p, brief.user.email, body.app, brief.key).catch(() => false) : null);
  let documents;
  try { documents = await contextDocumentBlocks(env, access, null, { query: `${body.args || ''} ${body.context || ''}` }); } catch (error) { await giveBack(); return json({ error: `Context documents: ${error.message}` }, 502); }
  // The image's bytes, read here under this canvas's authorization: never a browser-claimed URL, and never silently dropped.
  if (body.image_context !== undefined) {
    const got = await images(env, access, { image_context: body.image_context, board: body.board ?? 'main' }).catch(() => null);
    if (got?.error) return json({ error: got.error }, got.status || 400);
    if (!got?.blocks?.some(part => part.type === 'image')) return json({ error: got?.notice || 'The attached image is unavailable. Attach it again and resend.', code: 'image_unavailable' }, 409);
    documents = [...documents, { type: 'text', text: IMAGE_ROLES.layout_reference }, ...got.blocks];
  }
  // R2: the Depth the learner had selected when they submitted (the client snapshots it with the board), validated above; omitted, the
  // saved Depth for that exact canvas. No board named is Standard: there is no fallback to the main board. Commands that make no
  // explanation (DEPTH_COMMANDS) get none, whatever was sent.
  const depth = !DEPTH_COMMANDS.includes(body.command) ? DEFAULT_DEPTH : body.depth !== undefined ? body.depth
    : await readDepth(env, { org: access.org, userId: access.user_id, app: body.app, board: typeof body.board === 'string' ? body.board : null });
  let celeris = null; // DEV ONLY (explain-celeris-dev.js): declared outside the try so a refused request can still report what the route saw
  try {
    celeris = celerisExplainRoute(env, body.command); // DEV ONLY (explain-celeris-dev.js): off unless a dev or test Worker turns it on; production never takes it
    const out = await generate(env, { command: body.command, args: body.args || '', selection: body.selection || null, context: body.context || null, ...(documents.length ? { documents } : {}), ...(depth !== DEFAULT_DEPTH ? { depth } : {}) }, celeris?.options);
    noteUsageResult(env, out?.result === 'validation_error' ? 'none' : 'full'); // usage accounting: a rejected artifact delivered nothing
    if (out?.result !== 'artifact' && out?.result !== 'paid_proposal') await giveBack();
    const done = celeris ? { ...out, devModel: celeris.served() } : out;
    return json(passage && done?.block ? { ...done, block: { ...done.block, sourceRef: passage } } : done);
  }
  catch (error) { await giveBack(); return json({ error: error.message, ...(celeris ? { devModel: celeris.served() } : {}) }, 502); }
}
