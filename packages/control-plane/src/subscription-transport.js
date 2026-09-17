// Dev-only transport. An unavailable bridge must never fall through to an API key.
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
