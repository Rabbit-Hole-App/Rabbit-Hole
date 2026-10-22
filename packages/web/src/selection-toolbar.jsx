import { Button } from './ui.jsx';

// The PDF reader's selection popover parts (LearnPaper.jsx), shared with the webpage card (WebpageCard.jsx): a floating control
// placed beside a selection, highlight boxes, and the popover's icon buttons.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pct = n => `${n * 100}%`;
// A floating control beside `rect` (client px): inside the visible reader `frame`, above the rect when there is room, else
// below it, else pinned to the nearest visible edge. `origin` is its positioned parent.
export function placeNear(el, rect, frame, origin) {
  if (!el || !rect || !frame || !origin) return;
  const vis = frame.getBoundingClientRect(), base = origin.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const left = clamp(rect.left + rect.width / 2 - w / 2, vis.left + 4, Math.max(vis.left + 4, vis.right - w - 4));
  const above = rect.top - h - 6, below = rect.bottom + 6;
  const top = above >= vis.top + 4 ? above : below + h <= vis.bottom - 4 ? below : clamp(above, vis.top + 4, Math.max(vis.top + 4, vis.bottom - h - 4));
  el.style.left = `${left - base.left}px`; el.style.top = `${top - base.top}px`;
}
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
