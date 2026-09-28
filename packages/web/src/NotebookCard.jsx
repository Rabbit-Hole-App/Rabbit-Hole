import { useEffect, useRef, useState } from 'react';
import { Download, MoreHorizontal, Play, RotateCcw } from 'lucide-react';
import { NOTEBOOK_ORIGIN, NOTEBOOK_PROTOCOL, NOTEBOOK_URL, trimOutputs } from './learn-notebook.js';

// The body of a notebook card (docs/features/canvas-notebook.md): Rabbit Hole's
// header, then the real JupyterLite notebook in an iframe on the isolated
// notebook origin. The board owns the .ipynb; the iframe edits and runs it and
// reports every change back over the bridge.
export default function NotebookBody({ block, onSelect, onDocument }) {
  const frame = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [menu, setMenu] = useState(false);
  const ready = useRef(false);
  // Only the first load sends the document; later edits flow the other way.
  const initial = useRef(block.ipynb);
  const latest = useRef(onDocument);
  latest.current = onDocument;

  useEffect(() => {
    const receive = event => {
      if (event.source !== frame.current?.contentWindow || event.origin !== NOTEBOOK_ORIGIN || event.data?.protocol !== NOTEBOOK_PROTOCOL) return;
      if (event.data.type === 'loaded') {
        ready.current = true;
        setLoaded(true);
        // Jupyter focuses its notebook while starting; hand focus back so
        // the canvas keeps its keys until the learner clicks into a cell.
        if (document.activeElement === frame.current) frame.current.blur();
      }
      if (event.data.type === 'change' && event.data.ipynb?.cells) latest.current(trimOutputs(event.data.ipynb));
    };
    // Focus moving into the notebook is the canvas's only sign of a click
    // there, so it selects the card.
    const blurred = () => setTimeout(() => { if (ready.current && document.activeElement === frame.current) onSelect(block.id); });
    window.addEventListener('message', receive);
    window.addEventListener('blur', blurred);
    return () => { window.removeEventListener('message', receive); window.removeEventListener('blur', blurred); };
  }, [block.id, onSelect]);

  const send = type => frame.current?.contentWindow?.postMessage({ protocol: NOTEBOOK_PROTOCOL, type }, NOTEBOOK_ORIGIN);
  const download = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(block.ipynb, null, 1)], { type: 'application/x-ipynb+json' }));
    link.download = 'notebook.ipynb';
    link.click();
    URL.revokeObjectURL(link.href);
    setMenu(false);
  };
  const action = 'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40';

  return (
    <>
      <div data-drag-zone data-notebook-header className="relative flex shrink-0 cursor-grab items-center gap-2 px-4 pb-2 active:cursor-grabbing">
        <span className="text-[11px] font-semibold tracking-wider text-ink-2 uppercase">Notebook</span>
        <span className="text-[11px] text-ink-3">· Python</span>
        <span className="flex-1" />
        <button type="button" className={action} disabled={!loaded} onPointerDown={event => event.stopPropagation()} onClick={() => send('run-all')}><Play size={12} />Run all</button>
        <button type="button" className={action} disabled={!loaded} onPointerDown={event => event.stopPropagation()} onClick={() => send('restart')}><RotateCcw size={12} />Restart</button>
        <button type="button" aria-label="More notebook actions" className={action} onPointerDown={event => event.stopPropagation()} onClick={() => setMenu(open => !open)}><MoreHorizontal size={14} /></button>
        {menu && (
          <div role="menu" className="absolute top-8 right-3 z-30 rounded-lg border border-line bg-white p-1 shadow-md" onPointerDown={event => event.stopPropagation()}>
            <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink hover:bg-hover" onClick={download}><Download size={13} />Download .ipynb</button>
          </div>
        )}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-b-xl border-t border-line">
        <iframe ref={frame} data-notebook-frame title="Jupyter notebook" src={NOTEBOOK_URL} className="h-full w-full bg-white"
          sandbox="allow-scripts allow-same-origin allow-downloads" allow="clipboard-write"
          onLoad={() => frame.current?.contentWindow?.postMessage({ protocol: NOTEBOOK_PROTOCOL, type: 'init', ipynb: initial.current }, NOTEBOOK_ORIGIN)} />
        {!loaded && <p className="pointer-events-none absolute inset-0 grid place-items-center bg-white text-sm text-ink-2">Starting Python…</p>}
      </div>
    </>
  );
}
