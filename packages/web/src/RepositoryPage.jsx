import { useEffect, useState } from 'react';
import { BookOpen, FileCode, GitBranch, Network, RefreshCw } from 'lucide-react';
import { api, navigate } from './api.js';
import { Button, ExpandedPageFrame, Input, PeekBreadcrumbs } from './ui.jsx';
import { AskPanel } from './ask.jsx';
import LearnPage from './LearnPage.jsx';
import RepositoryGraph from './RepositoryGraph.jsx';
import RepositorySource from './RepositorySource.jsx';
import ResizableSidePanel from './ResizableSidePanel.jsx';

export default function RepositoryPage({ app: initial }) {
  const [app,setApp]=useState(initial),[snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[mode,setMode]=useState('graph'),[query,setQuery]=useState(''),[selected,setSelected]=useState(null),[source,setSource]=useState(null),[asking,setAsking]=useState(null);
  const [graphView,setGraphView]=useState(null);
  const showGraph=value=>{setGraphView({...value,requestId:crypto.randomUUID()});setMode('graph');if(new URLSearchParams(window.location.search).get('tab')==='learn')navigate(`/apps/${app.name}?tab=code`);};
  const learn=new URLSearchParams(window.location.search).get('tab')==='learn';
  const root=`/api/repositories/${app.name}`;
  useEffect(()=>{
    let active=true,timer;
    const load=async()=>{try{const next=await api(root);if(!active)return;setApp(next);if(['queued','indexing'].includes(next.status))timer=setTimeout(load,2500);}catch(e){if(active)setError(e.message);}};
    load();return()=>{active=false;clearTimeout(timer);};
  },[root,app.status]);
  useEffect(()=>{if(!app.commit_sha)return;let active=true;api(`${root}/snapshot`).then(d=>{if(active){setSnapshot(d);setSelected(null);setSource(null);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[root,app.commit_sha]);
  if(learn)return <LearnPage app={app} onGraph={showGraph} repositoryContext={asking ? {nodeId:asking.id,label:asking.label,commit:snapshot?.commit} : {commit:app.commit_sha}} onBack={()=>{setMode('graph');navigate(`/apps/${app.name}?tab=code`);}}/>;
  const choose=node=>{setSelected(node);setAsking(node);if(!node)return;if(node.path)setSource({path:node.path,line:node.line,commit:node.commit});else setSource(null);};
  const relationships=selected&&snapshot?snapshot.graph.edges.filter(e=>e.source===selected.id||e.target===selected.id):[];
  return <main className="flex min-w-0 flex-1 overflow-hidden max-lg:flex-col">
    <section className="min-w-0 flex-1 overflow-auto"><ExpandedPageFrame wide>
      <PeekBreadcrumbs items={[{label:'Apps',onClick:()=>navigate('/apps')},{label:app.repo},{label:mode==='graph'?'Graph':'Files'}]}/>
      <div className="flex items-center justify-between gap-3 pb-4"><div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="text-2xl font-semibold">{mode==='graph'?'Graph':'Files'}</h1><span className="text-base text-ink-2">{app.repo}</span></div><Button variant="primary" disabled={!app.commit_sha} onClick={()=>navigate(`/apps/${app.name}?tab=learn`)}><BookOpen size={15}/>Learn</Button></div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-2"><GitBranch size={14}/>{app.branch}<span>· {app.commit_sha?.slice(0,7)||'Awaiting snapshot'}</span><span>· {app.status}</span>{app.canEdit&&<Button size="sm" disabled={['queued','indexing'].includes(app.status)} onClick={async()=>{try{setError('');await api(`${root}/refresh`,{method:'POST',body:'{}'});setApp(await api(root));}catch(e){setError(e.message);}}}><RefreshCw size={13}/> {app.status==='failed'?'Retry import':'Refresh branch'}</Button>}</div>
      {['queued','indexing'].includes(app.status)&&<div role="status" className="mb-4 rounded-lg border border-line p-4 text-sm"><div className="mb-2 h-1 overflow-hidden rounded bg-hover"><div className="h-full w-1/2 animate-pulse bg-accent"/></div>{app.status==='queued'?'Waiting for the indexer…':'Downloading source and building the code graph…'}{app.commit_sha&&' The previous snapshot remains available.'}</div>}
      {(error||app.error)&&<p role="alert" className="mb-4 text-sm text-danger">{error||app.error}</p>}
      {snapshot&&<>
        <div className="mb-3 flex items-center gap-2">{[['files',FileCode,'Files'],['graph',Network,'Graph']].map(([value,Icon,label])=><Button key={value} aria-pressed={mode===value} variant={mode===value?'primary':'secondary'} onClick={()=>setMode(value)}><Icon size={15}/>{label}</Button>)}<Input aria-label="Search repository" placeholder={mode==='graph'?'Find a symbol or file…':'Find a file…'} value={query} onChange={e=>setQuery(e.target.value)} className="ml-auto w-64"/></div>
        <div className="flex h-[540px] min-h-0 flex-col">{mode==='graph'?<RepositoryGraph graph={snapshot.graph} selected={selected} onSelect={choose} query={query} answerView={graphView}/>:<div className="overflow-auto rounded-lg border border-line">{snapshot.files.filter(f=>f.path.toLowerCase().includes(query.toLowerCase())).map(f=><button key={f.path} className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-sm hover:bg-hover" onClick={()=>{setSource({path:f.path,line:1});setSelected(null);setAsking(null);}}><FileCode size={14}/><span className="flex-1 font-mono text-xs">{f.path}</span><span className="text-xs text-ink-3">{f.lines} lines</span></button>)}</div>}</div>
      {selected&&<div className="mt-3 rounded-lg border border-line p-3"><strong className="text-sm">{selected.label}</strong><details className="mt-2 text-xs"><summary className="cursor-pointer">{relationships.length} relationships</summary><div className="max-h-32 overflow-auto">{relationships.map((e,i)=><p className="py-1" key={i}>{e.relation} → {snapshot.graph.nodes.find(n=>n.id===(e.source===selected.id?e.target:e.source))?.label||e.target} <span className="text-ink-3">({e.confidence||'unknown'})</span></p>)}</div></details></div>}
        <p className="mt-3 text-xs text-ink-2">{snapshot.files.length} files · {snapshot.graph.nodes.length} nodes · {snapshot.graph.edges.length} relationships</p>
        {!!snapshot.skipped.length&&<details className="mt-2 text-xs text-ink-2"><summary className="cursor-pointer">{snapshot.skipped.length} excluded files</summary><div className="max-h-40 overflow-auto">{snapshot.skipped.map(f=><p key={f.path}>{f.path}: {f.reason}</p>)}</div></details>}
      </>}
    </ExpandedPageFrame></section>
    <ResizableSidePanel aria-label="Repository Learn Agent" resizeLabel="Resize repository panel" defaultWidth={420} className="p-5">

      <AskPanel onGraph={showGraph} scope={{app:app.name}} appName={app.name} conversation="learn" repositoryContext={{commit:asking?.commit||snapshot?.commit,nodeId:asking?.id,label:asking?.label}} onClearRepository={()=>setAsking(null)} headerTitle="Learn Agent" placeholder={`Ask about ${app.repo}…`} contentPanel={source?<RepositorySource appName={app.name} {...source} commit={source.commit||snapshot?.commit} onClose={()=>setSource(null)}/>:null} onCloseContentPanel={()=>setSource(null)}/>
    </ResizableSidePanel>
  </main>;
}
