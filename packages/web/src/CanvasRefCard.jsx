import { useContext } from 'react';
import { CanvasRefs, NewTabButton, RefTitle } from './CanvasRefChips.jsx';
import { OpenLink } from './DestinationRow.jsx';

// A standalone canvas-reference card's body (brief section 3), inside the shared CanvasNode frame, so it selects,
// moves, deletes, saves and undoes like any card. A press on its background selects it; its title and Open navigate and its
// new-tab button opens a tab, none selecting or dragging; all stay clickable in the hand tool (pointer-events-auto, as on
// view-only pages). The destination row's alignment (DestinationRow.jsx, owner 2026-10-29): Linked canvas and the title once,
// on the left, Open on the right; one line, since the card's size is fixed (REF_CARD). One ref: { id, target }.
const stop = event => event.stopPropagation();

export default function CanvasRefCard({ block }) {
  const refs = useContext(CanvasRefs);
  const reference = block.refs?.[0];
  const target = !refs || !reference ? { unavailable: true } : refs.resolve(reference.target);
  return (
    <div data-canvas-ref-card data-target={reference?.target} {...(target?.unavailable ? { 'data-unavailable': '' } : {})}
      className="flex min-w-0 flex-1 items-center gap-3 px-4 pb-3.5">
      <span className="pointer-events-auto flex min-w-0 flex-1 flex-col" onPointerDown={event => { if (event.target.closest('a')) stop(event); }} onContextMenu={event => { if (event.target.closest('a')) stop(event); }}>
        <span className="text-[11px] leading-[14px] text-ink-2">Linked canvas</span>
        <span className="flex min-w-0 text-[13px] leading-[18px] font-medium text-ink"><RefTitle target={target} go={refs?.go} className="truncate" /></span>
        {target?.path && <span className="truncate text-xs leading-4 text-ink-2" title={target.path}>{target.path}</span>}
      </span>
      <span onPointerDown={stop} onContextMenu={event => { if (event.target.closest('a')) stop(event); }} className="pointer-events-auto flex shrink-0 items-center gap-1">
        <NewTabButton target={target} size={15} className="h-8 w-8 rounded-lg hover:bg-hover" />
        <OpenLink href={target && !target.unavailable ? target.href : null} name={target?.title} onGo={refs?.go} />
      </span>
    </div>
  );
}
