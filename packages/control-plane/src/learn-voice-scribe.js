// Voice Mode's speech-to-text token. See docs/features/voice-tutor-mvp.md §5.
//
// The browser streams the mic straight to ElevenLabs Scribe; this mints the
// single-use token it connects with (15 minutes, one session), so the API key
// never leaves the worker. voiceRoute has already run the method, origin,
// auth, subscription and paid gates before it calls here.

const TOKEN_URL = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe';

export async function scribeToken(env, deps = {}) {
  const started = Date.now();
  const reply = (body, status = 200) => {
    // Ids and timings only: never the token, never the key.
    console.log(JSON.stringify({ event: 'learn_voice', kind: 'scribe_token', status, ms: Date.now() - started }));
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  };
  if (!env.ELEVENLABS_API_KEY) return reply({ error: 'Voice input is not configured on this environment.' }, 503);
  const unavailable = { error: 'Voice input is unavailable right now.' };
  let upstream;
  try {
    upstream = await (deps.fetch || fetch)(TOKEN_URL, {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return reply(unavailable, 502);
  }
  // The provider's body is never forwarded: it can echo request details.
  if (!upstream.ok) return reply(unavailable, 502);
  const token = (await upstream.json().catch(() => null))?.token;
  if (typeof token !== 'string' || !token) return reply(unavailable, 502);
  return reply({ token });
}
