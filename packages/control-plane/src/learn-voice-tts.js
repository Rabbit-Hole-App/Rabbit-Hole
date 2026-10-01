// POST /api/learn/voice/tts (docs/features/voice-tutor-mvp.md §5): the Tutor's spoken words -> Fish
// audio, streamed back as audio/mpeg. The caller (voiceRoute) has already run the method, origin,
// auth, subscription and paid gates and parsed the body. Same pinned narrator as /api/learn/tts.
// The log line carries the turn id, status, ms and length, never the text.

export const VOICE_TTS_TIMEOUT_MS = 20000;
const NARRATOR = '802e3bc2b27e49c2995d23ef70e6ac89';
const unavailable = () => Response.json({ error: 'Voice output is unavailable right now.' }, { status: 502 });

export async function voiceSpeech(env, body, deps = {}) {
  const text = body?.text;
  if (typeof text !== 'string' || !text.trim() || text.length > 1200) return Response.json({ error: 'Provide 1 to 1200 characters to speak.' }, { status: 400 });
  if (!env.FISH_AUDIO_API_KEY) return Response.json({ error: 'Voice output is not configured on this environment.' }, { status: 503 });
  const turnId = typeof body.trace_id === 'string' && body.trace_id.length <= 64 ? body.trace_id : null;
  const started = Date.now();
  let status = null;
  try {
    // ponytail: the timeout also covers streaming the body, so audio still generating after 20 s is
    // cut short; fine for the client's 600-character cap. Time only the headers if that bites.
    const upstream = await (deps.fetch || fetch)('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.FISH_AUDIO_API_KEY}`, 'Content-Type': 'application/json', model: 's1' },
      // Calm and steady (owner, 2026-10-01): a little slower, and lower sampling so the narrator does not drift between replies.
      body: JSON.stringify({ text, reference_id: NARRATOR, format: 'mp3', mp3_bitrate: 64, latency: 'balanced', normalize: true, temperature: 0.5, top_p: 0.6, prosody: { speed: 0.92 } }),
      signal: AbortSignal.timeout(VOICE_TTS_TIMEOUT_MS),
    });
    status = upstream.status;
    if (!upstream.ok) return unavailable();
    return new Response(upstream.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  } catch (error) {
    status = error?.name === 'TimeoutError' ? 'timeout' : 'error';
    return unavailable();
  } finally {
    console.log(JSON.stringify({ event: 'learn_voice', kind: 'tts', turn_id: turnId, status, ms: Date.now() - started, chars: text.length }));
  }
}
