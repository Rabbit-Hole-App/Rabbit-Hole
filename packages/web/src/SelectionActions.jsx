import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, MessageSquarePlus, Wand } from 'lucide-react';
import { chordLabel, isMac } from './shortcut-owner.js';
import { placeBar, usesHost } from './selection-bar-place.js';

// The selection action bar (owner brief 2026-10-13: "rename Ask in chat to Add to chat (ctrl + L) or Quick Edit (ctrl + k )"):
// two clickable actions with their shortcut hints, for a selected card, shape, text object, group or several objects.
//   Add to chat  puts the selection in the existing chat composer as a context chip (the canvas does it: addToChat).
//   Quick Edit   opens the existing inline editor in Edit selection mode (the canvas does it: openInline).
// One bar per selection. A card, a chat card, a slide, an image, or a text box already shows a row of controls above it:
// there the two actions join that row (SelectionActionsHost, a trailing segment) and nothing else is drawn. Everything else
// - a shape, a group, several objects, a card with no such row - gets the floating bar (SelectionActionBar), which stays
// away while a host shows, while the editor is open, during a drag, resize or marquee, and while text is being typed.
// On a narrow view (a phone) hosts are not used: an object's row can run off the edge with the object, so the floating bar, kept inside
// the view and below the selection, is the one bar. Both are the same Actions element, so a press never moves the focus or the selection.
const Ctx = createContext(null);

// added: the one selected object's ref is already in this chat (pdf-materials-refinement.md section 6), so Add to chat reads
// Added to chat; pressing it again opens the chat and attaches nothing twice.
export function SelectionActionsProvider({ sole, hidden = false, narrow = false, pinned = null, added = false, onAddToChat, onQuickEdit, children }) {
  const [hosted, setHosted] = useState(0);
  const busy = useCanvasBusy();
  const register = useCallback(() => { setHosted(count => count + 1); return () => setHosted(count => count - 1); }, []);
  const mac = useMemo(isMac, []);
  const value = useMemo(() => ({ sole, hidden: hidden || busy, narrow, pinned, added, onAddToChat, onQuickEdit, mac, hosted, register }), [sole, hidden, busy, narrow, pinned, added, onAddToChat, onQuickEdit, mac, hosted, register]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function Action({ label, chord, Icon, onClick, mac, ...rest }) {
  const hint = chordLabel(chord, mac);
  return (
    <button type="button" aria-label={label} aria-keyshortcuts={hint.replace('Cmd', 'Meta').replace('Ctrl', 'Control')} title={`${label} (${hint})`} onClick={onClick} {...rest}
      className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap text-ink hover:bg-hover focus-visible:ring-2 focus-visible:ring-[#2383e2]/40 focus-visible:outline-none">
      <Icon size={13} strokeWidth={1.8} aria-hidden="true" />{label}
      <kbd aria-hidden="true" className="rounded border border-line bg-hover px-1 font-sans text-[10px] font-normal text-ink-3">{hint}</kbd>
    </button>
  );
}

// pointerdown is swallowed and prevented so pressing never blurs a field, drops a text selection or clears the canvas selection.
function Actions({ ctx, mode, className = '', style }) {
  return (
    <div role="toolbar" aria-label="Selection actions" data-selection-bar={mode} data-thumbnail-hide style={style}
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}
      className={`pointer-events-auto flex w-max items-center gap-0.5 rounded-lg border border-line bg-white p-0.5 shadow-md ${className}`}>
      {ctx.onAddToChat && <Action label={ctx.added ? 'Added to chat' : 'Add to chat'} chord="add-to-chat" Icon={ctx.added ? Check : MessageSquarePlus} mac={ctx.mac} onClick={ctx.onAddToChat} data-add-to-chat data-added={ctx.added || undefined} />}
      {ctx.onQuickEdit && <Action label="Quick Edit" chord="quick-edit" Icon={Wand} mac={ctx.mac} onClick={ctx.onQuickEdit} data-quick-edit />}
    </div>
  );
}

// A host row's trailing segment: shown only while `id` is the one selected object, and tells the floating bar to stand down.
// divider: a thin rule before it, where other controls of the row come first.
export function SelectionActionsHost({ id, className = '', style, divider = false }) {
  const ctx = useContext(Ctx);
  // On a narrow view, or on an object with a comment pin, the floating bar takes over (usesHost, selection-bar-place.js).
  const here = !!ctx && usesHost(ctx, id);
  const register = ctx?.register;
  useLayoutEffect(() => (here ? register() : undefined), [here, register]);
  if (!here || ctx.hidden || (!ctx.onAddToChat && !ctx.onQuickEdit)) return null;
  return <>{divider && <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line-strong" />}<Actions ctx={ctx} mode="host" className={className} style={style} /></>;
}

// True while a pointer is down on the canvas (a drag, a resize, a marquee, a pan) and while text is being typed in it.
function useCanvasBusy() {
  const [pressed, setPressed] = useState(false), [typing, setTyping] = useState(false);
  useEffect(() => {
    // A press that starts a drag, a resize, a marquee or a pan. A press on a button of the card's own row (Open in notebook, Ask selection) is a
    // click, not a gesture: hiding the segment then would move the row's buttons out from under the pointer. Resize and connect handles are gestures.
    const down = event => {
      const target = event.target, control = target?.closest?.('button, a, input, textarea, select');
      if (target?.closest?.('[data-canvas-surface]') && !target.closest('[data-selection-bar]') && (!control || control.matches('[data-node-tool]'))) setPressed(true);
    };
    const up = () => setPressed(false);
    const focus = () => {
      const held = document.activeElement;
      setTyping(!!held && held !== document.body && !!held.closest?.('[data-canvas-surface]') && (held.isContentEditable || ['INPUT', 'TEXTAREA'].includes(held.tagName)));
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    const blur = () => setTimeout(focus, 0);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', blur);
    return () => {
      window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true);
      document.removeEventListener('focusin', focus); document.removeEventListener('focusout', blur);
    };
  }, []);
  return pressed || typing;
}

// The floating bar. anchor: the selection's box in the surface's pixels (null: nothing selected); box: the surface's size;
export function SelectionActionBar({ anchor, box }) {
  const ctx = useContext(Ctx);
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const show = !!ctx && !!anchor && !ctx.hidden && ctx.hosted === 0;
  useLayoutEffect(() => {
    const node = ref.current;
    if (node && (node.offsetWidth !== size.w || node.offsetHeight !== size.h)) setSize({ w: node.offsetWidth, h: node.offsetHeight });
  });
  if (!show) return null;
  const at = size.w ? placeBar(anchor, size, box, { below: ctx.narrow }) : { left: -9999, top: -9999 };
  return <div ref={ref} className="pointer-events-none absolute z-30" style={{ left: at.left, top: at.top }}><Actions ctx={ctx} mode="floating" /></div>;
}
