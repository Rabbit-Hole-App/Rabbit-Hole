import { useEffect, useId, useRef, useState } from 'react';
import { ListTree, Search, Shapes } from 'lucide-react';
import { Button } from './ui.jsx';

// "Add a link" (owner 2026-11-07): the chooser, and the local picker both Link to TOC steps use. Same shell, classes and keys as
// CanvasRefPicker.jsx (read it first; this is its list with local data and no network): a searchable list, Up/Down choose, Enter adds,
// Escape closes without a change and gives focus back.

// The first step: what kind of link. 'Link to canvas' keeps the existing canvas picker; 'Link to TOC' links to a section of this canvas.
export function AddLinkChooser({ onChoose, onClose, returnFocus = null }) {
  const id = useId(), opener = useRef(null), first = useRef(null);
  useEffect(() => {
    opener.current = document.activeElement;
    first.current?.focus();
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('keydown', escape, true); const back = returnFocus?.() || opener.current; if (back?.isConnected) back.focus(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const row = 'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2.5 text-left text-sm font-medium text-ink hover:bg-hover focus-visible:bg-hover';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[12vh]" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} data-add-link-chooser className="flex w-full max-w-xs flex-col rounded-xl border border-line bg-white shadow-pop">
        <h2 id={`${id}-title`} className="px-4 pt-4 pb-2 text-base font-semibold text-ink">Add a link</h2>
        <div className="px-2 pb-2">
          <button ref={first} type="button" data-link-choice="canvas" onClick={() => onChoose('canvas')} className={row}><Shapes size={16} strokeWidth={1.8} aria-hidden className="shrink-0 text-ink-3" />Link to canvas</button>
          <button type="button" data-link-choice="toc" onClick={() => onChoose('toc')} className={row}><ListTree size={16} strokeWidth={1.8} aria-hidden className="shrink-0 text-ink-3" />Link to TOC</button>
        </div>
        <div className="flex justify-end border-t border-line px-4 py-3"><Button variant="secondary" onClick={onClose}>Cancel</Button></div>
      </div>
    </div>
  );
}

// items: [{ id, title, path? }]; linked: ids already linked ("Already linked", never added twice). onPick(item) -> { ok } | { ok: false, reason }.
export default function ItemPicker({ title, searchLabel, items, linked = [], onPick, onClose, returnFocus = null, emptyText = 'Nothing to link yet.', Icon = ListTree }) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [taken, setTaken] = useState(() => new Set(linked));
  const input = useRef(null), opener = useRef(null);
  const listId = useId();
  useEffect(() => {
    opener.current = document.activeElement;
    input.current?.focus();
    return () => { const back = returnFocus?.() || opener.current; if (back?.isConnected) back.focus(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [onClose]);
  const needle = query.trim().toLowerCase();
  const shown = needle ? items.filter(item => item.title.toLowerCase().includes(needle)) : items;
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
    if (!shown.length) return;
    const at = shown.findIndex(item => item.id === chosen?.id);
    const next = shown[at < 0 ? (step > 0 ? 0 : shown.length - 1) : (at + step + shown.length) % shown.length];
    setChosen(next);
    document.getElementById(`${listId}-${next.id}`)?.scrollIntoView({ block: 'nearest' });
  };
  const keys = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1); }
    else if (event.key === 'Enter' && event.target === input.current) { event.preventDefault(); add(); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[12vh]" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={`${listId}-title`} data-item-picker onKeyDown={keys} className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-line bg-white shadow-pop">
        <h2 id={`${listId}-title`} className="px-4 pt-4 pb-2 text-base font-semibold text-ink">{title}</h2>
        <label className="mx-4 flex h-9 items-center gap-2 rounded-lg border border-line px-2.5 focus-within:border-ink-3">
          <Search size={15} aria-hidden className="shrink-0 text-ink-3" />
          <input ref={input} type="text" role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={chosen ? `${listId}-${chosen.id}` : undefined}
            aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3" />
        </label>
        <div className="mt-2 min-h-24 flex-1 overflow-y-auto px-2">
          {!shown.length && <p className="px-2 py-3 text-sm text-ink-2">{needle ? 'Nothing matches.' : emptyText}</p>}
          <ul id={listId} role="listbox" aria-label={searchLabel}>
            {shown.map(item => {
              const already = taken.has(item.id), selected = chosen?.id === item.id;
              return (
                <li key={item.id} id={`${listId}-${item.id}`} role="option" aria-selected={selected} data-picker-option={item.id} onMouseDown={event => event.preventDefault()} onClick={() => setChosen(item)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 ${selected ? 'bg-hover ring-1 ring-line-strong' : 'hover:bg-hover'}`}>
                  <Icon size={16} strokeWidth={1.8} aria-hidden className="shrink-0 text-ink-3" />
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    {item.path && <span className="shrink-0 text-xs text-ink-2 tabular-nums">{item.path}</span>}
                    <span className="truncate text-sm font-medium text-ink" title={item.title}>{item.title}</span>
                  </span>
                  {already && <span data-already-linked className="shrink-0 text-xs text-ink-2">Already linked</span>}
                </li>
              );
            })}
          </ul>
        </div>
        {note && <p role="status" className="px-4 pt-2 text-sm text-red-700">{note}</p>}
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!can} onClick={add}>Add link</Button>
        </div>
      </div>
    </div>
  );
}
