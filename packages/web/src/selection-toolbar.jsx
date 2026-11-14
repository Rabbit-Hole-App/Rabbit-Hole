import { Highlighter, MessageSquarePlus, StickyNote } from 'lucide-react';
import { Button } from './ui.jsx';
import { chordBinding, chordLabel, isMac } from './shortcut-owner.js';
import { ariaKey } from './shortcuts.js';
import { placeNear } from './place-near.js';

// The PDF reader's selection popover parts (LearnPaper.jsx), shared with the webpage card (WebpageCard.jsx): a floating control
// placed beside a selection, highlight boxes, and the popover's icon buttons.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pct = n => `${n * 100}%`;
// A floating control beside a selection rectangle: place-near.js (UX-2: in the origin's own units, so it is right at any canvas zoom).
export { placeNear };
// Boxes (fractions of the page) drawn inside their union, so the outer element's own box is where the excerpt is.
export function Boxes({ parts, className, boxClassName = '', as: Tag = 'div', ...props }) {
  if (!parts.length) return null;
  const left = Math.min(...parts.map(p => p.left)), top = Math.min(...parts.map(p => p.top));
  const width = Math.max(...parts.map(p => p.left + p.width)) - left, height = Math.max(...parts.map(p => p.top + p.height)) - top;
  return <Tag {...props} className={`absolute ${className}`} style={{ left: pct(left), top: pct(top), width: pct(width), height: pct(height) }}>
    {parts.map((p, i) => <span key={i} className={`absolute block rounded-[2px] ${boxClassName}`} style={{ left: pct((p.left - left) / width), top: pct((p.top - top) / height), width: pct(p.width / width), height: pct(p.height / height) }} />)}
  </Tag>;
}
export const ToolButton = ({ label, icon: Icon, ...props }) => <Button aria-label={label} title={label} onMouseDown={event => event.preventDefault()} className="min-w-8 justify-center px-2 text-ink-2 hover:text-ink" {...props}><Icon size={15} /></Button>;

// UX-1: every selection toolbar is these four buttons in this order, nothing else: [Ctrl+K] (the quick-ask chord as its label), Add to chat, Highlight, Create note. A control that
// cannot run here stays, greyed, with its name. The positioning ref, data-* marker and pointer handlers come from the card (...rest).
export function SelectionToolbar({ barRef, onQuickAsk, onAddToChat, onHighlight, onNote, quickDisabled = false, chatDisabled = false, highlightDisabled = false, noteDisabled = false, ...rest }) {
  const mac = isMac(), hint = chordLabel('quick-edit', mac);
  return (
    <div ref={barRef} role="toolbar" aria-label="Selected text" style={{ left: 0, top: 0 }} className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-line bg-white p-1 shadow-pop" {...rest}>
      <Button aria-label={hint} title={hint} aria-keyshortcuts={ariaKey(chordBinding('quick-edit'), mac)} data-quick-ask disabled={quickDisabled} onMouseDown={event => event.preventDefault()} onClick={onQuickAsk}
        className="min-w-8 justify-center px-2 text-ink-2 hover:text-ink"><kbd aria-hidden="true" className="rounded border border-line bg-hover px-1 font-sans text-[10px] font-normal text-ink-3">{hint}</kbd></Button>
      <ToolButton label="Add to chat" icon={MessageSquarePlus} disabled={chatDisabled} onClick={onAddToChat} />
      <ToolButton label="Highlight" icon={Highlighter} disabled={highlightDisabled} onClick={onHighlight} />
      <ToolButton label="Create note" icon={StickyNote} disabled={noteDisabled} onClick={onNote} />
    </div>
  );
}
