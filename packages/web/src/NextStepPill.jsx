import { useState } from 'react';
import { STRINGS } from './roadmap-strings.js';
import { editKey } from './inline-ai-proposal.js';
import { NEXT_CARD } from './roadmap-client.js';

// The Accept [Tab] | Cancel pill: 28px high, 4px corners, the canvas selection bar's small actions (SelectionActions.jsx Action, class string reused) inside one
// bordered box; green Accept / Next card and muted-red Cancel (file 02, owner-approved; supersedes the neutral-only rule), no price or estimate (D24). A version the
// server has not marked accept-ready keeps its name, greyed. PILL_BOX is the box, also worn by the non-interactive stage status that takes the pill's place after acceptance.
export const PILL_BOX = 'inline-flex h-7 items-center overflow-hidden rounded border border-line bg-white text-xs';
const ACTION = 'flex h-7 cursor-pointer items-center gap-2 px-2.5 text-xs font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-[#2383e2]/40 focus-visible:outline-none';
const GO = 'bg-success/10 text-success hover:bg-success/20 dark:bg-[#1d3b2b] dark:text-[#b9edce] dark:hover:bg-[#28513a] dark:hover:text-[#dcfce7]';
const STOP = 'bg-danger/10 text-[#b83b3b] hover:bg-danger/20 dark:bg-[#402626] dark:text-[#f0b9b9] dark:hover:bg-[#583131] dark:hover:text-[#ffe0e0]';
// The stage a slot shows in the pill's place once accepted (UI.04; contracts.md results[].stage). shortcut: these live here until roadmap-strings.js (Chat lane) takes them.
export const STAGE = Object.freeze({ generating: STRINGS.generating, checking: 'Checking', saving: 'Saving' });
// tabHint: the [Tab] key label, shown where Tab accepts (the canvas); the Chat message's copy of the pill leaves it out (Tab does not accept there).
export function StepPill({ pill, onAccept, onCancel, tabHint = true }) {
  return (
    <div role="group" aria-label="Proposal" data-roadmap-pill className={PILL_BOX}>
      <button type="button" data-roadmap-accept disabled={!pill.accept} aria-busy={pill.accepting || undefined} onClick={onAccept} className={`${ACTION} ${GO} disabled:cursor-default disabled:opacity-40`}>
        {pill.accepting ? STRINGS.accepting : <>{pill.label || STRINGS.accept}{tabHint && <kbd aria-hidden="true" className="rounded border border-success/40 bg-success/10 px-1 font-sans text-[10px] font-normal dark:border-[#456a53] dark:bg-[#2b4c39] dark:text-[#c0dfcd]">{STRINGS.tab}</kbd>}</>}
      </button>
      <button type="button" data-roadmap-cancel onClick={onCancel} className={`${ACTION} ${STOP} border-l border-line`}>{STRINGS.cancel}</button>
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
      {!pill.next && <StepPill pill={pill} onAccept={onAccept} onCancel={onCancel} />}
      {edit && <ProposalTools pill={pill} edit={edit} />}
    </section>
  );
}

// R5: Edit (Ctrl/Cmd+K), the preview beside the still-pending original, Apply and Discard. Nothing here accepts, charges or generates.
export function ProposalTools({ pill, edit }) {
  const [text, setText] = useState('');
  const btn = 'h-7 rounded border border-line bg-white px-2 text-xs font-medium text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40';
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

// UI.08 (file 02 Show Next card state): the one Next card | Cancel pill for a ready later offer, bottom-centre of the canvas viewport, outside the moving world
// (AdaptiveCanvas draws it in its floating bottom strip, above the chrome there). The same acceptance as Chat's Next card and Tab; no Tab hint, no Next step ready chip.
export function NextCardPill({ card, onAccept, onCancel }) {
  if (!card || card.state !== 'pending' || !card.next) return null;
  return (
    <div data-roadmap-next-pill className="shadow-md">
      <StepPill pill={{ accept: card.acceptable && !card.accepting, accepting: card.accepting, label: NEXT_CARD }} tabHint={false} onAccept={onAccept} onCancel={onCancel} />
    </div>
  );
}

