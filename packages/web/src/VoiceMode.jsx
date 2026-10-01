import { useEffect, useRef, useState } from 'react';
import { AudioLines, MessageSquareText, Mic, Minus, Square } from 'lucide-react';
import { COMPOSER_ADD, COMPOSER_PILL } from './ChatComposer.jsx';

// Voice Mode's UI (docs/features/voice-tutor-mvp.md, sections 6 and 6b). voice is useVoiceSession's
// { state, caption: { current, previous, error }, enter, exit, interrupt }. It carries no learner
// words, and nothing here may render any: the learner's speech is never shown (VOICE-04/06).

// The mic: neutral in the composer's leading row while voice is off; the red Rabbit Hole mic,
// breathing, in every on state. Clicking the red mic always turns Voice Mode off. disabled: a typed
// answer is still in flight (its Stop lives where VoiceField would go), so voice waits for it.
export function VoiceToggle({ voice, disabled = false }) {
  if (voice.state === 'off') return <button type="button" aria-label="Voice mode" title="Talk with the Tutor" aria-pressed={false} disabled={disabled} onClick={() => voice.enter()} className={`${COMPOSER_ADD} ${disabled ? 'cursor-default opacity-45' : ''}`}>
    <Mic size={16} strokeWidth={1.5} />
  </button>;
  return <button type="button" aria-label="Voice mode on - turn off" title="Turn Voice Mode off" aria-pressed={true} onClick={() => voice.exit()} data-voice-state={voice.state}
    className={`voice-breathe ${voice.state === 'listening' ? 'voice-breathe-live' : ''} relative inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#b42318] text-white`}>
    <Mic size={16} strokeWidth={1.8} />
  </button>;
}

// The composer field while voice is on: the red mic, the state, and Stop speaking only while the Tutor speaks.
// The neutral mic and Stop speaking unmount under a keyboard user, so focus that fell to the page lands on
// the red mic. Below md the label is just the state word and Stop speaking an icon, so the state stays visible.
export function VoiceField({ voice }) {
  const field = useRef(null);
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) field.current?.querySelector('button')?.focus();
  }, [voice.state]);
  return <div ref={field} data-voice-field className="flex min-w-0 flex-1 items-center gap-2.5 max-md:gap-1.5">
    <VoiceToggle voice={voice} />
    <span role="status" aria-live="polite" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[15px] text-ink-2 max-md:text-sm">
      <span className="max-md:sr-only">Voice on ·</span>{' '}
      {voice.state === 'thinking' ? <span className="shimmer">Thinking…</span>
        : voice.state === 'speaking' ? <><AudioLines size={15} strokeWidth={1.6} className="shrink-0 text-[#b42318]" />Tutor speaking</>
        : 'Listening'}
    </span>
    {/* The learner can take the floor back at any point of a turn: while the Tutor thinks or speaks. */}
    {(voice.state === 'speaking' || voice.state === 'thinking') && <button type="button" aria-label={voice.state === 'speaking' ? 'Stop speaking' : 'Stop the Tutor'} onClick={() => { voice.interrupt(); field.current?.querySelector('button')?.focus(); }} className={`${COMPOSER_PILL} inline-flex items-center gap-1.5`}>
      <Square size={11} fill="currentColor" /><span className="max-md:sr-only">{voice.state === 'speaking' ? 'Stop speaking' : 'Stop'}</span>
    </button>}
  </div>;
}

// The Tutor's spoken words in a small window at the lower left of the canvas (owner, 2026-10-01), anchored by
// AdaptiveCanvas's leftRail slot. Only the reply being spoken now, no history: the next turn's Thinking… replaces
// it. extras is tutor.extras (the Rabbit Hole suggestion and chips), shown here instead of the chat sheet while
// voice is on. On a phone it is an in-flow strip above the canvas.
export function TutorCaption({ caption, state, extras }) {
  const [open, setOpen] = useState(true);
  const thinking = state === 'thinking', hasExtras = !!extras;
  // A new Rabbit Hole suggestion or chip row opens a hidden window: nothing else shows it while voice is on.
  useEffect(() => { if (hasExtras) setOpen(true); }, [hasExtras]);
  if (!thinking && !caption.current && !caption.error && !extras) return null;
  const place = 'absolute bottom-3 left-3 @max-[640px]:relative @max-[640px]:bottom-auto @max-[640px]:left-auto';
  // One toggle node in both states (first child), so keyboard focus survives Hide and Show.
  const toggle = <button type="button" aria-expanded={open} aria-label={open ? 'Hide the Tutor caption' : 'Show the Tutor caption'} title={open ? 'Hide' : 'Show the Tutor caption'}
    onClick={() => setOpen(!open)} className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink ${open ? 'absolute top-0.5 right-1' : ''}`}>
    {open ? <Minus size={14} strokeWidth={1.6} /> : <MessageSquareText size={15} strokeWidth={1.6} />}
  </button>;
  if (!open) return <aside aria-label="Tutor caption" data-tutor-caption className={`${place} rounded-lg border border-line bg-white shadow-pop`}>{toggle}</aside>;
  // Only the reply text scrolls; the suggestion's buttons stay in view under it, even while the Tutor thinks.
  // A failed turn shows its error, not the last reply as if it answered.
  return <aside aria-label="Tutor caption" data-tutor-caption className={`${place} flex max-h-[180px] w-[300px] flex-col rounded-xl border border-line bg-white shadow-pop @max-[640px]:w-full @max-[640px]:rounded-none @max-[640px]:border-x-0 @max-[640px]:border-t-0 @max-[640px]:shadow-none`}>
    {toggle}
    <span className="flex h-8 shrink-0 items-center pl-3 text-xs font-medium text-ink-2">Tutor</span>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
      {thinking ? <p className="text-sm leading-5"><span className="shimmer">Thinking…</span></p>
        : caption.current && !caption.error && <p className="text-sm leading-5 text-ink">{caption.current}</p>}
      {caption.error && <p className="text-xs text-fail">{caption.error}</p>}
    </div>
    {extras && <div className="flex shrink-0 flex-col items-start gap-2 px-3 pb-3">{extras}</div>}
  </aside>;
}
