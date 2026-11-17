// How much of the narration script is on screen at audio time t of d seconds (TranscriptWindow.jsx). Proportional by characters, then extended to the end of the word being spoken, so
// a word is never cut and the text streams in as the voice reaches it. Unknown length (d 0, NaN) or t <= 0: nothing. t >= d: all. `split` is where the current sentence starts: earlier text is muted.
// shortcut: characters stand for time (a long pause or a number read aloud drifts a little), upgrade when the audio carries word timings.
export function revealScript(script, t, d) {
  const text = typeof script === 'string' ? script : '';
  const f = Number.isFinite(t) && Number.isFinite(d) && d > 0 ? Math.min(1, Math.max(0, t / d)) : 0;
  let end = Math.ceil(f * text.length);
  if (end <= 0) return { text: '', split: 0 };
  if (end >= text.length) end = text.length;
  else { const rest = text.slice(end).search(/\s/); end = rest < 0 ? text.length : end + rest; }
  const shown = text.slice(0, end).trimEnd();
  let split = 0;
  for (const m of shown.matchAll(/[.!?。！？]["'”)\]]*\s+/g)) split = m.index + m[0].length;
  return { text: shown, split };
}
