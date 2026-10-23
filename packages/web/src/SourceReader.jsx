import { docUrl } from './chat-context.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import LearnPaper from './LearnPaper.jsx';
import LearnWiki from './LearnWiki.jsx';
import RepositorySource, { SourceSelectionContext } from './RepositorySource.jsx';
import { Button } from './ui.jsx';
import { wsHeaders } from './api.js';
import { useChatWorkspace } from './chat-workspace.jsx';
import { codeSource, readerFor } from './chat-sources.js';
import { pdfKeyOfRef } from './pdf-source.js';
import { CiteActions } from './TutorCitations.jsx';

// Sub-lane A4b: one reader for one ContextRef (brief section 6), reusing the existing viewers: LearnPaper (arXiv and uploaded
// papers, and PDF context docs), LearnWiki, RepositorySource (code, read at the cited commit, never run). Props: { sourceRef, position, onPosition }.
// SourcesPane (A4a) mounts it for the expanded source only. Viewing never attaches; "Ask about this" on a selected passage or
// code range touches the conversation through chat.addToChat (contract A5). A PDF has its own selection toolbar and region tool
// in LearnPaper (pdf-excerpts contract): Highlight, Add to canvas, Add to chat.
const QUOTE_MAX = 500; // the server's limit for a quote range (chat-modes.js): a longer passage is refused, never cut

// LearnPage renders the provider, so its own reader openers reach the workspace through this, mounted inside the provider.
export function ChatWorkspaceRef({ into }) {
  const chat = useChatWorkspace();
  useEffect(() => { into.current = chat; return () => { into.current = null; }; }, [into, chat]);
  return null;
}

const AskButton = ({ onClick }) => <Button size="sm" data-source-ask onMouseDown={event => event.preventDefault()} onClick={onClick}><MessageSquarePlus size={13} />Ask about this</Button>;
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

// Nothing here can show this source: say so, with the cited place, and never a promised viewer. `refused`: the bytes route said
// this file is not available to this learner.
function Unavailable({ sourceRef, refused = false }) {
  const range = sourceRef.range || {};
  const where = range.page ? `Page ${range.page}` : range.startSec != null ? `At ${clock(range.startSec)}` : range.cardIds ? `${range.cardIds.length} objects on the canvas` : '';
  return <div data-source-unavailable data-pdf-source-unavailable={refused ? '' : undefined} className="space-y-2 p-3 text-sm">
    <p className="text-ink-2">{refused ? `${sourceRef.name || 'This file'} is not available to you.` : `Can't preview ${sourceRef.name || 'this source'} here.`}</p>
    {where && <p className="text-xs text-ink-3">{where}</p>}
    {range.quote && <blockquote className="border-l-2 border-line pl-3 text-ink-2">{range.quote}</blockquote>}
  </div>;
}

// Plain text with the cited quote marked; lands on the saved scroll, else on the quote.
function TextView({ text, quote, position, save }) {
  const box = useRef(null), mark = useRef(null);
  useEffect(() => {
    if (position?.scrollTop != null) box.current.scrollTop = position.scrollTop;
    else mark.current?.scrollIntoView({ block: 'center' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const at = quote ? text.indexOf(quote) : -1;
  return <div ref={box} data-source-text-view onScroll={event => save({ scrollTop: event.currentTarget.scrollTop })} className="min-h-0 flex-1 overflow-auto p-3">
    <p className="text-sm leading-6 whitespace-pre-wrap">{at < 0 ? text : <>{text.slice(0, at)}<mark ref={mark} className="bg-yellow-200">{quote}</mark>{text.slice(at + quote.length)}</>}</p>
  </div>;
}

// A canvas context document (doc:<id>), read once through GET /api/learn/context/<id> (A4a's route): a PDF opens in the paper
// view at its page from those same bytes, a .txt or .md as text. Anything else, or a failed read, says it can't preview here.
function DocReader({ app, sourceRef, position, save, startPage, startZoom, startRotation, plainChat, unavailable }) {
  const [doc, setDoc] = useState(null);
  const id = sourceRef.sourceId.slice('doc:'.length);
  useEffect(() => {
    const controller = new AbortController();
    let url = null;
    fetch(docUrl(app, id), { headers: wsHeaders(), signal: controller.signal })
      .then(async response => {
        if (!response.ok) { if (!controller.signal.aborted) { setDoc({ refused: true }); unavailable.current?.(); } return; }
        const type = response.ok ? response.headers.get('content-type') || '' : '';
        const next = /pdf/.test(type) ? { pdf: (url = URL.createObjectURL(await response.blob())) } : /^text\//.test(type) ? { text: await response.text() } : {};
        if (!controller.signal.aborted) setDoc(next);
      })
      .catch(() => { if (!controller.signal.aborted) { setDoc({}); unavailable.current?.(); } });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [app, id]);
  const range = sourceRef.range || {};
  if (!doc) return <p role="status" className="p-3 text-sm text-ink-2">Opening {sourceRef.name}</p>;
  if (doc.pdf) return <PaperReader app={app} id={sourceRef.sourceId} src={doc.pdf} title={sourceRef.name} startPage={startPage} startZoom={startZoom} startRotation={startRotation} quote={range.quote} quotePage={range.page || 1} save={save}
    companion={{ key: pdfKeyOfRef(sourceRef), home: null, anchor: range.excerpt || null, plainChat }} />;
  return doc.text == null ? <Unavailable sourceRef={sourceRef} refused={!!doc.refused} /> : <TextView text={doc.text} quote={range.quote} position={position} save={save} />;
}

function Reader({ sourceRef, position, onPosition, onUnavailable, chat }) {
  const app = chat?.canvas, reader = readerFor(sourceRef), range = sourceRef.range || {};
  // Where the reader is now; every report also goes to the session position store (chat-sources.js).
  // The memoized reader below outlives renders, so it reaches the latest workspace and onPosition through refs.
  // An excerpt's Open source opens its own page, never the reader's last one.
  const here = useRef({ page: range.page || 1, ...position, ...(range.excerpt?.page?.index ? { page: range.excerpt.page.index } : {}) }), report = useRef(onPosition), live = useRef(chat);
  report.current = onPosition; live.current = chat;
  const unavailable = useRef(onUnavailable); unavailable.current = onUnavailable;
  const save = useCallback(next => { here.current = { ...here.current, ...next }; report.current?.(next); }, []);
  const [passage, setPassage] = useState(null);
  const box = useRef(null);
  // A selected passage (wiki or text) offers Ask about this. Set only on a change, so a plain click never re-renders the reader
  // under it. A PDF's selection belongs to LearnPaper's toolbar.
  const pick = () => {
    if (box.current?.querySelector('[aria-label="Paper reader"]')) return;
    const selection = window.getSelection?.();
    const inside = selection && !selection.isCollapsed && box.current?.contains(selection.anchorNode) && box.current.contains(selection.focusNode);
    const text = inside ? selection.toString().trim() : '';
    setPassage(text || null);
  };
  const ask = () => {
    chat.addToChat({ ...sourceRef, range: { quote: passage } });
    window.getSelection?.()?.removeAllRanges();
    setPassage(null);
  };
  // A PDF passage with no excerpt identity (an arXiv paper, or the identity route refused): the quote at its page, as before.
  const plainChat = useCallback(text => {
    if (!live.current) return 'Chat is not available here.';
    if (text.length > QUOTE_MAX) return `Select up to ${QUOTE_MAX} characters to add a passage of this paper to chat.`;
    live.current.addToChat({ ...sourceRef, range: { page: here.current.page, quote: text } });
    return null;
  }, [sourceRef]);
  const [selection, setSelection] = useState(null);
  const codeSelection = useMemo(() => ({ value: selection, set: setSelection }), [selection]);
  const body = useMemo(() => {
    if (reader === 'paper') {
      const id = sourceRef.sourceId.slice('paper:'.length);
      const key = pdfKeyOfRef(sourceRef);
      return <PaperReader app={app} id={id} home={sourceRef.home} title={sourceRef.name} startPage={here.current.page} startZoom={here.current.zoom} startRotation={here.current.rotation} quote={range.quote} quotePage={range.page || 1} save={save}
        companion={{ key, home: key ? sourceRef.home || app : null, anchor: range.excerpt || null, plainChat }} />;
    }
    if (reader === 'wiki') return <LearnWiki app={app} article={{ title: sourceRef.sourceId.slice('wiki:'.length), section: position?.section || 0 }} onSection={section => save({ section })} />;
    if (reader === 'doc') return <DocReader app={app} sourceRef={sourceRef} position={position} save={save} startPage={here.current.page} startZoom={here.current.zoom} startRotation={here.current.rotation} plainChat={plainChat} unavailable={unavailable} />;
    if (reader === 'text') return <TextView text={sourceRef.text} quote={range.quote} position={position} save={save} />;
    if (reader === 'code') {
      const code = codeSource(sourceRef), owned = /^[\w.-]+\/[\w.-]+$/.test(code.repo);
      // A host link only for an owner/name repo; the file itself is read from this canvas at the cited commit.
      return <RepositorySource appName={app} path={code.path} line={code.start} lineEnd={code.end || undefined} commit={code.commit || undefined}
        repo={owned ? code.repo : undefined} byRepository={owned && !!code.commit} initialPosition={position} onPosition={save}
        actions={chat ? selected => <div data-range-actions role="toolbar" aria-label={`Selected lines ${selected.start}-${selected.end}`} onPointerDown={event => event.preventDefault()}
          className="absolute top-full left-12 z-10 mt-1 flex items-center rounded-md bg-white p-1 font-sans whitespace-nowrap shadow-pop select-none">
          <CiteActions range={{ repo: code.repo, commit: selected.commit, path: code.path, start: selected.start, end: selected.end }} text={selected.text} />
          <AskButton onClick={() => live.current.addToChat({ ...sourceRef, range: { path: code.path, start: selected.start, end: selected.end } })} />
        </div> : undefined} />;
    }
    return <Unavailable sourceRef={sourceRef} />;
  }, [app, sourceRef]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={box} data-source-reader={reader || 'none'} onMouseUp={reader === 'code' ? undefined : pick} onKeyUp={reader === 'code' ? undefined : pick} className="flex min-h-0 flex-1 flex-col">
    {reader === 'code' ? <SourceSelectionContext.Provider value={codeSelection}>{body}</SourceSelectionContext.Provider> : body}
    {passage && chat && <div className="flex shrink-0 justify-end border-t border-line pt-2">{passage.length > QUOTE_MAX
      ? <p role="status" className="text-xs text-ink-2">Select up to {QUOTE_MAX} characters to ask about a passage.</p> : <AskButton onClick={ask} />}</div>}
  </div>;
}

// A paper turns its own pages; the page is the reading position. The cited quote is painted on its page.
function PaperReader({ app, id, home = null, src = null, title, startPage, startZoom, startRotation, quote, quotePage, save, companion }) {
  const [page, setPage] = useState(startPage);
  const paper = useMemo(() => ({ id, title, pdfUrl: src || id.startsWith('upload:') ? null : `https://arxiv.org/pdf/${id}`, page, ...(home ? { home } : {}) }), [id, home, src, title, page]);
  const highlights = useMemo(() => (quote ? [{ page: quotePage, exact: quote, prefix: '', suffix: '' }] : null), [quote, quotePage]);
  return <LearnPaper app={app} paper={paper} src={src} selectButton={false} highlights={highlights} paintKey={quote ? 'source-reader' : null} companion={companion}
    zoomStart={startZoom} onZoom={zoom => save({ zoom })} rotationStart={startRotation} onRotation={rotation => save({ rotation })} onPage={next => { setPage(next); save({ page: next }); }} />;
}

// One reader per ref: another source, or another range of the same one (a new citation), starts a fresh reader.
// onUnavailable (Pinned Study): called when a document's bytes are refused to this learner or cannot be read.
export default function SourceReader({ sourceRef, position, onPosition, onUnavailable }) {
  const chat = useChatWorkspace();
  if (!sourceRef) return null;
  return <Reader key={`${sourceRef.sourceId} ${JSON.stringify(sourceRef.range ?? null)} ${sourceRef.opened ?? ''}`} sourceRef={sourceRef} position={position} onPosition={onPosition} onUnavailable={onUnavailable} chat={chat} />;
}
