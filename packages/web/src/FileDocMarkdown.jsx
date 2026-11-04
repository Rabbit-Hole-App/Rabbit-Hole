import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Highlighter, Trash2, X } from 'lucide-react';
import { Button } from './ui.jsx';
import { Md } from './Md.jsx';
import { ToolButton, placeNear } from './selection-toolbar.jsx';
import { EXCERPT_LIMIT } from './pdf-anchor.js';
import { deleteHighlight, listHighlights, newId, putHighlight } from './pdf-highlights.js';
import { canWrite, fileScope } from './file-source-client.js';
import { paintHighlights, quoteFromRange, rangeFromOffsets } from './learn-wiki-highlights.js';
import { currentHighlights, highlightAt, markdownHighlightBody, markdownHighlightSource, placeHighlights } from './file-doc-highlights.js';

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

  // A click on a highlight (a collapsed caret inside one) offers Remove, as the webpage card's highlight does.
  const click = () => {
    const selection = window.getSelection?.(), node = root.current;
    if (!saveable || !selection?.rangeCount || !selection.isCollapsed || !node?.contains(selection.anchorNode)) return;
    const caret = selection.getRangeAt(0), before = document.createRange();
    before.setStart(node, 0); before.setEnd(caret.startContainer, caret.startOffset);
    const placed = placeHighlights(node.textContent, highlights), h = highlightAt(placed, before.toString().length);
    if (!h) { setMenu(null); return; }
    const { span } = placed.find(entry => entry.h === h);
    setMenu({ h, range: rangeFromOffsets(node, span.start, span.end) });
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
    </div>}
    {menu && <div ref={menuEl} data-file-doc-highlight-menu role="menu" aria-label="Highlight" className="absolute z-30 flex w-44 flex-col rounded-lg border border-line bg-white p-1 shadow-pop" style={{ left: 0, top: 0 }}>
      <button type="button" role="menuitem" autoFocus onClick={() => remove(menu.h)} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover focus-visible:bg-hover"><Trash2 size={14} className="shrink-0 text-ink-2" />Remove highlight</button>
    </div>}
  </div>;
}
