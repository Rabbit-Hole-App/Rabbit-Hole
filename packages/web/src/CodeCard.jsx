import { useEffect, useMemo, useState } from 'react';
import CardHeader from './CardHeader.jsx';
import { Check, Copy, ExternalLink, Loader2, MessageSquarePlus } from 'lucide-react';
import { useChatWorkspace } from './chat-workspace.jsx';
import { fullContent } from './card-layout.js';
import { highlightCode } from './code-lang.js';
import { codeCardRef, previewOf, provenanceOf, publishCodeCard } from './code-card.js';
import { useSearchContent } from './canvas-search-content.jsx';
import { searchSourceRecord } from './canvas-search-content.js';
import { useCardSource } from './use-card-source.js';
import { loadAsset } from './learn-board-assets.js';
import { repositoryUrl } from './card-sources.js';
import { CitableLines } from './TutorCitations.jsx';
import CodeLines, { lineRuns } from './CodeLines.jsx'; // lineRuns: shiki's runs (code-lang.js colorRuns) split back into lines; null while plain
import { revealSentence, useLitRange } from './code-explain-link.js';
import { Pill } from './ui.jsx';

// A code card's body (repo-graph Release 2; brief "Code-card behaviour"), inside the shared CanvasNode frame, so it selects,
// moves, resizes, deletes, saves and undoes like any card. It shows the file name, language, provenance (repository, path,
// lines and commit, or the uploaded file) and highlighted code: a bounded preview that says when it is an excerpt, and the card's
// Full content layout (the canvas menu's row) for the whole stored range. Code is inert: nothing here runs it. Controls stop the press so they never select or drag.
// Open source: a repository card asks the page to open its file and lines in the companion Files viewer at its own commit
// (small:open-code; repository-canvas.jsx answers, else GitHub at that commit: another canvas or revision); an upload card
// opens its stored file in a new tab. Add to chat pins the card's code ref. Nothing sends or calls a model. The code takes the
// pointer itself (pointer-events-auto, as the controls do), so it scrolls by wheel on a view-only link, whose hand tool leaves
// the cards' column pointer-events-none (follow-up R3 item 5).
const stop = event => event.stopPropagation();
const BUTTON = 'pointer-events-auto inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50';

export default function CodeCard({ block }) {
  const chat = useChatWorkspace();
  const { status, lines, retry } = useCardSource(block);
  const searchSource = useMemo(() => searchSourceRecord({ sourceKey: JSON.stringify(block.source || {}), status, units: (lines || []).map(line => ({ text: line.text, loc: { start: line.n, end: line.n } })), retry }), [block.source, status, lines, retry]);
  useSearchContent(block.id, searchSource);
  // A code-explain satellite (code-explain-card-spec.md 2b, 6): `ranges` highlights its lines and dims the rest over its whole stored span (the ranges' own hull, so bounded by them);
  // `from` names the primary card, which the badge frames and whose sentence a pressed range scrolls to. Without them the card is exactly what it was.
  const ranges = block.ranges?.length ? block.ranges : null, primary = typeof block.from === 'string' && block.from.startsWith('codeExplain:') ? block.from.slice('codeExplain:'.length) : null;
  const lit = useLitRange(primary), view = status === 'ready' ? previewOf(lines, fullContent(block) || !!ranges) : null;
  const parent = primary && chat?.canvasOps?.hasBlock?.(primary) ? chat.canvasOps.findCard?.(entry => entry.id === primary) : null;
  const code = view ? view.lines.map(line => line.text).join('\n') : '';
  const [runs, setRuns] = useState(null), [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    setRuns(null);
    if (code) highlightCode(code, block.language || 'text').then(next => { if (active) setRuns(lineRuns(next)); });
    return () => { active = false; };
  }, [code, block.language]);
  useEffect(() => { if (!copied) return undefined; const timer = setTimeout(() => setCopied(false), 1500); return () => clearTimeout(timer); }, [copied]);
  const source = block.source || {};
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); } catch { /* a refused clipboard copies nothing */ } };
  const openSource = async () => {
    if (source.kind === 'repository') {
      const event = new CustomEvent('small:open-code', { detail: { ...source }, cancelable: true });
      if (window.dispatchEvent(event)) window.open(repositoryUrl({ repo: source.repo, commit: source.commit, path: source.path, line: source.start, lineEnd: source.end }), '_blank', 'noopener');
      return;
    }
    const value = await loadAsset(source.assetKey);
    if (value == null) return;
    window.open(URL.createObjectURL(typeof value === 'string' ? new Blob([value], { type: 'text/plain' }) : value), '_blank', 'noopener');
  };
  const addToChat = () => { const ref = codeCardRef(block, code); if (ref) chat?.addToChat(ref); };
  // The canvas menu's Copy code and Open source (UI-25) are this card's own.
  useEffect(() => (code ? publishCodeCard(block.id, { code, openSource }) : undefined), [block.id, code]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div data-code-card data-code-colors="" data-source-kind={source.kind} data-status={status} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* The shared pinned header (CardHeader.jsx, owner 2026-11-07): the title (the learner's name, else the file name, else a placeholder), and the language and where the lines come from under it. */}
      <CardHeader block={block} className="px-3 pt-1 pb-2" titleProps={{ 'data-code-card-title': '' }} metaProps={{ 'data-code-card-provenance': '', title: provenanceOf(block) }}
        meta={`${block.language && block.language !== 'text' ? `${block.language} · ` : ''}${provenanceOf(block)}`} />
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-y border-line px-2 py-0.5" onPointerDown={stop}>
        <button type="button" data-code-card-open className={BUTTON} disabled={status !== 'ready'} title={source.kind === 'repository' ? 'Open these lines in Files at this commit' : 'Open the stored file'} onClick={openSource}><ExternalLink size={13} aria-hidden />Open source</button>
        <button type="button" data-code-card-chat className={BUTTON} disabled={!chat || status !== 'ready'} title="Keep this code with the chat" onClick={addToChat}><MessageSquarePlus size={13} aria-hidden />Add to chat</button>
        <button type="button" data-code-card-copy className={BUTTON} disabled={!code} onClick={copy}>{copied ? <><Check size={13} aria-hidden />Copied</> : <><Copy size={13} aria-hidden />Copy</>}</button>
        {parent && <button type="button" data-code-card-from className="pointer-events-auto ml-auto min-w-0 max-w-[50%]" title="Show the card this code was added from" onClick={() => chat.canvasOps.locate(primary)}><Pill className="max-w-full truncate">from: {parent.title || 'code explanation'}</Pill></button>}
      </div>
      {status === 'loading' && <p role="status" className="flex items-center gap-1.5 px-3 py-2 text-xs text-ink-2"><Loader2 size={13} className="animate-spin" aria-hidden />Loading the code</p>}
      {status === 'unavailable' && <p data-code-card-unavailable className="px-3 py-2 text-xs text-ink-2">{source.kind === 'upload' ? 'This file is not available here.' : 'Repository content unavailable.'}</p>}
      {status === 'failed' && <div role="alert" className="flex items-center gap-2 px-3 py-2 text-xs text-danger" onPointerDown={stop}>The code could not be read.
        <button type="button" data-code-card-retry className={BUTTON} onClick={retry}>Retry</button></div>}
      {view && <>
        <CitableLines source={source.kind === 'repository' ? { repo: source.repo, commit: source.commit, path: source.path } : null} lineAttr="codeLine" className="flex min-h-0 flex-1 flex-col">
        <CodeLines data-scroll data-code-card-code className="pointer-events-auto min-h-0 flex-1 overflow-auto px-0 py-2 font-mono text-[12px] leading-5" onPointerDown={stop}
          lines={view.lines} runs={runs} ranges={ranges} lit={ranges?.some(range => range.id === lit) ? lit : null} onRange={primary ? id => revealSentence(primary, id) : null} />
        </CitableLines>
        {view.excerpt && <p data-code-card-excerpt className="shrink-0 border-t border-line px-3 py-1 text-[11px] text-ink-3">Showing {view.shown} of {view.total} lines. Full content shows the rest.</p>}
      </>}
    </div>
  );
}
