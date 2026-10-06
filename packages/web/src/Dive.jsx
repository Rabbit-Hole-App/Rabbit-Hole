// /dive (docs/features/dive-v1.md): nested Rabbit Holes on a Learn canvas. The page wires three
// things from here: useDive (the tree, Ctrl+K, /dive, a pending hole's first object, return
// points), DiveNavigator (the descending roots in the tools' gutter) and DiveSuggestion (the
// agent's [Go down a Rabbit Hole] / [Keep it on this canvas], not wired to any model yet).
// The rules themselves are pure, in dive.js.
import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api, navigate } from './api.js';
import { Button, ConfirmDialog, Tip, toast } from './ui.jsx';
import { deviceId } from './home/canvas-local.js';
import { resolveTarget } from './learn-target.js';
import { anchorBlock, diveRecord, discardHole, dropPending, holeHref, keepPending, levelHref, meaningful, navigatorRows, newHoleName, pendingHole, pendingHoles, planDive, setReturn, takeReturn } from './dive.js';

// The red portal outline on an originating card, read by the canvas's card chrome.
export const DivePortals = createContext(null);

// A pending hole lives only while the learner is inside it. Leaving it while it is still empty,
// back up to its parent included, discards it: no record, no local keys, no portal, nothing on
// the map (owner 2026-10-01: empty Rabbit Holes are never shown).
function sweepPending() {
  const { pathname, search } = window.location, query = new URLSearchParams(search);
  for (const hole of Object.values(pendingHoles(sessionStorage))) {
    const here = pathname === `/apps/${hole.name}` || query.get('hole') === hole.name;
    if (!here && hole.base) discardHole({ session: sessionStorage, local: localStorage, base: hole.base, name: hole.name });
  }
}
if (typeof window !== 'undefined') { sweepPending(); window.addEventListener('popstate', sweepPending); }

// A pending hole is its parent's URL plus ?hole=; LearnPage renders the hole in the parent's place.
// Read on popstate only: once the hole persists, the URL moves without a remount.
export function usePendingHole(app) {
  const read = () => {
    const name = new URLSearchParams(window.location.search).get('hole');
    const hole = name && pendingHole(sessionStorage, name);
    return hole && hole.parent.app === app.name ? hole : null;
  };
  const [hole, setHole] = useState(read);
  useEffect(() => {
    const moved = () => setHole(read());
    window.addEventListener('popstate', moved);
    return () => window.removeEventListener('popstate', moved);
  }, [app.name]); // eslint-disable-line react-hooks/exhaustive-deps
  return hole;
}
// The hole as the app LearnPage renders: a canvas that exists only in this tab until it persists.
export const holeApp = (parent, hole) => ({
  name: hole.name, org: parent.org, email: parent.email || parent.owner_email, owner_email: parent.email || parent.owner_email,
  title: hole.title, kind: 'canvas', hosting: 'canvas', pending: true, canEdit: true, visibility: 'private', members: [],
});

// ponytail: the composer keeps its draft in AskPanel state; the return point reads and restores it
// through the DOM. Lift the draft into LearnPage if a second caller needs it.
const composer = () => document.querySelector('[data-learn-dock] textarea, [data-learn-dock] input:not([type="file"])');
function setDraft(text) {
  const element = composer();
  if (!element || !text) return;
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, text);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

export function useDive({ app, board, hole, canvasApi, canvasState, baseFor, onTitle, referent = () => '' }) {
  const holeRef = useRef(hole);
  const [persisted, setPersisted] = useState(false);
  const pending = !!hole && !persisted;
  const here = hole ? { app: hole.name, board: 'main' } : { app: app.name, board };
  const [tree, setTree] = useState(null);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const stateRef = useRef(canvasState); stateRef.current = canvasState;
  const treeRef = useRef(tree); treeRef.current = tree;

  const load = useCallback(async () => {
    try {
      if (!pending) { setTree(await api(`/api/canvases/dives?app=${encodeURIComponent(here.app)}&board=${encodeURIComponent(here.board)}`)); return; }
      const { parent, name, title, origin_block_id: origin } = holeRef.current;
      const above = await api(`/api/canvases/dives?app=${encodeURIComponent(parent.app)}&board=${encodeURIComponent(parent.board)}`);
      const path = above.path.map((level, index) => index === above.path.length - 1 ? { ...level, origin_block_id: origin } : level);
      setTree({ path: [...path, { app: name, board: 'main', title, kind: 'canvas', pending: true }], children: [], dive: holeRef.current.dive });
    } catch { setTree(null); } // not a canvas or project board of yours: no Rabbit Holes here
  }, [here.app, here.board, pending]);
  useEffect(() => { load(); }, [load]);

  // Down into a hole. Every hole has one originating card: the selected one (diveFromCard), or a
  // topic anchor card made on this canvas from the learner's request (diveFromTopic).
  // `block` is the originating block when the canvas has not rendered it yet (a new anchor card).
  const openHole = (card, title, via, anchored = false, fresh = null) => {
    const block = fresh || canvasApi.current?.block?.(card.id) || { id: card.id };
    const current = treeRef.current, name = newHoleName(), draft = composer()?.value || '';
    keepPending(sessionStorage, {
      name, title, parent: here, origin_block_id: card.id, base: baseFor(name),
      dive: diveRecord({ name, title, via, parent: here, target: resolveTarget(block), block, view: canvasApi.current?.getView?.(), question: draft.startsWith('/') ? '' : draft, level: current.path.length }),
    });
    // ponytail: the canvas saves 400ms after a change and an unmount drops the timer, so a new
    // anchor card waits for that save before the page leaves. Flush on unmount if this ever races.
    if (anchored) setTimeout(() => navigate(holeHref(here, name)), 600); else navigate(holeHref(here, name));
  };
  const diveFromTopic = (request, via = 'learner_slash') => {
    const block = anchorBlock(request);
    const id = canvasApi.current?.insertBlock?.(block);
    if (!id) return { notice: { tone: 'error', text: 'The anchor card could not be added here.' } };
    openHole({ id, title: block.title }, block.title, via, true, { ...block, id });
    return { notice: null };
  };
  const dive = (args = '', via = 'learner_slash', cardOverride = null) => {
    const card = cardOverride || stateRef.current.card, current = treeRef.current;
    if (!current) return { notice: { tone: 'info', text: 'Rabbit Holes open from a canvas or a project board.' } };
    if (pending) return { notice: { tone: 'info', text: 'Add something to this hole first, then go deeper.' } };
    const plan = planDive({ card, args, children: current.children, pending: pendingHoles(sessionStorage), parent: here, referent: card || args.trim() ? '' : referent() });
    if (plan.ask) return { notice: { tone: 'question', text: 'What do you want to go deeper into?' }, keep: '/dive ' };
    if (plan.anchor) return diveFromTopic(plan.anchor.request, via);
    if (plan.enter) { navigate(levelHref({ app: plan.enter })); return { notice: null }; }
    if (plan.resume) { navigate(holeHref(here, plan.resume)); return { notice: null }; }
    openHole(card, plan.create.title, via);
    return { notice: null };
  };
  const diveRef = useRef(dive); diveRef.current = dive;

  // Ctrl+K with a card selected dives; with none it falls through to the global Search (Search.jsx).
  useEffect(() => {
    const key = event => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k') return;
      if (!stateRef.current.card || !treeRef.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      diveRef.current('', 'learner_ctrl_k');
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  // The first canvas object keeps the hole: its canvas row and link, then the URL moves in place
  // (no remount, so nothing the canvas has not saved yet is lost).
  const saving = useRef(false), kept = useRef(false);
  useEffect(() => {
    if (!pending || saving.current || !meaningful(canvasState)) return;
    saving.current = true;
    const { name, title, parent, origin_block_id, dive: record } = holeRef.current;
    api('/api/canvases/dives', { method: 'POST', body: JSON.stringify({ name, title, parent, origin_block_id, dive: record, device_id: deviceId(localStorage) }) })
      .then(() => { kept.current = true; dropPending(sessionStorage, name); setPersisted(true); setError(''); window.history.replaceState(window.history.state, '', levelHref({ app: name })); })
      .catch(failure => { saving.current = false; setError(`This hole was not saved: ${failure.message}`); });
  }, [pending, canvasState.content]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only kept holes are children: an empty one was discarded on the way back up.
  const children = tree?.children || [];
  const enter = name => navigate(levelHref({ app: name }));

  // Arriving back at a level: its viewport, the originating card selected, the pending question.
  useEffect(() => {
    const point = takeReturn(sessionStorage, here);
    if (!point) return undefined;
    let tries = 0;
    const timer = setInterval(() => {
      const canvas = canvasApi.current;
      if (!canvas?.getView && ++tries < 60) return;
      clearInterval(timer);
      if (!canvas?.getView) return;
      setTimeout(() => {
        if (point.viewport) { canvas.setView({ x: point.viewport.x, y: point.viewport.y, z: point.viewport.zoom }); canvas.select(point.block_id); } else canvas.focusBlock(point.block_id);
        setDraft(point.pending_question);
      }, 250);
    }, 100);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A level of the tree: in this app, or - a shared canvas a hole began from - its share page, a page of its own.
  const go = level => (level.href ? window.location.assign(level.href) : navigate(levelHref(level)));
  // Up to an ancestor: the level just above gets the exact return point, higher ones their card.
  const climb = index => {
    const { path, dive: record } = treeRef.current, target = path[index];
    setReturn(sessionStorage, index === path.length - 2 && record?.return_point
      ? { app: target.app, board: target.board, ...record.return_point }
      : { app: target.app, board: target.board, block_id: target.origin_block_id });
    go(target);
  };

  const rename = async (level, value) => {
    const title = value.trim().slice(0, 120);
    if (!title || title === level.title) return;
    try {
      if (level.pending) {
        holeRef.current = { ...holeRef.current, title, dive: { ...holeRef.current.dive, title, concept: title } };
        keepPending(sessionStorage, holeRef.current);
      } else await api(`/api/apps/${encodeURIComponent(level.app)}`, { method: 'PATCH', body: JSON.stringify({ title }) });
      if (level.app === here.app) onTitle?.(title);
      setError('');
      load();
    } catch (failure) { setError(`Not renamed: ${failure.message}`); }
  };

  // Delete: a leaf after a plain confirmation; a hole with holes inside only after the subtree
  // warning names them. Never a silent cascade.
  const [confirm, setConfirm] = useState(null);
  const askDelete = async level => {
    // An empty hole is left, not deleted: nothing of it was saved. The only pending level the navigator
    // shows is the hole the learner is in (one left is discarded, and children come from the server).
    if (level.pending) {
      const entry = pendingHole(sessionStorage, level.app);
      if (entry) discardHole({ session: sessionStorage, local: localStorage, base: entry.base || baseFor(entry.name), name: entry.name });
      if (level.app === here.app) climb(treeRef.current.path.length - 2);
      return;
    }
    try {
      const below = await api(`/api/canvases/dives?app=${encodeURIComponent(level.app)}&board=main`);
      if (!below.children.length) { setConfirm({ level, descendants: [] }); return; }
      await api(`/api/canvases/dives/${level.app}`, { method: 'DELETE' });
    } catch (failure) {
      if (failure.status === 409 && failure.data?.descendants) setConfirm({ level, descendants: failure.data.descendants });
      else setError(`Not deleted: ${failure.message}`);
    }
  };
  const doDelete = async () => {
    const { level, descendants } = confirm;
    setConfirm(null);
    try {
      const { deleted } = await api(`/api/canvases/dives/${level.app}${descendants.length ? '?subtree=1' : ''}`, { method: 'DELETE' });
      for (const name of deleted) discardHole({ session: sessionStorage, local: localStorage, base: baseFor(name), name });
      const path = treeRef.current.path, at = path.findIndex(entry => deleted.includes(entry.app));
      if (at > 0) go(path[at - 1]); else load();
    } catch (failure) {
      if (failure.status === 409 && failure.data?.descendants) setConfirm({ level, descendants: failure.data.descendants });
      else setError(`Not deleted: ${failure.message}`);
    }
  };

  // The Tutor's suggested dive (later): window.dispatchEvent(new CustomEvent('small:dive-suggest', { detail: { blockId, topic } })).
  // With a blockId the card is the origin; without one a topic anchor card is made on confirm.
  useEffect(() => {
    const suggest = event => setSuggestion(event.detail?.topic ? { blockId: event.detail.blockId || null, topic: String(event.detail.topic) } : null);
    window.addEventListener('small:dive-suggest', suggest);
    return () => window.removeEventListener('small:dive-suggest', suggest);
  }, []);
  const acceptSuggestion = () => {
    const { blockId, topic } = suggestion;
    setSuggestion(null);
    if (blockId) diveRef.current(topic, 'tutor_confirmed', { id: blockId, title: topic }); else diveFromTopic(topic, 'tutor_confirmed');
  };

  const portals = Object.fromEntries(children.map(child => [child.origin_block_id, { name: child.name, title: child.title, pending: !!child.pending }]));
  return {
    tree, pending, error, confirm, suggestion, diveFromTopic,
    run: args => dive(args, 'learner_slash'),
    // Double-clicking a card or a group goes down its hole, making it first when it has none.
    // The first click of the double-click selected the card, so its title is already known.
    portals: { portals, enter, open: (id, title) => {
      const known = stateRef.current.card?.id === id ? stateRef.current.card : null;
      const { notice } = dive('', 'learner_dblclick', title ? { id, title } : known || { id, title: canvasApi.current?.block?.(id)?.title || '' });
      if (notice?.text) toast(notice.text);
    } },
    navigator: { tree: tree && { ...tree, children }, pending, error, climb, enter, rename, askDelete },
    // An empty hole says what it is and what keeps it; gone with the first object.
    emptyHint: pending && !canvasState.content && tree && <div data-dive-empty className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-ink-2">A new Rabbit Hole under {tree.path.at(-2)?.title}</p>
        <p className="mt-1 text-xs text-ink-3">Add a card, a drawing or a note and it is kept. Leave this Rabbit Hole with nothing in it and it disappears.</p>
      </div>
    </div>,
    confirmDialog: confirm && <ConfirmDialog
      title={confirm.descendants.length ? `Delete "${confirm.level.title}" and everything inside it?` : `Delete "${confirm.level.title}"?`}
      body={confirm.descendants.length
        ? <>This Rabbit Hole has {confirm.descendants.length} hole{confirm.descendants.length === 1 ? '' : 's'} inside it, and they go too: <span className="font-medium text-ink">{confirm.descendants.map(hole => hole.title).join(', ')}</span>. Their canvases are removed from this browser.</>
        : 'Its canvas is removed from this browser, and the card it came from loses its outline.'}
      confirmLabel={confirm.descendants.length ? `Delete ${confirm.descendants.length + 1} holes` : 'Delete'}
      onCancel={() => setConfirm(null)} onConfirm={doDelete} />,
    suggestionCard: suggestion && <DiveSuggestion topic={suggestion.topic} onDive={acceptSuggestion} onKeep={() => setSuggestion(null)} />,
  };
}

// Geometric by design (owner, R-1): straight connectors with a ▾ head, square-capped arrows.
// Top is shallower, bottom deeper: ↑ climbs to the parent, ↓ descends.
const Root = ({ tall = false }) => { const h = tall ? 18 : 14; return <svg aria-hidden="true" width="10" height={h} viewBox={`0 0 10 ${h}`} className="shrink-0 text-[#b3a594]"><line x1="5" y1="1" x2="5" y2={h - 5} stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" /><path d={`M2.5 ${h - 5} H7.5 L5 ${h - 1} Z`} fill="currentColor" /></svg>; };
const Arrow = ({ up = false, size = 12 }) => <svg aria-hidden="true" width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" className="shrink-0">{up ? <path d="M6 10.5V2M2.5 5.5 6 2l3.5 3.5" /> : <path d="M6 1.5V10M2.5 6.5 6 10l3.5-3.5" />}</svg>;

function Name({ level, className, onOpen, onRename, active = false }) {
  const [draft, setDraft] = useState(null);
  if (draft !== null) return <input autoFocus value={draft} aria-label="Rename this Rabbit Hole" maxLength={120}
    onChange={event => setDraft(event.target.value)} onBlur={() => setDraft(null)}
    onKeyDown={event => { if (event.key === 'Enter') { onRename(level, draft); setDraft(null); } if (event.key === 'Escape') { event.stopPropagation(); setDraft(null); } }}
    className="w-full rounded-sm border border-line bg-white px-1 py-0.5 text-center text-[11px] text-ink outline-none focus:border-[#b42318]/50" />;
  const renamable = level.kind === 'canvas';
  // One line, never wrapped: the full name is in the tooltip.
  return <Tip label={level.title} info={renamable ? 'Double-click to rename' : level.kind === 'shared' ? 'Shared canvas this hole started from (view only)' : null} align="end">
    <button type="button" data-dive-level={level.app} onClick={onOpen} onDoubleClick={renamable ? () => setDraft(level.title) : undefined}
      className={`block max-w-full truncate rounded-sm py-0.5 ${active ? 'bg-[#b42318] px-1.5 text-white' : 'px-0.5 hover:bg-hover'} ${className}`}>{level.title}</button>
  </Tip>;
}

// The descending roots (R-1): path from the root, the current level marked, then its children.
// ↑ climbs to the parent; ↓ goes down, through a compact picker when there are several.
export function DiveNavigator({ tree, pending, error, climb, enter, rename, askDelete }) {
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!picking) return undefined;
    const close = event => { if (!event.target.closest?.('[data-dive-picker],[data-dive-down]')) setPicking(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [picking]);
  if (!tree) return null;
  const rows = navigatorRows({ path: tree.path, children: [] });
  const current = tree.path.at(-1), children = tree.children, up = tree.path.length > 1;
  const down = () => (children.length === 1 ? enter(children[0].name) : setPicking(open => !open));
  return (
    <nav data-dive-navigator aria-label="Rabbit Hole levels" className="relative flex w-[76px] flex-col items-center text-center text-[11px] leading-[14px] select-none">
      <span data-dive-map-title className="mb-1 text-[10px] leading-tight font-medium whitespace-nowrap text-ink-3">Rabbit Holes Map</span>
      {up && <button type="button" aria-label="Up to the parent hole" title={`Up to ${tree.path.at(-2).title}`}
        onClick={() => climb(tree.path.length - 2)} className="flex h-6 w-6 items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink">
        <Arrow up />
      </button>}
      {rows.map((row, index) => <div key={row.role === 'fold' ? 'fold' : row.app} className="flex w-full flex-col items-center">
        {(index > 0 || up) && <Root tall={row.role === 'current'} />}
        {row.role === 'fold' && <span title={`${row.count} more levels`} className="px-1 text-ink-3">⋯ {row.count}</span>}
        {row.role === 'ancestor' && <Name level={row} className="text-ink-3 hover:text-ink" onOpen={() => climb(tree.path.findIndex(level => level.app === row.app && level.board === row.board))} onRename={rename} />}
        {row.role === 'current' && <div className="group relative flex w-full flex-col items-center" aria-current="location">
          {/* The hole you are in: a red square and a red label with white text, unmistakable at a glance. */}
          <span aria-hidden="true" title={pending ? 'Empty: kept once you add something' : undefined}
            className="mb-1 h-2 w-2 bg-[#b42318]" />
          <Name level={current} active className={`font-semibold ${pending ? 'italic' : ''}`} onOpen={() => {}} onRename={rename} />
          {index > 0 && <button type="button" aria-label={`Delete ${current.title}`} title={pending ? 'Leave this empty hole' : 'Delete this hole'} onClick={() => askDelete(current)}
            className="absolute -right-1 bottom-0 hidden h-5 w-5 items-center justify-center rounded-sm text-ink-3 group-hover:flex hover:bg-hover hover:text-[#b42318] focus:flex"><Trash2 size={11} /></button>}
        </div>}
      </div>)}
      {children.length > 0 && <>
        <Root />
        {/* Several holes below: the tooltip names them all before the picker opens. */}
        <Tip label={children.length === 1 ? children[0].title : `${children.length} holes below`} info={children.length > 1 ? children.map(child => child.title).join(' · ') : null} align="end">
          <button type="button" data-dive-down aria-label="Down into a hole" aria-expanded={children.length > 1 ? picking : undefined}
            onClick={down} className="flex max-w-full items-center gap-0.5 rounded-sm px-1 py-0.5 whitespace-nowrap text-ink-2 hover:bg-hover hover:text-ink">
            <Arrow size={11} />
            <span className="truncate">{children.length === 1 ? children[0].title : `${children.length} holes`}</span>
          </button>
        </Tip>
      </>}
      {error && <p role="alert" className="mt-1.5 text-[10px] leading-3 text-[#b42318]">{error}</p>}
      {picking && children.length > 1 && (
        <div data-dive-picker role="menu" aria-label="Holes below" className="absolute top-full right-0 z-30 mt-1 w-56 rounded-md border border-line bg-white p-1 text-left shadow-pop">
          <p className="px-2 pt-1 pb-1.5 text-[11px] text-ink-3">Below {current.title}</p>
          {children.map(child => <div key={child.name} className="group flex items-center rounded-sm hover:bg-hover">
            <button type="button" role="menuitem" onClick={() => { setPicking(false); enter(child.name); }} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm text-ink">
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 ${child.pending ? 'border border-dashed border-[#b42318]' : 'bg-[#b42318]/70'}`} /><span title={child.title} className={`truncate ${child.pending ? 'italic' : ''}`}>{child.title}</span>
            </button>
            <button type="button" aria-label={`Delete ${child.title}`} title={child.pending ? 'Leave this empty hole' : 'Delete this hole'} onClick={() => { setPicking(false); askDelete({ ...child, app: child.name, kind: 'canvas' }); }}
              className="mr-1 hidden h-6 w-6 items-center justify-center rounded text-ink-3 group-hover:flex hover:text-[#b42318]"><Trash2 size={12} /></button>
          </div>)}
        </div>
      )}
    </nav>
  );
}

// The agent's suggestion, anchored to one card: dive, or keep it here. Structure only in v1.
export function DiveSuggestion({ topic, onDive, onKeep }) {
  return (
    <div data-dive-suggestion role="group" aria-label="Suggested Rabbit Hole" className="flex flex-wrap items-center gap-2 rounded-xl border border-[#b42318]/25 bg-white px-3 py-2 text-sm shadow-md">
      <span className="text-ink-2">This needs <span className="font-medium text-ink">{topic}</span> first.</span>
      <Button size="sm" variant="secondary" onClick={onDive}>Go down a Rabbit Hole</Button>
      <Button size="sm" variant="ghost" onClick={onKeep}>Keep it on this canvas</Button>
    </div>
  );
}
