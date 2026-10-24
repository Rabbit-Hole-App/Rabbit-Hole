// Pinned Study (UI-27 Release 1, contract C:/s/spec/pinned-study/contract.md): a reference pinned beside the canvas's own
// notebook and canvas. The pane is a sibling of LearnPage's canvas frame, never its parent: the frame only gets a margin, so the
// notebook card's iframe never moves to another parent (a moved iframe reloads and restarts its Python). "Notebook" is the same
// canvas with its camera framed on the notebook card; "Canvas" puts back the camera and selection the learner left.
// Layout actions make no model call and no board save; the arrangement is remembered in this browser only (study-state.js).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LocateFixed, MessageSquarePlus, MoreHorizontal, Pin, PinOff, Replace } from 'lucide-react';
import SourceReader from './SourceReader.jsx';
import { LearningBlockBody } from './LearningBlocks.jsx';
import { Menu, MenuItem, useMenuButton } from './ui.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';
import { pdfRef } from './pdf-source.js';
import { objectName } from './selection-ref.js';
import { browserStorage } from './home/canvas-local.js';
import { attachStillCurrent, authorizePinnedSource, createPinnedAttacher } from './study-attach.js';
import { wsHeaders } from './api.js';
import { SWITCH_ROW, pinRef, pinnedAttachSnapshot, sourceOrigin, studyOffsets, versionLine } from './study-ref.js';
import { eligible, readStudy, readerPinTarget, setStudyReaderPin, studyKey, studyLayout, studyReducer, studyScope, studyStatusText, writeStudy } from './study-state.js';

const TYPE_LABELS = { pdf: 'PDF', text: 'Note', explanation: 'Explanation' };
const STEP = 0.05;

// A canvas object by id: a card, else a text or sticky note.
const objectOf = (api, id) => api?.block?.(id) || api?.boardNow?.().items?.find(item => item.id === id) || null;
// Everything on this canvas that can be pinned, in canvas order; nothing is seeded.
function eligibleCards(api) {
  if (!api) return [];
  const all = [...(api.blocks?.() || []), ...(api.boardNow?.().items || [])];
  return all.filter(object => eligible(object) && pinRef(object)).map(object => ({ id: object.id, kind: eligible(object), name: objectName(object) }));
}
const notebooksOf = api => (api?.blocks?.() || []).filter(block => block.type === 'notebook');

// The page's one Study state for this canvas (LearnPage calls it once). The reader's place is kept out of React state, so
// scrolling a reference never re-renders the page; it is written a moment later, to the canvas it was made for.
export function useStudy(canvasKey, board, canvasApi) {
  const scope = studyScope(canvasKey, board);
  // A value read back from a store that outlives the page is saved; one read from the blocked browser's in-memory stand-in is not.
  const read = at => {
    const storage = browserStorage();
    let stored = false;
    try { stored = storage?.getItem(studyKey(at)) != null; } catch { /* blocked reads as unsaved */ }
    return { scope: at, value: readStudy(storage, at), status: stored ? (storage.memory === true ? 'error' : 'saved') : null };
  };
  const [held, setHeld] = useState(() => read(scope));
  const live = useRef(held), timer = useRef(null), nav = useRef(null);
  let current = held;
  if (held.scope !== scope) { current = read(scope); live.current = current; nav.current = null; setHeld(current); }
  // A reader write still waiting for the canvas just left is dropped, never written to the new one.
  useEffect(() => () => clearTimeout(timer.current), [scope]);
  const save = (at, value) => { const result = writeStudy(browserStorage(), at, value); return result.ok ? 'saved' : 'error'; };
  const apply = actions => {
    const at = live.current.scope;
    const value = actions.reduce(studyReducer, live.current.value);
    clearTimeout(timer.current);
    live.current = { scope: at, value, status: save(at, value) };
    setHeld(live.current);
  };
  const readerAt = reader => {
    const at = live.current.scope;
    live.current = { ...live.current, value: studyReducer(live.current.value, { type: 'readerAt', reader }) };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (live.current.scope !== at) return;
      const status = save(at, live.current.value);
      if (status !== live.current.status) { live.current = { ...live.current, status }; setHeld(live.current); }
    }, 400);
  };
  const api = () => canvasApi.current;
  // The canvas surface clips (overflow hidden) yet a browser focus or reveal can still scroll it, sliding every card under a
  // camera that never moved (AdaptiveCanvas turns only the document caret's scroll into a camera move). Each Study camera move
  // (Notebook, Canvas, Locate) puts it back to 0 first, so the framed card is where the camera put it.
  const unslide = () => { const surface = document.querySelector('[aria-label="Lesson canvas"] [data-canvas-surface]'); if (surface) { surface.scrollTop = 0; surface.scrollLeft = 0; } };
  const pinCardRef = useRef(null);
  useEffect(() => {
    setStudyReaderPin({ target: sourceId => readerPinTarget(api()?.blocks?.() || [], sourceId, pdfRef), pin: id => pinCardRef.current?.(id) });
    return () => setStudyReaderPin(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const state = current.value;
  const study = {
    state, mode: state.mode, open: state.mode === 'study', status: current.status, scope,
    reader: () => live.current.value.reader,
    readerAt,
    setMode: mode => apply([{ type: 'setMode', mode }]),
    setSplit: split => apply([{ type: 'setSplit', split }]),
    // View > Show / hide in Study: this canvas's Study choice, written like every other Study change (Not saved when storage refuses).
    setMap: (name, on) => apply([{ type: 'setMap', name, on }]),
    unpin: () => { nav.current = null; apply([{ type: 'unpin' }]); },
    // Pin for study, Change reference and Choose a reference: the actual card clicked, never another of the same name.
    pinCard: id => {
      const object = objectOf(api(), id), ref = object && pinRef(object);
      if (!ref) return false;
      apply([{ type: 'pin', cardId: id, kind: eligible(object), ref }]);
      return true;
    },
    // Notebook: the existing notebook card framed in the same canvas (never a second notebook), the camera saved first.
    showNotebook: id => {
      const canvas = api();
      if (!canvas || !canvas.block?.(id)) return;
      if (!nav.current) nav.current = canvas.captureNavigation?.() || null;
      apply([{ type: 'saveCamera', view: nav.current?.view || canvas.getView?.() || null }, { type: 'setWork', work: 'notebook', notebookId: id }]);
      unslide();
      canvas.focusBlock(id);
    },
    // Canvas: the camera, selection and card scroll the learner left (this visit), else the camera saved with the arrangement.
    showCanvas: () => {
      const canvas = api(), saved = nav.current;
      nav.current = null;
      unslide();
      const back = saved && canvas?.restoreNavigation?.(saved);
      if (!back?.found && live.current.value.canvasView) canvas?.setView?.(live.current.value.canvasView);
      apply([{ type: 'setWork', work: 'canvas' }]);
    },
    // Entering Study with the notebook as the work: frame it again from where the learner is now.
    reframe: id => { const canvas = api(); if (!canvas?.block?.(id)) return false; nav.current = canvas.captureNavigation?.() || null; unslide(); canvas.focusBlock(id); return true; },
    locate: () => {
      const canvas = api(), id = live.current.value.pin?.cardId;
      if (!canvas || !id) return;
      nav.current = null;
      if (live.current.value.work !== 'canvas') apply([{ type: 'setWork', work: 'canvas' }]);
      unslide();
      canvas.focusObject?.(id);
    },
  };
  pinCardRef.current = study.pinCard;
  return study;
}

// The reference pane and the working-view switch, absolutely placed in the canvas frame's parent; the frame gets the margin.
export function StudyPane({ study, canvasApi, canvasFrame, canvasState, ready }) {
  const box = useRef(null);
  const [geo, setGeo] = useState(null);
  const [drag, setDrag] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const [refused, setRefused] = useState(null);
  const [pickNotebook, setPickNotebook] = useState(false);
  const options = useMenuButton();
  const chat = useChatWorkspace();
  const { state } = study, pin = state.pin, api = canvasApi.current;
  void canvasState; // the canvas's cards changed: read the pin and the lists again (this render)

  // The space beside the right panels: the host's own size (a ResizeObserver, never the window's width), the frame's top, and
  // the floating header's bottom where it lies over the canvas. A passive effect: on a reload in Study the pane mounts in the
  // same commit as the frame after it, whose ref is attached only after this earlier sibling's layout effects have run.
  useEffect(() => {
    const host = box.current?.parentElement, frame = canvasFrame.current;
    if (!host || !frame) return undefined;
    const measure = () => {
      const header = host.parentElement?.querySelector(':scope > [data-canvas-header]');
      const over = header && getComputedStyle(header).position === 'absolute';
      const margin = parseFloat(frame.style.marginTop) || 0;
      const next = {
        width: host.clientWidth, height: Math.min(host.clientHeight, window.innerHeight),
        frameTop: frame.offsetTop - margin, frameHeight: frame.offsetHeight + margin,
        headerBottom: over ? header.offsetTop + header.offsetHeight - host.offsetTop : 0,
      };
      setGeo(previous => (previous && Object.keys(next).every(key => Math.abs(previous[key] - next[key]) < 1) ? previous : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [canvasFrame]); // eslint-disable-line react-hooks/exhaustive-deps

  const layout = geo ? studyLayout({ width: geo.width, height: geo.height, split: drag ?? state.split }) : null;
  const top = geo ? Math.max(geo.frameTop, geo.headerBottom) : 0;
  const place = layout ? studyOffsets({ layout, frameTop: geo.frameTop, top }) : null;
  useLayoutEffect(() => {
    const frame = canvasFrame.current;
    if (!frame || !place) return;
    frame.style.marginLeft = place.marginLeft ? `${place.marginLeft}px` : '';
    frame.style.marginTop = `${place.marginTop}px`;
  }, [place?.marginLeft, place?.marginTop]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => () => { const frame = canvasFrame.current; if (frame) { frame.style.marginLeft = ''; frame.style.marginTop = ''; } }, [canvasFrame]);

  // Study opened with the notebook as the work: frame it once the canvas has its cards. Only for the work the pane opened
  // with, so a Notebook press inside Study never captures the camera a second time.
  const framed = useRef(state.work !== 'notebook' || !state.notebookId);
  useEffect(() => {
    if (framed.current || !ready) return;
    if (study.reframe(state.notebookId)) framed.current = true;
  }, [ready, canvasState]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRefused(null); setChoosing(false); }, [pin?.cardId]);

  const card = pin && api ? objectOf(api, pin.cardId) : null;
  const missing = !!pin && ready && !card;
  const unavailable = missing || refused === pin?.cardId;
  // The reader opens the card's ref as it is now (a note's text as edited since), keyed so an edit does not reopen a PDF.
  const liveRef = card ? pinRef(card) : pin?.ref;
  const sourceRef = useStableRef(pin && liveRef ? { ...liveRef, opened: pin.cardId } : null);
  const canAttach = !!pin && !!card && !unavailable;
  const version = pin ? versionLine(liveRef) : null;
  // The text selected in the pinned PDF (LearnPaper's selection, an excerpt draft): kept while that selection is still on the
  // page inside this pane, so pressing Add pinned reference (which closes the reader's own toolbar) still attaches it.
  const selected = useRef(null);
  const selectionHere = () => {
    const range = window.getSelection?.(), node = range?.anchorNode, element = node?.nodeType === 1 ? node : node?.parentElement;
    return !!selected.current && !!range && !range.isCollapsed && !!box.current?.contains(element) && !!element?.closest('.textLayer');
  };
  useEffect(() => { selected.current = null; }, [pin?.cardId]);
  // Add pinned reference (lane 2, study-attach.js): one press is one operation on a snapshot taken now (pin, ref at the reader's
  // page or the PDF text still selected here, canvas scope, destination Chat). The source is authorized again; the result is
  // applied to that snapshot only, and only if the same canvas, Chat and pinned card are still there. A refusal says Reference
  // unavailable and adds no chip; a newer press for the same Chat supersedes this one.
  // ponytail: a region (picture) selection attaches its page; attaching the picture needs addToChat's fileRef path.
  const [attach, setAttach] = useState(null);
  const attacher = useRef(null), alive = useRef(true), now = useRef(null);
  attacher.current ||= createPinnedAttacher();
  const destinationOf = c => ({ canvas: c?.canvas, board: c?.board, thread: c?.thread?.id ?? null });
  now.current = { study, chat, api: canvasApi.current };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const addPinned = async () => {
    const at = pin;
    const snap = pinnedAttachSnapshot({ pin: at, object: objectOf(canvasApi.current, at.cardId), reader: study.reader(),
      excerpt: at.kind === 'pdf' && selectionHere() ? selected.current : null, unavailable: refused === at.cardId, scope: study.scope, destination: destinationOf(chat) });
    if (!snap || !chat) { setAttach({ cardId: at.cardId, refused: true, reason: 'no-reference' }); return; }
    setAttach({ cardId: at.cardId, busy: true });
    const result = await attacher.current(snap, {
      authorize: source => authorizePinnedSource(source, { app: snap.destination.canvas, headers: wsHeaders(), cardExists: id => !!objectOf(canvasApi.current, id) }),
      current: operation => attachStillCurrent(operation, { alive: alive.current, scope: now.current.study.scope, destination: destinationOf(now.current.chat),
        pinCardId: now.current.study.state.pin?.cardId, cardExists: !!objectOf(now.current.api, operation.pin.cardId) }),
      attach: ref => now.current.chat.addToChat(ref, {}),
    });
    if (!alive.current || result.status === 'superseded') return;
    setAttach(result.status === 'attached' ? null : result.status === 'refused' ? { cardId: at.cardId, refused: true, reason: result.reason } : { abandoned: true, reason: result.reason });
  };
  const attachRefused = attach?.refused && attach.cardId === pin?.cardId;
  const notebooks = notebooksOf(api);
  const target = notebooks.find(block => block.id === state.notebookId) || (notebooks.length === 1 ? notebooks[0] : null);
  const pickWork = work => {
    if (work === 'canvas') { if (state.work !== 'canvas') study.showCanvas(); return; }
    if (target) study.showNotebook(target.id);
    else if (notebooks.length > 1) setPickNotebook(open => !open);
  };

  const share = drag ?? state.split;
  const resize = event => {
    const host = box.current?.parentElement?.getBoundingClientRect();
    if (!host || !geo) return null;
    return layout.stacked ? (event.clientY - host.top - top) / geo.height : (event.clientX - host.left) / geo.width;
  };
  const keys = event => {
    const by = { ArrowLeft: -STEP, ArrowUp: -STEP, ArrowRight: STEP, ArrowDown: STEP }[event.key];
    if (by) study.setSplit(share + by);
    else if (event.key === 'Home') study.setSplit(0.25);
    else if (event.key === 'End') study.setSplit(0.65);
    else return;
    event.preventDefault();
  };
  if (!layout) return <div ref={box} hidden />;
  const paneStyle = layout.stacked ? { top, left: 0, right: 0, height: layout.size } : { top, left: 0, width: layout.size, height: Math.max(0, geo.frameTop + geo.frameHeight - top) };
  // The working-view row: its own strip above the canvas (the frame starts below it), never over a card or a control.
  const switchStyle = { top: place.switchTop, left: place.switchLeft, right: 0, height: SWITCH_ROW };
  const button = 'flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-ink-2 hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40';
  // The header's controls: 30 px, 44 px on a touch screen; the options' rows likewise.
  const tool = 'inline-flex h-[30px] shrink-0 items-center justify-center gap-1.5 rounded-md text-[13px] text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent/35 disabled:pointer-events-none disabled:opacity-40 pointer-coarse:h-11';
  const item = 'pointer-coarse:h-11 focus-visible:outline-2 focus-visible:outline-accent/35';
  const name = pin ? (card && objectName(card)) || pin.ref.name : '';
  // Reference options open under their button, right edges together (Menu keeps them inside the window).
  const optionsAt = () => { const r = options.button.current?.getBoundingClientRect(); return r ? { top: r.bottom + 4, left: Math.max(8, r.right - 288) } : undefined; };
  const list = eligibleCards(api);
  const chooser = <div data-study-choose className="min-h-0 flex-1 overflow-y-auto p-3">
    <p className="mb-2 text-sm font-medium">Choose a reference</p>
    {list.length ? <ul className="space-y-1">{list.map(entry => <li key={entry.id}>
      <button type="button" data-study-choice={entry.id} onClick={() => { study.pinCard(entry.id); setChoosing(false); }} title={entry.name}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover ${entry.id === pin?.cardId ? 'bg-hover' : ''}`}>
        <span className="min-w-0 flex-1 truncate">{entry.name}</span><span className="shrink-0 text-xs text-ink-3">{TYPE_LABELS[entry.kind]}</span></button></li>)}</ul>
      : <p className="text-sm text-ink-2">No PDF, note or Explanation on this canvas yet.</p>}
  </div>;

  return <>
    <aside ref={box} aria-label="Pinned reference" data-study-pane data-layout={layout.stacked ? 'stacked' : 'wide'} data-pin={pin?.cardId || ''}
      className={`absolute z-20 flex flex-col bg-white ${layout.stacked ? 'border-b' : 'border-r'} border-line`} style={paneStyle}>
      {/* One 42 px row (WP6, owner brief 2026-10-24): pin, the name, Add to chat and Reference options. The pane keeps its
          "Pinned reference" name; the type, version and source sit in the options' details. Below 360 px Add to chat is its icon. */}
      <div data-study-header className="@container flex h-[42px] shrink-0 items-center gap-1.5 border-b border-line px-3 pointer-coarse:h-12">
        <Pin size={14} aria-hidden="true" className="shrink-0 text-ink-3" />
        {pin ? <span data-study-title title={name} className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{name}</span>
          : <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-2">Pinned reference</span>}
        {pin && <button type="button" data-study-attach title="Add to chat" className={`${tool} px-2`} disabled={!canAttach || !chat || (attach?.busy && attach.cardId === pin.cardId)} onMouseDown={event => event.preventDefault()} onClick={addPinned}>
          <MessageSquarePlus size={14} aria-hidden="true" /><span className="@max-[360px]:sr-only">Add to chat</span></button>}
        {pin && <button type="button" data-study-options {...options.buttonProps} aria-haspopup="dialog" aria-label="Reference options" title="Reference options" className={`${tool} w-[30px] pointer-coarse:w-11`}>
          <MoreHorizontal size={16} aria-hidden="true" /></button>}
      </div>
      {pin && options.open && <Menu portal anchor={options.button.current} open onClose={options.onClose} style={optionsAt()} className="w-72 border border-line">
        <div role="dialog" aria-label="Reference options" data-study-options-menu data-menu-button-open>
          <MenuItem icon={Replace} autoFocus data-study-change aria-pressed={choosing} className={item} onClick={() => { options.close(); setChoosing(open => !open); }}>Change reference</MenuItem>
          <MenuItem icon={LocateFixed} data-study-locate disabled={!card} className={item} onClick={() => { options.close(); study.locate(); }}>Locate on canvas</MenuItem>
          <MenuItem icon={PinOff} data-study-unpin className={item} onClick={() => { options.close(false); study.unpin(); }}>Unpin</MenuItem>
          <div className="my-1 border-t border-line" />
          <div role="group" aria-label="Source details" data-study-details className="px-2 py-1 text-xs">
            <dl>{[['Name', name], ['Type', TYPE_LABELS[pin.kind]], ['Source', sourceOrigin(pin.kind, liveRef)]].filter(([, value]) => value).map(([term, value]) =>
              <div key={term} className="flex gap-2 py-0.5"><dt className="w-12 shrink-0 text-ink-3">{term}</dt><dd className="min-w-0 break-words text-ink">{value}</dd></div>)}</dl>
            {version && <p data-study-version className="pt-1 text-ink-3">{version}</p>}
          </div>
        </div>
      </Menu>}
      {/* Failures stay in view, never inside the options. */}
      {pin && (attachRefused || attach?.abandoned) && <div className="shrink-0 border-b border-line px-3 py-1">
        {attachRefused && <p data-study-attach-refused data-reason={attach.reason} role="alert" className="text-xs text-red-700">Reference unavailable</p>}
        {attach?.abandoned && <p data-study-attach-abandoned data-reason={attach.reason} role="status" className="text-xs text-ink-2">Not added</p>}
      </div>}
      {!pin || choosing ? chooser : unavailable ? <div data-study-unavailable role="status" className="space-y-2 p-3 text-sm">
        <p className="font-medium">Reference unavailable</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={`${button} border border-line`} onClick={() => setChoosing(true)}>Choose another reference</button>
          <button type="button" className={`${button} border border-line`} onClick={study.unpin}>Unpin</button>
        </div>
      </div> : <div data-study-reader className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {pin.kind === 'explanation' && card
          ? <ExplanationReader block={card} position={study.reader()} onPosition={study.readerAt} />
          : <SourceReader presentation="study" sourceRef={sourceRef} position={study.reader()} onPosition={study.readerAt} onUnavailable={() => setRefused(pin.cardId)} onSelection={draft => { if (draft) selected.current = draft; }} />}
      </div>}
      <p data-study-status data-state={study.status || 'none'} role="status" className={`shrink-0 border-t border-line px-3 py-1 text-[11px] ${study.status === 'error' ? 'text-red-700' : 'text-ink-3'}`}>
        {studyStatusText(study.status)}</p>
      <div role="separator" tabIndex={0} aria-label="Resize pinned reference" aria-orientation={layout.stacked ? 'horizontal' : 'vertical'}
        aria-valuemin={25} aria-valuemax={65} aria-valuenow={Math.round(share * 100)} data-study-divider onKeyDown={keys}
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDrag(state.split); }}
        onPointerMove={event => { if (drag == null) return; const next = resize(event); if (next != null) setDrag(Math.min(0.65, Math.max(0.25, next))); }}
        onPointerUp={() => { if (drag != null) study.setSplit(drag); setDrag(null); }} onPointerCancel={() => setDrag(null)}
        className={`absolute z-10 touch-none bg-transparent hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:outline-none ${layout.stacked ? '-bottom-1 left-0 h-2 w-full cursor-row-resize' : 'top-0 -right-1 h-full w-2 cursor-col-resize'}`} />
    </aside>
    <div role="group" aria-label="Working view" data-study-work={state.work} className={`absolute z-20 flex items-center justify-end gap-0.5 border-b border-line bg-white px-2 ${layout.stacked ? '' : 'border-l'}`} style={switchStyle}>
      {[['notebook', 'Notebook'], ['canvas', 'Canvas']].map(([work, label]) => <button key={work} type="button" data-study-work-option={work} aria-pressed={state.work === work}
        disabled={work === 'notebook' && !notebooks.length} onClick={() => pickWork(work)}
        className={`h-6 rounded-md px-2 text-xs disabled:opacity-40 ${state.work === work ? 'bg-hover font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}>{label}</button>)}
      {pickNotebook && notebooks.length > 1 && <div role="menu" aria-label="Notebooks" className="absolute top-full right-2 z-30 w-56 rounded-lg border border-line bg-white p-1 shadow-md">
        {notebooks.map(block => <button key={block.id} type="button" role="menuitem" data-study-notebook={block.id} onClick={() => { setPickNotebook(false); study.showNotebook(block.id); }}
          className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover">{objectName(block)}</button>)}
      </div>}
    </div>
  </>;
}

// The same object while its content is the same, so the reader is not rebuilt on every render.
function useStableRef(value) {
  const held = useRef(value), key = JSON.stringify(value);
  const last = useRef(key);
  if (key !== last.current) { held.current = value; last.current = key; }
  return held.current;
}

// An Explanation pin: the card's own body (its Markdown and formulas), read only, at its saved scroll.
function ExplanationReader({ block, position, onPosition }) {
  const box = useRef(null);
  useEffect(() => { const scroller = box.current?.querySelector('[data-scroll]'); if (scroller && position?.scrollTop != null) scroller.scrollTop = position.scrollTop; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={box} data-study-explanation className="flex min-h-0 flex-1 flex-col" onScrollCapture={event => { if (event.target.matches?.('[data-scroll]')) onPosition({ scrollTop: event.target.scrollTop }); }}>
    <LearningBlockBody block={block} onChange={() => {}} readOnly />
  </div>;
}
