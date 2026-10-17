import { createContext, useContext } from 'react';
import { ArrowUp, ChevronDown, Loader2, Square } from 'lucide-react';
import { composerKey } from './composer-keys.js';
import { useChatWorkspace } from './chat-workspace.jsx';

// Every agent uses the same input, focus treatment, send control and sizing.
// Optional controls belong in slots; they must not replace the composer itself.
// multiline (the Agent Bar only) swaps the input for a textarea: Enter sends, Shift+Enter adds a
// line. Every other caller omits it and renders exactly the single-line input it had before.
// dock (the Mothership, and the Learn composer through the shared shell above): the platform's main input - taller
// (about 66px, 58px on phones), a stronger surface, a larger send button. Other chats keep the compact size.
// The dock floats: the popover shadow lifts it off the page (user, 2026-09-28).
// onStop: while busy, the send button becomes Stop. Callers without it keep the spinner.
// flat (the Agent Bar's workspace dock, workspace-dock.md §2): the dock is chrome, so the input keeps a hairline shadow
// instead of the popover lift; the Learn composer keeps its float.
// The shared composer shell (user, 2026-09-29): the Mothership and the Learn composer are one system - same dock frame,
// same controls around it, same footprint - with each caller keeping its own behaviour. Pass `dock` (and `onStop`),
// style the leading and trailing controls with these tokens, put context pills (scope chips, "Asking about: ...") above
// the composer, and wrap it in DOCK_WIDTH inside a DOCK_PAD strip. Contract: docs/features/rabbit-hole-commands.md.
export const COMPOSER_ADD = 'inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-hover hover:text-ink max-md:w-8';
export const COMPOSER_PILL = 'h-9 shrink-0 cursor-pointer rounded-lg border border-line px-2.5 text-sm text-ink-2 hover:bg-hover hover:text-ink max-md:px-1.5';
export const DOCK_WIDTH = 'mx-auto w-full max-w-[780px]';
// The canvas provides a hide function around its composer (AdaptiveCanvas, owner 2026-10-13: the hide icon "should be better placed and
// not hanging above"): the dock composer then shows Hide chat composer as one more icon button in its own row, before Send.
export const ComposerHide = createContext(null);
export function ComposerHideButton() {
  const hide = useContext(ComposerHide);
  return hide ? <button type="button" data-composer-hide aria-label="Hide chat composer" title="Hide chat composer - your draft stays" onClick={hide} className={COMPOSER_ADD}><ChevronDown size={14} strokeWidth={1.5} /></button> : null;
}
// The strip under the dock; env() adds the phone's safe area and is 0 elsewhere.
export const DOCK_PAD = 'px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-md:px-3 max-md:pt-2 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]';

// onKeyDown (the Learn / picker, feature/parallel-work a9d770d): runs first; a handler that calls preventDefault keeps Enter from sending.
// ready: the caller can send an empty line (Learn, with a command chosen: a bare /dive).
// voice (Learn Voice Mode, docs/features/voice-tutor-mvp.md): a node that stands in for the field and the Send/Stop
// control while voice is on; the frame, leading and trailing stay. Callers without it render exactly as before.
// stacked (the Learn Chat pane, owner brief 2026-10-13 section 4): a 12px-rounded box with the multiline field on top
// (about two lines, growing to a bound, then scrolling), the `chips` slot under it, then ONE toolbar row - leading,
// a spacer, trailing, and Send (Stop while busy) at the far right. Its toolbar controls take COMPOSER_TOOL.
export const COMPOSER_TOOL = 'inline-flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg px-1.5 text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent';
export default function ChatComposer({ value, onChange, onSubmit, onKeyDown, inputRef, autoFocus, placeholder, busy, disabled, maxLength, leading, trailing, multiline, dock, flat = false, onStop, ready = false, voice = null, stacked = false, chips = null }) {
  // The Table of contents' own composer (TocWorkspace) is data-toc-composer, so [data-chat-composer] stays the one Chat composer.
  const tocView = !!useChatWorkspace()?.tocView;
  const submit = () => { if (!busy && !disabled && (ready || value.trim())) onSubmit(value); };
  const keys = event => { onKeyDown?.(event); if (!event.defaultPrevented && composerKey(event.nativeEvent) === 'send') { event.preventDefault(); submit(); } };
  // ponytail: [field-sizing:content] grows the textarea in Chromium; other engines keep one row and scroll. Add a JS auto-grow if reviewers on Safari or Firefox need it.
  const field = stacked
    ? <textarea ref={inputRef} autoFocus={autoFocus} rows={2} value={value} onChange={event => onChange(event.target.value)} onKeyDown={keys} placeholder={placeholder} maxLength={maxLength} disabled={disabled} className="max-h-48 min-h-12 w-full resize-none bg-transparent px-1 text-[15px] leading-6 outline-none [field-sizing:content] placeholder:text-ink-3 max-md:text-sm" />
    : multiline
    ? <textarea ref={inputRef} autoFocus={autoFocus} rows={1} value={value} onChange={event => onChange(event.target.value)} onKeyDown={keys} placeholder={placeholder} maxLength={maxLength} disabled={disabled} className={`max-h-33 min-w-0 flex-1 resize-none bg-transparent outline-none [field-sizing:content] placeholder:text-ink-3 ${dock ? 'min-h-9 py-1.5 text-[15px] leading-6 max-md:text-sm max-md:placeholder:truncate' : 'min-h-7 py-1 text-sm leading-5'}`} />
    : <input ref={inputRef} autoFocus={autoFocus} value={value} onChange={event => onChange(event.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} maxLength={maxLength} disabled={disabled} className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3 ${dock ? 'h-9 text-[15px] leading-6 max-md:text-sm max-md:placeholder:truncate' : 'h-7 text-sm'}`} />;
  const size = stacked ? 'h-8 w-8' : dock ? 'h-9 w-9' : 'h-6 w-6';
  const send = voice ? null : busy && onStop ? (
    <button type="button" aria-label="Stop" title="Stop the answer" onClick={onStop} className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-white ${size}`}>
      <Square size={stacked ? 12 : dock ? 13 : 10} fill="currentColor" />
    </button>
  ) : (
    <button type="submit" aria-label="Send" disabled={busy || disabled || !(ready || value.trim())} className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-white ${size} ${dock || stacked ? 'disabled:opacity-45' : 'disabled:opacity-30'}`}>
      {busy ? <Loader2 size={dock || stacked ? 16 : 13} className="animate-spin" /> : <ArrowUp size={dock ? 17 : stacked ? 16 : 13} strokeWidth={2} />}
    </button>
  );
  if (stacked) return <form {...{ [tocView ? 'data-toc-composer' : 'data-chat-composer']: true }} data-composer-stacked className="flex flex-col gap-1.5 rounded-xl border border-line bg-white p-2.5 focus-within:border-line-strong focus-within:shadow-[0_0_0_2px_rgba(35,131,226,0.2)]" onSubmit={event => { event.preventDefault(); submit(); }}>
    {voice || field}
    {chips}
    <div data-composer-toolbar className="flex min-w-0 items-center gap-0.5">
      {leading}
      <span className="min-w-0 flex-1" />
      {trailing}
      {send}
    </div>
  </form>;
  const frame = dock
    ? `gap-2.5 rounded-xl border border-line-strong bg-white px-3 py-3.5 max-md:gap-1.5 max-md:px-2.5 max-md:py-2.5 ${flat ? 'shadow-[0_1px_2px_rgba(15,15,15,0.05)]' : 'shadow-pop'}`
    : 'gap-2 rounded-lg border border-line px-2.5 py-1.5';
  return <form data-chat-composer className={`flex ${multiline ? 'items-end' : 'items-center'} ${frame} focus-within:border-line-strong focus-within:shadow-[0_0_0_2px_rgba(35,131,226,0.2)]`} onSubmit={event => { event.preventDefault(); submit(); }}>
    {leading}
    {voice || field}
    {trailing}
    {dock && <ComposerHideButton />}
    {send}
  </form>;
}
