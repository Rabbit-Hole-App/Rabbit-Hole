// Voice Mode telemetry (docs/features/voice-tutor-mvp.md §7): a window 'small:tutor-voice' event and a
// performance mark per step. Ids, kinds and timings only, never words. small:tutor-bench is untouched.
export function voiceEvent(name, detail = {}) {
  try { globalThis.performance?.mark?.(`rh:voice:${name}`); } catch { /* a mark is best effort */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('small:tutor-voice', { detail: { name, ...detail } }));
}
