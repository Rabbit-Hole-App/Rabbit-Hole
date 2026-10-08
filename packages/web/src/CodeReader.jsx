import { Fragment, useEffect, useMemo, useState } from 'react';
import { Braces, Check, ChevronRight, Copy, FileCode, Folder, MessageSquare } from 'lucide-react';
import { Button } from './ui.jsx';
import RepositorySource, { SourceSelectionContext } from './RepositorySource.jsx';
import { fileTree, searchRepository } from './code-reader.js';
import { symbolsIn } from './inspector.js';
import { rangeContext, rangeTitle } from './agent/scope.js';
import { rememberCodeCopy } from './map-files.js';

// The Files view (owner brief §4, §5, §7, §14; docs/features/repository-browser.md): a lightweight code browser, not an IDE.
// A tree (the open file lists its symbols), and the reader: breadcrumb, line numbers, highlighting. A click on a file or a
// symbol selects it (RepositoryPage attach: inspector and composer follow). Selecting code only highlights it and offers
// [Ask] [Learn]; nothing reaches the composer until one is clicked, so text can still be copied and read freely.
const ROW = 'flex w-full cursor-pointer items-center gap-1.5 rounded-sm py-1 pr-2 text-left text-[13px] text-ink-2 hover:bg-hover hover:text-ink aria-[current=true]:bg-active aria-[current=true]:text-ink';
const HEAD = 'px-2 pt-2 pb-1 text-[11px] font-medium text-ink-3';
const indent = (depth) => ({ paddingLeft: `${8 + depth * 14}px` });

// stacked: the tree above the reader, for Learn's narrow right panel; otherwise side by side, stacked only on a phone.
// place 'panel' (Learn's Files panel; repository-browser.md "Files in Learn", owner 2026-10-08): a selection offers exactly
// [Ask in chat] [Copy] - no Learn. Copy puts the lines on the clipboard, marked as code from this file for a paste onto the
// canvas, and says Copied on the button itself. The Map's own toolbar ('map') keeps [Ask] [Learn].
export default function CodeReader({ app, snapshot, open, context, query, onFile, onSymbol, onRange, stacked = false, place = 'map' }) {
  const panel = place === 'panel';
  // A selected range waiting for Ask or Learn. Only this reader sees it; another file or Esc drops it.
  const [pending, setPending] = useState(null);
  const [copied, setCopied] = useState(null); // the range just copied: its Copy reads Copied for a moment
  useEffect(() => setPending(null), [open]);
  useEffect(() => { if (!copied) return undefined; const timer = setTimeout(() => setCopied(null), 1500); return () => clearTimeout(timer); }, [copied]);
  const copy = async (r) => {
    try { await navigator.clipboard.writeText(r.text); } catch { return; } // a refused clipboard copies nothing
    rememberCodeCopy(() => sessionStorage, { text: r.text, path: r.path, repo: app.repo, commit: snapshot.commit, start: r.start, end: r.end });
    setCopied(`${r.path}:${r.start}-${r.end}`);
  };
  useEffect(() => {
    if (!pending) return;
    const escape = (e) => { if (e.key === 'Escape') setPending(null); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [pending]);
  const tree = useMemo(() => fileTree(snapshot.files.map((f) => f.path)), [snapshot]);
  const found = useMemo(() => searchRepository(snapshot, query), [snapshot, query]);
  const symbols = useMemo(() => (open ? symbolsIn(snapshot.graph, open) : []), [snapshot, open]);
  const here = context?.path === open ? context : null; // the context, when it points into the open file
  const act = (kind, r) => { setPending(null); window.getSelection()?.removeAllRanges(); onRange(kind, { ...rangeContext(r.path, r.start, r.end, snapshot.commit), text: r.text }); }; // text: the chat chip's preview
  const fileRow = (path, label, depth) => <button key={path} type="button" data-file-row={path} aria-current={path === open || undefined} title={path} onClick={() => onFile(path)} className={ROW} style={indent(depth)}><FileCode size={14} className="shrink-0 text-ink-3" /><span className="truncate font-mono text-xs">{label}</span></button>;
  const symbolRow = (n, depth, where) => <button key={n.id} type="button" data-symbol-row={n.id} aria-current={context?.id === n.id || undefined} onClick={() => onSymbol(n)} className={ROW} style={indent(depth)}>
    <Braces size={13} className="shrink-0 text-ink-3" /><span className="min-w-0 flex-1 truncate">{n.label}</span><span className="shrink-0 font-mono text-[11px] text-ink-3">{where}{n.line}</span></button>;
  const branch = (nodes, depth) => nodes.map((n) => (n.children
    ? <details key={n.path} open={!!open && open.startsWith(`${n.path}/`)} className="group">
      <summary className={`${ROW} list-none [&::-webkit-details-marker]:hidden`} style={indent(depth)}><ChevronRight size={13} className="shrink-0 text-ink-3 transition-transform group-open:rotate-90 motion-reduce:transition-none" /><Folder size={14} className="shrink-0 text-ink-3" /><span className="truncate">{n.name}</span></summary>
      {branch(n.children, depth + 1)}
    </details>
    : <Fragment key={n.path}>{fileRow(n.path, n.name, depth)}{n.path === open && symbols.map((s) => symbolRow(s, depth + 1, ':'))}</Fragment>));
  const crumb = open && [app.repo, ...open.split('/'), here && here.kind !== 'file' ? here.label : null].filter(Boolean).join(' › ');
  return <div className={`flex min-h-0 flex-1 overflow-hidden rounded-lg border border-line ${stacked ? 'flex-col' : 'max-md:flex-col'}`}>
    <nav aria-label="Files" data-file-tree className={`shrink-0 overflow-y-auto py-1 ${stacked ? 'max-h-48 border-b border-line' : 'w-56 border-r border-line max-xl:w-44 max-md:max-h-40 max-md:w-full max-md:border-r-0 max-md:border-b'}`}>
      {query.trim()
        ? <>{found.files.length > 0 && <><p className={HEAD}>Files</p>{found.files.map((p) => fileRow(p, p, 0))}</>}
          {found.symbols.length > 0 && <><p className={HEAD}>Symbols</p>{found.symbols.map((n) => symbolRow(n, 0, `${n.path.split('/').pop()}:`))}</>}
          {!found.files.length && !found.symbols.length && <p className="px-2 py-2 text-xs text-ink-3">No file or symbol matches “{query.trim()}”.</p>}</>
        : branch(tree, 0)}
    </nav>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3 pt-2" onPointerDown={(e) => { if (!e.target.closest('[data-range-actions]')) setPending(null); }}>
      {open
        ? <SourceSelectionContext.Provider value={{ value: pending, set: setPending }}>
          <RepositorySource appName={app.name} path={open} commit={snapshot.commit} repo={app.repo} title={crumb}
            line={here && here.kind !== 'file' ? here.line : null} lineEnd={here?.end}
            actions={(r) => <div data-range-actions role="toolbar" aria-label={`Selected ${rangeTitle(r)}`} onPointerDown={(e) => e.preventDefault()}
              className="absolute top-full left-12 z-10 mt-1 flex items-center gap-0.5 rounded-md bg-white p-1 font-sans whitespace-nowrap shadow-pop select-none">
              <span className="px-1.5 font-mono text-[11px] text-ink-2">{rangeTitle(r)}</span>
              {panel ? <>
                <Button size="sm" data-range-ask onClick={() => act('ask', r)}><MessageSquare size={13} />Ask in chat</Button>
                <Button size="sm" data-range-copy onClick={() => copy(r)}>{copied === `${r.path}:${r.start}-${r.end}` ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy</>}</Button>
              </> : <>
                <Button size="sm" onClick={() => act('ask', r)}>Ask</Button>
                <Button size="sm" onClick={() => act('learn', r)}>Learn</Button>
              </>}
            </div>} />
        </SourceSelectionContext.Provider>
        : <p className="py-3 text-sm text-ink-3">Select a file to read it, or a symbol to jump to it.</p>}
    </div>
  </div>;
}
