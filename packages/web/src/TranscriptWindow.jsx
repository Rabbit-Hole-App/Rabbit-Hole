// The transcript window beside a playing Explanation card (owner 2026-11-17; docs/features/explain.md "Audio control"). Mounted once inside the card's canvas node (AdaptiveCanvas CanvasNode), so
// it moves and scales with the card. The text is the displayed transcript (narration.transcript, LaTeX equations between dollars, else the script), typeset by Md.jsx MdInline mathOnly like the follow-up strips. No panel: no fill, border, shadow or blur; the text floats on the canvas in the canvas ink (--learn-canvas-ink, black in light, white in dark; earlier text at reduced opacity).
// The wrapper never takes the pointer; only the text and the close button do (a press on them never drags or selects the card, the wheel scrolls the text and never the canvas).
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { closeTranscript, usePlayingTranscript } from './audio-playing.js';
import { MdInline } from './Md.jsx';
import { revealScript } from './transcript-reveal.js';

const INK = 'text-[var(--learn-canvas-ink)]';
const stop = event => event.stopPropagation();

export default function TranscriptWindow({ id }) {
  const data = usePlayingTranscript(id);
  const box = useRef(null), stick = useRef(true);
  const { text, split } = data ? revealScript(data.script, data.t, data.d) : { text: '', split: 0 };
  useEffect(() => { // the canvas's wheel handler listens on an ancestor: stopping the event here keeps the wheel on the text
    const element = box.current;
    if (!element) return undefined;
    element.addEventListener('wheel', stop, { passive: true });
    return () => element.removeEventListener('wheel', stop);
  }, [!!data]);
  useEffect(() => { // follow the newest line unless the learner scrolled up; a new run (nothing shown yet) follows again. Instant, so reduced motion needs no special case.
    const element = box.current;
    if (!element) return;
    if (!text) stick.current = true;
    if (stick.current) element.scrollTop = element.scrollHeight;
  }, [text]);
  if (!data) return null;
  return (
    <div role="region" aria-label="Transcript" data-card-transcript className="pointer-events-none absolute top-0 left-full z-30 ml-3 flex max-h-full w-72 flex-col">
      <div className="flex shrink-0 items-center justify-between pb-1">
        <span className={`text-xs ${INK} opacity-60`}>Transcript</span>
        <button type="button" title="Close transcript" aria-label="Close transcript" onPointerDown={stop} onClick={() => closeTranscript(id)}
          className={`pointer-events-auto grid h-6 w-6 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 ${INK} opacity-60 hover:bg-hover hover:opacity-100 focus-visible:outline-2 focus-visible:outline-accent`}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div ref={box} data-scroll data-transcript-text aria-live="off" onPointerDown={stop}
        onScroll={event => { const e = event.currentTarget; stick.current = e.scrollHeight - e.scrollTop - e.clientHeight < 24; }}
        className={`pointer-events-auto min-h-0 flex-1 cursor-text overflow-y-auto text-[13px] leading-snug select-text ${INK} [&_.katex-error]:!text-[var(--learn-canvas-ink)]`}>
        <span className="opacity-60"><MdInline text={text.slice(0, split)} mathOnly /></span><MdInline text={text.slice(split)} mathOnly />
      </div>
    </div>
  );
}
