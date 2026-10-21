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
import { contextDocumentBlocks } from './learn-context-docs.js';
import { PRIMITIVES, isReady, artifactBlock } from './learn-primitives.js';
import { planModel } from './ask.js';
import { LEARN_TASKS, ARTIFACT_REPAIRS, loggedModel, notConfiguredMessage } from './learn-models.js';
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { IMAGE_EXTRACTION_SYSTEM, imageExtractionTool, checkImageExtraction } from './inline-image-extraction.js';
import { SCENE_AUTHORING } from './agents/learn-scene-author.js';
import { calculationProblem, cardAtSettings, sceneProblem, withDataSizes, withSamplesNote } from './learn-scene-gates.js';
import { VERIFY_SYSTEM, VERIFY_TOOL, verifyMessage } from './agents/learn-scene-verify.js';

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
export { ARTIFACT_SYSTEM };

// What a command resolves to before any model runs. `ready` is the command's
// family (after /practice narrowing) intersected with what can be generated.
export function artifactPlan(command, { args = '', selection = null } = {}) {
  const request = learnRequest(command, { args, selection });
  if (request.deterministic) return { result: 'direct', action: request.action };
  if (!request.allowedPrimitives) return { result: 'not_artifact', error: `/${command} is answered in chat, not as an artifact.` };
  const ready = request.allowedPrimitives.filter(isReady);
  if (!ready.length) {
    const reason = request.allowedPrimitives.map(id => PRIMITIVES[id]?.unavailable).find(Boolean);
    return { result: 'unsupported', message: reason || `/${command} isn't available yet.` };
  }
  return { request, ready };
}

export async function generateArtifact(env, input, { callModel = loggedModel('artifact', planModel) } = {}) {
  const plan = artifactPlan(input.command, input);
  if (plan.result) return plan;
  const { request, ready } = plan;
  const tools = [...ready.map(id => ({
    name: toolName(id),
    description: `${PRIMITIVES[id].about}${lengths(PRIMITIVES[id].schema)}${contract(id).paid ? ' Paid: it is proposed to the learner, who confirms before anything is generated.' : ''}${CONTRACTS[id] || ''}`,
    input_schema: PRIMITIVES[id].schema,
  })).map(tool => input.imageSource ? imageExtractionTool(tool) : tool), CLARIFY];
  const text = JSON.stringify({ command: `/${request.command}`, request: request.prompt, learnerText: input.args || '', selection: request.selection, context: input.context || null });
  // The canvas's switched-on context documents come first (canvas-context-docs.md), then the request.
  const messages = [{ role: 'user', content: input.documents?.length ? [...input.documents, { type: 'text', text }] : text }];
  // The task's cap, or a longer one a primitive on offer needs (the interactive scene's 16,000); spend admission bounds it.
  const maxTokens = Math.max(LEARN_TASKS.artifact.maxTokens, ...ready.map(id => PRIMITIVES[id].maxTokens || 0));
  const ask = async (history, kind) => {
    const response = await callModel(kind ? withAttemptKind(env, kind) : env, { max_tokens: maxTokens, system: input.imageSource ? `${ARTIFACT_SYSTEM}\n${IMAGE_EXTRACTION_SYSTEM}` : ARTIFACT_SYSTEM, tools, tool_choice: { type: 'any', disable_parallel_tool_use: true }, messages: history }, LEARN_TASKS.artifact.model, null);
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
      let block, extraction;
      if (input.imageSource) {
        const checked = checkImageExtraction(call.input, content => ({ result: artifactBlock(id, content) }), input.imageSource);
        if (checked.error) throw new Error(checked.error);
        if (checked.result.kind === 'clarify') return { result: 'clarification', question: checked.result.question };
        ({ extraction, ...block } = checked.result);
      } else block = artifactBlock(id, call.input);
      if (GATES[id]) block = GATES[id](block);
      if (id === 'animation' && env.LEARN_SCENE_VERIFIER !== 'off') { const problem = await verify(block); if (problem) throw new Error(problem); }
      if (contract(id).paid) return { result: 'paid_proposal', primitive: id, block, message: 'This uses paid generation.', estimatedCost: contract(id).estimatedCost ?? null, repaired: attempt > 0, ...(extraction ? { extraction } : {}) };
      return { result: 'artifact', primitive: id, block, repaired: attempt > 0, ...(extraction ? { extraction } : {}) };
    } catch (error) {
      // Which check refused which attempt: the validator's words only, never the spec (a repair's cause is otherwise invisible).
      console.log(JSON.stringify({ event: 'learn_artifact_invalid', primitive: id || null, attempt, error: String(error.message).slice(0, 300) }));
      if (error.cause === VERIFIER) throw error; // the check could not run: nothing for the model to repair
      if (input.imageSource || attempt >= ARTIFACT_REPAIRS) return { result: 'validation_error', primitive: id || null, error: error.message };
      ({ result, call } = await ask([...messages, { role: 'assistant', content: result.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `Validation failed: ${error.message}. Return the complete corrected input with one of the same tools. This is the only correction attempt.` }] }], 'repair'));
    }
  }
}

// The verifier pass (owner, 2026-10-21): a scene that passed the gates is read back setting by setting by a second call,
// through the same spend admission; a statement it reports goes to the one repair, and a scene still reported is no card.
// LEARN_SCENE_VERIFIER=off turns it off.
export async function sceneVerdict(env, callModel, request, block) {
  const response = await callModel(withAttemptKind(env, 'evaluation'), { max_tokens: VERIFY_MAX_TOKENS, system: VERIFY_SYSTEM, tools: [VERIFY_TOOL],
    tool_choice: { type: 'any', disable_parallel_tool_use: true },
    messages: [{ role: 'user', content: verifyMessage({ request, title: block.title, calculation: block.calculation, card: cardAtSettings(block.scene) }) }] }, LEARN_TASKS.artifact.model, null);
  const refused = response.status === 429 ? (await response.clone().json().catch(() => null)) : null;
  if (refused?.code === 'spend_limited' && refused.error) throw new Error(refused.error, { cause: VERIFIER });
  if (!response.ok) throw new Error(`The interactive explanation could not be checked (model HTTP ${response.status}), so nothing was added. Try again.`, { cause: VERIFIER });
  const problems = (await response.json()).content?.find(part => part.type === 'tool_use' && part.name === VERIFY_TOOL.name)?.input?.problems;
  if (!Array.isArray(problems)) throw new Error('The interactive explanation could not be checked (the check gave no verdict), so nothing was added. Try again.', { cause: VERIFIER });
  return problems.length ? `A check of the card found statements that are false: ${problems.map((problem, i) => `${i + 1}) ${problem.setting ? `with ${problem.setting}, ` : ''}"${problem.object}" says "${problem.says}": ${problem.wrong}`).join(' ')}` : null;
}

// POST /api/learn/artifact {app, command, args, selection, context}. Any
// family or allowedPrimitives in the body is ignored: the command decides.
export async function artifactFetch(req, env, generate = generateArtifact) {
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
  } catch (error) { return json({ error: error.message }, 400); }
  const access = await authorizedBoardApp(req, env, body.app, body.pending);
  if (access instanceof Response) return access;
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  let documents;
  try { documents = await contextDocumentBlocks(env, access); } catch (error) { return json({ error: `Context documents: ${error.message}` }, 502); }
  try {
    const out = await generate(env, { command: body.command, args: body.args || '', selection: body.selection || null, context: body.context || null, ...(documents.length ? { documents } : {}) });
    noteUsageResult(env, out?.result === 'validation_error' ? 'none' : 'full'); // usage accounting: a rejected artifact delivered nothing
    return json(out);
  }
  catch (error) { return json({ error: error.message }, 502); }
}
