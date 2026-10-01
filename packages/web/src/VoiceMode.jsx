import { useEffect, useRef, useState } from 'react';
import { AudioLines, Mic, PanelLeftClose, PanelLeftOpen, Square } from 'lucide-react';
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
    {voice.state === 'speaking' && <button type="button" onClick={() => { voice.interrupt(); field.current?.querySelector('button')?.focus(); }} className={`${COMPOSER_PILL} inline-flex items-center gap-1.5`}>
      <Square size={11} fill="currentColor" /><span className="max-md:sr-only">Stop speaking</span>
    </button>}
  </div>;
}

// The Tutor's spoken words, left of the canvas in AdaptiveCanvas's leftRail slot: in flow, never over the surface.
// extras is tutor.extras (the Rabbit Hole suggestion and chips), shown here instead of the chat sheet while voice is on.
export function TutorCaption({ caption, state, extras }) {
  const [open, setOpen] = useState(true);
  const toggle = 'flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink';
  if (!open) return <aside aria-label="Tutor caption" data-tutor-caption className="flex h-full w-10 shrink-0 flex-col items-center border-r border-line bg-white pt-2 @max-[640px]:h-auto @max-[640px]:w-full @max-[640px]:border-r-0 @max-[640px]:border-b">
    <button type="button" aria-label="Show the Tutor caption" title="Show the Tutor caption" onClick={() => setOpen(true)} className={toggle}><PanelLeftOpen size={15} strokeWidth={1.6} /></button>
  </aside>;
  return <aside aria-label="Tutor caption" data-tutor-caption className="flex h-full w-[280px] shrink-0 flex-col border-r border-line bg-white @max-[1100px]:w-[220px] @max-[640px]:h-auto @max-[640px]:max-h-40 @max-[640px]:w-full @max-[640px]:border-r-0 @max-[640px]:border-b">
    <div className="flex h-11 shrink-0 items-center justify-between pr-2 pl-4">
      <span className="text-xs font-medium text-ink-2">Tutor</span>
      <button type="button" aria-label="Collapse the Tutor caption" title="Collapse" onClick={() => setOpen(false)} className={toggle}><PanelLeftClose size={15} strokeWidth={1.6} /></button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      {caption.previous && <p className="mb-3 text-[13px] leading-5 text-ink-2">{caption.previous}</p>}
      {caption.current ? <p className="text-[15px] leading-6 text-ink">{caption.current}</p>
        : state === 'thinking' && <p className="text-[15px] leading-6"><span className="shimmer">Thinking…</span></p>}
      {caption.error && <p className="mt-2 text-xs text-fail">{caption.error}</p>}
      {extras && <div className="mt-4 flex flex-col items-start gap-2">{extras}</div>}
    </div>
  </aside>;
}
