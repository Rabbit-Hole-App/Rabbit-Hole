// How much of the displayed transcript is on screen at audio time t of d seconds (TranscriptWindow.jsx). Proportional by characters, then extended to the end of the word being spoken, so
// a word is never cut and the text streams in as the voice reaches it. Unknown length (d 0, NaN) or t <= 0: nothing. t >= d: all. `split` is where the current sentence starts: earlier text is muted.
// An equation ($...$, $$...$$, \(...\), \[...\], exactly the spans Md's tokenizeMath finds, so what is atomic here is what is typeset there) is never shown half-written: when the reveal point
// enters one, the whole equation appears at once. Its weight is the length of its LaTeX source (it is counted as the characters it is written with).
// shortcut: characters stand for time (a long pause or a number read aloud drifts a little), upgrade when the audio carries word timings.
import { tokenizeMath } from './math-tokens.js';

// [start, end) of each equation in `text`, in order (tokenizeMath gives each one's raw source, in order; code spans keep their dollars as text).
function mathSpans(text) {
  const spans = []; let from = 0;
  for (const { raw } of tokenizeMath(text).math) {
    const start = text.indexOf(raw, from);
    if (start < 0) continue;
    spans.push([start, from = start + raw.length]);
  }
  return spans;
}

export function revealScript(script, t, d) {
  const text = typeof script === 'string' ? script : '';
  const f = Number.isFinite(t) && Number.isFinite(d) && d > 0 ? Math.min(1, Math.max(0, t / d)) : 0;
  let end = Math.ceil(f * text.length);
  if (end <= 0) return { text: '', split: 0 };
  const spans = mathSpans(text), inside = i => spans.find(([s, e]) => i > s && i < e);
  if (end >= text.length) end = text.length;
  else {
    for (;;) { // the next space outside every equation ends the word being spoken; an equation the point is in comes in whole
      const jump = inside(end);
      if (jump) { end = jump[1]; continue; }
      const rest = text.slice(end).search(/\s/);
      if (rest < 0) { end = text.length; break; }
      const space = end + rest, over = inside(space);
      if (!over) { end = space; break; }
      end = over[1];
    }
  }
  const shown = text.slice(0, end).trimEnd();
  let split = 0;
  for (const m of shown.matchAll(/[.!?。！？]["'”)\]]*\s+/g)) if (!inside(m.index)) split = m.index + m[0].length;
  return { text: shown, split };
}
