import { ArrowUp, Loader2 } from 'lucide-react';
import { composerKey } from './composer-keys.js';

// Every agent uses the same input, focus treatment, send control and sizing.
// Optional controls belong in slots; they must not replace the composer itself.
// multiline (the Agent Bar only) swaps the input for a textarea: Enter sends, Shift+Enter adds a
// line. Every other caller omits it and renders exactly the single-line input it had before.
export default function ChatComposer({ value, onChange, onSubmit, inputRef, autoFocus, placeholder, busy, disabled, maxLength, leading, trailing, multiline }) {
  const submit = () => { if (!busy && !disabled && value.trim()) onSubmit(value); };
  // ponytail: [field-sizing:content] grows the textarea in Chromium; other engines keep one row and scroll. Add a JS auto-grow if reviewers on Safari or Firefox need it.
  const field = multiline
    ? <textarea ref={inputRef} autoFocus={autoFocus} rows={1} value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (composerKey(event.nativeEvent) === 'send') { event.preventDefault(); submit(); } }} placeholder={placeholder} maxLength={maxLength} disabled={disabled} className="max-h-36 min-h-7 min-w-0 flex-1 resize-none bg-transparent py-1 text-sm leading-5 outline-none [field-sizing:content] placeholder:text-ink-3" />
    : <input ref={inputRef} autoFocus={autoFocus} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} disabled={disabled} className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3" />;
  return <form data-chat-composer className={`flex ${multiline ? 'items-end' : 'items-center'} gap-2 rounded-lg border border-line px-2.5 py-1.5 focus-within:border-line-strong focus-within:shadow-[0_0_0_2px_rgba(35,131,226,0.2)]`} onSubmit={event => { event.preventDefault(); submit(); }}>
    {leading}
    {field}
    {trailing}
    <button type="submit" aria-label="Send" disabled={busy || disabled || !value.trim()} className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-white disabled:opacity-30">
      {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={13} strokeWidth={2} />}
    </button>
  </form>;
}
