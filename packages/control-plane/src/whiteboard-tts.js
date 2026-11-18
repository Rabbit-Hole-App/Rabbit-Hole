// /whiteboard narration (roadmap v1 sections 4.2 and 6.1): one narrator request per beat through speakNarration (narration-voice.js, the one voice
// of every spoken path), 20 s per request as the Voice Tutor route. Acceptance is the provider's response headers: a 429, or a
// request that failed or timed out before them, is sent once more; once it has answered 200, a body that does not arrive is never asked for
// again (`reconciling`: its charge stands until the job's refund by key). The duration is measured from the MP3 frames (whiteboard-mp3.js).
import { isPaidSpendReply } from './learn-paid-transport.js';
import { speakNarration } from './narration-voice.js';
import { WHITEBOARD_LIMITS as L } from './whiteboard-policy.js';
import { mp3Duration } from './whiteboard-mp3.js';

export const TTS_TIMEOUT_MS = 20000;

const failure = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

// env: the job's usage-scoped env (the generation key). -> { bytes: Uint8Array, seconds, attempts }
export async function narrateBeat(env, text, { fetch = globalThis.fetch, timeoutMs = TTS_TIMEOUT_MS } = {}) {
  if (!env.ELEVENLABS_API_KEY) throw failure('tts_not_configured', 'The narrator is not configured here.');
  let attempts = 0;
  for (;;) {
    attempts++;
    let response;
    try {
      response = await speakNarration(env, text, { fetch, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      if (attempts < 2) continue; // before acceptance: one more
      throw failure('tts_failed', `The narrator did not answer: ${error?.name || 'error'}.`, { attempts });
    }
    if (isPaidSpendReply(response)) throw failure('spend_refused', 'The narration was not admitted.', { attempts });
    if (response.status === 429 && attempts < 2) continue;
    if (!response.ok) throw failure('tts_failed', `The narrator answered ${response.status}.`, { attempts });
    let bytes;
    try { bytes = new Uint8Array(await response.arrayBuffer()); }
    catch { throw failure('reconciling', 'The narrator accepted the request and its audio did not arrive; it is not asked for again.', { attempts }); }
    if (bytes.length > L.beatAudioBytes) throw failure('tts_failed', 'The narration audio is larger than its limit.', { attempts });
    const { seconds } = mp3Duration(bytes);
    return { bytes, seconds, attempts };
  }
}
