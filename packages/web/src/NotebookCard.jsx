import { useEffect, useRef, useState } from 'react';
import { Download, FolderTree, MoreHorizontal, Play, RotateCcw } from 'lucide-react';
import { NOTEBOOK_ORIGIN, NOTEBOOK_PROTOCOL, activePath, ipynbPath, notebookUrl, trimOutputs } from './learn-notebook.js';
import { EXPORT_WORKSPACES, workspaceIdFor, workspaceStore } from './learn-board-assets.js';
import { toast } from './ui.jsx';
import { perfMark } from './learn-perf.js';

// The body of a notebook card (docs/features/canvas-notebook.md): Rabbit Hole's
// header, then the card's Jupyter workspace in an iframe on the isolated
// notebook origin. The workspace keeps its own files; the card keeps the
// manifest and a copy of the active notebook, reported over the bridge.
export default function NotebookBody({ block, onSelect, onDocument, onManifest }) {
  const frame = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [files, setFiles] = useState(false);
  const [menu, setMenu] = useState(false);
  const [kind, setKind] = useState('notebook');
  const ready = useRef(false);
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
      if (type === 'change' && event.data.ipynb?.cells && typeof event.data.path === 'string') latest.current.onDocument(event.data.path, trimOutputs(event.data.ipynb));
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
  const notebookName = ipynbPath(block).split('/').pop();
  const download = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(block.ipynb, null, 1)], { type: 'application/x-ipynb+json' }));
    link.download = notebookName;
    link.click();
    URL.revokeObjectURL(link.href);
    setMenu(false);
  };
  const action = 'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40';
  const stop = event => event.stopPropagation();

  return (
    <>
      <div data-drag-zone data-notebook-header className="relative flex shrink-0 cursor-grab items-center gap-2 px-4 pb-2 active:cursor-grabbing">
        <span className="text-[11px] font-semibold tracking-wider text-ink-2 uppercase">Notebook</span>
        <span className="text-[11px] text-ink-3">· Python</span>
        <span className="flex-1" />
        <button type="button" aria-pressed={files} className={`${action} ${files ? 'bg-hover text-ink' : ''}`} disabled={!loaded} onPointerDown={stop} onClick={toggleFiles}><FolderTree size={12} />Files</button>
        <button type="button" className={action} disabled={!loaded || kind !== 'notebook'} onPointerDown={stop} onClick={() => send('run-all')}><Play size={12} />Run all</button>
        <button type="button" className={action} disabled={!loaded || kind !== 'notebook'} onPointerDown={stop} onClick={() => send('restart')}><RotateCcw size={12} />Restart</button>
        <button type="button" aria-label="More notebook actions" className={action} onPointerDown={stop} onClick={() => setMenu(open => !open)}><MoreHorizontal size={14} /></button>
        {menu && (
          <div role="menu" className="absolute top-8 right-3 z-30 rounded-lg border border-line bg-white p-1 shadow-md" onPointerDown={stop}>
            <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink hover:bg-hover" onClick={download}><Download size={13} />Download {notebookName}</button>
          </div>
        )}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-b-xl border-t border-line">
        <iframe ref={frame} data-notebook-frame title="Jupyter notebook" src={notebookUrl(workspaceIdFor(block.notebook_id))} className="h-full w-full bg-white"
          sandbox="allow-scripts allow-same-origin allow-downloads" allow="clipboard-write"
          onLoad={open} />
        {!loaded && <p className="pointer-events-none absolute inset-0 grid place-items-center bg-white text-sm text-ink-2">Starting Python…</p>}
      </div>
    </>
  );
}
