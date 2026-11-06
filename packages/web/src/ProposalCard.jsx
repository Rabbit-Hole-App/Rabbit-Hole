import { useEffect, useState } from 'react';
import { BookOpen, CircleAlert, FileText, Loader2, Table2 } from 'lucide-react';
import { STRINGS } from './roadmap-strings.js';
import { editKey } from './inline-ai-proposal.js';

// The Tutor's offer as a card ON the canvas (Fix C, T6): the existing card frame (AdaptiveCanvas SlotCard's: border, radius, shadow, drag strip), standing at its own
// world position beside the passage it comes from, so it pans and zooms with the canvas. One component for the whole life of the step:
//   pending     type, title, description, pale static placeholder lines, a subtle source line; NO spinner, NO timer (nothing has started); the compact strip below.
//   checking    the server is checking: private, nothing to accept; the honest stage line, no percentage.
//   generating  the existing skeleton: spinner, shimmering stage line, elapsed time, shimmering lines.
//   failed      the server's sentence and the recoveries it allows; the card is never left spinning.
// The Accept [Tab] | Cancel strip hangs BELOW and OUTSIDE the frame, neutral (theme tokens, SelectionActions' 28px small actions, square ends), no price.
// Not a block: never saved, shared, forked or undone (canvas-slots.js). `data-roadmap-overlay` marks the keyboard owner exactly as the old fixed overlay did.
// ponytail: the labels below are NEW learner strings pending owner approval; they live here so no other lane's strings file changes.
export const TYPE_LABEL = Object.freeze({ explanation: 'Explanation', table: 'Table' });
export const STAGE = Object.freeze({ checking: STRINGS.checking, generating: STRINGS.making });
const action = 'flex h-7 cursor-pointer items-center gap-1.5 px-2 text-xs font-medium whitespace-nowrap text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset disabled:cursor-default disabled:text-ink-3 disabled:hover:bg-transparent';
const line = (width, index) => <span key={index} className={`block h-3 rounded bg-hover ${width}`} />;
const stop = event => event.stopPropagation(); // a press on the card is never a canvas gesture (pan, marquee, deselect)

// What the body of the frame shows besides the type row and the title.
function Body({ card, elapsed }) {
  if (card.state === 'failed') {
    return (
      <div role="alert" className="flex items-start gap-2 px-4 pb-4 text-[13px] text-ink-2"><CircleAlert size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" /><span className="min-w-0 break-words">{card.failure?.message || STRINGS.failed}</span></div>
    );
  }
  if (card.state === 'generating' || card.state === 'checking') {
    return (
      <>
        <div className="flex items-center gap-2 px-4 pb-3 text-sm">
          <Loader2 size={14} className="shrink-0 animate-spin text-ink-3" aria-hidden="true" />
          <span className="shimmer min-w-0 truncate">{STAGE[card.state]}</span>
          <span aria-hidden="true" data-slot-elapsed className="ml-auto shrink-0 text-xs text-ink-3 tabular-nums">{elapsed}s</span>
        </div>
        <div aria-hidden="true" className="flex flex-col gap-3 px-4">
          {['w-2/3', 'w-full', 'w-11/12', 'w-full', 'w-3/4'].map((width, index) => <span key={index} className={`skeleton-line h-3 rounded ${width}`} />)}
        </div>
      </>
    );
  }
  return (
    <>
      {card.description && <p data-roadmap-description className="line-clamp-4 px-4 pb-3 text-[13px] leading-normal break-words text-ink-2">{card.description}</p>}
      {/* Static, pale: what the card will be, not content and not progress. A table is a small outline of rows and columns. */}
      <div aria-hidden="true" data-roadmap-placeholder={card.format} className="flex flex-col gap-2 px-4">
        {card.format === 'table'
          ? [0, 1, 2].map(row => <div key={row} className="grid grid-cols-3 gap-2">{[0, 1, 2].map(col => <span key={col} className={`block h-4 rounded ${row === 0 ? 'bg-line' : 'bg-hover'}`} />)}</div>)
          : ['w-full', 'w-11/12', 'w-full', 'w-2/3'].map(line)}
      </div>
    </>
  );
}

// The editor box Ctrl/Cmd+K opens (the controller's edit state), under the strip: the same keys as the old overlay (Enter previews, Ctrl/Cmd+Enter applies, Esc discards).
function Editor({ edit }) {
  const [text, setText] = useState('');
  const act = which => { if (which === 'preview') edit.onPreview(text); else if (which === 'apply') edit.onApply(); else if (which === 'discard') { setText(''); edit.onDiscard(); } };
  const checked = edit.draft?.checkStatus === 'passed';
  return (
    <div data-roadmap-editor className="flex flex-col gap-1.5 border border-line bg-white p-1.5">
      <textarea autoFocus rows={2} value={text} placeholder={STRINGS.editPlaceholder} aria-label={STRINGS.edit} onChange={event => setText(event.target.value)}
        onKeyDown={event => { const which = editKey(event.nativeEvent, { draft: edit.draft, busy: edit.busy, text }); if (which && which !== 'keep') { event.preventDefault(); event.stopPropagation(); act(which); } }}
        className="resize-none rounded-none border border-line bg-white p-1.5 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/40" />
      {edit.draft && <div data-roadmap-draft className="border border-line bg-hover p-1.5 text-xs text-ink-2">{checked ? <><p className="text-[13px] font-semibold break-words text-ink">{edit.draft.title}</p><p className="break-words">{edit.draft.description}</p></> : STRINGS.editRejected}</div>}
      <div className="flex border border-line self-start">
        <button type="button" data-roadmap-apply disabled={!checked || edit.busy} onClick={() => act('apply')} className={action}>{STRINGS.apply}</button>
        <button type="button" data-roadmap-discard onClick={() => act('discard')} className={`${action} border-l border-line`}>{STRINGS.discard}</button>
      </div>
    </div>
  );
}

// slot: { w, h, at, started, label } (the canvas's reservation); card: roadmap-canvas.js's placeholder; actions: { onAccept, onCancel, onRecover(stepId, action), edit } from the page.
export default function ProposalCard({ slot, card, actions = {} }) {
  const [now, setNow] = useState(() => performance.now());
  const ticking = card.state === 'generating' || card.state === 'checking';
  useEffect(() => { if (!ticking) return undefined; setNow(performance.now()); const timer = setInterval(() => setNow(performance.now()), 100); return () => clearInterval(timer); }, [ticking]);
  const pending = card.state === 'pending';
  const Icon = card.format === 'table' ? Table2 : FileText;
  const typeLabel = TYPE_LABEL[card.format] || TYPE_LABEL.explanation;
  const source = card.sourceName || null;
  const edit = pending ? actions.edit : null;
  const canView = !!actions.onPassage && !!card.passage && !!card.sourceKey;
  return (
    <div data-slot-id={slot.id} data-roadmap-card={card.state} onPointerDown={stop} style={{ position: 'absolute', left: slot.at.x, top: slot.at.y, width: slot.w }} className="flex flex-col gap-1.5">
      <section {...(pending ? { 'data-roadmap-overlay': '', tabIndex: -1 } : {})} role={pending ? 'group' : 'status'} aria-label={card.title || slot.label} style={{ height: slot.h }}
        className="relative flex shrink-0 cursor-default flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
        <div className="flex h-6 shrink-0 items-center justify-center"><span className="h-1 w-12 rounded-full bg-line" /></div>
        <div className="flex items-center gap-1.5 px-4 pb-1 text-xs text-ink-3"><Icon size={13} strokeWidth={1.8} aria-hidden="true" /><span data-roadmap-type>{typeLabel}</span></div>
        <h3 data-roadmap-title className="line-clamp-2 px-4 pb-1.5 text-sm font-semibold break-words text-ink">{card.title}</h3>
        <Body card={card} elapsed={((now - slot.started) / 1000).toFixed(1)} />
        {(source || canView) && (
          <div className="mt-auto flex items-center gap-1.5 px-4 pt-2 pb-3 text-xs text-ink-3">
            <p data-roadmap-source className="min-w-0 flex-1 truncate">{source ? STRINGS.fromSource(source) : ''}</p>
            {/* The exact passage, on explicit request only: the source card is brought into view with the passage emphasized (a collapsed card opens as far as it needs). */}
            {canView && <button type="button" data-roadmap-passage aria-label="View passage" title="View passage" onClick={() => actions.onPassage(card)}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"><BookOpen size={13} aria-hidden="true" /></button>}
          </div>
        )}
      </section>
      {pending && (
        <div role="group" aria-label="Proposal" data-roadmap-pill className="flex border border-line bg-white self-start">
          <button type="button" data-roadmap-accept disabled={!card.acceptable || card.accepting || !!edit?.open} aria-busy={card.accepting || undefined} onClick={actions.onAccept}
            className={`${action} font-semibold`}>
            {card.accepting ? STRINGS.accepting : <>{STRINGS.accept}<kbd aria-hidden="true" className="rounded border border-line bg-hover px-1 font-sans text-[10px] font-normal text-ink-3">{STRINGS.tab}</kbd></>}
          </button>
          <button type="button" data-roadmap-cancel disabled={card.cancelling} onClick={actions.onCancel} className={`${action} border-l border-line`}>{STRINGS.cancel}</button>
        </div>
      )}
      {edit?.open && <Editor edit={edit} />}
      {card.state === 'failed' && (card.recovery || []).length > 0 && (
        <div role="group" aria-label="Recovery" data-roadmap-recovery className="flex border border-line bg-white self-start">
          {card.recovery.map((which, index) => <button key={which} type="button" data-roadmap-recover={which} onClick={() => actions.onRecover?.(card.stepId, which)} className={`${action}${index ? ' border-l border-line' : ''}`}>{STRINGS[which] || which}</button>)}
        </div>
      )}
    </div>
  );
}
