// The transcript window beside a playing Explanation card (owner 2026-11-17; docs/features/explain.md "Audio control"). Mounted once inside the card's canvas node (AdaptiveCanvas CanvasNode), so
// it moves and scales with the card. The text is the displayed transcript (narration.transcript, LaTeX equations between dollars, else the script), typeset by Md.jsx MdInline mathOnly like the follow-up strips. No panel: no fill, border, shadow or blur; the text floats on the canvas in the canvas ink (--learn-canvas-ink, black in light, white in dark; earlier text at reduced opacity).
// The wrapper never takes the pointer; only the text and the close button do (a press on them never drags or selects the card, the wheel scrolls the text and never the canvas).
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { closeTranscript, usePlayingCard, usePlayingTranscript } from './audio-playing.js';
import { MdInline } from './Md.jsx';
import { revealScript, transcriptHeight } from './transcript-reveal.js';
import { followAfterScroll, scrollTopAfterGrow } from './transcript-scroll.js';

const INK = 'text-[var(--learn-canvas-ink)]';
const stop = event => event.stopPropagation();
const reducedMotion = () => typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-reduce-motion'));

export default function TranscriptWindow({ id }) {
  const data = usePlayingTranscript(id), playing = usePlayingCard(id);
  const box = useRef(null), following = useRef(true), busy = useRef(null), wasPlaying = useRef(false); // busy: a timer while our own smooth scroll is still moving, so its scroll events are not the learner's
  const { text, split } = data ? revealScript(data.script, data.t, data.d) : { text: '', split: 0 };
  const height = useMemo(() => transcriptHeight(data?.script), [data?.script]); // fixed for the whole run: about seven sentences, never the card's height
  useEffect(() => { // the canvas's wheel handler listens on an ancestor: stopping the event here keeps the wheel on the text
    const element = box.current;
    if (!element) return undefined;
    element.addEventListener('wheel', stop, { passive: true });
    return () => element.removeEventListener('wheel', stop);
  }, [!!data]);
  useEffect(() => () => clearTimeout(busy.current), []);
  // After the new words are laid out (an equation arrives whole, so its height counts): keep the newest text at the bottom of the block unless the learner scrolled up.
  // A new run (nothing shown yet) and a play or replay press follow again. Smooth (the browser's short ease) unless motion is reduced.
  useLayoutEffect(() => {
    const element = box.current, starting = playing && !wasPlaying.current;
    wasPlaying.current = playing;
    if (!element) return;
    if (!text || starting) following.current = true;
    const top = scrollTopAfterGrow(following.current, element);
    if (top === element.scrollTop) return;
    const instant = reducedMotion();
    clearTimeout(busy.current); busy.current = setTimeout(() => { busy.current = null; }, instant ? 50 : 400);
    if (element.scrollTo) element.scrollTo({ top, behavior: instant ? 'auto' : 'smooth' }); else element.scrollTop = top;
  }, [text, playing]);
  if (!data) return null;
  return (
    <div role="region" aria-label="Transcript" data-card-transcript className="pointer-events-none absolute top-0 left-full z-30 ml-3 flex w-72 flex-col">
      <div className="flex shrink-0 items-center justify-between pb-1">
        <span className={`text-xs ${INK} opacity-60`}>Transcript</span>
        <button type="button" title="Close transcript" aria-label="Close transcript" onPointerDown={stop} onClick={() => closeTranscript(id)}
          className={`pointer-events-auto grid h-6 w-6 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 ${INK} opacity-60 hover:bg-hover hover:opacity-100 focus-visible:outline-2 focus-visible:outline-accent`}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div ref={box} data-scroll data-transcript-text aria-live="off" onPointerDown={stop}
        style={{ height }} onScroll={event => { following.current = followAfterScroll(following.current, event.currentTarget, busy.current !== null); }}
        className={`pointer-events-auto shrink-0 cursor-text overflow-y-auto text-[13px] leading-snug select-text ${INK} [&_.katex-error]:!text-[var(--learn-canvas-ink)]`}>
        <span className="opacity-60"><MdInline text={text.slice(0, split)} mathOnly /></span><MdInline text={text.slice(split)} mathOnly />
      </div>
    </div>
  );
}
