// Focus placement for a card's own host element (docs/features/focus-study.md section 5), shared by the WP4 focus-adapter-*.js
// files. The host is restyled in place: never moved to another parent, cloned or remounted, so a PDF viewer, a playing video
// or a 3D viewer keeps its live state. It uses the one [data-focus-host] rule in index.css (WP3, focus-adapter-notebook.js)
// and its custom properties (--focus-w, --focus-h, --focus-mb, --focus-transform): React's own inline width, height and
// transform stay as they are and come back on exit. Nothing here writes the board: no dx/dy/w/h, no undo step.
import { frameInWorld, registerFocusAdapter } from './focus-controller.js';

export const READING_MAX = 760; // a readable line for the cards' 14 px body text

// The host box in surface px (pure). fill: the frame, at most maxWidth wide, centred.
export function fillBox(frame, { maxWidth = Infinity } = {}) {
  const width = Math.round(Math.min(frame.width, maxWidth));
  return { left: Math.round(frame.left + (frame.width - width) / 2), top: Math.round(frame.top), width, height: Math.max(0, Math.round(frame.height)) };
}
// contain: a picture or video at its own aspect ratio, as large as the frame allows once the card's other rows (chrome.w
// across, chrome.h down) are counted, centred; never cropped. No usable aspect or no room: fill.
export function containBox(frame, { aspect, chrome = { w: 0, h: 0 } } = {}) {
  const room = fillBox(frame);
  const w = room.width - chrome.w, h = room.height - chrome.h;
  if (!(Number.isFinite(aspect) && aspect > 0) || w <= 0 || h <= 0) return room;
  const media = Math.min(w, h * aspect);
  const width = Math.round(media + chrome.w), height = Math.round(media / aspect + chrome.h);
  return { left: Math.round(room.left + (room.width - width) / 2), top: Math.round(room.top + (room.height - height) / 2), width, height };
}
// The host's transform from its in-flow position (`layout`, world units) to the box, counter-scaled to normal text size.
export function hostTransform(box, view, layout) {
  const world = frameInWorld(box, view);
  return world && `translate(${world.x - layout.x}px, ${world.y - layout.y}px) scale(${world.scale})`;
}

// contain inputs for one picture or video, in the host's CSS px: its aspect and the rows around it, rows scrolled or
// overflowing out of view included.
export function mediaFit(host, media) {
  const natural = media.videoWidth || media.naturalWidth;
  const aspect = natural ? natural / (media.videoHeight || media.naturalHeight) : media.offsetWidth / media.offsetHeight;
  const hidden = [...host.children].reduce((sum, child) => sum + Math.max(0, child.scrollHeight - child.clientHeight), 0);
  return { aspect, chrome: { w: host.offsetWidth - media.offsetWidth, h: host.offsetHeight + hidden - media.offsetHeight } };
}
export const contain = (frame, host, media) => (media ? containBox(frame, mediaFit(host, media)) : fillBox(frame));

// What the shared rule does not cover, for these kinds: a card in a card-layout slot rises with it; a direct scroll body takes
// the height (card-layout.css turns it off in Full mode); the PDF and YouTube iframes take the pointer while focused (they
// ignore it until the card is selected, and Focus deselects); a note gets a surface to be read on and scrolls.
const CSS = `[data-card-slot]:has(>[data-focus-host]){z-index:40}
[data-focus-host]>[data-scroll]{flex:1 1 0%!important;min-height:0!important;max-height:none!important;overflow:auto!important}
[data-focus-host] [data-pointer-body] iframe{pointer-events:auto!important}
[data-focus-host]{rotate:none!important}
[data-focus-host][data-item-id]{overflow:auto!important;padding:16px;border-color:var(--color-line);background:var(--color-surface);box-shadow:0 4px 16px rgb(0 0 0/0.12)}`;
const VARS = ['--focus-w', '--focus-h', '--focus-mb', '--focus-transform'];
// host -> { height: its in-flow height when Focus began (the footprint the column keeps), scroll: had data-scroll before }
const entry = new WeakMap();

// The in-flow position in world units: offsets up to the world layer (the column and the items layer sit at its origin; a
// card-layout slot adds its own offset).
function worldOffset(host) {
  let x = 0, y = 0;
  for (let node = host; node && !node.hasAttribute?.('data-canvas-world'); node = node.offsetParent) { x += node.offsetLeft; y += node.offsetTop; }
  return { x, y };
}
// A press on a drag zone of a focused card would move the saved card while it shows somewhere else: it stops at the host,
// before React's handlers at the root. Controls inside a drag zone, and text selection, keep working.
function holdGeometry(event) {
  const target = event.target;
  if (target?.closest?.('[data-drag-zone]') && !target.closest('button,a,input,select,textarea,[role="button"]')) event.stopPropagation();
}
function place(host, box, view) {
  host.style.setProperty('--focus-w', `${box.width}px`);
  host.style.setProperty('--focus-h', `${box.height}px`);
  host.style.setProperty('--focus-mb', `${entry.get(host).height - box.height}px`);
  host.style.setProperty('--focus-transform', hostTransform(box, view, worldOffset(host))); // read after the width changed
}
function hold(host) {
  if (entry.has(host)) return;
  const document = host.ownerDocument;
  if (!document.getElementById('focus-host-style')) document.head.append(Object.assign(document.createElement('style'), { id: 'focus-host-style', textContent: CSS }));
  entry.set(host, { height: host.offsetHeight, scroll: host.hasAttribute('data-scroll') });
  host.style.setProperty('--focus-w', `${host.offsetWidth}px`); // measured at its own size first, painted only once placed
  host.style.setProperty('--focus-h', `${host.offsetHeight}px`);
  host.setAttribute('data-focus-host', '');
  // The canvas wheel pans the board unless it is over a [data-scroll]: over the focused card it scrolls the card's own content.
  host.setAttribute('data-scroll', '');
  host.addEventListener('pointerdown', holdGeometry, true);
}
export function releaseHost(host) {
  if (!host || !entry.has(host)) return;
  host.removeAttribute('data-focus-host');
  if (!entry.get(host).scroll) host.removeAttribute('data-scroll');
  for (const name of VARS) host.style.removeProperty(name);
  host.removeEventListener('pointerdown', holdGeometry, true);
  entry.delete(host);
}

// One adapter per kind. box(frame, host) is that kind's host box in surface px; `again`: measure twice (contain: a caption
// rewraps at the new width, which changes the rows around the picture).
export function registerHostAdapter({ kind, label, canFocus, box, again = false }) {
  const show = (host, frame, ctx) => {
    if (!host || !frame || !(ctx?.view?.z > 0)) return;
    hold(host);
    place(host, box(frame, host), ctx.view);
    if (again) place(host, box(frame, host), ctx.view);
  };
  return registerFocusAdapter({ kind, label, canFocus, enter: show, update: show, exit: releaseHost });
}
