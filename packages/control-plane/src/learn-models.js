// Model ids, per-task Learn model settings and request limits in one place
// (C4 in docs/features/learn-cleanup.md). Every value is today's behavior,
// pinned by test/learn-models.test.js: changing one is a behavior change.
// A leaf module, so ask.js, learn-research.js and the browser-side test can
// all import it without a cycle.
import { sha256 } from './token.js';
import { anthropicQuantities, mtokRates, priceUsage } from './pricing-registry.js';
import { spendEnforced } from './learn-spend-ledger.js'; // imports nothing
import { sha256Hex } from './learn-grade-jev.js'; // learn-grade-jev.js imports nothing, so this module stays a leaf
import { usageContext } from './learn-usage.js'; // already reached through learn-spend-ledger.js
import { makeEvent, usageSnapshot } from './telemetry-contract.js'; // a leaf
import { emitTelemetry } from './telemetry-delivery.js'; // imports only the contract

export const MODEL = 'claude-opus-5';
// Auto where spend is enforced (owner, 2026-10-12): exactly MODEL, without the server-side fallback, whose fallback
// model cannot be priced before admission. Only unenforced test runs keep Auto's fallback (null: no model is sent).
export const autoModel = env => (spendEnforced(env) ? MODEL : null);
// No Anthropic key on this deployment (a preview without one): no model request leaves the worker, and every AI
// feature says so in these words (owner, 2026-10-08). anthropic() and review.js return or throw it before any fetch.
export const MODEL_NOT_CONFIGURED = 'AI answers aren’t configured on this preview.';
export const notConfiguredReply = () => Response.json({ type: 'error', error: { type: 'not_configured', message: MODEL_NOT_CONFIGURED } }, { status: 503 });
// That reply, read back from a failed response: the message to show, or null for any real upstream failure.
export const notConfiguredMessage = async response => (response.status === 503 && (await response.clone().json().catch(() => null))?.error?.type === 'not_configured' ? MODEL_NOT_CONFIGURED : null);
// Model picker allowlist - "Auto" resolves to the default.
export const ASK_MODELS = { auto: MODEL, 'opus-5': 'claude-opus-5', 'sonnet-5': 'claude-sonnet-5', 'haiku-4.5': 'claude-haiku-4-5-20251001' };

// A picker key to its model id; anything else gets the caller's fallback.
// Own keys only: 'constructor' or '__proto__' would otherwise send a function
// or an object as the model.
export const askModel = (key, fallback = null) => (typeof key === 'string' && Object.hasOwn(ASK_MODELS, key) ? ASK_MODELS[key] : fallback);

// What each Learn task sends. provider: 'anthropic' is ask.js anthropic() (the
// platform key, or the subscription bridge in SUBSCRIPTION_ONLY); 'plan' is
// planModel (OpenAI only with both OPENAI_API_KEY and LEARN_PLAN_MODEL set,
// outside subscription mode; otherwise anthropic()). model null is
// Auto: claude-opus-5 plus the server-side refusal fallback; an explicit id
// gets no fallback. org is null on every task, so per-org AI settings
// (org_ai) never apply to Learn. No task sets thinking, and only the journey
// roles carry an effort, so the model default thinks inside maxTokens.
export const LEARN_TASKS = Object.freeze({
  // Sheet asks, Ask in chat, Continue convo and chat-answered slash commands,
  // on every canvas kind. The picker key resolves through askModel. maxTokens 6000 (owner, 2026-10-14): adaptive thinking counts
  // against it, and whole-board answers ran out at 2400; spend admission reserves max_tokens at the output price (learn-spend.js).
  chat: Object.freeze({ provider: 'anthropic', model: null, picker: true, fallback: 'server-side default on Auto only, where spend is not enforced', thinking: 'model default', toolChoice: 'auto; none on the last research step', maxTokens: 6000 }),
  // Rich-rubric and visual assessment of a saved attempt (tutor workflow Tasks 13 and 14; learn-rubric-assessment.js,
  // learn-visual-assessment.js): Opus 5.5 as the draft's model table names it, no fallback, one JSON reply. Opus 5.5 thinks
  // inside maxTokens, so the budget leaves room for the reply after its thinking.
  tutor_rubric: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'none (no tools; one JSON reply)', maxTokens: 4000 }),
  tutor_visual: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'none (no tools; one JSON reply)', maxTokens: 4000 }),
  // Home answers (/api/learn/home-ask, learn-home-ask.js): pinned to Sonnet 5.5 at effort low, grounded in the user's library.
  home_ask: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'none (no tools; one JSON reply)', maxTokens: 900 }),
  // Professor Next Steps (docs/features/professor-next-steps.md §2.4): the hook planner, one tool (suggest_next_steps) on
  // tool_choice auto; its escalation runs once on a missing tool call, a validator failure or an ambiguous reading.
  tutor_next_steps: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 1500 }),
  tutor_next_steps_escalation: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', effort: null, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 4000 }),
  // Explore's AI find (/api/learn/boards/published/find, explore-find.js; explore-publish.md): a sentence-length search
  // picks and ranks published canvases and creators. The small model, one JSON reply, cached per normalised query.
  explore_find: Object.freeze({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'none (no tools; one JSON reply)', maxTokens: 400 }),
  // /explain v2 (EXP-T12, plan v2.1 section 3.2): its own roles, pinned to Opus 5.5, never the picker, Auto or `artifact`.
  // Opus 5.5 400s a forced tool with thinking off, so each offers one tool on auto and a reply without exactly one call of
  // it is an invalid turn (explain-policy.js explainToolInput). Limits and prices: explain-policy.js.
  explain_brief: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (exactly one tool call)', maxTokens: 4000 }),
  explain_author: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (exactly one tool call)', maxTokens: 10000 }),
  explain_review: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (exactly one tool call)', maxTokens: 3000 }),
  explain_repair: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (exactly one tool call)', maxTokens: 6000 }),
  // /interact design roles (INT-07A, docs/features/interact.md section 5): the new scene-plan flow's author, reviewer and reviser. The all-Opus profile
  // pins them like the explain roles; the call settings live in interact-models.js (a profile may serve any role from another provider, which these
  // task entries then only label). The build roles reuse explain_author/review/repair above, with their new-flow limits set by the profile.
  interact_design_author: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (exactly one tool call)', maxTokens: 12000 }),
  interact_design_review: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (exactly one tool call)', maxTokens: 10000 }),
  interact_design_revise: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (exactly one tool call)', maxTokens: 14000 }),
  // /animation (AN-05, docs/superpowers/plans/2026-10-30-animation.md section 7): its own roles on /explain's model and token ceilings,
  // never the picker, Auto or `artifact`. One tool on auto, exactly one call of it. Limits, prices and the build graph: animation-policy.js.
  animation_brief: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', effort: 'medium', toolChoice: 'auto (exactly one tool call)', maxTokens: 4000 }),
  // author and repair raised from /explain's 10,000 and 6,000 (accept-5, 2026-10-30: an author spent all 10,000 output tokens, thinking
  // included, before its tool call). The build worst case (animation-policy.js animationReservation) follows these values.
  // Owner A (2026-11-02): medium effort, stated, with 24,000 output tokens. Job aj_49544d6 spent 11,993 of 16,000 thinking and was cut
  // off (FX-AN-035); at low effort the SGD scenes failed review (aj_ba11d5a, aj_ad936ec). 8,000 more output tokens at $20/M add
  // $0.16 (16 credits) to the build's worst case. More tokens remedy truncation; they do not prove a scene good.
  animation_author: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', effort: 'medium', toolChoice: 'auto (exactly one tool call)', maxTokens: 24000 }),
  animation_review: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (exactly one tool call)', maxTokens: 8000 }), // 6,000 until C9: a review at 3,818 thinking tokens plus a prose answer was cut off mid tool call (aj_4f08e1b367964e4aa0c3124c26dfc33f, FX-AN-102); +$0.04 per call, +$0.12 and +12 credits on the build's worst case
  // Repair: medium effort with 24,000 output tokens (owner decision 16, 3 Nov 2026; was low with 12,000). 12,000 more output tokens at $20/M add
  // $0.24 per repair call, $0.48 for the two a build allows: 48 credits on the displayed worst case (325 to 373). A patch-style repair is AN-22.
  animation_repair: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', effort: 'medium', toolChoice: 'auto (exactly one tool call)', maxTokens: 24000 }),
  // /whiteboard (roadmap v1 section 4.2): the planner and the per-scene author, pinned to Opus 5.5 at medium effort, never the picker, Auto or
  // `artifact`. One tool on auto, exactly one call of it. Limits, prices and the job's worst case: whiteboard-policy.js.
  whiteboard_plan: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', effort: 'medium', toolChoice: 'auto (exactly one tool call)', maxTokens: 6000 }),
  // 8,000 output tokens (owner try, 2026-11-05): a 60 s scene with a 15-point graph, text, arrows and four beats hit 4,000 before its tool call
  // finished (output_limit). The job's worst case (whiteboard-policy.js whiteboardReservation) follows this value: 320,000 micro-USD a call.
  whiteboard_author: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', effort: 'medium', toolChoice: 'auto (exactly one tool call)', maxTokens: 8000 }),
  // Tutor R4 roadmap roles (docs/features/explain-on-canvas/contracts/planning.md 2; v1.4 6.1), all platform-funded under withSystemUsage, one tool each on tool_choice auto
  // (Opus 5.5 400s on a forced tool with thinking off). The limits are ROADMAP_LIMITS.maxTokens (roadmap-policy.js). roadmap_proposal (R5) edits a pending proposal; R4 composes a proposal
  // from the validated plan step with no model call (roadmap-compose.js); the later R5/R6 change adds it. Cards use the existing `artifact` task.
  roadmap_subject: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 1000 }),
  roadmap_draft: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', effort: null, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 12000 }),
  roadmap_revise: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', effort: null, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 12000 }),
  roadmap_grounding_check: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 1500 }),
  roadmap_grounding_escalation: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', effort: null, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 4000 }),
  roadmap_safety_adjudicate: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', effort: null, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 1500 }),
  roadmap_proposal: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 600 }), // Tutor R5: the proposal edit composer (roadmap-edit.js), platform-funded
  // Tutor R7a index role (roadmap-source-summary.js): bounded navigation summaries of long-Markdown chunks, platform-funded, one tool, no fallback. NOT evidence.
  roadmap_index: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 2000 }),
  // Slash-command cards (/api/learn/artifact).
  artifact: Object.freeze({ provider: 'plan', model: ASK_MODELS.auto, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'any', maxTokens: 4000 }),
  // The whiteboard (/api/learn/board): one model for plan, draft and review.
  // It still honours a request `model` key that no client sends (models-7).
  board: Object.freeze({ provider: 'plan', model: ASK_MODELS.auto, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'forced tool; any while gathering assets', maxTokens: Object.freeze({ plan: 1200, draft: 3000, review: 1800 }) }),
});

// Cards and the whiteboard go to OpenAI only on an explicit opt-in, and
// subscription mode never leaves the bridge (planModel in ask.js).
export const planUsesOpenAI = env => env.SUBSCRIPTION_ONLY !== 'true' && !!env.OPENAI_API_KEY && !!env.LEARN_PLAN_MODEL;

// One sanitized log line per Learn model call (models-11): what was asked for,
// where it came from and what actually served it. Never the message, the
// context, tool input or a key; the prompt is named by a 12-character hash.
// Wraps a callModel(env, body, model, org). A JSON reply is read from a clone; an event stream is passed through chunk by chunk
// (never buffered), its model, usage and stop reason read as it goes, and logged when it ends, fails or is cancelled. A thrown
// transport is logged and rethrown. Also the model_call.started / .finished telemetry events (docs/features/telemetry.md), a
// no-op until TELEMETRY_DB is bound. Logging never changes, delays to completion or fails the response.
// The contract's model-call event, joined to the request's usage action when it has one. Its own failure is swallowed.
async function modelEvent(env, name, line, { result = null, stream, status, outcome, error, requestId, responseMs, firstChunkMs, chunks, durationMs } = {}) {
  const ctx = usageContext(env);
  const actionId = await Promise.resolve(ctx?.action).catch(() => null);
  const payload = { task: line.task, provider: line.provider, requested_model: line.requested, source: line.source, prompt_hash: line.prompt, stream };
  if (name === 'model_call.finished') Object.assign(payload, { served_model: result?.model, fell_back: !!result?.usage?.iterations?.some(step => step.type === 'fallback_message'),
    status_code: status, stop_reason: result?.stop_reason, request_id: requestId, response_ms: responseMs, first_chunk_ms: firstChunkMs, duration_ms: durationMs,
    chunks, usage: usageSnapshot(result?.usage) });
  return emitTelemetry(env, makeEvent(name, { service: 'app_worker', feature: ctx?.feature, ...(env.TELEMETRY_TRACE ? { trace_id: env.TELEMETRY_TRACE } : {}), action_id: actionId || undefined, user_ref: ctx?.identity?.userId || undefined,
    outcome: name === 'model_call.started' ? 'started' : outcome, error_code: error || undefined, payload }, { service: 'app_worker', release: /^[0-9a-f]{7,40}$/.test(env.RELEASE_SHA || '') ? env.RELEASE_SHA : null }));
}

const clock = () => globalThis.performance?.now?.() ?? Date.now();
export function loggedModel(task, callModel) {
  return async (env, body, model, org) => {
    const begun = clock();
    let line = null;
    try {
      const provider = env.SUBSCRIPTION_ONLY === 'true' ? 'subscription' : LEARN_TASKS[task].provider === 'plan' && planUsesOpenAI(env) ? 'openai' : 'anthropic';
      line = { event: 'learn_model', task, provider,
        requested: provider === 'openai' ? env.LEARN_PLAN_MODEL : model ?? (provider === 'anthropic' ? autoModel(env) : null) ?? 'auto',
        source: provider === 'openai' ? 'LEARN_PLAN_MODEL' : model == null ? 'auto' : model === LEARN_TASKS[task].model ? 'task' : 'request',
        fallback: provider === 'anthropic' && model == null && !autoModel(env) ? 'default' : 'none',
        prompt: (await sha256(String(body.system ?? ''))).slice(0, 12) };
    } catch { /* a log line is never worth a failed answer */ }
    const started = line ? modelEvent(env, 'model_call.started', line, { stream: !!body.stream }) : null;
    let ended = false;
    const finish = async (result, fields) => {
      if (ended || !line) return;
      ended = true;
      try {
        const durationMs = Math.round(clock() - begun);
        console.log(JSON.stringify({ ...line, served: result?.model ?? null, fellBack: !!result?.usage?.iterations?.some(step => step.type === 'fallback_message'),
          status: fields.status ?? null, stopReason: result?.stop_reason ?? null, outcome: fields.outcome, error: fields.error ?? null, durationMs }));
        await started;
        await modelEvent(env, 'model_call.finished', line, { result, ...fields, durationMs });
      } catch { /* as above */ }
    };
    let response;
    try { response = await callModel(env, body, model, org); }
    catch (error) { await finish(null, { outcome: 'unknown', error: 'transport_thrown' }); throw error; }
    const meta = { status: response.status, requestId: response.headers?.get?.('request-id') ?? null, responseMs: Math.round(clock() - begun) };
    if (!response.ok) { await finish(null, { ...meta, outcome: 'failed', error: 'http_error' }); return response; }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      const result = await response.clone().json().catch(() => null);
      await finish(result, { ...meta, outcome: result ? 'completed' : 'unknown', error: result ? null : 'invalid_json' });
      return response;
    }
    // The settlement path's incremental parse (learn-spend.js spendTransport): message_start's message, message_delta's usage,
    // message_stop. A parse problem stops the reading, never the stream.
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = '', result = null, complete = false, reading = true, chunks = 0, firstChunkMs = null;
    const parse = chunk => {
      pending += decoder.decode(chunk, { stream: true });
      const events = pending.split(/\r?\n\r?\n/); pending = events.pop();
      for (const event of events) {
        try {
          const value = JSON.parse(event.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n'));
          if (value.type === 'message_start') result = { ...value.message, content: undefined };
          if (value.type === 'message_delta' && result) result = { ...result, stop_reason: value.delta?.stop_reason ?? result.stop_reason, usage: { ...result.usage, ...value.usage } };
          if (value.type === 'message_stop') complete = true;
        } catch { /* a non-JSON event */ }
      }
      if (pending.length > 1024 * 1024) reading = false;
    };
    const streamed = () => ({ ...meta, firstChunkMs, chunks });
    return new Response(new ReadableStream({
      async pull(controller) {
        let read;
        try { read = await reader.read(); }
        catch (error) { await finish(result, { ...streamed(), outcome: 'unknown', error: 'stream_failed' }); controller.error(error); return; }
        if (read.done) {
          // Before close, as settlement does: the write stays inside the response the Worker is still serving.
          await finish(result, { ...streamed(), outcome: complete ? 'completed' : 'unknown', error: complete ? null : 'stream_incomplete' });
          controller.close();
          return;
        }
        if (chunks++ === 0) firstChunkMs = Math.round(clock() - begun);
        controller.enqueue(read.value);
        if (reading) { try { parse(read.value); } catch { reading = false; } }
      },
      async cancel(reason) {
        try { await reader.cancel(reason); } finally { await finish(result, { ...streamed(), outcome: 'cancelled', error: 'stream_cancelled' }); }
      },
    }), { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

// USD per MTok [input, output, cache read], read from the one price registry (pricing-registry.js, owner rates 2026-10-23). A
// 5-minute cache write is 1.25x input; fast mode is its own registry tier. Kept for the callers that want the three-number shape.
// ponytail: the e2e runners keep their own copy; point them here when they are next edited.
export const MODEL_PRICES = Object.freeze(Object.fromEntries(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001'].map(model => [model, mtokRates('anthropic', model)])));
export function costUsd({ model, input_tokens = 0, output_tokens = 0, cache_creation_input_tokens = 0, cache_read_input_tokens = 0, speed = null }) {
  if (!MODEL_PRICES[model]) return null;
  const priced = priceUsage({ model, tier: speed === 'fast' ? 'fast' : 'standard', quantities: anthropicQuantities({ input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }) });
  return priced ? priced.micros / 1e6 : null;
}
// The decision telemetry's prompt_version: the system text and the tool schemas actually sent (transport flags such as
// cache_control or eager_input_streaming left out), so a prompt or tool change shows and a cache or stream setting does not.
// System blocks join with a newline, as the uncached prompt joins the same texts (plannerRequest), so both hash alike.
export async function promptVersion(system, tools) {
  const text = Array.isArray(system) ? system.map(block => block.text).join('\n') : String(system ?? '');
  return (await sha256Hex(JSON.stringify([text, (tools || []).map(({ name, description, input_schema }) => ({ name, description, input_schema }))]))).slice(0, 12);
}

// Request limits shared by more than one site.
export const MESSAGE_LIMIT = 4000; // characters in the learner's question
export const MENTION_LIMIT = 3; // @-mentioned apps or repositories per ask
export const HISTORY_TURNS = 10; // earlier thread messages sent with an ask
export const PAPERS_PER_ANSWER = 2; // arXiv papers one answer or explanation may read
// Loop limits, deliberately separate: each bounds a different loop.
export const RESEARCH_STEPS = 8; // chat tool steps before the forced text step
export const ARTIFACT_REPAIRS = 1; // validation repairs per slash-command card
export const BOARD_DRAFT_TURNS = 7; // whiteboard draft turns; the last one forces the drawing
export const BOARD_REVIEW_PASSES = 2; // whiteboard reviews: the draft, then one revision
