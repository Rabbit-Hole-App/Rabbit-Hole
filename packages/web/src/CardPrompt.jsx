import { useEffect, useRef, useState } from 'react';
import { Copy, MessageSquarePlus } from 'lucide-react';
import { copyAnswer } from './AnswerFooter.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';

const icon = 'flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink';
const control = 'pointer-events-auto cursor-pointer rounded-md px-1.5 py-0.5 text-xs text-ink-2 select-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent';

// The one prompt reveal (docs/features/card-prompt.md; owner brief 2026-10-23): the words typed to make something stay hidden
// until asked for. Closed, only a small Show prompt button (when `visible`); open, the words, Copy, the chat icon and Hide,
// and it stays open until Hide or Escape - the pointer leaving never closes it. Copy writes `copy` (default `text`), complete.
// The chat icon puts the words in the Chat box (the draft rules: a written draft is kept), never sends, and is absent off a
// Learn canvas (a shared board has no Chat box). Hiding returns focus to the Show prompt button.
export function PromptReveal({ text, copy = text, visible = true, className = '', buttonClassName = '' }) {
  const button = useRef(null), panel = useRef(null);
  const chat = useChatWorkspace();
  const [open, setOpen] = useState(false);
  const [back, setBack] = useState(false); // focus is returning to the button, so it stays drawn until it has the focus
  const [status, setStatus] = useState(null);
  useEffect(() => { if (back) button.current?.focus(); }, [back, open]);
  useEffect(() => { if (open) panel.current?.focus(); }, [open]); // the opened panel takes focus, so Escape and Tab work from the keyboard
  useEffect(() => { if (!status) return undefined; const timer = setTimeout(() => setStatus(null), 1800); return () => clearTimeout(timer); }, [status]);
  if (!text) return null;
  const hide = () => { setOpen(false); setBack(true); };
  const copyText = async () => { try { await copyAnswer({ text: copy }); setStatus('Copied'); } catch { setStatus('Copy failed'); } };
  if (!open) {
    if (!visible && !back) return null;
    return <button ref={button} type="button" data-card-prompt-show aria-expanded="false" onBlur={() => setBack(false)}
      onPointerDown={event => event.stopPropagation()} onClick={() => { setBack(false); setOpen(true); }}
      className={`${control} border border-line bg-white shadow-sm ${buttonClassName}`}>Show prompt</button>;
  }
  return (
    <div ref={panel} tabIndex={-1} data-card-prompt className={`pointer-events-auto outline-none rounded-lg border border-line bg-white shadow-md ${className}`}
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); hide(); } }}>
      <div className="flex items-center gap-1 px-1.5 py-0.5">
        <span className="flex-1 px-1.5 text-xs text-ink-2">Prompt</span>
        {status && <span role="status" className={`text-xs ${status === 'Copied' ? 'text-ink-2' : 'text-danger'}`}>{status}</span>}
        <button type="button" aria-label="Copy prompt" title="Copy prompt" data-card-prompt-copy className={icon} onClick={copyText}><Copy size={13} /></button>
        {chat && <button type="button" aria-label="Put prompt in chat" title="Put this prompt in the chat box to edit and send" data-card-prompt-chat className={icon}
          onClick={() => chat.composer.prepare({ text: copy })}><MessageSquarePlus size={13} /></button>}
        <button type="button" data-card-prompt-hide aria-expanded="true" onClick={hide} className={control}>Hide</button>
      </div>
      {/* A long prompt scrolls inside the panel (data-scroll: the wheel scrolls it, not the canvas). */}
      <p data-card-prompt-text data-scroll className="max-h-40 overflow-y-auto border-t border-line px-3 py-2 text-xs whitespace-pre-wrap break-words text-ink">{text}</p>
    </div>
  );
}

// A generated card's prompt: nothing at rest and no reserved height. Hovering the card (or focusing into it, or selecting it:
// touch has no hover) draws a small Show prompt button over the card's foot, bottom left, clear of the resize corner; opened, the panel overlays the foot and stays until
// dismissed. The card is the parent element (CanvasNode: positioned, focusable). A view-only board's cards take no pointer, so
// there the selected card shows the button; the button and panel take the pointer back (pointer-events-auto).
export default function CardPrompt({ text, selected = false }) {
  const root = useRef(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    const card = root.current?.parentElement;
    if (!card) return undefined;
    const on = [['pointerenter', () => setHover(true)], ['pointerleave', () => setHover(false)], ['focusin', () => setFocus(true)],
      ['focusout', event => { if (!card.contains(event.relatedTarget)) setFocus(false); }]];
    for (const [name, handler] of on) card.addEventListener(name, handler);
    return () => { for (const [name, handler] of on) card.removeEventListener(name, handler); };
  }, []);
  if (!text) return null;
  return (
    <div ref={root} data-card-prompt-host className="pointer-events-none absolute right-2 bottom-2 left-2 z-20 flex flex-col items-start">
      <PromptReveal text={text} visible={hover || focus || selected} className="w-full" />
    </div>
  );
}
