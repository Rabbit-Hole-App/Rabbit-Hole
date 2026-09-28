import { ArrowUp, Loader2, Square } from 'lucide-react';
import { composerKey } from './composer-keys.js';

// Every agent uses the same input, focus treatment, send control and sizing.
// Optional controls belong in slots; they must not replace the composer itself.
// multiline (the Agent Bar only) swaps the input for a textarea: Enter sends, Shift+Enter adds a
// line. Every other caller omits it and renders exactly the single-line input it had before.
// dock (the Agent Bar only, user 2026-09-28): the platform's main input - taller (about 66px, 58px on
// phones), a stronger surface, a larger send button. The Learn dock and chats keep the compact size.
// dock='float' lifts it with the popover shadow (the WP5 review's second variant).
// onStop (the Agent Bar only): while busy, the send button becomes Stop. Callers without it keep the spinner.
export default function ChatComposer({ value, onChange, onSubmit, inputRef, autoFocus, placeholder, busy, disabled, maxLength, leading, trailing, multiline, dock, onStop }) {
  const submit = () => { if (!busy && !disabled && value.trim()) onSubmit(value); };
  // ponytail: [field-sizing:content] grows the textarea in Chromium; other engines keep one row and scroll. Add a JS auto-grow if reviewers on Safari or Firefox need it.
  const field = multiline
    ? <textarea ref={inputRef} autoFocus={autoFocus} rows={1} value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (composerKey(event.nativeEvent) === 'send') { event.preventDefault(); submit(); } }} placeholder={placeholder} maxLength={maxLength} disabled={disabled} className={`max-h-36 min-w-0 flex-1 resize-none bg-transparent outline-none [field-sizing:content] placeholder:text-ink-3 ${dock ? 'min-h-9 py-1.5 text-[15px] leading-6 max-md:text-sm max-md:placeholder:truncate' : 'min-h-7 py-1 text-sm leading-5'}`} />
    : <input ref={inputRef} autoFocus={autoFocus} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} disabled={disabled} className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3" />;
  const frame = dock
    ? `gap-2.5 rounded-xl border border-line-strong bg-white px-3 py-3.5 max-md:gap-1.5 max-md:px-2.5 max-md:py-2.5 ${dock === 'float' ? 'shadow-pop' : 'shadow-[0_2px_8px_rgba(15,15,15,0.07)]'}`
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
