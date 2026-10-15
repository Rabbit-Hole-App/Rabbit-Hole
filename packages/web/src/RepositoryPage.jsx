import { Fragment, useEffect, useState } from 'react';
import { Check, ChevronDown, MoreHorizontal, Plus, Shapes } from 'lucide-react';
import { api, navigate } from './api.js';
import { ConfirmDialog, IconBtn, Input, Menu, MenuItem, toast } from './ui.jsx';
import { HoleRows, menuKeys } from './TitleHoles.jsx';
import { deviceId } from './home/canvas-local.js';
import { canvasHref, newCanvasTitle, projectCanvases } from './project-canvases.js';
import LearnPage from './LearnPage.jsx';
import { CodeRefs } from './code-refs.js';
import { CanvasLearn } from './CanvasPage.jsx';
import { repositoryView } from './routes.js';
import { useRepositoryCanvas } from './repository-canvas.jsx';
import { useCardMenu } from './home/CardMenu.jsx';

// A repository opens on its canvas (owner, 2026-10-15, repo-canvas-graph.md correction to decision 2): there is no
// Files | Graph | Learn page. The Main canvas is /apps/<repo>, a project canvas ?canvas=<canvas> (canvasHref adds
// tab=learn); Files and Graph open in the companion column beside Chat. An old ?tab= link opens its viewer once
// (routes.js repositoryView) and leaves the plain URL behind, so a reload opens neither.
// `onCatalog`: reloads the shell's catalog (Shell load), so a canvas made or renamed shows in the switcher.
export default function RepositoryPage({ app: initial, catalog = [], onCatalog = null }) {
  const [app,setApp]=useState(initial);
  const [openViewer]=useState(()=>repositoryView(window.location.search));
  useEffect(()=>{
    if(!openViewer)return;
    const params=new URLSearchParams(window.location.search);params.delete('tab');
    const canvas=params.get('canvas');
    window.history.replaceState(window.history.state,'',canvas?canvasHref(app.name,canvas):`/apps/${app.name}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  },[]); // eslint-disable-line react-hooks/exhaustive-deps
  const root=`/api/repositories/${app.name}`;
  const wired=useRepositoryCanvas(app),live=wired?.repository.app||app;
  // The card's ⋮ beside the project's name: a change reloads this project and the shell's catalog.
  const headerMenu=useCardMenu({org:app.org,email:app.email,apps:catalog,onChanged:()=>{api(root).then(setApp,()=>{});onCatalog?.();}});
  const projectMenu = <>{headerMenu.onMore(app)&&<IconBtn data-project-more title="More" aria-label="More" onClick={e=>headerMenu.onMore(app)(e)}><MoreHorizontal size={16}/></IconBtn>}{headerMenu.element}</>;
  const asked=new URLSearchParams(window.location.search).get('canvas');
  const picked=asked&&catalog.find(c=>c.kind==='canvas'&&c.project===app.name&&c.name===asked); // LibraryViews.jsx's filter. ponytail: an unknown ?canvas= falls back to the Main canvas
  // The project's canvases in Learn's header (docs/features/project-canvases.md): Main canvas, its canvases, New canvas.
  const switcher=<CanvasSwitcher project={app.name} entries={projectCanvases(app.name,catalog,picked?.name)} onCatalog={onCatalog}/>;
  const props={...wired?.canvasProps,openViewer};
  return <CodeRefs.Provider value={wired?.codeRefs||null}><div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:pt-(--shell-top-h)">{/* LearnPage brings its own <main>, which loses index.css's [data-shell-sidebar] ~ main phone padding */}
    {picked?<CanvasLearn key={picked.name} app={picked} project={live} projectMenu={projectMenu} switcher={switcher} canvasProps={props}/>
      :<LearnPage app={live} project={live} projectMenu={projectMenu} switcher={switcher} {...props}/>}
  </div></CodeRefs.Provider>;
}

// The canvas switcher (docs/features/project-canvases.md). The title field beside it names the open canvas, so the trigger
// is the canvas icon and a chevron. Opening it reloads the catalog (a rename made elsewhere shows); New canvas is a canvas
// row in this project with its own board (POST /api/canvases), opened once the catalog has it.
// `holes` (LearnPage, owner r35): the open canvas's Rabbit Holes, a group under it in this same menu (TitleHoles.jsx).
function CanvasSwitcher({ project, entries, onCatalog, holes = null }) {
  const [open,setOpen]=useState(false),[naming,setNaming]=useState(null),[busy,setBusy]=useState(false);
  const create=async()=>{
    const title=naming.trim();if(!title||busy)return;setBusy(true);
    try{const made=await api('/api/canvases',{method:'POST',body:JSON.stringify({title,project,device_id:deviceId(localStorage)})});await onCatalog?.();setNaming(null);navigate(canvasHref(project,made.name));}
    catch(e){toast(e.message,{tone:'error'});}finally{setBusy(false);}
  };
  return <span className="relative">
    <button type="button" data-canvas-switcher aria-label="Switch canvas" title={`${entries.length} canvas${entries.length===1?'':'es'} in this project`} aria-haspopup="menu" aria-expanded={open}
      onClick={()=>{if(!open)onCatalog?.();setOpen(!open);}} className={`flex h-8 items-center gap-0.5 rounded-lg px-1.5 ${open?'bg-hover text-ink':'text-ink-2 hover:bg-hover hover:text-ink'}`}><Shapes size={15} strokeWidth={1.8}/><ChevronDown size={13}/></button>
    <Menu open={open} onClose={()=>setOpen(false)} className="top-full left-0 mt-1 w-64"><div role="menu" aria-label="Canvases" onKeyDown={menuKeys}>
      <div className="px-2 pb-1 pt-2 text-xs text-ink-3">Canvases</div>
      {entries.map(e=><Fragment key={e.name||'main'}><MenuItem role="menuitemradio" aria-checked={e.current} data-canvas-option={e.name||'main'} title={e.label} onClick={()=>{setOpen(false);if(!e.current)navigate(e.href);}}>
        <span className="flex w-full min-w-0 items-center justify-between gap-2"><span className="min-w-0 truncate">{e.label}</span>{e.current&&<Check size={14} strokeWidth={2} className="shrink-0"/>}</span></MenuItem>
        {e.current&&holes?.rows.length>1&&<div data-switcher-holes><div className="px-2 pb-1 pt-1.5 pl-5 text-xs text-ink-3">Rabbit Holes</div><HoleRows rows={holes.rows.slice(1)} onPick={row=>{setOpen(false);holes.onPick(row);}}/></div>}</Fragment>)}
      <div className="my-1 border-t border-line"/>
      <MenuItem icon={Plus} data-new-canvas onClick={()=>{setOpen(false);setNaming(newCanvasTitle(entries));}}>New canvas</MenuItem>
    </div></Menu>
    {naming!==null&&<ConfirmDialog title="New canvas" confirmLabel="Create" confirmVariant="primary" confirmDisabled={busy||!naming.trim()} onCancel={()=>setNaming(null)} onConfirm={create}
      body={<Input autoFocus aria-label="Canvas name" maxLength={120} value={naming} onFocus={e=>e.currentTarget.select()} onChange={e=>setNaming(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')create();}}/>}/>}
  </span>;
}
