import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Ellipsis, ExternalLink, Shapes, Unlink } from 'lucide-react';
import { openInNewTab, plainClick } from './LinksPanel.jsx';

// Canvas references on a card (C:/s/spec/references-plan.md UI, brief section 6). The page provides:
// refsOf(cardId) -> the card's refs, resolve(target) -> { title, path, href } | { unavailable } | null (not known yet),
// go(href) -> same-tab navigation that saves first, and onRemove(cardId, refId), absent where the board is view-only.
// No context (a share link): no chips, and a reference card reads Unavailable.
export const CanvasRefs = createContext(null);
const EMPTY = [];
const stop = event => event.stopPropagation();

// Close a small popover on a press outside it or on Escape.
function useDismiss(open, setOpen, box) {
  useEffect(() => {
    if (!open) return undefined;
    const press = event => { if (!box.current?.contains(event.target)) setOpen(false); };
    const key = event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', press, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', press, true); document.removeEventListener('keydown', key, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}

// The destination's title as a real link (plain click: this tab via go; Ctrl/Cmd, middle and right click: native),
// or a muted Unavailable that names nothing.
export function RefTitle({ target, go, className }) {
  if (!target) return <span aria-busy="true" className="text-ink-3">Loading…</span>;
  if (target.unavailable) return <span className="text-ink-3">Unavailable</span>;
  return (
    <a href={target.href} title={target.title} onClick={event => { if (plainClick(event)) { event.preventDefault(); go(target.href); } }}
      className={`min-w-0 truncate hover:underline ${className}`}>{target.title}</a>
  );
}

export function NewTabButton({ target, size = 12, className = '' }) {
  if (!target || target.unavailable) return null;
  return (
    <button type="button" aria-label="Open canvas in new tab" title="Open canvas in new tab" onClick={() => openInNewTab(target.href)}
      className={`flex shrink-0 items-center justify-center rounded text-ink-3 hover:bg-white hover:text-ink ${className}`}><ExternalLink size={size} strokeWidth={1.8} aria-hidden /></button>
  );
}

function Chip({ cardId, reference, refs }) {
  const [menu, setMenu] = useState(false);
  const box = useRef(null);
  useDismiss(menu, setMenu, box);
  const target = refs.resolve(reference.target);
  return (
    <span ref={box} data-ref-chip data-target={reference.target} {...(target?.unavailable ? { 'data-unavailable': '' } : {})}
      onPointerDown={stop} onContextMenu={stop} onDoubleClick={stop}
      className="relative inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-line bg-hover/60 py-0.5 pr-0.5 pl-1.5 text-xs text-ink hover:border-line-strong hover:bg-hover">
      <Shapes size={12} strokeWidth={1.8} aria-hidden className="shrink-0 text-ink-3" />
      <RefTitle target={target} go={refs.go} className="max-w-44" />
      <NewTabButton target={target} className="h-5 w-5" />
      {refs.onRemove && <button type="button" aria-label="Reference options" title="Reference options" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-white hover:text-ink"><Ellipsis size={12} aria-hidden /></button>}
      {menu && <div role="menu" aria-label="Reference" className="absolute top-full left-0 z-30 mt-1 w-48 rounded-md border border-line bg-white p-1 shadow-pop">
        <button type="button" role="menuitem" data-ref-remove onClick={() => { setMenu(false); refs.onRemove(cardId, reference.id); }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-ink hover:bg-hover"><Unlink size={14} aria-hidden />Remove reference</button>
      </div>}
    </span>
  );
}

// The row under a card's content: two chips, then "+N more" opening the rest. It reports its height so the card
// grows by it (CanvasNode adds it like a practice row), never overlaying the content.
export default function CanvasRefChips({ id, onHeight }) {
  const refs = useContext(CanvasRefs);
  const list = refs?.refsOf(id) || EMPTY;
  const [more, setMore] = useState(false);
  const row = useRef(null), moreBox = useRef(null);
  useDismiss(more, setMore, moreBox);
  const has = list.length > 0;
  useEffect(() => {
    const element = row.current;
    if (!element || !onHeight) return undefined;
    const observer = new ResizeObserver(() => onHeight(element.offsetHeight));
    observer.observe(element);
    return () => { observer.disconnect(); onHeight(0); };
  }, [has]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!has) return null;
  const rest = list.slice(2);
  return (
    <div ref={row} data-ref-chips className="flex shrink-0 flex-wrap items-center gap-1 border-t border-line px-3 py-2">
      {list.slice(0, 2).map(reference => <Chip key={reference.id} cardId={id} reference={reference} refs={refs} />)}
      {rest.length > 0 && <span ref={moreBox} className="relative" onPointerDown={stop} onDoubleClick={stop}>
        <button type="button" data-ref-more aria-expanded={more} onClick={() => setMore(!more)}
          className="rounded-md px-1.5 py-0.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">+{rest.length} more</button>
        {more && <ul data-ref-more-list aria-label="More references" className="absolute top-full left-0 z-30 mt-1 flex w-64 flex-col gap-1 rounded-md border border-line bg-white p-1.5 shadow-pop">
          {rest.map(reference => <li key={reference.id} className="flex min-w-0"><Chip cardId={id} reference={reference} refs={refs} /></li>)}
        </ul>}
      </span>}
    </div>
  );
}
