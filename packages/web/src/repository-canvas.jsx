import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { GitBranch, Info, RefreshCw } from 'lucide-react';
import { Button, IconBtn, Menu, toast } from './ui.jsx';
import CodeReader from './CodeReader.jsx';
import { useRepository } from './use-repository.js';
import { contextOf, fileObject, objectOf } from './inspector.js';
import { learnAction } from './agent/learn-hook.js';
import { askDraft, askQuestion, wireContext } from './agent/scope.js';

// The graph view's code loads when Explore codebase first shows it (brief section 13), never with the canvas.
// A stale deploy's missing chunk shows a reload inside the column, never a page-wide failure.
const GraphPanel = lazy(() => import('./GraphPanel.jsx').catch(() => ({ default: () => <div role="status" data-graph-unavailable className="flex flex-col items-start gap-2 p-4 text-sm text-ink-2"><p>The graph could not load. A newer version may be out.</p><Button size="sm" onClick={() => window.location.reload()}><RefreshCw size={13} aria-hidden /> Reload</Button></div> })));

// What a canvas attached to a repository gets (repo-canvas-graph.md): the Main canvas of a repo-* project and every
// project canvas alike - the association decides, never the flow that made the canvas. `project` is the repository row the
// page already has (catalog or route), or null for a canvas with no repository.
// Returns null, or { repository, codeRefs, canvasProps } where canvasProps go to LearnPage: files and graph (the companion
// column's Files and Graph views) and the composer's repository context (the Files reader's selection, as before).
// codeCards: Files' Ask in chat also drops the lines as a Code card - the Main canvas only, as before this release (code cards
// on other canvases are Release 2).
export function useRepositoryCanvas(project, { codeCards = false } = {}) {
  const repository = useRepository(project?.kind === 'repository' ? project.name : null, project);
  const app = repository?.app, snapshot = repository?.snapshot;
  // A code card's Open source (CodeCard.jsx small:open-code): this canvas's repository at the card's own commit opens in Files
  // at its lines; any other card is left to the card (GitHub at its commit), never shown against a different revision.
  useEffect(() => {
    const open = event => {
      const { app: name, commit, path, start, end } = event.detail || {};
      if (!repository || name !== app?.name || commit !== snapshot?.commit || !path) return;
      event.preventDefault();
      repository.files.setOpen(path);
      if (start) repository.files.setJump({ path, start, end: end || start, at: Date.now() });
      window.dispatchEvent(new CustomEvent('small:open-files'));
    };
    window.addEventListener('small:open-code', open);
    return () => window.removeEventListener('small:open-code', open);
  }, [repository, app, snapshot]);
  return useMemo(() => {
    if (!repository) return null;
    const { files, context, setContext } = repository;
    // Files opens beside Chat on the file and range (LearnPage small:open-files -> the companion column's Files view).
    const showFile = (path, start, end) => {
      files.setOpen(path);
      if (start) files.setJump({ path, start, end: end || start, at: Date.now() });
      window.dispatchEvent(new CustomEvent('small:open-files'));
    };
    // A code reference in an answer (Md.jsx CodeRefs): only a file of this snapshot is a link; nothing is asked or attached.
    const paths = new Set(snapshot?.files.map(f => f.path) || []);
    // app and commit let a graph card on this canvas (GraphCard.jsx) open its source or nodes here only at its own revision.
    const showGraph = ids => { repository.graph.setSelected(ids); window.dispatchEvent(new CustomEvent('small:open-graph')); };
    const codeRefs = snapshot ? { app: repository.name, commit: snapshot.commit, has: p => paths.has(p), open: (path, start, end) => { if (paths.has(path)) showFile(path, start, end); }, showGraph } : null;
    // The Files reader's selection is the composer's repository context, exactly as on the old repository page.
    const ground = object => (object.kind === 'range' ? object : contextOf(object, snapshot.commit));
    const attach = object => { setContext(ground(object)); if (object.path) files.setOpen(object.path); };
    const askAbout = object => { setContext(ground(object)); setTimeout(() => askDraft(askQuestion(object)), 0); };
    const learnThis = object => { setContext(ground(object)); learnAction('teach', { app: app.name, prompt: `Teach me ${wireContext(ground(object)).label}` }, {}).then(r => { if (r.status !== 'fallback' && r.message) toast(r.message); }); };
    // Ask in chat on lines also puts them on the canvas as a Code card (LearnPage small:code-card; owner, 2026-10-08).
    const codeCard = range => window.dispatchEvent(new CustomEvent('small:code-card', { detail: { text: range.text, path: range.path, start: range.start, end: range.end, commit: range.commit, repo: app.repo } }));
    const filesView = snapshot
      ? <CodeReader app={app} snapshot={snapshot} open={files.open} context={context} query="" pick={files.jump} stacked place="panel"
          onFile={p => attach(fileObject(snapshot.graph, p))} onSymbol={n => attach(objectOf(snapshot.graph, n))}
          onRange={(kind, range) => { attach(range); if (kind === 'learn') learnThis(range); else { askAbout(range); if (codeCards) codeCard(range); } }} />
      : <RepositoryState repository={repository} what="files" />;
    const graphView = <Suspense fallback={<p role="status" className="p-4 text-sm text-ink-2">Loading the graph…</p>}><GraphPanel repository={repository} onOpenSource={showFile} answerView={repository.answerView} /></Suspense>;
    return {
      repository, codeRefs,
      canvasProps: {
        repository, files: filesView, graph: graphView,
        repositoryContext: context ? wireContext(context) : { commit: repository.commit },
        repositoryExcerpt: context?.kind === 'range' ? context.text : null,
        onClearRepository: context ? () => setContext(null) : null,
        // "Show on graph" under an answer that drew one: the Graph view beside Chat shows it.
        onGraph: view => { repository.setAnswerView({ ...view, requestId: crypto.randomUUID() }); window.dispatchEvent(new CustomEvent('small:open-graph')); },
      },
    };
  }, [repository, app, snapshot, codeCards]);
}

// The Files view before a snapshot exists, or when it cannot (brief section 12): what is happening, never an empty pane.
export function RepositoryState({ repository, what = 'files' }) {
  const { status, error, canEdit, refresh, retry } = repository;
  // A ready repository whose snapshot read failed says so, with Retry (brief section 12), never Loading forever.
  const failed = status === 'failed' || (status === 'ready' && !!error);
  const line = status === 'unavailable' ? 'Repository content unavailable.'
    : failed ? `The repository could not be read${error ? `: ${error}` : '.'}`
    : status === 'queued' ? 'Waiting for the indexer…'
    : status === 'indexing' ? `Reading the repository and building its ${what === 'graph' ? 'code graph' : 'file list'}…`
    : 'Loading the repository…';
  return <div role="status" data-repository-state={failed && status === 'ready' ? 'failed' : status} className="flex flex-col items-start gap-2 p-4 text-sm text-ink-2">
    {['queued', 'indexing', 'loading'].includes(status) && <div className="h-1 w-40 overflow-hidden rounded bg-hover"><div className="h-full w-1/2 animate-pulse bg-accent" /></div>}
    <p>{line}</p>
    {failed && <Button size="sm" onClick={() => Promise.resolve(status === 'failed' && canEdit ? refresh() : retry()).catch(e => toast(e.message, { tone: 'error' }))}><RefreshCw size={13} aria-hidden /> {status === 'failed' && canEdit ? 'Retry import' : 'Retry'}</Button>}
  </div>;
}

// The canvas header's repository badge (owner correction: "The repository badge opens GitHub in a new browser tab"), the
// indexing state while there is no snapshot (a new repository opens its canvas at once and shows its progress here), and the
// details the old repository page kept behind its info icon: branch, commit, status, Refresh branch / Retry import.
export function RepositoryBadge({ repository }) {
  const [open, setOpen] = useState(false);
  const { app, status, githubUrl, canEdit, refresh, retry, commit, error } = repository;
  const fail = e => toast(e.message, { tone: 'error' });
  if (status === 'unavailable') return <span data-repo-badge data-state="unavailable" className="flex h-8 shrink-0 items-center px-1.5 text-xs text-ink-3">Repository content unavailable</span>;
  const busy = ['loading', 'queued', 'indexing'].includes(status);
  return <span data-repo-badge-row className="relative flex shrink-0 items-center">
    {/* Icon only, as its neighbours: beside the companion column and Chat the canvas header has little room (the repo is in the
        tooltip, the composer's placeholder and the Graph view's own line). */}
    {githubUrl && <a data-repo-badge href={githubUrl} target="_blank" rel="noopener noreferrer" title={`Open ${app.repo} on GitHub`} aria-label={`Open ${app.repo} on GitHub`}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"><GitBranch size={15} strokeWidth={1.8} aria-hidden /></a>}
    {busy && <span data-repo-status={status} role="status" className="flex h-8 items-center gap-1.5 px-1.5 text-xs text-ink-2"><span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />{status === 'queued' ? 'Waiting to read the repository…' : status === 'indexing' ? 'Reading the repository…' : 'Loading…'}</span>}
    {status === 'failed' && <button type="button" data-repo-status="failed" title={error || 'The repository could not be read'} onClick={() => Promise.resolve(canEdit ? refresh() : retry()).catch(fail)}
      className="flex h-8 items-center gap-1 rounded-lg px-1.5 text-xs text-red-700 hover:bg-hover"><RefreshCw size={12} aria-hidden />{canEdit ? 'Import failed · Retry' : 'Unavailable · Retry'}</button>}
    {app && <><IconBtn data-repo-info aria-label="Repository details" title="Repository details" aria-expanded={open} onClick={() => setOpen(value => !value)}><Info size={15} /></IconBtn>
      <Menu open={open} onClose={() => setOpen(false)} className="top-full right-0 mt-1 w-72 p-3">
        <div data-repo-details className="flex flex-col items-start gap-2 text-xs text-ink-2">
          <span className="font-medium text-ink">{app.repo}</span>
          <span className="flex items-center gap-1.5"><GitBranch size={14} aria-hidden />{app.branch}</span>
          <span>Commit {commit?.slice(0, 7) || 'awaiting snapshot'}</span><span>Status: {app.status}</span>
          {canEdit && <Button size="sm" disabled={busy} onClick={() => refresh().catch(fail)}><RefreshCw size={13} aria-hidden /> {app.status === 'failed' ? 'Retry import' : 'Refresh branch'}</Button>}
        </div>
      </Menu></>}
  </span>;
}
