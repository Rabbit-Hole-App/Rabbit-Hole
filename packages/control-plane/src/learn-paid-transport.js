// Existing unpriced/delegated media transports fail closed before new paid submissions.
// A diagnostic read cannot authorize spending: only the bounded Fish path below can admit.
import { admitSpend, settleSpend, operationId, platformSpendStatus, spendEnforced } from './learn-spend-ledger.js';
import { beginAttempt, settleAttempt, toMicros } from './learn-usage.js';

const message = code => code === 'cap_unset' ? 'Daily paid-operation spend cap is not configured.'
  : code === 'daily_cap_reached' ? 'Daily paid-operation spend cap reached.'
    : code === 'spend_bound_unavailable' ? 'This paid operation is paused until a verified spending limit is available.' : 'Paid-operation spend accounting is unavailable.';
const spendReplies = new WeakSet();
export const isPaidSpendReply = response => spendReplies.has(response);
export function paidSpendReply(code) {
  const response = Response.json({ error: message(code), code }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
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
  if (refused) { const { code, error } = await refused.json(); throw Object.assign(new Error(error), { code }); }
}

// Fish S1 charges $15/M UTF-8 input bytes, not Unicode character count:
// https://fish.audio/developers/ (verified 2026-10-12). No output-duration estimate.
export async function fishSpendTransport(env, text, transport) {
  if (!spendEnforced(env)) return transport();
  const reservedUsd = Math.ceil(new TextEncoder().encode(text).length * 15) / 1e6;
  const opId = operationId('fish_tts');
  const gate = await admitSpend(env.LEARN_DB, env, { opId, userId: 'provider:platform', org: 'platform', category: 'fish_tts', reservedUsd });
  if (gate.refused) return paidSpendReply(gate.reason);
  // Usage accounting (learn-usage.js, Phase 1). Fish bills exactly the input bytes, so a delivered response settles at the
  // reservation; a failed one keeps it as unknown.
  const reservedMicros = toMicros(reservedUsd);
  const begun = beginAttempt(env, { attemptId: opId, kind: 'media', provider: 'fish', model: 's1', reservedMicros });
  let response;
  try { response = await transport(); }
  catch (error) {
    await settleSpend(env.LEARN_DB, opId, { status: 'failed', calls: 1, provider: 'fish', model: 's1', error: 'transport' });
    await settleAttempt(env, await begun, { status: 'failed' });
    throw error;
  }
  // Preserve the entire input charge even if audio later disconnects; no refund is assumed.
  await settleSpend(env.LEARN_DB, opId, { status: response.ok ? 'settled' : 'failed', calls: 1, provider: 'fish', model: 's1', error: response.ok ? null : `http_${response.status}` });
  await settleAttempt(env, await begun, { status: response.ok ? 'settled' : 'failed', costMicros: response.ok ? reservedMicros : null });
  return response;
}
