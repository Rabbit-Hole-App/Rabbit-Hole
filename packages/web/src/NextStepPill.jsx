import { useState } from 'react';
import { STRINGS } from './roadmap-strings.js';
import { editKey } from './inline-ai-proposal.js';

// The compact square pill: green Accept with its Tab key label, red Cancel after a left border, zero corner radius, no price or
// estimate (D24). A version the server has not marked accept-ready keeps its name, greyed.
export function StepPill({ pill, onAccept, onCancel }) {
  return (
    <div role="group" aria-label="Proposal" data-roadmap-pill className="inline-flex h-8 overflow-hidden rounded-none text-xs font-medium text-white">
      <button type="button" data-roadmap-accept disabled={!pill.accept} onClick={onAccept}
        className="inline-flex items-center gap-1.5 rounded-none bg-green-600 px-2.5 outline-none hover:bg-green-700 focus-visible:ring-2 focus-visible:ring-green-300 disabled:bg-green-600/40">
        {STRINGS.accept}<kbd className="rounded-none border border-white/60 px-1 text-[10px] leading-4">{STRINGS.tab}</kbd>
      </button>
      <button type="button" data-roadmap-cancel onClick={onCancel}
        className="rounded-none border-l border-white/70 bg-red-600 px-2.5 outline-none hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-300">{STRINGS.cancel}</button>
    </div>
  );
}

// The pending proposal as a private overlay: not a board block, so it is never saved, shared, forked or undone. position: the
// fixed screen point from overlayPosition; the Tab handler treats focus inside [data-roadmap-overlay] as owned.
export function ProposalOverlay({ pill, position, onAccept, onCancel, edit = null, drag = null }) {
  return (
    <section data-roadmap-overlay tabIndex={-1} aria-label={pill.title} style={{ left: position.left, top: position.top, width: position.width }}
      className="fixed z-30 flex flex-col gap-2 border border-line bg-white p-3 shadow-md outline-none">
      {drag && <div data-roadmap-drag onPointerDown={drag} className="-mx-3 -mt-3 h-3 cursor-grab touch-none border-b border-line bg-hover" aria-hidden="true" />}
      <h3 className="break-words text-sm font-semibold text-ink">{pill.title}</h3>
      {pill.description && <p className="break-words text-[13px] leading-normal text-ink-2">{pill.description}</p>}
      {pill.link && <p data-roadmap-existing className="truncate text-xs text-ink-3">{STRINGS.existingCard}</p>}
      {pill.source && <p data-roadmap-source className="truncate text-xs text-ink-3">{STRINGS.fromSource(pill.source)}</p>}
      <StepPill pill={pill} onAccept={onAccept} onCancel={onCancel} />
      {edit && <ProposalTools pill={pill} edit={edit} />}
    </section>
  );
}

// R5: Edit (Ctrl/Cmd+K), the preview beside the still-pending original, Apply and Discard. Nothing here accepts, charges or generates.
function ProposalTools({ pill, edit }) {
  const [text, setText] = useState('');
  const btn = 'h-7 rounded-none border border-line bg-white px-2 text-xs font-medium text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40';
  if (!edit.open) return <div className="flex gap-1.5"><button type="button" data-roadmap-edit onClick={edit.onOpen} className={btn}>{STRINGS.edit}</button></div>;
  const act = action => { if (action === 'preview') edit.onPreview(text); else if (action === 'apply') edit.onApply(); else if (action === 'discard') { setText(''); edit.onDiscard(); } };
  return (
    <div data-roadmap-editor className="flex flex-col gap-1.5">
      <textarea autoFocus rows={2} value={text} placeholder={STRINGS.editPlaceholder} aria-label={STRINGS.edit} onChange={event => setText(event.target.value)}
        onKeyDown={event => { const action = editKey(event.nativeEvent, { draft: edit.draft, busy: edit.busy, text }); if (action && action !== 'keep') { event.preventDefault(); event.stopPropagation(); act(action); } }}
        className="resize-none rounded-none border border-line bg-white p-1.5 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/60" />
      {edit.draft && (
        <div data-roadmap-draft className="flex flex-col gap-0.5 border border-line bg-hover p-1.5">
          {edit.draft.checkStatus === 'passed' ? <><p className="break-words text-[13px] font-semibold text-ink">{edit.draft.title}</p><p className="break-words text-xs text-ink-2">{edit.draft.description}</p></> : <p className="break-words text-xs text-ink-2">{STRINGS.editRejected}</p>}
        </div>
      )}
      <div className="flex gap-1.5">
        <button type="button" data-roadmap-apply disabled={edit.draft?.checkStatus !== 'passed' || edit.busy} onClick={() => act('apply')} className={btn}>{STRINGS.apply}</button>
        <button type="button" data-roadmap-discard onClick={() => act('discard')} className={btn}>{STRINGS.discard}</button>
      </div>
    </div>
  );
}

// "Next step ready": navigates to the pending overlay and does nothing else (never accepts, never proposes, no automatic camera).
export function NextStepIndicator({ indicator, onGo }) {
  if (!indicator) return null;
  return (
    <button type="button" data-roadmap-next-ready onClick={onGo}
      className="fixed right-4 bottom-4 z-30 h-8 rounded-none border border-line bg-white px-2.5 text-xs font-medium text-ink shadow-md outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/60">{indicator.label}</button>
  );
}
