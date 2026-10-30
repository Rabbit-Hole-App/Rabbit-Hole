import { createContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FileText, Group, ImageIcon, Maximize2, MessageSquareText, Minimize2, NotebookPen, Pin, X } from 'lucide-react';
import { Md } from './ask.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';
import { selectionRef } from './selection-ref.js';
import VoiceNote from './VoiceNote.jsx';
import { voiceNoteFor, voiceSubmitState } from './explain-back-media.js';
import SketchRecorder from './SketchRecorder.jsx';
import { recordingSubmitState, sketchRecordingFor } from './sketch-recording.js';
import { FEEDBACK_SECTIONS, PANEL, askTutorText, attemptLabel, optionText, panelLayout, ratingBadge, stackTop } from './explain-back-view.js';

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
//   recording: { upload, uploadAudio, load, onSaved(blockId, saved) }   the Sketch recording's private storage
//                                                    (sketch-recording.js); without upload no recorder is shown.
//   VoicePlayer                                      a submitted note's player ({ note: EvidenceRef, seekMs }), or absent.
//   openEvidence({ attemptId, evidence, memberId, locator })   opens a cited input at the submitted revision, or absent.
//   teachingAids(attemptId) -> [{ id, title, kind, cardId }]    the attempt's linked teaching cards, or absent.
//   openTeachingAid(aid)                             reveals the existing card on the canvas (no new generation).
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
  if (!owners.has(root)) owners.set(root, { owner: null, lock: null, listeners: new Set() });
  return owners.get(root);
};
// The open panel's owner may hold it (`lock`: 'recording' or 'pinned'); another question's Open sketch then does not take it.
export const PANEL_LOCKED = {
  recording: 'The Sketch panel is recording for another question. Stop that recording first.',
  pinned: 'The Sketch panel is pinned to another question. Unpin or close it there first.',
};
export function usePanelOwner(root) {
  const store = ownerStore(root);
  const owner = useSyncExternalStore(listener => { if (!store) return () => {}; store.listeners.add(listener); return () => store.listeners.delete(listener); }, () => store?.owner ?? null);
  const setOwner = id => { if (!store || store.owner === id) return; store.owner = id; store.lock = null; for (const listener of [...store.listeners]) listener(); };
  // A question that goes away (deleted, undone) gives the panel up; closing keeps it, so the owner never flickers.
  const releaseOwner = id => { if (store?.owner === id) setOwner(null); };
  const setLock = (id, lock) => { if (store?.owner === id) store.lock = lock; };
  // Why `id` may not take the panel now (a learner-readable reason), or null.
  const lockedFor = id => (store && store.owner !== null && store.owner !== id && store.lock ? PANEL_LOCKED[store.lock] : null);
  return [owner, setOwner, releaseOwner, setLock, lockedFor];
}

// The draft's retained voice note and Sketch recording (EB-06): one controller each per draft key, above any panel or card
// mount. The card reads their state in its own render (useDraftMedia), so Submit never lags what the controls show; they
// never see the typed answer. `initial` (a revision only): the voice EvidenceRef carried from the attempt it started from,
// or null for none; a revision never falls back to the store's saved note, so an old note cannot return into a later draft.
const noMedia = { subscribe: () => () => {}, get: () => null };
export function useDraftMedia({ draftKey, voiceStore, recordingStore, blockId, initial = undefined }) {
  const note = voiceStore ? voiceNoteFor(draftKey, { upload: voiceStore.upload, load: voiceStore.load, saved: initial !== undefined ? initial : voiceStore.saved?.(blockId) ?? null, onSaved: saved => voiceStore.onSaved?.(blockId, saved) }) : null;
  const take = recordingStore ? sketchRecordingFor(draftKey, { upload: recordingStore.upload, uploadAudio: recordingStore.uploadAudio, load: recordingStore.load, onSaved: saved => recordingStore.onSaved?.(blockId, saved) }) : null;
  const noteState = useSyncExternalStore((note || noMedia).subscribe, (note || noMedia).get);
  const takeState = useSyncExternalStore((take || noMedia).subscribe, (take || noMedia).get);
  return {
    note, take,
    voice: note ? { ...voiceSubmitState(noteState), saved: noteState?.saved ?? null } : null,
    recording: take ? { ...recordingSubmitState(takeState), saved: takeState?.saved ?? null, recording: ['requesting', 'recording', 'paused'].includes(takeState?.status) } : null,
  };
}
export { VoiceNote, SketchRecorder };

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
  // Expand gives the Sketch the whole dock for a while; Restore puts both areas back. Open sketch never starts expanded.
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => { setDock(panel.current?.parentElement || null); });
  useLayoutEffect(() => {
    if (!dock || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width }));
    observer.observe(dock);
    return () => observer.disconnect();
  }, [dock]);
  // The owning question as it is on screen now (its width at the canvas zoom, its bottom while stacked).
  const ownerRect = () => surface?.querySelector(`[data-block-id="${CSS.escape(ownerId)}"]`)?.getBoundingClientRect() || null;
  const layout = panelLayout(size.w, dragWidth ?? savedWidth, ownerRect()?.width);
  // Stacked, the panel sits under the whole card and follows it as the canvas pans or zooms (one frame read while stacked).
  const [cardBottom, setCardBottom] = useState(null);
  useEffect(() => {
    if (layout.mode !== 'stack' || expanded || !dock) return undefined;
    let frame = 0, last = null;
    const follow = () => {
      const rect = ownerRect(), bottom = rect ? Math.round(rect.bottom - dock.getBoundingClientRect().top) : null;
      if (bottom !== last) { last = bottom; setCardBottom(bottom); }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [layout.mode, expanded, dock]);
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
  const side = layout.mode === 'side' && !expanded;
  const resize = value => Math.max(layout.min, Math.min(layout.max, Math.round(value)));
  const style = expanded ? { inset: PANEL.edge } : side
    ? { top: PANEL.edge, right: PANEL.edge, width: layout.width, height: `min(560px, calc(100% - ${2 * PANEL.edge}px))` }
    : { left: PANEL.edge, right: PANEL.edge, top: stackTop(cardBottom), height: `max(${PANEL.floor}px, min(440px, calc(100% - ${stackTop(cardBottom) + PANEL.edge}px)))` };
  return portal(
    <section ref={panel} data-explain-sketch-panel={ownerId} data-panel-mode={expanded ? 'expanded' : layout.mode} data-thumbnail-hide aria-label="Sketch" style={style}
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
          {expanded
            ? <button type="button" data-sketch-restore aria-label="Restore Sketch panel" title="Restore" onClick={() => setExpanded(false)} className={iconButton}><Minimize2 size={16} /></button>
            : <button type="button" data-sketch-expand aria-label="Expand Sketch panel" title="Expand" onClick={() => setExpanded(true)} className={iconButton}><Maximize2 size={16} /></button>}
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
// `cited`: the citation being shown ({ evidenceId, quote, locator }); its passage, voice note or input is marked.
export function AnswerView({ attempt, cited = null, VoicePlayer = null }) {
  const highlight = cited?.quote || '';
  const words = attempt.answer.text, at = highlight ? words.indexOf(highlight) : -1;
  const mark = id => (cited?.evidenceId === id ? 'rounded-md ring-2 ring-primary-fill/40' : '');
  return (
    <div data-answer-view={attempt.id} className="space-y-2 text-sm">
      {words ? (
        <p data-answer className="whitespace-pre-wrap break-words">{at < 0 ? words : <>{words.slice(0, at)}<mark data-cited className="rounded-sm bg-primary-fill/15 text-ink">{highlight}</mark>{words.slice(at + highlight.length)}</>}</p>
      ) : <p className="text-ink-2 italic">No written text in this answer.</p>}
      {highlight && at < 0 && <p role="status" className="text-xs text-ink-2">The cited passage is not in this answer.</p>}
      {attempt.answer.sketched && <p data-answer-sketched className="text-xs text-ink-2">This answer includes a sketch.</p>}
      {attempt.answer.voice.map(note => (
        <div key={note.evidenceId || note.assetId} data-answer-voice={note.evidenceId} {...(cited?.evidenceId === note.evidenceId ? { 'data-cited': '' } : {})} className={mark(note.evidenceId)}>
          {VoicePlayer ? <VoicePlayer note={note} seekMs={cited?.evidenceId === note.evidenceId ? cited.locator?.startMs ?? null : null} /> : <p className="text-xs text-ink-2">This answer includes a voice note.</p>}
        </div>
      ))}
      {attempt.answer.inputs.length > 0 && <InputPills inputs={attempt.answer.inputs} cited={cited?.evidenceId} />}
    </div>
  );
}

// Tutor feedback (section 8): the three elements, the revision comparison, evidence citations that open the submitted
// answer, and Ask Tutor, which fills the Chat composer without sending. A legacy review is shown as the Tutor wrote it.
export function FeedbackView({ attempt, question, blockId, onCite, onFile, aids = [], onOpenAid = null }) {
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
      {aids.length > 0 && onOpenAid && (
        <section data-teaching-aids>
          <h3 className="mb-1 text-xs font-semibold text-ink-2">Teaching material</h3>
          <ul className="space-y-1">
            {aids.map(aid => (
              <li key={aid.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[13px]" title={aid.title}>{aid.title}</span>
                {/* Open on canvas reveals the card already made for this feedback; it never generates another. */}
                <button type="button" data-open-aid={aid.id} onClick={() => onOpenAid(aid)} className="h-7 shrink-0 cursor-pointer rounded-md border border-line px-2 text-xs text-ink hover:bg-hover">Open on canvas</button>
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
export function InputPills({ inputs, onRemove = null, onOpen = null, cited = null }) {
  return (
    <ul data-input-pills className="flex flex-wrap gap-1.5">
      {inputs.map(input => {
        const Icon = INPUT_ICONS[input.kind] || FileText;
        const detail = [input.kind === 'group' && Number.isInteger(input.count) ? `${input.count} items` : '', input.scope || ''].filter(Boolean).join(' · ');
        const members = input.members?.length ? `Items: ${input.members.join(', ')}` : '';
        const full = [detail ? `${input.name} · ${detail}` : input.name, members, input.problem].filter(Boolean).join('. ');
        const name = <>{input.name}{detail && <span className="text-ink-2"> · {detail}</span>}{input.problem && <span className="text-danger"> · Not available</span>}</>;
        return (
          <li key={input.id} data-input-pill={input.id} data-input-kind={input.kind} {...(cited === input.id ? { 'data-cited': '' } : {})}
            className={`flex h-7 max-w-full items-center gap-1 rounded-md border bg-surface pr-0.5 pl-2 text-xs text-ink ${input.problem ? 'border-danger/50' : 'border-line'} ${cited === input.id ? 'ring-2 ring-primary-fill/40' : ''}`}>
            <Icon size={14} className="shrink-0 text-ink-2" aria-hidden="true" />
            {onOpen ? <button type="button" title={full} aria-label={`Open ${full}`} onClick={() => onOpen(input)} className="min-w-0 cursor-pointer truncate text-left">{name}</button>
              : <span tabIndex={0} title={full} aria-label={full} className="min-w-0 truncate">{name}</span>}
            {onRemove ? <button type="button" aria-label={`Remove ${input.name}`} onClick={() => onRemove(input)} className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-ink-2 hover:bg-hover hover:text-ink"><X size={13} /></button> : <span className="w-1.5" />}
          </li>
        );
      })}
    </ul>
  );
}

// The Input picker (section 4, accessible path): the same link a port drag makes, from a native list of the canvas's
// sources read when it opens. A source that cannot be an input is listed, disabled, with its reason.
export function InputPicker({ list, onConnect }) {
  const [rows, setRows] = useState([]);
  const load = () => setRows(list());
  return (
    <select aria-label="Connect an input" data-input-picker value="" onFocus={load} onPointerDown={load}
      onChange={event => { if (event.target.value) onConnect(event.target.value); }}
      className="h-7 max-w-full min-w-0 rounded-md border border-dashed border-line bg-surface px-1.5 text-xs text-ink-2 outline-none focus-visible:border-ink-3 pointer-coarse:text-base">
      <option value="">Connect an input</option>
      {rows.map(row => <option key={row.id} value={row.id} disabled={!!row.problem}>{row.kind === 'group' ? `Group: ${row.label}` : row.label}{row.problem ? ' (not available)' : ''}</option>)}
    </select>
  );
}
