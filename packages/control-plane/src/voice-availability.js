// The one switch for Voice Mode listening (ElevenLabs Scribe). Owner, 2026-10-12 (r36): new listening sessions are
// paused until a provider-confirmed billable session bound exists. The browser mic (web/src/LearnVoice.jsx) and the
// token route (learn-voice-routes.js, FX-71) both read it, so flipping it re-enables both. Fish narration is unaffected.
export const LISTENING_PAUSED = true;
