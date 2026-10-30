import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Globe, X } from 'lucide-react';
import { Button } from './ui.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';
import { CONTEXT_ACCEPT } from './context-docs.js';

// Add context (owner brief 2026-10-29 sections 1 and 5): the one dialog both canvas-chat entries open - the Context header's
// Add context and the composer's + menu Upload Context. Browse files is the existing upload (chat.context.upload: the same
// types, checks and limits); a web address is added by chat.context.addUrl (captured, checked, then a Context document). The
// dialog never attaches anything itself and closing it cancels nothing: an address already sent finishes on its Context row.
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="file"]), [tabindex]:not([tabindex="-1"])';

export default function AddContextDialog({ onClose }) {
  const chat = useChatWorkspace(), titleId = useId(), inputId = useId(), noteId = useId();
  const box = useRef(null), input = useRef(null), picker = useRef(null), mounted = useRef(true);
  const [url, setUrl] = useState(''), [state, setState] = useState({ status: 'idle' });
  useEffect(() => {
    mounted.current = true;
    // Focus moves in on open and goes back on close, to what opened it when it is still on the page.
    const opener = document.activeElement;
    input.current?.focus();
    // Capture phase: while this dialog is open, Escape closes it and nothing under it.
    const esc = event => { if (event.key !== 'Escape') return; event.stopPropagation(); onClose(); };
    window.addEventListener('keydown', esc, true);
    return () => {
      mounted.current = false;
      window.removeEventListener('keydown', esc, true);
      if (opener && opener !== document.body && opener.isConnected) opener.focus?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!chat) return null;
  // Tab and Shift+Tab stay inside the dialog (aria-modal).
  const trap = event => {
    if (event.key !== 'Tab') return;
    const all = [...box.current.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length);
    if (!all.length) return;
    const [first, last] = [all[0], all.at(-1)];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const adding = state.status === 'adding';
  const submit = async event => {
    event.preventDefault();
    if (adding) return;
    if (!url.trim()) { setState({ status: 'error', message: 'Paste a web address.' }); input.current?.focus(); return; }
    setState({ status: 'adding' });
    try {
      const doc = await chat.context.addUrl(url.trim());
      if (!mounted.current) return;
      setUrl('');
      setState({ status: 'ready', message: `Added ${doc?.name || 'the page'} to Context.` });
    } catch (error) {
      if (!mounted.current) return;
      // The address stays in the box for another try.
      setState({ status: 'error', message: error.message });
      input.current?.focus();
    }
  };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4 animate-[fade-in_100ms_ease-out]" onMouseDown={onClose}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId} data-add-context onKeyDown={trap} onMouseDown={event => event.stopPropagation()}
        className="w-full max-w-[440px] rounded-[10px] border border-line bg-surface p-[18px] text-sm leading-5 text-ink shadow-pop">
        <div className="flex items-center justify-between gap-2 pb-3">
          <h2 id={titleId} className="text-[17px] leading-6 font-medium">Add context</h2>
          <button type="button" aria-label="Close" title="Close" data-add-context-close onClick={onClose}
            className="-mr-2 flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent/35 max-[420px]:h-11 max-[420px]:w-11">
            <X size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <input ref={picker} type="file" accept={CONTEXT_ACCEPT} className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { chat.context.upload(file); onClose(); } }} />
        <Button variant="secondary" data-add-context-browse onClick={() => picker.current?.click()} className="h-[46px] w-full justify-center text-sm">
          <FolderOpen size={16} strokeWidth={1.5} aria-hidden />Browse files</Button>
        <div data-add-context-divider className="flex items-center gap-3 py-4 text-xs leading-[18px] text-ink-3">
          <span aria-hidden className="h-px flex-1 bg-line" />or add a web page<span aria-hidden className="h-px flex-1 bg-line" />
        </div>
        <form onSubmit={submit} noValidate>
          <label htmlFor={inputId} className="block pb-1.5 text-[13px] leading-[18px] text-ink-2">Web address</label>
          <div className="flex gap-2 max-[420px]:flex-col">
            <input ref={input} id={inputId} type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://" value={url} data-add-context-url
              onChange={event => { setUrl(event.target.value); if (state.status === 'error' || state.status === 'ready') setState({ status: 'idle' }); }}
              aria-invalid={state.status === 'error' || undefined} aria-describedby={noteId}
              className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-base leading-6 text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_2px_rgba(35,131,226,0.2)] aria-invalid:border-danger max-[420px]:h-11 max-[420px]:flex-none" />
            <Button type="submit" variant="action" data-add-context-submit disabled={adding} className="h-10 shrink-0 justify-center px-3 max-[420px]:h-11">
              <Globe size={16} strokeWidth={1.5} aria-hidden />{adding ? 'Adding' : 'Add URL'}</Button>
          </div>
          {/* One live line: adding, added, or why not (an alert, so a screen reader hears it at once). */}
          <p id={noteId} role={state.status === 'error' ? 'alert' : 'status'} data-add-context-note={state.status}
            className={`min-h-[18px] pt-2 text-xs leading-[18px] break-words ${state.status === 'error' ? 'text-danger' : 'text-ink-3'}`}>
            {adding ? 'Capturing and checking the page. You can close this; it keeps going in Context.' : state.message || ''}
          </p>
        </form>
      </div>
    </div>,
    document.body,
  );
}
