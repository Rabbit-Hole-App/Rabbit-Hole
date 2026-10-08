import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, GitBranch, Info, Layers, PanelRightOpen, Plus, RefreshCw, Search, Shapes } from 'lucide-react';
import { api, navigate } from './api.js';
import { Button, ConfirmDialog, ExpandedPageFrame, IconBtn, Input, Menu, MenuItem, Tabs, TabsList, TabsTrigger, toast } from './ui.jsx';
import { deviceId } from './home/canvas-local.js';
import { canvasHref, newCanvasTitle, projectCanvases } from './project-canvases.js';
import LearnPage from './LearnPage.jsx';
import { CodeRefs } from './code-refs.js';
import { CanvasLearn } from './CanvasPage.jsx';
import RepositoryGraph from './RepositoryGraph.jsx';
import CodeReader from './CodeReader.jsx';
import ResizableSidePanel from './ResizableSidePanel.jsx';
import { titleOf } from './agent/catalog.js';
import { projectTab } from './routes.js';
import { cardModel } from './home/provenance.js';
import { SourceLink } from './home/Provenance.jsx';
import { resultsKey } from './agent/bar.js';
import { reviewTools } from './flags.js';
import { fixturesOn, useMapMemory } from './home/review-fixtures.js';
import { fixtureAnswer, layerGraph, MEMORY_KINDS, titleOfRecord, visibleMemory } from './map-memory.js';
import { LayersRow } from './MapMemory.jsx';
import MapInspector from './MapInspector.jsx';
import { contextOf, fileObject, objectOf } from './inspector.js';
import { learnAction } from './agent/learn-hook.js';
import { getSurface, patchSurface } from './agent/surface.js';
import { askDraft, askQuestion, whyQuestion, wireContext } from './agent/scope.js';

// `onCatalog`: reloads the shell's catalog (Shell load), so a canvas made or renamed shows in the switcher.
export default function RepositoryPage({ app: initial, catalog = [], onCatalog = null }) {
  const [app,setApp]=useState(initial),[snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[mode,setMode]=useState('graph'),[query,setQuery]=useState('');
  // Two states, kept apart (owner, 2026-10-06, docs/features/workspace-dock.md): what the inspector shows, and what the
  // composer asks about (the one context, published as surface.selected). Selecting sets both; closing the inspector clears
  // neither; only a chip's x in the composer narrows the context.
  // The context is the one canonical selection (repository-browser.md): Files, Graph, the inspector and the dock chips all
  // read and write it. `opened` is only the file the Files reader shows; it stays when a chip's x widens the context.
  const [inspected,setInspected]=useState(null),[trail,setTrail]=useState([]),[context,setContext]=useState(null),[opened,setOpened]=useState(null);
  const [graphView,setGraphView]=useState(null),[view,setView]=useState('overview');
  // Send with an object in context opens that object's Chat tab (owner, 2026-10-08); set below, once the inspector exists.
  const nodeAsk=useRef(null);
  // The inspector starts closed (owner, 2026-10-04) and opens for what is selected.
  const [panelOpen,setPanelOpen]=useState(false),[infoOpen,setInfoOpen]=useState(false),[layersOpen,setLayersOpen]=useState(false);
  // WP6 checkpoint 2: work memory exists only as labelled fixtures (?fixtures=1, karpathy/nanoGPT), filtered to what this viewer may see.
  const fixtures=reviewTools&&fixturesOn(localStorage,window.location.search,reviewTools),stored=useMapMemory(fixtures,app.repo),viewer=getSurface().email||null;
  const memory=useMemo(()=>stored&&visibleMemory(stored,viewer),[stored,viewer]),[layers,setLayers]=useState(()=>new Set());
  const shown=useMemo(()=>snapshot&&(memory&&layers.size?layerGraph(snapshot.graph,memory,layers):snapshot.graph),[snapshot,memory,layers]);
  const toggleLayer=key=>setLayers(previous=>{const next=new Set(previous);if(next.has(key))next.delete(key);else next.add(key);return next;});
  // An exact fixture prompt (map-memory.js) is answered here, labelled, with no request; anything else goes to the model.
  const answerLocally=(text,scope)=>memory&&snapshot&&scope.kind==='project'&&scope.slug===app.name?fixtureAnswer(text,{node:scope.selected&&snapshot.graph.nodes.find(n=>n.id===(scope.selected.nodeId||scope.selected.id))||null,memory,graph:snapshot.graph}):null;
  const showGraph=value=>{setGraphView({...value,requestId:crypto.randomUUID()});setMode('graph');if(projectTab(window.location.search)!=='map')navigate(`/apps/${app.name}?tab=map`);};
  const onGraph=(value,{auto=false}={})=>{if(auto&&projectTab(window.location.search)!=='map')return;showGraph(value);}; // only an explicit Show on graph leaves Learn for the Map
  // The Map is the default (routes.js); a repository with no snapshot yet has nothing to learn from, so ?tab=learn shows its Map too.
  const asked=projectTab(window.location.search),tab=asked==='learn'&&!app.commit_sha?'map':asked,go=t=>navigate(`/apps/${app.name}?tab=${t}`);
  // ...and says so in its URL, so the shell (sidebar, bar) treats it as the Map too.
  useEffect(()=>{if(tab!==asked){window.history.replaceState(window.history.state,'',`/apps/${app.name}?tab=map`);window.dispatchEvent(new PopStateEvent('popstate'));}},[tab,asked,app.name]);
  const canvases=catalog.filter(c=>c.kind==='canvas'&&c.project===app.name),picked=tab==='learn'&&canvases.find(c=>c.name===new URLSearchParams(window.location.search).get('canvas')); // LibraryViews.jsx's filter. ponytail: an unknown ?canvas= falls back to the Main canvas
  const root=`/api/repositories/${app.name}`;
  function onFile(filePath,line){if(snapshot?.files.some(f=>f.path===filePath))inspect(fileObject(snapshot.graph,filePath,line||1),'source');}
  // A code reference in an answer (path:15-64; repository-browser.md "Code references", owner 2026-10-08): only a file of this
  // snapshot is a link (ask.jsx CodeRefs), and a click opens it in this page's reader with the range selected, as a drag selects
  // it, so Ask in chat and Copy work on it - the Main canvas's Files panel (LearnPage small:open-files), else the Map's Files
  // view (a project canvas goes to the Map). Nothing is asked.
  const [jump,setJump]=useState(null),openRef=useRef(null);
  openRef.current=(path,start,end)=>{
    if(!snapshot?.files.some(f=>f.path===path))return;
    setOpened(path);setJump({path,start,end,at:Date.now()});
    if(tab==='learn'&&!picked)window.dispatchEvent(new CustomEvent('small:open-files'));else{setMode('files');if(tab==='learn')go('map');}
  };
  const codeRefs=useMemo(()=>{if(!snapshot)return null;const paths=new Set(snapshot.files.map(f=>f.path));return {has:p=>paths.has(p),open:(...a)=>openRef.current(...a)};},[snapshot]);
  useEffect(()=>{
    let active=true,timer;
    const load=async()=>{try{const next=await api(root);if(!active)return;setApp(next);if(['queued','indexing'].includes(next.status))timer=setTimeout(load,2500);}catch(e){if(active)setError(e.message);}};
    load();return()=>{active=false;clearTimeout(timer);};
  },[root,app.status]);
  useEffect(()=>{if(!app.commit_sha)return;let active=true;api(`${root}/snapshot`).then(d=>{if(active){setSnapshot(d);setInspected(null);setTrail([]);setContext(null);setOpened(null);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[root,app.commit_sha]);
  // The Agent Bar asks about this project and its context (T02 §6.2): x on a file or symbol chip comes back through
  // setContext, and a repository refresh shows in the bar's activity row while a snapshot is on screen. Answers land in the
  // bar's own window, as everywhere else (workspace-dock §17); a cited file opens here. Root resets the surface on every
  // URL change, so this re-runs on the path. Learn keeps Root's hidden baseline and gets no onGraph: a late
  // Map answer must not navigate the reader out of Learn.
  const path=window.location.pathname+window.location.search;
  const reading=['queued','indexing'].includes(app.status)&&!!app.commit_sha;
  useEffect(()=>{if(tab!=='learn')patchSurface({resource:{kind:'project',slug:app.name,title:titleOf(app),status:app.status},selected:tab==='map'?context:null,activity:reading?[{id:'repository',label:app.status==='queued'?'Waiting to read the repository…':'Reading repository…'}]:[],handlers:{onGraph,answerLocally,setContext,onFile,codeRefs,onNodeAsk:s=>nodeAsk.current?.(s)}});},[path,app.name,app.repo,app.status,context,snapshot?.commit,memory]);
  const key=resultsKey({org:getSurface().org,kind:'project',slug:app.name}); // the bar's results key for this project, selection excluded
  // One navigation, Files · Graph · Learn (owner brief §1): views, as restrained underline tabs; blue stays for primary actions.
  // Files and Graph are two views of the page; Learn is the project's canvas (?tab=learn).
  const tabs=<Tabs value={tab==='learn'?'learn':mode} onValueChange={v=>v==='learn'?go('learn'):setMode(v)}><TabsList data-project-tabs className="border-b-0!">
    <TabsTrigger value="files">Files</TabsTrigger><TabsTrigger value="graph">Graph</TabsTrigger><TabsTrigger value="learn" disabled={!app.commit_sha}>Learn</TabsTrigger>
  </TabsList></Tabs>;
  // The project's canvases in Learn's header (docs/features/project-canvases.md): Main canvas, its canvases, New canvas.
  const switcher=<CanvasSwitcher project={app.name} entries={projectCanvases(app.name,catalog,picked?.name)} onCatalog={onCatalog}/>;
  // A fixture record is only looked at: the bar keeps asking about code, so no fixture id ever reaches the model.
  // Inspector history is local (inspector brief §15): Back returns the inspector to the previous object, never the URL or the context.
  const inspect=(object,show='overview')=>{setTrail(t=>inspected&&inspected.id!==object.id?[...t,inspected].slice(-10):t);setInspected(object);setView(show);setPanelOpen(true);};
  const pick=id=>{const r=memory&&[...memory.decisions,...memory.questions,...memory.sessions].find(x=>x.id===id);if(r)inspect({id:r.id,label:titleOfRecord(r),kind:MEMORY_KINDS.find(k=>memory[`${k}s`].includes(r)),record:r});};
  // Selecting is inspecting and grounding at once (workspace-dock §4). A click on the graph's white space deselects both:
  // the node, the inspector's object and the context (owner, 2026-10-08: "if we click on a node, and we click in the white
  // space, it gets deselected"); the inspector stays open on its empty state.
  // A line range (the code reader's Ask or Learn) is already a context: repo › file › lines a–b, pinned to this snapshot.
  const ground=object=>object.kind==='range'?object:contextOf(object,snapshot.commit);
  const attach=object=>{inspect(object);setContext(ground(object));if(object.path)setOpened(object.path);};
  const deselect=()=>{setInspected(null);setTrail([]);setContext(null);};
  const choose=node=>{if(!node)return deselect();if(MEMORY_KINDS.includes(node.kind))return pick(node.id);attach(objectOf(snapshot.graph,node));};
  // Ask writes a ready question about the object into the composer and pins the object as its context; the learner presses
  // Send (owner, 2026-10-08). The question waits one task, so it lands in the scope with the new context.
  const askAbout=(object,question=askQuestion)=>{if(!object||object.record)return;setContext(ground(object));setTimeout(()=>askDraft(question(object)),0);};
  // Learn this carries the context into Learn and sends nothing (learn-hook.js); the Tutor picks the pedagogy, never a card type here.
  const learnThis=object=>{setContext(ground(object));learnAction('teach',{app:app.name,prompt:`Teach me ${wireContext(ground(object)).label}`},{}).then(r=>{if(r.status!=='fallback'&&r.message)toast(r.message);});};
  // Graph and Files are two views of one selection: the graph lights the context's node, or its file's (a range has no node).
  const lit=inspected?.record?{id:inspected.id}:context&&(context.nodeId||context.path)?{id:context.nodeId||fileObject(snapshot.graph,context.path).nodeId}:null;
  const askWhy=object=>askAbout(object,whyQuestion);
  // The object the question was sent about, in the inspector on its Chat tab: the one shown, else found again by its id.
  nodeAsk.current=s=>{
    const node=s.kind==='range'?null:snapshot.graph.nodes.find(n=>n.id===(s.nodeId||s.id));
    const object=inspected?.id===s.id?inspected:s.kind==='range'?s:s.kind==='file'?fileObject(snapshot.graph,s.path,s.line):node&&objectOf(snapshot.graph,node);
    if(!object)return;
    if(inspected?.id===object.id){setView('chat');setPanelOpen(true);}else inspect(object,'chat');
  };
  // The Files reader, on the Map and in the Main canvas's right panel (owner, 2026-10-08: the canvas's Map icon "opens the
  // Files in the right side panel"). One selection either way: a file, a symbol or a range attaches as on the Map, so the
  // range reaches Learn's chat as its repository context. A project's other canvases have no repository context: their icon
  // still goes to the Map. In the panel a selection offers Ask in chat and Copy (place 'panel'), and the chat's chip previews
  // the selected lines (repositoryExcerpt: the range's text, never sent; the server reads its own copy). There, Ask in chat also
  // puts the lines on the canvas as a Code card that becomes the question's selected card (small:code-card, LearnPage; owner,
  // 2026-10-08: "put the highlighted code as code card").
  const codeCard=range=>window.dispatchEvent(new CustomEvent('small:code-card',{detail:{text:range.text,path:range.path,start:range.start,end:range.end,commit:range.commit,repo:app.repo}}));
  const reader=extra=><CodeReader app={app} snapshot={snapshot} open={opened} context={context} query={query} pick={jump} onFile={p=>attach(fileObject(snapshot.graph,p))} onSymbol={n=>attach(objectOf(snapshot.graph,n))}
    onRange={(kind,range)=>{attach(range);if(kind==='learn')learnThis(range);else{askAbout(range);if(extra?.place==='panel')codeCard(range);}}} {...extra}/>;
  if(tab==='learn')return <CodeRefs.Provider value={codeRefs}><div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:pt-(--shell-top-h)">{/* LearnPage brings its own <main>, which loses index.css's [data-shell-sidebar] ~ main phone padding */}
    {picked?<CanvasLearn key={picked.name} app={picked} project={app} onMap={()=>go('map')} switcher={switcher}/>:<LearnPage app={app} files={snapshot&&reader({query:'',stacked:true,place:'panel'})} onGraph={showGraph} onMap={()=>go('map')} onClearRepository={context?()=>setContext(null):null} repositoryContext={context?wireContext(context):{commit:app.commit_sha}} repositoryExcerpt={context?.kind==='range'?context.text:null} onBack={()=>{setMode('graph');navigate(`/apps/${app.name}?tab=code`);}} switcher={switcher}/>}
  </div></CodeRefs.Provider>;
  return <CodeRefs.Provider value={codeRefs}><main className="relative flex min-w-0 flex-1 overflow-hidden max-lg:flex-col">
    <section className="min-w-0 flex-1 overflow-auto"><ExpandedPageFrame wide>
      <div className="flex items-center gap-1"><h1 className="min-w-0 truncate text-2xl font-semibold">{app.repo}</h1>
        {/* Repository details live behind one icon (owner, 2026-10-04): source, branch, commit, status, refresh. */}
        <div className="relative"><IconBtn data-repo-info aria-label="Repository details" title="Repository details" aria-expanded={infoOpen} onClick={()=>setInfoOpen(open=>!open)}><Info size={16}/></IconBtn>
          <Menu open={infoOpen} onClose={()=>setInfoOpen(false)} className="top-full left-0 mt-1 w-72 p-3">
            <div data-repo-details className="flex flex-col items-start gap-2 text-xs text-ink-2"><SourceLink m={cardModel(app)}/><span className="flex items-center gap-1.5"><GitBranch size={14}/>{app.branch}</span><span>Commit {app.commit_sha?.slice(0,7)||'awaiting snapshot'}</span><span>Status: {app.status}</span>{app.canEdit&&<Button size="sm" disabled={['queued','indexing'].includes(app.status)} onClick={async()=>{try{setError('');await api(`${root}/refresh`,{method:'POST',body:'{}'});setApp(await api(root));}catch(e){setError(e.message);}}}><RefreshCw size={13}/> {app.status==='failed'?'Retry import':'Refresh branch'}</Button>}</div>
          </Menu></div>
        {!panelOpen&&<IconBtn data-map-panel-open aria-label="Open the side panel" title="Open the side panel" onClick={()=>setPanelOpen(true)} className="ml-auto"><PanelRightOpen size={16}/></IconBtn>}</div>
      {/* The navigation row: the tabs' underline sits on its divider; one search field and, in Graph, Layers on the right. */}
      <div className="mt-2 mb-3 flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-line">{tabs}
        {tab==='map'&&snapshot&&<div className="ml-auto flex items-center gap-1.5 pb-1.5">
          {/* One search field, contextual (owner brief §2): Files finds files and symbols, Graph focuses the matching nodes. */}
          <div className="relative"><Search size={14} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-3"/><Input aria-label="Search repository" placeholder="Search files or symbols…" value={query} onChange={e=>setQuery(e.target.value)} className="w-64 pl-7 max-md:w-48"/></div>
          {/* Layers are graph overlays, not a mode (owner brief §3): a labelled button for the node types to show. */}
          {mode==='graph'&&<Button size="sm" data-map-layers-open aria-controls="map-layers" aria-expanded={layersOpen} onClick={()=>setLayersOpen(open=>!open)}><Layers size={15}/>Layers<ChevronDown size={13} className="text-ink-3"/></Button>}
        </div>}</div>
      {['queued','indexing'].includes(app.status)&&!app.commit_sha&&<div role="status" className="mb-4 rounded-lg border border-line p-4 text-sm"><div className="mb-2 h-1 overflow-hidden rounded bg-hover"><div className="h-full w-1/2 animate-pulse bg-accent"/></div>{app.status==='queued'?'Waiting for the indexer…':'Downloading source and building the code graph…'}</div>}
      {(error||app.error)&&<p role="alert" className="mb-4 text-sm text-danger">{error||app.error}</p>}
      {tab==='map'&&snapshot&&<>
        {/* The layers open beside the graph, which narrows to make room: a floating popover covered the graph's top-right
            nodes and controls (canvas chrome never covers content), so a node under it could not be picked while it was open. */}
        <div className="flex h-[540px] min-h-0 gap-3 max-lg:min-h-80 max-md:flex-col">{mode==='graph'?<><RepositoryGraph graph={shown} selected={lit} onSelect={choose} query={query} answerView={graphView}/>
          {layersOpen&&<aside id="map-layers" aria-label="Layers" className="w-60 shrink-0 self-start rounded-lg border border-line bg-white p-2 max-md:w-full"><LayersRow memory={memory} layers={layers} onToggle={toggleLayer}/></aside>}</>
          :reader()}</div>
        <p className="mt-3 text-xs text-ink-2">{snapshot.files.length} files · {snapshot.graph.nodes.length} nodes · {snapshot.graph.edges.length} relationships</p>
        {!!snapshot.skipped.length&&<details className="mt-2 text-xs text-ink-2"><summary className="cursor-pointer">{snapshot.skipped.length} excluded files</summary><div className="max-h-40 overflow-auto">{snapshot.skipped.map(f=><p key={f.path}>{f.path}: {f.reason}</p>)}</div></details>}
      </>}
    </ExpandedPageFrame></section>
    {/* The inspector: full height above the dock, resizable 320-520 and remembered, collapsible; below lg a right drawer
        over the workspace, full width on a phone (workspace-dock §9, §10, §16). No outline: one left divider. */}
    {tab==='map'&&<ResizableSidePanel data-map-panel overlay storageKey="small.inspectorW" edgeVar="--inspector-w" aria-label="Inspector" resizeLabel="Resize the inspector" defaultWidth={380} maxWidth={520} collapsed={!panelOpen}>
      {/* codeInView: the Files reader already shows this object's file, so the inspector does not repeat its code. */}
      {snapshot&&<MapInspector app={app} snapshot={snapshot} memory={memory} object={inspected} inContext={!!inspected&&context?.id===inspected.id} view={view} onView={setView}
        codeInView={mode==='files'&&!!inspected?.path&&opened===inspected.path}
        onSelect={choose} onPick={pick} onBack={trail.length?()=>{setInspected(trail[trail.length-1]);setTrail(t=>t.slice(0,-1));setView('overview');}:null} backLabel={trail[trail.length-1]?.label}
        onClose={()=>setPanelOpen(false)} onAsk={()=>askAbout(inspected)} onWhy={()=>askWhy(inspected)} conversationKey={key}
        onLearn={()=>learnThis(inspected)}/>}
      {/* Learn this is one typed action with /teach (learn-hook.js); learnAction reads no ctx when the app is given, so commands.js stays
          out of this statically imported page. ponytail: while learnHandoff is off (flags.js) it only opens this project's Learn and
          the context travels as repositoryContext; the fallback line is for a typed prompt, so a click shows none. */}
    </ResizableSidePanel>}
  </main></CodeRefs.Provider>;
}

// The canvas switcher (docs/features/project-canvases.md). The title field beside it names the open canvas, so the trigger
// is the canvas icon and a chevron. Opening it reloads the catalog (a rename made elsewhere shows); New canvas is a canvas
// row in this project with its own board (POST /api/canvases), opened once the catalog has it.
function CanvasSwitcher({ project, entries, onCatalog }) {
  const [open,setOpen]=useState(false),[naming,setNaming]=useState(null),[busy,setBusy]=useState(false);
  const create=async()=>{
    const title=naming.trim();if(!title||busy)return;setBusy(true);
    try{const made=await api('/api/canvases',{method:'POST',body:JSON.stringify({title,project,device_id:deviceId(localStorage)})});await onCatalog?.();setNaming(null);navigate(canvasHref(project,made.name));}
    catch(e){toast(e.message,{tone:'error'});}finally{setBusy(false);}
  };
  return <span className="relative">
    <button type="button" data-canvas-switcher aria-label="Switch canvas" title={`${entries.length} canvas${entries.length===1?'':'es'} in this project`} aria-haspopup="menu" aria-expanded={open}
      onClick={()=>{if(!open)onCatalog?.();setOpen(!open);}} className={`flex h-8 items-center gap-0.5 rounded-lg px-1.5 ${open?'bg-hover text-ink':'text-ink-2 hover:bg-hover hover:text-ink'}`}><Shapes size={15} strokeWidth={1.8}/><ChevronDown size={13}/></button>
    <Menu open={open} onClose={()=>setOpen(false)} className="top-full left-0 mt-1 w-64">
      <div className="px-2 pb-1 pt-2 text-xs text-ink-3">Canvases</div>
      {entries.map(e=><MenuItem key={e.name||'main'} role="menuitemradio" aria-checked={e.current} data-canvas-option={e.name||'main'} onClick={()=>{setOpen(false);if(!e.current)navigate(e.href);}}>
        <span className="flex w-full min-w-0 items-center justify-between gap-2"><span className="min-w-0 truncate">{e.label}</span>{e.current&&<Check size={14} strokeWidth={2} className="shrink-0"/>}</span></MenuItem>)}
      <div className="my-1 border-t border-line"/>
      <MenuItem icon={Plus} data-new-canvas onClick={()=>{setOpen(false);setNaming(newCanvasTitle(entries));}}>New canvas</MenuItem>
    </Menu>
    {naming!==null&&<ConfirmDialog title="New canvas" confirmLabel="Create" confirmVariant="primary" confirmDisabled={busy||!naming.trim()} onCancel={()=>setNaming(null)} onConfirm={create}
      body={<Input autoFocus aria-label="Canvas name" maxLength={120} value={naming} onFocus={e=>e.currentTarget.select()} onChange={e=>setNaming(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')create();}}/>}/>}
  </span>;
}
