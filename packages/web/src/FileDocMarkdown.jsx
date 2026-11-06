import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, Highlighter, Lightbulb, Trash2, X } from 'lucide-react';
import { Button } from './ui.jsx';
import { Md } from './Md.jsx';
import { ToolButton, placeNear } from './selection-toolbar.jsx';
import { EXCERPT_LIMIT } from './pdf-anchor.js';
import { deleteHighlight, listHighlights, newId, putHighlight } from './pdf-highlights.js';
import { canWrite, fileScope } from './file-source-client.js';
import { containsOffset, paintHighlights, quoteFromRange, rangeFromOffsets } from './learn-wiki-highlights.js';
import { currentHighlights, highlightAt, markdownHighlightBody, markdownHighlightSource, placeHighlights } from './file-doc-highlights.js';
import { EXPLAIN_PASSAGE_EVENT, PASSAGE_TEXT, SOURCE_REF_EVENT, explanationsFor, markdownDraft, passageTarget, resolvePassage } from './source-ref.js';
import { focusExplanation, mintSourceRef } from './source-refs.js';
import { api } from './api.js';
import { useSourceRefBlocks } from './SourceRefChip.jsx';

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

  // Card to passage (SourceRefChip View passage): the quote is emphasized for a moment, only on the revision the card was made from.
  // A changed file shows that instead; the passage is never searched for in other text.
  // A passage past the part of the file drawn so far (Show more) is reached by pressing the card's own Show more for the learner, only on this explicit request and only as
  // far as needed; a passage not in the whole drawn text is then reported missing.
  const pendingPassage = useRef(null), passageView = useRef(null);
  passageView.current = detail => {
    const node = root.current;
    if (!node) return;
    const found = passageTarget({ text: node.textContent, rev, detail }), range = found.status === 'resolved' && rangeFromOffsets(node, found.start, found.end);
    const more = found.status === 'missing' && scroller.current?.querySelector('[data-file-doc-more]');
    if (more) { pendingPassage.current = detail; more.click(); return; }
    pendingPassage.current = null;
    if (!range) { setMessage({ text: PASSAGE_TEXT[found.status] || PASSAGE_TEXT.missing }); return; }
    const paintKey = `srcref:${block.id}`;
    paintHighlights(paintKey, [range]);
    (range.startContainer.parentElement || node).scrollIntoView?.({ block: 'center' });
    setTimeout(() => paintHighlights(paintKey, []), 2500);
  };
  useEffect(() => {
    const onPassage = event => { if (event.detail?.cardId === block.id) passageView.current(event.detail); };
    window.addEventListener(SOURCE_REF_EVENT, onPassage);
    return () => window.removeEventListener(SOURCE_REF_EVENT, onPassage);
  }, [block.id]);
  useEffect(() => { const detail = pendingPassage.current; if (detail) requestAnimationFrame(() => passageView.current(detail)); }, [text]);
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
    const passage = explanationsFor(refBlocks, { key: `file:${block.fileRef?.source?.id}`, rev }).current
      .flatMap(({ cardId, ref }) => { const span = resolvePassage(node.textContent, ref.anchor.quote); return span.status === 'resolved' && containsOffset(span, offset) ? [{ cardId, span }] : []; })[0];
    if (!h && !passage) { setMenu(null); return; }
    const { span } = h ? placed.find(entry => entry.h === h) : passage;
    setMenu({ h: h || null, cardId: passage?.cardId ?? null, range: rangeFromOffsets(node, span.start, span.end) });
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
    window.getSelection?.()?.removeAllRanges(); setBar(null);
    if (!draft) return;
    try {
      const ref = await mintSourceRef((path, body) => api(path, { method: 'POST', body: JSON.stringify(body) }), draft);
      window.dispatchEvent(new CustomEvent(EXPLAIN_PASSAGE_EVENT, { detail: { sourceRef: ref.id, text: quote.exact } }));
    } catch (problem) { setMessage({ text: problem.message }); }
  };
  const remove = async h => {
    setMenu(null);
    try { await deleteHighlight(h.id, source); setAnswer(previous => previous && { ...previous, highlights: previous.highlights.filter(entry => entry.id !== h.id) }); setMessage(null); }
    catch (problem) { setMessage({ text: `Couldn’t remove the highlight. ${problem.message}`, retry: () => remove(h) }); }
  };

  return <div ref={wrap} className="relative flex min-h-0 flex-1 flex-col">
    {message && <div data-file-doc-highlight-notice role={message.retry ? 'alert' : 'status'} className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5 text-xs text-ink-2" onPointerDown={event => event.stopPropagation()}>
      <span className="min-w-0 flex-1">{message.text}</span>
      {message.retry && <Button size="sm" variant="secondary" onClick={message.retry}>Retry</Button>}
      <button type="button" aria-label="Dismiss" onClick={() => setMessage(null)} className="rounded p-1 hover:bg-hover"><X size={13} /></button>
    </div>}
    <div ref={scroller} data-scroll data-file-doc-text className="pointer-events-auto min-h-0 flex-1 overflow-auto px-3 py-2" onPointerDown={event => event.stopPropagation()} onScroll={reposition} onClick={click}>
      <div ref={root} data-file-doc-md className="text-sm text-ink"><Md text={text} doc fences /></div>
      {children}
    </div>
    {bar && <div ref={barEl} data-file-doc-selection-toolbar role="toolbar" aria-label="Selected text" className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-line bg-white p-1 shadow-pop" style={{ left: 0, top: 0 }}>
      <ToolButton label="Highlight" icon={Highlighter} onClick={() => highlight(bar.quote)} />
      <ToolButton label="Explain" icon={Lightbulb} onClick={() => explain(bar.quote)} />
    </div>}
    {menu && <div ref={menuEl} data-file-doc-highlight-menu role="menu" aria-label="Highlight" className="absolute z-30 flex w-44 flex-col rounded-lg border border-line bg-white p-1 shadow-pop" style={{ left: 0, top: 0 }}>
      {menu.cardId && <button type="button" role="menuitem" data-file-doc-view-explanation autoFocus onClick={() => { const id = menu.cardId; setMenu(null); focusExplanation(id); }} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover focus-visible:bg-hover"><BookOpen size={14} className="shrink-0 text-ink-2" />View explanation</button>}
      {menu.h && <button type="button" role="menuitem" autoFocus={!menu.cardId} onClick={() => remove(menu.h)} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover focus-visible:bg-hover"><Trash2 size={14} className="shrink-0 text-ink-2" />Remove highlight</button>}
    </div>}
  </div>;
}
