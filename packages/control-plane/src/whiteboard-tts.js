// /whiteboard narration (roadmap v1 sections 4.2 and 6.1): one Fish s1 request per beat through fishSpendTransport, with the Tutor's voice
// and the live route's settings (learn-voice-tts.js), 20 s per request as that route. Acceptance is Fish's response headers: a 429, or a
// request that failed or timed out before them, is sent once more; once Fish has answered 200, a body that does not arrive is never asked for
// again (`reconciling`: its charge stands until the job's refund by key). The duration is measured from the MP3 frames (whiteboard-mp3.js).
import { fishSpendTransport, isPaidSpendReply } from './learn-paid-transport.js';
import { WHITEBOARD_LIMITS as L } from './whiteboard-policy.js';
import { mp3Duration } from './whiteboard-mp3.js';

export const FISH_URL = 'https://api.fish.audio/v1/tts';
export const NARRATOR = '802e3bc2b27e49c2995d23ef70e6ac89'; // learn-voice-tts.js:9, the Tutor's voice
export const TTS_TIMEOUT_MS = 20000;
export const fishBody = text => ({ text, reference_id: NARRATOR, format: 'mp3', mp3_bitrate: 64, latency: 'balanced', normalize: true, temperature: 0.5, top_p: 0.6, prosody: { speed: 0.92 } });

const failure = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

// env: the job's usage-scoped env (the generation key). -> { bytes: Uint8Array, seconds, attempts }
export async function narrateBeat(env, text, { fetch = globalThis.fetch, timeoutMs = TTS_TIMEOUT_MS } = {}) {
  if (!env.FISH_AUDIO_API_KEY) throw failure('tts_not_configured', 'Fish is not configured here.');
  let attempts = 0;
  for (;;) {
    attempts++;
    let response;
    try {
      response = await fishSpendTransport(env, text, () => fetch(FISH_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.FISH_AUDIO_API_KEY}`, 'Content-Type': 'application/json', model: 's1' },
        body: JSON.stringify(fishBody(text)), signal: AbortSignal.timeout(timeoutMs) }));
    } catch (error) {
      if (attempts < 2) continue; // before acceptance: one more
      throw failure('tts_failed', `Fish did not answer: ${error?.name || 'error'}.`, { attempts });
    }
    if (isPaidSpendReply(response)) throw failure('spend_refused', 'The narration was not admitted.', { attempts });
    if (response.status === 429 && attempts < 2) continue;
    if (!response.ok) throw failure('tts_failed', `Fish answered ${response.status}.`, { attempts });
    let bytes;
    try { bytes = new Uint8Array(await response.arrayBuffer()); }
    catch { throw failure('reconciling', 'Fish accepted the request and its audio did not arrive; it is not asked for again.', { attempts }); }
    if (bytes.length > L.beatAudioBytes) throw failure('tts_failed', 'The narration audio is larger than its limit.', { attempts });
    const { seconds } = mp3Duration(bytes);
    return { bytes, seconds, attempts };
  }
}
