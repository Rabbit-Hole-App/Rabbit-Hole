import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Braces, Check, ChevronRight, FileCode, Folder } from 'lucide-react';
import { Button } from './ui.jsx';
import ActionBar from './ActionIcons.jsx';
import RepositorySource, { SourceSelectionContext } from './RepositorySource.jsx';
import { fileTree, searchRepository } from './code-reader.js';
import { symbolsIn } from './inspector.js';
import { rangeContext, rangeTitle } from './agent/scope.js';
import { rememberCodeCopy } from './map-files.js';
import { useChatWorkspace } from './chat-workspace.jsx';
import { CODE_DRAG, insertCodeCard, repoCodeCard } from './code-card.js';
import { codeRef } from './chat-sources.js';
import { CiteActions } from './TutorCitations.jsx';

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
// pick: a code reference opened here ({ path, start, end, at }, RepositoryPage): its range becomes this reader's selection.
export default function CodeReader({ app, snapshot, open, context, query, onFile, onSymbol, onRange, onCloseAll = null, stacked = false, place = 'map', pick = null }) {
  const panel = place === 'panel';
  // The tree above the reader is as tall as the learner drags it (owner 2026-11-15): a divider under the tree, by pointer or arrow keys, kept on this device.
  const [treeH, setTreeH] = useState(() => { try { return Math.min(600, Math.max(64, Number(localStorage.getItem('rh.filesTreeHeight')) || 192)); } catch { return 192; } });
  const treeNav = useRef(null);
  const resizeTree = next => { const h = Math.round(Math.min(600, Math.max(64, next))); setTreeH(h); try { localStorage.setItem('rh.filesTreeHeight', String(h)); } catch { /* the height holds until a reload */ } };
  const dragTree = event => { event.preventDefault(); const y0 = event.clientY, h0 = treeH; const move = e => resizeTree(h0 + e.clientY - y0), up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); };
  const closeFile = () => onCloseAll?.(); // owner 2026-11-15: X closes only the bottom panel, the open file; the tree and the pane stay
  // Code cards (repo-graph Release 2): beside a canvas, Add to canvas puts the open file, a symbol or the selected lines on it
  // at this snapshot's commit, and a file or symbol row drags onto the canvas as one (code-card.js; the same creation path).
  const chat = useChatWorkspace(), ops = chat?.canvasOps, cards = panel && !!ops?.insertCard;
  // Add to chat: the open file, or the selected lines, as a context chip in the chat composer (chat.addToChat, the Graph's Add to chat and a code card's); it asks nothing and sends nothing.
  const inChat = panel && !!chat?.addToChat;
  const addInChat = (path, range) => chat.addToChat(codeRef({ repo: app.repo, commit: snapshot.commit, path, ...range }));
  const source = (path, extra = {}) => ({ app: app.name, repo: app.repo, commit: snapshot.commit, path, ...extra });
  const addCard = (path, extra) => { insertCodeCard(ops, repoCodeCard(source(path, extra))); };
  const drag = (path, extra) => (cards ? { draggable: true, onDragStart: (e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData(CODE_DRAG, JSON.stringify(source(path, extra))); } } : {});
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
  const fileRow = (path, label, depth) => <button key={path} type="button" data-file-row={path} {...drag(path)} aria-current={path === open || undefined} title={path} onClick={() => onFile(path)} className={ROW} style={indent(depth)}><FileCode size={14} className="shrink-0 text-ink-3" /><span className="truncate font-mono text-xs">{label}</span></button>;
  const symbolRow = (n, depth, where) => <button key={n.id} type="button" data-symbol-row={n.id} {...drag(n.path, { start: n.line || null, nodeId: n.id, label: n.label })} aria-current={context?.id === n.id || undefined} onClick={() => onSymbol(n)} className={ROW} style={indent(depth)}>
    <Braces size={13} className="shrink-0 text-ink-3" /><span className="min-w-0 flex-1 truncate">{n.label}</span><span className="shrink-0 font-mono text-[11px] text-ink-3">{where}{n.line}</span></button>;
  const branch = (nodes, depth) => nodes.map((n) => (n.children
    ? <details key={n.path} open={!!open && open.startsWith(`${n.path}/`)} className="group">
      <summary className={`${ROW} list-none [&::-webkit-details-marker]:hidden`} style={indent(depth)}><ChevronRight size={13} className="shrink-0 text-ink-3 transition-transform group-open:rotate-90 motion-reduce:transition-none" /><Folder size={14} className="shrink-0 text-ink-3" /><span className="truncate">{n.name}</span></summary>
      {branch(n.children, depth + 1)}
    </details>
    : <Fragment key={n.path}>{fileRow(n.path, n.name, depth)}{n.path === open && symbols.map((s) => symbolRow(s, depth + 1, ':'))}</Fragment>));
  const shut = panel && stacked && !open; // the Files panel with no file open: the bottom panel is gone and the tree has the whole pane (owner 2026-11-15)
  const crumb = open && [app.repo, ...open.split('/'), here && here.kind !== 'file' ? here.label : null].filter(Boolean).join(' › ');
  return <div className={`flex min-h-0 flex-1 overflow-hidden rounded-lg border border-line ${stacked ? 'flex-col' : 'max-md:flex-col'}`}>
    <nav ref={treeNav} aria-label="Files" data-file-tree style={shut ? undefined : stacked ? { height: treeH } : undefined} className={`${shut ? 'min-h-0 flex-1' : 'shrink-0'} overflow-y-auto py-1 ${stacked ? '' : 'w-56 border-r border-line max-xl:w-44 max-md:max-h-40 max-md:w-full max-md:border-r-0 max-md:border-b'}`}>
      {query.trim()
        ? <>{found.files.length > 0 && <><p className={HEAD}>Files</p>{found.files.map((p) => fileRow(p, p, 0))}</>}
          {found.symbols.length > 0 && <><p className={HEAD}>Symbols</p>{found.symbols.map((n) => symbolRow(n, 0, `${n.path.split('/').pop()}:`))}</>}
          {!found.files.length && !found.symbols.length && <p className="px-2 py-2 text-xs text-ink-3">No file or symbol matches “{query.trim()}”.</p>}</>
        : branch(tree, 0)}
    </nav>
    {stacked && !shut && <div role="separator" aria-orientation="horizontal" aria-label="Resize the file list" aria-valuenow={treeH} aria-valuemin={64} aria-valuemax={600} tabIndex={0} data-file-tree-resize onPointerDown={dragTree}
      onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); resizeTree(treeH + (event.key === 'ArrowDown' ? 24 : -24)); } }}
      className="h-1.5 shrink-0 cursor-row-resize border-y border-line bg-hover hover:bg-active focus-visible:outline-2 focus-visible:outline-accent/35" />}
    {!shut && <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3 pt-2" onPointerDown={(e) => { if (!e.target.closest('[data-range-actions]')) setPending(null); }}>
      {open
        ? <SourceSelectionContext.Provider value={{ value: pending, set: setPending }}>
          <RepositorySource appName={app.name} path={open} commit={snapshot.commit} repo={app.repo} title={crumb} lead={(cards || inChat) ? [
              cards && { id: 'canvas', onClick: () => addCard(open), title: 'Add to canvas: this file as a code card', data: { 'data-file-add-card': '' } },
              inChat && { id: 'chat', onClick: () => addInChat(open), title: 'Add to chat: keep this file with the chat', data: { 'data-file-add-chat': '' } },
            ] : null}
            tail={panel && onCloseAll ? [{ id: 'close', label: 'Close', onClick: closeFile, title: 'Close: the open file', data: { 'data-file-close-all': '' } }] : null} pick={pick?.path === open ? pick : null}
            line={here && here.kind !== 'file' ? here.line : null} lineEnd={here?.end}
            actions={(r) => <div data-range-actions role="toolbar" aria-label={`Selected ${rangeTitle(r)}`} onPointerDown={(e) => e.preventDefault()}
              className="absolute top-full left-12 z-10 mt-1 flex items-center gap-0.5 rounded-md bg-white p-1 font-sans whitespace-nowrap shadow-pop select-none">
              <span className="px-1.5 font-mono text-[11px] text-ink-2">{rangeTitle(r)}</span>
              {panel ? <>
                <CiteActions range={{ repo: app.repo, commit: r.commit, path: r.path, start: r.start, end: r.end }} text={r.text} />
                <ActionBar actions={[
                  { id: 'ask', onClick: () => act('ask', r), data: { 'data-range-ask': '' } },
                  inChat && { id: 'chat', title: 'Add to chat: keep these lines with the chat', onClick: () => { setPending(null); window.getSelection()?.removeAllRanges(); addInChat(r.path, { start: r.start, end: r.end }); }, data: { 'data-range-add-chat': '' } },
                  cards && { id: 'canvas', title: 'Add to canvas: these lines as a code card', onClick: () => { setPending(null); addCard(r.path, { start: r.start, end: r.end }); }, data: { 'data-range-card': '' } },
                  { id: 'copy', ...(copied === `${r.path}:${r.start}-${r.end}` ? { label: 'Copied', Icon: Check } : {}), onClick: () => copy(r), data: { 'data-range-copy': '' } },
                ]} />
              </> : <>
                <Button size="sm" onClick={() => act('ask', r)}>Ask</Button>
                <Button size="sm" onClick={() => act('learn', r)}>Learn</Button>
              </>}
            </div>} />
        </SourceSelectionContext.Provider>
        : <p className="py-3 text-sm text-ink-3">Select a file to read it, or a symbol to jump to it.</p>}
    </div>}
  </div>;
}
