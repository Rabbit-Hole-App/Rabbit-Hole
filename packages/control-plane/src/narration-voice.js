// THE narrator (owner decision 2026-11-17: one voice, ElevenLabs Jessica, everywhere). Every spoken path reads this one config and calls
// this one function: the card audio (explanation-audio.js), the Voice Tutor (learn-voice-tts.js), "Read it aloud" (dev-worker.js
// /api/learn/tts) and /whiteboard narration (whiteboard-tts.js). A path owns its own length cap, timeout and response handling; the
// voice, the settings, the request and the spend admission live only here. narration-voice.test.js fails if a second voice appears in src.
import { ELEVEN_MODEL, elevenSpendTransport } from './learn-paid-transport.js';
import { priceUsage } from './pricing-registry.js';

export const NARRATION_VOICE = Object.freeze({
  provider: 'elevenlabs', model: ELEVEN_MODEL,
  voiceId: 'cgSgspJ2msm6clMCkdW9', // Jessica (female), chosen in AUD-2
  speed: 1.1, stability: 0.4, similarityBoost: 0.75, // a little more energetic and faster (owner); Flash v2.5 takes no style or speaker boost
  format: 'mp3_44100_64', bitrate: 64000, // constant 64 kbps mp3: a clip's length is its bytes
});
export const VOICE_SETTINGS = Object.freeze({ stability: NARRATION_VOICE.stability, similarity_boost: NARRATION_VOICE.similarityBoost, speed: NARRATION_VOICE.speed });
export const VOICE_URL = `https://api.elevenlabs.io/v1/text-to-speech/${NARRATION_VOICE.voiceId}?output_format=${NARRATION_VOICE.format}`;
export const NARRATION_CATEGORY = 'narration_tts'; // the spend guard's category for the paths that are not the card audio (which keeps 'explanation_audio')

// The narrator's price for a number of characters, in integer micro-USD (the registry's elevenlabs input_chars row: an estimate, ElevenLabs bills plan credits).
export const narrationMicros = chars => priceUsage({ provider: NARRATION_VOICE.provider, model: NARRATION_VOICE.model, quantities: { input_chars: chars } }).micros;

// -> [url, init] for fetch.
export const narrationRequest = (env, text, signal) => [VOICE_URL, { method: 'POST', signal,
  headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
  body: JSON.stringify({ text, model_id: NARRATION_VOICE.model, voice_settings: VOICE_SETTINGS }) }];

// Speak text in the narrator's voice: admitted by the spend guard at the characters sent, then one request. -> the provider's Response (a
// whole mp3), or the guard's own refusal (isPaidSpendReply). A transport error (a timeout of the caller's signal) is thrown.
export const speakNarration = (env, text, { fetch = globalThis.fetch, signal, category = NARRATION_CATEGORY } = {}) =>
  elevenSpendTransport(env, text, () => fetch(...narrationRequest(env, text, signal)), category);
