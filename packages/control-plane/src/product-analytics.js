// Product analytics on the server (docs/features/usage-analytics.md): the one event only the server can vouch for, a completed
// sign-in, sent to PostHog under the account's users.id. Configured only where POSTHOG_PROJECT_TOKEN and POSTHOG_HOST are set
// (production's rabbit-hole-cp); anywhere else it sends nothing. Sign-in never waits for it: the caller hands the promise to
// waitUntil, and every failure is swallowed.

// The owner's accounts (ANALYTICS_INTERNAL_USER_IDS, users.id, comma separated): marked internal, so the customer view leaves
// them out. Never matched by email.
export const internalAccount = (env, userId) => !!userId && String(env?.ANALYTICS_INTERNAL_USER_IDS || '').split(',').map(id => id.trim()).includes(userId);

// user: userFor's result ({ id, provider, created, created_at }). A retry resends the same uuid and timestamp, so PostHog keeps one.
// req: the sign-in request; Do Not Track or Global Privacy Control on it sends nothing, as in the browser adapter.
export async function captureSignIn(env, user, req, { fetcher = globalThis.fetch, attempts = 3 } = {}) {
  try {
    if (req?.headers?.get('Sec-GPC') === '1' || req?.headers?.get('DNT') === '1') return false;
    const token = env?.POSTHOG_PROJECT_TOKEN, host = env?.POSTHOG_HOST;
    if (!token?.startsWith('phc_') || !/^https:\/\/[a-z0-9.-]+$/i.test(host || '') || !/^[0-9a-f]{32}$/.test(user?.id || '')) return false;
    const internal = internalAccount(env, user.id);
    const body = JSON.stringify({ api_key: token, batch: [{ event: 'rh_signed_in', uuid: crypto.randomUUID(), timestamp: new Date().toISOString(), properties: {
      distinct_id: user.id, provider: user.provider, new_account: !!user.created, rh_env: env.SMALL_ENV || 'unknown', rh_internal: internal, $lib: 'rh-server',
      $set: { rh_internal: internal }, ...(user.created_at ? { $set_once: { rh_account_created_at: new Date(user.created_at * 1000).toISOString() } } : {}) } }] });
    for (let i = 0; i < attempts; i++) {
      try {
        const response = await fetcher(`${host}/batch/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        if (response.status < 500) return response.ok;
      } catch { /* retried */ }
    }
  } catch { /* never blocks sign-in */ }
  return false;
}
