import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Info, Minus, Plus, RotateCcw } from 'lucide-react';
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force';
import { Button, IconBtn, Menu } from './ui.jsx';

// Overview is bounded; focusing a symbol expands its actual one-hop relationships.
// SVG text is React-escaped: graph labels never become HTML or executable markup.
export default function RepositoryGraph({ graph: sourceGraph, selected, onSelect, query, answerView }) {
  const [answer,setAnswer]=useState(null);
  const graph=answer||sourceGraph;
  const [focus,setFocus]=useState(null),[view,setView]=useState({x:0,y:0,z:1});const drag=useRef(null), simulation=useRef(null), layer=useRef(null), saved=useRef(new Map()), suppressClick=useRef(false), restore=useRef(false);
  const [history,setHistory]=useState([]),[positions,setPositions]=useState(new Map()),[hovered,setHovered]=useState(null),[infoOpen,setInfoOpen]=useState(false);
  const palette=['#2383e2','#8b6bb1','#439b88','#c28a42','#bc718d','#638baf'];
  const colors=useMemo(()=>new Map([...new Set(graph.nodes.map(n=>n.path).filter(Boolean))].sort().map((path,i)=>[path,palette[i%palette.length]])),[graph]);
  const color=n=>colors.get(n.path)||'#a1a7ae';
  const degrees=useMemo(()=>{const counts=new Map();graph.edges.forEach(e=>{for(const id of [e.source,e.target])counts.set(id,(counts.get(id)||0)+1);});return counts;},[graph]);
  useEffect(()=>{setFocus(null);setHistory([]);setAnswer(null);},[query]);
  const scene=useMemo(()=>{
    let nodes;
    if(focus){const ids=new Set([focus]);graph.edges.forEach(e=>{if(e.source===focus||e.target===focus){ids.add(e.source);ids.add(e.target);}});nodes=graph.nodes.filter(n=>ids.has(n.id));}
    else if(!answer&&query.trim())nodes=graph.nodes.filter(n=>`${n.label} ${n.path||''}`.toLowerCase().includes(query.toLowerCase()));
    else{
      const degrees=new Map();graph.edges.forEach(e=>{for(const id of [e.source,e.target])degrees.set(id,(degrees.get(id)||0)+1);});
      nodes=[...graph.nodes].sort((a,b)=>(degrees.get(b.id)||0)-(degrees.get(a.id)||0));
    }
    const total=nodes.length;nodes=nodes.slice(0,answer ? 100 : focus || query ? 45 : 24);const count=nodes.length;
    const positions=new Map(nodes.map((n,i)=>[n.id,{...n,x:500+Math.cos(i/Math.max(1,count)*Math.PI*2)*Math.min(330,Math.max(210,count*10)),y:350+Math.sin(i/Math.max(1,count)*Math.PI*2)*Math.min(250,Math.max(160,count*8))}]));
    if(focus&&positions.has(focus))positions.set(focus,{...positions.get(focus),x:500,y:350});
    if(nodes.length===1)positions.set(nodes[0].id,{...positions.get(nodes[0].id),x:500,y:350});
    return{nodes:[...positions.values()],edges:graph.edges.filter(e=>positions.has(e.source)&&positions.has(e.target)).slice(0,250),positions,total};
  },[graph,focus,query,answer]);
  const snapshotPositions=()=>new Map([...saved.current].map(([id,p])=>[id,{...p}]));
  useEffect(()=>{
    if(!answerView)return;
    setHistory(previous=>[...previous,{focus,view,positions:snapshotPositions(),answer}]);
    setAnswer(answerView);setFocus(null);setView({x:0,y:0,z:1});setHovered(null);
  },[answerView]);
  const explore=id=>{
    if(id===focus)return;
    setHistory(previous=>[...previous,{focus,view,positions:snapshotPositions(),answer}]);
    setFocus(id);setView({x:0,y:0,z:1});
  };
  const back=()=>{
    const previous=history.at(-1);if(!previous)return;
    saved.current=previous.positions;restore.current=true;setPositions(previous.positions);
    setAnswer(previous.answer);setFocus(previous.focus);setView(previous.view);setHovered(null);setHistory(history.slice(0,-1));
  };
  useEffect(()=>{
    // D3 mutates its inputs: keep the immutable index and edge confidence intact.
    const nodes=scene.nodes.map(n=>({...n,...saved.current.get(n.id)}));
    const links=scene.edges.map(e=>({...e}));
    const sim=forceSimulation(nodes).stop()
      .force('links',forceLink(links).id(n=>n.id).distance(120))
      .force('repel',forceManyBody().strength(-260))
      .force('collision',forceCollide(46))
      .force('x',forceX(500).strength(.035)).force('y',forceY(350).strength(.035));
    simulation.current=sim;
    const paint=()=>{
      for(const n of nodes){
        // Keep the bounded graph reachable at its default zoom.
        n.x=Math.max(35,Math.min(900,n.x));n.y=Math.max(85,Math.min(625,n.y));
        saved.current.set(n.id,{x:n.x,y:n.y});
      }
      setPositions(new Map(nodes.map(n=>[n.id,{x:n.x,y:n.y}])));
    };
    sim.on('tick',paint);
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    const settle=()=>{if(preference.matches){sim.stop().tick(180);paint();}};
    if(restore.current){restore.current=false;paint();}
    else if(preference.matches){sim.tick(180);paint();}
    else{sim.tick(35);paint();sim.alpha(.35).restart();}
    preference.addEventListener('change',settle);
    return()=>{sim.stop();drag.current=null;preference.removeEventListener('change',settle);};
  },[scene]);
  const point=e=>new DOMPoint(e.clientX,e.clientY).matrixTransform(layer.current.getScreenCTM().inverse());
  const release=e=>{
    const active=drag.current;drag.current=null;
    if(active?.node){active.node.fx=null;active.node.fy=null;simulation.current.alphaTarget(0);suppressClick.current=active.moved;}
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const active=hovered||(scene.positions.has(selected?.id)?selected.id:null);
  const connected=new Set(active?[active]:[]);
  if(active)scene.edges.forEach(e=>{if(e.source===active||e.target===active){connected.add(e.source);connected.add(e.target);}});
  return <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-[#fafbfc]">
    {!!history.length&&<div className="absolute top-3 left-3 z-10"><Button size="sm" onClick={back}><ArrowLeft size={13}/>Back</Button></div>}
    <div className="absolute top-3 right-3 z-10 flex rounded border border-line bg-white">
      <IconBtn title="Zoom in" onClick={()=>setView(v=>({...v,z:Math.min(3,v.z*1.3)}))}><Plus size={15}/></IconBtn>
      <IconBtn title="Zoom out" onClick={()=>setView(v=>({...v,z:Math.max(.2,v.z/1.3)}))}><Minus size={15}/></IconBtn>
      <IconBtn title="Reset graph" onClick={()=>{setView({x:0,y:0,z:1});setFocus(null);setHistory([]);setAnswer(null);}}><RotateCcw size={14}/></IconBtn>
      <span className="relative"><IconBtn aria-label="Graph information" aria-expanded={infoOpen} onClick={()=>setInfoOpen(!infoOpen)}><Info size={15}/></IconBtn>
        <Menu open={infoOpen} onClose={()=>setInfoOpen(false)} className="top-9 right-0 w-60"><div className="p-3 text-xs leading-5 whitespace-normal">
          {answer&&<p className="mb-2 font-medium break-words">{answer.title}</p>}
          <p>{scene.nodes.length} of {scene.total} nodes</p>
          <p className="text-ink-2">Solid: extracted<br/>Dashed: inferred</p>
          <p className="mt-2 border-t border-line pt-2">Click to inspect. Double-click to explore.<br/>Drag nodes to move; drag empty space to pan.<br/>Scroll to zoom. Back returns.</p>
        </div></Menu>
      </span>
    </div>
    <svg role="img" aria-label="Repository dependency graph" viewBox="0 0 1000 700" style={{backgroundImage:"radial-gradient(#d8dee5 0.65px, transparent 0.65px)",backgroundSize:"22px 22px"}} className="h-full min-h-80 w-full flex-1 touch-none select-none" onWheel={e=>setView(v=>({...v,z:Math.max(.2,Math.min(3,v.z*(e.deltaY<0?1.1:.9)))}))}
      onPointerDown={e=>{
        if(e.button!==0)return;e.preventDefault();suppressClick.current=false;
        const target=e.target.closest('[data-graph-node]');
        (target||e.currentTarget).setPointerCapture(e.pointerId);
        if(target){
          const node=simulation.current.nodes().find(n=>n.id===target.dataset.graphNode),p=point(e);
          node.fx=node.x;node.fy=node.y;
          drag.current={node,x:e.clientX,y:e.clientY,dx:node.x-p.x,dy:node.y-p.y,moved:false};
          if(!matchMedia('(prefers-reduced-motion: reduce)').matches)simulation.current.alphaTarget(.15).restart();
        }else drag.current={x:e.clientX,y:e.clientY,view,moved:false};
      }}
      onPointerMove={e=>{
        const active=drag.current;if(!active)return;
        if(active.node){
          const p=point(e);active.node.x=active.node.fx=Math.max(35,Math.min(900,p.x+active.dx));active.node.y=active.node.fy=Math.max(85,Math.min(625,p.y+active.dy));
          active.moved ||= Math.hypot(e.clientX-active.x,e.clientY-active.y)>4;
          saved.current.set(active.node.id,{x:active.node.x,y:active.node.y});
          setPositions(previous=>new Map(previous).set(active.node.id,{x:active.node.x,y:active.node.y}));
        }else{
          active.moved ||= Math.hypot(e.clientX-active.x,e.clientY-active.y)>4;
          const matrix=e.currentTarget.getScreenCTM();
          setView({...active.view,x:active.view.x+(e.clientX-active.x)/matrix.a,y:active.view.y+(e.clientY-active.y)/matrix.d});
        }
      }}
      onPointerUp={e=>{const active=drag.current;release(e);if(active&&!active.moved)onSelect(active.node?scene.positions.get(active.node.id):null);}}
      onPointerCancel={release} onLostPointerCapture={release}>
      <defs><marker id="repo-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#9ca3af"/></marker></defs>
      <g ref={layer} data-graph-layer transform={`translate(${view.x+500*(1-view.z)},${view.y+350*(1-view.z)}) scale(${view.z})`}>
        {scene.edges.map((e,i)=>{
          const a=positions.get(e.source)||scene.positions.get(e.source),b=positions.get(e.target)||scene.positions.get(e.target),lit=e.source===active||e.target===active;
          const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
          return <line key={i} x1={a.x+dx/length*13} y1={a.y+dy/length*13} x2={b.x-dx/length*15} y2={b.y-dy/length*15} stroke={lit?'#2383e2':'#aebcc9'} strokeOpacity={lit ? .8 : active ? .18 : .45} strokeWidth={lit?1.8:1} strokeDasharray={e.confidence==='EXTRACTED'?undefined:'5 4'} markerEnd={lit?'url(#repo-arrow)':undefined}><title>{e.relation} · {e.confidence||'unknown'} · {e.context||''}</title></line>;
        })}
        {scene.nodes.map(n=>{
          const emphasized=n.id===active,radius=Math.min(14,7+Math.sqrt(degrees.get(n.id)||0));
          return <g key={n.id} data-graph-node={n.id} role="button" tabIndex={0} aria-label={n.label} transform={`translate(${positions.get(n.id)?.x??n.x},${positions.get(n.id)?.y??n.y})`} opacity={!active||connected.has(n.id)?1:.4} className="cursor-grab active:cursor-grabbing"
            onPointerEnter={()=>setHovered(n.id)} onPointerLeave={()=>setHovered(null)}
            onDoubleClick={()=>{if(!suppressClick.current)explore(n.id);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onSelect(n);if(e.shiftKey)explore(n.id);}}}>
            <circle data-node-dot r={radius} fill={color(n)} stroke="white" strokeWidth="2.5"/>
            {emphasized&&<circle r={radius+5} fill="none" stroke={color(n)} strokeOpacity=".3" strokeWidth="2" pointerEvents="none"/>}
            <text y={radius+17} textAnchor="middle" fontSize="12" fontWeight={emphasized?600:400} fill="#334155" stroke="#fafbfc" strokeWidth="4" paintOrder="stroke" strokeLinejoin="round">{n.label.length>28?n.label.slice(0,27)+'…':n.label}</text>
            <title>{n.label}{n.path?` · ${n.path}:${n.line}`:' · External dependency'}</title>
          </g>;
        })}
      </g>
    </svg>

  </div>;
}
