import { useEffect, useMemo, useState } from 'react';
import { FileCode, GitBranch, Info, Layers, Network, PanelRightClose, PanelRightOpen, RefreshCw } from 'lucide-react';
import { api, navigate } from './api.js';
import { Button, ExpandedPageFrame, IconBtn, Input, Menu, Tabs, TabsContent, TabsList, TabsTrigger, Tip, toast } from './ui.jsx';
import LearnPage from './LearnPage.jsx';
import { CanvasLearn } from './CanvasPage.jsx';
import RepositoryGraph from './RepositoryGraph.jsx';
import RepositorySource from './RepositorySource.jsx';
import ResizableSidePanel from './ResizableSidePanel.jsx';
import { titleOf } from './agent/catalog.js';
import { projectTab } from './routes.js';
import { cardModel } from './home/provenance.js';
import { SourceLink } from './home/Provenance.jsx';
import { getTurns, resultsKey, subscribeTurns } from './agent/bar.js';
import { reviewTools } from './flags.js';
import { fixturesOn, useMapMemory } from './home/review-fixtures.js';
import { fixtureAnswer, layerGraph, MEMORY_KINDS, titleOfRecord, visibleMemory } from './map-memory.js';
import { LayersRow, MemoryEntity, MemorySections, Starters } from './MapMemory.jsx';
import { learnAction } from './agent/learn-hook.js';
import { ResultList } from './agent/ResultSheet.jsx';
import { getSurface, patchSurface } from './agent/surface.js';

export default function RepositoryPage({ app: initial, catalog = [] }) {
  const [app,setApp]=useState(initial),[snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[mode,setMode]=useState('graph'),[query,setQuery]=useState(''),[selected,setSelected]=useState(null),[source,setSource]=useState(null),[asking,setAsking]=useState(null);
  const [graphView,setGraphView]=useState(null),[view,setView]=useState('conversation');
  // The Map's side panel starts closed (owner, 2026-10-04) and opens for what lands in it: a node, a file or an answer.
  const [panelOpen,setPanelOpen]=useState(false),[busy,setBusy]=useState(false),[infoOpen,setInfoOpen]=useState(false),[layersOpen,setLayersOpen]=useState(false);
  // WP6 checkpoint 2: work memory exists only as labelled fixtures (?fixtures=1, karpathy/nanoGPT), filtered to what this viewer may see.
  const fixtures=reviewTools&&fixturesOn(localStorage,window.location.search,reviewTools),stored=useMapMemory(fixtures,app.repo),viewer=getSurface().email||null;
  const memory=useMemo(()=>stored&&visibleMemory(stored,viewer),[stored,viewer]),[layers,setLayers]=useState(()=>new Set());
  const shown=useMemo(()=>snapshot&&(memory&&layers.size?layerGraph(snapshot.graph,memory,layers):snapshot.graph),[snapshot,memory,layers]);
  const toggleLayer=key=>setLayers(previous=>{const next=new Set(previous);if(next.has(key))next.delete(key);else next.add(key);return next;});
  // An exact fixture prompt (map-memory.js) is answered here, labelled, with no request; anything else goes to the model.
  const answerLocally=(text,scope)=>memory&&snapshot&&scope.kind==='project'&&scope.slug===app.name?fixtureAnswer(text,{node:scope.selected&&snapshot.graph.nodes.find(n=>n.id===scope.selected.id)||null,memory,graph:snapshot.graph}):null;
  const showGraph=value=>{setGraphView({...value,requestId:crypto.randomUUID()});setMode('graph');if(projectTab(window.location.search)!=='map')navigate(`/apps/${app.name}?tab=map`);};
  const onGraph=(value,{auto=false}={})=>{if(auto&&projectTab(window.location.search)!=='map')return;showGraph(value);}; // only an explicit Show on graph leaves Learn for the Map
  // Learn is the default; a repository with no snapshot yet has nothing to learn from, so it shows its Map.
  const asked=projectTab(window.location.search),tab=asked==='learn'&&!app.commit_sha?'map':asked,go=t=>navigate(`/apps/${app.name}?tab=${t}`);
  // ...and says so in its URL, so the shell (sidebar, bar) treats it as the Map too.
  useEffect(()=>{if(tab!==asked){window.history.replaceState(null,'',`/apps/${app.name}?tab=map`);window.dispatchEvent(new PopStateEvent('popstate'));}},[tab,asked,app.name]);
  const canvases=catalog.filter(c=>c.kind==='canvas'&&c.project===app.name),picked=tab==='learn'&&canvases.find(c=>c.name===new URLSearchParams(window.location.search).get('canvas')); // LibraryViews.jsx's filter. ponytail: an unknown ?canvas= falls back to the Project canvas
  const root=`/api/repositories/${app.name}`;
  useEffect(()=>{
    let active=true,timer;
    const load=async()=>{try{const next=await api(root);if(!active)return;setApp(next);if(['queued','indexing'].includes(next.status))timer=setTimeout(load,2500);}catch(e){if(active)setError(e.message);}};
    load();return()=>{active=false;clearTimeout(timer);};
  },[root,app.status]);
  useEffect(()=>{if(!app.commit_sha)return;let active=true;api(`${root}/snapshot`).then(d=>{if(active){setSnapshot(d);setSelected(null);setSource(null);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[root,app.commit_sha]);
  // The Agent Bar asks about this project and the selected node (T02 §6.2). Root resets the surface on every
  // URL change, so this re-runs on the path. Learn keeps Root's hidden baseline and gets no onGraph: a late
  // Map answer must not navigate the reader out of Learn.
  const path=window.location.pathname+window.location.search;
  useEffect(()=>{if(tab!=='learn')patchSurface({...(tab==='map'?{resultsHost:'panel'}:{}),resource:{kind:'project',slug:app.name,title:titleOf(app),status:app.status},selected:tab==='map'&&asking?{id:asking.id,label:asking.label,commit:asking.commit||snapshot?.commit}:null,handlers:{onGraph,answerLocally}});},[path,app.name,app.repo,app.status,asking,snapshot?.commit,memory]);
  const key=resultsKey({org:getSurface().org,kind:'project',slug:app.name}); // the bar's results key for this project, selection excluded
  const [talked,setTalked]=useState(()=>getTurns(key).length>0);
  // An answer opens the panel (it is where Map answers land) and keeps it outlined while it streams.
  useEffect(()=>subscribeTurns(({key:k,pushed})=>{if(k!==key)return;const turns=getTurns(key);setTalked(turns.length>0);setBusy(turns.some(t=>t.kind==='answer'&&!t.done));if(pushed){setView('conversation');setPanelOpen(true);}}),[key]); // ResultSheet.jsx:11-13
  const inUse=panelOpen&&(!!selected||!!source||busy); // outlined while it holds a node, a file or a streaming answer
  const tabs=<Tabs value={tab} onValueChange={go}><TabsList pill data-project-tabs className="mb-4">
    <TabsTrigger pill value="map"><Tip label="Map" info="Code graph of this repository"><span>Map</span></Tip></TabsTrigger>
    <TabsTrigger pill value="learn" disabled={!app.commit_sha}><Tip label="Learn" info="Guided lessons built from this repository"><span>Learn</span></Tip></TabsTrigger>
  </TabsList></Tabs>;
  if(tab==='learn')return <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:pt-(--shell-top-h)">{/* LearnPage brings its own <main>, which loses index.css's [data-shell-sidebar] ~ main phone padding */}
    {canvases.length>0&&<div className="flex shrink-0 flex-wrap items-center gap-x-3 pt-3 pr-8 pl-14 max-md:px-4">
      {/* a native select: ui.jsx's Select is string-only and would collide on duplicate canvas titles */}
      <select aria-label="Canvas" value={picked?.name||''} onChange={e=>navigate(`/apps/${app.name}?tab=learn${e.target.value?`&canvas=${e.target.value}`:''}`)} className="mb-4 h-8 rounded-sm border border-line bg-transparent px-2 text-xs"><option value="">Project canvas</option>{canvases.map(c=><option key={c.name} value={c.name}>{c.title}</option>)}</select>
    </div>}
    {picked?<CanvasLearn key={picked.name} app={picked} project={app} onMap={()=>go('map')}/>:<LearnPage app={app} onGraph={showGraph} onMap={()=>go('map')} onClearRepository={asking?()=>setAsking(null):null} repositoryContext={asking ? {nodeId:asking.id,label:asking.label,commit:snapshot?.commit} : {commit:app.commit_sha}} onBack={()=>{setMode('graph');navigate(`/apps/${app.name}?tab=code`);}}/>}
  </div>;
  // A fixture record is only looked at: the bar keeps asking about code, so no fixture id ever reaches the model.
  const pick=id=>{const r=memory&&[...memory.decisions,...memory.questions,...memory.sessions].find(x=>x.id===id);if(r){setSelected({id:r.id,label:titleOfRecord(r),kind:MEMORY_KINDS.find(k=>memory[`${k}s`].includes(r)),record:r});setView('selected');setPanelOpen(true);}};
  const choose=node=>{if(node&&MEMORY_KINDS.includes(node.kind)){pick(node.id);return;}if(node)setPanelOpen(true);setSelected(node);setAsking(node);setView(node?'selected':'conversation');if(!node)return;if(node.path)setSource({path:node.path,line:node.line,commit:node.commit});else setSource(null);};
  const relationships=selected&&snapshot&&!selected.record?snapshot.graph.edges.filter(e=>e.source===selected.id||e.target===selected.id):[];
  return <main className="flex min-w-0 flex-1 overflow-hidden max-lg:flex-col">
    <section className="min-w-0 flex-1 overflow-auto"><ExpandedPageFrame wide>
      <div className="flex items-start gap-2"><h1 className="min-w-0 flex-1 truncate pb-2 text-2xl font-semibold">{app.repo}</h1>
        {!panelOpen&&<IconBtn data-map-panel-open aria-label="Open the side panel" title="Open the side panel" onClick={()=>setPanelOpen(true)}><PanelRightOpen size={16}/></IconBtn>}</div>
      <div className="flex items-center gap-2">{tabs}
        {/* Repository details live behind one icon (owner, 2026-10-04): source, branch, commit, status, refresh. */}
        <div className="relative mb-4"><IconBtn data-repo-info aria-label="Repository details" title="Repository details" aria-expanded={infoOpen} onClick={()=>setInfoOpen(open=>!open)}><Info size={16}/></IconBtn>
          <Menu open={infoOpen} onClose={()=>setInfoOpen(false)} className="top-full left-0 mt-1 w-72 p-3">
            <div data-repo-details className="flex flex-col items-start gap-2 text-xs text-ink-2"><SourceLink m={cardModel(app)}/><span className="flex items-center gap-1.5"><GitBranch size={14}/>{app.branch}</span><span>Commit {app.commit_sha?.slice(0,7)||'awaiting snapshot'}</span><span>Status: {app.status}</span>{app.canEdit&&<Button size="sm" disabled={['queued','indexing'].includes(app.status)} onClick={async()=>{try{setError('');await api(`${root}/refresh`,{method:'POST',body:'{}'});setApp(await api(root));}catch(e){setError(e.message);}}}><RefreshCw size={13}/> {app.status==='failed'?'Retry import':'Refresh branch'}</Button>}</div>
          </Menu></div></div>
      {['queued','indexing'].includes(app.status)&&<div role="status" className="mb-4 rounded-lg border border-line p-4 text-sm"><div className="mb-2 h-1 overflow-hidden rounded bg-hover"><div className="h-full w-1/2 animate-pulse bg-accent"/></div>{app.status==='queued'?'Waiting for the indexer…':'Downloading source and building the code graph…'}{app.commit_sha&&' The previous snapshot remains available.'}</div>}
      {(error||app.error)&&<p role="alert" className="mb-4 text-sm text-danger">{error||app.error}</p>}
      {tab==='map'&&snapshot&&<>
        <div className="mb-3 flex items-center gap-2">{[['files',FileCode,'Files'],['graph',Network,'Graph']].map(([value,Icon,label])=><Button key={value} aria-pressed={mode===value} variant={mode===value?'primary':'secondary'} onClick={()=>setMode(value)}><Icon size={15}/>{label}</Button>)}{mode==='graph'&&<div className="relative"><IconBtn data-map-layers-open aria-label="Layers" title="Layers: Code, Decisions, Questions, Sessions" aria-expanded={layersOpen} onClick={()=>setLayersOpen(open=>!open)}><Layers size={16}/></IconBtn>
          <Menu open={layersOpen} onClose={()=>setLayersOpen(false)} className="top-full left-0 mt-1 w-auto min-w-60 p-2"><LayersRow memory={memory} layers={layers} onToggle={toggleLayer}/></Menu></div>}
        <Input aria-label="Search repository" placeholder={mode==='graph'?'Find a symbol or file…':'Find a file…'} value={query} onChange={e=>setQuery(e.target.value)} className="ml-auto w-64"/></div>
        <div className="flex h-[540px] min-h-0 flex-col max-lg:min-h-80">{mode==='graph'?<RepositoryGraph graph={shown} selected={selected} onSelect={choose} query={query} answerView={graphView}/>:<div className="overflow-auto rounded-lg border border-line">{snapshot.files.filter(f=>f.path.toLowerCase().includes(query.toLowerCase())).map(f=><button key={f.path} className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-sm hover:bg-hover" onClick={()=>{setSource({path:f.path,line:1});setSelected(null);setAsking(null);setView('source');setPanelOpen(true);}}><FileCode size={14}/><span className="flex-1 font-mono text-xs">{f.path}</span><span className="text-xs text-ink-3">{f.lines} lines</span></button>)}</div>}</div>
        <p className="mt-3 text-xs text-ink-2">{snapshot.files.length} files · {snapshot.graph.nodes.length} nodes · {snapshot.graph.edges.length} relationships</p>
        {!!snapshot.skipped.length&&<details className="mt-2 text-xs text-ink-2"><summary className="cursor-pointer">{snapshot.skipped.length} excluded files</summary><div className="max-h-40 overflow-auto">{snapshot.skipped.map(f=><p key={f.path}>{f.path}: {f.reason}</p>)}</div></details>}
      </>}
    </ExpandedPageFrame></section>
    {/* One input: questions go through the Agent Bar; while the Map is open, this project's answers land here (T02 §6.5). Never gated on
        snapshot: a hidden panel would mean invisible answers. Checkpoint 2: Why | Questions | Sessions are sections of Selected (MapMemory.jsx). ponytail: no phone bottom
        drawer (§6.5) - below lg the panel stacks at 45% (ResizableSidePanel.jsx). */}
    {tab==='map'&&<ResizableSidePanel data-map-panel data-in-use={inUse||undefined} aria-label="Context" resizeLabel="Resize repository panel" defaultWidth={420} collapsed={!panelOpen} className={inUse?'p-5 ring-2 ring-accent ring-inset':'p-5'}>
      <IconBtn data-map-panel-close aria-label="Close the side panel" title="Close the side panel" onClick={()=>setPanelOpen(false)} className="absolute top-3 right-3 z-10"><PanelRightClose size={16}/></IconBtn>
      <Tabs value={view==='selected'&&!selected||view==='source'&&!source?'conversation':view} onValueChange={setView} className="flex min-h-0 flex-1 flex-col">
        {/* Tabs only when there is more than the conversation to switch to (owner, 2026-10-04). */}
        {(selected||source)&&<TabsList pill className="mb-3 shrink-0 self-start">{selected&&<TabsTrigger pill value="selected">Selected</TabsTrigger>}<TabsTrigger pill value="conversation">Conversation</TabsTrigger>{source&&<TabsTrigger pill value="source">Source</TabsTrigger>}</TabsList>}
        <TabsContent value="selected" className="min-h-0 flex-1 overflow-y-auto">{selected?.record&&<MemoryEntity node={selected} memory={memory} graph={snapshot.graph} onPick={pick} onCode={choose}/>}{selected&&!selected.record&&<div data-map-selected><strong className="text-sm">{selected.label}</strong>{selected.path&&<p className="font-mono text-xs text-ink-2">{selected.path}{selected.line?`:${selected.line}`:''}</p>}
          <MemorySections node={selected} memory={memory} onPick={pick}/>
          {/* ponytail: one relationships list with each edge's confidence; the solid/dashed split comes with checkpoint 2's layers */}
          <details className="mt-2 text-xs"><summary className="cursor-pointer">{relationships.length} relationships</summary><div className="max-h-64 overflow-auto">{relationships.map((e,i)=><p className="py-1" key={i}>{e.relation} → {snapshot.graph.nodes.find(n=>n.id===(e.source===selected.id?e.target:e.source))?.label||e.target} <span className="text-ink-3">({e.confidence||'unknown'})</span></p>)}</div></details>
          {/* One typed action with /teach (learn-hook.js); learnAction reads no ctx when the app is given, so commands.js stays out of
              this statically imported page. ponytail: while learnHandoff is off (flags.js) it only opens this project's Learn and the node
              travels as repositoryContext; the fallback line is for a typed prompt, so a click shows none. */}
          <Button size="sm" variant="secondary" className="mt-3" onClick={()=>learnAction('teach',{app:app.name,prompt:`Teach me ${selected.label}`},{}).then(r=>{if(r.status!=='fallback'&&r.message)toast(r.message);})}>Learn this</Button></div>}</TabsContent>
        <TabsContent value="conversation" className="min-h-0 flex-1 overflow-y-auto"><p className="pb-2 text-xs text-ink-3">Answers from the bar below land here.</p>{!talked&&<Starters/>}<ResultList scopeKey={key} onFile={(path,line)=>{setSource({path,line:line||1});setSelected(null);setAsking(null);setView('source');setPanelOpen(true);}}/></TabsContent>
        <TabsContent value="source" className="flex min-h-0 flex-1 flex-col">{source&&<RepositorySource appName={app.name} {...source} commit={source.commit||snapshot?.commit} onClose={()=>setSource(null)}/>}</TabsContent>
      </Tabs>
    </ResizableSidePanel>}
  </main>;
}
