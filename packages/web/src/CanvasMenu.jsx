import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowDownToLine, ArrowUp, BookOpen, BoxSelect, BringToFront, Circle, CircleCheck, ClipboardPaste, Copy, CopyPlus, Download,
  ExternalLink, Eye, Group, Link2, Lock, LockOpen, MessageCircle, MessageSquarePlus, NotebookPen, PaintRoller, Paperclip, Pencil, PencilLine,
  Pipette, Play, Scan, Scissors, ScrollText, SendToBack, Trash2, UnfoldVertical, Ungroup, Unlink, Wand, ZoomIn, Check,
  Palette, Rotate3d, RotateCcw, Sigma, StickyNote, Type,
} from 'lucide-react';
import { MenuItem } from './ui.jsx';

// UI-25: the canvas right-click menu, drawn from canvas-actions.js rows (actionsFor). One component for every target -
// a card, an object, a group, several objects, the empty canvas - on the normal and the shared canvas.
// Keyboard (WAI-ARIA menu): opening focuses the first row; ArrowUp/Down, Home and End move between rows; Enter or Space
// picks; Escape closes and gives the focus back to what had it (the card, for Shift+F10); Tab closes. A press outside
// closes it without moving the focus. Placement: beside the cursor, flipped then clamped inside the window and the canvas
// surface (which clips it), scrolling when taller than the room (owner, 2026-10-07).
// Rows name their icon (canvas-actions.js keeps no React); per-type lanes add theirs to ICONS.
export const ICONS = {
  ArrowDown, ArrowDownToLine, ArrowUp, BookOpen, BoxSelect, BringToFront, Circle, CircleCheck, ClipboardPaste, Copy, CopyPlus, Download,
  ExternalLink, Eye, Group, Link2, Lock, LockOpen, MessageCircle, MessageSquarePlus, NotebookPen, PaintRoller, Paperclip, Pencil, PencilLine,
  Pipette, Play, Scan, Scissors, ScrollText, SendToBack, Trash2, UnfoldVertical, Ungroup, Unlink, Wand, ZoomIn,
  // Per-type rows (canvas-actions-types.js, lane U2).
  Palette, Rotate3d, RotateCcw, Sigma, StickyNote, Type,
};
const MenuRow = props => <MenuItem type="button" role="menuitem" {...props} />;

// at: the cursor in the surface's pixels. surface: the canvas surface element. onClose(byKey): byKey is true for Escape
// and Tab, when the caller gives the focus back.
export default function CanvasMenu({ rows, at, surface, onPick, onClose }) {
  const box = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const node = box.current, area = surface;
    if (!node || !area) return;
    const s = area.getBoundingClientRect(), pad = 8;
    const lim = { left: Math.max(s.left, 0) + pad, top: Math.max(s.top, 0) + pad, right: Math.min(s.right, window.innerWidth) - pad, bottom: Math.min(s.bottom, window.innerHeight) - pad };
    const w = node.offsetWidth, h = node.offsetHeight, cx = s.left + at.x, cy = s.top + at.y;
    const place = (point, size, lo, hi) => Math.max(lo, Math.min(point + size > hi ? point - size : point, hi - size));
    // The surface clips (overflow hidden) but can still be scrolled by focus or scroll-into-view; its absolute children
    // move with that scroll, so the screen position is turned back into the surface's own coordinates with it.
    setPos({ x: place(cx, w, lim.left, lim.right) - s.left + area.scrollLeft, y: Math.max(lim.top, place(cy, h, lim.top, lim.bottom)) - s.top + area.scrollTop, maxH: Math.max(lim.bottom - lim.top, 120) });
  }, [at.x, at.y, surface]);
  // Focus the first row once placed (preventScroll: the surface must not scroll to it).
  useEffect(() => {
    if (!pos) return;
    if (!box.current?.contains(document.activeElement)) items()[0]?.focus({ preventScroll: true });
  }, [pos]);
  // A press anywhere outside closes it - on the canvas (its own handlers) and off it (the header, a rail).
  useEffect(() => {
    const close = event => { if (!box.current?.contains(event.target)) onClose(false); };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [onClose]);
  const items = () => [...(box.current?.querySelectorAll('[role^="menuitem"]:not(:disabled)') || [])];
  const keyDown = event => {
    const list = items(), now = list.indexOf(document.activeElement);
    const go = n => { event.preventDefault(); list[(n + list.length) % list.length]?.focus({ preventScroll: true }); };
    if (event.key === 'ArrowDown') go(now + 1);
    else if (event.key === 'ArrowUp') go(now < 0 ? list.length - 1 : now - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(list.length - 1);
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(true); }
    else if (event.key === 'Tab') { event.preventDefault(); onClose(true); }
  };
  return (
    <div ref={box} role="menu" aria-label="Canvas actions" data-canvas-menu tabIndex={-1} onKeyDown={keyDown}
      style={{ left: pos?.x ?? at.x, top: pos?.y ?? at.y, maxHeight: pos?.maxH, visibility: pos ? undefined : 'hidden' }}
      className="absolute z-40 w-60 max-w-[calc(100vw-16px)] overflow-y-auto rounded-md border border-line bg-white p-1 shadow-pop"
      onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}>
      {rows.map(row => {
        if (row.separator) return <div key={row.key} role="separator" className="my-1 h-px bg-line" />;
        const Icon = typeof row.icon === 'string' ? ICONS[row.icon] : row.icon;
        const dataAttrs = { ...(row.data ? { [row.data]: '' } : {}), ...(row.attrs || {}) };
        const check = row.checked !== null;
        return (
          <MenuRow key={row.id} icon={Icon} data-action={row.id} {...dataAttrs} disabled={row.disabled} title={row.reason || undefined}
            role={check ? 'menuitemcheckbox' : 'menuitem'} aria-checked={check ? row.checked : undefined}
            aria-keyshortcuts={row.keyshortcuts || undefined} hint={row.hint || undefined}
            className={`${row.reason ? 'h-auto py-1' : ''} ${row.danger ? 'text-danger' : ''}`}
            onClick={() => onPick(row.id)}>
            {check ? <span className="flex items-center"><span className="min-w-0 flex-1">{row.label}</span><span aria-hidden="true" className="inline-block w-4">{row.checked ? <Check size={14} strokeWidth={2.5} /> : null}</span></span> : row.label}
            {row.reason && <span className="block text-xs text-ink-3">{row.reason}</span>}
          </MenuRow>
        );
      })}
    </div>
  );
}
