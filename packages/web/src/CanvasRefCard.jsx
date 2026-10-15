import { useContext } from 'react';
import { Shapes } from 'lucide-react';
import { CanvasRefs, NewTabButton, RefTitle } from './CanvasRefChips.jsx';

// A standalone canvas-reference card's body (brief section 3), inside the shared CanvasNode frame, so it selects,
// moves, deletes, saves and undoes like any card. A press on its background selects it; its title navigates and its
// new-tab button opens a tab, neither selecting nor dragging. One ref: { id, target }.
const stop = event => event.stopPropagation();

export default function CanvasRefCard({ block }) {
  const refs = useContext(CanvasRefs);
  const reference = block.refs?.[0];
  const target = !refs || !reference ? { unavailable: true } : refs.resolve(reference.target);
  return (
    <div data-canvas-ref-card data-target={reference?.target} {...(target?.unavailable ? { 'data-unavailable': '' } : {})}
      className="flex min-w-0 items-center gap-3 px-4 pt-1 pb-4">
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-hover text-ink-2"><Shapes size={20} strokeWidth={1.7} /></span>
      <span className="flex min-w-0 flex-1 flex-col" onPointerDown={event => { if (event.target.closest('a')) stop(event); }} onContextMenu={event => { if (event.target.closest('a')) stop(event); }}>
        <span className="flex min-w-0 text-sm font-semibold text-ink"><RefTitle target={target} go={refs?.go} /></span>
        {target?.path && <span className="truncate text-xs text-ink-2">{target.path}</span>}
      </span>
      <span onPointerDown={stop} className="flex"><NewTabButton target={target} size={15} className="h-8 w-8 rounded-lg hover:bg-hover" /></span>
    </div>
  );
}
