import { ArrowUp, Loader2 } from 'lucide-react';

// Every agent uses the same input, focus treatment, send control and sizing.
// Optional controls belong in slots; they must not replace the composer itself.
export default function ChatComposer({ value, onChange, onSubmit, inputRef, autoFocus, placeholder, busy, disabled, maxLength, leading, trailing }) {
  return <form data-chat-composer className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 focus-within:border-line-strong focus-within:shadow-[0_0_0_2px_rgba(35,131,226,0.2)]" onSubmit={event => { event.preventDefault(); if (!busy && !disabled && value.trim()) onSubmit(value); }}>
    {leading}
    <input ref={inputRef} autoFocus={autoFocus} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} disabled={disabled} className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3" />
    {trailing}
    <button type="submit" aria-label="Send" disabled={busy || disabled || !value.trim()} className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-white disabled:opacity-30">
      {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={13} strokeWidth={2} />}
    </button>
  </form>;
}
