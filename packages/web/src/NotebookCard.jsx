import { useEffect, useRef, useState } from 'react';
import { FolderTree, MoreHorizontal, Play, RotateCcw } from 'lucide-react';
import { NOTEBOOK_ORIGIN, NOTEBOOK_PROTOCOL, activePath, ipynbPath, notebookUrl, trimOutputs } from './learn-notebook.js';
import { EXPORT_WORKSPACES, workspaceIdFor, workspaceStore } from './learn-board-assets.js';
import { toast } from './ui.jsx';
import { CardActionRows } from './CanvasMenu.jsx';
import { perfMark } from './learn-perf.js';
import { registerNotebookEditor, notebookCellRequest } from './notebook-inline-client.js';

// The body of a notebook card (docs/features/canvas-notebook.md): Rabbit Hole's
// header, then the card's Jupyter workspace in an iframe on the isolated
// notebook origin. The workspace keeps its own files; the card keeps the
// manifest and a copy of the active notebook, reported over the bridge.
export default function NotebookBody({ block, onSelect, onDocument, onManifest, onEditCells }) {
  const frame = useRef(null);
  const [loaded, setLoaded] = useState(false);
  // If the notebook site never answers (unreachable, or not deployed where
  // this build points), say so after a while instead of "Starting Python..."
  // forever; Retry reloads the frame.
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (loaded) return;
    setStalled(false);
    const timer = setTimeout(() => setStalled(true), 30000);
    return () => clearTimeout(timer);
  }, [loaded, attempt]);
  const [files, setFiles] = useState(false);
  const [menu, setMenu] = useState(false);
  const [kind, setKind] = useState('notebook');
  const ready = useRef(false);
  const pending=useRef(new Map()),frameRevision=useRef(null),applying=useRef(false);
  const [cellBusy,setCellBusy]=useState(false);
  const requestCells=(type,extra={})=>new Promise((resolve,reject)=>{
    if(!ready.current)return reject(new Error('The notebook is not ready.'));
    const requestId=crypto.randomUUID(),timer=setTimeout(()=>{pending.current.delete(requestId);reject(new Error('This notebook site did not acknowledge selected-cell editing.'));},5000);
    pending.current.set(requestId,{resolve,reject,timer});send(type,notebookCellRequest(extra,requestId));
  });
  useEffect(()=>registerNotebookEditor(block.id,{
    capture:async()=>{const result=await requestCells('cells-snapshot');frameRevision.current=result.revision;latest.current.onDocument(result.path,result.ipynb);return {...result,id:block.id,notebookId:block.notebook_id};},
    apply:async input=>{applying.current=true;try{const result=await requestCells('cells-apply',input);frameRevision.current=result.revision;return result;}finally{applying.current=false;}},
    restore:async input=>{applying.current=true;try{const result=await requestCells('cells-restore',input);frameRevision.current=result.revision;return result;}finally{applying.current=false;}},
  }),[block.id,block.notebook_id]);
  useEffect(()=>()=>{for(const entry of pending.current.values()){clearTimeout(entry.timer);entry.reject(new Error('The notebook closed.'));}pending.current.clear();},[]);
  useEffect(()=>{
    const revision=JSON.stringify(block.ipynb);
    if(!ready.current||!frameRevision.current||revision===frameRevision.current||applying.current)return;
    applying.current=true;
    requestCells('cells-restore',{path:ipynbPath(block),expectedRevision:frameRevision.current,ipynb:block.ipynb})
      .then(result=>{frameRevision.current=result.revision;}).catch(error=>toast(error.message)).finally(()=>{applying.current=false;});
  },[block.ipynb]);
  const editCells=async()=>{setCellBusy(true);try{const result=await requestCells('cells-snapshot');frameRevision.current=result.revision;latest.current.onDocument(result.path,result.ipynb);onEditCells?.({...result,id:block.id,notebookId:block.notebook_id});}catch(error){toast(error.message);}finally{setCellBusy(false);}};
  // Only the first load sends the card's copy; later edits flow the other way.
  const initial = useRef({ ipynb: block.ipynb, ipynb_path: ipynbPath(block), active_path: activePath(block), seed_files: block.seed_files || null });
  const latest = useRef({ onDocument, onManifest });
  latest.current = { onDocument, onManifest };
  // A shared board keeps a copy of this card's workspace: a few seconds after
  // files change, the card asks the notebook for them and hands them on.
  const exportTimer = useRef(null);
  const scheduleExport = () => {
    if (!ready.current || !workspaceStore()?.save) return;
    clearTimeout(exportTimer.current);
    exportTimer.current = setTimeout(() => send('export'), 3000);
  };
  const exportNow = useRef(() => {});
  exportNow.current = () => { if (ready.current && workspaceStore()?.save) send('export'); };
  useEffect(() => {
    const onRequest = () => exportNow.current();
    window.addEventListener(EXPORT_WORKSPACES, onRequest);
    return () => { window.removeEventListener(EXPORT_WORKSPACES, onRequest); clearTimeout(exportTimer.current); };
  }, []);
  const open = async () => {
    const store = workspaceStore();
    const workspace = store?.load ? await store.load(block.notebook_id).catch(() => null) : null;
    send('init', { ...initial.current, workspace, fresh: !!store?.fresh && !!workspace });
  };

  useEffect(() => {
    const receive = event => {
      if (event.source !== frame.current?.contentWindow || event.origin !== NOTEBOOK_ORIGIN || event.data?.protocol !== NOTEBOOK_PROTOCOL) return;
      const { type } = event.data;
      if(type==='edit-selection'&&event.data.result){const result=event.data.result;frameRevision.current=result.revision;latest.current.onDocument(result.path,result.ipynb);onEditCells?.({...result,id:block.id,notebookId:block.notebook_id});return;}
      if(type==='cell-error'){toast(event.data.error||'The selected notebook cells could not be read.');return;}
      if(type==='cells-result'){
        const entry=pending.current.get(event.data.requestId);if(!entry)return;
        clearTimeout(entry.timer);pending.current.delete(event.data.requestId);
        if(event.data.ok)entry.resolve(event.data.result);else entry.reject(new Error(event.data.error||'The selected notebook cells could not be checked.'));
        return;
      }
      if (type === 'loaded') {
        ready.current = true;
        setLoaded(true);
        // Tool Performance v1: the notebook UI is up and its kernel accepts work.
        perfMark(block.id, 'content'); perfMark(block.id, 'interactive');
        // Jupyter focuses itself while starting; hand focus back so the canvas
        // keeps its keys until the learner clicks into the notebook.
        if (document.activeElement === frame.current) frame.current.blur();
      }
      if (type === 'workspace') {
        if (event.data.files) workspaceStore()?.save?.(block.notebook_id, event.data.files);
        else if (event.data.error === 'too-large') toast("This notebook's files are over 10 MB, so they stay in your browser and others see only the open notebook.");
      }
      if (type === 'state' || type === 'change') scheduleExport();
      if (type === 'state' && typeof event.data.active_path === 'string') {
        setKind(event.data.active_kind);
        latest.current.onManifest({ active_path: event.data.active_path, files: (event.data.files || []).filter(path => typeof path === 'string') });
      }
      if (type === 'change' && event.data.ipynb?.cells && typeof event.data.path === 'string'&&!applying.current){frameRevision.current=JSON.stringify(event.data.ipynb);latest.current.onDocument(event.data.path, trimOutputs(event.data.ipynb));}
    };
    // Focus moving into the notebook is the canvas's only sign of a click
    // there, so it selects the card.
    const blurred = () => setTimeout(() => { if (ready.current && document.activeElement === frame.current) onSelect(block.id); });
    window.addEventListener('message', receive);
    window.addEventListener('blur', blurred);
    return () => { window.removeEventListener('message', receive); window.removeEventListener('blur', blurred); };
  }, [block.id, onSelect]);

  const send = (type, extra = {}) => frame.current?.contentWindow?.postMessage({ protocol: NOTEBOOK_PROTOCOL, type, ...extra }, NOTEBOOK_ORIGIN);
  const toggleFiles = () => { send('files', { open: !files }); setFiles(!files); };
  const action = 'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40';
  const stop = event => event.stopPropagation();

  return (
    <>
      <div data-drag-zone data-notebook-header className="relative flex shrink-0 cursor-grab items-center gap-2 px-4 pb-2 active:cursor-grabbing">
        <span className="text-[11px] font-semibold tracking-wider text-ink-2 uppercase">Notebook</span>
        <span className="text-[11px] text-ink-3">· Python</span>
        <span className="flex-1" />
        {onEditCells&&<button type="button" data-notebook-edit-cells className={action} disabled={!loaded||kind!=='notebook'||cellBusy||block.locked} onPointerDown={stop} onClick={editCells}>{cellBusy?'Reading cells':'Edit selected cells'}</button>}
        <button type="button" aria-pressed={files} className={`${action} ${files ? 'bg-hover text-ink' : ''}`} disabled={!loaded} onPointerDown={stop} onClick={toggleFiles}><FolderTree size={12} />Files</button>
        <button type="button" className={action} disabled={!loaded || kind !== 'notebook'} onPointerDown={stop} onClick={() => send('run-all')}><Play size={12} />Run all</button>
        <button type="button" className={action} disabled={!loaded || kind !== 'notebook'} onPointerDown={stop} onClick={() => send('restart')}><RotateCcw size={12} />Restart</button>
        <button type="button" aria-label="More notebook actions" className={action} onPointerDown={stop} onClick={() => setMenu(open => !open)}><MoreHorizontal size={14} /></button>
        {menu && (
          // UI-25: the card's own rows from the canvas action registry, run like the right-click menu's (CanvasMenu.jsx).
          <div role="menu" aria-label="Notebook actions" data-card-menu className="absolute top-8 right-3 z-30 w-60 rounded-lg border border-line bg-white p-1 shadow-md" onPointerDown={stop}>
            <CardActionRows id={block.id} groups={['type', 'content']} onDone={() => setMenu(false)} />
          </div>
        )}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-b-xl border-t border-line">
        <iframe key={attempt} ref={frame} data-notebook-frame title="Jupyter notebook" src={notebookUrl(workspaceIdFor(block.notebook_id))} className="h-full w-full bg-white"
          sandbox="allow-scripts allow-same-origin allow-downloads" allow="clipboard-write"
          onLoad={open} />
        {!loaded && !stalled && <p className="pointer-events-none absolute inset-0 grid place-items-center bg-white text-sm text-ink-2">Starting Python</p>}
        {!loaded && stalled && (
          <div data-notebook-stalled className="absolute inset-0 grid place-items-center bg-white p-6 text-center">
            <div className="max-w-xs space-y-2 text-sm text-ink-2">
              <p>The notebook couldn't start: its notebook site isn't answering from here.</p>
              <button type="button" onPointerDown={event => event.stopPropagation()} onClick={() => setAttempt(value => value + 1)}
                className="rounded-lg border border-line px-3 py-1.5 text-ink hover:bg-hover">Retry</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
