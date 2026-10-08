import { useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowUpRight, Box, Braces, ChevronRight, FileCode, Package, PanelRightClose, TextQuote } from 'lucide-react';
import { api } from './api.js';
import { Button, IconBtn, Pill, Tabs, TabsContent, TabsList, TabsTrigger } from './ui.jsx';
import RepositorySource from './RepositorySource.jsx';
import { repositoryUrl } from './card-sources.js';
import { getTurns, subscribeTurns } from './agent/bar.js';
import { Turn } from './agent/ResultSheet.jsx';
import { memoryFor } from './map-memory.js';
import { askBar, FIXTURE, MemoryEntity, Starters } from './MapMemory.jsx';
import { relationshipGroups, symbolsIn, turnsAbout, typeOf } from './inspector.js';
import { rangeTitle } from './agent/scope.js';

// The Map's learning inspector (owner, 2026-10-06, docs/features/inspector.md): a sticky object header, Overview | Source,
// then Purpose, Why it matters, Relationships, Conversation and two actions. Canonical data only: a field nothing stores
// shows its one-line "not yet" with an ask, never a guess.
const ICONS = { file: FileCode, symbol: Braces, external: Package, range: TextQuote };
const HEAD = 'text-xs font-medium text-ink-2';
const ROW = 'flex w-full cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-left text-sm hover:bg-hover';
const LINK = 'cursor-pointer text-accent hover:underline';
const FOLD = 'group flex cursor-pointer list-none items-center gap-2 rounded-sm py-2 focus-visible:outline-2 focus-visible:outline-accent/35 [&::-webkit-details-marker]:hidden';
const TAB = 'data-[state=active]:border-accent';

function Empty({ text, action, onAction }) {
  return <p className="text-sm text-ink-3">{text} <button type="button" onClick={onAction} className={LINK}>{action} →</button></p>;
}

// A folding section: title, a quiet count and a chevron; closed by default so the inspector stays short.
function Fold({ name, title, count, children }) {
  return <details data-inspector-section={name} className="border-t border-line">
    <summary className={FOLD}><span className={HEAD}>{title}</span><span className="ml-auto text-xs text-ink-3">{count}</span><ChevronRight size={14} className="text-ink-3 transition-transform group-open:rotate-90 motion-reduce:transition-none" /></summary>
    <div className="pb-3">{children}</div>
  </details>;
}

// 3-8 lines at the object's own line, read from the pinned commit like the Source tab (inspector brief §14).
function Preview({ app, path, line, commit }) {
  const [lines, setLines] = useState(null);
  useEffect(() => {
    let live = true; setLines(null);
    api(`/api/repositories/${app}/file`, { method: 'POST', body: JSON.stringify({ path, commit }) }).then((d) => { if (live) setLines(d.content.split('\n').slice(line - 1, line + 7)); }).catch(() => {});
    return () => { live = false; };
  }, [app, path, line, commit]);
  if (!lines?.length) return null;
  return <pre data-inspector-preview className="mb-3 overflow-hidden rounded-md bg-code px-3 py-2 font-mono text-[11.5px] leading-5 text-ink-2">{lines.map((text, i) => <div key={i} className="flex gap-3 whitespace-pre"><span className="w-6 shrink-0 text-right text-ink-3 select-none">{line + i}</span><span className="overflow-hidden text-ellipsis whitespace-pre">{text || ' '}</span></div>)}</pre>;
}

// `codeInView`: the main pane (the Files reader) is showing this object's file, so the inspector does not repeat its code -
// no preview and no Source tab (owner, 2026-10-08: "we see the code file in the main window but we also see it in the right
// window"). A node picked in the graph, or a file the reader is not showing, keeps both.
export default function MapInspector({ app, snapshot, memory, object, inContext, view, onView, onSelect, onPick, onBack, backLabel, onClose, onAsk, onWhy, onLearn, conversationKey, codeInView = false }) {
  const turns = useSyncExternalStore(subscribeTurns, () => getTurns(conversationKey));
  const close = <IconBtn data-map-panel-close aria-label="Close the inspector" title="Close the inspector" onClick={onClose}><PanelRightClose size={16} /></IconBtn>;
  if (!object) return <>
    <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3"><h2 className="min-w-0 flex-1 text-[15px] font-semibold">Inspector</h2>{close}</header>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4"><p className="pb-4 text-sm text-ink-3">Select a file or a symbol to see what it is and how it connects.</p><Starters /></div>
  </>;
  const record = object.record, graph = snapshot.graph, Icon = ICONS[object.kind] || Box;
  const file = object.path, source = !record && !!file, tabs = source && !codeInView;
  // A line range from the code reader (repository-browser.md): titled model.py:115–122, its whole range in the link and the
  // Source tab; it has no graph node, so no relationships are shown for it, never its file's.
  const range = object.kind === 'range', title = range ? rangeTitle(object) : object.label;
  const href = source && repositoryUrl({ repo: app.repo, commit: snapshot.commit, path: file, line: object.kind === 'file' ? null : object.line, lineEnd: object.end });
  const crumbs = [app.repo, file, object.kind !== 'file' && file ? object.label : null].filter(Boolean);
  const groups = record ? [] : relationshipGroups(graph, object.nodeId), linked = groups.reduce((n, g) => n + g.items.length, 0);
  const symbols = object.kind === 'file' ? symbolsIn(graph, file) : [];
  const about = turnsAbout(turns, object.id), mine = memory && object.nodeId ? memoryFor(memory, object.nodeId) : null;
  const header = <header data-inspector-header className={`shrink-0 px-4 pt-3 ${tabs ? '' : 'border-b border-line pb-3'}`}>
    <div className="flex items-center gap-1.5">
      {onBack && <IconBtn data-inspector-back aria-label="Back" title={`Back to ${backLabel}`} onClick={onBack} className="-ml-1.5"><ArrowLeft size={15} /></IconBtn>}
      <Icon size={16} strokeWidth={1.75} className="shrink-0 text-ink-2" aria-hidden="true" />
      <h2 data-inspector-title className="min-w-0 flex-1 truncate text-[15px] font-semibold" title={title}>{title}</h2>
      {href && <a data-inspector-open-source href={href} target="_blank" rel="noreferrer" title="Open this source on GitHub at the indexed commit" className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-ink-2 hover:bg-hover hover:text-ink">Open source<ArrowUpRight size={13} /></a>}
      {close}
    </div>
    {!record && <p data-inspector-crumb className="truncate pt-0.5 text-xs text-ink-2" title={crumbs.join(' › ')}>{crumbs.join(' › ')}</p>}
    <p className="flex items-center gap-1.5 pt-0.5 text-xs text-ink-3">
      {file && <span className="truncate font-mono">{file}:{range && object.end > object.start ? `${object.start}–${object.end}` : object.line || 1}</span>}{file && <span aria-hidden="true">·</span>}<span className="shrink-0">{record ? 'Fixture record' : range ? `${object.end - object.start + 1} selected line${object.end > object.start ? 's' : ''}` : typeOf(object)}</span>
      {inContext && <span data-in-context title="The composer below asks about this" className="ml-auto inline-flex shrink-0 items-center gap-1 text-ink-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" />In context</span>}
    </p>
    {tabs && <TabsList className="-mx-4 mt-2 px-4"><TabsTrigger value="overview" className={TAB}>Overview</TabsTrigger><TabsTrigger value="source" className={TAB}>Source</TabsTrigger></TabsList>}
  </header>;
  const overview = record ? <MemoryEntity node={object} memory={memory} graph={graph} onPick={onPick} onCode={onSelect} /> : <>
    {file && !codeInView && <Preview app={app.name} path={file} line={object.line || 1} commit={snapshot.commit} />}
    <section data-inspector-section="purpose" className="pb-3"><h3 className={`${HEAD} pb-1`}>Purpose</h3><Empty text="No summary yet." action="Ask about this" onAction={onAsk} /></section>
    <section data-inspector-section="why" className="pb-3"><h3 className={`${HEAD} pb-1`}>Why it matters</h3>
      {mine?.decisions.length ? <><Pill className="mb-1">{FIXTURE}</Pill>{mine.decisions.map((d) => <button key={d.id} type="button" className={ROW} onClick={() => onPick(d.id)}>{d.title}</button>)}</> : <Empty text="No explanation yet." action="Ask why" onAction={onWhy} />}
    </section>
    {symbols.length > 0 && <Fold name="symbols" title="Symbols" count={symbols.length}>{symbols.map((n) => <button key={n.id} type="button" className={ROW} onClick={() => onSelect(n)}><span className="min-w-0 flex-1 truncate">{n.label}</span><span className="text-xs text-ink-3">:{n.line}</span></button>)}</Fold>}
    {linked > 0 && <Fold name="relationships" title="Relationships" count={linked}>{groups.map((g) => <div key={g.label} data-relation={g.label}>
      <p className="px-1.5 pt-1.5 pb-0.5 text-xs text-ink-3">{g.label}</p>
      {g.items.map(({ node, inferred }, i) => <button key={`${node.id}-${i}`} type="button" className={ROW} onClick={() => onSelect(node)}><span className="min-w-0 flex-1 truncate">{node.label}</span>{inferred && <span title="Inferred by the indexer, not read from the code" className="text-xs text-ink-3">inferred</span>}</button>)}
    </div>)}</Fold>}
    {about.length || mine?.questions.length || mine?.sessions.length
      ? <Fold name="conversation" title="Conversation" count={about.length ? `${about.length} message${about.length === 1 ? '' : 's'}` : ''}>
        <div className="flex flex-col gap-2">{about.map((t) => <Turn key={t.id} t={t} />)}</div>
        {!!(mine?.questions.length || mine?.sessions.length) && <div className="pt-2"><Pill className="mb-1">{FIXTURE}</Pill>
          {mine.questions.map((q) => <button key={q.id} type="button" className={ROW} onClick={() => askBar(q.question)}>{q.question}</button>)}
          {mine.sessions.map((s) => <button key={s.id} type="button" className={ROW} onClick={() => onPick(s.id)}>{s.title} <span className="text-xs text-ink-3">{s.at}</span></button>)}</div>}
      </Fold>
      : <section data-inspector-section="conversation" className="flex items-center gap-2 border-t border-line py-2"><h3 className={HEAD}>Conversation</h3><button type="button" onClick={onAsk} className={`ml-auto text-sm ${LINK}`}>Ask about {object.label} →</button></section>}
  </>;
  return <Tabs value={tabs ? view : 'overview'} onValueChange={onView} className="flex min-h-0 flex-1 flex-col">
    {header}
    <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-2">{overview}</TabsContent>
    {tabs && <TabsContent value="source" className="flex min-h-0 flex-1 flex-col px-4 pt-2"><RepositorySource appName={app.name} path={file} line={object.line || 1} lineEnd={object.end} commit={snapshot.commit} repo={app.repo} /></TabsContent>}
    {/* Two actions, one of them primary (inspector brief §11-12); the Tutor picks the pedagogy once the learner says what they want. */}
    {!record && <footer data-inspector-actions className="flex shrink-0 gap-2 border-t border-line px-4 py-3">
      <Button size="sm" variant="secondary" onClick={onAsk}>Ask about this</Button>
      <Button size="sm" variant="primary" onClick={onLearn}>Learn this</Button>
    </footer>}
  </Tabs>;
}
