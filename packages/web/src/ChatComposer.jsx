import { ArrowUp, Loader2, Square } from 'lucide-react';
import { composerKey } from './composer-keys.js';

// Every agent uses the same input, focus treatment, send control and sizing.
// Optional controls belong in slots; they must not replace the composer itself.
// multiline (the Agent Bar only) swaps the input for a textarea: Enter sends, Shift+Enter adds a
// line. Every other caller omits it and renders exactly the single-line input it had before.
// dock (the Mothership, and the Learn composer through the shared shell above): the platform's main input - taller
// (about 66px, 58px on phones), a stronger surface, a larger send button. Other chats keep the compact size.
// The dock floats: the popover shadow lifts it off the page (user, 2026-09-28).
// onStop: while busy, the send button becomes Stop. Callers without it keep the spinner.
// The shared composer shell (user, 2026-09-29): the Mothership and the Learn composer are one system - same dock frame,
// same controls around it, same footprint - with each caller keeping its own behaviour. Pass `dock` (and `onStop`),
// style the leading and trailing controls with these tokens, put context pills (scope chips, "Asking about: ...") above
// the composer, and wrap it in DOCK_WIDTH inside a DOCK_PAD strip. Contract: docs/features/rabbit-hole-commands.md.
export const COMPOSER_ADD = 'inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-hover hover:text-ink max-md:w-8';
export const COMPOSER_PILL = 'h-9 shrink-0 cursor-pointer rounded-lg border border-line px-2.5 text-sm text-ink-2 hover:bg-hover hover:text-ink max-md:px-1.5';
export const DOCK_WIDTH = 'mx-auto w-full max-w-[780px]';
// The strip under the dock; env() adds the phone's safe area and is 0 elsewhere.
export const DOCK_PAD = 'px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-md:px-3 max-md:pt-2 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]';

// onKeyDown (the Learn / picker, feature/parallel-work a9d770d): runs first; a handler that calls preventDefault keeps Enter from sending.
export default function ChatComposer({ value, onChange, onSubmit, onKeyDown, inputRef, autoFocus, placeholder, busy, disabled, maxLength, leading, trailing, multiline, dock, onStop }) {
  const submit = () => { if (!busy && !disabled && value.trim()) onSubmit(value); };
  // ponytail: [field-sizing:content] grows the textarea in Chromium; other engines keep one row and scroll. Add a JS auto-grow if reviewers on Safari or Firefox need it.
  const field = multiline
    ? <textarea ref={inputRef} autoFocus={autoFocus} rows={1} value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { onKeyDown?.(event); if (!event.defaultPrevented && composerKey(event.nativeEvent) === 'send') { event.preventDefault(); submit(); } }} placeholder={placeholder} maxLength={maxLength} disabled={disabled} className={`max-h-36 min-w-0 flex-1 resize-none bg-transparent outline-none [field-sizing:content] placeholder:text-ink-3 ${dock ? 'min-h-9 py-1.5 text-[15px] leading-6 max-md:text-sm max-md:placeholder:truncate' : 'min-h-7 py-1 text-sm leading-5'}`} />
    : <input ref={inputRef} autoFocus={autoFocus} value={value} onChange={event => onChange(event.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} maxLength={maxLength} disabled={disabled} className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3 ${dock ? 'h-9 text-[15px] leading-6 max-md:text-sm max-md:placeholder:truncate' : 'h-7 text-sm'}`} />;
  const frame = dock
    ? `gap-2.5 rounded-xl border border-line-strong bg-white px-3 py-3.5 max-md:gap-1.5 max-md:px-2.5 max-md:py-2.5 shadow-pop`
    : 'gap-2 rounded-lg border border-line px-2.5 py-1.5';
  return <form data-chat-composer className={`flex ${multiline ? 'items-end' : 'items-center'} ${frame} focus-within:border-line-strong focus-within:shadow-[0_0_0_2px_rgba(35,131,226,0.2)]`} onSubmit={event => { event.preventDefault(); submit(); }}>
    {leading}
    {field}
    {trailing}
    {busy && onStop ? (
      <button type="button" aria-label="Stop" title="Stop the answer" onClick={onStop} className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-white ${dock ? 'h-9 w-9' : 'h-6 w-6'}`}>
        <Square size={dock ? 13 : 10} fill="currentColor" />
      </button>
    ) : (
      <button type="submit" aria-label="Send" disabled={busy || disabled || !value.trim()} className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-white ${dock ? 'h-9 w-9 disabled:opacity-45' : 'h-6 w-6 disabled:opacity-30'}`}>
        {busy ? <Loader2 size={dock ? 16 : 13} className="animate-spin" /> : <ArrowUp size={dock ? 17 : 13} strokeWidth={2} />}
      </button>
    )}
  </form>;
}
