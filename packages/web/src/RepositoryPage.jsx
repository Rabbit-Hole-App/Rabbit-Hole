import { Fragment, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Pencil, Plus } from 'lucide-react';
import { api, navigate } from './api.js';
import { ConfirmDialog, Input, Menu, MenuItem, toast, useMenuButton } from './ui.jsx';
import { HoleRows, menuKeys } from './TitleHoles.jsx';
import { deviceId } from './home/canvas-local.js';
import { canvasHref, newCanvasTitle, projectCanvases } from './project-canvases.js';
import LearnPage from './LearnPage.jsx';
import { CodeRefs } from './code-refs.js';
import { CanvasLearn } from './CanvasPage.jsx';
import { repositoryView } from './routes.js';
import { useRepositoryCanvas } from './repository-canvas.jsx';

// A repository opens on its canvas (owner, 2026-10-15, repo-canvas-graph.md correction to decision 2): there is no
// Files | Graph | Learn page. The Main canvas is /apps/<repo>, a project canvas ?canvas=<canvas> (canvasHref adds
// tab=learn); Files and Graph open in the companion column beside Chat. An old ?tab= link opens its viewer once
// (routes.js repositoryView) and leaves the plain URL behind, so a reload opens neither.
// `onCatalog`: reloads the shell's catalog (Shell load), so a canvas made or renamed shows in the switcher.
export default function RepositoryPage({ app: initial, catalog = [], onCatalog = null }) {
  const [app,setApp]=useState(initial);
  const [openViewer,setOpenViewer]=useState(()=>repositoryView(window.location.search));
  useEffect(()=>{
    if(!openViewer)return;
    const params=new URLSearchParams(window.location.search);params.delete('tab');
    if(params.has('canvas'))params.set('tab','learn'); // canvasHref's shape; every other parameter (fixtures=1, ...) stays
    const rest=params.toString();
    window.history.replaceState(window.history.state,'',`/apps/${app.name}${rest?`?${rest}`:''}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  },[]); // eslint-disable-line react-hooks/exhaustive-deps
  const asked=new URLSearchParams(window.location.search).get('canvas');
  const picked=asked&&catalog.find(c=>c.kind==='canvas'&&c.project===app.name&&c.name===asked); // LibraryViews.jsx's filter. ponytail: an unknown ?canvas= falls back to the Main canvas
  const wired=useRepositoryCanvas(app,{codeCards:!picked}),live=wired?.repository.app?{...wired.repository.app,title:app.title}:app;
  // The viewer an old link asked for opens on arrival only: a canvas switched to later opens as it is.
  const arrived=useRef(picked?.name);
  useEffect(()=>{if(arrived.current!==picked?.name)setOpenViewer(null);},[picked?.name]);
  // The project's management (rename, visibility, ...) lives in Home and the Library, never in this header (owner brief
  // 2026-10-16 item 2); a rename made there reaches this page with the catalog (Shell load), so the plain name follows it.
  const named=catalog.find(c=>c.name===app.name);
  useEffect(()=>{if(named?.title!=null&&named.title!==app.title)setApp(previous=>({...previous,title:named.title}));},[named?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  // The project's canvases in Learn's header (docs/features/project-canvases.md): the canvas selector (LearnPage adds the
  // open canvas's title and rename).
  const switcher=<CanvasSwitcher project={app.name} entries={projectCanvases(app.name,catalog,picked?.name)} onCatalog={onCatalog}/>;
  const props={...wired?.canvasProps,openViewer};
  return <CodeRefs.Provider value={wired?.codeRefs||null}><div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:pt-(--shell-top-h)">{/* LearnPage brings its own <main>, which loses index.css's [data-shell-sidebar] ~ main phone padding */}
    {picked?<CanvasLearn key={picked.name} app={picked} project={live} switcher={switcher} canvasProps={props}/>
      :<LearnPage app={live} project={live} switcher={switcher} {...props}/>}
  </div></CodeRefs.Provider>;
}

// The canvas selector (docs/features/project-canvases.md; owner brief 2026-10-16 item 2, the approved centred-menubar mockup):
// ONE button naming the open canvas with a chevron ("Main canvas ⌄"); its dropdown lists this project's canvases with the
// open one checked (a pick switches to it), then New canvas (the existing create flow: a canvas row in this project with its
// own board, POST /api/canvases, opened once the catalog has it) and Rename canvas (the name with Save and Cancel; LearnPage's
// renameTitle saves it as the title field did, so the Rabbit Hole map, Home and the Library follow). Opening it reloads the
// catalog, so a rename made elsewhere shows. `title`/`onRename`: the open canvas's name and its rename (LearnPage).
// `holes` (LearnPage, owner r35): the open canvas's Rabbit Holes, a group under it in this same menu (TitleHoles.jsx).
function CanvasSwitcher({ project, entries, onCatalog, holes = null, title = '', onRename = null }) {
  const m=useMenuButton(),[naming,setNaming]=useState(null),[renaming,setRenaming]=useState(null),[busy,setBusy]=useState(false);
  const create=async()=>{
    const name=naming.trim();if(!name||busy)return;setBusy(true);
    try{const made=await api('/api/canvases',{method:'POST',body:JSON.stringify({title:name,project,device_id:deviceId(localStorage)})});await onCatalog?.();setNaming(null);navigate(canvasHref(project,made.name));}
    catch(e){toast(e.message,{tone:'error'});}finally{setBusy(false);}
  };
  const rename=async()=>{
    const name=renaming.trim().slice(0,120);if(!name||busy)return;
    if(name!==title){setBusy(true);try{await onRename?.(name);await onCatalog?.();}catch(e){toast(e.message,{tone:'error'});setBusy(false);return;}setBusy(false);}
    setRenaming(null);
  };
  // The open canvas's row shows its live name, so a rename shows in the list at once.
  const rows=entries.map(e=>(e.current&&title?{...e,label:title}:e));
  return <span className="relative flex min-w-0 shrink">
    <button type="button" data-canvas-switcher {...m.buttonProps} aria-label={`Canvas: ${title}`} title={`${title} - ${entries.length} canvas${entries.length===1?'':'es'} in this project`}
      onClick={event=>{if(!m.open)onCatalog?.();m.buttonProps.onClick(event);}}
      className={`flex h-8 min-w-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${m.open?'bg-hover':'hover:bg-hover'}`}>
      <span data-canvas-name className="min-w-0 max-w-96 truncate">{title}</span><ChevronDown size={14} strokeWidth={1.8} aria-hidden className={`shrink-0 text-ink-2 transition-transform ${m.open?'rotate-180':''}`}/></button>
    <Menu portal anchor={m.button.current} open={m.open} onClose={m.onClose} style={m.style} className="w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-line p-1.5"><div data-menu-button-open role="menu" aria-label="Canvases" onKeyDown={menuKeys}>
      <div className="px-2 pb-1 pt-1.5 text-xs text-ink-2">Canvases in this project</div>
      {rows.map(e=><Fragment key={e.name||'main'}><MenuItem role="menuitemradio" aria-checked={e.current} data-canvas-option={e.name||'main'} title={e.label} onClick={()=>{m.close();if(!e.current)navigate(e.href);}} className={e.current?'bg-hover':''}>
        <span className="flex w-full min-w-0 items-center justify-between gap-2"><span className="min-w-0 truncate">{e.label}</span>{e.current&&<Check size={14} strokeWidth={2} className="shrink-0"/>}</span></MenuItem>
        {e.current&&holes?.rows.length>1&&<div data-switcher-holes><div className="px-2 pb-1 pt-1.5 pl-5 text-xs text-ink-3">Rabbit Holes</div><HoleRows rows={holes.rows.slice(1)} onPick={row=>{m.close();holes.onPick(row);}}/></div>}</Fragment>)}
      <div className="my-1 border-t border-line"/>
      <MenuItem icon={Plus} role="menuitem" data-new-canvas onClick={()=>{m.close(false);setNaming(newCanvasTitle(entries));}}>New canvas</MenuItem>
      {onRename&&<MenuItem icon={Pencil} role="menuitem" data-rename-canvas onClick={()=>{m.close(false);setRenaming(title);}}>Rename canvas</MenuItem>}
    </div></Menu>
    {naming!==null&&<ConfirmDialog title="New canvas" confirmLabel="Create" confirmVariant="primary" confirmDisabled={busy||!naming.trim()} onCancel={()=>setNaming(null)} onConfirm={create}
      body={<Input autoFocus aria-label="Canvas name" maxLength={120} value={naming} onFocus={e=>e.currentTarget.select()} onChange={e=>setNaming(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')create();}}/>}/>}
    {renaming!==null&&<ConfirmDialog title="Rename canvas" confirmLabel="Save" confirmVariant="primary" confirmDisabled={busy||!renaming.trim()} onCancel={()=>{setRenaming(null);m.button.current?.focus();}} onConfirm={rename}
      body={<Input autoFocus aria-label="Canvas name" maxLength={120} value={renaming} onFocus={e=>e.currentTarget.select()} onChange={e=>setRenaming(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')rename();}}/>}/>}
  </span>;
}
