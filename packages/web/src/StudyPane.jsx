// Pinned Study (UI-27 Release 1, contract C:/s/spec/pinned-study/contract.md): a reference pinned beside the canvas's own
// notebook and canvas. On a repository canvas (pinned-study-codebase-spec.md) the reference pane also has Graph and Files tabs (the
// same views the right panel holds) and the work pane's Run, Runbook and Notebook are each Focus on the existing card. The pane is a sibling of LearnPage's canvas frame, never its parent: the frame only gets a margin, so the
// notebook card's iframe never moves to another parent (a moved iframe reloads and restarts its Python). "Notebook" is Focus on
// the notebook card (focus-adapter-notebook.js restyles its host in place); "Canvas" leaves Focus, which puts back the camera
// and selection the learner left.
// Layout actions make no model call and no board save; the arrangement is remembered in this browser only (study-state.js).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LocateFixed, MessageSquarePlus, MoreHorizontal, Pin, PinOff, Replace } from 'lucide-react';
import SourceReader from './SourceReader.jsx';
import { LearningBlockBody } from './LearningBlocks.jsx';
import { Menu, MenuItem, Tabs, TabsList, TabsTrigger, useMenuButton } from './ui.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';
import { pdfRef } from './pdf-source.js';
import { objectName } from './selection-ref.js';
import { browserStorage } from './home/canvas-local.js';
import { endStudyFocus } from './study-focus.js';
import { attachStillCurrent, authorizePinnedSource, createPinnedAttacher } from './study-attach.js';
import { wsHeaders } from './api.js';
import { SWITCH_ROW, pinRef, pinnedAttachSnapshot, sourceOrigin, studyOffsets, versionLine } from './study-ref.js';
import { WORK_ID, eligible, ownedId, readStudy, readerPinTarget, setStudyReaderPin, studyKey, studyLayout, studyReducer, studyScope, studyStatusText, writeStudy } from './study-state.js';
import { defaultWork, studyTheseActions, workCards, workOptions, workTarget } from './study-work.js';

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

// The page's one Study state for this canvas (LearnPage calls it once). The reader's place is kept out of React state, so
// scrolling a reference never re-renders the page; it is written a moment later, to the canvas it was made for.
// repository: the canvas has a repository (Graph and Files), which is what makes Study hide the toolbar and the maps (widget-visibility.js).
export function useStudy(canvasKey, board, canvasApi, { repository = false } = {}) {
  const scope = studyScope(canvasKey, board);
  // A value read back from a store that outlives the page is saved; one read from the blocked browser's in-memory stand-in is not.
  const read = at => {
    const storage = browserStorage();
    let stored = false;
    try { stored = storage?.getItem(studyKey(at)) != null; } catch { /* blocked reads as unsaved */ }
    return { scope: at, value: readStudy(storage, at), status: stored ? (storage.memory === true ? 'error' : 'saved') : null };
  };
  const [held, setHeld] = useState(() => read(scope));
  const live = useRef(held), timer = useRef(null);
  let current = held;
  if (held.scope !== scope) { current = read(scope); live.current = current; setHeld(current); }
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
    state, mode: state.mode, open: state.mode === 'study', status: current.status, scope, repository: !!repository,
    reader: () => live.current.value.reader,
    readerAt,
    // Leaving Study (View > Canvas) ends the Focus Study > Notebook started; the remembered work brings it back on return.
    setMode: mode => { if (mode !== 'study') endStudyFocus(api(), live.current.value); apply([{ type: 'setMode', mode }]); },
    setSplit: split => apply([{ type: 'setSplit', split }]),
    // View > Show / hide in Study: this canvas's Study choice, written like every other Study change (Not saved when storage refuses).
    setMap: (name, on) => apply([{ type: 'setMap', name, on }]),
    unpin: () => { endStudyFocus(api(), live.current.value); apply([{ type: 'unpin' }]); },
    // Pin for study, Change reference and Choose a reference: the actual card clicked, never another of the same name.
    pinCard: id => {
      const object = objectOf(api(), id), ref = object && pinRef(object);
      if (!ref) return false;
      apply([{ type: 'pin', cardId: id, kind: eligible(object), ref }]);
      return true;
    },
    // Notebook, Run or Runbook: Focus on the existing card (never a second one; Run and Runbook restyle their host in place like the notebook's),
    // the same expanded view as the card's Focus button; the Focus controller holds the camera and selection to put back. The camera is also
    // kept with the arrangement. Switching between them keeps the first saved navigation, and the card stays mounted, so a Run card's session lives.
    showWork: (work, id) => {
      const canvas = api();
      if (!WORK_ID[work] || !canvas?.block?.(id)) return false;
      const saved = canvas.focusState?.() ? [] : [{ type: 'saveCamera', view: canvas.getView?.() || null }];
      unslide();
      if (canvas.enterFocus(id) === false) return false;
      apply([...saved, { type: 'setWork', work, cardId: id }]);
      return true;
    },
    // Canvas: leaving Focus puts back the camera, selection and card scroll the learner left (this visit); with no Focus held
    // (it ended elsewhere, or never began), the camera saved with the arrangement.
    showCanvas: () => {
      const canvas = api();
      unslide();
      if (!endStudyFocus(canvas, live.current.value) && live.current.value.canvasView) canvas?.setView?.(live.current.value.canvasView);
      apply([{ type: 'setWork', work: 'canvas' }]);
    },
    // Focus ended by Back to canvas, Escape or another card's Focus: the switch says Canvas, the navigation is already back.
    focusEnded: () => { if (ownedId(live.current.value)) apply([{ type: 'setWork', work: 'canvas' }]); },
    // Entering Study with a card as the work: Focus on it from where the learner is now.
    reframe: id => { const canvas = api(); if (!canvas?.block?.(id)) return false; unslide(); return canvas.enterFocus(id) !== false; },
    setReferenceTab: tab => apply([{ type: 'setReferenceTab', tab }]),
    // Files reopens where it was: the file and line the repository's Files view shows while studying (LearnPage), kept with the arrangement.
    filesAt: place => { const at = live.current.value.filesPlace; if (place?.path && (at?.path !== place.path || at?.line !== place.line)) apply([{ type: 'filesAt', path: place.path, line: place.line }]); },
    filesShut: () => { if (live.current.value.filesPlace) apply([{ type: 'filesShut' }]); },
    // The right panel Study closed, held until Study ends (spec 2b).
    holdPanel: open => apply([{ type: 'panelWas', open }]),
    // Study these (spec 2g): the three existing actions at once, then the Focus on the Run card when Study was already open.
    studyThese: place => {
      const was = live.current.value.mode === 'study', actions = studyTheseActions({ blocks: api()?.blocks?.() || [], place });
      apply(actions);
      const work = actions.find(action => action.type === 'setWork');
      if (was && work) study.showWork(work.work, work.cardId);
    },
    locate: () => {
      const canvas = api(), id = live.current.value.pin?.cardId;
      if (!canvas || !id) return;
      // Study's Focus ends first: exitFocus restores the camera at once, so the focusObject below is the camera that stays.
      if (live.current.value.work !== 'canvas') { endStudyFocus(canvas, live.current.value); apply([{ type: 'setWork', work: 'canvas' }]); }
      unslide();
      canvas.focusObject?.(id);
    },
  };
  pinCardRef.current = study.pinCard;
  return study;
}

// The reference pane and the working-view switch, absolutely placed in the canvas frame's parent; the frame gets the margin.
export function StudyPane({ study, canvasApi, canvasFrame, canvasState, ready, files = null, graph = null }) {
  const box = useRef(null);
  const [geo, setGeo] = useState(null);
  const [drag, setDrag] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const [refused, setRefused] = useState(null);
  const [picking, setPicking] = useState(null); // the work (run, runbook, notebook) whose several cards are being chosen from
  const options = useMenuButton();
  const chat = useChatWorkspace();
  const { state } = study, pin = state.pin, api = canvasApi.current;
  const blocks = api?.blocks?.() || [], cards = workCards(blocks);
  // The reference pane's tabs (spec 2b): Graph and Files where the canvas has a repository, Pinned only while a card is pinned. A canvas with no
  // repository keeps Release 1's pane: the pinned reference alone.
  const tabs = [graph && ['graph', 'Graph'], files && ['files', 'Files'], files || graph ? pin && ['pin', 'Pinned'] : null].filter(Boolean);
  const refTab = !tabs.length ? 'pin' : tabs.some(([id]) => id === state.referenceTab) ? state.referenceTab : tabs[0][0];
  const onPin = refTab === 'pin';
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
    // The chat strip is centred on the whole window, not on the work pane (owner 2026-11-15, "in the middle of the whole screen"): half the pane's width
    // (leftward) is the one CSS variable the canvas's composer shifts by, so it sits over the reference pane's edge when the two are side by side.
    // Side by side only: the shift is a length, so with no Study (or stacked) the variable is unset, `translate` computes to none and the strip is exactly the canvas's own. The frame sits above the pane (z 30
    // over the pane's 20) so the shifted strip paints over it and keeps its clicks.
    const side = !!place.marginLeft;
    if (side) frame.style.setProperty('--study-shift', `${-Math.round(place.marginLeft / 2)}px`); else frame.style.removeProperty('--study-shift');
    frame.style.zIndex = side ? '30' : '';
    if (side && getComputedStyle(frame).position === 'static') { frame.style.position = 'relative'; frame.dataset.studyPosition = ''; } else if (!side && frame.dataset.studyPosition != null) { frame.style.position = ''; delete frame.dataset.studyPosition; }
  }, [place?.marginLeft, place?.marginTop]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => () => { const frame = canvasFrame.current; if (frame) { frame.style.marginLeft = ''; frame.style.marginTop = ''; frame.style.removeProperty('--study-shift'); frame.style.zIndex = ''; if (frame.dataset.studyPosition != null) { frame.style.position = ''; delete frame.dataset.studyPosition; } } }, [canvasFrame]);

  // Study opened with a card as the work (the notebook, Run or Runbook): frame it once the canvas has its cards. Only for the work the pane opened
  // with, so a press inside Study never captures the camera a second time.
  const framed = useRef(!ownedId(state));
  useEffect(() => {
    if (framed.current || !ready) return;
    if (study.reframe(ownedId(state))) framed.current = true;
  }, [ready, canvasState]); // eslint-disable-line react-hooks/exhaustive-deps
  // A Study never given a work opens on Run (else the Runbook) once the canvas has the card (spec 2a).
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || !ready) return;
    const first = defaultWork(state, blocks);
    if (first && study.showWork(first.work, first.cardId)) defaulted.current = true;
  }, [ready, canvasState]); // eslint-disable-line react-hooks/exhaustive-deps
  // The work card's Focus ended outside this switch (Back to canvas, Escape, another card's Focus): the switch follows it.
  const focusId = canvasState?.focus?.id ?? null, lastFocus = useRef(focusId);
  useEffect(() => {
    const was = lastFocus.current;
    lastFocus.current = focusId;
    if (was && was !== focusId && was === ownedId(state)) study.focusEnded();
  }, [focusId]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const choices = workOptions(blocks);
  const pickWork = work => {
    if (work === 'canvas') { if (state.work !== 'canvas') study.showCanvas(); return; }
    const card = workTarget(state, blocks, work);
    if (card) study.showWork(work, card.id);
    else if (cards[work]?.length > 1) setPicking(open => (open === work ? null : work));
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
    <aside ref={box} aria-label={tabs.length ? 'Reference' : 'Pinned reference'} data-study-pane data-reference-tab={refTab} data-layout={layout.stacked ? 'stacked' : 'wide'} data-pin={pin?.cardId || ''}
      className={`absolute z-20 flex flex-col bg-white ${layout.stacked ? 'border-b' : 'border-r'} border-line`} style={paneStyle}>
      {/* A repository canvas: the reference tabs (Tabs kit, as the Run card's). Graph and Files show the views the right panel holds. */}
      {tabs.length > 0 && <Tabs value={refTab} onValueChange={study.setReferenceTab}>
        <TabsList data-study-ref-tabs aria-label="Reference" className="h-[42px] shrink-0 gap-4 px-3 pointer-coarse:h-12">
          {tabs.map(([id, label]) => <TabsTrigger key={id} value={id} data-study-ref-tab={id}>{label}</TabsTrigger>)}
        </TabsList>
      </Tabs>}
      {/* Files fills the pane edge to edge: its own frame and the pane's lines would sit 16 px apart (owner 2026-11-15, misaligned borders), so the frame's border and corners go and the tab row, tree and reader share one set of lines. */}
      {!onPin && <div data-study-ref-body={refTab} className={refTab === 'files' ? 'flex min-h-0 flex-1 flex-col [&>div]:rounded-none [&>div]:border-0' : 'flex min-h-0 flex-1 flex-col px-4 pt-2 pb-4'}>{refTab === 'files' ? files : graph}</div>}
      {onPin && <>
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
      </>}
      {studyStatusText(study.status) && <p data-study-status data-state={study.status || 'none'} role="status" className={`shrink-0 border-t border-line px-3 py-1 text-[11px] ${study.status === 'error' ? 'text-red-700' : 'text-ink-3'}`}>
        {studyStatusText(study.status)}</p>}
      <div role="separator" tabIndex={0} aria-label="Resize pinned reference" aria-orientation={layout.stacked ? 'horizontal' : 'vertical'}
        aria-valuemin={25} aria-valuemax={65} aria-valuenow={Math.round(share * 100)} data-study-divider onKeyDown={keys}
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDrag(state.split); }}
        onPointerMove={event => { if (drag == null) return; const next = resize(event); if (next != null) setDrag(Math.min(0.65, Math.max(0.25, next))); }}
        onPointerUp={() => { if (drag != null) study.setSplit(drag); setDrag(null); }} onPointerCancel={() => setDrag(null)}
        className={`absolute z-10 touch-none bg-transparent hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:outline-none ${layout.stacked ? '-bottom-1 left-0 h-2 w-full cursor-row-resize' : 'top-0 -right-1 h-full w-2 cursor-col-resize'}`} />
    </aside>
    {/* The working view's tabs are the reference tabs' own kit (Graph | Files): underlined tabs, left aligned (owner 2026-11-15). */}
    <div data-study-work={state.work} className="absolute z-20 flex items-center justify-start bg-white" style={switchStyle}>
      <Tabs value={state.work} onValueChange={pickWork} className="w-full">
        <TabsList data-study-work-tabs aria-label="Working view" className="h-[42px] shrink-0 gap-4 px-3 pointer-coarse:h-12">
          {choices.map(({ work, label, disabled }) => <TabsTrigger key={work} value={work} data-study-work-option={work} disabled={disabled}>{label}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      {picking && cards[picking]?.length > 1 && <div role="menu" aria-label={`${picking === 'run' ? 'Run cards' : picking === 'runbook' ? 'Runbooks' : 'Notebooks'}`} className="absolute top-full right-2 z-30 w-56 rounded-lg border border-line bg-white p-1 shadow-md">
        {cards[picking].map(block => <button key={block.id} type="button" role="menuitem" data-study-notebook={block.id} onClick={() => { const work = picking; setPicking(null); study.showWork(work, block.id); }}
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
