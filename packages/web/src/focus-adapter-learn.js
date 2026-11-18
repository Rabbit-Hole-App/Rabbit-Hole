// Focus for the kinds Learn mode's Cards tab shows (learn-mode-spec.md §5): code (repo-code, snippet), diagrams (flow, mermaid) and graphs (graph,
// plot) take the pane's width up to WIDE_MAX at their own height (at most the pane's; the card then scrolls inside); any other card, in Learn mode only,
// is drawn at its natural size, centred, so a stop never shows nothing. Imported last in focus-adapters.js: the catch-all claims only what no other
// adapter does, and only while a walk runs (ctx.learning), so no Focus control appears elsewhere for a card nobody asked to focus.
import { WIDE_MAX, registerHostAdapter } from './focus-host.js';

// The host box (pure): `size` is the card's own size when Focus began; width at most maxWidth (default: its own), height at most the frame's.
export function naturalBox(frame, size, { maxWidth = null } = {}) {
  const width = Math.round(Math.min(frame.width, maxWidth ?? size.w)), height = Math.max(0, Math.round(Math.min(frame.height, size.h)));
  return { left: Math.round(frame.left + (frame.width - width) / 2), top: Math.round(frame.top), width, height };
}

// The card's size before Focus placed it: read on the first placement (no --focus-transform yet; releaseHost clears it on exit).
const sizes = new WeakMap();
const sizeOf = host => {
  if (!sizes.has(host) || !host.style.getPropertyValue('--focus-transform')) sizes.set(host, { w: host.offsetWidth, h: host.offsetHeight });
  return sizes.get(host);
};
// A card cut to the pane's height scrolls as one surface (index.css [data-focus-natural]).
function scrolls(adapter) {
  const { enter, exit } = adapter;
  adapter.enter = (host, frame, ctx) => { host?.setAttribute('data-focus-natural', ''); enter(host, frame, ctx); };
  adapter.exit = (host, ctx) => { host?.removeAttribute('data-focus-natural'); exit(host, ctx); };
  return adapter;
}
const wide = (frame, host) => naturalBox(frame, sizeOf(host), { maxWidth: WIDE_MAX });

scrolls(registerHostAdapter({ kind: 'code', label: 'Focus code', canFocus: block => block.type === 'repo-code' || block.type === 'snippet', box: wide }));
scrolls(registerHostAdapter({ kind: 'diagram', label: 'Focus diagram', canFocus: block => block.type === 'flow' || block.type === 'mermaid', box: wide }));
scrolls(registerHostAdapter({ kind: 'graph', label: 'Focus graph', canFocus: block => block.type === 'graph' || block.type === 'plot', box: wide }));
scrolls(registerHostAdapter({ kind: 'natural', label: 'Focus card', canFocus: (block, ctx) => !!ctx?.learning && !block.kind, box: (frame, host) => naturalBox(frame, sizeOf(host)) }));
