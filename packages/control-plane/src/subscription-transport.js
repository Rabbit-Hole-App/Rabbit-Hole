// Dev-only transport. An unavailable bridge must never fall through to an API key.

// The personal bridge serves only its owner's authenticated dev requests
// (docs/features/coaching.md); null when the mode is off or this is the owner.
export function subscriptionOwnerRefusal(env, access) {
  if (env.SUBSCRIPTION_ONLY !== 'true' || access.email === env.SUBSCRIPTION_OWNER_EMAIL) return null;
  return Response.json({ error: 'This personal dev subscription is available only to its owner.' }, { status: 403 });
}
// Course authoring's model actions are not connected to the bridge yet.
export function subscriptionCourseRefusal(env, action) {
  if (env.SUBSCRIPTION_ONLY !== 'true' || !['draft', 'generate', 'revise_section'].includes(action)) return null;
  return Response.json({ error: 'Subscription-only dev mode: use Learn chat. This action is not connected to the subscription yet.' }, { status: 503 });
}
export async function subscriptionTransport(env, body, model) {
  if (!env.SUBSCRIPTION_BRIDGE_URL || !env.SUBSCRIPTION_BRIDGE_TOKEN) throw new Error('Claude subscription connection is offline. API fallback is disabled.');
  const url = new URL('/messages', env.SUBSCRIPTION_BRIDGE_URL);
  if (url.protocol !== 'https:') throw new Error('Subscription connection requires HTTPS');
  const response = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(180000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.SUBSCRIPTION_BRIDGE_TOKEN}` },
    body: JSON.stringify({ ...body, model, stream: false }),
  });
  if (!response.ok) throw new Error(`Claude subscription connection unavailable (${response.status}). No API fallback.`);
  const result = await response.json();
  if (result.billing !== 'claude-subscription' || !Array.isArray(result.content)) throw new Error('Unverified subscription response. No API fallback.');
  return Response.json(result);
}
