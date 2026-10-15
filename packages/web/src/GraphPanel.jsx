import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Braces, ChevronDown, FileCode, Layers, Loader2, Package, Search, Waypoints, X } from 'lucide-react';
import RepositoryGraph from './RepositoryGraph.jsx';
import { Button, IconBtn, Input } from './ui.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';
import { objectOf, relationshipGroups, typeOf } from './inspector.js';
import { askDraft, askQuestion, whyQuestion } from './agent/scope.js';
import { repositoryUrl } from './card-sources.js';
import { clearSelection, graphRefs } from './repo-context.js';
import { reviewTools } from './flags.js';
import { fixturesOn, useMapMemory } from './home/review-fixtures.js';
import { layerGraph, MEMORY_KINDS, visibleMemory } from './map-memory.js';
import { LayersRow } from './MapMemory.jsx';
import { getSurface } from './agent/surface.js';

// The repository graph in the companion column beside Chat (repo-canvas-graph.md sections 3-6, 12; owner 2026-10-15).
// Props:
//   repository   use-repository.js's object: { app, status, commit, snapshot, error, refresh(), retry(), canEdit,
//                graph: { selected, setSelected, camera, setCamera }, context, setContext }. Selection and camera live there,
//                so switching the column to Files or Context and back keeps them.
//   onOpenSource (path, start, end) opens that file and range in the Files viewer (the cited commit is the snapshot's).
//   answerView   optional: a graph an answer drew (ask.jsx onGraph), shown with Back to return.
// Everything the old Map page offered stays: search, select (now several: Shift-click), explore one hop, Reset graph,
// Graph information, Layers (review fixtures only), Open source (Files viewer, and GitHub), Ask about this, Ask why, Learn
// this. Selecting is temporary chat context (repo-context.js); Add to chat pins it. Nothing here sends or calls a model.
// Closing the companion column clears the temporary selection; pinned refs stay.
const ICONS = { file: FileCode, symbol: Braces, external: Package };
const short = commit => (commit || '').slice(0, 7);

export default function GraphPanel({ repository, onOpenSource, answerView = null }) {
  const chat = useChatWorkspace();
  const [query, setQuery] = useState(''), [explore, setExplore] = useState(null), [layersOpen, setLayersOpen] = useState(false), [layers, setLayers] = useState(() => new Set());
  const { status, snapshot, app } = repository;
  // Review fixtures (map-memory.js): work-memory layers, labelled, filtered to what this viewer may see.
  const fixtures = reviewTools && fixturesOn(localStorage, window.location.search, reviewTools), stored = useMapMemory(fixtures, app?.repo), viewer = getSurface().email || null;
  const memory = useMemo(() => stored && visibleMemory(stored, viewer), [stored, viewer]);
  const shown = useMemo(() => snapshot && (memory && layers.size ? layerGraph(snapshot.graph, memory, layers) : snapshot.graph), [snapshot, memory, layers]);
  // An invisible selection never rides the next question: closing the column clears it (brief section 6).
  const open = chat?.panels?.companion?.open, wasOpen = useRef(open);
  useEffect(() => { if (wasOpen.current && open === false) clearSelection(repository); wasOpen.current = open; }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const { selected, setSelected } = repository.graph;
  const choose = (node, { toggle = false } = {}) => {
    if (!node) { if (!toggle) setSelected([]); return; }
    setSelected(toggle ? (selected.includes(node.id) ? selected.filter(id => id !== node.id) : [...selected, node.id]) : [node.id]);
  };
  const addToChat = () => { for (const ref of graphRefs(repository)) chat?.addToChat(ref); };
  const one = selected.length === 1 ? shown?.nodes.find(n => n.id === selected[0]) : null;
  const camera = repository.graph.camera?.commit === snapshot?.commit ? repository.graph.camera : null;

  return <section data-graph-panel aria-label="Repository graph" className="flex min-h-0 flex-1 flex-col gap-2">
    <header className="flex shrink-0 items-center gap-2 text-xs text-ink-2">
      <span data-graph-status={status} className="flex min-w-0 flex-1 items-center gap-1.5">
        {status === 'unavailable' ? <span>Repository content unavailable</span> : <>
          <span className="min-w-0 truncate font-medium text-ink" title={app?.repo}>{app?.repo || 'Repository'}</span>
          {snapshot && <span className="shrink-0 font-mono" title={`Indexed commit ${snapshot.commit}`}>{short(snapshot.commit)}</span>}
          {['queued', 'indexing'].includes(status) && <span className="flex shrink-0 items-center gap-1"><Loader2 size={12} className="animate-spin" aria-hidden />{snapshot ? 'Indexing a newer commit…' : status === 'queued' ? 'Waiting for the indexer…' : 'Indexing…'}</span>}
          {snapshot && repository.commit && repository.commit !== snapshot.commit && <span className="shrink-0 text-ink-3">· loading {short(repository.commit)}</span>}
        </>}
      </span>
      {memory && snapshot && <Button size="sm" data-map-layers-open aria-controls="graph-layers" aria-expanded={layersOpen} onClick={() => setLayersOpen(value => !value)}><Layers size={14} />Layers<ChevronDown size={12} className="text-ink-3" /></Button>}
    </header>
    <Body repository={repository} />
    {snapshot && <>
      <label className="relative shrink-0">
        <Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-3" />
        <Input aria-label="Search repository" placeholder="Search files or symbols…" value={query} onChange={event => setQuery(event.target.value)} className="w-full pl-7" />
      </label>
      {layersOpen && memory && <aside id="graph-layers" aria-label="Layers" className="shrink-0 rounded-lg border border-line p-2"><LayersRow memory={memory} layers={layers} onToggle={key => setLayers(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; })} /></aside>}
      {shown.nodes.length ? <div className="flex min-h-64 flex-1 flex-col">
        <RepositoryGraph key={snapshot.commit} graph={shown} selectedIds={selected} onSelect={choose} query={query} answerView={answerView} focusRequest={explore}
          camera={camera} onCamera={value => repository.graph.setCamera({ ...value, commit: snapshot.commit })} />
      </div> : <p data-graph-empty className="text-sm text-ink-2">This repository has no code graph. You can still ask about its code in Chat.</p>}
      <p className="shrink-0 text-xs text-ink-3">{snapshot.files?.length ?? 0} files · {snapshot.graph.nodes.length} nodes · {snapshot.graph.edges.length} relationships{snapshot.skipped?.length ? ` · ${snapshot.skipped.length} excluded` : ''}</p>
      {selected.length > 0 && <div data-graph-selection className="flex shrink-0 items-center gap-2 border-t border-line pt-2 text-sm">
        <span className="min-w-0 flex-1 text-ink-2">{selected.length} selected</span>
        <Button size="sm" variant="secondary" data-graph-add-to-chat disabled={!chat || !graphRefs(repository).length} title="Keep the selected code with this chat" onClick={addToChat}>Add to chat</Button>
        <IconBtn data-graph-clear aria-label="Clear selection" title="Clear selection (Escape)" onClick={() => setSelected([])}><X size={14} /></IconBtn>
      </div>}
      {one && <NodeDetails repository={repository} node={one} onOpenSource={onOpenSource} onExplore={id => setExplore({ id, at: Date.now() })} onSelect={node => choose(node)} />}
    </>}
  </section>;
}

// What shows instead of the graph: loading, indexing, failed (with Retry) and unavailable, never a guess (brief section 12).
function Body({ repository }) {
  const { status, snapshot, error, app, canEdit } = repository;
  if (snapshot) return error ? <p role="alert" className="shrink-0 text-xs text-danger">{error}</p> : null;
  if (status === 'unavailable') return <p data-graph-unavailable className="text-sm text-ink-2">Repository content unavailable.</p>;
  if (status === 'queued' || status === 'indexing') return <div role="status" className="rounded-lg border border-line p-3 text-sm"><div className="mb-2 h-1 overflow-hidden rounded bg-hover"><div className="h-full w-1/2 animate-pulse bg-accent" /></div>{status === 'queued' ? 'Waiting for the indexer…' : 'Downloading source and building the code graph…'}</div>;
  if (status === 'failed' || error) {
    const reimport = status === 'failed' && canEdit && app?.status === 'failed';
    return <div role="alert" className="flex flex-col items-start gap-2 text-sm"><p className="text-danger">{error || 'The repository could not be read.'}</p>
      <Button size="sm" variant="secondary" data-graph-retry onClick={() => Promise.resolve(reimport ? repository.refresh() : repository.retry()).catch(() => {})}>{reimport ? 'Retry import' : 'Retry'}</Button></div>;
  }
  return <p role="status" className="flex items-center gap-1.5 text-sm text-ink-2"><Loader2 size={14} className="animate-spin" aria-hidden />Loading the code graph…</p>;
}

// One selected node: what it is, where it lives, its indexed relationships, and the old inspector's actions. Ask actions
// write a ready question into Chat's composer and never send (agent/scope.js askDraft); the node already rides as context.
function NodeDetails({ repository, node, onOpenSource, onExplore, onSelect }) {
  const { snapshot, app } = repository;
  if (MEMORY_KINDS.includes(node.kind)) return <div data-node-details className="shrink-0 border-t border-line pt-2 text-sm"><p className="font-medium">{node.label}</p><p className="text-xs text-ink-3">Fixture record</p></div>;
  const object = objectOf(snapshot.graph, node), Icon = ICONS[object.kind] || Braces;
  const groups = relationshipGroups(snapshot.graph, object.nodeId || node.id);
  const href = object.path && repositoryUrl({ repo: app?.repo, commit: snapshot.commit, path: object.path, line: object.kind === 'file' ? null : object.line });
  return <div data-node-details className="flex max-h-[40%] shrink-0 flex-col gap-1.5 overflow-y-auto border-t border-line pt-2">
    <div className="flex items-center gap-1.5">
      <Icon size={15} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-2" />
      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold" title={object.label}>{object.label}</h3>
      {href && <a data-node-github href={href} target="_blank" rel="noreferrer" aria-label="Open on GitHub" title="Open this source on GitHub at the indexed commit" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink"><ArrowUpRight size={14} /></a>}
    </div>
    <p className="truncate text-xs text-ink-3" title={object.path || ''}>{object.path ? `${object.path}:${object.line || 1} · ` : ''}{typeOf(object)}</p>
    <div className="flex flex-wrap gap-1">
      <Button size="sm" variant="secondary" data-node-open-source disabled={!object.path} title={object.path ? 'Open in Files at this line' : 'An external dependency has no source here'} onClick={() => onOpenSource?.(object.path, object.line || 1, object.line || 1)}>Open source</Button>
      <Button size="sm" data-node-ask onClick={() => askDraft(askQuestion(object))}>Ask about this</Button>
      <Button size="sm" data-node-why onClick={() => askDraft(whyQuestion(object))}>Ask why</Button>
      <Button size="sm" data-node-learn onClick={() => askDraft(`Teach me ${object.label}`)}>Learn this</Button>
      <Button size="sm" data-node-explore title="Show its one-hop connections (or double-click the node)" onClick={() => onExplore(node.id)}><Waypoints size={13} />Explore</Button>
    </div>
    {groups.length > 0 && <div data-node-relationships className="text-sm">
      {groups.map(group => <div key={group.label} data-relation={group.label}>
        <p className="pt-1 text-xs text-ink-3">{group.label}</p>
        {group.items.map(({ node: other, inferred }, i) => <button key={`${other.id}-${i}`} type="button" onClick={() => onSelect(other)} className="flex w-full items-center gap-2 rounded-sm px-1.5 py-0.5 text-left hover:bg-hover">
          <span className="min-w-0 flex-1 truncate">{other.label}</span>{inferred && <span title="Inferred by the indexer, not read from the code" className="text-xs text-ink-3">inferred</span>}
        </button>)}
      </div>)}
    </div>}
  </div>;
}
