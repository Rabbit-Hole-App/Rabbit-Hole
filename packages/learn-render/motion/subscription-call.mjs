// Motion over the owner's Claude subscription (owner decision 2026-10-06, after the API account ran
// out of credit): the native Claude Code CLI through scripts/learn-subscription-bridge.mjs, in this
// process. No API key is read and nothing ever falls back to the API.
//
// The bridge's outcomes become the shapes the stages already classify (stream-message.js classifyEnd):
//   an answer                                  -> the message (billing: claude-subscription, no usage: $0)
//   the CLI killed at its deadline             -> HTTP 504, gateway_timeout (the Author may resend once)
//   an answer outside the JSON/tool contract   -> a message with no tool call: the schema-only re-ask
//   anything else (login, usage limit, crash)  -> HTTP 503, provider_error: the stage fails, never retried
// ponytail: Stop abandons the call (orchestrator.mjs) but the CLI child runs to its end; kill it if that matters.
import { subscriptionMessage } from '../../../scripts/learn-subscription-bridge.mjs';

export const SUBSCRIPTION = 'claude-subscription';

export function subscriptionCall({ generate = subscriptionMessage, timeoutMs = 15 * 60 * 1000 } = {}) {
  return async (env, body, model) => {
    const { stream: _stream, ...rest } = body;
    try {
      const message = await generate({ ...rest, model }, { timeout: timeoutMs, maxOutputTokens: body.max_tokens || null });
      return Response.json({ ...message, model: `subscription/${message.model}` });
    } catch (error) {
      // The deadline killed the CLI's process tree: record the configured deadline, the elapsed time and why.
      if (error?.code === 'ETIMEDOUT') return new Response(error.message, { status: 504, headers: { 'x-termination': `deadline ${error.deadline_ms ?? timeoutMs} ms, terminated after ${error.elapsed_ms ?? '?'} ms, ${error.reason ?? 'deadline'}` } });
      if (/^Invalid subscription (model response|tool choice|answer)/.test(error?.message || '')) return Response.json({ content: [], stop_reason: 'end_turn', model: 'subscription', billing: SUBSCRIPTION, note: error.message });
      return new Response(String(error?.message || error).slice(0, 500), { status: 503 });
    }
  };
}
