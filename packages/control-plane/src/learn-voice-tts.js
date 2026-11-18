import { isPaidSpendReply } from './learn-paid-transport.js';
import { speakNarration } from './narration-voice.js';

// POST /api/learn/voice/tts (docs/features/voice-tutor-mvp.md §5): the Tutor's spoken words -> the narrator
// (narration-voice.js, ElevenLabs Jessica), returned as audio/mpeg. The caller (voiceRoute) has already run the method, origin,
// auth, subscription and paid gates and parsed the body. The one narrator of every spoken path.
// The log line carries the turn id, status, ms and length, never the text.

export const VOICE_TTS_TIMEOUT_MS = 20000;
const unavailable = () => Response.json({ error: 'Voice output is unavailable right now.' }, { status: 502 });

export async function voiceSpeech(env, body, deps = {}) {
  const text = body?.text;
  if (typeof text !== 'string' || !text.trim() || text.length > 1200) return Response.json({ error: 'Provide 1 to 1200 characters to speak.' }, { status: 400 });
  if (!env.ELEVENLABS_API_KEY) return Response.json({ error: 'Voice output is not configured on this environment.' }, { status: 503 });
  const turnId = typeof body.trace_id === 'string' && body.trace_id.length <= 64 ? body.trace_id : null;
  const started = Date.now();
  let status = null;
  try {
    // ponytail: the timeout also covers streaming the body, so audio still generating after 20 s is
    // cut short; fine for the client's 600-character cap. Time only the headers if that bites.
    const upstream = await speakNarration(env, text, { fetch: deps.fetch, signal: AbortSignal.timeout(VOICE_TTS_TIMEOUT_MS) });
    status = upstream.status;
    if (isPaidSpendReply(upstream)) return upstream;
    if (!upstream.ok) return unavailable();
    return new Response(upstream.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  } catch (error) {
    status = error?.name === 'TimeoutError' ? 'timeout' : 'error';
    return unavailable();
  } finally {
    console.log(JSON.stringify({ event: 'learn_voice', kind: 'tts', turn_id: turnId, status, ms: Date.now() - started, chars: text.length }));
  }
}
