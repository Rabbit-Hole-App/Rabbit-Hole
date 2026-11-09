// E2: the interaction layer of the delivered Explanation card (docs/features/explain.md section 4, "Approved interaction contract - E2"; approved card
// 07). It lives INSIDE LearningBlocks.jsx::ExplanationBody and adds only what the spec names: orange term pills with a definition and Explore (a new /explain card about the term), the
// three suggested questions, the bottom + with the Ask a follow-up field, and the selection toolbar (Ask in chat, Highlight, Create note). Everything here
// is gated on `block.interactions` (written only while the server switch EXPLANATION_INTERACTIONS is on): a card without the envelope renders exactly as
// before, with no wrapper, no spacer row and no listener. Actions go through the canvas host (explanation-host.js) and the Chat workspace; a surface
// without them omits the controls it cannot run. Pure mapping, anchors and state: explanation-interactions.js.
import { createElement, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, GitBranch, Highlighter, MessageSquare, MessageSquarePlus, Plus, StickyNote, Trash2 } from 'lucide-react';
import { Button, toast } from './ui.jsx';
import { MdInline } from './Md.jsx';
import { ToolButton } from './selection-toolbar.jsx';
import { selectionRef } from './selection-ref.js';
import { useChatWorkspace } from './chat-workspace.jsx';
import { ExplanationHost } from './explanation-host.js';
import { alignField, anchorsFromRange, exploreQuestion, termSentence, contentRevision, contentRevisionInput, decorate, fieldText, fieldsOf, highlightsFor, quoteOf, suggestionsFor, termsFor, undecorate, withConsumed, withHighlight, withoutHighlight } from './explanation-interactions.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const newId = () => crypto.randomUUID();
const collapse = text => String(text ?? '').replace(/\s+/g, ' ').trim();

// A floating element placed against a client rect, in the card's own (zoomed) pixels. prefer 'above' puts a toolbar over the selection when there is room.
function place(el, rect, origin, prefer = 'below') {
  if (!el || !rect || !origin) return;
  const box = origin.getBoundingClientRect(), k = box.width / (origin.offsetWidth || 1) || 1, w = el.offsetWidth, h = el.offsetHeight;
  const left = clamp((rect.left + rect.width / 2 - box.left) / k - w / 2, 6, Math.max(6, origin.offsetWidth - w - 6));
  const above = (rect.top - box.top) / k - h - 6, below = (rect.bottom - box.top) / k + 6;
  const top = prefer === 'above' ? (above >= 6 ? above : below) : (below + h <= origin.offsetHeight - 6 ? below : Math.max(6, above));
  el.style.left = `${left}px`; el.style.top = `${top}px`;
}

const pillFor = (flow, id) => Array.from(flow?.querySelectorAll('[data-term-first]') || []).find(el => el.getAttribute('data-term-id') === id) || null;
// Owner 2026-11-08: no solid fill. The term colour is on the text (claude-deep reads as text in both themes) with a thin outline; hover and the open
// pill only tint faintly; keyboard focus keeps the Button outline.
const PILL = 'cursor-pointer rounded-[5px] border border-claude/50 px-[5px] text-[0.92em] leading-[1.35] font-medium whitespace-nowrap text-claude-deep hover:bg-claude/10 aria-expanded:bg-claude/10 focus-visible:outline-2 focus-visible:outline-accent/35';
const MARKED = 'rounded-[2px] bg-yellow-300/40';

// The layer for one card: null when the card has no envelope. block: the card now; onChange (undoable) and onChangeQuiet (not) save it through the board.
export function useExplanationLayer(block, { onChange, onChangeQuiet, readOnly = false, enabled: allowed = true }) {
  const enabled = allowed && !!block.interactions;
  const host = useContext(ExplanationHost), chat = useChatWorkspace();
  const input = enabled ? contentRevisionInput(block) : '';
  const [computed, setComputed] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    contentRevision(block).then(revision => { if (live) setComputed({ input, revision }); });
    return () => { live = false; };
  }, [enabled, input]); // eslint-disable-line react-hooks/exhaustive-deps
  const revision = enabled && computed?.input === input ? computed.revision : null;
  const latest = useRef({ block, revision, onChange, onChangeQuiet });
  latest.current = { block, revision, onChange, onChangeQuiet };
  const flowRef = useRef(null), rootRef = useRef(null), fields = useRef(new Map());
  const [openTerm, setOpenTerm] = useState(null); // { id, via }
  const [pending, setPending] = useState(null);   // { qid, destination } while a send waits for admission
  const inflight = useRef(null), hoverTimer = useRef(0);
  const [bar, setBar] = useState(null);           // { rect, quote, segments } for the selection offered the toolbar
  const barEl = useRef(null), noteEl = useRef(null);
  const [menu, setMenu] = useState(null);         // { id, rect }: the saved highlight offered Remove highlight (the file and webpage cards' highlight menu)
  const menuEl = useRef(null);
  const canEdit = !readOnly;

  // ---- terms ----
  const closeTerm = useCallback((restore = false) => {
    setOpenTerm(current => {
      if (restore && current) pillFor(flowRef.current, current.id)?.focus?.();
      return null;
    });
  }, []);
  const pillOf = event => event.target?.closest?.('[data-term-id]');
  // Owner 2026-11-09: the term's note (definition + Explore) shows on HOVER, not only on a click. A short open delay keeps a pointer crossing the text from popping it, a close delay lets the pointer
  // travel from the term onto the note without flicker, and keyboard focus opens it too. A click pins it (via 'pointer'); touch has no hover and keeps the tap.
  const later = (fn, ms) => { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(fn, ms); };
  const holdTerm = () => clearTimeout(hoverTimer.current);
  const leaveTerm = () => later(() => setOpenTerm(current => (current?.via === 'hover' || current?.via === 'focus' ? null : current)), 250);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const flowProps = {
    onPointerOver: event => { const pill = event.pointerType === 'touch' ? null : pillOf(event); if (pill && !pill.contains(event.relatedTarget)) { const id = pill.getAttribute('data-term-id'); later(() => setOpenTerm(current => (current && current.via !== 'hover' && current.via !== 'focus' ? current : { id, via: 'hover' })), 120); } },
    onPointerOut: event => { const pill = pillOf(event); if (pill && !pill.contains(event.relatedTarget) && !noteEl.current?.contains(event.relatedTarget)) leaveTerm(); },
    onFocus: event => { const pill = pillOf(event); if (pill && event.target.matches?.(':focus-visible')) { const id = pill.getAttribute('data-term-id'); setOpenTerm(current => (current ? current : { id, via: 'focus' })); } },
    // Pointer handlers on a pill never reach the card (it would select or start a drag): the pill is a control, like the section toggles.
    onPointerDown: event => { if (pillOf(event)) event.stopPropagation(); },
    onClick: event => {
      const pill = pillOf(event);
      if (pill) { const id = pill.getAttribute('data-term-id'); clearTimeout(hoverTimer.current); setOpenTerm(current => (current?.id === id ? (current.via === 'hover' || current.via === 'focus' ? { id, via: event.detail === 0 ? 'key' : 'pointer' } : null) : { id, via: event.detail === 0 ? 'key' : 'pointer' })); return; }
      // A press on a saved highlight (not a drag that selected text) offers Remove highlight, as the file and webpage cards do.
      const mark = event.target?.closest?.('[data-highlight-ids]'), selection = window.getSelection?.();
      if (mark && canEdit && (!selection || selection.isCollapsed)) setMenu({ id: mark.getAttribute('data-highlight-ids').split(' ')[0], rect: mark.getBoundingClientRect() });
    },
    onKeyDown: event => {
      const pill = pillOf(event);
      // Enter on a pill opens its definition, never the card (the canvas opens the selected card on Enter).
      if (pill && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); const id = pill.getAttribute('data-term-id'); clearTimeout(hoverTimer.current); setOpenTerm(current => (current?.id === id ? (current.via === 'hover' || current.via === 'focus' ? { id, via: 'key' } : null) : { id, via: 'key' })); }
    },
    onScroll: () => { setOpenTerm(null); },
  };
  useEffect(() => {
    if (!openTerm) return undefined;
    const escape = event => { if (event.key === 'Escape') { event.stopPropagation(); closeTerm(true); } };
    const away = event => { if (!noteEl.current?.contains(event.target) && !event.target?.closest?.('[data-term-id]')) closeTerm(false); };
    document.addEventListener('keydown', escape, true); document.addEventListener('pointerdown', away, true);
    return () => { document.removeEventListener('keydown', escape, true); document.removeEventListener('pointerdown', away, true); };
  }, [openTerm, closeTerm]);
  useEffect(() => { setOpenTerm(null); setMenu(null); }, [revision]);
  useEffect(() => {
    if (!menu) return undefined;
    const escape = event => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(null); } };
    const away = event => { if (!menuEl.current?.contains(event.target)) setMenu(null); };
    document.addEventListener('keydown', escape, true); document.addEventListener('pointerdown', away, true);
    return () => { document.removeEventListener('keydown', escape, true); document.removeEventListener('pointerdown', away, true); };
  }, [menu]);
  const removeHighlight = () => {
    const now = latest.current;
    if (menu && canEdit) now.onChange?.(withoutHighlight(now.block, menu.id));
    setMenu(null);
  };

  // ---- sends (suggestions and the follow-up field share one authorized conversation and one in-flight slot) ----
  const send = async ({ text, qid = null, destination, afterAdmit = null }) => {
    const now = latest.current;
    if (inflight.current || !host?.ask || !now.revision || !collapse(text)) return false;
    // Everything the send needs is captured here, at the press: a late result or a later edit cannot change which card, revision or question it was.
    const captured = { id: now.block.id, revision: now.revision, question: collapse(text), destination, actionId: newId() };
    inflight.current = captured; setPending({ qid, destination });
    let admitted = false;
    const onAdmitted = () => { if (admitted) return; admitted = true; afterAdmit?.(captured); };
    try {
      const taken = await host.ask(captured, { onAdmitted });
      if (taken === true) onAdmitted();
      if (!admitted) toast('The question was not sent. Try again.', { tone: 'error' });
    } catch (error) {
      if (!admitted) toast(error?.message || 'The question was not sent. Try again.', { tone: 'error' });
    } finally { inflight.current = null; setPending(null); }
    return admitted;
  };
  const consume = captured => {
    const now = latest.current;
    if (now.revision !== captured.revision) return; // the text changed meanwhile: these are not that set
    (now.onChangeQuiet || now.onChange)?.(withConsumed(now.block, captured.revision, { id: captured.actionId, question: captured.question, destination: captured.destination }));
  };
  const askSuggestion = (question, destination) => send({ text: question.text, qid: question.id, destination, afterAdmit: consume });
  // Owner 2026-11-08: a follow-up typed under the card makes a new written /explain card (the same route as a suggested question's "Ask in a new card" but with no
  // arrow to this card): the Chat shows the question and its progress, the camera frames the new card (insertBlock fit), and the Depth is the Chat composer's.
  const askFollowUp = text => send({ text, destination: 'follow-up' });
  // Explore (owner 2026-11-09): a new written /explain card about the term, asked in the context of this card; same route as the bottom follow-up (no connector, camera frames the card, the Chat composer's Depth).
  const explore = term => send({ text: exploreQuestion({ term: term.label, title: latest.current.block.title, sentence: termSentence(latest.current.block, term) }), destination: 'explore' });

  // ---- selection toolbar ----
  const evaluate = () => {
    const flow = flowRef.current, selection = window.getSelection?.();
    const range = flow && selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
    // The suggested questions are controls, not the card's words: selecting them offers nothing.
    const inQuestions = node => !!(node?.nodeType === 1 ? node : node?.parentNode)?.closest?.('[data-explanation-suggestions]');
    if (!range || !flow.contains(range.startContainer) || !flow.contains(range.endContainer) || inQuestions(range.startContainer) || inQuestions(range.endContainer) || !collapse(selection.toString())) { setBar(null); return; }
    const entries = fieldsOf(latest.current.block).filter(name => fields.current.has(name)).map(name => { const { root } = fields.current.get(name), canonical = fieldText(latest.current.block, name); return { field: name, root, canonical, aligned: canonical == null ? null : alignField(root, canonical) }; });
    const segments = latest.current.revision ? anchorsFromRange(range, entries, latest.current.revision) : [];
    // The exact visible text: the mapped quote when the fields align, else what the browser selected. Captured now, before a button press moves focus.
    setBar({ rect: range.getBoundingClientRect(), quote: segments.length ? quoteOf(segments) : collapse(selection.toString()), segments });
  };
  const evaluateRef = useRef(evaluate); evaluateRef.current = evaluate;
  useEffect(() => {
    if (!enabled) return undefined;
    let raf = 0;
    const change = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => evaluateRef.current()); };
    document.addEventListener('selectionchange', change);
    return () => { document.removeEventListener('selectionchange', change); cancelAnimationFrame(raf); };
  }, [enabled]);
  useEffect(() => {
    if (!bar) return undefined;
    const escape = event => { if (event.key === 'Escape') { event.stopPropagation(); window.getSelection?.()?.removeAllRanges(); setBar(null); } };
    const away = event => { if (!barEl.current?.contains(event.target) && !flowRef.current?.contains(event.target)) setBar(null); };
    document.addEventListener('keydown', escape, true); document.addEventListener('pointerdown', away, true);
    return () => { document.removeEventListener('keydown', escape, true); document.removeEventListener('pointerdown', away, true); };
  }, [bar]);
  const done = () => { window.getSelection?.()?.removeAllRanges(); setBar(null); };
  const askInChat = () => {
    if (!bar || !chat) return;
    const quote = bar.quote, name = String(latest.current.block.title || 'Explanation').slice(0, 120);
    // Prepares the composer for the learner (a context pill carrying the exact quote); nothing is sent.
    chat.addToChat(selectionRef({ ids: [latest.current.block.id], kind: 'card', name, content: quote, quote, text: () => quote }));
    done();
  };
  const highlight = () => {
    const now = latest.current;
    if (!bar?.segments.length || !now.revision || !canEdit) return;
    now.onChange?.(withHighlight(now.block, newId(), bar.segments, now.revision));
    done();
  };
  const createNote = () => {
    if (!bar || !canEdit || !host?.note) return;
    const made = host.note({ id: latest.current.block.id, quote: bar.quote, segments: bar.segments, revision: latest.current.revision });
    if (made) done();
  };

  if (!enabled) return null;
  return { block, revision, host, chat, canEdit, flowRef, rootRef, fields, flowProps, openTerm, closeTerm, noteEl, barEl, bar, pending, askSuggestion, askFollowUp, explore, holdTerm, leaveTerm, askInChat, highlight, createNote, menu, menuEl, removeHighlight,
    terms: termsFor(block, revision), suggestions: suggestionsFor(block, revision), highlights: highlightsFor(block, revision) };
}

// One Markdown field of the card, the unit terms and highlights are anchored to. Decorates after every render: unwrap, align with the canonical text,
// wrap. A field that does not align (rendered text the canonical mapping does not hold) is left plain; maths and diagrams are islands. Keyed by the Markdown, so an edit remounts it rather than
// letting React update a text node the decoration has split.
export function InteractiveField({ layer, field, children }) {
  const ref = useRef(null), last = useRef(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    layer.fields.current.set(field, { root });
    const canonical = fieldText(layer.block, field), aligned = canonical == null ? null : alignField(root, canonical);
    const marks = aligned && layer.revision ? [
      ...layer.terms.filter(term => term.anchor.field === field).map(term => ({ start: term.anchor.start, end: term.anchor.end, kind: 'term', id: term.id })),
      ...layer.highlights.flatMap(h => h.segments.filter(segment => segment.field === field).map(segment => ({ start: segment.start, end: segment.end, kind: 'highlight', id: h.id }))),
    ] : [];
    // The marks only change when the terms or highlights do: re-wrapping on every render would replace the pill the learner just focused.
    const signature = JSON.stringify([canonical, marks]), present = !!root.querySelector('[data-explanation-mark]');
    if (last.current === signature && present === marks.length > 0) return;
    undecorate(root);
    last.current = signature;
    if (!marks.length) return;
    // Align again on the unwrapped text: undecorate merges the split text nodes back, so the alignment above points at nodes that are gone (a new
    // highlight on a card that already had pills threw here and the card fell back to its plain words).
    const fresh = alignField(root, canonical);
    if (fresh) decorate(fresh, marks, root.ownerDocument);
    for (const piece of root.querySelectorAll('[data-term-id]')) {
      piece.className = PILL;
      if (piece.hasAttribute('data-term-first')) { piece.setAttribute('role', 'button'); piece.setAttribute('tabindex', '0'); piece.setAttribute('aria-haspopup', 'dialog'); piece.setAttribute('aria-expanded', layer.openTerm?.id === piece.getAttribute('data-term-id') ? 'true' : 'false'); }
    }
    for (const piece of root.querySelectorAll('[data-highlight-ids]')) piece.className = piece.hasAttribute('data-term-id') ? `${PILL} ${MARKED}` : MARKED;
  });
  useLayoutEffect(() => () => { layer.fields.current.delete(field); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} data-explanation-field={field}>{children}</div>;
}

// The definition of the open term, under it (approved card 07 .term-note): its name, a short definition the learner can select, and Explore (owner 2026-11-09: it replaced the Rabbit Hole dig).
export function TermNote({ layer }) {
  const { openTerm, host, block, revision, noteEl, flowRef } = layer;
  const term = openTerm && layer.terms.find(entry => entry.id === openTerm.id);
  useLayoutEffect(() => {
    if (!term) return;
    const pill = pillFor(flowRef.current, term.id), origin = flowRef.current?.closest('[data-block-id]') || flowRef.current?.parentElement;
    if (pill) place(noteEl.current, pill.getBoundingClientRect(), origin);
    if (openTerm.via === 'key') noteEl.current?.focus?.({ preventScroll: true });
  }, [term?.id, openTerm?.via]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    for (const pill of flowRef.current?.querySelectorAll('[data-term-first]') || []) pill.setAttribute('aria-expanded', pill.getAttribute('data-term-id') === openTerm?.id ? 'true' : 'false');
  });
  if (!term) return null;
  return (
    <div ref={noteEl} data-term-note data-explanation-ui role="dialog" aria-label={term.label} tabIndex={-1} style={{ left: 0, top: 0 }}
      onPointerDown={event => event.stopPropagation()} onPointerEnter={layer.holdTerm} onPointerLeave={layer.leaveTerm}
      className="absolute z-30 w-[265px] max-w-[calc(100%-12px)] rounded-lg border border-line bg-white p-3 text-left shadow-pop outline-none select-text">
      <strong className="block text-sm text-ink">{term.label}</strong>
      <p className="mt-1 mb-2 text-[13px] leading-snug text-ink">{term.definition}</p>
      {host?.ask && layer.canEdit && <Button type="button" size="sm" variant="primary" data-explore onClick={() => { layer.explore(term); layer.closeTerm(false); }}>Explore</Button>}
    </div>
  );
}

const ACTION = 'grid h-7 w-7 place-items-center rounded-[5px] p-0 text-ink-2 hover:bg-active hover:text-accent focus-visible:bg-active focus-visible:text-accent disabled:cursor-default disabled:opacity-45';
// The three suggested questions below the reading flow (approved card 07 .suggestions). Ask here and Ask in a new card reveal on hover or focus.
export function Suggestions({ layer }) {
  const { suggestions, pending, host, canEdit } = layer;
  if (!suggestions.length || !host?.ask || !canEdit) return null;
  const busy = !!pending;
  return (
    <ul data-explanation-suggestions aria-label="Suggested next questions" className="m-0 mt-3 grid list-none gap-1 p-0">
      {suggestions.map(question => (
        <li key={question.id} data-explanation-suggestion={question.id} className="group/row flex min-h-9 items-center justify-between gap-1.5 rounded-md bg-hover py-0.5 pr-1 pl-2.5 text-[13px] leading-snug text-ink hover:bg-active focus-within:bg-active">
          <span id={`q-${question.id}`} className="min-w-0 select-text"><MdInline text={question.text} mathOnly /></span>
          <span className="pointer-events-none flex shrink-0 items-center gap-0.5 opacity-0 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100">
            <button type="button" data-ask="here" title="Ask here" aria-label="Ask here" aria-describedby={`q-${question.id}`} disabled={busy} aria-busy={pending?.qid === question.id && pending.destination === 'here' ? 'true' : undefined}
              onPointerDown={event => event.stopPropagation()} onClick={() => layer.askSuggestion(question, 'here')} className={ACTION}><MessageSquare size={16} aria-hidden="true" /></button>
            <button type="button" data-ask="card" title="Ask in a new card" aria-label="Ask in a new card" aria-describedby={`q-${question.id}`} disabled={busy} aria-busy={pending?.qid === question.id && pending.destination === 'card' ? 'true' : undefined}
              onPointerDown={event => event.stopPropagation()} onClick={() => layer.askSuggestion(question, 'card')} className={ACTION}><GitBranch size={16} aria-hidden="true" /></button>
          </span>
        </li>
      ))}
    </ul>
  );
}

// The separate bottom + and the Ask a follow-up field under the card (approved card 07 .follow-up-toggle, .composer). Sits under the card's bottom port, never on it:
// the port (AdaptiveCanvas data-port="bottom", h-4 centred on the edge) reaches 8 px below the card, so the + starts 24 px down (the port's 16 px plus a gap,
// owner 2026-11-08) and the field 12 px under the +;
// the round send is inside the field; a press outside closes it and keeps the unsent words.
export function FollowUp({ layer }) {
  const { host, canEdit, pending } = layer;
  const [open, setOpen] = useState(false), [text, setText] = useState('');
  const form = useRef(null), toggle = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    form.current?.querySelector('input')?.focus({ preventScroll: true });
    const away = event => { if (!form.current?.contains(event.target) && !toggle.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); toggle.current?.focus(); } };
    document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  if (!host?.ask || !canEdit) return null;
  const submit = async event => {
    event.preventDefault();
    const words = text;
    if (!collapse(words) || pending) return;
    // Cleared only once admitted; a refused send keeps the words.
    if (await layer.askFollowUp(words)) { setText(''); setOpen(false); }
  };
  return (
    <>
      <button ref={toggle} type="button" data-follow-up-toggle title="Ask a follow-up" aria-label="Ask a follow-up" aria-expanded={open} aria-controls="explanation-follow-up"
        onPointerDown={event => event.stopPropagation()} onClick={() => setOpen(value => !value)}
        className="absolute top-full left-1/2 z-20 mt-6 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full border border-line-strong bg-surface p-0 text-ink-2 opacity-0 transition-transform group-focus-within:opacity-100 group-hover:opacity-100 hover:scale-110 hover:border-accent hover:bg-accent hover:text-white focus-visible:opacity-100 aria-expanded:opacity-100">
        <Plus size={14} aria-hidden="true" />
      </button>
      {open && (
        <form ref={form} id="explanation-follow-up" data-follow-up onSubmit={submit} onPointerDown={event => event.stopPropagation()}
          className="absolute top-full right-0 left-0 z-20 mt-16 flex items-center gap-2 rounded-xl border border-line-strong bg-white py-1.5 pr-1.5 pl-3 shadow-pop focus-within:border-accent">
          <label className="sr-only" htmlFor="explanation-follow-up-text">Ask a follow-up</label>
          <input id="explanation-follow-up-text" type="text" autoComplete="off" maxLength={200} placeholder="Ask a follow-up" value={text} onChange={event => setText(event.target.value)}
            className="min-h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-ink outline-none placeholder:text-ink-2" />
          <button type="submit" data-follow-up-send aria-label="Send follow-up" title="Send follow-up" disabled={!collapse(text) || !!pending}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-0 bg-accent p-0 text-white hover:bg-primary-fill-hover disabled:cursor-default disabled:opacity-45"><ArrowUp size={16} aria-hidden="true" /></button>
        </form>
      )}
    </>
  );
}

// The selection toolbar (selection-toolbar.jsx): Ask in chat, Highlight, Create note, in that order. A control that cannot run here stays, greyed, with its name.
export function SelectionBar({ layer }) {
  const { bar, barEl, chat, host, canEdit } = layer;
  useLayoutEffect(() => {
    if (!bar) return;
    place(barEl.current, bar.rect, layer.flowRef.current?.closest('[data-block-id]') || layer.flowRef.current?.parentElement, 'above');
  });
  if (!bar) return null;
  return (
    <div ref={barEl} data-explanation-selection-toolbar data-explanation-ui role="toolbar" aria-label="Selected text" style={{ left: 0, top: 0 }}
      onPointerDown={event => event.stopPropagation()} className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-line bg-white p-1 shadow-pop">
      <ToolButton label="Ask in chat" icon={MessageSquarePlus} disabled={!chat} onClick={layer.askInChat} />
      <ToolButton label="Highlight" icon={Highlighter} disabled={!canEdit || !bar.segments.length} onClick={layer.highlight} />
      <ToolButton label="Create note" icon={StickyNote} disabled={!canEdit || !host?.note} onClick={layer.createNote} />
    </div>
  );
}

// Remove highlight on a saved highlight: the file and webpage cards' highlight menu (FileDocMarkdown.jsx, WebpageCard.jsx), the same markup.
export function HighlightMenu({ layer }) {
  const { menu, menuEl } = layer;
  useLayoutEffect(() => {
    if (!menu) return;
    place(menuEl.current, menu.rect, layer.flowRef.current?.closest('[data-block-id]') || layer.flowRef.current?.parentElement);
  });
  if (!menu) return null;
  return (
    <div ref={menuEl} data-explanation-highlight-menu data-explanation-ui role="menu" aria-label="Highlight" style={{ left: 0, top: 0 }} onPointerDown={event => event.stopPropagation()}
      className="absolute z-30 flex w-44 flex-col rounded-lg border border-line bg-white p-1 shadow-pop">
      <button type="button" role="menuitem" autoFocus onClick={layer.removeHighlight} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover focus-visible:bg-hover"><Trash2 size={14} className="shrink-0 text-ink-2" />Remove highlight</button>
    </div>
  );
}

export const wrapField =(layer, field, source, node) => (layer ? createElement(InteractiveField, { layer, field, source, key: `${field}:${source}` }, node) : node);
