import { useEffect, useId, useRef, useState } from 'react';
import { Search, Shapes } from 'lucide-react';
import { pickCanvases } from './canvas-refs.js';
import { Button } from './ui.jsx';

// "Link to canvas" (brief sections 4 and 5; C:/s/spec/references-plan.md UI): one picker for a card's menu, the
// empty-canvas menu and Insert. It searches the canvases this person may read (the server's pickCanvases, bounded,
// this canvas excluded), by title with the path telling equal titles apart. Up/Down choose, Enter adds, Escape closes
// without a change and gives focus back. No AI, no URLs, no new canvas.
// linked: the targets the card already references (shown "Already linked", never added twice).
// onPick(canvas) -> { ok } | { ok: false, reason: 'exists' | 'unsupported' | 'limit' }; ok closes the picker.
// mention: the Chat composer's "Mention a canvas" (ask.jsx): the viewer's own Rabbit Holes are listed too, and a parent project,
// hole or owner shows only where two listed canvases share a title.
export default function CanvasRefPicker({ exclude, linked = [], onPick, onClose, returnFocus = null, mention = false }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState({ state: 'loading', canvases: [], more: false });
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [taken, setTaken] = useState(() => new Set(linked));
  const [attempt, setAttempt] = useState(0);
  const input = useRef(null), opener = useRef(null);
  const listId = useId();
  useEffect(() => {
    opener.current = document.activeElement;
    input.current?.focus();
    return () => { const back = returnFocus?.() || opener.current; if (back?.isConnected) back.focus(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Escape closes from anywhere while the picker is open, wherever focus went.
  useEffect(() => {
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [onClose]);
  useEffect(() => {
    const control = new AbortController();
    setResult(previous => ({ ...previous, state: 'loading' }));
    const timer = setTimeout(() => {
      pickCanvases(query.trim(), exclude, control.signal, mention)
        .then(data => {
          if (control.signal.aborted) return;
          const canvases = (data?.canvases || []).filter(canvas => canvas.id !== exclude);
          setResult({ state: canvases.length ? 'ready' : 'empty', canvases, more: !!data?.more });
          setChosen(previous => (canvases.some(canvas => canvas.id === previous?.id) ? previous : null));
        })
        .catch(() => { if (!control.signal.aborted) setResult({ state: 'error', canvases: [], more: false }); });
    }, query ? 200 : 0);
    return () => { clearTimeout(timer); control.abort(); };
  }, [query, exclude, attempt, mention]);
  const canvases = result.state === 'ready' ? result.canvases : [];
  const showPath = canvas => !!canvas.path && (!mention || canvases.some(other => other !== canvas && other.title === canvas.title));
  const can = !!chosen && !taken.has(chosen.id) && !busy;
  const add = async () => {
    if (!can) return;
    setBusy(true); setNote('');
    try {
      const answer = await onPick(chosen);
      if (answer?.ok) { onClose(); return; }
      if (answer?.reason === 'exists') setTaken(previous => new Set([...previous, chosen.id]));
      else setNote(answer?.reason === 'unsupported' ? 'This kind of card cannot hold a link yet.' : answer?.reason === 'limit' ? 'This card already has the most links it can hold (20).' : "Couldn't add the link. Try again.");
    } catch { setNote("Couldn't add the link. Try again."); }
    setBusy(false);
  };
  const move = step => {
    if (!canvases.length) return;
    const at = canvases.findIndex(canvas => canvas.id === chosen?.id);
    const next = canvases[at < 0 ? (step > 0 ? 0 : canvases.length - 1) : (at + step + canvases.length) % canvases.length];
    setChosen(next);
    document.getElementById(`${listId}-${next.id}`)?.scrollIntoView({ block: 'nearest' });
  };
  const keys = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1); }
    else if (event.key === 'Enter' && event.target === input.current) { event.preventDefault(); add(); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[12vh]" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={`${listId}-title`} data-ref-picker data-mention-picker={mention || undefined} onKeyDown={keys}
        className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-line bg-white shadow-pop">
        <h2 id={`${listId}-title`} className="px-4 pt-4 pb-2 text-base font-semibold text-ink">{mention ? 'Mention a canvas' : 'Link to canvas'}</h2>
        <label className="mx-4 flex h-9 items-center gap-2 rounded-lg border border-line px-2.5 focus-within:border-ink-3">
          <Search size={15} aria-hidden className="shrink-0 text-ink-3" />
          <input ref={input} type="text" role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={chosen ? `${listId}-${chosen.id}` : undefined} aria-label="Search canvases" placeholder="Search canvases"
            value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3" />
        </label>
        <div data-picker-state={result.state} aria-busy={result.state === 'loading' || undefined} className="mt-2 min-h-24 flex-1 overflow-y-auto px-2">
          {result.state === 'loading' && <p className="px-2 py-3 text-sm text-ink-2">Searching</p>}
          {result.state === 'empty' && <p className="px-2 py-3 text-sm text-ink-2">{query.trim() ? 'No canvases match.' : mention ? 'No other canvases yet.' : 'No other canvases to link yet.'}</p>}
          {result.state === 'error' && <div className="flex items-center gap-2 px-2 py-3 text-sm text-ink-2">Couldn't load canvases.<Button variant="secondary" size="sm" onClick={() => setAttempt(n => n + 1)}>Retry</Button></div>}
          <ul id={listId} role="listbox" aria-label="Canvases" className={result.state === 'ready' ? '' : 'hidden'}>
            {canvases.map(canvas => {
              const already = taken.has(canvas.id), selected = chosen?.id === canvas.id;
              return (
                <li key={canvas.id} id={`${listId}-${canvas.id}`} role="option" aria-selected={selected} data-picker-option={canvas.id}
                  onMouseDown={event => event.preventDefault()} onClick={() => setChosen(canvas)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 ${selected ? 'bg-hover ring-1 ring-line-strong' : 'hover:bg-hover'}`}>
                  <Shapes size={16} strokeWidth={1.8} aria-hidden className="shrink-0 text-ink-3" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-ink" title={canvas.title}>{canvas.title}</span>
                    {showPath(canvas) && <span data-picker-path className="truncate text-xs text-ink-2" title={canvas.path}>{canvas.path}</span>}
                  </span>
                  {already && <span data-already-linked className="shrink-0 text-xs text-ink-2">{mention ? 'Already mentioned' : 'Already linked'}</span>}
                </li>
              );
            })}
          </ul>
          {result.state === 'ready' && result.more && <p className="px-2 py-2 text-xs text-ink-3">More canvases match. Type more of the title to narrow them.</p>}
        </div>
        {note && <p role="status" className="px-4 pt-2 text-sm text-red-700">{note}</p>}
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!can} onClick={add}>{mention ? 'Mention' : 'Add link'}</Button>
        </div>
      </div>
    </div>
  );
}
