import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsDownUp, ChevronsUpDown, Copy, ExternalLink, FileCode, Loader2, MessageSquarePlus } from 'lucide-react';
import { useChatWorkspace } from './chat-workspace.jsx';
import { highlightCode } from './code-lang.js';
import { codeCardRef, previewOf, provenanceOf } from './code-card.js';
import { useSearchContent } from './canvas-search-content.jsx';
import { searchSourceRecord } from './canvas-search-content.js';
import { useCardSource } from './use-card-source.js';
import { loadAsset } from './learn-board-assets.js';
import { repositoryUrl } from './card-sources.js';
import { CitableLines } from './TutorCitations.jsx';

// A code card's body (repo-graph Release 2; brief "Code-card behaviour"), inside the shared CanvasNode frame, so it selects,
// moves, resizes, deletes, saves and undoes like any card. It shows the file name, language, provenance (repository, path,
// lines and commit, or the uploaded file) and highlighted code: a bounded preview that says when it is an excerpt, and Expand
// for the whole stored range. Code is inert: nothing here runs it. Controls stop the press so they never select or drag.
// Open source: a repository card asks the page to open its file and lines in the companion Files viewer at its own commit
// (small:open-code; repository-canvas.jsx answers, else GitHub at that commit: another canvas or revision); an upload card
// opens its stored file in a new tab. Add to chat pins the card's code ref. Nothing sends or calls a model. The code takes the
// pointer itself (pointer-events-auto, as the controls do), so it scrolls by wheel on a view-only link, whose hand tool leaves
// the cards' column pointer-events-none (follow-up R3 item 5).
const stop = event => event.stopPropagation();
const BUTTON = 'pointer-events-auto inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50';

// shiki's runs (code-lang.js colorRuns) split back into lines; null while plain.
const lineRuns = runs => {
  if (!runs) return null;
  const out = [[]];
  for (const run of runs) run.t === '\n' ? out.push([]) : out[out.length - 1].push(run);
  return out;
};

export default function CodeCard({ block, onChange }) {
  const chat = useChatWorkspace();
  const { status, lines, retry } = useCardSource(block);
  const searchSource = useMemo(() => searchSourceRecord({ sourceKey: JSON.stringify(block.source || {}), status, units: (lines || []).map(line => ({ text: line.text, loc: { start: line.n, end: line.n } })), retry }), [block.source, status, lines, retry]);
  useSearchContent(block.id, searchSource);
  const expanded = !!block.expanded;
  const view = status === 'ready' ? previewOf(lines, expanded) : null;
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
  return (
    <div data-code-card data-code-colors="" data-source-kind={source.kind} data-status={status} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-w-0 shrink-0 items-center gap-2 px-3 pt-1 pb-2">
        <FileCode size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-2" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span data-code-card-title className="truncate text-sm font-semibold text-ink" title={block.title || 'Code'}>{block.title || 'Code'}</span>
          <span data-code-card-provenance className="truncate text-xs text-ink-3" title={provenanceOf(block)}>{block.language && block.language !== 'text' ? `${block.language} · ` : ''}{provenanceOf(block)}</span>
        </span>
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-y border-line px-2 py-0.5" onPointerDown={stop}>
        <button type="button" data-code-card-open className={BUTTON} disabled={status !== 'ready'} title={source.kind === 'repository' ? 'Open these lines in Files at this commit' : 'Open the stored file'} onClick={openSource}><ExternalLink size={13} aria-hidden />Open source</button>
        <button type="button" data-code-card-chat className={BUTTON} disabled={!chat || status !== 'ready'} title="Keep this code with the chat" onClick={addToChat}><MessageSquarePlus size={13} aria-hidden />Add to chat</button>
        <button type="button" data-code-card-copy className={BUTTON} disabled={!code} onClick={copy}>{copied ? <><Check size={13} aria-hidden />Copied</> : <><Copy size={13} aria-hidden />Copy</>}</button>
        {view && (view.excerpt || expanded) && view.total > 0 && <button type="button" data-code-card-expand aria-expanded={expanded} className={BUTTON}
          onClick={() => onChange?.({ ...block, expanded: !expanded })}>{expanded ? <><ChevronsDownUp size={13} aria-hidden />Collapse</> : <><ChevronsUpDown size={13} aria-hidden />Expand</>}</button>}
      </div>
      {status === 'loading' && <p role="status" className="flex items-center gap-1.5 px-3 py-2 text-xs text-ink-2"><Loader2 size={13} className="animate-spin" aria-hidden />Loading the code…</p>}
      {status === 'unavailable' && <p data-code-card-unavailable className="px-3 py-2 text-xs text-ink-2">{source.kind === 'upload' ? 'This file is not available here.' : 'Repository content unavailable.'}</p>}
      {status === 'failed' && <div role="alert" className="flex items-center gap-2 px-3 py-2 text-xs text-danger" onPointerDown={stop}>The code could not be read.
        <button type="button" data-code-card-retry className={BUTTON} onClick={retry}>Retry</button></div>}
      {view && <>
        <CitableLines source={source.kind === 'repository' ? { repo: source.repo, commit: source.commit, path: source.path } : null} lineAttr="codeLine" className="flex min-h-0 flex-1 flex-col">
        <pre data-scroll data-code-card-code className="pointer-events-auto min-h-0 flex-1 overflow-auto px-0 py-2 font-mono text-[12px] leading-5" onPointerDown={stop}>
          {view.lines.map((line, i) => <div key={line.n} data-code-line={line.n} className="flex">
            <span aria-hidden className="w-10 shrink-0 pr-2 text-right text-ink-3 select-none">{line.n}</span>
            <span className="min-w-0 whitespace-pre">{runs?.[i] ? runs[i].map((run, j) => <span key={j} style={run.color ? { color: run.color, '--shiki-dark': run.dark || run.color } : undefined}>{run.t}</span>) : line.text}</span>
          </div>)}
        </pre>
        </CitableLines>
        {view.excerpt && <p data-code-card-excerpt className="shrink-0 border-t border-line px-3 py-1 text-[11px] text-ink-3">Showing {view.shown} of {view.total} lines. Expand shows the rest.</p>}
      </>}
    </div>
  );
}
