import { createContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FileText, Group, ImageIcon, MessageSquareText, NotebookPen, Pin, X } from 'lucide-react';
import { Md } from './ask.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';
import { selectionRef } from './selection-ref.js';
import VoiceNote, { useVoiceNote } from './VoiceNote.jsx';
import { voiceNoteFor, voiceSubmitState } from './explain-back-media.js';
import { FEEDBACK_SECTIONS, PANEL, askTutorText, attemptLabel, optionText, panelLayout, ratingBadge } from './explain-back-view.js';

// Explain-back card pieces (plan docs/superpowers/plans/2026-10-30-explain-back.md sections 3, 7H, 8 and 9): the one
// right-side Sketch panel, the attempt selector and blue rating, and the Your answer / Tutor feedback views. The card
// itself (ChallengeBody, LearningBlocks.jsx) composes them; data and actions arrive through props, never fetched here.

// The durable attempt store for Explain-back (EB-02/04/07/08), provided around the canvas by LearnPage. Null keeps the
// card on its own single-attempt grade path. Value:
//   card(blockId)                                   raw state for one card (explain-back-view.js serviceView reads it)
//   submit({ block, text, sketch, voice, parentAttemptId }) -> Promise   one immutable attempt; rejects with a message
//   retry({ block, attemptId }) -> Promise           assess the same attempt again (not a new learner attempt)
//   voice: { upload, load, saved(blockId), onSaved(blockId, saved) }   the retained voice note's private storage
//                                                    (explain-back-media.js createVoiceNote options); without upload no
//                                                    voice entry is shown. submit's `voice` is the saved note or null.
//   VoicePlayer                                      a submitted note's player ({ note: EvidenceRef }), or absent.
export const ExplainBackService = createContext(null);

// The one place the card reads the canvas's capture seam (EB-01 UI boundaries; AdaptiveCanvas captureFor, sketch-host.js):
// the picture keyed by question and draft, or { error } with the learner-readable reason. A sketch that could not be
// pictured is never sent as a text-only answer. A host without captureFor (none today) falls back to capture(id).
export const CAPTURE_FAILED = 'The sketch could not be captured, so nothing was submitted. Your work is kept; try again.';
export async function sketchCapture(host, questionId, draftId = null) {
  if (host?.captureFor) {
    try { const shot = await host.captureFor({ questionId, draftId }); return { image: shot.image, text: shot.text }; }
    catch (error) { return { error: error?.message || CAPTURE_FAILED }; }
  }
  const image = await host?.capture?.(questionId);
  return image ? { image } : { error: CAPTURE_FAILED };
}

// One Sketch panel per canvas: the question that holds it. Opening another question's Sketch is the explicit retarget;
// the previous owner closes itself. Keyed by the canvas surface, so two canvases never share an owner.
const owners = new WeakMap();
const ownerStore = root => {
  if (!root) return null;
  if (!owners.has(root)) owners.set(root, { owner: null, listeners: new Set() });
  return owners.get(root);
};
export function usePanelOwner(root) {
  const store = ownerStore(root);
  const owner = useSyncExternalStore(listener => { if (!store) return () => {}; store.listeners.add(listener); return () => store.listeners.delete(listener); }, () => store?.owner ?? null);
  const setOwner = id => { if (!store || store.owner === id) return; store.owner = id; for (const listener of [...store.listeners]) listener(); };
  // A question that goes away (deleted, undone) gives the panel up; closing keeps it, so the owner never flickers.
  const releaseOwner = id => { if (store?.owner === id) setOwner(null); };
  return [owner, setOwner, releaseOwner];
}

// The retained voice note on the answer card (EB-06, VoiceNote.jsx): its controller outlives this component (keyed by the
// draft); its submit state goes up to the card's Submit. It never sees the typed answer.
export function AnswerVoice({ draftKey, store, blockId, onState }) {
  const note = voiceNoteFor(draftKey, { upload: store.upload, load: store.load, saved: store.saved?.(blockId) ?? null, onSaved: saved => store.onSaved?.(blockId, saved) });
  const state = useVoiceNote(note);
  const gate = voiceSubmitState(state);
  const saved = state?.saved ?? null;
  useEffect(() => { onState({ ...gate, saved }); }, [gate.ready, gate.blocked, saved]);
  return <VoiceNote note={note} />;
}

const stop = event => event.stopPropagation(); // a portal's events bubble through React to the card: never select, drag or open it
const iconButton = 'flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:w-11';

// The Sketch panel (section 3): docked at the workspace's right edge, independently resizable from its left edge, stacked
// under the card below 720 px. Header: Sketch, the attempt, Pin (aria-pressed) and Close; then the owner row, which goes
// back to the question; then the drawing surface (children) and the Sketch media controls (media). No connector, no
// coupled move. It mounts through the canvas's dock (`portal`, sketchHost.portal) and sizes itself from that dock.
// Unpinned, a press elsewhere on the canvas `surface` closes it unless `busy` (a recording) holds it open.
export function SketchPanel({ portal, surface, ownerId, ownerTitle, status, width: savedWidth, onWidth, pinned, onPin, onClose, onFocusOwner, busy = false, media = null, children }) {
  const panel = useRef(null), drag = useRef(null);
  const [size, setSize] = useState({ w: 1200 });
  const [dragWidth, setDragWidth] = useState(null);
  const [dock, setDock] = useState(null);
  useLayoutEffect(() => { setDock(panel.current?.parentElement || null); });
  useLayoutEffect(() => {
    if (!dock || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width }));
    observer.observe(dock);
    return () => observer.disconnect();
  }, [dock]);
  const layout = panelLayout(size.w, dragWidth ?? savedWidth);
  // The canvas pans on a wheel anywhere on its surface; over the panel the wheel belongs to the panel.
  useEffect(() => {
    const element = panel.current;
    if (!element) return undefined;
    const hold = event => { if (!(event.ctrlKey || event.metaKey)) event.stopPropagation(); };
    element.addEventListener('wheel', hold, { passive: true });
    return () => element.removeEventListener('wheel', hold);
  }, [dock]);
  useEffect(() => {
    if (pinned || busy || !surface) return undefined;
    const outside = event => {
      const target = event.target;
      if (!(target instanceof Element) || !surface.contains(target) || panel.current?.contains(target)) return;
      if (target.closest(`[data-block-id="${CSS.escape(ownerId)}"]`) || target.closest('[role="toolbar"],[role="menu"],[role="dialog"],[role="listbox"],[data-tool-gutter]')) return;
      onClose({ outside: true });
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [pinned, busy, surface, ownerId, onClose]);
  const side = layout.mode === 'side';
  const resize = value => Math.max(layout.min, Math.min(layout.max, Math.round(value)));
  const style = side
    ? { top: PANEL.edge, right: PANEL.edge, width: layout.width, height: `min(560px, calc(100% - ${2 * PANEL.edge}px))` }
    : { left: PANEL.edge, right: PANEL.edge, bottom: PANEL.edge, height: 'min(440px, 55%)' };
  return portal(
    <section ref={panel} data-explain-sketch-panel={ownerId} data-panel-mode={layout.mode} data-thumbnail-hide aria-label="Sketch" style={style}
      onPointerDown={stop} onPointerUp={stop} onClick={stop} onDoubleClick={stop} onContextMenu={stop}
      className="absolute z-30 flex flex-col rounded-xl border border-line bg-surface text-ink shadow-lg">
      {side && <div role="separator" aria-label="Resize Sketch panel" aria-orientation="vertical" aria-valuemin={layout.min} aria-valuemax={layout.max} aria-valuenow={layout.width} tabIndex={0}
        data-sketch-resize title="Drag to resize"
        className="group absolute inset-y-0 -left-[5px] z-10 flex w-[10px] cursor-col-resize touch-none items-center justify-center focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:-left-[11px] pointer-coarse:w-[22px]"
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, width: layout.width }; setDragWidth(layout.width); }}
        onPointerMove={event => { if (drag.current) setDragWidth(resize(drag.current.width + drag.current.x - event.clientX)); }}
        onPointerUp={event => { if (!drag.current) return; const next = resize(drag.current.width + drag.current.x - event.clientX); drag.current = null; setDragWidth(null); onWidth(next); }}
        onPointerCancel={() => { drag.current = null; setDragWidth(null); }}
        onKeyDown={event => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); onWidth(resize(layout.width + (event.key === 'ArrowLeft' ? PANEL.step : -PANEL.step))); }}>
        <span aria-hidden="true" className="h-[38px] w-[3px] rounded-full bg-line-strong group-hover:bg-ink-3" />
      </div>}
      <header className="flex h-[54px] shrink-0 items-center gap-2 border-b border-line px-4">
        <h2 className="text-[14px] font-medium">Sketch</h2>
        {status && <span data-sketch-status className="min-w-0 truncate text-xs text-ink-2">{status}</span>}
        <span className="ml-auto flex items-center gap-0.5">
          {/* ponytail: the optional expand/restore focus action is not built; Open sketch never enters a focus mode. */}
          <button type="button" data-sketch-pin aria-pressed={!!pinned} aria-label="Pin Sketch panel" title={pinned ? 'Unpin' : 'Pin to this question'}
            onClick={() => onPin(!pinned)} className={`${iconButton} ${pinned ? 'bg-hover text-ink' : ''}`}><Pin size={16} fill={pinned ? 'currentColor' : 'none'} /></button>
          <button type="button" data-sketch-close aria-label="Close Sketch" title="Close" onClick={() => onClose({ outside: false })} className={iconButton}><X size={16} /></button>
        </span>
      </header>
      <button type="button" data-sketch-owner-row onClick={onFocusOwner} title={ownerTitle} aria-label={`Go to question: ${ownerTitle}`}
        className="flex h-10 shrink-0 cursor-pointer items-center gap-2 border-b border-line px-4 text-left text-xs text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent">
        <span className="shrink-0 font-medium text-ink">Question</span><span className="min-w-0 flex-1 truncate">{ownerTitle}</span>
      </button>
      <div data-sketch-body className="relative min-h-0 flex-1 p-3">{children}</div>
      {media && <div data-sketch-media className="shrink-0 border-t border-line px-4 py-3">{media}</div>}
    </section>);
}

// The selected attempt's blue rating (7H): only a stored rating is the solid N/10; Assessing and Not rated are neutral.
// Display only: no pointer, no tab stop; its words are read out instead of the numerals.
export function RatingBadge({ attempt }) {
  const badge = ratingBadge(attempt);
  if (!badge) return null;
  return (
    <span data-rating-badge={badge.tone} className={`inline-flex h-6 shrink-0 items-center justify-center rounded-full px-2 text-xs leading-4 font-semibold whitespace-nowrap tabular-nums ${badge.tone === 'rated' ? 'min-w-[52px] bg-primary-fill text-white' : 'border border-line bg-hover font-medium text-ink-2'}`}>
      <span aria-hidden="true">{badge.text}</span><span className="sr-only">{badge.label}</span>
    </span>
  );
}

// The attempt line above the tabs: a native selector once there are two or more attempts or drafts (each option's text
// carries its score), else the plain label; the selected attempt's badge beside it in either view.
export function AttemptBar({ entries, selected, onSelect }) {
  return (
    <div data-attempt-bar className="mt-3 flex flex-wrap items-center gap-2">
      {entries.length >= 2 ? (
        <select aria-label="Attempt" data-attempt-select value={selected.id} onChange={event => onSelect(event.target.value)}
          className="h-8 max-w-full min-w-0 rounded-md border border-line bg-surface px-2 text-[13px] text-ink outline-none focus-visible:border-ink-3 pointer-coarse:text-base">
          {entries.map(entry => <option key={entry.id} value={entry.id}>{optionText(entry)}</option>)}
        </select>
      ) : <span data-attempt-label className="text-[13px] font-medium text-ink">{attemptLabel(selected)}</span>}
      <RatingBadge attempt={selected} />
    </div>
  );
}

const TABS = [['answer', 'Your answer'], ['feedback', 'Tutor feedback']];
export function FeedbackTabs({ tab, onTab, idBase }) {
  const move = event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onTab(tab === 'answer' ? 'feedback' : 'answer'); } };
  return (
    <div role="tablist" aria-label="Answer and feedback" className="mt-2 flex gap-1 border-b border-line">
      {TABS.map(([key, label]) => (
        <button key={key} type="button" role="tab" id={`${idBase}-${key}`} aria-selected={tab === key} aria-controls={`${idBase}-panel`} tabIndex={tab === key ? 0 : -1}
          data-feedback-tab={key} onClick={() => onTab(key)} onKeyDown={move}
          className={`-mb-px h-9 cursor-pointer border-b-2 px-2 text-[13px] ${tab === key ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}>{label}</button>
      ))}
    </div>
  );
}

// A submitted answer as it was sent (immutable): its words, a cited passage marked, its sketch, voice notes and inputs.
export function AnswerView({ attempt, highlight = '', VoicePlayer = null }) {
  const words = attempt.answer.text, at = highlight ? words.indexOf(highlight) : -1;
  return (
    <div data-answer-view={attempt.id} className="space-y-2 text-sm">
      {words ? (
        <p data-answer className="whitespace-pre-wrap break-words">{at < 0 ? words : <>{words.slice(0, at)}<mark data-cited className="rounded-sm bg-primary-fill/15 text-ink">{highlight}</mark>{words.slice(at + highlight.length)}</>}</p>
      ) : <p className="text-ink-2 italic">No written text in this answer.</p>}
      {highlight && at < 0 && <p role="status" className="text-xs text-ink-2">The cited passage is not in this answer.</p>}
      {attempt.answer.sketched && <p data-answer-sketched className="text-xs text-ink-2">This answer includes a sketch.</p>}
      {attempt.answer.voice.length > 0 && (VoicePlayer ? attempt.answer.voice.map(note => <VoicePlayer key={note.id || note.assetId} note={note} />) : <p className="text-xs text-ink-2">This answer includes a voice note.</p>)}
      {attempt.answer.inputs.length > 0 && <InputPills inputs={attempt.answer.inputs} />}
    </div>
  );
}

// Tutor feedback (section 8): the three elements, the revision comparison, evidence citations that open the submitted
// answer, and Ask Tutor, which fills the Chat composer without sending. A legacy review is shown as the Tutor wrote it.
export function FeedbackView({ attempt, question, blockId, onCite, onFile }) {
  const chat = useChatWorkspace();
  const feedback = attempt.feedback;
  if (!feedback) return <p className="text-sm text-ink-2">No feedback for this attempt.</p>;
  const ask = () => {
    const content = askTutorText(question, attempt);
    chat.composer.prepare({ mode: 'tutor', text: `Help me with what to revisit in my attempt ${attempt.number}.`, contextRefs: [selectionRef({ ids: [blockId], kind: 'card', name: `Explain back: ${question}`.slice(0, 120), content })] });
  };
  return (
    <div data-feedback-view={attempt.id} className="space-y-3 text-sm">
      {feedback.sections ? FEEDBACK_SECTIONS.map(([key, title]) => feedback.sections[key] && (
        <section key={key} data-feedback-section={key}>
          <h3 className="mb-0.5 text-xs font-semibold text-ink-2">{title}</h3>
          <Md text={feedback.sections[key]} onFile={onFile} />
        </section>
      )) : <div data-feedback-text><Md text={feedback.text} onFile={onFile} /></div>}
      {feedback.comparison && <section data-feedback-comparison><h3 className="mb-0.5 text-xs font-semibold text-ink-2">Compared with your earlier attempt</h3><Md text={feedback.comparison} onFile={onFile} /></section>}
      {feedback.citations.length > 0 && (
        <section data-feedback-citations>
          <h3 className="mb-1 text-xs font-semibold text-ink-2">Evidence</h3>
          <ul className="flex flex-wrap gap-1.5">
            {feedback.citations.map(cite => (
              <li key={cite.id}>
                <button type="button" data-citation={cite.id} disabled={!cite.available} onClick={() => onCite(cite)}
                  className="max-w-56 cursor-pointer truncate rounded-md border border-line px-2 py-0.5 text-xs text-ink hover:bg-hover disabled:cursor-default disabled:text-ink-3 disabled:hover:bg-transparent">
                  {cite.label || 'Your answer'}{cite.available ? '' : ' (unavailable)'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {chat && <button type="button" data-ask-tutor onClick={ask} className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line px-2.5 text-[13px] text-ink hover:bg-hover"><MessageSquareText size={15} />Ask Tutor</button>}
    </div>
  );
}

const INPUT_ICONS = { notebook: NotebookPen, group: Group, image: ImageIcon };
// Connected inputs under the answer field (section 4): one wrapping pill per connection, a Group as one pill with its
// member count; × disconnects through the canvas's own operation. Read-only pills (a submitted answer) have no ×.
export function InputPills({ inputs, onRemove = null, onOpen = null }) {
  return (
    <ul data-input-pills className="flex flex-wrap gap-1.5">
      {inputs.map(input => {
        const Icon = INPUT_ICONS[input.kind] || FileText;
        const detail = [input.kind === 'group' && Number.isInteger(input.count) ? `${input.count} items` : '', input.scope || ''].filter(Boolean).join(' · ');
        const full = detail ? `${input.name} · ${detail}` : input.name;
        return (
          <li key={input.id} data-input-pill={input.id} className="flex h-7 max-w-full items-center gap-1 rounded-md border border-line bg-surface pr-0.5 pl-2 text-xs text-ink">
            <Icon size={14} className="shrink-0 text-ink-2" aria-hidden="true" />
            <button type="button" title={full} aria-label={`Open ${full}`} disabled={!onOpen} onClick={() => onOpen?.(input)} className="min-w-0 cursor-pointer truncate text-left disabled:cursor-default">
              {input.name}{detail && <span className="text-ink-2"> · {detail}</span>}
            </button>
            {onRemove ? <button type="button" aria-label={`Remove ${input.name}`} onClick={() => onRemove(input)} className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-ink-2 hover:bg-hover hover:text-ink"><X size={13} /></button> : <span className="w-1.5" />}
          </li>
        );
      })}
    </ul>
  );
}
