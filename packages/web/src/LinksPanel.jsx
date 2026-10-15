import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, ExternalLink, Shapes } from 'lucide-react';
import { loadLinks } from './canvas-refs.js';
import { Button } from './ui.jsx';

// Canvas references (C:/s/spec/references-plan.md, brief sections 6 and 9): the board's links, read from the server
// (loadLinks), which filters what this viewer may see. One request per board serves the Links tab and the chips.
// The picker's choices are cached by target so a link not yet saved and indexed still shows its title; the server's
// answer wins once it has the target. A target the server leaves out after a good answer resolves as Unavailable
// (a ref the saver could not read is never indexed). Refreshes: board change, panel reopen, the browser tab coming
// back, and refresh() after a save that changed the links. An answer for another board is dropped.
export function useCanvasLinks({ boardId, shown }) {
  const [links, setLinks] = useState({ status: 'loading', board: boardId, from: [], to: [] });
  const cache = useRef(new Map()), request = useRef(null), wasShown = useRef(shown);
  const refresh = useCallback(() => {
    request.current?.abort();
    if (!boardId) { setLinks({ status: 'none', board: null, from: [], to: [] }); return; }
    const control = new AbortController();
    request.current = control;
    setLinks(previous => (previous.board === boardId && previous.status === 'ready' ? previous : { status: 'loading', board: boardId, from: [], to: [] }));
    loadLinks(boardId, control.signal).then(data => {
      if (control.signal.aborted || data?.board !== boardId) return;
      setLinks({ status: 'ready', board: boardId, from: data.from || [], to: data.to || [] });
    }).catch(() => { if (!control.signal.aborted) setLinks({ status: 'error', board: boardId, from: [], to: [] }); });
  }, [boardId]);
  useEffect(() => { refresh(); return () => request.current?.abort(); }, [refresh]);
  useEffect(() => { if (shown && !wasShown.current) refresh(); wasShown.current = shown; }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [refresh]);
  const current = links.board === boardId;
  const status = current ? links.status : 'loading';
  const resolve = useCallback(target => {
    const group = current && links.from.find(entry => entry.target === target);
    if (group) return group.unavailable ? { unavailable: true } : group;
    return cache.current.get(target) || (status === 'ready' ? { unavailable: true } : null);
  }, [links, current, status]);
  const remember = useCallback(canvas => { cache.current.set(canvas.id, canvas); }, []);
  return { status, from: current ? links.from : [], to: current ? links.to : [], refresh, resolve, remember };
}

// A plain left click stays in this tab through go() (it saves first); modifier, middle and right clicks stay native.
export const plainClick = event => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
export const openInNewTab = href => window.open(href, '_blank', 'noopener');

function NewTab({ href }) {
  return (
    <button type="button" aria-label="Open canvas in new tab" title="Open canvas in new tab" onClick={() => openInNewTab(href)}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"><ExternalLink size={13} strokeWidth={1.8} aria-hidden /></button>
  );
}

const count = n => `${n} reference${n === 1 ? '' : 's'}`;
const cardTitle = ref => ref.objectTitle?.trim() || 'Untitled card';

function Group({ group, children, go, from }) {
  const [open, setOpen] = useState(false);
  const n = group.refs?.length || 0;
  return (
    <li data-links-group={from ? group.target : group.source} className="rounded-lg border border-line">
      <div className="flex min-w-0 items-center gap-1 px-1.5 py-1">
        <button type="button" aria-expanded={open} aria-label={open ? 'Hide the cards' : 'Show the cards'} onClick={() => setOpen(!open)}
          className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink">
          <ChevronRight size={14} aria-hidden className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        <Shapes size={14} strokeWidth={1.8} aria-hidden className="shrink-0 text-ink-3" />
        {group.unavailable
          ? <span data-unavailable className="min-w-0 flex-1 truncate text-sm text-ink-3">Unavailable</span>
          : <a href={group.href} title={group.title} onClick={event => { if (plainClick(event)) { event.preventDefault(); go(group.href); } }}
            className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:underline">{group.title}</a>}
        <span data-links-count className="shrink-0 text-xs text-ink-2 tabular-nums">{count(n)}</span>
        {!group.unavailable && <NewTab href={group.href} />}
      </div>
      {open && <ul className="border-t border-line px-2 py-1">{children}</ul>}
    </li>
  );
}

// The Links tab (brief section 9): links from this canvas, grouped by destination, each origin card revealed here;
// backlinks, grouped by source canvas, each reference opening that canvas at its card (refs[].href).
export default function LinksPanel({ hidden, links, go, onFocusCard }) {
  const { status, from, to } = links;
  const body = status === 'none' ? <p className="text-sm text-ink-2">Links appear once this canvas is saved.</p>
    : status === 'loading' ? <p className="text-sm text-ink-2">Loading links…</p>
    : status === 'error' ? <div className="flex items-center gap-2 text-sm text-ink-2">Couldn't load links.<Button variant="secondary" size="sm" onClick={links.refresh}>Retry</Button></div>
    : <>
      <section data-links-from aria-labelledby="links-from-title" className="space-y-2">
        <h3 id="links-from-title" className="text-xs font-semibold text-ink-2">Links from this canvas</h3>
        {from.length ? <ul className="space-y-1.5">{from.map(group => (
          <Group key={group.target} group={group} go={go} from>
            {(group.refs || []).map(ref => <li key={ref.id}><button type="button" data-links-origin={ref.object} onClick={() => onFocusCard(ref.object)}
              className="w-full truncate rounded-md px-2 py-1 text-left text-sm text-ink-2 hover:bg-hover hover:text-ink">{cardTitle(ref)}</button></li>)}
          </Group>))}</ul>
          : <p className="text-sm text-ink-2">No links from this canvas yet.</p>}
      </section>
      <section data-links-to aria-labelledby="links-to-title" className="space-y-2">
        <h3 id="links-to-title" className="text-xs font-semibold text-ink-2">Backlinks</h3>
        {to.length ? <ul className="space-y-1.5">{to.map(group => (
          <Group key={group.source} group={group} go={go}>
            {(group.refs || []).map(ref => <li key={ref.id} className="flex min-w-0 items-center">
              <a href={ref.href} data-links-backlink={ref.object} onClick={event => { if (plainClick(event)) { event.preventDefault(); go(ref.href); } }}
                className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-sm text-ink-2 hover:bg-hover hover:text-ink hover:underline">{cardTitle(ref)}</a>
              <NewTab href={ref.href} /></li>)}
          </Group>))}</ul>
          : <p className="text-sm text-ink-2">No other canvases reference this canvas yet.</p>}
      </section>
    </>;
  return (
    <div role="tabpanel" aria-label="Links" data-links-panel className={`${hidden ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col`}>
      <div data-links-state={status === 'none' ? 'ready' : status} aria-busy={status === 'loading' || undefined} className="min-h-0 flex-1 space-y-5 overflow-y-auto">{body}</div>
    </div>
  );
}
