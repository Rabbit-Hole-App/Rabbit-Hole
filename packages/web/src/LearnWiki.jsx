import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, X } from 'lucide-react';
import { wsHeaders } from './api.js';
import { sanitizeArticle, sectionInView } from './learn-wiki-html.js';

// One article, scrolled. Used twice: as the right-hand reader and as a canvas
// card, the way LearnPaper is.
//
// Not an iframe, unlike the PDF card. Rendering in our own document is what
// keeps copy, paste, undo and delete alive on the canvas while this has focus,
// and it is the only way to know which section the learner is reading - an
// iframe never says.

export default function LearnWiki({ app, article, openAt = 0, onNavigate, onSection, onSelect, onClose = null, compact = false }) {
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
    setPage(null); setError('');
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
  useEffect(() => {
    if (!page || !body.current) return;
    const land = landing.current;
    landing.current = null;
    if (!land) return;
    const anchor = land.anchor && body.current.querySelector(`[id="${CSS.escape(land.anchor)}"]`);
    if (anchor) return anchor.scrollIntoView({ block: 'start' });
    // A back step restores the exact offset, which is what makes this read as a
    // browser rather than as a reset. It has to happen here: the article is
    // refetched, so at the moment Back is pressed this element does not exist.
    if (land.scrollTop) { body.current.scrollTop = land.scrollTop; return; }
    const section = land.section && body.current.querySelector(`[data-mw-section-id="${land.section}"]`);
    if (section) return section.scrollIntoView({ block: 'start' });
    body.current.scrollTop = 0;
  }, [page, openAt]);

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
    if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const scrolled = () => onSection?.(sectionInView(body.current));
  // Only when it actually changed. Reporting on every mouseup re-rendered the
  // host, which replaced this subtree between mouseup and click - so the click
  // event never fired and no link was followable.
  const selected = () => {
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
      <a href={page?.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(current.title)}`} target="_blank" rel="noreferrer"
        title="Open on Wikipedia" aria-label="Open on Wikipedia" className="rounded border border-line p-1 hover:bg-hover"><ExternalLink size={14} /></a>
      {onClose && <button type="button" onClick={onClose} title="Close article" aria-label="Close article" className="rounded border border-line p-1 hover:bg-hover"><X size={14} /></button>}
    </header>
    {error && <p role="alert" className="p-3 text-sm">{error}</p>}
    {!page && !error && <p role="status" className="p-3 text-sm">Opening article...</p>}
    {/* data-scroll: without it the canvas wheel handler pans the board instead
        of scrolling the article inside a card. */}
    {page && <div ref={body} data-scroll onScroll={scrolled} onClick={click} onMouseUp={selected} onKeyUp={selected}
      onKeyDown={event => { if (event.key === 'Enter') click(event); }}
      className={`wiki-article min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white px-4 py-3 ${compact ? 'text-[13px]' : 'text-sm'}`}
      // The sanitizer is the boundary: an allowlist over tags, attributes and
      // href schemes, so no style attribute, no handler and no scheme but https
      // reaches this. See learn-wiki-html.js.
      dangerouslySetInnerHTML={{ __html: page.html }} />}
    {page && <footer className="shrink-0 border-t border-line px-4 py-1.5 text-[11px] text-ink-3">
      From <a href={page.url} target="_blank" rel="noreferrer" className="underline">Wikipedia</a>, licensed <a href={page.licence.url} target="_blank" rel="noreferrer" className="underline">{page.licence.title}</a>
    </footer>}
  </section>;
}
