// Focus notebook (docs/features/focus-study.md sections 1 and 4): the notebook card's own host, restyled in place to fill the
// working frame. Never a portal, a clone, a remount or a move: moving an iframe to another parent reloads it and restarts
// Python, so this only sets an attribute and four custom properties on the existing [data-block-id] element (the
// [data-focus-host] rule in index.css reads them) and takes them off again. The host keeps its parent, its React key and its
// children; the iframe, its kernel, running cells, outputs, selection and unsaved edits are untouched. Nothing is saved:
// no onSize, no onChange, no board write. The notebook scrolls its own cells at normal text size (scale 1 / view.z).
import { frameInWorld, registerFocusAdapter } from './focus-controller.js';

export const FOCUS_HOST = 'data-focus-host';
const PROPS = ['--focus-w', '--focus-h', '--focus-mb', '--focus-transform'];
// The focused hosts: their height before Focus (the layout footprint kept for the cards after it) and the press guard.
const held = new WeakMap();

// The custom properties for a world rect (frameInWorld) and the host's layout: its height before Focus and its untransformed
// position in the column (offsetLeft / offsetTop, as measureNow reads them). The host stays in the column's flow at its old
// height (margin-bottom gives back the difference), so the cards after it never reflow; the transform puts it on the frame.
export function focusStyle(world, { height, left, top }) {
  if (!world) return null;
  return {
    '--focus-w': `${world.width}px`, '--focus-h': `${world.height}px`, '--focus-mb': `${height - world.height}px`,
    '--focus-transform': `translate(${world.x - left}px, ${world.y - top}px) scale(${world.scale})`,
  };
}

function place(host, frame, ctx) {
  if (!held.has(host)) return;
  // Read after the attribute is on: the rule's margin-left 0 is what offsetLeft reports; the transform never changes it.
  const style = focusStyle(frameInWorld(frame, ctx?.view), { height: held.get(host).height, left: host.offsetLeft, top: host.offsetTop });
  if (style) for (const name of PROPS) host.style.setProperty(name, style[name]);
}

// A press on a drag zone (the card's strip, the notebook header) would start a card drag and save a new position.
const guard = event => { if (event.target?.closest?.('[data-drag-zone]')) event.stopPropagation(); };

export const notebookFocus = {
  kind: 'notebook',
  label: 'Focus notebook',
  canFocus: block => block?.type === 'notebook',
  enter(host, frame, ctx) {
    if (!host) return;
    if (!held.has(host)) {
      held.set(host, { height: host.offsetHeight });
      host.addEventListener('pointerdown', guard);
      host.setAttribute(FOCUS_HOST, '');
    }
    place(host, frame, ctx);
  },
  update: place,
  exit(host) {
    if (!host || !held.has(host)) return;
    held.delete(host);
    host.removeEventListener('pointerdown', guard);
    host.removeAttribute(FOCUS_HOST);
    for (const name of PROPS) host.style.removeProperty(name);
  },
};

registerFocusAdapter(notebookFocus);
