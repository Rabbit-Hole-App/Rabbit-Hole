import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, Highlighter, MessageSquarePlus, ScanText, Trash2, X } from 'lucide-react';
import { Button } from './ui.jsx';
import { chordBinding, chordLabel, isMac } from './shortcut-owner.js';
import { ariaKey } from './shortcuts.js';
import { Md } from './Md.jsx';
import { ToolButton, placeNear } from './selection-toolbar.jsx';
import { EXCERPT_LIMIT } from './pdf-anchor.js';
import { deleteHighlight, listHighlights, newId, putHighlight } from './pdf-highlights.js';
import { canWrite, fileScope } from './file-source-client.js';
import { containsOffset, paintHighlights, quoteFromRange, rangeFromOffsets } from './learn-wiki-highlights.js';
import { anchorShape, currentHighlights, highlightAt, markdownHighlightBody, markdownHighlightSource, placeHighlights, tutorAnchors, viewCardLabel } from './file-doc-highlights.js';
import { EXPLAIN_PASSAGE_EVENT, PASSAGE_TEXT, SOURCE_REF_EVENT, explanationsFor, markdownDraft, passageTarget, resolveQuote, resolveRawPassage } from './source-ref.js';
import { textSegments } from './markdown-anchor.js';
import { focusExplanation, mintSourceRef, registerPassageMeasure } from './source-refs.js';
import { api } from './api.js';
import { useChatWorkspace } from './chat-workspace.jsx';
import { selectionRef } from './selection-ref.js';
import { useSourcePending, useSourceRefBlocks } from './SourceRefChip.jsx';

// UI.07: the Tutor's persistent source tint, its own Highlight registry (never the learner's wiki-highlight, never the transient emphasis), one entry per card.
const tutorPainted = new Map();
function paintTutor(key, ranges) {
  if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') return; // ponytail: no prose tint without the Highlight API (pre-2023); block shapes still show
  if (ranges.length) tutorPainted.set(key, ranges); else tutorPainted.delete(key);
  CSS.highlights.set('tutor-source', new Highlight(...[...tutorPainted.values()].flat()));
}
// Brief emphasis on the destination card (file 05): the shared selection blue as a passing outline, without touching the card's own classes or styles.
const emphasizeCard = id => setTimeout(() => document.querySelector(`[data-block-id="${CSS.escape(id)}"]`)?.animate?.([{ outline: '2px solid var(--color-select)', outlineOffset: '4px' }, { outline: '2px solid var(--color-select)', outlineOffset: '4px', offset: 0.8 }, { outline: '2px solid transparent', outlineOffset: '4px' }], { duration: 1800 }), 300);

// A Markdown file card's rendered text with the PDF reader's selection popover (Highlight) and the webpage card's highlight menu
// (Remove highlight), docs/features/pdf-excerpts.md "Markdown cards". Highlights are text quotes painted over the rendered text
// (learn-wiki-highlights.js), saved apart from the file; `children` is the card's Show more button, inside the scroller.
export function MarkdownText({ block, text, children }) {
  const rev = block.fileRef?.source?.rev;
  const app = canWrite() ? fileScope()?.app : null;
  const source = markdownHighlightSource(block, app);
  const [answer, setAnswer] = useState(null);
  const [message, setMessage] = useState(null);
  const [bar, setBar] = useState(null); // { range, quote }: the selection offered Highlight
  const [menu, setMenu] = useState(null); // { h, range }: the highlight offered Remove
  const wrap = useRef(null), scroller = useRef(null), root = useRef(null), barEl = useRef(null), menuEl = useRef(null);
  const key = source?.key;
  const refBlocks = useSourceRefBlocks(); // cards made from a passage of this file (source-ref.js): the passage opens its explanation
  const pendingSlots = useSourcePending(); // the Tutor's slots for a passage of this file: the passage opens the slot that becomes the explanation
  // UI.07: saved Tutor cards with a verified ref to THIS revision of this file (changed revisions, other files, pending or failed work: none), with their titles.
  const tutorCards = explanationsFor(refBlocks, { key: `file:${block.fileRef?.source?.id}`, rev }).current.map(card => ({ ...card, title: refBlocks.find(entry => entry.id === card.cardId)?.title || '' }));
  const tutorMarks = JSON.stringify(tutorCards.map(card => [card.cardId, card.title, card.raw, card.ref.anchor?.quote]));
  const [anchors, setAnchors] = useState([]), [hovered, setHovered] = useState(null), [chooser, setChooser] = useState(null);

  useEffect(() => {
    if (!source) { setAnswer(null); return undefined; }
    const controller = new AbortController();
    listHighlights(source, controller.signal).then(setAnswer, () => setAnswer(null)); // refused (a viewer's page, a changed file): no Highlight
    return () => controller.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const highlights = currentHighlights(answer, rev);
  const saveable = !!answer && answer.sha256 === rev;

  // Paint from the quotes now and whenever the rendered subtree changes (Show more, a re-render replaces the nodes).
  const marks = JSON.stringify(highlights.map(h => [h.id, h.quote]));
  useEffect(() => {
    const node = root.current, paintKey = `md:${block.id}`;
    if (!node) return undefined;
    const paint = () => {
      const placed = placeHighlights(node.textContent, highlights);
      paintHighlights(paintKey, placed.map(({ span }) => rangeFromOffsets(node, span.start, span.end)).filter(Boolean));
    };
    paint();
    const observer = new MutationObserver(paint);
    observer.observe(node, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); paintHighlights(paintKey, []); };
  }, [marks, block.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // UI.07 (file 05): each resolved relationship drawn in its shape (prose tint, code lines, diagram outline, whole-section rail), drawn again when the rendered
  // text changes, cleared on unmount, a revision change or a card going away; the View card buttons follow the anchors' rendered tops.
  useEffect(() => {
    const node = root.current;
    if (!node) return undefined;
    let marked = [];
    const options = { childList: true, subtree: true, characterData: true };
    const clear = () => { for (const element of marked) element.removeAttribute('data-tutor-anchor'); marked = []; paintTutor(block.id, []); };
    const elementOf = at => (at.nodeType === 1 ? at : at.parentElement);
    const blockOf = element => { const doc = node.firstElementChild; let at = element; while (at && at.parentElement && at.parentElement !== doc) at = at.parentElement; return at; };
    const mark = (element, shape) => { element.setAttribute('data-tutor-anchor', shape); marked.push(element); };
    const paint = () => {
      observer.disconnect();
      clear();
      const whole = !scroller.current?.querySelector('[data-file-doc-more]'), drawn = node.textContent, base = node.getBoundingClientRect(), ranges = [], out = [];
      tutorAnchors(tutorCards, card => { const exact = resolveQuote(drawn, card.ref.anchor?.quote); return exact.status === 'missing' && card.raw && whole ? resolveRawPassage(textSegments(node), card.ref.anchor.quote) : exact; }).forEach(anchor => {
        const range = rangeFromOffsets(node, anchor.start, anchor.end);
        if (!range) return;
        const start = elementOf(range.startContainer), first = blockOf(start), last = blockOf(elementOf(range.endContainer));
        const diagram = start.closest('[data-md-diagram]'), code = start.closest('[data-code-block] pre');
        const shape = anchorShape({ inDiagram: !!diagram, inCode: !!code, startsAtHeading: /^H[1-6]$/.test(first?.tagName || ''), spansBlocks: first !== last });
        if (shape === 'diagram') mark(diagram, 'diagram');
        else if (shape === 'code') { for (const line of code.children) if (range.intersectsNode(line)) mark(line, 'code'); }
        else if (shape === 'section') { for (let at = first; at; at = at.nextElementSibling) { mark(at, 'section'); if (at === last) break; } }
        else ranges.push(range);
        const box = range.getBoundingClientRect();
        out.push({ id: `${anchor.start}-${anchor.end}`, shape, top: box.top - base.top, height: box.height, cards: anchor.cards.map(card => ({ cardId: card.cardId, title: card.title })) });
      });
      paintTutor(block.id, ranges);
      setAnchors(previous => (JSON.stringify(previous) === JSON.stringify(out) ? previous : out));
      observer.observe(node, options);
    };
    const observer = new MutationObserver(paint);
    paint();
    return () => { observer.disconnect(); clear(); setAnchors([]); };
  }, [tutorMarks, rev, block.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const viewCard = cardId => { setChooser(null); focusExplanation(cardId); emphasizeCard(cardId); };
  const hover = event => { const y = event.clientY - (root.current?.getBoundingClientRect().top ?? 0); setHovered(anchors.find(a => y >= a.top - 4 && y <= a.top + Math.max(a.height, 20) + 4)?.id ?? null); };

  // Card to passage (SourceRefChip View passage): the quote is emphasized for a moment, only on the revision the card was made from.
  // A changed file shows that instead; the passage is never searched for in other text.
  // A passage past the part of the file drawn so far (Show more) is reached by pressing the card's own Show more for the learner, only on this explicit request and only as
  // far as needed; a passage not in the whole drawn text is then reported missing.
  const pendingPassage = useRef(null), passageView = useRef(null);
  // A Tutor slot's step has no quote yet: detail.range (the plan's raw offsets) is read from this card's own text, with the server's context width either side.
  // detail.quiet (the slot just appeared): paint only if the passage is already in view; never Show more, never scroll, never a notice.
  const more = () => scroller.current?.querySelector('[data-file-doc-more]');
  passageView.current = detail => {
    const node = root.current;
    if (!node) return;
    const say = text => { if (!detail.quiet) setMessage({ text }); };
    if (detail.range && detail.rev !== rev) { say(PASSAGE_TEXT.changed); return; }
    if (detail.range && detail.range.end > text.length) {
      if (more() && !detail.quiet) { pendingPassage.current = detail; more().click(); } else say(PASSAGE_TEXT.missing);
      return;
    }
    const quote = detail.range ? rawQuote(detail.range) : detail.quote;
    let found = passageTarget({ text: node.textContent, rev, detail: { ...detail, quote } });
    if (found.status === 'missing' && more()) {
      if (!detail.quiet) { pendingPassage.current = detail; more().click(); }
      return;
    }
    pendingPassage.current = null;
    // Only a roadmap card's raw quote, and only now that the whole file is drawn, is matched folded; a learner's own passage stays exact or missing.
    if (found.status === 'missing' && detail.raw) found = resolveRawPassage(textSegments(node), quote);
    const range = found.status === 'resolved' && rangeFromOffsets(node, found.start, found.end);
    if (!range) { say(PASSAGE_TEXT[found.status] || PASSAGE_TEXT.missing); return; }
    if (detail.quiet && !inView(range)) return;
    const paintKey = `srcref:${block.id}`;
    paintHighlights(paintKey, [range]);
    if (!detail.quiet) (range.startContainer.parentElement || node).scrollIntoView?.({ block: 'center' });
    setTimeout(() => paintHighlights(paintKey, []), 2500);
  };
  const CONTEXT = 100; // the context roadmap-source-refs.js mints a step's quote with
  const rawQuote = ({ start, end }) => ({ exact: text.slice(start, end), prefix: text.slice(Math.max(0, start - CONTEXT), start), suffix: text.slice(end, end + CONTEXT) });
  // Already on screen: inside this card's scroller and inside the window.
  const inView = range => {
    const box = range.getBoundingClientRect(), view = scroller.current?.getBoundingClientRect();
    return !!view && box.bottom > view.top && box.top < view.bottom && box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
  };
  useEffect(() => {
    const onPassage = event => { if (event.detail?.cardId === block.id) passageView.current(event.detail); };
    window.addEventListener(SOURCE_REF_EVENT, onPassage);
    return () => window.removeEventListener(SOURCE_REF_EVENT, onPassage);
  }, [block.id]);
  useEffect(() => { const detail = pendingPassage.current; if (detail) requestAnimationFrame(() => passageView.current(detail)); }, [text]);
  // UI.06: the canvas asks where a step's raw range is drawn, to place its slot beside it. Only a resolved range on this revision that is inside the visible
  // scroller answers; anything else is null (the canvas then uses this card's box). Never scrolls, expands or paints.
  const measureRef = useRef(null);
  measureRef.current = ({ range: raw, rev: wanted }) => {
    const node = root.current;
    if (!node || wanted !== rev || !raw || raw.end > text.length) return null;
    const quote = rawQuote(raw);
    let found = resolveQuote(node.textContent, quote);
    if (found.status === 'missing' && !more()) found = resolveRawPassage(textSegments(node), quote);
    const range = found.status === 'resolved' && rangeFromOffsets(node, found.start, found.end);
    return range && inView(range) ? range.getBoundingClientRect() : null;
  };
  useEffect(() => registerPassageMeasure(block.id, detail => measureRef.current(detail)), [block.id]);
  useEffect(() => {
    if (!menu?.cardId) return undefined;
    const paintKey = `srcref-open:${block.id}`;
    paintHighlights(paintKey, [menu.range]);
    return () => paintHighlights(paintKey, []);
  }, [menu, block.id]);

  const evaluate = () => {
    const node = root.current, selection = window.getSelection?.();
    const range = node && selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
    // A selection that starts or ends inside typeset math or a diagram is refused (no Highlight offered): its text is the formula's
    // markup, not words. One that only spans past them is fine; its quote still resolves in the same text.
    const rich = at => (at.nodeType === 1 ? at : at.parentElement)?.closest('.katex, [data-chat-math], [data-md-diagram]');
    const quote = range && !rich(range.startContainer) && !rich(range.endContainer) && quoteFromRange(node, range);
    setBar(quote && saveable ? { range: range.cloneRange(), quote } : null);
  };
  const reposition = () => {
    if (bar) placeNear(barEl.current, bar.range.getBoundingClientRect(), scroller.current, wrap.current);
    if (menu) placeNear(menuEl.current, menu.range.getBoundingClientRect(), scroller.current, wrap.current);
  };
  const live = useRef(null);
  live.current = { evaluate };
  useLayoutEffect(() => { reposition(); });
  useEffect(() => {
    let raf = 0;
    const change = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => live.current.evaluate()); };
    document.addEventListener('selectionchange', change);
    return () => { document.removeEventListener('selectionchange', change); cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => { setBar(null); setMenu(null); }, [rev]);
  useEffect(() => {
    if (!(bar || menu)) return undefined;
    const escape = event => { if (event.key !== 'Escape') return; event.stopPropagation(); if (menu) setMenu(null); else { window.getSelection?.()?.removeAllRanges(); setBar(null); } };
    const away = event => {
      if (bar && !barEl.current?.contains(event.target) && !root.current?.contains(event.target)) setBar(null);
      if (menu && !menuEl.current?.contains(event.target)) setMenu(null);
    };
    window.addEventListener('keydown', escape, true); window.addEventListener('pointerdown', away, true);
    return () => { window.removeEventListener('keydown', escape, true); window.removeEventListener('pointerdown', away, true); };
  }, [bar, menu]);

  // A click on a highlight (a collapsed caret inside one) offers Remove, as the webpage card's highlight does. A click on a passage an
  // explanation was made from offers View explanation, with the passage shown while the menu is open (source-ref.js explanationsFor).
  const click = () => {
    const selection = window.getSelection?.(), node = root.current;
    if (!selection?.rangeCount || !selection.isCollapsed || !node?.contains(selection.anchorNode)) return;
    const caret = selection.getRangeAt(0), before = document.createRange();
    before.setStart(node, 0); before.setEnd(caret.startContainer, caret.startOffset);
    const offset = before.toString().length, placed = saveable ? placeHighlights(node.textContent, highlights) : [], h = highlightAt(placed, offset);
    const fileKey = `file:${block.fileRef?.source?.id}`, whole = !scroller.current?.querySelector('[data-file-doc-more]');
    // A Tutor slot for a passage of this file (its step's raw offsets, read from this card's text; folded only once the whole file is drawn) opens the slot.
    const slot = pendingSlots.filter(entry => entry.ref?.source?.key === fileKey && entry.ref.source.rev === rev && entry.end <= text.length)
      .flatMap(entry => { const quote = rawQuote(entry), exact = resolveQuote(node.textContent, quote), span = exact.status === 'missing' && whole ? resolveRawPassage(textSegments(node), quote) : exact; return span.status === 'resolved' && containsOffset(span, offset) ? [{ cardId: entry.slotId, span }] : []; })[0];
    const passage = explanationsFor(refBlocks, { key: fileKey, rev }).current
      .flatMap(({ cardId, ref, raw }) => { const exact = resolveQuote(node.textContent, ref.anchor.quote), span = exact.status === 'missing' && raw && !scroller.current?.querySelector('[data-file-doc-more]') ? resolveRawPassage(textSegments(node), ref.anchor.quote) : exact; return span.status === 'resolved' && containsOffset(span, offset) ? [{ cardId, span }] : []; })[0];
    const target = passage || slot;
    if (!h && !target) { setMenu(null); return; }
    const { span } = h ? placed.find(entry => entry.h === h) : target;
    setMenu({ h: h || null, cardId: target?.cardId ?? null, range: rangeFromOffsets(node, span.start, span.end) });
  };

  const highlight = quote => {
    if (quote.exact.length > EXCERPT_LIMIT) { setMessage({ text: `Select up to ${EXCERPT_LIMIT.toLocaleString('en-US')} characters to highlight.` }); return; }
    const id = newId('pdfh'), sent = markdownHighlightBody(source, block, quote);
    window.getSelection?.()?.removeAllRanges(); setBar(null);
    const put = async () => {
      setMessage({ text: 'Saving highlight' });
      try {
        const saved = await putHighlight(id, sent);
        setAnswer(previous => ({ ...(previous || { sha256: rev, changed: 0 }), highlights: [...(previous?.highlights || []).filter(h => h.id !== id), saved?.highlight || { id, ...sent }] }));
        setMessage(null);
      } catch (problem) {
        setMessage(problem.status === 409 ? { text: 'This file changed since you selected this.' } : { text: `Couldn’t save the highlight. ${problem.message}`, retry: put });
      }
    };
    put();
  };
  // Explain this passage (source-ref.js): the server mints the reference to this revision of the file and this quote, then LearnPage starts the
  // explanation with it, so the card that comes back can open the passage again. A file that changed since it was shown stops here.
  const explain = async quote => {
    const draft = markdownDraft({ block, quote, app: source.app });
    // Where the passage is on screen now: the Explain skeleton is placed beside it (LearnPage passageSites, AdaptiveCanvas placeExplain).
    const picked = window.getSelection?.(), box = picked?.rangeCount ? picked.getRangeAt(0).getBoundingClientRect() : null;
    const rect = box && box.width > 0 ? { left: box.left, top: box.top, width: box.width, height: box.height } : null;
    window.getSelection?.()?.removeAllRanges(); setBar(null);
    if (!draft) return;
    try {
      const ref = await mintSourceRef((path, body) => api(path, { method: 'POST', body: JSON.stringify(body) }), draft);
      window.dispatchEvent(new CustomEvent(EXPLAIN_PASSAGE_EVENT, { detail: { sourceRef: ref.id, text: quote.exact, cardId: block.id, rect } }));
    } catch (problem) { setMessage({ text: problem.message }); }
  };
  // Add to chat: the highlighted passage joins the right-hand Chat composer as a context pill (the webpage card's Ask about selection, the canvas bar's
  // Add to chat): nothing is sent, no highlight or proposal is made, the draft is untouched, and the same passage is not added twice (chat context).
  const chat = useChatWorkspace();
  const addToChat = quote => {
    if (quote.exact.length > EXCERPT_LIMIT) { setMessage({ text: `Select up to ${EXCERPT_LIMIT.toLocaleString('en-US')} characters to add to chat.` }); return; }
    const name = String(block.fileRef?.meta?.name || block.label || block.title || 'Markdown').slice(0, 120);
    chat.addToChat(selectionRef({ ids: [block.id], kind: 'card', name, content: quote.exact, quote: quote.exact, text: () => quote.exact }));
    window.getSelection?.()?.removeAllRanges(); setBar(null);
  };
  const remove = async h => {
    setMenu(null);
    try { await deleteHighlight(h.id, source); setAnswer(previous => previous && { ...previous, highlights: previous.highlights.filter(entry => entry.id !== h.id) }); setMessage(null); }
    catch (problem) { setMessage({ text: `Couldn’t remove the highlight. ${problem.message}`, retry: () => remove(h) }); }
  };

  const mac = isMac(), hint = chordLabel('quick-edit', mac); // the quick-ask chord, as the explanation toolbar shows it

  return <div ref={wrap} className="relative flex min-h-0 flex-1 flex-col">
    {message && <div data-file-doc-highlight-notice role={message.retry ? 'alert' : 'status'} className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5 text-xs text-ink-2" onPointerDown={event => event.stopPropagation()}>
      <span className="min-w-0 flex-1">{message.text}</span>
      {message.retry && <Button size="sm" variant="secondary" onClick={message.retry}>Retry</Button>}
      <button type="button" aria-label="Dismiss" onClick={() => setMessage(null)} className="rounded p-1 hover:bg-hover"><X size={13} /></button>
    </div>}
    <div ref={scroller} data-scroll data-file-doc-text className="pointer-events-auto min-h-0 flex-1 overflow-auto px-3 py-2" onPointerDown={event => event.stopPropagation()} onScroll={reposition} onClick={click}>
      <div ref={root} data-file-doc-md onPointerMove={anchors.length ? hover : undefined} onPointerLeave={() => setHovered(null)} className={`relative text-sm text-ink ${anchors.length ? 'pr-8' : ''}`}><Md text={text} doc fences />
        {/* View card in the gutter beside each anchor (file 05): shown on the anchor's hover or the button's own focus; a hidden one keeps its place and Tab stop. */}
        {anchors.map(anchor => (
          <button key={anchor.id} type="button" data-view-card={anchor.cards.length === 1 ? anchor.cards[0].cardId : ''} title="View card" aria-label={viewCardLabel(anchor.cards)}
            onPointerDown={event => event.stopPropagation()} onClick={() => (anchor.cards.length === 1 ? viewCard(anchor.cards[0].cardId) : setChooser(chooser === anchor.id ? null : anchor.id))}
            style={{ top: anchor.top }} className={`absolute right-0 flex h-7 w-7 items-center justify-center rounded text-ink-2 hover:bg-hover hover:text-ink focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent ${hovered === anchor.id || chooser === anchor.id ? 'opacity-100' : 'pointer-events-none opacity-0'}`}><ScanText size={16} aria-hidden="true" /></button>
        ))}
        {chooser && <div data-file-doc-view-cards role="menu" aria-label="View card" style={{ top: (anchors.find(a => a.id === chooser)?.top ?? 0) + 30 }} className="absolute right-0 z-30 flex w-56 flex-col rounded-lg border border-line bg-white p-1 shadow-pop">
          {anchors.find(a => a.id === chooser)?.cards.map(card => <button key={card.cardId} type="button" role="menuitem" onClick={() => viewCard(card.cardId)} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover focus-visible:bg-hover"><ScanText size={14} className="shrink-0 text-ink-2" aria-hidden="true" /><span className="min-w-0 truncate">{card.title || 'Explanation'}</span></button>)}
        </div>}
      </div>
      {children}
    </div>
    {bar && <div ref={barEl} data-file-doc-selection-toolbar role="toolbar" aria-label="Selected text" className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-line bg-white p-1 shadow-pop" style={{ left: 0, top: 0 }}>
      <Button aria-label={hint} title={hint} aria-keyshortcuts={ariaKey(chordBinding('quick-edit'), mac)} data-quick-ask onMouseDown={event => event.preventDefault()} onClick={() => explain(bar.quote)}
        className="min-w-8 justify-center px-2 text-ink-2 hover:text-ink"><kbd aria-hidden="true" className="rounded border border-line bg-hover px-1 font-sans text-[10px] font-normal text-ink-3">{hint}</kbd></Button>
      <ToolButton label="Highlight" icon={Highlighter} onClick={() => highlight(bar.quote)} />
      {chat && <ToolButton label="Add to chat" icon={MessageSquarePlus} onClick={() => addToChat(bar.quote)} />}
    </div>}
    {menu && <div ref={menuEl} data-file-doc-highlight-menu role="menu" aria-label="Highlight" className="absolute z-30 flex w-44 flex-col rounded-lg border border-line bg-white p-1 shadow-pop" style={{ left: 0, top: 0 }}>
      {menu.cardId && <button type="button" role="menuitem" data-file-doc-view-explanation autoFocus onClick={() => { const id = menu.cardId; setMenu(null); focusExplanation(id); }} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover focus-visible:bg-hover"><BookOpen size={14} className="shrink-0 text-ink-2" />View explanation</button>}
      {menu.h && <button type="button" role="menuitem" autoFocus={!menu.cardId} onClick={() => remove(menu.h)} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover focus-visible:bg-hover"><Trash2 size={14} className="shrink-0 text-ink-2" />Remove highlight</button>}
    </div>}
  </div>;
}
