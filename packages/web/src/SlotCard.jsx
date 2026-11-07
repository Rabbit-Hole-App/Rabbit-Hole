import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { StepPill, PILL_BOX } from './NextStepPill.jsx';
import { STRINGS as ROADMAP_STRINGS } from './roadmap-strings.js';
import { SourceRefLine, useSourceRefStatus } from './SourceRefChip.jsx';
import { NO_FILE_CARD } from './source-ref.js';

// Moved out of AdaptiveCanvas.jsx unchanged for plain slots, so it can be rendered and tested alone; AdaptiveCanvas still draws every slot with it.
// A reserved slot (canvas-slots.js): the coming card's frame - its size, and CanvasNode's border, radius,
// shadow and drag strip - with a spinner, what is being made, and how long it has taken. Not a block: it
// cannot be selected, moved or asked about, and it is gone when the card lands or the wait ends.
// A Tutor slot (slot.roadmap, roadmap-canvas.js) is the SAME frame through the step's whole life, at its own world position beside the source:
//   pending     the proposed title and description over the skeleton lines; Accept [Tab] | Cancel (StepPill) 8px below the frame, outside it.
//   generating  (and checking) the same frame and title; a 16px spinner inside the content placeholder; the pill's place shows a non-interactive Generating status.
//   failed      the same frame and title with the server's sentence in place (the toast in RoadmapSurfaces offers Retry); nothing spins.
export function SlotCard({ slot, actions = null }) {
  const [now, setNow] = useState(() => performance.now());
  const card = slot.roadmap || null;
  // The pending offer's source line: the same row a delivered card shows (SourceRefLine), its status the server's (the step's minted ref), View passage showing the
  // step's passage from the plan's raw offsets (actions.onPassage). No ref, no passage, or not pending: no row.
  const ref = card?.state === 'pending' && card.sourceRef?.id && card.passage ? card.sourceRef : null;
  const status = useSourceRefStatus(ref?.id ?? null, actions?.app ?? null, ref?.source?.rev);
  const [note, setNote] = useState('');
  useEffect(() => { if (card) return undefined; const timer = setInterval(() => setNow(performance.now()), 100); return () => clearInterval(timer); }, [card]);
  // An anchored slot (canvas-slots.js anchoredSlots) stands at its own world position, out of the column's flow; any other slot is the column's, as always.
  const place = slot.at ? { position: 'absolute', left: slot.at.x, top: slot.at.y } : { marginTop: slot.top || undefined };
  const frame = `relative ${slot.at ? '' : 'mx-auto '}flex shrink-0 cursor-default flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm`;
  const strip = <div className="flex h-6 shrink-0 items-center justify-center"><span className="h-1 w-12 rounded-full bg-line" /></div>;
  const lines = <div aria-hidden="true" className="flex flex-col gap-3 px-4">
    <span className="skeleton-line h-4 w-2/3 rounded" />
    {['w-full', 'w-11/12', 'w-full', 'w-3/4'].map((width, index) => <span key={index} className={`skeleton-line h-3 rounded ${width}`} />)}
  </div>;
  if (!card) {
    return (
      <div data-slot-id={slot.id} role="status" aria-label={slot.label} style={{ width: slot.w, height: slot.h, ...place }} className={frame}>
        {strip}
        <div className="flex items-center gap-2 px-4 pb-4 text-sm">
          <Loader2 size={14} className="shrink-0 animate-spin text-ink-3" />
          <span className="shimmer min-w-0 truncate">{slot.label}</span>
          <span aria-hidden="true" data-slot-elapsed className="ml-auto shrink-0 text-xs text-ink-3 tabular-nums">{((now - slot.started) / 1000).toFixed(1)}s</span>
        </div>
        {lines}
      </div>
    );
  }
  const pending = card.state === 'pending', failed = card.state === 'failed';
  return (
    // data-thumbnail-hide: a Tutor slot is the learner's private offer, never part of the board's thumbnail (card-thumbnail.js CHROME) or an area crop (AdaptiveCanvas).
    // The pending wrapper (frame and pill) is the keyboard owner, as the old overlay was: Tab inside it accepts, and its pill is found inside it.
    <div data-slot-id={slot.id} data-roadmap-slot={card.state} data-thumbnail-hide {...(pending ? { 'data-roadmap-overlay': '', tabIndex: -1 } : {})} onPointerDown={event => event.stopPropagation()}
      style={{ width: slot.w, ...place }} className="flex flex-col gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/40">
      <div role={pending ? 'group' : 'status'} aria-label={card.title || slot.label} style={{ height: slot.h }} className={frame}>
        {strip}
        <p className="px-4 pb-1 text-sm font-semibold break-words text-ink">{card.title}</p>
        {pending && card.description && <p className="px-4 pb-3 text-[13px] leading-normal break-words text-ink-2">{card.description}</p>}
        {ref && <SourceRefLine ref_={ref} status={status} note={note} onOpen={() => setNote(actions?.onPassage?.(card) === 'no-card' ? NO_FILE_CARD : '')} />}
        {failed
          ? <p role="alert" className="px-4 pt-2 text-[13px] break-words text-ink-2">{card.failure?.message || ROADMAP_STRINGS.failed}</p>
          : <div className="relative">
            {lines}
            {!pending && <Loader2 size={16} aria-hidden="true" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-ink-3" />}
          </div>}
      </div>
      {pending && <div className="self-start"><StepPill pill={{ accept: card.acceptable && !card.accepting, accepting: card.accepting }} onAccept={() => actions?.onAccept?.()} onCancel={() => actions?.onCancel?.()} /></div>}
      {!pending && !failed && <span role="status" data-roadmap-generating className={`${PILL_BOX} self-start px-2 font-medium text-ink-3`}>{ROADMAP_STRINGS.generating}</span>}
    </div>
  );
}
