import { planExplanation, planShape, cardVisuals, visualKinds, visualsStatement, plannerEnabled } from './explanation-planner.js';
import { selectDiagramReferences, preferSingleVariants, diagramReferenceContext, PHASE02_DIAGRAM_GUIDANCE, bundledAuthorSchema, diagramBundle } from './explanation-references.js';
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
import { literalBreaksDeep } from './literal-breaks.js';
import { PRIMITIVES, isReady, artifactBlock, EXPLANATION_GUIDANCE, EXPLANATION_VISUAL_RULES, explanationProblem, chainsAsCycles, flowsAsSequences, correctDiagrams, plainTreesUnlessBinary, relationshipsAsGraphs, dropInvalidDiagrams, stripUnknownKeys, diagramSmells, markdownIllustrations, markdownVisuals, proseListCount, settleExplanationBody } from './learn-primitives.js';
import { planModel } from './ask.js';
import { LEARN_TASKS, ARTIFACT_REPAIRS, loggedModel, notConfiguredMessage } from './learn-models.js';
import { explanationProfileBinding, explanationProfileFor } from './explanation-models.js';
import { INTERACTION_GUIDANCE, INTERACTION_PROPERTIES, bindInteractions, interactionsEnabled, keptInteractions } from './explanation-interactions.js';
import { boundRequirements, danglingFigureProblem, deriveVisualRequirements, fallbackKind, repeats, requiredMix, requiredVisualProblem, requirementText } from './explanation-visuals.js';
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { tutorImageContext } from './learn-image-context.js';
import { IMAGE_EXTRACTION_SYSTEM, imageExtractionTool, checkImageExtraction } from './inline-image-extraction.js';
import { SCENE_AUTHORING } from './agents/learn-scene-author.js';
import { calculationProblem, cardAtSettings, sceneProblem, withDataSizes, withSamplesNote } from './learn-scene-gates.js';
import { DEFAULT_DEPTH, DEPTH_COMMANDS, depthInstruction, explanationTarget, validDepth } from './chat-depth.js';
import { illustrateExplanation } from './explanation-figures.js';
import { readDepth } from './learn-user-settings.js';
import { VERIFY_SYSTEM, VERIFY_TOOL, falseItems, verifyMessage } from './agents/learn-scene-verify.js';

const CLARIFY = { name: 'ask_clarifying_question', description: 'Ask the learner one short question when the request is too underspecified to make a correct artifact.', input_schema: { type: 'object', additionalProperties: false, required: ['question'], properties: { question: { type: 'string', minLength: 1, maxLength: 300 } } } };
const toolName = id => `make_${id}`;
// E2 (explanation-interactions.js): while EXPLANATION_INTERACTIONS is on, the written Explanation tool also takes the three questions and the anchored terms. They are validated
// apart from the card (the card's own schema stays the one that was), then bound to the final text with server-assigned ids and revision.
const interactiveSchema = schema => ({ ...schema, required: [...schema.required, 'questions'], properties: { ...schema.properties, ...INTERACTION_PROPERTIES } });
// EXP-13 fix 2: the author is always asked for one to three visuals as fields (owner 2026-11-08: three, so a list can become a comparison) (every property required, as a strict json_schema needs); the validator also
// reads a body that holds its fences already, and more visuals, whose extras it drops (learn-primitives.js PRIMITIVES.explanation).
const authorSchema = env => {
  const { schema } = PRIMITIVES.explanation;
  const s = { ...schema, required: Object.keys(schema.properties), properties: { ...schema.properties, visuals: { ...schema.properties.visuals, maxItems: 3 } } };
  const formula = formulaSamplerEnabled(env) ? withFormulaSeries(s) : s; // EXPLANATION_FORMULA_SAMPLER=on only
  return interactionsEnabled(env) ? interactiveSchema(formula) : formula;
};
const VERIFIER = 'scene verifier', VERIFY_MAX_TOKENS = 2000;
// A long text field's limit, said in words in the tool's description: a schema maxLength alone was overrun twice, repair
// included (inline lane R, 2026-10-13: an explanation body over 2,000 characters, nothing added, $0.12).
const lengths = schema => Object.entries(schema.properties || {}).filter(([, field]) => field.type === 'string' && field.maxLength >= 500)
  .map(([key, field]) => ` Keep ${key} under ${field.maxLength.toLocaleString('en-US')} characters (about ${Math.floor(field.maxLength / 7 / 10) * 10} words): longer is refused.`).join('');

import { ARTIFACT_SYSTEM, artifactSystem, explanationSystem } from './agents/learn-artifact.js';
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
import { generateWithFallbacks } from './explanation-fast-chain.js';
import { formulaSamplerEnabled, withFormulaSeries, fillFormulaSeries, FORMULA_SERIES_GUIDANCE } from './explanation-formula-series.js';
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
  // Owner 2026-11-08 (clean-up): one source of truth for the card's visuals (explanation-planner.js cardVisuals): the learner's named kinds, else the plan, else the author's rules.
  // EXP-13 fix 6b: an implied picture is not sent (the author would read it as the whole mix); the guidance asks for it and the check below enforces it.
  const asked = askedItems(input), resolved = cardVisuals(input.plan, asked), explanationOnly = ready.length === 1 && ready[0] === 'explanation';
  // The sections that change per card come last in the tool description, after the cached static text: Depth, then this card's visuals (the plan stated as fact, or the rules when there is no plan), then the output format.
  const explanationTail = `\n\n${EXPLANATION_GUIDANCE} ${PHASE02_DIAGRAM_GUIDANCE}\n\nBased on the rules above, this card:\n\n# Depth\n${explanationTarget(input.depth)}\n\n${visualsStatement(input.plan, resolved) ?? EXPLANATION_VISUAL_RULES}${formulaSamplerEnabled(env) ? FORMULA_SERIES_GUIDANCE : ''}${interactionsEnabled(env) ? `\n\n# Output format\n${INTERACTION_GUIDANCE}` : ''}`;
  const tools = [...ready.map(id => ({
    name: toolName(id),
    description: `${PRIMITIVES[id].about}${lengths(PRIMITIVES[id].schema)}${contract(id).paid ? ' Paid: it is proposed to the learner, who confirms before anything is generated.' : ''}${CONTRACTS[id] || ''}${id === 'explanation' ? explanationTail : ''}`, // CORE.09: shared teaching guidance, this request's Depth target and budget
    input_schema: id === 'explanation' ? authorSchema(env) : PRIMITIVES[id].schema,
  })).map(tool => input.imageSource ? imageExtractionTool(tool) : tool), CLARIFY];
  // R2: the learner's Depth for this canvas, for the commands that make an explanation (chat-depth.js DEPTH_COMMANDS); Balanced sends nothing.
  const depthNote = depthInstruction(input.depth, 'card');
  // E1: the server-derived required visuals ride in the request the author reads (and the quote hashes); absent, the request is unchanged.
  const required = id => asked.length && ready.includes('explanation') ? { requiredVisuals: asked.map(({ id, kind, diagramKind, purpose }) => ({ id, kind, ...(diagramKind ? { diagramKind } : {}), purpose })) } : {};
  const text = JSON.stringify({ command: `/${request.command}`, request: request.prompt, learnerText: input.args || '', selection: request.selection, context: input.context || null, ...(depthNote ? { depth: input.depth } : {}), ...required() });
  // The canvas's switched-on context documents come first (canvas-context-docs.md), then the request.
  const messages = [{ role: 'user', content: input.documents?.length ? [...input.documents, { type: 'text', text }] : text }];
  // The task's cap, or a longer one a primitive on offer needs (the interactive scene's 16,000); spend admission bounds it.
  const maxTokens = Math.max(bound ? bound.roles.author.maxOutputTokens : LEARN_TASKS.artifact.maxTokens, ...ready.map(id => PRIMITIVES[id].maxTokens || 0));
  const requiredKinds = asked.filter(item => item.kind === 'diagram' && item.diagramKind).map(item => item.diagramKind);
  // Owner 2026-11-08: with a plan, the gallery example comes from the planner's chosen kind (below); the learner-word shape fallback (explanation-references.js) is used
  // only when the planner was asked and gave no plan (it timed out or failed; owner 2026-11-08), never when it is off or a plan exists. A two-panel reference goes out as its single-diagram variant unless the planned kind is the comparison.
  const topicalReferences = ready.includes('explanation') ? preferSingleVariants(selectDiagramReferences({
    prompt: input.args || request.prompt,
    context: { selection: request.selection, context: input.context, documents: input.documents },
    requiredKinds, shapeFallback: !!input.planned && !input.plan,
    plannedKinds: visualKinds(resolved), // the resolved kinds, filtered to before any keyword scoring
  }), { plannedKind: input.plan?.kind, requiredKinds }) : [];
  // Planner prototype: the gallery example of the card's kind, at the card's depth, goes first, before any topical reference.
  const shape = input.plan && visualKinds(resolved)[0] ? planShape({ kind: visualKinds(resolved)[0] }, validDepth(input.depth) || DEFAULT_DEPTH) : null, diagramReferences = shape ? [shape, ...topicalReferences] : topicalReferences;
  // A1 (owner 2026-11-08): a fast-chain author gets the fixed schema bundle its references and required kinds steer to (explanation-references.js); the plan
  // path keeps the whole schema; the roadmap takes this same rule whenever it runs on a fast-chain profile.
  if (bound?.roles.author.adapter === 'fast-chain') { const t = tools.find(x => x.name === toolName('explanation')); if (t) t.input_schema = bundledAuthorSchema(t.input_schema, diagramBundle({ references: diagramReferences, requiredKinds })); }
  const route = bound?.roles.author.adapter === 'fast-chain' ? 'json_schema' : 'tools';
  const base = explanationOnly ? explanationSystem(route) : artifactSystem(route); // A3: no tool paragraph where no tool is offered
  const system = (input.imageSource ? `${base}\n${IMAGE_EXTRACTION_SYSTEM}` : base) + (depthNote && !explanationOnly ? `\n${depthNote}` : '') + (systemSuffix ? `\n${systemSuffix}` : '') + diagramReferenceContext(diagramReferences);
  return { request, ready, messages, diagramReferences, model: bound ? bound.roles.author.model : LEARN_TASKS.artifact.model, profile: bound, repairModel: bound ? bound.roles.repair.model : null, body: { max_tokens: maxTokens, system, tools, tool_choice: { type: 'any', disable_parallel_tool_use: true }, messages } };
}

// The learner's asked visuals (an implied picture is not one: explanation-visuals.js deriveVisualRequirements).
const askedItems = input => (input.visualRequirements?.items ?? []).filter(i => !i.implied);
// What a last-resort simplified diagram is drawn as: the card's planned kind when there is a plan (flow, cycle or sequence; any other kind becomes a flow), else the learner's words (explanation-visuals.js fallbackKind).
const simplifiedKind = input => { if (input.plan?.planner !== 'jev') return fallbackKind(input.args); const kind = visualKinds(cardVisuals(input.plan, askedItems(input)))[0]; return ['flow', 'cycle', 'sequence'].includes(kind) ? kind : 'flow'; };

export async function generateArtifact(env, input, { callModel: injected = null, only = null, systemSuffix = '', repairs = ARTIFACT_REPAIRS, title = null, profile = null, figures = null, early = null } = {}) {
  // `repairs` (trusted, server-only; the roadmap passes 0 for one authoring call per accepted card) caps the automatic repair calls.
  // R4 trusted options: `only` restricts the primitives offered, `systemSuffix` is appended to the system prompt of every call (initial and repair),
  // `title` (the roadmap's accepted step title) replaces the model's title before any check.
  // `figures` (EXP-13, trusted): { store, scope?, adapter? } for explanation-figures.js illustrateExplanation; omitted, no picture is made and every rh-illustration fence is removed.
  // `early` (EXP-13 fix 3, trusted, the fast chain only): explanation-figures.js figureStarter, the pictures already started from the streamed answer.
  // JEV planner prototype (owner 2026-11-08, dev flag EXPLANATION_PLANNER=jev): planned once per card, before the first author call; the plan rides in `input` through every provider step and repair.
  if (!input.planned && (input.command === 'explain' || input.command === 'explanation') && String(input.args || '').trim() && plannerEnabled(env)) {
    input = { ...input, planned: true, plan: await planExplanation(env, { question: input.args, depth: validDepth(input.depth) || DEFAULT_DEPTH, context: input.context || null }) };
  }
  // Owner 2026-11-08 (clean-up): the 6a/6b word heuristics (repeat words -> cycle, looks-like -> picture) run only when the planner made no plan; one log line says which source decided the visuals.
  if (!input.visualsLogged && (input.command === 'explain' || input.command === 'explanation')) {
    const resolved = cardVisuals(input.plan, askedItems(input));
    console.log(JSON.stringify({ event: 'explanation_visuals_source', winner: resolved.source, kinds: visualKinds(resolved), heuristics: input.plan?.planner === 'jev' ? 'off' : 'on' }));
    input = { ...input, visualsLogged: true };
    if (input.plan?.planner === 'jev' && input.visualRequirements?.items?.some(i => i.implied)) { const items = input.visualRequirements.items.filter(i => !i.implied), { visualRequirements, ...rest } = input; input = items.length ? { ...rest, visualRequirements: { ...visualRequirements, items } } : rest; }
  }
  const prepared = prepareArtifactAuthorRequest(env, input, { only, systemSuffix, profile });
  if (prepared.result) return prepared;
  // A fast-chain profile runs each provider step through this same function with that step's transport injected (explanation-fast-chain.js).
  if (!injected && prepared.profile?.roles.author.adapter === 'fast-chain') return generateWithFallbacks(env, input, { only, systemSuffix, repairs, title, profile: prepared.profile, figures }, generateArtifact);
  const baseCall = injected || loggedModel('artifact', planModel);
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
      // Owner 2026-11-08, DEV ONLY (SMALL_ENV dev or test, as auth.js testMode; never production): the author's visuals exactly as returned, before any server
      // step, so a benchmark can keep the model's own diagram specs. One line per answer: attempt 0 is the first answer, 1 the repair.
      if (id === 'explanation' && (env.SMALL_ENV === 'dev' || env.SMALL_ENV === 'test')) {
        const visuals = call.input?.visuals ?? null;
        // references: the ids of the worked examples this request carried (0-2), so the bench can split results by them (owner 2026-11-08).
        console.log(JSON.stringify({ event: 'explanation_author_raw', attempt, plan: input.plan ? { visuals: input.plan.visuals, depthTreatment: input.plan.depthTreatment, kind: input.plan.kind, fixed: input.plan.fixed, confidence: input.plan.confidence, flags: input.plan.flags, ms: input.plan.ms } : input.planned ? { planner: 'rules' } : null, references: (prepared.diagramReferences || []).map(r => r.id), visuals, kinds: Array.isArray(visuals) ? visuals.map(v => (v?.k === 'diagram' ? v?.spec?.diagram?.kind ?? null : v?.k ?? null)) : [] }));
      }
      // Owner 2026-11-09 hotfix: line breaks the author double-escaped (the two characters backslash and n) become real line breaks, in every string of the answer, first.
      if (id === 'explanation' && call.input) call = { ...call, input: literalBreaksDeep(call.input) };
      // EXPLANATION_FORMULA_SAMPLER=on: a plot series written as a formula and range gets its points here, before any other step reads the visuals.
      if (id === 'explanation' && formulaSamplerEnabled(env) && Array.isArray(call.input?.visuals)) call = { ...call, input: { ...call.input, visuals: fillFormulaSeries(call.input.visuals) } };
      // Owner M3 (2026-11-08): keys the schema does not declare are removed from the visuals before the card is read, logged and counted, never a repair.
      let keysStripped = 0;
      if (id === 'explanation' && Array.isArray(call.input?.visuals)) {
        const clean = stripUnknownKeys(call.input.visuals);
        for (const { kind, key } of clean.stripped) console.log(JSON.stringify({ event: 'explanation_unknown_key_stripped', kind, key }));
        keysStripped = clean.stripped.length;
        if (keysStripped) call = { ...call, input: { ...call.input, visuals: clean.visuals } };
      }
      let block, extraction, diagramsDropped = 0, diagramsSimplified = 0, questions, terms;
      if (input.imageSource) {
        const checked = checkImageExtraction(call.input, content => ({ result: artifactBlock(id, content) }), input.imageSource);
        if (checked.error) throw new Error(checked.error);
        if (checked.result.kind === 'clarify') return { result: 'clarification', question: checked.result.question };
        ({ extraction, ...block } = checked.result);
      } else if (id === 'explanation' && interactionsEnabled(env)) {
        const { questions: q, terms: t, ...card } = call.input ?? {};
        questions = q; terms = t; block = artifactBlock(id, card);
      } else block = artifactBlock(id, call.input);
      if (title && typeof block.title === 'string') block = { ...block, title };
      // CORE.09: the final title first, then the Depth's display-text budget and supported Mermaid, on every path that makes an explanation.
      // No repair left: an rh-diagram that cannot be drawn is dropped and the written explanation is delivered (the prose still passes its own checks).
      if (id === 'explanation') {
        const wanted = input.visualRequirements?.items?.length ? input.visualRequirements : null;
        // EXP-13 fix 1: extra visuals dropped, a wrong order of existing parts reordered, prose over the hard limit trimmed by whole sentences, before any check.
        const settled = settleExplanationBody(block.body, requiredMix(wanted));
        diagramsDropped = markdownVisuals(block.body).diagrams.length - markdownVisuals(settled).diagrams.length; // recorded with the result, as a dropped invalid diagram is
        block = { ...block, body: settled };
        // Item 47: flow rules the server can fix (a one-branch decision, separate starts, a closed loop, an over-long label) are fixed here, before any repair.
        const fixed = correctDiagrams(block.body), corrections = { ...fixed.corrections };
        block = { ...block, body: fixed.md };
        // EXP-13 fix 6a: repeat words in the question turn a branchless flow into a cycle (no call), unless the learner named another diagram kind.
        if (input.plan?.planner !== 'jev' && repeats(input.args) && [undefined, 'cycle'].includes(requiredMix(wanted)?.diagramKind)) block = { ...block, body: chainsAsCycles(block.body) };
        // Owner 2026-11-08: a straight flow whose every step is a message between 2-4 parties is drawn as a sequence (no call), unless the learner named another kind.
        if ([undefined, 'sequence'].includes(requiredMix(wanted)?.diagramKind)) {
          const seq = flowsAsSequences(block.body);
          if (seq.count) { block = { ...block, body: seq.md }; corrections.flow_to_sequence = seq.count; }
        }
        block = { ...block, body: plainTreesUnlessBinary(block.body, input.args) }; // owner check 2026-11-08: binary layout only for binary/heap/BST questions
        block = { ...block, body: relationshipsAsGraphs(block.body) }; // owner C1.1 2026-11-08: each relationship node drawn once
        if (attempt >= repairs) {
          let trimmed = dropInvalidDiagrams(block), fallback = null;
          // Owner 2026-11-08, a card should not fail: when dropping would leave the card no visual, each invalid diagram becomes a simpler valid one built from
          // its own labels (no model call); if none can be built the prose card is delivered without a visual. Recorded on the card as visualFallback
          // ('simplified' | 'dropped') for the benchmark; the learner sees no error.
          if (trimmed.dropped && !markdownVisuals(trimmed.block.body).diagrams.length && !markdownIllustrations(trimmed.block.body).length) {
            // Item 47: its kind from the learner's words (cycle, sequence, else flow); a diagram kind the learner named wins, so the required check still holds.
            const named = requiredMix(wanted)?.diagramKind;
            const simple = dropInvalidDiagrams(block, { simplify: true, prefer: ['flow', 'cycle', 'sequence'].includes(named) ? named : simplifiedKind(input) });
            // The simpler diagram must pass the card's own checks too (it may name nothing the prose names); if not, the prose card goes without it.
            if (simple.simplified && !explanationProblem(simple.block, input.depth, input.args)) { trimmed = simple; fallback = 'simplified'; } else fallback = 'dropped';          }
          // E1: only an OPTIONAL diagram may be dropped. With a required one, the drop stands only if the card still holds a valid diagram for each requirement
          // and no text points at the dropped figure; otherwise the card keeps its invalid diagram and fails the checks below, truthfully.
          if (trimmed.dropped && !requiredVisualProblem(trimmed.block, wanted)) {
            if (trimmed.dropped > trimmed.simplified) { const dangling = danglingFigureProblem(trimmed.block); if (dangling) throw new Error(dangling); }
            block = { ...trimmed.block, ...(fallback ? { visualFallback: fallback } : {}) }; diagramsDropped += trimmed.dropped - trimmed.simplified;
            if (trimmed.simplified) diagramsSimplified = trimmed.simplified;
            for (const kind of trimmed.kinds) corrections[`simplified_${kind}`] = (corrections[`simplified_${kind}`] || 0) + 1;
            if (trimmed.elements?.length) corrections.dropped_element = (corrections.dropped_element || 0) + trimmed.elements.length; // each one has its own explanation_diagram_dropped_element line
          }
        }
        // E2 + fix 1b: the questions and term anchors are read against the FINAL text (accepted title applied, diagrams settled); what is not valid is dropped, never repaired.
        const interactive = interactionsEnabled(env);
        if (interactive) ({ questions, terms } = keptInteractions(block, { questions, terms }));
        const problem = [explanationProblem(block, input.depth, input.args), requiredVisualProblem(block, wanted)].filter(Boolean).join(' '); if (problem) throw new Error(problem);
        if (wanted) block = { ...block, visualRequirements: boundRequirements(wanted) }; // saved provenance: what was asked for and that the card holds it
        block = { ...block, depth: validDepth(input.depth) || DEFAULT_DEPTH }; // E3: the budget this card was written to, so a later illustration caption is checked against it
        block = { ...block, proseLists: proseListCount(block.body) }; // owner 2026-11-08: lists are asked against, never checked; this counts them for measurement
        // Item 47: one log line per server correction this card's diagrams got, and their count on the card, so a rising count shows after a prompt change.
        for (const [kind, n] of Object.entries(corrections)) for (let i = 0; i < n; i++) console.log(JSON.stringify({ event: 'explanation_diagram_corrected', kind }));
        if (Object.keys(corrections).length) block = { ...block, diagramCorrections: corrections };
        if (keysStripped) block = { ...block, unknownKeysStripped: keysStripped };
        // Owner E3 (2026-11-08), log only: diagram text with bare maths (_, ^ or \ outside $...$), one line each and the count on the card; no repair yet.
        const smells = diagramSmells(block.body);
        for (const label of smells) console.log(JSON.stringify({ event: 'explanation_diagram_smell', kind: 'bare_maths', label: label.slice(0, 200) }));
        if (smells.length) block = { ...block, diagramSmells: { bare_maths: smells.length } };
        // EXP-13: the pictures; one that cannot be made loses its fence, never the card. It shows no text, so the anchors checked above still hold.
        // With figures.later (the /explain route) a picture still being made is returned pending and written into the saved card when it arrives (explanation-figures.js).
        block = await illustrateExplanation(env, block, { ...(figures || {}), early });
        if (interactive) block = { ...block, interactions: await bindInteractions(block, { questions, terms }) };
      }
      if (GATES[id]) block = GATES[id](block);
      if (id === 'animation' && env.LEARN_SCENE_VERIFIER !== 'off') { const problem = await verify(block); if (problem) throw new Error(problem); }
      if (contract(id).paid) return { result: 'paid_proposal', primitive: id, block, message: 'This uses paid generation.', estimatedCost: contract(id).estimatedCost ?? null, repaired: attempt > 0, ...(extraction ? { extraction } : {}) };
      return { result: 'artifact', primitive: id, block, repaired: attempt > 0, ...(diagramsDropped ? { diagramsDropped } : {}), ...(diagramsSimplified ? { diagramsSimplified } : {}), ...(extraction ? { extraction } : {}), ...(binding && id === 'explanation' ? { profile: binding } : {}) };
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
// waitUntil (the Worker's ctx.waitUntil): a written Explanation's pictures finish after the card is answered (owner 2026-11-08); omitted, the card waits for them.
export async function artifactFetch(req, env, generate = generateArtifact, { images = tutorImageContext, identity = null, sourceRef = null, waitUntil = null } = {}) {
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
    if (body.depth !== undefined && !validDepth(body.depth)) throw new Error('depth must be brief, balanced or detailed'); // R2: an explicit Depth the server does not know is refused, never normalized
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
  // saved Depth for that exact canvas. No board named is Balanced: there is no fallback to the main board. Commands that make no
  // explanation (DEPTH_COMMANDS) get none, whatever was sent.
  const depth = !DEPTH_COMMANDS.includes(body.command) ? DEFAULT_DEPTH : body.depth !== undefined ? validDepth(body.depth)
    : await readDepth(env, { org: access.org, userId: access.user_id, app: body.app, board: typeof body.board === 'string' ? body.board : null });
  let celeris = null; // DEV ONLY (explain-celeris-dev.js): declared outside the try so a refused request can still report what the route saw
  try {
    // E1: what the learner explicitly asked the written card to contain, read from their own words on the server; a picture the library does not draw is told now, before any call.
    const visuals = body.command === 'explanation' ? deriveVisualRequirements(requirementText({ args: body.args })) : null;
    if (visuals?.unsupported) { await giveBack(); return json({ result: 'unsupported', message: visuals.unsupported }); }
    celeris = celerisExplainRoute(env, body.command); // DEV ONLY (explain-celeris-dev.js): off unless a dev or test Worker turns it on; production never takes it
    // EXP-13: a picture the card asks for is kept as a file source of the board's owner (as an image job keeps its output), read only when the card has one; the
    // board named is where a picture that arrives after the card is written (explanation-figures.js fillSavedCard).
    const board = typeof body.board === 'string' ? body.board : 'main';
    const store = async () => {
      const { boardOwner, ownerRow } = await import('./learn-boards.js');
      const owner = await boardOwner(req, env, body.app);
      if (owner instanceof Response || !owner?.org || !owner?.email) return null;
      const row = await ownerRow(env, owner, body.app, board).catch(() => null);
      return { org: owner.org, email: owner.email, app: body.app, board, boardId: row?.id ?? null };
    };
    const out = await generate(env, { command: body.command, args: body.args || '', selection: body.selection || null, context: body.context || null, ...(documents.length ? { documents } : {}), ...(depth !== DEFAULT_DEPTH ? { depth } : {}), ...(visuals?.items.length ? { visualRequirements: visuals } : {}) }, { ...celeris?.options, figures: { store, ...(waitUntil ? { later: waitUntil } : {}) } });
    // Owner 2026-11-08: a new Explanation's collapsed-preview summary is written by the server after delivery, into the saved card (explanation-summary.js summarizeSaved); the card carries
    // summaryPending: <token> until it lands. Only where the route has waitUntil (the same place a late picture is written).
    if (out?.result === 'artifact' && out.block?.type === 'explanation' && waitUntil && !out.block.summary) {
      const token = crypto.randomUUID().replaceAll('-', '').slice(0, 20), { summarizeSaved } = await import('./explanation-summary.js');
      out.block = { ...out.block, summaryPending: token };
      waitUntil(summarizeSaved(env, { block: out.block, token, app: body.app, org: access.org, identity: { userId: access.user_id || access.email }, store }).catch(() => {}));
    }
    noteUsageResult(env, out?.result === 'validation_error' ? 'none' : 'full'); // usage accounting: a rejected artifact delivered nothing
    if (out?.result !== 'artifact' && out?.result !== 'paid_proposal') await giveBack();
    const done = celeris ? { ...out, devModel: celeris.served() } : out;
    return json(passage && done?.block ? { ...done, block: { ...done.block, sourceRef: passage } } : done);
  }
  catch (error) { await giveBack(); return json({ error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.attempts ? { attempts: error.attempts } : {}), ...(celeris ? { devModel: celeris.served() } : {}) }, 502); } // code/attempts: the fast chain's failure reason and steps
}
