import { createContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy } from 'lucide-react';
import { copyAnswer } from './AnswerFooter.jsx';

// Where the prompt popover goes (docs/features/card-prompt.md): beside its card, to the right when the whole popover fits there,
// else to the left, else over the card's edge kept inside the window; always clamped so it stays visible vertically.
// anchor: { left, right, top } in window pixels (the card's sides, the control's top); size: the popover's own; view: the window.
export function placePrompt(anchor, size, view, gap = 8, margin = 8) {
  let left = anchor.right + gap, side = 'right';
  if (left + size.w > view.w - margin) {
    if (anchor.left - gap - size.w >= margin) { left = anchor.left - gap - size.w; side = 'left'; }
    else { left = Math.max(margin, view.w - margin - size.w); side = 'over'; }
  }
  return { left, top: Math.max(margin, Math.min(anchor.top, view.h - margin - size.h)), side };
}

const rect = element => element?.getBoundingClientRect?.() ?? { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
const pill = 'pointer-events-auto cursor-pointer rounded-full bg-ink text-white select-none hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

// The one Prompt control (owner brief 2026-10-23, replacing the earlier two-step reveal): drawn only while `active` (hover,
// keyboard focus or touch selection of what it belongs to), and while its popover is open. Clicking it opens the popover with the
// exact stored words and Copy; the popover is portalled to the document body, so the canvas zoom and clipping never touch it, and
// it stays open when the pointer leaves, until an outside press, Escape, Tab away, or a wheel or resize that moves the canvas.
// Opening and Copy only read: nothing is generated, changed or sent to the Chat. `copy` (default `text`) is what Copy writes.
// `anchor` returns the element the popover sits beside (the card); without it, the control itself.
export function PromptControl({ text, copy = text, active = false, anchor = null, compact = true }) {
  const button = useRef(null), popup = useRef(null);
  const [open, setOpen] = useState(false);
  const [back, setBack] = useState(false); // focus is returning to the control, so it stays drawn until it has the focus
  const [status, setStatus] = useState(null);
  const [place, setPlace] = useState(null);
  useEffect(() => { if (back && !open) button.current?.focus(); }, [back, open]);
  // The opened popover takes focus, so Escape and Tab work from the keyboard. Only once it is placed: until then it is visibility:hidden,
  // which a browser cannot focus (focus() does nothing), and Escape would go to the control and leave the popover open.
  const placed = place !== null;
  useEffect(() => { if (open && placed) popup.current?.focus(); }, [open, placed]);
  useEffect(() => { if (!status) return undefined; const timer = setTimeout(() => setStatus(null), 1800); return () => clearTimeout(timer); }, [status]);
  useLayoutEffect(() => {
    if (!open) { setPlace(null); return; }
    const card = rect(anchor?.() || button.current), control = rect(button.current), size = rect(popup.current);
    setPlace(placePrompt({ left: card.left, right: card.right, top: control.height ? control.top : card.top }, { w: size.width, h: size.height }, { w: window.innerWidth || 1024, h: window.innerHeight || 768 }));
  }, [open, text]);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const outside = event => { if (!popup.current?.contains(event.target) && !button.current?.contains(event.target)) close(); };
    const wheel = event => { if (!popup.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('wheel', wheel, { capture: true, passive: true });
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('wheel', wheel, true); window.removeEventListener('resize', close); };
  }, [open]);
  if (!text) return null;
  const copyText = async () => { try { await copyAnswer({ text: copy }); setStatus('Copied'); } catch { setStatus('Copy failed'); } };
  const stop = event => event.stopPropagation(); // a portal's events bubble through React to the card: never select, drag or open it
  return (
    <>
      {(active || open || back) && <button ref={button} type="button" data-card-prompt-button aria-haspopup="dialog" aria-expanded={open}
        onPointerDown={stop} onBlur={() => setBack(false)} onClick={() => { setBack(false); setOpen(value => !value); }}
        className={`${pill} ${compact ? 'px-2 py-px text-[10px]' : 'h-5 px-2 text-xs'}`}>Prompt</button>}
      {open && createPortal(
        <div ref={popup} role="dialog" aria-label="Prompt" tabIndex={-1} data-card-prompt data-card-prompt-side={place?.side}
          style={{ position: 'fixed', left: place?.left ?? 0, top: place?.top ?? 0, visibility: place ? 'visible' : 'hidden' }}
          onPointerDown={stop} onPointerUp={stop} onClick={stop} onDoubleClick={stop} onContextMenu={stop}
          onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== button.current) setOpen(false); }}
          onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); setBack(true); } }}
          className="z-[100] w-72 max-w-[calc(100vw-16px)] rounded-lg border border-line bg-white text-ink shadow-lg outline-none">
          {/* A long prompt scrolls inside the popover (data-scroll: the wheel scrolls it, never the canvas). */}
          <p data-card-prompt-text data-scroll className="max-h-48 overflow-y-auto px-3 py-2 text-xs whitespace-pre-wrap break-words select-text">{text}</p>
          <div className="flex items-center gap-2 border-t border-line px-2 py-1">
            <button type="button" data-card-prompt-copy onClick={copyText}
              className="flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"><Copy size={12} aria-hidden="true" />Copy</button>
            <span role="status" data-card-prompt-status className={`text-xs ${status === 'Copy failed' ? 'text-danger' : 'text-ink-2'}`}>{status}</span>
          </div>
        </div>, document.body)}
    </>
  );
}

// The Prompt control of one card: active while the pointer is over the card, focus is inside it, or it is selected (touch has no
// hover). The card is the nearest [data-block] (CanvasNode: positioned, focusable). A view-only board's cards take no pointer, so
// there the selected card shows it; the control itself takes the pointer back. `className` positions it (the wrapper is empty at rest).
export function CardPromptControl({ text, selected = false, className = '' }) {
  const host = useRef(null);
  const [hover, setHover] = useState(false), [focus, setFocus] = useState(false);
  useEffect(() => {
    const card = host.current?.closest('[data-block]');
    if (!card) return undefined;
    const on = [['pointerenter', event => { if (event.pointerType !== 'touch') setHover(true); }], ['pointerleave', () => setHover(false)], ['focusin', () => setFocus(true)],
      ['focusout', event => { if (!card.contains(event.relatedTarget)) setFocus(false); }]];
    for (const [name, handler] of on) card.addEventListener(name, handler);
    return () => { for (const [name, handler] of on) card.removeEventListener(name, handler); };
  }, []);
  if (!text) return null;
  return <span ref={host} data-card-prompt-host className={className}><PromptControl text={text} active={hover || focus || selected} anchor={() => host.current?.closest('[data-block]')} /></span>;
}

// A card that draws its own top-right pill (Kicker, LearningBlocks.jsx) gives the Prompt control that slot through this context and
// claims it, so the card-level fallback below is not drawn twice. Value: { text, selected, claim }.
export const PromptSlot = createContext(null);

// The fallback for a card with no pill: the same control in the top-right of the card's drag strip. Drawn by the card (a chat card, a
// CAD card, an animation) only while its prompt exists; with no stored prompt nothing is drawn, so no empty control.
export default function CardPrompt({ text, selected = false }) {
  if (!text) return null;
  return <CardPromptControl text={text} selected={selected} className="absolute top-[3px] right-3 z-20" />;
}
