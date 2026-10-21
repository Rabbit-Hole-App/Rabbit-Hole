// Existing unpriced/delegated media transports fail closed before new paid submissions.
// A diagnostic read cannot authorize spending: only the bounded Fish path below can admit.
import { admitSpend, settleSpend, operationId, platformSpendStatus, spendEnforced, refusalReply, spendMessage, ALLOWANCE_REASONS } from './learn-spend-ledger.js';
import { settleAttempt, toMicros, usageRefusal } from './learn-usage.js';

const message = code => code === 'cap_unset' ? 'Daily paid-operation spend cap is not configured.'
  : code === 'daily_cap_reached' ? 'Daily paid-operation spend cap reached.'
    : code === 'spend_bound_unavailable' ? 'This paid operation is paused until a verified spending limit is available.' : 'Paid-operation spend accounting is unavailable.';
const spendReplies = new WeakSet();
export const isPaidSpendReply = response => spendReplies.has(response);
// An allowance refusal answers with the shared allowance body (learn-spend-ledger.js refusalBody); the platform's keep theirs.
export function paidSpendReply(code, period = null) {
  const response = ALLOWANCE_REASONS.includes(code) ? refusalReply({ reason: code, period })
    : Response.json({ error: message(code), code }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  spendReplies.add(response);
  return response;
}

export async function paidSubmissionRefusal(env) {
  if (!spendEnforced(env)) return null;
  const gate = await platformSpendStatus(env.LEARN_DB, env);
  return paidSpendReply(gate.refused ? gate.reason : 'spend_bound_unavailable');
}

export async function requirePaidSubmission(env) {
  const refused = await paidSubmissionRefusal(env);
  // definite: refused before the provider, so nothing started (a video job stays retryable, not "could not be confirmed").
  if (refused) { const { code, error } = await refused.json(); throw Object.assign(new Error(error), { code, definite: true }); }
}

// Fish S1 charges $15/M UTF-8 input bytes, not Unicode character count:
// https://fish.audio/developers/ (verified 2026-10-12). No output-duration estimate.
export async function fishSpendTransport(env, text, transport) {
  if (!spendEnforced(env)) return transport();
  const reservedUsd = Math.ceil(new TextEncoder().encode(text).length * 15) / 1e6;
  const opId = operationId('fish_tts');
  const gate = await admitSpend(env.LEARN_DB, env, { opId, userId: 'provider:platform', org: 'platform', category: 'fish_tts', reservedUsd, kind: 'media', provider: 'fish', model: 's1' });
  if (gate.refused) return paidSpendReply(gate.reason, usageRefusal(env)?.period);
  // Fish bills exactly the input bytes, so a delivered response settles at the reservation; a failed one keeps it as unknown.
  const reservedMicros = toMicros(reservedUsd);
  const begun = gate.attemptId;
  let response;
  try { response = await transport(); }
  catch (error) {
    await settleSpend(env.LEARN_DB, opId, { status: 'failed', calls: 1, provider: 'fish', model: 's1', error: 'transport' });
    await settleAttempt(env, begun, { status: 'failed' });
    throw error;
  }
  // Preserve the entire input charge even if audio later disconnects; no refund is assumed.
  await settleSpend(env.LEARN_DB, opId, { status: response.ok ? 'settled' : 'failed', calls: 1, provider: 'fish', model: 's1', error: response.ok ? null : `http_${response.status}` });
  await settleAttempt(env, begun, { status: response.ok ? 'settled' : 'failed', costMicros: response.ok ? reservedMicros : null });
  return response;
}

// A priced tool call outside spendTransport (Exa search): admitted before the call like any provider call, then settled once
// with the provider's reported cost, or held as unknown when it reports none or fails. Null where spend is not enforced
// (SMALL_ENV=test). A refusal throws before the call, its message the person's explanation.
export async function admitTool(env, { category, reservedMicros, provider, model }) {
  if (!spendEnforced(env)) return null;
  const opId = operationId(category);
  const gate = await admitSpend(env.LEARN_DB, env, { opId, userId: 'provider:platform', org: 'platform', category, reservedUsd: reservedMicros / 1e6, kind: 'tool', provider, model });
  if (gate.refused) throw Object.assign(new Error(spendMessage(gate.reason, usageRefusal(env)?.period)), { code: gate.reason });
  return {
    async settle({ ok, costMicros = null }) {
      const known = ok && Number.isSafeInteger(costMicros) && costMicros >= 0 ? costMicros : null;
      try { await settleSpend(env.LEARN_DB, opId, { status: ok ? 'settled' : 'failed', calls: 1, costUsd: known == null ? null : known / 1e6, provider, model, error: ok ? null : 'tool_failed' }); }
      catch { /* the ledger keeps the admitted reservation */ }
      await settleAttempt(env, gate.attemptId, { status: ok ? 'settled' : 'failed', costMicros: known });
    },
  };
}
