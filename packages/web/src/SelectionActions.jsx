import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Maximize, MessageSquarePlus, Wand } from 'lucide-react';
import { PromptControl } from './CardPrompt.jsx';
import { chordBinding, chordLabel, isMac } from './shortcut-owner.js';
import { ariaKey } from './shortcuts.js';
import { placeBar, usesHost } from './selection-bar-place.js';

// The selection action bar (owner brief 2026-10-13: "rename Ask in chat to Add to chat (ctrl + L) or Quick Edit (ctrl + k )"):
// two clickable actions with their shortcut hints, for a selected card, shape, text object, group or several objects.
//   Add to chat  puts the selection in the existing chat composer as a context chip (the canvas does it: addToChat).
//   Quick Edit   opens the existing inline editor in Edit selection mode (the canvas does it: openInline).
//   Prompt       (owner 2026-11-17, replacing the pill in each card's header) opens the words the card was made from, only for a card that has them
//                (promptOf(id): the card's stored promptUsed), after Quick Edit, the last of the row; no shortcut. Like its siblings it is in the hover pill, the selected
//                card's pill and the floating bar; unlike them it is also on a view-only or shared board (owner 2026-11-17: shared canvases keep every feature), alone.
// One bar per selection. A card, a chat card, a slide, an image, or a text box already shows a row of controls above it:
// there the two actions join that row (SelectionActionsHost, a trailing segment) and nothing else is drawn. Everything else
// - a shape, a group, several objects, a card with no such row - gets the floating bar (SelectionActionBar), which stays
// away while a host shows, while the editor is open, during a drag, resize or marquee, and while text is being typed.
// On a narrow view (a phone) hosts are not used: an object's row can run off the edge with the object, so the floating bar, kept inside
// the view and below the selection, is the one bar. Both are the same Actions element, so a press never moves the focus or the selection.
// Focus (docs/features/focus-study.md) leads the row when an adapter claims the one selected object (focusLabel: the adapter's
// label, its accessible name); onFocus is the canvas's enterFocus. A view-only board shows it too: Focus changes nothing saved.
// An Explanation card shows no Focus here (its Focus is in the card's context menu). Cards no longer collapse or expand (owner 2026-11-17): no such button.
const Ctx = createContext(null);

// added: the one selected object's ref is already in this chat (pdf-materials-refinement.md section 6), so Add to chat reads
// Added to chat; pressing it again opens the chat and attaches nothing twice.
export function SelectionActionsProvider({ sole, hidden = false, narrow = false, pinned = null, cut = null, added = false, focusLabel = null, onFocus = null, onAddToChat, onQuickEdit, promptOf = null, children }) {
  const [hosted, setHosted] = useState(0);
  const busy = useCanvasBusy();
  const register = useCallback(() => { setHosted(count => count + 1); return () => setHosted(count => count - 1); }, []);
  const mac = useMemo(isMac, []);
  const value = useMemo(() => ({ sole, hidden: hidden || busy, narrow, pinned, cut, added, focusLabel: onFocus ? focusLabel : null, onFocus, onAddToChat, onQuickEdit, promptOf, mac, hosted, register }), [sole, hidden, busy, narrow, pinned, cut, added, focusLabel, onFocus, onAddToChat, onQuickEdit, promptOf, mac, hosted, register]);
  freshest = value; // the newest value, for HoverActions: after it selects a card its own row is gone, and its copy of an action predates the selection
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
// ponytail: one canvas per page, so one module-level handle.
let freshest = null;

const actionClass = joined => joined ? 'flex h-8 cursor-pointer items-center gap-1.5 rounded-none px-3 text-xs font-medium whitespace-nowrap text-ink hover:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2383e2]/40 focus-visible:outline-none' : 'flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap text-ink hover:bg-hover focus-visible:ring-2 focus-visible:ring-[#2383e2]/40 focus-visible:outline-none';

function Action({ label, chord, Icon, onClick, mac, joined = false, ...rest }) {
  const hint = chordLabel(chord, mac);
  return (
    <button type="button" aria-label={label} aria-keyshortcuts={ariaKey(chordBinding(chord), mac)} title={`${label} (${hint})`} onClick={onClick} {...rest}
      className={actionClass(joined)}>
      <Icon size={13} strokeWidth={1.8} aria-hidden="true" />{label}
      <kbd aria-hidden="true" className="rounded border border-line bg-hover px-1 font-sans text-[10px] font-normal text-ink-3">{hint}</kbd>
    </button>
  );
}

// pointerdown is swallowed and prevented so pressing never blurs a field, drops a text selection or clears the canvas selection.
function Actions({ ctx, mode, id = null, className = '', style, joined = false }) {
  const prompt = id && ctx.promptOf?.(id); // the words this object was made from, if it has any
  const press = event => { event.preventDefault(); event.stopPropagation(); };
  const bar = (barClass, barStyle) => (
    <div role="toolbar" aria-label="Selection actions" data-selection-bar={mode} data-thumbnail-hide style={barStyle}
      onPointerDown={press}
      className={joined ? 'pointer-events-auto flex w-max items-stretch' : `pointer-events-auto flex h-[34px] w-max items-center gap-0.5 rounded-full border border-line bg-white p-0.5 shadow-md ${barClass}`}>
      {ctx.focusLabel && <button type="button" aria-label={ctx.focusLabel} title={ctx.focusLabel} onClick={ctx.onFocus} data-focus-button
        className="relative -my-0.5 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink after:absolute after:-inset-1.5 not-last:mr-1.5 hover:bg-hover focus-visible:ring-2 focus-visible:ring-[#2383e2]/40 focus-visible:outline-none">
        <Maximize size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>}
      {ctx.onAddToChat && <Action label={ctx.added ? 'Added to chat' : 'Add to chat'} chord="add-to-chat" Icon={ctx.added ? Check : MessageSquarePlus} mac={ctx.mac} onClick={ctx.onAddToChat} joined={joined} data-add-to-chat data-added={ctx.added || undefined} />}
      {ctx.onQuickEdit && <Action label="Quick Edit" chord="quick-edit" Icon={Wand} mac={ctx.mac} onClick={ctx.onQuickEdit} joined={joined} data-quick-edit />}
      {prompt && <PromptControl text={prompt} action={actionClass(joined)} />}
    </div>
  );
  return bar(className, style);
}

// The row of a card the pointer is over but that is not the selected one (owner 2026-11-13: the card's actions show on hover, not on click). Pressing a button selects this card first
// and then runs the action, which acts on the selection as ever (the handler is read after the selection has re-rendered).
export function HoverActions({ id, select, divider = false, joined = false }) {
  const ctx = useContext(Ctx);
  if (!ctx || ctx.hidden || ctx.sole === id || (!ctx.onAddToChat && !ctx.onQuickEdit && !ctx.promptOf?.(id))) return null;
  // Select this card, let the canvas re-render with it selected, then run the action from the NEWEST context: the action reads the selection, and the copy this row holds was made before it.
  const act = name => { select(id); requestAnimationFrame(() => requestAnimationFrame(() => freshest?.[name]?.())); };
  // The very same Actions the selected card's row draws (owner 2026-11-13: hover and click must look and sit the same), with this card's presses.
  const hoverCtx = { ...ctx, focusLabel: null, onFocus: null, added: false, onAddToChat: ctx.onAddToChat ? () => act('onAddToChat') : null, onQuickEdit: ctx.onQuickEdit ? () => act('onQuickEdit') : null };
  const actions = <Actions ctx={hoverCtx} mode="host" id={id} joined={joined} />;
  // The rule before it, where other controls of the row come first (as SelectionActionsHost draws it).
  return divider ? <div className={joined ? 'flex items-stretch' : 'flex items-stretch gap-1.5'}><span aria-hidden="true" className={joined ? 'w-px shrink-0 self-stretch bg-line' : 'h-5 w-px shrink-0 self-center bg-line-strong'} />{actions}</div> : actions;
}

// A host row's trailing segment: shown only while `id` is the one selected object, and tells the floating bar to stand down.
// divider: a thin rule before it, where other controls of the row come first.
export function SelectionActionsHost({ id, className = '', style, divider = false, joined = false }) {
  const ctx = useContext(Ctx);
  // On a narrow view, on an object with a comment pin, or on one whose row would be cut off, the floating bar takes over (usesHost, selection-bar-place.js).
  const here = !!ctx && usesHost(ctx, id);
  const register = ctx?.register;
  useLayoutEffect(() => (here ? register() : undefined), [here, register]);
  if (!here || !(hasActions(ctx) || (!ctx.hidden && ctx.promptOf?.(id)))) return null;
  const actions = <Actions ctx={ctx} mode="host" id={id} className={className} style={style} joined={joined} />;
  // The rule and the segment stay together when the row they sit in wraps (CanvasNode's tools row).
  return divider ? <div className={joined ? 'flex items-stretch' : 'flex items-stretch gap-1.5'}><span aria-hidden="true" className={joined ? 'w-px shrink-0 self-stretch bg-line' : 'h-5 w-px shrink-0 self-center bg-line-strong'} />{actions}</div> : actions;
}

const hasActions = ctx => !ctx.hidden && !!(ctx.focusLabel || ctx.onAddToChat || ctx.onQuickEdit);

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
  const show = !!ctx && !!anchor && (hasActions(ctx) || (!ctx.hidden && !!ctx.promptOf?.(ctx.sole))) && ctx.hosted === 0;
  useLayoutEffect(() => {
    const node = ref.current;
    if (node && (node.offsetWidth !== size.w || node.offsetHeight !== size.h)) setSize({ w: node.offsetWidth, h: node.offsetHeight });
  });
  if (!show) return null;
  const at = size.w ? placeBar(anchor, size, box, { below: ctx.narrow }) : { left: -9999, top: -9999 };
  return <div ref={ref} className="pointer-events-none absolute z-30" style={{ left: at.left, top: at.top }}><Actions ctx={ctx} mode="floating" id={ctx.sole} /></div>;
}
