// The 'fast-chain' adapter of the written /explain model profiles (explanation-models.js fireworks-* and cerebras-*, owner 2026-11-08): a written card must
// not fail, and it must be fast. Production (fireworks-low) runs the author call on Fireworks gpt-oss-120b; when that step fails (HTTP 429 or 5xx, a
// timeout, a malformed or schema-invalid answer still invalid after its one repair) the SAME request runs on Gemini gemini-3.5-flash-lite. Cerebras is
// never a fallback step (owner, 2026-11-08); a cerebras-* profile, chosen on its own, runs Cerebras, then Fireworks, then Gemini. Never the plan model (Opus). A step whose credential is not set on this server is skipped. Each step is the real generateArtifact (validation, the one repair,
// the saved card) with this step's transport injected, so every step's calls are admitted, priced and settled by spendTransport like any paid call.
// EXPLANATION_FALLBACK=off (benchmarks: a fallback is a failure) runs the profile's own provider only, and its failure is reported as one.
// The request (stepRequest): the system prompt plus the make_explanation tool description (EXPLANATION_GUIDANCE, this Depth's explanationTarget and, when
// on, INTERACTION_GUIDANCE, verbatim) as the system message; the user JSON (learner request, Depth, required visuals) and any text context documents as
// the user message; the tool's own input_schema as a strict json_schema (exclusive oneOf sent as anyOf: Cerebras refuses oneOf with HTTP 400). The visuals
// are fields before the body, placed in it by markers (explain.md "Card layout v2", fix 2).
// EXP-13 fix 3 (owner 2026-11-08): the author call is streamed (OpenAI-compatible SSE) and read as it arrives; each complete picture in visuals starts its
// Recraft generation at once (explanation-figures.js figureStarter), while the rest of the answer is still being written. The whole answer is then
// validated as before, and the card waits for every picture it started. EXPLANATION_STREAM=off sends stream:false and starts pictures after validation.
import { loggedModel } from './learn-models.js';
import { figureStarter } from './explanation-figures.js';
import { authorPicture, parseIllustration } from './learn-primitives.js';
import { spendTransport } from './learn-spend.js';
import { exclusiveOneOfToAnyOf } from './interact-model-adapters.js';
import { chainSteps } from './explanation-models.js';
import { NEW_KINDS, REFERENCE_MARK, bundledAuthorSchema, listForm } from './explanation-references.js';

export const FALLBACK_SETTING = 'EXPLANATION_FALLBACK';
export const STREAM_SETTING = 'EXPLANATION_STREAM';
const streaming = env => env?.[STREAM_SETTING] !== 'off';
// Per-call deadlines (owner target: the whole card in 1-4 s). Cerebras answered the 2026-11-07 benchmark's whole card at p90 1.8 s, so a call still open
// at 6 s (over 3x that) is better abandoned for the next step than awaited. Fireworks (8 s) is unmeasured here; Gemini, the last step, gets 12 s because a
// late card beats no card. Worst case, every step timing out on its call and its repair: 2 x (6 + 8 + 12) = 52 s.
export const CHAIN_ENDPOINTS = Object.freeze({
  cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', deadlineMs: 6000 },
  fireworks: { url: 'https://api.fireworks.ai/inference/v1/chat/completions', deadlineMs: 8000 },
  // Usage while streaming: Fireworks sends a final usage chunk by default ("Fireworks includes a final SSE chunk carrying usage totals by default",
  // docs.fireworks.ai post-chatcompletions, read 2026-11-08) and Cerebras's streaming example ends with a usage block (inference-docs.cerebras.ai, read
  // 2026-11-08; stream_options is not in its schema, so it is not sent there); Gemini's OpenAI-compatible example asks with stream_options.include_usage.
  // A stream that reports no usage settles as unknown cost, its reservation kept, as a missing usage does today.
  google: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', deadlineMs: 12000, streamOptions: { include_usage: true } },
});
const TOOL = 'make_explanation';
const ADDENDUM = `
Answer format for this request (it replaces the tool call): reply with exactly one JSON object, the ${TOOL} input described above, matching the response schema.`;

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

// Gemini compiles the response schema into a state machine and refuses one past its limits with HTTP 400 INVALID_ARGUMENT ("Request contains an invalid
// argument.", every fallback call of 2026-11-08): "Array bounds such as minItems and maxItems duplicate the item schema for each counted" position, and
// numeric bounds add states. Its advice, followed for the Gemini step only: drop array and numeric bounds and enforce them in application code
// (https://aistudio.google.com/docs/structured-output, read 2026-11-08). Bisected the same day: the TutorDiagram schema is accepted once maxItems alone is
// dropped; minimum/maximum go too, for headroom. Our validator still enforces every bound on the answer, and a violation goes to the step's one repair.
const BOUNDS = new Set(['minItems', 'maxItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']);
// names: o is a properties map (its keys are field names, never keywords).
export const withoutBounds = (o, names = false) => (Array.isArray(o) ? o.map(s => withoutBounds(s)) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).filter(([k]) => names || !BOUNDS.has(k)).map(([k, v]) => [k, withoutBounds(v, !names && k === 'properties')])) : o);
// Phase 02 diagram library (2026-11-08): the 21-kind schema is refused again with the same HTTP 400, bounds dropped or not. Bisected with real calls that day:
// the refusal follows the schema's structure, not its characters or string constraints (accepted at 362 properties, refused at 368 even with every pattern
// and length removed), and the child diagrams inside comparison panels and visual transformations are two thirds of it. So the Gemini step also gets
// comparison and transformation in their list forms only, and the four new kinds only when the learner's request names one (its requiredVisuals): 303
// properties, accepted. Every step already gets its request's schema bundle (learn-artifact.js, explanation-references.js bundledAuthorSchema); this
// reduction comes on top for Gemini only, because the largest bundle without it is past that limit. The validator accepts every kind from any step.
const NEW = new Set(NEW_KINDS);
const requiredKinds = body => { const first = [].concat(body.messages?.[0]?.content ?? []).map(p => (typeof p === 'string' ? p : p?.text)).filter(Boolean).at(-1);
  try { return new Set((JSON.parse(first).requiredVisuals ?? []).map(v => v.diagramKind).filter(Boolean)); } catch { return new Set(); } };
export const forGemini = (o, keep = new Set()) => {
  if (Array.isArray(o)) return o.filter(b => !NEW.has(b?.properties?.kind?.const) || keep.has(b.properties.kind.const)).map(s => forGemini(s, keep));
  if (!o || typeof o !== 'object') return o;
  if (['comparison', 'transformation'].includes(o.properties?.kind?.const)) return listForm(o);
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, forGemini(v, keep)]));
};

// The recorded Gemini request accepts up to 362 properties. Scoped
// illustration bundles fit. If a broader schema exceeds that size, preserve
// the legacy kinds and explicitly requested illustrations.
const GEMINI_PROPERTY_LIMIT = 362;
function schemaProperties(schema) {
  if (!schema || typeof schema !== 'object') return 0;
  return Object.keys(schema.properties ?? {}).length + Object.values(schema).reduce((count, child) => count + schemaProperties(child), 0);
}
function geminiRequestSchema(schema, keep) {
  const reduced = forGemini(withoutBounds(schema), keep);
  if (schemaProperties(reduced) <= GEMINI_PROPERTY_LIMIT) return reduced;
  return bundledAuthorSchema(reduced, {
    quant: true, fresh: true,
    tensor: keep.has('tensor'), tokenLinks: keep.has('token-links'), blockStack: keep.has('block-stack'),
  });
}

// Sampling (owner item 47, 2026-11-08): the author call is greedy, temperature 0, so the same request gives the same card. A fixed seed is sent only where the
// provider documents it: Fireworks ("Random seed for deterministic sampling", https://docs.fireworks.ai/api-reference/post-chatcompletions) and Cerebras ("make a
// best effort to sample deterministically", https://inference-docs.cerebras.ai/api-reference/chat-completions); Gemini's OpenAI-compatible page
// (https://aistudio.google.com/docs/openai) lists no seed, so none is sent there. All read 2026-11-08. The repair's input already differs (it carries the
// validator's problem in a tool_result), and it samples at 0.3 with no seed anyway, so a repeat of a wrong answer cannot be forced by the sampler: low enough
// to stay on the corrected task, not greedy.
export const AUTHOR_TEMPERATURE = 0, REPAIR_TEMPERATURE = 0.3, AUTHOR_SEED = 7;
const SEEDED = new Set(['fireworks', 'cerebras']);
const isRepair = body => body.messages.some(m => Array.isArray(m.content) && m.content.some(part => part.type === 'tool_result'));
// The system message a fast-chain step sends (owner M2, 2026-11-08): the system prompt, the tool guidance, then the diagram references (they differ per
// question, so they come last and the rest stays one cached prefix), then the answer format. The benchmark's promptHash hashes this same text.
export function assembledSystem(body, tool = body.tools?.find(t => t.name === TOOL)) {
  const system = [].concat(body.system ?? []).map(b => (typeof b === 'string' ? b : b.text)).join('\n');
  const at = system.indexOf(REFERENCE_MARK), head = at < 0 ? system : system.slice(0, at), refs = at < 0 ? '' : system.slice(at).trim();
  return `${head}\n\n${tool?.description ?? ''}${refs ? `\n${refs}` : ''}\n${ADDENDUM}`;
}
export function stepRequest(step, effort, body, stream = false) {
  const tool = body.tools?.find(t => t.name === TOOL);
  if (!tool) throw final('tool_unsupported', `The fast explanation chain makes only ${TOOL}.`);
  // ponytail: ask_clarifying_question is not offered in json_schema mode; the author always writes the card.
  const system = assembledSystem(body, tool);
  const options = stream && CHAIN_ENDPOINTS[step.provider]?.streamOptions;
  const schema = exclusiveOneOfToAnyOf(tool.input_schema);
  // Owner 2026-11-08: Gemini's author call takes the provider default temperature (Google's guidance for the 3.x models is to leave it at the default), not 0; its OpenAI-compatible
  // endpoint documents no seed, so none is sent: the Gemini author call carries neither. The repair stays at 0.3 on every provider.
  const sampling = isRepair(body) ? { temperature: REPAIR_TEMPERATURE } : step.provider === 'google' ? {} : { temperature: AUTHOR_TEMPERATURE, ...(SEEDED.has(step.provider) ? { seed: AUTHOR_SEED } : {}) };
  return { model: step.model, stream, ...(options ? { stream_options: options } : {}), max_tokens: body.max_tokens, reasoning_effort: effort, ...sampling,
    messages: [{ role: 'system', content: system }, ...body.messages.map(m => ({ role: m.role, content: textOf(m.content) }))],
    response_format: { type: 'json_schema', json_schema: { name: TOOL, strict: true, schema: step.provider === 'google' ? geminiRequestSchema(schema, requiredKinds(body)) : schema } } };
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

// Fix 3: the streamed JSON read incrementally. -> feed(text): onVisual(item, index) is called once for each top-level visuals[i] object as soon as its
// closing brace arrives (the schema puts visuals before body). Strings and escapes are tracked, so a brace inside text is not structure.
export function visualScanner(onVisual) {
  let text = '', i = 0, depth = 0, inString = false, escaped = false, stringStart = 0, lastString = '', key = null, inVisuals = false, itemStart = -1, n = 0;
  return chunk => {
    text += chunk;
    for (; i < text.length; i++) {
      const c = text[i];
      if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') { inString = false; lastString = text.slice(stringStart, i + 1); } continue; }
      if (c === '"') { inString = true; stringStart = i; }
      else if (c === ':' && depth === 1) { try { key = JSON.parse(lastString); } catch { key = null; } }
      else if (c === '{' || c === '[') { depth++; if (depth === 2 && c === '[' && key === 'visuals') inVisuals = true; else if (inVisuals && depth === 3 && c === '{') itemStart = i; }
      else if (c === '}' || c === ']') {
        if (inVisuals && depth === 3 && c === '}' && itemStart >= 0) { let item = null; try { item = JSON.parse(text.slice(itemStart, i + 1)); } catch { /* not an object after all */ } itemStart = -1; if (item) onVisual(item, n++); }
        if (depth === 2 && c === ']') inVisuals = false;
        depth--;
      }
    }
  };
}

// An OpenAI-compatible SSE stream -> the same JSON a stream:false call returns ({ model, choices: [{ finish_reason, message: { content } }], usage }), with
// every content delta also passed to onText as it arrives.
async function readStream(response, onText) {
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = '', content = '', model = null, finish = null, usage, done = false;
  const take = data => {
    if (data === '[DONE]') { done = true; return; }
    let chunk; try { chunk = JSON.parse(data); } catch { return; }
    if (typeof chunk?.model === 'string') model = chunk.model;
    if (chunk?.usage) usage = chunk.usage;
    const choice = chunk?.choices?.[0];
    if (choice?.finish_reason) finish = choice.finish_reason;
    const delta = choice?.delta?.content;
    if (typeof delta === 'string' && delta) { content += delta; onText(delta); }
  };
  while (!done) {
    const { value, done: ended } = await reader.read();
    if (ended) break;
    pending += decoder.decode(value, { stream: true });
    const events = pending.split(/\r?\n\r?\n/); pending = events.pop();
    for (const event of events) take(event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n'));
  }
  if (pending.trim()) take(pending.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n'));
  return { model, choices: [{ finish_reason: finish, message: { content } }], ...(usage ? { usage } : {}) };
}

// One step's callModel(env, body, model, org). seen collects what the provider said it served and whether the chain must stop.
// onVisual(item, index): each streamed visuals[i] as it completes (fix 3); omitted, or EXPLANATION_STREAM=off, nothing is read early.
export function stepCall(step, effort, seen = {}, onVisual = null) {
  const { url, deadlineMs } = CHAIN_ENDPOINTS[step.provider];
  let calls = 0;
  return async (env, body, _model, org) => {
    if (env.SUBSCRIPTION_ONLY === 'true') throw final('subscription_only', 'Subscription mode runs only the subscription model, so the explanation model was not called.');
    const request = stepRequest(step, effort, body, streaming(env));
    const id = `${step.provider}_${++calls}`;
    let late = false;
    // The admission bounds and reserves the request actually sent; the transport hands settlement the Anthropic-shaped usage it prices.
    const response = await spendTransport(env, request, step.model, org, async () => {
      const abort = new AbortController(), timer = setTimeout(() => { late = true; abort.abort(); }, deadlineMs);
      try {
        const sent = await fetch(url, { method: 'POST', signal: abort.signal, headers: { Authorization: `Bearer ${env[step.credentialRef]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
        if (!sent.ok) return sent;
        // A provider that answers a streamed request with one JSON body is read as before.
        const json = sent.headers.get('content-type')?.includes('text/event-stream') ? await readStream(sent, onVisual ? visualScanner(onVisual) : () => {}) : await sent.json();
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
  // Fix 3: one starter for the whole chain, so a later step or a repair that keeps a picture's prompt reuses its picture.
  const early = options.figures && streaming(env) ? figureStarter(env, options.figures) : null;
  // Only a picture the server will keep starts: among the first three visuals and the first two pictures (learn-primitives.js settleExplanationBody).
  let pictures = 0;
  const onVisual = early ? (item, i) => { if (i === 0) pictures = 0; /* each streamed answer counts its own */ const spec = i < 3 && pictures < 2 ? authorPicture(item, i) : null; if (spec && parseIllustration(JSON.stringify(spec)).ok) { pictures++; early.start(spec); } } : null;
  try { return await runSteps(); } finally { await early?.settled(); } // every started picture is settled, card or not, before the request ends
  async function runSteps() {
  for (const step of steps) {
    const note = outcome => { attempts.push({ provider: step.provider, model: step.model, outcome }); console.log(JSON.stringify({ event: 'explanation_step', ...attempts.at(-1) })); };
    if (!env[step.credentialRef]) { note('skipped'); continue; }
    const seen = {};
    let out = null;
    try { out = await generate(env, input, { ...options, early, callModel: loggedModel('artifact', stepCall(step, role.settings.reasoning_effort, seen, onVisual)) }); }
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
}
