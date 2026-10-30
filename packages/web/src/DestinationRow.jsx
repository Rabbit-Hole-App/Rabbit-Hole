import { ArrowDownRight, ArrowRight } from 'lucide-react';
import { plainClick } from './LinksPanel.jsx';

// The destination row (owner, Rabbit Hole and reference navigation design 2026-10-29): one treatment for every way off a card
// or group - Rabbit Hole / Enter, Linked canvas / Open, Linked from / Open. The relationship label and the destination title on
// the left (the title may wrap to two lines), the action right-aligned in the primary blue (ui.jsx Button primary: white on
// --color-primary-fill in both themes, its focus and disabled treatments). A 1px divider above each row on the side surface;
// only the container's last row takes its rounded bottom corners (the card's and group's 12px, less their 1px border).
export const ROW_CLASS = 'flex items-center gap-3 border-t border-line bg-side px-4 py-3.5 hover:bg-hover';
export const ACTION_CLASS = 'inline-flex min-h-9 min-w-[76px] shrink-0 items-center justify-center gap-1 rounded-[6px] bg-primary-fill px-3 text-xs leading-4 font-medium whitespace-nowrap text-white transition-colors duration-100 select-none hover:bg-primary-fill-hover focus-visible:outline-2 focus-visible:outline-accent/35 disabled:cursor-default disabled:opacity-50 pointer-coarse:min-h-11';

export function DestinationRow({ label, children, actions, clamp = 'line-clamp-2', round = 'last:rounded-b-[11px]', className = '', ...props }) {
  return (
    <div {...props} className={`${ROW_CLASS} ${round} ${className}`}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[11px] leading-[14px] text-ink-2">{label}</span>
        <span className={`min-w-0 text-[13px] leading-[18px] font-medium break-words text-ink ${clamp}`}>{children}</span>
      </span>
      {actions}
    </div>
  );
}

const ICON = { size: 14, strokeWidth: 1.8, 'aria-hidden': true };
export const EnterIcon = () => <ArrowDownRight {...ICON} />;
export const OpenIcon = () => <ArrowRight {...ICON} />;

// Open as a real link (plain click: onGo, which saves first; Ctrl/Cmd, middle and right click stay the browser's), or, with no
// href (loading, unavailable), a disabled Open that names nothing and goes nowhere.
export function OpenLink({ href, name, onGo, ...props }) {
  if (!href) return <button type="button" disabled className={ACTION_CLASS}>Open<OpenIcon /></button>;
  return (
    <a href={href} aria-label={`Open ${name}`} title={`Open ${name}`} {...props} className={ACTION_CLASS}
      onClick={event => { if (plainClick(event)) { event.preventDefault(); onGo(href); } }}>Open<OpenIcon /></a>
  );
}

// The Rabbit Hole row: its title and Enter, into the portal (Dive.jsx DivePortals). data-dive-portal names the hole; its
// right-click stays the card's menu (Enter / Delete Rabbit Hole).
export function HoleRow({ hole }) {
  return (
    <DestinationRow label="Rabbit Hole" data-hole-row={hole.name} {...(hole.pending ? { 'data-pending': '' } : {})}
      actions={<button type="button" data-dive-portal={hole.name} aria-label={`Enter the Rabbit Hole: ${hole.title}`} title={`Enter the Rabbit Hole: ${hole.title}`}
        onPointerDown={event => event.stopPropagation()} onClick={hole.enter} className={ACTION_CLASS}>Enter<EnterIcon /></button>}>
      <span title={hole.title}>{hole.title}</span>
    </DestinationRow>
  );
}

// Two neutral layers peeking out under an element that owns a Rabbit Hole: about 6 and 12 px down, 5 and 10 px in, 1px
// line-strong edges, the element's 12px corners (dashed while the hole is pending). Inside the element (its padding box, so
// offsets are measured from the border edge), each clipped to the part below it, so neither draws over the element or its
// content. Decorative: no pointer, hidden from assistive technology.
export function HoleStack({ pending = false }) {
  const layer = `pointer-events-none absolute rounded-xl border border-line-strong bg-white ${pending ? 'border-dashed' : ''}`;
  return <>
    <span aria-hidden="true" data-hole-stack="2" className={layer} style={{ top: 0, left: 9, right: 9, bottom: -13, clipPath: 'inset(calc(100% - 12px) 0 0 0)' }} />
    <span aria-hidden="true" data-hole-stack="1" className={layer} style={{ top: 0, left: 4, right: 4, bottom: -7, clipPath: 'inset(calc(100% - 6px) 0 0 0)' }} />
  </>;
}
