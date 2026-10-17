import { Component, useContext, useEffect, useMemo, useState } from 'react';
import { FileCode, Loader2, Maximize2, MessageSquarePlus, Network, Search, X } from 'lucide-react';
import RepositoryGraph from './RepositoryGraph.jsx';
import { Button, IconBtn, Input } from './ui.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';
import { CodeRefs } from './code-refs.js';
import { nodeRef } from './repo-context.js';
import { CARD_NODE_CAP, cardRepository, setCardScope, setCardSelection, subgraph, useCardSelection } from './graph-card.js';
import { insertCodeCard, nodeCodeCard } from './code-card.js';
import { useCardSource } from './use-card-source.js';

// An interactive graph card on the canvas (repo-canvas-graph.md clarification section 4): the indexed graph of one repository
// at one commit, whole or a selected subgraph - the companion Graph's renderer, not a picture. Its node selection is its own
// (section 5): the canvas selects the card by its header and frame, and a press, drag, wheel or key inside the graph stays in
// the graph (RepositoryGraph stops them; the canvas's key handler skips [data-graph-card-body]). Selected nodes are temporary
// chat context (graph-card.js), like the companion's; nothing here sends a message or calls a model.
const short = commit => (commit || '').slice(0, 7);

// main.jsx swaps the whole page for its crash screen on any uncaught error, so a card that throws while drawing (a reply of
// an unexpected shape) shows its own failed state with Retry instead (Home's cards check, case 5).
class GraphCardBoundary extends Component {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('[graph card]', error); }
  render() {
    if (!this.state.failed) return <GraphCardBody key={this.state.attempt} block={this.props.block} />;
    return <div role="status" data-graph-card data-graph-card-state="failed" className="flex flex-1 flex-col items-start gap-2 px-3 pb-3 text-sm text-ink-2">
      <p>The graph could not load.</p>
      <Button size="sm" variant="secondary" data-graph-card-retry onClick={() => this.setState(s => ({ failed: false, attempt: s.attempt + 1 }))}>Retry</Button>
    </div>;
  }
}

export default function GraphCard({ block, selected = false }) {
  // Selected on the canvas, the card's scope rides as chat context until a node inside it is chosen (graph-card.js).
  useEffect(() => { setCardScope(block.id, block, selected); }, [block, selected]);
  useEffect(() => () => setCardScope(block.id, block, false), [block.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <GraphCardBoundary block={block} />;
}

function GraphCardBody({ block }) {
  const source = useCardSource(block), chat = useChatWorkspace(), companion = useContext(CodeRefs);
  const [query, setQuery] = useState('');
  const selected = useCardSelection(block.id);
  const graph = useMemo(() => source.graph && subgraph(source.graph, block.scope === 'subgraph' ? block.nodeIds : null), [source.graph, block.scope, block.nodeIds]);
  const byId = useMemo(() => new Map((graph?.nodes || []).map(n => [n.id, n])), [graph]);
  const nodes = selected.map(id => byId.get(id)).filter(Boolean);
  const pick = next => setCardSelection(block.id, next, block);
  const choose = (node, { toggle = false } = {}) => {
    if (!node) { if (!toggle) pick([]); return; }
    pick(toggle ? (selected.includes(node.id) ? nodes.filter(n => n.id !== node.id) : [...nodes, node]) : [node]);
  };
  useEffect(() => () => setCardSelection(block.id, [], block), [block.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The companion opens this source only on its own repository at this card's revision, never another commit's file.
  const here = !!companion && companion.app === block.repository?.app && companion.commit === block.repository?.commit;
  const one = nodes.length === 1 ? nodes[0] : null;
  const count = `${block.nodeIds?.length} node${block.nodeIds?.length === 1 ? '' : 's'}`;
  const scope = block.scope !== 'subgraph' ? 'Whole graph' : block.view === 'view' ? `Graph view · ${count}` : block.view === 'search' ? `Search matches · ${count}` : `Subgraph · ${count}`;

  return <div data-graph-card className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 pb-3">
    <div className="flex shrink-0 items-center gap-1.5 text-xs text-ink-2">
      <Network size={14} aria-hidden className="shrink-0" />
      <span className="min-w-0 truncate font-medium text-ink" title={block.repository?.repo}>{block.repository?.repo || 'Repository'}</span>
      <span className="shrink-0 font-mono" title={`Commit ${block.repository?.commit}`}>{short(block.repository?.commit)}</span>
      <span data-graph-card-scope={block.scope} className="shrink-0 text-ink-3">· {scope}</span>
      {graph?.nodes.length > CARD_NODE_CAP && <span data-graph-card-limit role="note" className="shrink-0 text-ink-3">· Showing {CARD_NODE_CAP} of {graph.nodes.length} nodes</span>}
      {source.status === 'ready' && source.skipped?.length > 0 && <span className="shrink-0 text-ink-3" title="Files the indexer excluded are not in this graph">· {source.skipped.length} excluded</span>}
    </div>
    {source.status !== 'ready' ? <div role="status" data-graph-card-state={source.stale ? 'stale' : source.status} className="flex flex-1 flex-col items-start gap-2 text-sm text-ink-2">
      {source.status === 'loading' ? <span className="flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" aria-hidden />Loading the graph…</span>
        : source.stale ? <p>This card shows commit {short(block.repository?.commit)}; the repository is now at {short(source.stale)}, so its graph is not loaded.</p>
        : source.status === 'unavailable' ? <p>Repository content unavailable.</p> : <p>The graph could not load.</p>}
      {source.status !== 'loading' && <Button size="sm" variant="secondary" data-graph-card-retry onClick={source.retry}>Retry</Button>}
    </div> : <>
      <label className="relative shrink-0">
        <Search size={13} aria-hidden className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-3" />
        <Input aria-label="Search this graph" placeholder="Search this graph…" value={query} onChange={event => setQuery(event.target.value)} className="w-full pl-7" />
      </label>
      <div data-graph-card-body className="flex min-h-0 flex-1 flex-col">
        {graph.nodes.length ? <RepositoryGraph graph={graph} selectedIds={selected} onSelect={choose} query={query} cap={CARD_NODE_CAP} />
          : <p className="text-sm text-ink-2">No nodes of this graph are in the repository at this commit.</p>}
      </div>
      {nodes.length > 0 && <div data-graph-card-selection className="flex shrink-0 items-center gap-1 text-sm">
        <span className="min-w-0 flex-1 truncate text-ink-2">{one ? one.label : `${nodes.length} selected`}</span>
        <IconBtn data-graph-card-add-to-chat aria-label="Add to chat" title="Keep the selected code with this chat" disabled={!chat}
          onClick={() => nodes.forEach(n => chat.addToChat(nodeRef(cardRepository(block), n)))}><MessageSquarePlus size={14} /></IconBtn>
        <IconBtn data-graph-card-code aria-label="Create code card" title={insertCodeCard ? 'Create a code card from this node' : 'Code cards are not available yet'} disabled={!insertCodeCard || !one?.path || !chat?.canvasOps}
          onClick={() => { const card = nodeCodeCard(block.repository, one); if (card) insertCodeCard(chat.canvasOps, card); }}><FileCode size={14} /></IconBtn>
        <Button size="sm" data-graph-card-open-source disabled={!here || !one?.path || !companion.has(one.path)} title={here ? 'Open in Files at this line' : 'Opens beside Chat on this repository\'s canvas at the same commit'}
          onClick={() => companion.open(one.path, one.line || 1, one.line || 1)}>Open source</Button>
        <IconBtn data-graph-card-clear aria-label="Clear selection" title="Clear selection (Escape)" onClick={() => pick([])}><X size={14} /></IconBtn>
      </div>}
      <Button size="sm" variant="ghost" data-graph-card-expand disabled={!here} className="self-start" title={here ? 'Show these nodes in the Graph beside Chat' : 'Opens on this repository\'s canvas at the same commit'}
        onClick={() => companion.showGraph(selected)}><Maximize2 size={13} />Open in Graph</Button>
    </>}
  </div>;
}
