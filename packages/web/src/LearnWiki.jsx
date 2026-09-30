import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Highlighter, Lock, LockOpen, X } from 'lucide-react';
import { wsHeaders } from './api.js';
import { sanitizeArticle, sectionInView } from './learn-wiki-html.js';
import { quoteFromRange, locateQuote, rangeFromOffsets, containsOffset, paintHighlights } from './learn-wiki-highlights.js';

// One article, scrolled. Used twice: as the right-hand reader and as a canvas
// card, the way LearnPaper is.
//
// Not an iframe, unlike the PDF card. Rendering in our own document is what
// keeps copy, paste, undo and delete alive on the canvas while this has focus,
// and it is the only way to know which section the learner is reading - an
// iframe never says.

// Card-only extras, all optional: `locked` stops the article scrolling (the
// wheel pans the canvas instead); `highlights` + `onHighlights` are the
// learner's yellow marks, and `highlighting` is highlighter mode.
export default function LearnWiki({ app, article, openAt = 0, onNavigate, onSection, onSelect, onClose = null, compact = false,
  locked = null, onLock = null, highlights = null, onHighlights = null, highlighting = false, onHighlighting = null, paintKey = null }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(article);
  const [back, setBack] = useState([]);
  const body = useRef(null);
  // Where to land once the article is on screen: an anchor, a section, or the
  // scroll position a back step is returning to.
  const landing = useRef({ section: article.section || 0 });
  const reported = useRef(null);

  // Only an explicit open retargets this - the picker, the tutor, a reload.
  // `article.section` also changes every time scrolling reports a new section,
  // and treating that as an instruction meant scrolling up jumped the reader
  // back to the section it had just left.
  useEffect(() => {
    setCurrent(article);
    landing.current = { section: article.section || 0 };
  }, [openAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const controller = new AbortController();
    setPage(null); setError(''); setMark(null);
    (async () => {
      const response = await fetch(`/api/learn/wiki?app=${encodeURIComponent(app)}&title=${encodeURIComponent(current.title)}`, { headers: wsHeaders(), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Could not open that article.');
      if (!controller.signal.aborted) setPage({ ...data, html: sanitizeArticle(data.html, data.title) });
    })().catch(problem => { if (!controller.signal.aborted) setError(problem.message); });
    return () => controller.abort();
  }, [app, current.title]);

  // Land once the article is on screen. Runs on each loaded article and on each
  // explicit open, which is what makes "open this one, at this section" work
  // even when the article is already the one being read.
  // Landing somewhere specific also marks it: a scroll alone says "you are
  // near it", the tint says "this one". Re-adding the class restarts the
  // animation, so a second jump to the same place still flashes.
  // The tint is an overlay in our own tree, never a mark written into the
  // article's nodes: React re-creates dangerouslySetInnerHTML children whenever
  // it likes, and an attribute set on one of them was gone within a frame. An
  // element React owns survives; it also cannot be forged, because nothing an
  // editor writes can put a node outside the sanitized subtree. Keyed so a
  // second jump to the same place restarts the animation.
  const [mark, setMark] = useState(null);
  const arrive = target => {
    target.scrollIntoView({ block: 'start' });
    // Hold the target's identity, never the node: React re-creates the
    // innerHTML children whenever it likes, and the article reflows for as
    // long as its images take to load or fail. The overlay follows the
    // element for exactly as long as the tint animates - the follow loop
    // below runs while mark exists, and the animation's own end clears it.
    const selector = target.id
      ? `[id="${CSS.escape(target.id)}"]`
      : `[data-mw-section-id="${target.getAttribute('data-mw-section-id')}"]`;
    setMark(previous => ({ key: (previous?.key || 0) + 1, selector, top: 0, height: 0 }));
  };

  useEffect(() => {
    if (!mark) return;
    let live = true;
    const follow = () => {
      if (!live) return;
      const container = body.current;
      const found = container?.querySelector(mark.selector);
      if (found) {
        const box = container.getBoundingClientRect();
        const at = found.getBoundingClientRect();
        const top = at.top - box.top + container.scrollTop;
        setMark(previous => (previous && (previous.top !== top || previous.height !== at.height) ? { ...previous, top, height: at.height } : previous));
      }
      requestAnimationFrame(follow);
    };
    follow();
    return () => { live = false; };
  }, [mark?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!page || !body.current) return;
    const land = landing.current;
    landing.current = null;
    if (!land) return;
    const anchor = land.anchor && body.current.querySelector(`[id="${CSS.escape(land.anchor)}"]`);
    if (anchor) return arrive(anchor);
    // A back step restores the exact offset, which is what makes this read as a
    // browser rather than as a reset. It has to happen here: the article is
    // refetched, so at the moment Back is pressed this element does not exist.
    if (land.scrollTop) { body.current.scrollTop = land.scrollTop; return; }
    const section = land.section && body.current.querySelector(`[data-mw-section-id="${land.section}"]`);
    if (section) return arrive(section);
    body.current.scrollTop = 0;
  }, [page, openAt]);

  const articleRoot = () => body.current?.firstElementChild || null;
  const mine = (highlights || []).filter(entry => entry.title === current.title);
  const minesKey = JSON.stringify(mine);
  useEffect(() => {
    if (!paintKey) return;
    const root = articleRoot();
    const paint = () => {
      const text = root?.textContent || '';
      paintHighlights(paintKey, mine.map(quote => { const span = locateQuote(text, quote); return span && rangeFromOffsets(root, span.start, span.end); }).filter(Boolean));
    };
    paint();
    // React may replace the article's nodes; the ranges would then point at
    // nothing, so repaint from the quotes when the subtree changes.
    const observer = root ? new MutationObserver(paint) : null;
    observer?.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { observer?.disconnect(); paintHighlights(paintKey, []); };
  }, [page, minesKey, paintKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Highlighter mode: a selection becomes a highlight; a click on one removes it.
  const highlightSelection = () => {
    const root = articleRoot();
    const selection = window.getSelection?.();
    if (!root || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      if (!root.contains(range.startContainer)) return;
      const before = document.createRange();
      before.setStart(root, 0); before.setEnd(range.startContainer, range.startOffset);
      const offset = before.toString().length, text = root.textContent;
      const hit = mine.find(quote => containsOffset(locateQuote(text, quote), offset));
      if (hit) onHighlights?.((highlights || []).filter(entry => entry !== hit));
      return;
    }
    const quote = quoteFromRange(root, range);
    if (!quote) return;
    selection.removeAllRanges();
    onHighlights?.([...(highlights || []), { title: current.title, ...quote }]);
  };

  const go = useCallback((next, anchor = null) => {
    // Read the offset now, not inside the updater: by the time React runs that,
    // the article has been replaced and this element is gone, so every back
    // step recorded 0 and returned to the top.
    const from = { title: current.title, scrollTop: body.current?.scrollTop || 0 };
    setBack(previous => [...previous, from].slice(-25));
    landing.current = { anchor };
    const target = { title: next, section: 0 };
    setCurrent(target); onNavigate?.(target);
  }, [current.title, onNavigate]);

  const goBack = () => {
    const previous = back[back.length - 1];
    if (!previous) return;
    setBack(rest => rest.slice(0, -1));
    landing.current = { scrollTop: previous.scrollTop };
    setCurrent({ title: previous.title, section: 0 });
    onNavigate?.({ title: previous.title, section: 0 });
  };

  // One delegated handler. The sanitizer already decided what each link is, so
  // nothing here parses an href - there is none left to parse.
  const click = event => {
    const link = event.target.closest?.('a[data-wiki]');
    if (!link) return;
    const kind = link.getAttribute('data-wiki');
    if (kind === 'external') return; // a real href, opening in its own tab
    event.preventDefault(); event.stopPropagation();
    if (kind === 'dead') return;
    if (kind === 'article') return go(link.getAttribute('data-wiki-title'), link.getAttribute('data-wiki-anchor'));
    if (kind === 'file') return window.open(`https://en.wikipedia.org/wiki/${encodeURIComponent(link.getAttribute('data-wiki-title'))}`, '_blank', 'noreferrer');
    const anchor = link.getAttribute('data-wiki-anchor');
    const target = anchor && body.current?.querySelector(`[id="${CSS.escape(anchor)}"]`);
    if (target) arrive(target);
  };

  const scrolled = () => onSection?.(sectionInView(body.current));
  // Only when it actually changed. Reporting on every mouseup re-rendered the
  // host, which replaced this subtree between mouseup and click - so the click
  // event never fired and no link was followable.
  const selected = () => {
    if (highlighting) { highlightSelection(); return; }
    const text = window.getSelection?.().toString().trim().slice(0, 2000) || null;
    if (text === reported.current) return;
    reported.current = text;
    onSelect?.(text);
  };

  return <section aria-label="Wikipedia reader" className="flex min-h-0 flex-1 flex-col">
    <header className="flex shrink-0 items-center gap-2 border-b border-line pb-2 text-xs text-ink">
      <button type="button" aria-label="Back" title="Back to the previous article" disabled={!back.length} onClick={goBack}
        className="rounded border border-line p-1 hover:bg-hover disabled:opacity-40"><ArrowLeft size={14} /></button>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium">{page?.displayTitle || current.title.replace(/_/g, ' ')}</h3>
        <p className="truncate text-xs text-ink-2">Wikipedia{back.length ? ` · ${back.length} back` : ''}</p>
      </div>
      {onHighlighting && <button type="button" aria-label="Highlighter" aria-pressed={highlighting}
        title={highlighting ? 'Highlighter on - select text to highlight it, click a highlight to remove it' : 'Highlight text'}
        onClick={() => onHighlighting(!highlighting)}
        className={`relative rounded border p-1 ${highlighting ? 'border-yellow-400 bg-yellow-200 text-ink' : 'border-line hover:bg-hover'}`}>
        <Highlighter size={14} />
        {mine.length > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-3.5 rounded-full bg-yellow-400 px-1 text-[9px] leading-3.5 font-semibold text-ink">{mine.length}</span>}
      </button>}
      {onLock && <button type="button" aria-label={locked ? 'Unlock scrolling' : 'Lock scrolling'} aria-pressed={!!locked}
        title={locked ? 'Scrolling locked - the wheel moves the canvas. Click to unlock.' : 'Lock scrolling so the wheel moves the canvas'}
        onClick={() => onLock(!locked)}
        className={`rounded border p-1 ${locked ? 'border-ink bg-ink text-white' : 'border-line hover:bg-hover'}`}>
        {locked ? <Lock size={14} /> : <LockOpen size={14} />}
      </button>}
      <a href={page?.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(current.title)}`} target="_blank" rel="noreferrer"
        title="Open on Wikipedia" aria-label="Open on Wikipedia" className="rounded border border-line p-1 hover:bg-hover"><ExternalLink size={14} /></a>
      {onClose && <button type="button" onClick={onClose} title="Close article" aria-label="Close article" className="rounded border border-line p-1 hover:bg-hover"><X size={14} /></button>}
    </header>
    {error && <p role="alert" className="p-3 text-sm">{error}</p>}
    {!page && !error && <p role="status" className="p-3 text-sm">Opening article</p>}
    {/* data-scroll: without it the canvas wheel handler pans the board instead
        of scrolling the article inside a card. */}
    {/* Locked: no data-scroll and no overflow scroll, so the wheel pans the
        canvas and the article holds still where the learner left it. */}
    {page && <div ref={body} data-scroll={locked ? undefined : ''} onScroll={scrolled} onClick={click} onMouseUp={selected} onKeyUp={selected}
      onKeyDown={event => { if (event.key === 'Enter') click(event); }}
      className={`wiki-article relative min-h-0 flex-1 overflow-x-hidden bg-white px-4 py-3 ${locked ? 'overflow-y-hidden' : 'overflow-y-auto'} ${highlighting ? 'cursor-text' : ''} ${compact ? 'text-[13px]' : 'text-sm'}`}>
      {/* The sanitizer is the boundary: an allowlist over tags, attributes and
          href schemes, so no style attribute, no handler and no scheme but
          https reaches this. See learn-wiki-html.js. */}
      <div dangerouslySetInnerHTML={{ __html: page.html }} />
      {mark && <div key={mark.key} aria-hidden data-arrived onAnimationEnd={() => setMark(null)}
        className="pointer-events-none absolute right-1 left-1" style={{ top: mark.top, height: mark.height }} />}
    </div>}
    {page && <footer className="shrink-0 border-t border-line px-4 py-1.5 text-[11px] text-ink-3">
      From <a href={page.url} target="_blank" rel="noreferrer" className="underline">Wikipedia</a>, licensed <a href={page.licence.url} target="_blank" rel="noreferrer" className="underline">{page.licence.title}</a>
    </footer>}
  </section>;
}
