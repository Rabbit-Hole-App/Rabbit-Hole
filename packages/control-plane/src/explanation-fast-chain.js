// The 'fast-chain' adapter of the written /explain model profiles (explanation-models.js cerebras-low|medium|high, owner 2026-11-08): a written card must
// not fail, and it must be fast. The author call runs on Cerebras gpt-oss-120b; when that step fails (HTTP 429 or 5xx, a timeout, a malformed or
// schema-invalid answer still invalid after its one repair) the SAME request runs on Fireworks gpt-oss-120b, then on Gemini gemini-3.5-flash-lite. Never
// the plan model (Opus). A step whose credential is not set on this server is skipped. Each step is the real generateArtifact (validation, the one repair,
// the saved card) with this step's transport injected, so every step's calls are admitted, priced and settled by spendTransport like any paid call.
// EXPLANATION_FALLBACK=off (benchmarks: a fallback is a failure) runs the profile's own provider only, and its failure is reported as one.
// The request (stepRequest): the system prompt plus the make_explanation tool description (EXPLANATION_GUIDANCE, this Depth's explanationTarget and, when
// on, INTERACTION_GUIDANCE, verbatim) as the system message; the user JSON (learner request, Depth, required visuals) and any text context documents as
// the user message; the tool's own input_schema as a strict json_schema (exclusive oneOf sent as anyOf: Cerebras refuses oneOf with HTTP 400). The body
// is free Markdown, so the author writes any rh-diagram or rh-illustration fence where it belongs (explain.md "Card layout v2").
import { loggedModel } from './learn-models.js';
import { spendTransport } from './learn-spend.js';
import { exclusiveOneOfToAnyOf } from './interact-model-adapters.js';
import { chainSteps } from './explanation-models.js';

export const FALLBACK_SETTING = 'EXPLANATION_FALLBACK';
// Per-call deadlines (owner target: the whole card in 1-4 s). Cerebras answered the 2026-11-07 benchmark's whole card at p90 1.8 s, so a call still open
// at 6 s (over 3x that) is better abandoned for the next step than awaited. Fireworks (8 s) is unmeasured here; Gemini, the last step, gets 12 s because a
// late card beats no card. Worst case, every step timing out on its call and its repair: 2 x (6 + 8 + 12) = 52 s.
export const CHAIN_ENDPOINTS = Object.freeze({
  cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', deadlineMs: 6000 },
  fireworks: { url: 'https://api.fireworks.ai/inference/v1/chat/completions', deadlineMs: 8000 },
  google: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', deadlineMs: 12000 },
});
const TOOL = 'make_explanation';
const ADDENDUM = `
Answer format for this request (it replaces the tool call): reply with exactly one JSON object, the ${TOOL} input described above, matching the response schema. Write body as Markdown, with any fenced block the guidance asks for written inside the body string where it belongs.`;

const failure = (name, code, message, extra = {}) => Object.assign(new Error(message), { name, code, ...extra });
export const providerBusy = () => failure('ProviderBusyError', 'provider_busy', 'The explanation model is busy right now, so nothing was added and no credits were used. Try again in a few seconds.', { retryable: true });
const timedOut = () => failure('ProviderTimeoutError', 'provider_timeout', 'The explanation took too long to write, so nothing was added. Try again.', { retryable: true });
// The same for every step, so the chain stops: the request itself cannot be sent.
const final = (code, message) => failure('ExplanationChainError', code, message, { final: true });

// Anthropic content -> plain text. Text and text documents only: an image or a PDF is refused before anything is sent, never dropped.
const textOf = content => (typeof content === 'string' ? content : content.map(part => {
  if (part.type === 'text') return part.text;
  if (part.type === 'document' && part.source?.type === 'text') return `<document title=${JSON.stringify(String(part.title || ''))}>\n${part.source.data}\n</document>`;
  if (part.type === 'tool_use') return JSON.stringify(part.input ?? {});
  if (part.type === 'tool_result') return `${typeof part.content === 'string' ? part.content : textOf(part.content || [])} Reply with the complete corrected JSON object.`;
  throw final('input_unsupported', 'The explanation model reads text only, and this request has an image or a PDF, so nothing was sent or charged.');
}).join('\n\n'));

export function stepRequest(step, effort, body) {
  const tool = body.tools?.find(t => t.name === TOOL);
  if (!tool) throw final('tool_unsupported', `The fast explanation chain makes only ${TOOL}.`);
  // ponytail: ask_clarifying_question is not offered in json_schema mode; the author always writes the card.
  const system = [].concat(body.system ?? []).map(b => (typeof b === 'string' ? b : b.text)).join('\n');
  return { model: step.model, stream: false, max_tokens: body.max_tokens, reasoning_effort: effort,
    messages: [{ role: 'system', content: `${system}\n\n${tool.description}\n${ADDENDUM}` }, ...body.messages.map(m => ({ role: m.role, content: textOf(m.content) }))],
    response_format: { type: 'json_schema', json_schema: { name: TOOL, strict: true, schema: exclusiveOneOfToAnyOf(tool.input_schema) } } };
}

// OpenAI-shaped reply -> the Anthropic shape generateArtifact and spend settlement read. An unreadable answer is an empty input: the validator names what
// is missing and that goes to the step's one repair. Output is the larger of completion_tokens and total - prompt, so a provider that leaves thinking
// out of completion_tokens (unverified for Gemini's OpenAI-compatible usage) is still charged for it.
export function anthropicReply(json, id) {
  const choice = json?.choices?.[0], u = json?.usage;
  let input = {}; try { input = JSON.parse(choice?.message?.content ?? ''); } catch { /* see above */ }
  const output = Number.isSafeInteger(u?.completion_tokens) ? Math.max(u.completion_tokens, Number.isSafeInteger(u?.total_tokens) && Number.isSafeInteger(u?.prompt_tokens) ? u.total_tokens - u.prompt_tokens : 0) : undefined;
  return { model: json?.model ?? null, stop_reason: choice?.finish_reason === 'length' ? 'max_tokens' : 'tool_use',
    usage: { input_tokens: u?.prompt_tokens, output_tokens: output },
    content: [{ type: 'tool_use', id, name: TOOL, input: input && typeof input === 'object' && !Array.isArray(input) ? input : {} }] };
}

// One step's callModel(env, body, model, org). seen collects what the provider said it served and whether the chain must stop.
export function stepCall(step, effort, seen = {}) {
  const { url, deadlineMs } = CHAIN_ENDPOINTS[step.provider];
  let calls = 0;
  return async (env, body, _model, org) => {
    if (env.SUBSCRIPTION_ONLY === 'true') throw final('subscription_only', 'Subscription mode runs only the subscription model, so the explanation model was not called.');
    const request = stepRequest(step, effort, body);
    const id = `${step.provider}_${++calls}`;
    let late = false;
    // The admission bounds and reserves the request actually sent; the transport hands settlement the Anthropic-shaped usage it prices.
    const response = await spendTransport(env, request, step.model, org, async () => {
      const abort = new AbortController(), timer = setTimeout(() => { late = true; abort.abort(); }, deadlineMs);
      try {
        const sent = await fetch(url, { method: 'POST', signal: abort.signal, headers: { Authorization: `Bearer ${env[step.credentialRef]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
        if (!sent.ok) return sent;
        const json = await sent.json();
        seen.model = typeof json?.model === 'string' ? json.model : null;
        return Response.json(anthropicReply(json, id));
      } finally { clearTimeout(timer); }
    }, { provider: step.provider }).catch(error => { throw late ? timedOut() : error; }); // a timed-out call keeps its reservation: it may have been billed
    if (response.ok) return response;
    const refused = await response.clone().json().catch(() => null);
    if (['spend_limited', 'allowance_limited'].includes(refused?.code)) { seen.final = true; return response; } // our own admission refusal: generateArtifact says why
    console.warn('explanation provider error', step.provider, response.status, String(refused?.error?.message ?? refused?.message ?? '').slice(0, 300), JSON.stringify({ model: step.model }));
    if (response.status === 429) throw providerBusy();
    return response; // generateArtifact turns it into its one-line error, and the chain moves on
  };
}

// generateArtifact's fast-chain path. generate is generateArtifact itself (passed in, so this module does not import learn-artifact.js); each step gets
// its transport injected, which also keeps it from re-entering this chain. -> the first step's card, with block.authoredBy { provider, model } saying which
// provider and served model wrote it, or the last step's failure (its validation_error, or its thrown error). Either way `attempts` lists every step:
// { provider, model, outcome: 'artifact' | 'skipped' | a reason code } (on a thrown error, error.attempts), and a failure carries its reason code.
export async function generateWithFallbacks(env, input, options, generate) {
  const role = options.profile.roles.author;
  const steps = env[FALLBACK_SETTING] === 'off' ? chainSteps(role).slice(0, 1) : chainSteps(role);
  const attempts = [];
  let last = null;
  for (const step of steps) {
    const note = outcome => { attempts.push({ provider: step.provider, model: step.model, outcome }); console.log(JSON.stringify({ event: 'explanation_step', ...attempts.at(-1) })); };
    if (!env[step.credentialRef]) { note('skipped'); continue; }
    const seen = {};
    let out = null;
    try { out = await generate(env, input, { ...options, callModel: loggedModel('artifact', stepCall(step, role.settings.reasoning_effort, seen)) }); }
    catch (error) {
      last = Object.assign(error, { code: error.code || 'provider_error' });
      note(last.code);
      if (error.final || seen.final) break;
      continue;
    }
    if (out.result === 'artifact') { note('artifact'); return { ...out, block: { ...out.block, authoredBy: { provider: step.provider, model: seen.model || step.model } }, attempts }; }
    if (out.result !== 'validation_error') return { ...out, attempts }; // a plan refusal or a question back is not a provider failure
    last = { ...out, reason: 'validation_error' };
    note('validation_error');
  }
  if (last instanceof Error) throw Object.assign(last, { attempts });
  return last ? { ...last, attempts } : { result: 'unsupported', message: 'Explanations are not set up on this server yet, so nothing was sent or charged.', reason: 'credential_missing', attempts };
}
