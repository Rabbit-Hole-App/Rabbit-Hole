// DEV ONLY: an explicit Celeris route for the direct written /explain command (the internal command name is 'explanation'; 'explain' is /interactive) (owner, 2026-11-07). /api/learn/artifact with command 'explain' makes its ONE
// authoring call (the explanation and any rh-diagram spec together) to Celeris instead of the plan model, then goes through the same validation, the one
// repair and the written-explanation fallback as every other call (learn-artifact.js generateArtifact). Nothing else changes: every other command, and /explain
// anywhere the switch is off, keeps the plan model.
// Three switches must all be on: the Worker is a dev or test deployment (SMALL_ENV), EXPLAIN_CELERIS_DEV is "true", and CELERIS_API_KEY is set.
// A production Worker has SMALL_ENV "production" and can never take this path.
import { toOpenAI, fromOpenAI } from './ask.js';

export const CELERIS_MODEL = 'celeris-1';
const BASE = 'https://inference.celeris.ai/celeris-1/v1';

export const celerisExplainOn = (env, command) => command === 'explanation' && env.EXPLAIN_CELERIS_DEV === 'true' && (env.SMALL_ENV === 'dev' || env.SMALL_ENV === 'test') && !!env.CELERIS_API_KEY;

// -> { options, served() } for generateArtifact, or null when the switch is off. served() is what the provider said it ran (the response's model field).
export function celerisExplainRoute(env, command) {
  if (!celerisExplainOn(env, command)) return null;
  const seen = { models: [], calls: 0, inTokens: 0, outTokens: 0 };
  const callModel = async (callEnv, body) => {
    seen.calls++;
    const { stream, betas, ...rest } = body;
    const response = await fetch(`${(env.CELERIS_BASE_URL || BASE).replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CELERIS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...toOpenAI(rest, CELERIS_MODEL), stream: false }),
    });
    if (!response.ok) return response; // the caller turns a non-ok status into its one-line error
    const json = await response.json();
    seen.models.push(json.model || null);
    seen.inTokens += json.usage?.prompt_tokens || 0; seen.outTokens += json.usage?.completion_tokens || 0;
    return Response.json({ ...fromOpenAI(json), usage: json.usage || {} });
  };
  return { options: { callModel }, served: () => ({ requested: CELERIS_MODEL, models: [...new Set(seen.models)], calls: seen.calls, inTokens: seen.inTokens, outTokens: seen.outTokens }) };
}
