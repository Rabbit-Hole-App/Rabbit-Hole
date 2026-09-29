import { useEffect, useState } from 'react';
import { FileCode, GitBranch, Network, RefreshCw } from 'lucide-react';
import { api, navigate } from './api.js';
import { Button, ExpandedPageFrame, Input, Tabs, TabsContent, TabsList, TabsTrigger, Tip } from './ui.jsx';
import LearnPage from './LearnPage.jsx';
import { CanvasLearn } from './CanvasPage.jsx';
import RepositoryGraph from './RepositoryGraph.jsx';
import RepositorySource from './RepositorySource.jsx';
import ResizableSidePanel from './ResizableSidePanel.jsx';
import { titleOf } from './agent/catalog.js';
import { projectTab } from './routes.js';
import { resultsKey, subscribeTurns } from './agent/bar.js';
import { ResultList } from './agent/ResultSheet.jsx';
import { getSurface, patchSurface } from './agent/surface.js';

export default function RepositoryPage({ app: initial, catalog = [] }) {
  const [app,setApp]=useState(initial),[snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[mode,setMode]=useState('graph'),[query,setQuery]=useState(''),[selected,setSelected]=useState(null),[source,setSource]=useState(null),[asking,setAsking]=useState(null);
  const [graphView,setGraphView]=useState(null),[view,setView]=useState('conversation');
  const showGraph=value=>{setGraphView({...value,requestId:crypto.randomUUID()});setMode('graph');if(new URLSearchParams(window.location.search).get('tab')==='learn')navigate(`/apps/${app.name}?tab=code`);};
  const tab=projectTab(window.location.search),go=t=>navigate(`/apps/${app.name}${t==='overview'?'':`?tab=${t}`}`);
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
  useEffect(()=>{if(tab!=='learn')patchSurface({...(tab==='map'?{resultsHost:'panel'}:{}),resource:{kind:'project',slug:app.name,title:titleOf(app),status:app.status},selected:asking?{id:asking.id,label:asking.label,commit:asking.commit||snapshot?.commit}:null,handlers:{onGraph:showGraph}});},[path,app.name,app.repo,app.status,asking,snapshot?.commit]);
  const key=resultsKey({org:getSurface().org,kind:'project',slug:app.name}); // the bar's results key for this project, selection excluded
  useEffect(()=>subscribeTurns(({key:k,pushed})=>{if(pushed&&k===key)setView('conversation');}),[key]); // ResultSheet.jsx:11-13
  const tabs=<Tabs value={tab} onValueChange={go}><TabsList pill data-project-tabs className="mb-4">
    <TabsTrigger pill value="overview">Overview</TabsTrigger>
    <TabsTrigger pill value="learn" disabled={!app.commit_sha}><Tip label="Learn" info="Guided lessons built from this repository"><span>Learn</span></Tip></TabsTrigger>
    <TabsTrigger pill value="map"><Tip label="Map" info="Code graph of this repository"><span>Map</span></Tip></TabsTrigger>
  </TabsList></Tabs>;
  if(tab==='learn')return <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:pt-(--shell-top-h)">{/* LearnPage brings its own <main>, which loses index.css's [data-shell-sidebar] ~ main phone padding */}
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 px-8 pt-3 max-md:px-4"><span className="mb-4 text-sm font-semibold">{app.repo}</span>{tabs}
      {/* a native select: ui.jsx's Select is string-only and would collide on duplicate canvas titles */}
      {canvases.length>0&&<select aria-label="Canvas" value={picked?.name||''} onChange={e=>navigate(`/apps/${app.name}?tab=learn${e.target.value?`&canvas=${e.target.value}`:''}`)} className="mb-4 h-8 rounded-sm border border-line bg-transparent px-2 text-xs"><option value="">Project canvas</option>{canvases.map(c=><option key={c.name} value={c.name}>{c.title}</option>)}</select>}
    </div>
    {picked?<CanvasLearn key={picked.name} app={picked} project={app}/>:<LearnPage app={app} onGraph={showGraph} repositoryContext={asking ? {nodeId:asking.id,label:asking.label,commit:snapshot?.commit} : {commit:app.commit_sha}} onBack={()=>{setMode('graph');navigate(`/apps/${app.name}?tab=code`);}}/>}
  </div>;
  const choose=node=>{setSelected(node);setAsking(node);setView(node?'selected':'conversation');if(!node)return;if(node.path)setSource({path:node.path,line:node.line,commit:node.commit});else setSource(null);};
  const relationships=selected&&snapshot?snapshot.graph.edges.filter(e=>e.source===selected.id||e.target===selected.id):[];
  return <main className="flex min-w-0 flex-1 overflow-hidden max-lg:flex-col">
    <section className="min-w-0 flex-1 overflow-auto"><ExpandedPageFrame wide>
      <h1 className="pb-2 text-2xl font-semibold">{app.repo}</h1>{tabs}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-2"><GitBranch size={14}/>{app.branch}<span>· {app.commit_sha?.slice(0,7)||'Awaiting snapshot'}</span><span>· {app.status}</span>{tab==='map'&&app.canEdit&&<Button size="sm" disabled={['queued','indexing'].includes(app.status)} onClick={async()=>{try{setError('');await api(`${root}/refresh`,{method:'POST',body:'{}'});setApp(await api(root));}catch(e){setError(e.message);}}}><RefreshCw size={13}/> {app.status==='failed'?'Retry import':'Refresh branch'}</Button>}</div>
      {['queued','indexing'].includes(app.status)&&<div role="status" className="mb-4 rounded-lg border border-line p-4 text-sm"><div className="mb-2 h-1 overflow-hidden rounded bg-hover"><div className="h-full w-1/2 animate-pulse bg-accent"/></div>{app.status==='queued'?'Waiting for the indexer…':'Downloading source and building the code graph…'}{app.commit_sha&&' The previous snapshot remains available.'}</div>}
      {(error||app.error)&&<p role="alert" className="mb-4 text-sm text-danger">{error||app.error}</p>}
      {tab==='map'&&snapshot&&<>
        <div className="mb-3 flex items-center gap-2">{[['files',FileCode,'Files'],['graph',Network,'Graph']].map(([value,Icon,label])=><Button key={value} aria-pressed={mode===value} variant={mode===value?'primary':'secondary'} onClick={()=>setMode(value)}><Icon size={15}/>{label}</Button>)}<Input aria-label="Search repository" placeholder={mode==='graph'?'Find a symbol or file…':'Find a file…'} value={query} onChange={e=>setQuery(e.target.value)} className="ml-auto w-64"/></div>
        <div className="flex h-[540px] min-h-0 flex-col">{mode==='graph'?<RepositoryGraph graph={snapshot.graph} selected={selected} onSelect={choose} query={query} answerView={graphView}/>:<div className="overflow-auto rounded-lg border border-line">{snapshot.files.filter(f=>f.path.toLowerCase().includes(query.toLowerCase())).map(f=><button key={f.path} className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-sm hover:bg-hover" onClick={()=>{setSource({path:f.path,line:1});setSelected(null);setAsking(null);setView('source');}}><FileCode size={14}/><span className="flex-1 font-mono text-xs">{f.path}</span><span className="text-xs text-ink-3">{f.lines} lines</span></button>)}</div>}</div>
        <p className="mt-3 text-xs text-ink-2">{snapshot.files.length} files · {snapshot.graph.nodes.length} nodes · {snapshot.graph.edges.length} relationships</p>
        {!!snapshot.skipped.length&&<details className="mt-2 text-xs text-ink-2"><summary className="cursor-pointer">{snapshot.skipped.length} excluded files</summary><div className="max-h-40 overflow-auto">{snapshot.skipped.map(f=><p key={f.path}>{f.path}: {f.reason}</p>)}</div></details>}
      </>}
    </ExpandedPageFrame></section>
    {/* One input: questions go through the Agent Bar; while the Map is open, this project's answers land here (T02 §6.5). Never gated on
        snapshot: a hidden panel would mean invisible answers. Checkpoint 2 adds Why | Questions | Sessions tabs. ponytail: no phone bottom
        drawer (§6.5) - below lg the panel stacks at 45% (ResizableSidePanel.jsx). */}
    {tab==='map'&&<ResizableSidePanel data-map-panel aria-label="Context" resizeLabel="Resize repository panel" defaultWidth={420} className="p-5">
      <Tabs value={view==='selected'&&!selected||view==='source'&&!source?'conversation':view} onValueChange={setView} className="flex min-h-0 flex-1 flex-col">
        <TabsList pill className="mb-3 shrink-0"><TabsTrigger pill value="selected" disabled={!selected}>Selected</TabsTrigger><TabsTrigger pill value="conversation">Conversation</TabsTrigger><TabsTrigger pill value="source" disabled={!source}>Source</TabsTrigger></TabsList>
        <TabsContent value="selected" className="min-h-0 flex-1 overflow-y-auto">{selected&&<div data-map-selected><strong className="text-sm">{selected.label}</strong>{selected.path&&<p className="font-mono text-xs text-ink-2">{selected.path}{selected.line?`:${selected.line}`:''}</p>}
          {/* ponytail: one relationships list with each edge's confidence; the solid/dashed split comes with checkpoint 2's layers */}
          <details className="mt-2 text-xs"><summary className="cursor-pointer">{relationships.length} relationships</summary><div className="max-h-64 overflow-auto">{relationships.map((e,i)=><p className="py-1" key={i}>{e.relation} → {snapshot.graph.nodes.find(n=>n.id===(e.source===selected.id?e.target:e.source))?.label||e.target} <span className="text-ink-3">({e.confidence||'unknown'})</span></p>)}</div></details></div>}</TabsContent>
        <TabsContent value="conversation" className="min-h-0 flex-1 overflow-y-auto"><p className="pb-2 text-xs text-ink-3">Answers from the bar below land here.</p><ResultList scopeKey={key}/></TabsContent>
        <TabsContent value="source" className="flex min-h-0 flex-1 flex-col">{source&&<RepositorySource appName={app.name} {...source} commit={source.commit||snapshot?.commit} onClose={()=>setSource(null)}/>}</TabsContent>
      </Tabs>
    </ResizableSidePanel>}
  </main>;
}
