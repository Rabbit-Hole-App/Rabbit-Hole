import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen, Pause, Pencil, Play, Scan, Share2, Trophy, NotebookPen, Volume2, VolumeX } from 'lucide-react';
import { createShapeId, getIndices } from 'tldraw';
import { SPEEDS, getSpeed, isMuted, onMuted, setMuted, setSpeed } from './learn-audio.js';
import { api, wsHeaders } from './api.js';
import { requestBoardExplanation } from './learn-board-request.js';
import { AskPanel } from './ask.jsx';
import { Button, IconBtn, ConfirmDialog, toast } from './ui.jsx';
import { captureSelection, selectionSnapshot } from './sigmoid-context.js';
import RegionPicker from './RegionPicker.jsx';
import { CourseInterview, CoursePanel, useLearnCourse } from './LearnCourse.jsx';
import { LessonNotebook, LessonPractice, LessonReading, LessonSource } from './LearnExtras.jsx';
import LearnOutline from './LearnOutline.jsx';
import ContentsRail from './ContentsRail.jsx';
import CanvasMenubar from './CanvasMenubar.jsx';
import PaperSearch from './PaperSearch.jsx';
import WikiSearch from './WikiSearch.jsx';
import VideoSearch from './VideoSearch.jsx';
import LearnWiki from './LearnWiki.jsx';
import { contentsEntries } from './learn-contents.js';
import { withSource, toggleSource, isAttached } from './learn-sources.js';
import { lessonMilestones } from './learn-milestones.js';
import { outlineProgress } from './learn-outline-model.js';
import LessonPlanPreview from './LessonPlanPreview.jsx';
import NanoLessonReading, { useNanoProgress } from './NanoLessonReading.jsx';
import { nanoLesson, nanoSourceVersion } from './nanogpt-lesson.js';
import RepositorySource from './RepositorySource.jsx';
import ResizableSidePanel from './ResizableSidePanel.jsx';
import LearnPaper from './LearnPaper.jsx';
import { cacheAsset } from './learn-asset-cache.js';
import { classifyDrop } from './learn-drop.js';
import { captureNotePage, notesScope, readNotes, writeNote, deleteNote } from './learn-notes.js';
import { challengePrompt, gradeAnswer } from './learn-grade.js';
import { architectureLesson, sampleCourse } from './learn-preview.js';
import { BOARDS, BOARD_SEED_VERSIONS } from './demo-scenes.js';

const LearnNotes = lazy(() => import('./LearnNotes.jsx'));
const AdaptiveCanvas = lazy(() => import('./AdaptiveCanvas.jsx'));

export default function LearnPage({ app, onBack, repositoryContext = null, onGraph = null }) {
  const isRepository = app.kind === 'repository';
  const course = useLearnCourse(app);
  const [courseView, setCourseView] = useState(false);
  const suppliedCourse = import.meta.env.VITE_COACHING_DEV === 'true' && app.repo === 'karpathy/nanoGPT';
  const nanoProgress = useNanoProgress(app, suppliedCourse);
  const [lessonSource, setLessonSource] = useState(null);
  const [plannedLesson, setPlannedLesson] = useState(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [sectionTarget, setSectionTarget] = useState(null);
  const [planEdits, setPlanEdits] = useState({});
  const [planStorageError, setPlanStorageError] = useState('');
  const planKey = `small.lesson-plan:${app.org}:${app.email || app.owner_email}:${app.name}`;
  useEffect(() => {
    if (!course.canAuthor) return;
    try { setPlanEdits(JSON.parse(localStorage.getItem(planKey) || '{}')); }
    catch { setPlanStorageError('Could not restore draft edits from this browser.'); }
  }, [planKey, course.canAuthor]);
  const sectionEditor = {
    target: sectionTarget,
    clear: () => setSectionTarget(null),
    revise: async instruction => {
      const target = sectionTarget;
      const result = await api(`/api/apps/${encodeURIComponent(app.name)}/learn-course`, { method: 'POST', body: JSON.stringify({ action: 'revise_section', revision: course.course?.revision || 0, sourceVersion: app.commit_sha, section: { id: target.id, title: target.title, text: target.text }, page: target.page, context: target.context, instruction }) });
      setPlanEdits(previous => {
        const updated = { ...previous, [target.id]: result.section.text };
        try { localStorage.setItem(planKey, JSON.stringify(updated)); setPlanStorageError(''); }
        catch { setPlanStorageError('Draft updated, but browser storage is unavailable. Keep this page open to retain it.'); }
        return updated;
      });
      setSectionTarget(previous => previous?.id === target.id ? { ...previous, text: result.section.text } : previous);
      return result.section;
    },
  };
  const [learnerOpen, setLearnerOpen] = useState(false);
  const [sampleOutline, setSampleOutline] = useState(app.kind !== 'repository');
  const [practiceMode, setPracticeMode] = useState('quiz');
  const [learningView, setLearningView] = useState('lesson');
  const [panelOpen, setPanelOpen] = useState(true);
  // Mirrored from the canvas so the View menu can tick what is on. Held by value
  // rather than by ref, and returned unchanged when nothing moved, or the effect
  // that publishes it would re-render forever.
  const [canvasState, setCanvasState] = useState({ grid: false, lock: false, minimap: true, pages: false, presenting: false, outline: [] });
  // boardContext is rebuilt every render but read inside a send; a ref keeps the
  // outline current without making the composer re-render on every tick.
  // A proposal from the tutor. It sits here until the learner applies or
  // discards it; nothing reaches the canvas on its own.
  const [proposal, setProposal] = useState(null);
  const [paperSearchOpen, setPaperSearchOpen] = useState(false);
  const [wikiSearchOpen, setWikiSearchOpen] = useState(false);
  const [videoSearchOpen, setVideoSearchOpen] = useState(false);
  const [videoContext, setVideoContext] = useState(null);
  const [wikiOpen, setWikiOpen] = useState(false);
  // Bumped only by an explicit open, so the reader can tell "go to this section"
  // apart from "you are now looking at this section".
  const [wikiOpenAt, setWikiOpenAt] = useState(0);
  const [wikiContext, setWikiContext] = useState(null);
  const canvasStateRef = useRef(canvasState);
  canvasStateRef.current = canvasState;
  const onCanvasState = useCallback(next => setCanvasState(previous =>
    (previous.grid === next.grid && previous.lock === next.lock && previous.minimap === next.minimap && previous.pages === next.pages && previous.presenting === next.presenting && JSON.stringify(previous.outline) === JSON.stringify(next.outline) ? previous : next)), []);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [paperOpen, setPaperOpen] = useState(false);
  const [paperContext, setPaperContext] = useState(null);
  const [noteRecords, setNoteRecords] = useState([]);
  const [noteEditing, setNoteEditing] = useState(null);
  const [noteChanged, setNoteChanged] = useState(false);
  const [pendingNoteView, setPendingNoteView] = useState(null);
  const noteSave = useRef(null);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesError, setNotesError] = useState('');
  const capturedSlides = useRef(new Set());
  useEffect(() => {
    let active = true;
    readNotes(notesScope(app)).then(records => {
      if (!active) return;
      setNoteRecords(previous => [...records.filter(record => !previous.some(item => item.id === record.id)), ...previous]); setNotesLoaded(true);
      for (const record of records) if (record.kind === 'slide') capturedSlides.current.add(record.id);
    }).catch(() => { if (active) { setNotesLoaded(true); setNotesError('Could not open browser storage for notes.'); } });
    return () => { active = false; };
  }, [app.email, app.org, app.name]);
  const saveNote = async note => {
    try {
      await writeNote(notesScope(app), note);
      setNoteRecords(previous => [...previous.filter(record => record.id !== note.id), note]);
      setNotesError('');
    } catch (error) { setNotesError('Notes could not be saved in this browser. Free storage or retry before leaving.'); throw error; }
  };

  const removeNote = async note => {
    try {
      await deleteNote(notesScope(app), note.id);
      setNoteRecords(previous => previous.filter(record => record.id !== note.id));
      if (noteEditing?.id === note.id) setNoteEditing(null);
      setNotesError('');
    } catch (error) { setNotesError('Could not delete the note. Please retry.'); throw error; }
  };
  const [setupChat, setSetupChat] = useState(false);
  const [narration, setNarration] = useState('');
  const [editor, setEditor] = useState(null);
  // Chat exchanges shown on the adaptive canvas. AskPanel mirrors each dock
  // turn here; the canvas renders them as movable cards. Blocks persist in
  // this browser so a refresh does not clear the canvas; a stream cut by a
  // refresh is kept as-is and marked done.
  const canvasKey = `small.adaptive-canvas:${app.org}:${app.email || app.owner_email}:${app.name}`;
  // ?board=<name> opens a SEPARATE board under its own storage key, so trying
  // something out never touches the learner's own canvas, and edits there
  // survive a reload. A name listed in BOARDS seeds the scenes under review;
  // any other name is an empty board to work in. The name is slugged rather
  // than validated, because a rejected name would silently fall through to the
  // learner's real canvas - the one place a test board must never land.
  const named = new URLSearchParams(window.location.search).get('board');
  // An unknown review-board name renders a visible notice rather than a blank
  // canvas: a blank is indistinguishable from a broken deploy, and it burned a
  // review twice. Scratch boards are still available - any name works as an
  // empty board - but the emptiness is now announced, never silent.
  const board = named ? named.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'test' : null;
  // The chat cards live on the board too, so a review board that inherited
  // the learner's conversation would not be the empty surface it promises.
  const chatKey = `${canvasKey}${board ? `:${board}` : ''}:chat`;
  const [exchanges, setExchanges] = useState(() => {
    try { return (JSON.parse(localStorage.getItem(chatKey) || '[]')).map(exchange => ({ ...exchange, status: 'done' })); } catch { return []; }
  });
  useEffect(() => {
    const timer = setTimeout(() => { try { localStorage.setItem(chatKey, JSON.stringify(exchanges)); } catch { /* full or blocked storage loses layout only */ } }, 400);
    return () => clearTimeout(timer);
  }, [exchanges, chatKey]);
  // What this canvas was built from. Attached means the Learn agent is handed it
  // when answering; detaching removes nothing from the canvas.
  const [sources, setSources] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`${canvasKey}:sources`) || '[]'); } catch { return []; }
  });
  useEffect(() => {
    const timer = setTimeout(() => { try { localStorage.setItem(`${canvasKey}:sources`, JSON.stringify(sources)); } catch { /* full or blocked storage loses the list only */ } }, 400);
    return () => clearTimeout(timer);
  }, [sources, canvasKey]);
  const registerSource = useCallback(source => setSources(previous => withSource(previous, source)), []);
  // A video is a card only - there is no video reader panel; the embed IS the
  // display. Adding one makes it what the next question is about.
  // One road for both: the picker and the tutor's show_video. insertVideo
  // retargets an existing card's moment, so the tutor pointing at a new
  // passage of a video already on the canvas moves that card rather than
  // stacking a twin next to it.
  const addVideo = video => {
    pauseLesson();
    const blockId = canvas()?.insertVideo(video);
    if (blockId) {
      registerSource({ id: `video:${blockId}`, kind: 'video', label: video.title || video.videoId });
      setVideoContext({ blockId, videoId: video.videoId, start: video.start || 0, end: video.end ?? null, title: video.title || null });
    }
  };
  // A seek on a card's window bar moves what "here" means for the next
  // question. Built from the event alone, never from previous state: the card
  // may have been restored from storage or be the second one on the canvas,
  // and either way the one the learner just touched is the one they mean.
  const watchVideo = ({ id, videoId, title, start, end }) =>
    setVideoContext({ blockId: id, videoId, title, start, end: end ?? null });
  const videoAttached = !videoContext?.blockId || isAttached(sources, `video:${videoContext.blockId}`);
  // Every article on the canvas is a card, whoever brought it - the picker and
  // the tutor's show_wikipedia take this same road, so there is one shape to
  // reason about and one place a source is registered.
  const openWiki = ({ title, section = 0 }) => {
    pauseLesson();
    const blockId = canvas()?.insertWiki({ title, section });
    setWikiContext({ blockId: blockId || null, title, section, selection: null });
    setWikiOpenAt(previous => previous + 1);
    // One reader holds one thing. Leaving paperContext set would keep sending
    // the paper instead - ask.jsx prefers it - for the rest of the session.
    setPaperContext(null);
    setWikiOpen(true); setPaperOpen(false); setSourceOpen(false); setLearnerOpen(false); setSetupChat(false); setPanelOpen(true);
    if (blockId) registerSource({ id: `wiki:${blockId}`, kind: 'wiki', label: String(title).replace(/_/g, ' ') });
  };
  // The id names the card, never the article, so clicking through twenty links
  // refreshes one row instead of leaving twenty behind.
  // Called on every scroll tick as well as on navigation, so nothing here may
  // allocate unless something actually changed: rewriting the source list each
  // frame churns localStorage, and a fresh context object re-renders the card
  // under the learner's pointer.
  const trackWiki = next => {
    const id = `wiki:${next.id}`;
    const label = String(next.title).replace(/_/g, ' ');
    setSources(previous => (previous.some(entry => entry.id === id && entry.label === label) ? previous : withSource(previous, { id, kind: 'wiki', label })));
    // The reader wins while it is open, the way it does for a paper's page.
    if (wikiOpen) return;
    setWikiContext(previous => {
      // Only a selection event carries a selection; scrolling must not clear one.
      const selection = 'selection' in next ? next.selection : previous?.selection ?? null;
      const section = next.section || 0;
      return previous?.blockId === next.id && previous.title === next.title && previous.section === section && previous.selection === selection
        ? previous
        : { blockId: next.id, title: next.title, section, selection };
    });
  };
  const wikiAttached = !wikiContext?.blockId || isAttached(sources, `wiki:${wikiContext.blockId}`);
  // Open a paper the learner chose, by the same road a canvas link takes.
  const openPaper = paper => {
    pauseLesson();
    // The search panel supplies no page; the tutor supplies the one it is
    // pointing at, and that must win.
    setPaperContext({ ...paper, page: paper.page || 1 });
    setWikiContext(null); setWikiOpen(false);
    setPaperOpen(true); setSourceOpen(false); setLearnerOpen(false); setSetupChat(false); setPanelOpen(true);
    registerSource({ id: `paper:${paper.id}`, kind: 'paper', label: paper.title || `arXiv ${paper.id}` });
  };
  // A PDF needs no account and no server: the bytes go to this browser's asset
  // store and the block keeps only the key. The file picker is hidden and
  // triggered from the Sources menu, so there is no dialog to dismiss.
  const pdfPicker = useRef(null);
  const takePdf = async file => {
    if (!file) return;
    // The reader can only take the learner to a page the model will also read,
    // and paper_context refuses anything past 100. Say so before the upload
    // rather than failing on every question afterwards.
    try {
      const { getDocument } = await import('./learn-paper-figures.js');
      const pages = (await getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise).numPages;
      if (pages > 100) { toast(`That PDF has ${pages} pages. The tutor can read up to 100.`); return; }
    } catch { toast('That file could not be read as a PDF.'); return; }
    const body = new FormData();
    body.append('file', file, file.name);
    let stored;
    try {
      const response = await fetch(`/api/learn/paper?app=${encodeURIComponent(app.name)}`, { method: 'POST', body, headers: wsHeaders() });
      stored = await response.json();
      if (!response.ok) throw new Error(stored?.error || 'Upload failed');
    } catch (error) { toast(error.message || 'That PDF could not be uploaded.'); return; }
    // The card is the canvas-resident copy - the browser's own viewer, every
    // page, native scrolling - and it survives a reload because the bytes are
    // in this browser's asset store and the block keeps only the key.
    const assetKey = `pdf:${stored.id}`;
    await cacheAsset(assetKey, file);
    canvas()?.insertPdf({ assetKey, label: stored.title });
    // Opening it in the reader is what makes the tutor page-aware: boardContext
    // carries paperContext, and ask.jsx turns that into paper_context with the
    // page the learner is actually on. The card cannot do that job - an iframe
    // never says which page is on screen.
    pauseLesson();
    setPaperContext({ ...stored, pdfUrl: null, page: 1 });
    setWikiContext(null); setWikiOpen(false);
    setPaperOpen(true); setSourceOpen(false); setLearnerOpen(false); setSetupChat(false);
    registerSource({ id: stored.id, kind: 'pdf', label: stored.title });
  };
  // Files dropped straight onto the canvas. Each kind takes its own road: a
  // PDF rides the existing paper pipeline; a static image also gets a server
  // copy so a question can put it in front of the tutor; GIFs and clips stay
  // in this browser by design - the tutor never sees them.
  const [imageContext, setImageContext] = useState(null);
  const imageAttached = !imageContext?.blockId || isAttached(sources, `image:${imageContext.blockId}`);
  const takeDrop = async files => {
    for (const file of files) {
      const { kind, error } = classifyDrop(file);
      if (error) { toast(error); continue; }
      if (kind === 'pdf') { await takePdf(file); continue; }
      const assetKey = `drop:${crypto.randomUUID()}`;
      await cacheAsset(assetKey, file);
      if (kind !== 'image') { canvas()?.insertFile({ assetKey, kind: kind === 'gif' ? 'image' : kind, label: file.name }); continue; }
      let stored = null;
      try {
        const body = new FormData();
        body.append('file', file, file.name);
        const response = await fetch(`/api/learn/media?app=${encodeURIComponent(app.name)}`, { method: 'POST', body, headers: wsHeaders() });
        stored = await response.json();
        if (!response.ok) throw new Error(stored?.error || 'Upload failed');
      } catch (problem) { toast(`${file.name}: ${problem.message}. The card is here, but the tutor will not see this image.`); stored = null; }
      const blockId = canvas()?.insertFile({ assetKey, kind: 'image', label: stored?.title || file.name, mediaId: stored?.id || null });
      if (stored && blockId) {
        setImageContext({ blockId, id: stored.id, title: stored.title });
        registerSource({ id: `image:${blockId}`, kind: 'image', label: stored.title });
      }
    }
  };
  // The card context menu's type-specific rows land here: the canvas names
  // the action, this page owns the readers, sources, and contexts involved.
  const cardAction = (action, payload) => {
    if (action === 'wiki-reader') openWiki({ title: payload.title, section: payload.section || 0 });
    else if (action === 'pdf-reader') openPaper({ id: payload.id, title: payload.title, pdfUrl: null, page: 1 });
    else if (action === 'attach-toggle') setSources(previous => toggleSource(previous, payload.sourceId));
    else if (action === 'image-attach') {
      // Re-arm an older dropped image as the one the tutor sees; only the
      // latest drop rides otherwise.
      setImageContext({ blockId: payload.blockId, id: payload.mediaId, title: payload.label });
      registerSource({ id: `image:${payload.blockId}`, kind: 'image', label: payload.label });
      setSources(previous => previous.map(entry => entry.id === `image:${payload.blockId}` ? { ...entry, attached: true } : entry));
    }
  };
  // A group's Ask sends its rendered snapshot ahead as the image context, so
  // the tutor sees the arrangement, not only our text description of it.
  const takeGroupShot = async (blob, label) => {
    try {
      const body = new FormData();
      body.append('file', blob, `${label}.png`);
      const response = await fetch(`/api/learn/media?app=${encodeURIComponent(app.name)}`, { method: 'POST', body, headers: wsHeaders() });
      const stored = await response.json();
      if (!response.ok) throw new Error(stored?.error || 'Upload failed');
      setImageContext({ blockId: null, id: stored.id, title: stored.title });
    } catch { /* the text target still asks; the tutor just cannot see it */ }
  };
  const repoSourceId = app.repo ? `repo:${app.repo}` : null;
  // The repository is the one source that exists on day one, and detaching it
  // genuinely stops repository_context reaching the agent (ask.jsx:467).
  useEffect(() => { if (repoSourceId) registerSource({ id: repoSourceId, kind: 'repository', label: app.repo }); }, [repoSourceId, app.repo, registerSource]);
  const repoAttached = !repoSourceId || isAttached(sources, repoSourceId);
  const placeExchange = event => setExchanges(previous => {
    if (event.question !== undefined) return [...previous, { id: event.id, question: event.question, linkFrom: event.linkFrom || null, answer: '', status: 'thinking', dx: 0, dy: 0 }];
    return previous.map(exchange => exchange.id !== event.id ? exchange
      : event.delta ? { ...exchange, answer: exchange.answer + event.delta, status: 'streaming' }
      : event.stage ? { ...exchange, status: event.stage }
      : { ...exchange, status: 'done' });
  });
  const moveExchange = (id, dx, dy) => setExchanges(previous => previous.map(exchange => exchange.id === id ? { ...exchange, dx, dy } : exchange));
  const deleteExchange = id => setExchanges(previous => previous.filter(exchange => exchange.id !== id));
  const resizeExchange = (id, w, h) => setExchanges(previous => previous.map(exchange => exchange.id === id ? { ...exchange, w, h } : exchange));
  // In-block follow-ups belong to the exchange, so undo and reload keep them.
  const replyToExchange = (id, event) => setExchanges(previous => previous.map(exchange => {
    if (exchange.id !== id) return exchange;
    const replies = exchange.replies || [];
    if (event.question !== undefined) return { ...exchange, replies: [...replies, { id: event.id, question: event.question, answer: '', status: 'thinking' }] };
    return { ...exchange, replies: replies.map(turn => turn.id !== event.id ? turn
      : event.delta ? { ...turn, answer: turn.answer + event.delta }
      : { ...turn, status: event.done ? 'done' : event.stage }) };
  }));
  const [askTarget, setAskTarget] = useState(null); // selected lesson block armed as composer context
  const canvasApi = useRef(null);
  // Challenge blocks ask the tutor to judge a committed answer.
  const gradeCanvasAnswer = (block, answer, onDelta) => gradeAnswer({
    app: app.name,
    repositoryContext: nanoActive ? { commit: nanoSourceVersion } : repositoryContext,
    prompt: challengePrompt(block, answer),
    onDelta,
  });
  // A file reference clicked inside a canvas block opens in the right panel.
  const openCanvasFile = (path, line, lineEnd) => { setPaperOpen(false); setSourceOpen(false); setLessonSource({ path, line, lineEnd, commit: nanoActive ? nanoSourceVersion : repositoryContext?.commit }); };
  const clearAskTarget = () => { setAskTarget(null); canvasApi.current?.deselect(); };
  const [region, setRegion] = useState(false);
  const cancelRegion = useCallback(() => setRegion(false), []);
  const playback = useRef(null);
  const startDemo = useRef(null);
  const [progress, setProgress] = useState(null);
  const [completed, setCompleted] = useState({});
  const recordProgress = value => {
    if (explanation.current && (value.playing || explanation.current.runId !== lesson.current?.runId)) dismissBoard();
    setProgress(value);
    const id = lesson.current?.lessonId;
    if (suppliedCourse && id === nanoLesson.id) nanoProgress.record(value);
    if (value.pageComplete && id) {
      const key = `${id}:${value.page}`;
      setCompleted(previous => previous[key] ? previous : { ...previous, [key]: true });
      const slideId = `slide:${key}`;
      if (!capturedSlides.current.has(slideId) && editor) {
        capturedSlides.current.add(slideId);
        const slide = noteSnapshot(value, 'slide', slideId);
        saveNote(slide).catch(() => capturedSlides.current.delete(slideId));
      }
    }
  };
  const [answering, setAnswering] = useState(false);
  const [narrationMuted, setNarrationMuted] = useState(isMuted());
  const [lessonSpeed, setLessonSpeed] = useState(getSpeed());
  // Learn is immersive: entering collapses the sidebar; the top-left Home restores it.
  useEffect(() => { window.dispatchEvent(new CustomEvent('small:sidebar', { detail: { collapsed: true } })); }, []);
  const [canvasPick, setCanvasPick] = useState(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  // The red selection ellipse stays on the canvas while the question is asked.
  const regionMarker = useRef(null);
  const clearRegionMarker = () => {
    if (regionMarker.current && editor?.getShape(regionMarker.current)) editor.deleteShapes([regionMarker.current]);
    regionMarker.current = null;
  };
  const drawRegionMarker = points => {
    clearRegionMarker();
    if (!points?.length) return;
    const origin = points[0];
    const loop = [...points, points[0]];
    const indices = getIndices(loop.length);
    const id = createShapeId();
    editor.createShape({ id, type: 'line', x: origin.x, y: origin.y, meta: { regionMarker: true },
      props: { color: 'red', size: 's', dash: 'solid', points: Object.fromEntries(loop.map((point, i) => [indices[i], { id: indices[i], index: indices[i], x: point.x - origin.x, y: point.y - origin.y }])) } });
    regionMarker.current = id;
  };
  // Page 3: tapping a position tile on the canvas selects it in the check below.
  const pickSequenceTile = event => {
    if (!editor || !nanoActive || progress?.page !== 2) return;
    const point = editor.screenToPage({ x: event.clientX, y: event.clientY });
    const shape = editor.getShapeAtPoint(point, { hitInside: true });
    if (!/-(sequence|positions)$/.test(shape?.meta?.objectId || '')) return;
    const boxes = editor.getCurrentPageShapes().filter(s => s.meta.objectId?.endsWith('-sequence') && s.type === 'geo').sort((a, b) => a.x - b.x);
    const x = shape.type === 'geo' ? shape.x : shape.x - (shape.meta.objectId.endsWith('-positions') ? 18 : 14);
    const index = boxes.findIndex(b => Math.abs(b.x - x) < 24);
    if (index >= 0 && index < 4) setCanvasPick({ position: index + 1, nonce: Date.now() });
  };
  const explanation = useRef(null);
  const boardRequest = useRef(0);
  const [boardVisible, setBoardVisible] = useState(false);
  const [boardStage, setBoardStage] = useState('Preparing explanation...');
  const dismissBoard = () => {
    boardRequest.current++;
    const old = explanation.current; explanation.current = null;
    old?.dispose(); setBoardVisible(false);
    clearRegionMarker();
  };
  useEffect(() => () => { boardRequest.current++; explanation.current?.dispose(); }, []);

  const pauseLesson = () => playback.current?.pause?.();
  const lesson = useRef(null);
  const graphs = useRef(null);
  const [graphError, setGraphError] = useState('');
  useEffect(() => {
    if (!editor) return;
    let disposed = false;
    import('./learn-graph-storage.js').then(({ persistGraphs }) => {
      if (!disposed) graphs.current = persistGraphs(editor, app, () => lesson.current, value => { lesson.current = value; refreshSelection(v => v + 1); }, setGraphError);
    });
    return () => { disposed = true; graphs.current?.dispose(); graphs.current = null; };
  }, [editor, app.name, app.email, app.org]);
  useEffect(() => { graphs.current?.sync(); }, [progress?.page, progress?.playing]);
  const videos = useRef(null), scenes = useRef(null);
  useEffect(() => {
    if (!editor) return;
    let disposed = false;
    import('./learn-video-canvas.js').then(({ videoCanvas }) => {
      if (!disposed) {
        const restore = value => { lesson.current = value; refreshSelection(v => v + 1); };
        videos.current = videoCanvas(editor, app, () => lesson.current, restore);
        scenes.current = videoCanvas(editor, app, () => lesson.current, restore, { kind: 'scene' });
      }
    });
    return () => { disposed = true; videos.current?.dispose(); videos.current = null; scenes.current?.dispose(); scenes.current = null; };
  }, [editor, app.name, app.email, app.org]);
  useEffect(() => { videos.current?.sync(); scenes.current?.sync(); }, [progress?.page, progress?.playing]);
  const pinned = useRef(null);
  const [preview, setPreview] = useState(null);
  const previewRequest = useRef(0);
  const removeImage = () => { previewRequest.current++; setPreview(null); };
  const preparePreview = async () => {
    const request = ++previewRequest.current;
    setPreview(null);
    try {
      const snapshot = selectionSnapshot(editor, lesson.current, pinned.current);
      if (!snapshot?.target) return;
      const ellipse = pinned.current?.region;
      const { canvasPreview } = await import('./canvas-preview.js');
      const image = await canvasPreview(editor, snapshot, ellipse);
      if (request === previewRequest.current) setPreview(image);
    } catch { /* A deleted/incomplete selection is handled by the existing question flow. */ }
  };
  const [, refreshSelection] = useState(0);
  const lastSelection = useRef('');
  useEffect(() => editor?.store.listen(() => {
    if (pinned.current && pinned.current.runId !== lesson.current?.runId) {
      pinned.current = null; previewRequest.current++; setPreview(null);
    }
    refreshSelection(v => v + 1);
  }), [editor]);
  useEffect(() => editor?.store.listen(() => {
    const ids = editor.getSelectedShapeIds();
    const key = [...ids].sort().join('|');
    if (key === lastSelection.current) return;
    lastSelection.current = key;
    // Keep the captured target when focus moves to chat. Explicit X clears it.
    if (!ids.length) return;
    if (pinned.current?.region && [...pinned.current.shapeIds].sort().join('|') === key) return;
    pauseLesson();
    pinned.current = captureSelection(editor, lesson.current);
    refreshSelection(v => v + 1);
    if (pinned.current) preparePreview();
    else removeImage();
  }, { scope: 'session' }), [editor]);
  useEffect(() => () => { playback.current?.dispose(); previewRequest.current++; }, [app.name]);
  const openPaperReference = event => {
          const link = event.target.closest?.('a');
          const href = link?.getAttribute('href');
          if (!href || link.closest('[aria-label="Paper reader"]')) return;
          let url; try { url = new URL(href); } catch { return; }
          if (url.protocol !== 'https:' || url.hostname !== 'arxiv.org') return;
          const match = url.pathname.match(/^\/(?:pdf|abs)\/(\d{4}\.\d{4,5}(?:v\d+)?|[a-z.-]+\/\d{7}(?:v\d+)?)(?:\.pdf)?$/i);
          if (!match) return;
          const shape = editor?.getCurrentPageShapes().find(shape => shape.meta?.paper?.id === match[1]);
          const paper = shape?.meta.paper || { id: match[1], title: link.textContent, pdfUrl: `https://arxiv.org/pdf/${match[1]}`, page: 1 };
          event.preventDefault(); event.stopPropagation();
          pauseLesson(); setPaperContext({ ...paper, page: Number(url.hash.match(/page=(\d+)/)?.[1]) || paper.page }); setPaperOpen(true); setSourceOpen(false); setLearnerOpen(false); setSetupChat(false);
          registerSource({ id: `paper:${paper.id}`, kind: 'paper', label: paper.title || `arXiv ${paper.id}` });
  };
  const teachingSnapshot = snapshot => {
    if (!snapshot || !snapshot.lessonId.startsWith('course-') || !course.course?.brief) return snapshot;
    const courseBrief = Object.fromEntries(['audience', 'goal', 'knowledge', 'duration'].flatMap(key => {
      const value = course.course.brief[key];
      return typeof value === 'string' && value.trim() ? [[key, value.slice(0, 600)]] : [];
    }));
    return { ...snapshot, lessonContext: { ...snapshot.lessonContext, courseBrief } };
  };
  const boardContext = {
    ready: !!editor, status: boardStage, paper: paperContext, clearPaper: () => { setPaperContext(null); setPaperOpen(false); setWikiContext(null); setWikiOpen(false); },
    // Detaching the source is a context switch, not a deletion: the card stays
    // on the canvas and the reader stays open, the tutor just stops being told.
    wiki: wikiAttached ? wikiContext : null,
    video: videoAttached ? videoContext : null,
    image: imageAttached ? imageContext : null,
    onShowWiki: article => openWiki(article),
    onShowVideo: moment => addVideo(moment),
    // Read at send time, so a question always carries the outline as it is now.
    outline: () => canvasStateRef.current.outline || [],
    onOutlineProposal: ops => setProposal(ops),
    onShowPaper: paper => openPaper(paper),
    explain: async ({ snapshot, question, answer, model, paperIds = [], history = [], repository_context = null }) => {
      if (noteEditing) throw new Error('Return to the lesson before explaining on canvas.');
      if (!editor) throw new Error('The canvas is still loading. Try again in a moment.');
      if (!snapshot) {
        if (!lesson.current) lesson.current = { lessonId: 'learn-freeform', runId: crypto.randomUUID(), pageId: editor.getCurrentPageId(), currentStage: 'explanation', topic: 'Learner question', recentExplanations: [] };
        snapshot = selectionSnapshot(editor, lesson.current, null);
      }
      if (!boardContext.isCurrent(snapshot)) throw new Error('This answer belongs to an earlier lesson position. Ask again on the current page.');
      pauseLesson(); setRegion(false);
      const request = ++boardRequest.current;
      const current = selectionSnapshot(editor, lesson.current, snapshot.target ? { ...snapshot.target, shapeIds: snapshot.target.selectedShapeIds, runId: snapshot.runId } : null);
      setBoardStage('Planning explanation...');
      const { plan } = await requestBoardExplanation({ app: app.name, snapshot: teachingSnapshot(current), question, answer, model, paperIds, history, repository_context }, stage => { if (request === boardRequest.current) setBoardStage(stage); });
      if (request !== boardRequest.current || !boardContext.isCurrent(snapshot)) throw new Error('The lesson changed while preparing the explanation. Ask again on the current page.');
      if (plan.needsClarification) throw new Error(plan.summary);
      let renderedPlan = plan;
      if (plan.blocks.some(block => block.kind === 'paper_figure' && !block.figure)) {
        setBoardStage('Preparing cited figures...');
        const { preparePaperFigures } = await import('./learn-paper-figures.js');
        renderedPlan = await preparePaperFigures(plan, app.name);
      }
      const { drawExplanation } = await import('./learn-board-renderer.js');
      if (request !== boardRequest.current || !boardContext.isCurrent(snapshot)) throw new Error('The lesson changed. Ask again on the current page.');
      setCourseView(false); setLearnerOpen(false); setSetupChat(false); setPlannedLesson(null); setLearningView('lesson'); setBoardVisible(true);
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (request !== boardRequest.current || !boardContext.isCurrent(snapshot)) { setBoardVisible(false); throw new Error('The lesson changed. Ask again on the current page.'); }
      editor.updateViewportScreenBounds(editor.getContainer());
      const previous = explanation.current;
      const layer = drawExplanation(editor, current, renderedPlan, { app: app.name, onVideo: (...args) => videos.current?.start(...args), onScene: (...args) => scenes.current?.start(...args) });
      // Speak the explanation with the lesson narrator; a failed request stays silent.
      let boardAudio = null;
      const spoken = renderedPlan.blocks.map(block => block.text).filter(Boolean).join(' ').slice(0, 3800);
      if (spoken) fetch('/api/learn/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...wsHeaders() }, body: JSON.stringify({ app: app.name, text: spoken }) })
        .then(async response => {
          if (!response.ok || request !== boardRequest.current) return;
          const url = URL.createObjectURL(await response.blob());
          if (request !== boardRequest.current) { URL.revokeObjectURL(url); return; }
          boardAudio = new Audio(url);
          boardAudio.muted = isMuted();
          boardAudio.playbackRate = getSpeed();
          boardAudio.play().catch(() => {});
        }).catch(() => {});
      const unlistenBoardMuted = onMuted(value => { if (boardAudio) boardAudio.muted = value; });
      explanation.current = { dispose: () => { unlistenBoardMuted(); boardAudio?.pause(); layer.dispose(); previous?.dispose(); }, runId: snapshot.runId };
    },
    label: pinned.current?.label,
    preview: paperContext?.selection?.preview || preview,
    previewKind: paperContext?.selection ? 'paper' : 'canvas',
    removeImage: () => { removeImage(); setPaperContext(previous => previous ? { ...previous, selection: undefined } : previous); },
    pause: pauseLesson, setAnswering,
    clear: () => { pinned.current = null; editor?.selectNone(); removeImage(); clearRegionMarker(); refreshSelection(v => v + 1); },
    snapshot: () => teachingSnapshot(selectionSnapshot(editor, lesson.current, pinned.current)),
    isCurrent: snapshot => {
      if (!editor || lesson.current?.runId !== snapshot.runId || lesson.current?.currentStage !== snapshot.lessonContext.currentStage) return false;
      if (lesson.current?.pageId && editor.getCurrentPageId() !== lesson.current.pageId) return false;
      if (!snapshot.target) return lesson.current?.runId === snapshot.runId && lesson.current?.currentStage === snapshot.lessonContext.currentStage;
      try { return lesson.current?.runId === snapshot.runId && !!selectionSnapshot(editor, lesson.current, { ...snapshot.target, shapeIds: snapshot.target.selectedShapeIds, runId: snapshot.runId }); }
      catch { return false; }
    },
  };
  const demo = {
    startRef: startDemo,
    prompt: 'Explain the sigmoid function',
    disabled: !editor || progress?.playing || course.dirty || !!noteEditing,
    run: async (replace) => {
      dismissBoard();
      setCourseView(false); setLearningView('lesson'); setSetupChat(false); setNarration('');
      setRegion(false);
      setProgress(null);
      playback.current?.dispose();
      let cancelled = false;
      const controller = { dispose: () => { cancelled = true; } };
      playback.current = controller;
      pinned.current = null;
      removeImage();
      lesson.current = { runId: crypto.randomUUID(), currentStage: 'idea', recentExplanations: [] };
      refreshSelection(v => v + 1);
      const { playSigmoid } = await import('./sigmoid-demo.js');
      if (cancelled) return;
      playback.current = playSigmoid(editor, replace, lesson.current, recordProgress);
      playback.current.play();
    },
  };
  const previewLesson = async (generated, resume = false) => {
    if (!editor) return;
    dismissBoard(); setLessonSource(null); setPaperOpen(false); setSourceOpen(false);
    playback.current?.dispose(); setRegion(false); pinned.current = null; removeImage();
    let cancelled = false;
    playback.current = { dispose: () => { cancelled = true; } };
    const { playSigmoid } = await import('./sigmoid-demo.js');
    if (cancelled) return;
    setCourseView(false); setLearningView('lesson'); setSetupChat(false);
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (cancelled) return;
    editor.updateViewportScreenBounds(editor.getContainer());
    lesson.current = { runId: crypto.randomUUID(), currentStage: 'page-1', recentExplanations: [] };
    const resumeAt = generated.id === nanoLesson.id && resume ? nanoProgress.saved.timeline : null;
    playback.current = playSigmoid(editor, setNarration, lesson.current, recordProgress, generated);
    if (Number.isFinite(resumeAt) && resumeAt > 0) playback.current.scrub(resumeAt);
    else playback.current.play();
  };
  const nanoActive = suppliedCourse && lesson.current?.lessonId === nanoLesson.id;
  const pages = progress?.pages || [{ label: 'What is logistic regression?' }, { label: 'The formula' }, { label: 'The sigmoid function' }];
  const sampleIndex = sampleCourse.lessons.findIndex(item => item.id === (lesson.current?.lessonId || 'sigmoid-demo'));
  const currentLesson = nanoActive ? nanoLesson : isRepository ? course.course?.lesson : sampleIndex >= 0 ? sampleCourse.lessons[sampleIndex] : course.course?.lesson;
  const courseTitle = app.kind === 'repository' ? course.course?.curriculum?.title || app.repo : courseView || sampleIndex < 0 ? course.course?.curriculum?.title || sampleCourse.title : sampleCourse.title;
  const noteSnapshot = (value, kind, id) => ({
    id, kind, lessonId: lesson.current.lessonId, lessonTitle: lesson.current.topic,
    lessonOrder: Math.max(0, sampleCourse.lessons.findIndex(item => item.id === lesson.current.lessonId)),
    courseTitle: sampleCourse.lessons.some(item => item.id === lesson.current.lessonId) ? sampleCourse.title : course.course?.curriculum?.title, sectionTitle: value.label, sectionIndex: value.page,
    timeline: value.timeline, frame: value.frame, pageId: editor.getCurrentPageId(),
    createdAt: Date.now(), snapshot: captureNotePage(editor, true),
  });
  const addNote = () => {
    pauseLesson(); setRegion(false);
    const value = playback.current?.state() || (boardVisible && lesson.current ? { label: 'Canvas explanation', page: 0, timeline: 0, frame: 0 } : null);
    if (!value) return;
    setNoteChanged(false);
    setNoteEditing(noteSnapshot(value, 'note', crypto.randomUUID()));
    setLearningView('notes');
  };
  const returnToNoteLesson = async (record, resume = true) => {
    if (record.lessonId === 'learn-freeform' && lesson.current?.lessonId === record.lessonId && editor?.getPage(record.pageId)) {
      setNoteEditing(null); setLearningView('lesson'); setCourseView(false);
      editor.setCurrentPage(record.pageId);
      return;
    }
    const content = suppliedCourse && record.lessonId === nanoLesson.id ? nanoLesson : sampleCourse.lessons.find(item => item.id === record.lessonId) || (course.course?.lesson?.id === record.lessonId ? course.course.lesson : null);
    if (!content) { setNotesError('This lesson version is no longer available. Your saved notes are still here.'); return; }
    if (lesson.current?.lessonId !== record.lessonId) {
      if (content.id === 'sigmoid-demo') await demo.run(setNarration);
      else await previewLesson(content);
    }
    setNoteEditing(null); setLearningView('lesson'); setCourseView(false);
    await new Promise(resolve => requestAnimationFrame(resolve));
    editor.updateViewportScreenBounds(editor.getContainer());
    if (Number.isInteger(record.frame)) navigateLesson('seek', record.sectionIndex, record.frame);
    else navigateLesson('scrub', record.timeline);
    if (resume) playback.current?.play();
  };
  const navigateLesson = (action, value, position) => {
    dismissBoard();
    setRegion(false); pinned.current = null; removeImage(); clearRegionMarker();
    playback.current?.[action](value, position);
    refreshSelection(v => v + 1);
  };
  const changeLearningView = value => {
    dismissBoard(); pauseLesson(); setRegion(false); setSourceOpen(false); setLessonSource(null); setPaperOpen(false);
    setLearningView(value); if (value !== 'curriculum') setSectionTarget(null); setCourseView(value === 'curriculum' && course.canAuthor);
    setLearnerOpen(value === 'curriculum' && !course.canAuthor);
    setSetupChat(value === 'curriculum' && course.canAuthor);
  };
  const leaveNote = value => { setNoteEditing(null); setNoteChanged(false); setPendingNoteView(null); changeLearningView(value); };
  // Shared by the contents list in the right panel and the author's learner
  // view in the main area, so both route a click the same way.
  const toggleSection = key => setCompleted(previous => ({ ...previous, [key]: !previous[key] }));
  const openFromOutline = async (content, view, index) => {
    if (view === 'lesson') {
      if (lesson.current?.lessonId !== content.id) {
        if (content.id === 'sigmoid-demo') await demo.run(setNarration);
        else await previewLesson(content);
      }
      setCourseView(false); changeLearningView('lesson'); navigateLesson('seek', index, 0);
    } else {
      setCourseView(false); changeLearningView(view === 'notebook' ? 'notebook' : 'practice');
      if (view !== 'notebook') setPracticeMode(view);
    }
  };
  const requestLearningView = value => {
    if (noteEditing && noteChanged) { setPendingNoteView(value); return; }
    leaveNote(value);
  };
  useEffect(() => {
    if (learningView === 'lesson' && editor) requestAnimationFrame(() => editor.updateViewportScreenBounds(editor.getContainer()));
  }, [learningView, sourceOpen, lessonSource, editor]);
  useEffect(() => {
    if (learningView === 'lesson' && suppliedCourse && editor && nanoProgress.loaded && !lesson.current && !answering) previewLesson(nanoLesson, true);
  }, [learningView, editor, nanoProgress.loaded, answering]);
  const trackingSample = !isRepository && (sampleOutline || !course.course?.curriculum);
  const trackedLessons = trackingSample ? sampleCourse.lessons : (course.course?.curriculum?.lessons || []).map((item, index) => index === 0 && course.course.lesson ? course.course.lesson : { ...item, pages: (item.topics || item.pages || []) });
  const sectionKeys = suppliedCourse ? [...Array.from({ length: 6 }, (_, i) => `${nanoLesson.id}:${i}`), 'predict-next', 'represent-text', 'training-vs-generation'] : trackedLessons.flatMap(item => [...item.pages.map((_, index) => `${item.id || 'unavailable'}:${index}`), ...(item.id === architectureLesson.id ? ['notebook', 'quiz', 'flashcards'].map(view => `${item.id}:${view}`) : [])]);
  const finishedCount = suppliedCourse ? Object.keys(nanoProgress.saved.pages || {}).filter(key => ['0', '1', '2', '3', '4', '5'].includes(key) && nanoProgress.saved.pages[key]).length + ['encoding', 'prefixTarget', 'generationWeights'].filter(check => nanoProgress.saved[check]?.count).length : sectionKeys.filter(key => completed[key]).length;
  const allFinished = sectionKeys.length > 0 && finishedCount === sectionKeys.length;
  const canvas = () => canvasApi.current;
  // The canvas's own name, editable in the strip. Local like the ink: a board
  // and the main canvas each keep theirs; empty falls back to the course title.
  const titleKey = `${canvasKey}${board ? `:${board}` : ''}:title`;
  const [canvasTitle, setCanvasTitle] = useState(() => { try { return localStorage.getItem(titleKey) || ''; } catch { return ''; } });
  // The copy confirmation lives on the button itself - a toast in the far
  // corner reads as unrelated to the press that caused it.
  const [shareCopied, setShareCopied] = useState(false);
  const saveTitle = value => {
    const clean = value.trim().slice(0, 120);
    setCanvasTitle(clean);
    try { clean ? localStorage.setItem(titleKey, clean) : localStorage.removeItem(titleKey); } catch { /* a full store loses the name only */ }
  };
  const canvasMenus = [
    {
      title: 'Files',
      items: [
        // A tick is not provenance, it is whether the agent is given this when
        // it answers. Detaching takes nothing off the canvas.
        ...sources.map(source => ({
          label: source.label,
          checked: !!source.attached,
          hint: source.attached ? 'in context' : 'detached',
          onSelect: () => setSources(previous => toggleSource(previous, source.id)),
        })),
        ...(sources.length ? [{ divider: true }] : []),
        // Enabled even with no connection: a greyed row naming a place it will
        // not take you is worse than one that explains the next step.
        { label: 'arXiv paper…', onSelect: () => setPaperSearchOpen(true) },
        { label: 'PDF…', onSelect: () => pdfPicker.current?.click() },
        { label: 'Wikipedia article…', onSelect: () => setWikiSearchOpen(true) },
        { label: 'YouTube video…', onSelect: () => setVideoSearchOpen(true) },
        { label: 'Google Slides…', onSelect: () => toast('Connect Google under Settings → Connections to import a deck.') },
      ],
    },
    {
      title: 'Insert',
      items: [
        { label: 'Section', size: 19, weight: 650, onSelect: () => canvas()?.insertHeading(1) },
        { label: 'Sub-section', size: 16, weight: 600, onSelect: () => canvas()?.insertHeading(2) },
        { label: 'Sub-sub-section', size: 14, weight: 550, onSelect: () => canvas()?.insertHeading(3) },
        { divider: true },
        // Lived on the zoom pill as "Add section"; the menubar is its home now.
        { label: 'Section divider', onSelect: () => canvas()?.addSection() },
      ],
    },
    {
      title: 'Edit',
      items: [
        { label: 'Undo', hint: 'Ctrl Z', onSelect: () => canvas()?.undo() },
        { label: 'Redo', hint: 'Ctrl Y', onSelect: () => canvas()?.redo() },
        { divider: true },
        { label: 'Select all', onSelect: () => canvas()?.selectAll() },
        { label: 'Delete selection', hint: 'Del', onSelect: () => canvas()?.deleteSelection() },
      ],
    },
    {
      title: 'View',
      items: [
        { label: 'Zoom in', onSelect: () => canvas()?.zoomIn() },
        { label: 'Zoom out', onSelect: () => canvas()?.zoomOut() },
        { label: 'Reset zoom', onSelect: () => canvas()?.zoomReset() },
        { label: 'Zoom to fit', onSelect: () => canvas()?.zoomFit() },
        { divider: true },
        { label: 'Minimap', checked: canvasState.minimap, onSelect: () => canvas()?.toggleMinimap() },
        { label: 'Snap to grid', checked: canvasState.grid, onSelect: () => canvas()?.toggleGrid() },
        { label: 'Page guides (A4)', checked: canvasState.pages, onSelect: () => canvas()?.togglePages() },
        { label: 'Keep tool active', checked: canvasState.lock, onSelect: () => canvas()?.toggleLock() },
      ],
    },
  ];
  const milestones = lessonMilestones(sectionKeys);
  // Once the lesson has sections of its own, the bar measures those. A canvas
  // with no headings keeps the course-completion meaning it has today.
  const canvasOutline = canvasState.outline || [];
  const canvasProgress = outlineProgress(canvasOutline);
  const usingCanvas = canvasOutline.length > 0;
  const barTotal = usingCanvas ? canvasProgress.total : sectionKeys.length;
  const barDone = usingCanvas ? canvasProgress.done : finishedCount;
  const barFraction = usingCanvas ? canvasProgress.fraction : (sectionKeys.length ? finishedCount / sectionKeys.length : 0);
  const barMilestones = usingCanvas
    ? canvasProgress.milestones.map(milestone => ({ ...milestone, reached: milestone.done }))
    : milestones.map(milestone => ({ ...milestone, id: milestone.id || milestone.label, reached: finishedCount >= milestone.done }));
  // The retracted panel leaves these ticks behind, so they must agree with the
  // outline about which lessons exist and which can actually be opened.
  const railLessons = course.course?.curriculum?.lessons || sampleCourse.lessons;
  const railEntries = contentsEntries(railLessons, railLessons.map((_, index) => (course.course?.curriculum ? (index === 0 ? course.course?.lesson : null) : railLessons[index])), lesson.current?.lessonId);
  const outlineDisabled = !editor || answering || !!noteEditing;
  const coursePanel = <CoursePanel planningOnly={suppliedCourse} state={course} app={app} onPreview={previewLesson} onDeleted={() => {
          if (lesson.current?.lessonId?.startsWith('course-')) {
            playback.current?.dispose(); playback.current = null;
            lesson.current = null; setProgress(null); setNarration('');
            pinned.current = null; removeImage(); setRegion(false);
          }
          if (editor) editor.deleteShapes(editor.getPages().flatMap(p => [...editor.getPageShapeIds(p.id)]).filter(id => {
            const meta = editor.getShape(id)?.meta;
            return meta?.author === 'script' && meta.learnLesson?.startsWith('course-');
          }));
        }} />;
  return <main className="relative flex min-w-0 flex-1 overflow-hidden max-lg:flex-col">
    <section aria-label="Learn" className="min-h-0 min-w-0 flex-1">
      {/* The lesson canvas goes full-bleed so its toolbar and zoom controls sit
          at the window edges; every other view keeps the centered page frame. */}
      <div className={`expanded-page-frame mx-auto flex h-full w-full min-h-0 flex-col ${!courseView && learningView === 'lesson' ? '' : 'max-w-[900px] px-6 py-6'}`}>
        {pendingNoteView && <ConfirmDialog title="Save notes before switching?" body="Save your changes and open the selected view, or cancel to keep editing." confirmLabel="Save notes" confirmVariant="primary" onCancel={() => setPendingNoteView(null)} onConfirm={async () => { if (await noteSave.current?.()) leaveNote(pendingNoteView); }} />}
        {/* One centered strip is all the chrome the canvas gets: an editable
            title, the menubar, and the three one-press actions. No page
            heading, no rule underneath - the canvas has no boundary. */}
        {!canvasState.presenting && <div className="relative flex shrink-0 items-center justify-center gap-1 px-3 pt-3 pb-1">
          <input aria-label="Canvas title" title="Rename this canvas" value={canvasTitle} placeholder={courseTitle || app.repo || app.name}
            onChange={event => setCanvasTitle(event.target.value)} onBlur={event => saveTitle(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            className="h-8 min-w-16 max-w-96 shrink cursor-text truncate rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold text-ink outline-none [field-sizing:content] placeholder:text-ink-2 hover:border-line focus:border-line" />
          <CanvasMenubar menus={canvasMenus} />
          {paperSearchOpen && <PaperSearch app={app.name} onPick={openPaper} onClose={() => setPaperSearchOpen(false)} />}
          {wikiSearchOpen && <WikiSearch app={app.name} onPick={page => openWiki({ title: page.title })} onClose={() => setWikiSearchOpen(false)} />}
          {videoSearchOpen && <VideoSearch app={app.name} onPick={video => addVideo(video)} onClose={() => setVideoSearchOpen(false)} />}
          <div className="flex items-center gap-0.5">
            <button type="button" title="Present" aria-label="Present"
              onClick={() => { if (canvasApi.current?.present()) setPanelOpen(false); }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"><Play size={15} strokeWidth={1.8} /></button>
            <button type="button" title={shareCopied ? 'Link copied' : 'Copy a link to this canvas'} aria-label="Share"
              onClick={() => { navigator.clipboard?.writeText(window.location.href).then(() => { setShareCopied(true); setTimeout(() => setShareCopied(false), 1600); }).catch(() => toast(window.location.href)); }}
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${shareCopied ? 'text-green-600' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
              {shareCopied ? <Check size={15} strokeWidth={2} /> : <Share2 size={15} strokeWidth={1.8} />}</button>
            <button type="button" title={panelOpen ? 'Hide the right panel' : 'Show the right panel'}
              aria-label={panelOpen ? 'Hide the right panel' : 'Show the right panel'} aria-pressed={panelOpen}
              onClick={() => setPanelOpen(previous => !previous)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${panelOpen ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
              {panelOpen ? <PanelRightClose size={15} strokeWidth={1.8} /> : <PanelRightOpen size={15} strokeWidth={1.8} />}
            </button>
          </div>
        </div>}
        {learningView === 'curriculum' && course.canAuthor && !(suppliedCourse && planOpen) && <div role="tablist" aria-label="Curriculum views" className="mb-4 flex gap-1">{[['edit', 'Edit course'], ['learner', 'Learner view']].map(([value, label]) => <button key={value} role="tab" aria-selected={value === 'edit' ? courseView : learnerOpen} disabled={course.dirty} className={`rounded px-3 py-1.5 text-xs hover:bg-hover ${(value === 'edit' ? courseView : learnerOpen) ? 'bg-hover font-medium' : 'text-ink-2'}`} onClick={() => { setCourseView(value === 'edit'); setSetupChat(value === 'edit'); setLearnerOpen(value === 'learner'); }}>{label}</button>)}</div>}
        {planStorageError && <p role="alert" className="mb-3 text-xs text-red-700">{planStorageError}</p>}
        {suppliedCourse && learningView === 'curriculum' && <LessonPlanPreview onPreview={editor && nanoProgress.loaded && !answering ? () => previewLesson(nanoLesson, true) : null} edits={course.canAuthor ? planEdits : {}} selectedSection={sectionTarget?.id} onEdit={target => { setSectionTarget(target); setSetupChat(true); }} course={course.course} learnerView={!course.canAuthor || learnerOpen} editorPanel={courseView ? coursePanel : null} view={planOpen ? 'plan' : 'curriculum'} selected={plannedLesson} onBack={() => { setPlanOpen(false); setSectionTarget(null); }} onSelect={index => { setPlannedLesson(index); setPlanOpen(true); }} />}
        {courseView && !suppliedCourse && coursePanel}
        {learnerOpen && !suppliedCourse && <LearnOutline allowSample={!isRepository} onToggleComplete={toggleSection} completed={completed} state={course} sample={sampleOutline} onSampleChange={setSampleOutline} activeId={lesson.current?.lessonId} activePage={progress?.page} disabled={outlineDisabled} onOpen={openFromOutline} />}
        <div className={`${courseView || learningView !== 'lesson' ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col pr-1`}>
        {!canvasState.presenting && (!isRepository || progress) && <div aria-label="Current lesson and section" className="mb-4"><h2 className="text-lg font-semibold">Lesson {sampleIndex >= 0 ? sampleIndex + 1 : 1}: {currentLesson?.title}</h2><p className="mt-1 text-sm text-ink-2">Section {(progress?.page || 0) + 1} of {pages.length}: {progress?.label || pages[0].label}</p></div>}
        {graphError && <p role="alert" className="text-sm text-red-700">{graphError}</p>}
        {boardVisible && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2"><span>Agent explanation · lesson paused — keep asking, or resume when ready</span><div className="flex gap-2"><button type="button" disabled={!notesLoaded || answering} onClick={addNote} className="rounded border border-line-strong bg-white px-2.5 py-1 font-medium text-ink hover:bg-hover disabled:opacity-40">Save to notes</button><button type="button" onClick={() => { dismissBoard(); playback.current?.play(); }} className="rounded bg-ink px-2.5 py-1 font-medium text-white hover:opacity-90">Resume lesson</button></div></div>}
        {/* The adaptive canvas: a plain React whiteboard where chat exchanges
            land as movable blocks. Lesson playback stays parked. */}
        {board && !BOARDS[board] && <div className="border-b border-line bg-hover px-4 py-2 text-sm text-ink-2">No review board is registered as <span className="font-medium text-ink">{board}</span> - this is an empty scratch board. Registered boards live in BOARDS in demo-scenes.js.</div>}
        <div aria-label="Lesson canvas" onPointerDownCapture={openPaperReference} onClickCapture={openPaperReference} className="min-h-0 flex-1"><Suspense fallback={null}><AdaptiveCanvas exchanges={exchanges} onMove={moveExchange} onDelete={deleteExchange} onRestore={setExchanges} onAskTarget={setAskTarget} onOpenFile={openCanvasFile} onAdd={copies => setExchanges(previous => [...previous, ...copies])} onGrade={gradeCanvasAnswer} onResize={resizeExchange} onReply={replyToExchange} appName={app.name} apiRef={canvasApi} onWiki={trackWiki} onWatch={watchVideo} onDropFiles={takeDrop} onCardAction={cardAction} attachedIds={sources.filter(source => source.attached).map(source => source.id)} onGroupShot={takeGroupShot} onState={onCanvasState} storageKey={board ? `${canvasKey}:${board}:s${BOARD_SEED_VERSIONS[board] ?? 0}` : `${canvasKey}:ink`} seedBlocks={board ? (BOARDS[board]?.() ?? []) : null} renderBlockComposer={(app.hosting !== 'aws' || app.app_chat) ? (exchange, onExchange) => <AskPanel compact composerOnly canvasSeed={{ question: exchange.question, answer: exchange.answer }} onExchange={onExchange} scope={{ app: app.name }} appName={app.name} chatConfig={app.app_chat} repositoryContext={!repoAttached ? null : nanoActive ? { commit: nanoSourceVersion } : repositoryContext} conversation="learn" placeholder="Follow up in this block..." autoFocus /> : null} composer={(app.hosting !== 'aws' || app.app_chat) ? <AskPanel compact composerOnly boardContext={boardContext} onExchange={placeExchange} canvasTarget={askTarget} onClearCanvasTarget={clearAskTarget} key={`dock:${app.name}`} scope={{ app: app.name }} appName={app.name} chatConfig={app.app_chat} repositoryContext={!repoAttached ? null : nanoActive ? { commit: nanoSourceVersion } : isRepository && lesson.current?.lessonId?.startsWith('course-') ? { commit: course.course?.sourceVersion } : repositoryContext} conversation="learn" placeholder={`Ask about ${app.repo || app.name}…`} autoFocus /> : null} /></Suspense></div>
        {/* ponytail: playback bar and timeline parked while the lesson-2 canvas is redesigned */}
        {false && <div aria-label="Lesson playback" className={`${courseView || boardVisible || (isRepository && !progress) ? 'hidden' : 'flex'} shrink-0 flex-wrap items-center justify-between gap-3 pt-3`}>
          <div className="flex items-center gap-1">
            <button type="button" disabled={!progress || progress.page === 0 || answering} onClick={() => navigateLesson('back')} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-ink-2 hover:bg-hover disabled:opacity-40"><ChevronLeft size={14} />Previous lesson</button>
            <button type="button" disabled={!editor || (progress?.page === pages.length - 1 && progress.pageComplete) || answering} onClick={() => { setRegion(false); if (!progress) startDemo.current?.(); else progress.playing ? pauseLesson() : playback.current?.play(); }} className="flex min-w-20 items-center justify-center gap-1.5 rounded border border-line px-3 py-1.5 text-xs hover:bg-hover disabled:opacity-40">{progress?.playing ? <Pause size={14} /> : <Play size={14} />}{progress?.playing ? 'Pause' : 'Play'}</button>
            <button type="button" aria-label={`Playback speed ${lessonSpeed}x`} title="Playback speed" onClick={() => { const next = SPEEDS[(SPEEDS.indexOf(lessonSpeed) + 1) % SPEEDS.length]; setSpeed(next); setLessonSpeed(next); }} className="flex min-w-12 items-center justify-center rounded border border-line px-2 py-1.5 text-xs tabular-nums hover:bg-hover">{lessonSpeed}×</button>
            <button type="button" disabled={!progress || (progress.page === pages.length - 1 && progress.pageComplete) || answering} onClick={() => navigateLesson('next')} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-ink-2 hover:bg-hover disabled:opacity-40">Next lesson<ChevronRight size={14} /></button>
          </div>
          <span aria-live="polite" className="text-xs text-ink-2">{progress ? `Page ${progress.page + 1} of ${pages.length} · ${progress.label}` : 'Logistic regression · 3 pages'}</span>
        </div>}
        {false && <div className={`${courseView || boardVisible || (isRepository && !progress) ? 'hidden' : ''} shrink-0 pt-2 pb-1`}>
          <div className="relative flex items-center">
            <input type="range" aria-label="Lesson timeline" aria-valuetext={progress ? `Page ${progress.page + 1} of ${pages.length}, ${Math.round((progress.timeline / 1000 - progress.page) * 100)} percent` : 'Start the lesson to scrub'} min="0" max={pages.length * 1000} step="1" value={progress?.timeline || 0} disabled={!progress || answering} onPointerDown={pauseLesson} onChange={e => navigateLesson('scrub', Number(e.target.value))} className="h-4 w-full cursor-pointer accent-accent disabled:opacity-40" />
            {pages.slice(1).map((_, i) => <span key={i} style={{ left: `${(i + 1) * 100 / pages.length}%` }} className="pointer-events-none absolute h-2 w-px bg-white" />)}
          </div>
          <div className="mt-1 grid gap-2 text-[10px] text-ink-2" style={{ gridTemplateColumns: `repeat(${pages.length}, minmax(0, 1fr))` }}>
            {pages.map(({ label }, i) => <button key={i} type="button" disabled={!progress || answering} onClick={() => navigateLesson('seek', i)} className="truncate text-left hover:text-ink disabled:opacity-40" title={label}>{i + 1}. {i === 1 && lesson.current?.lessonId === 'sigmoid-demo' ? 'The formula' : label}</button>)}
          </div>
        </div>}
        {/* ponytail: the lesson reading strip is parked while the adaptive canvas
            fills the lesson surface; its content model moves onto the canvas */}
        {false && <div className="mt-5">{nanoActive ? <NanoLessonReading page={progress?.page || 0} progress={nanoProgress} canvasPick={canvasPick} onSource={source => { pauseLesson(); setPaperOpen(false); setSourceOpen(false); setLessonSource(source); }} /> : isRepository ? <p className="whitespace-pre-wrap text-sm text-ink-2">{narration}</p> : <LessonReading architecture={lesson.current?.lessonId === architectureLesson.id} page={progress?.page || 0} narration={narration} onSource={() => { pauseLesson(); setSourceOpen(true); }} onNotebook={() => changeLearningView('notebook')} />}</div>}
        </div>
        {/* the agent textbox now docks inside the canvas, level with the zoom pill */}
        {!courseView && learningView === 'notes' && <Suspense fallback={<p className="text-sm text-ink-2">Loading notes...</p>}><LearnNotes saveRef={noteSave} onChange={setNoteChanged} records={noteRecords} editing={noteEditing} onSave={saveNote} onDelete={removeNote} onResume={returnToNoteLesson} onEdit={record => { setNoteChanged(false); setNoteEditing(record); }} onReturn={() => setNoteEditing(null)} loaded={notesLoaded} error={notesError} /></Suspense>}
        <LessonNotebook active={!courseView && learningView === 'notebook'} />
        <LessonPractice mode={practiceMode} setMode={setPracticeMode} active={!courseView && learningView === 'practice'} onReview={async index => {
          if (lesson.current?.lessonId !== architectureLesson.id) await previewLesson(architectureLesson);
          setCourseView(false); changeLearningView('lesson'); navigateLesson('seek', index);
        }} />
      </div>
    </section>
    <ResizableSidePanel aria-label="Learn agent chat" resizeLabel="Resize Learn panel" defaultWidth={480} collapsed={!panelOpen} onClickCapture={openPaperReference} className="px-5 pt-6 pb-4">
      <div className="mb-3 flex shrink-0 items-center gap-3">
        {/* The fill is clipped to the track; the milestone dots sit on top of it
            and must not be, so the rounding lives on an inner element. */}
        <div role="progressbar" aria-label={canvasOutline.length ? 'Lesson sections completed' : suppliedCourse ? 'Lesson 1 participation progress' : 'Course completion'} aria-valuemin={0} aria-valuemax={barTotal} aria-valuenow={barDone} className="relative h-1.5 flex-1 rounded-full bg-hover">
          <div className="absolute inset-0 overflow-hidden rounded-full"><div className="h-full rounded-full bg-green-600 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${barFraction * 100}%` }} /></div>
          {barMilestones.map(milestone => <span key={milestone.id} role="img" aria-label={`${milestone.label}: ${milestone.reached ? 'complete' : 'not complete'}`} title={milestone.label} style={{ left: `${milestone.at * 100}%` }} className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${milestone.reached ? 'bg-green-600' : 'bg-line-strong'}`} />)}
        </div>
        <Trophy size={18} role="img" aria-label={suppliedCourse ? 'Complete all six pages and three objective checks to finish Lesson 1' : allFinished ? 'Course complete' : 'Complete all sections and activities to earn this award'} className={allFinished ? 'text-green-600 drop-shadow-sm' : 'text-ink-3 opacity-35'} />
      </div>
      {/* This IS the lesson's structure, not a view onto another document: both
          the learner and the agent author it through the same section tool.
          No heading and no empty-state prose - a sectionless canvas simply
          shows nothing here, and the outline speaks for itself once it exists. */}
      <div className="mb-3 flex max-h-[45%] shrink-0 flex-col overflow-y-auto">
        {/* The tutor proposes; the learner decides. Applying is one undoable
            step, and nothing here has touched the canvas yet. */}
        {proposal?.length > 0 && (
          <div className="mb-3 shrink-0 rounded-lg border border-accent/40 bg-accent/5 p-2">
            <p className="mb-1 text-xs font-medium text-ink">Proposed: {proposal.length} change{proposal.length === 1 ? '' : 's'}</p>
            <ul className="mb-2 space-y-0.5 text-xs text-ink-2">
              {proposal.map((op, index) => (
                <li key={index} className="truncate">
                  {op.op === 'add' ? `+ ${op.text}${op.level > 1 ? ` (${op.level === 2 ? 'sub-section' : 'sub-sub-section'})` : ''}`
                    : op.op === 'retitle' ? `rename to "${op.text}"`
                    : `move to ${op.level === 1 ? 'section' : op.level === 2 ? 'sub-section' : 'sub-sub-section'}`}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>Discard</Button>
              <Button size="sm" variant="secondary" onClick={() => { canvasApi.current?.applyOutline(proposal); setProposal(null); }}>Apply</Button>
            </div>
          </div>
        )}
        {canvasOutline.length > 0 ? (
          <ol className="space-y-0.5">
            {canvasOutline.map(entry => (
              <li key={entry.id} style={{ paddingLeft: (entry.level - 1) * 16 }} className="flex items-start gap-2">
                <input type="checkbox" checked={entry.done} aria-label={`${entry.label} done`}
                  onChange={() => canvasApi.current?.toggleSectionDone(entry.id)}
                  className="mt-1 h-3.5 w-3.5 shrink-0 cursor-pointer accent-green-600" />
                <button type="button" onClick={() => { setPanelOpen(true); canvasApi.current?.showSection(entry.id); }}
                  className={`flex-1 rounded text-left hover:text-accent ${entry.level === 1 ? 'text-sm font-medium' : 'text-sm text-ink-2'} ${entry.done ? 'line-through decoration-ink-3' : ''}`}>
                  {entry.label}
                </button>
              </li>
            ))}
          </ol>
        ) : null}
        <button type="button" disabled={!course.loaded || course.dirty} aria-current={learningView === 'notes' ? 'page' : undefined} onClick={() => requestLearningView('notes')}
          className={`shrink-0 text-left text-sm text-ink-2 hover:text-accent aria-[current=page]:font-medium aria-[current=page]:text-accent disabled:text-ink-3 ${canvasOutline.length ? 'mt-3 border-t border-line pt-3' : ''}`}>My notes</button>
      </div>
      {setupChat && <CourseInterview state={course} app={app} sectionEditor={suppliedCourse ? sectionEditor : null} />}
      <div className={`${setupChat ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col`}>
      {narration && !paperOpen && !wikiOpen && !sourceOpen && !lessonSource && !learnerOpen && <details className="mb-3 max-h-40 overflow-auto rounded border border-line p-3 text-sm" open><summary className="cursor-pointer text-xs font-medium">Current page explanation</summary><p className="mt-2 whitespace-pre-wrap text-ink-2">{narration}</p></details>}
      {app.hosting === 'aws' && !app.app_chat
        ? <p className="text-sm text-ink-2">Coaching is not connected for AWS jobs yet. Your job data stays in your AWS account.</p>
        : !courseView && learningView === 'lesson'
        // lesson view: chat is docked under the canvas - the panel only displays papers and source
        ? (lessonSource ? <RepositorySource appName={app.name} {...lessonSource} onClose={() => setLessonSource(null)} /> : wikiOpen && wikiContext ? <LearnWiki app={app.name} article={wikiContext} openAt={wikiOpenAt} onNavigate={next => setWikiContext(previous => ({ ...previous, ...next, selection: null }))} onSection={section => setWikiContext(previous => (previous?.section === section ? previous : { ...previous, section }))} onSelect={text => setWikiContext(previous => ({ ...previous, selection: text }))} onClose={() => setWikiOpen(false)} /> : paperOpen && paperContext ? <LearnPaper app={app.name} paper={paperContext} onPage={page => setPaperContext(previous => ({ ...previous, page, selection: undefined }))} onSelect={selection => { removeImage(); pinned.current = null; setPaperContext(previous => ({ ...previous, selection })); }} onClose={() => setPaperOpen(false)} /> : sourceOpen ? <LessonSource onClose={() => setSourceOpen(false)} /> : null)
        : <AskPanel onGraph={onGraph} key={app.name} scope={{ app: app.name }} appName={app.name} chatConfig={app.app_chat} repositoryContext={!repoAttached ? null : nanoActive ? { commit: nanoSourceVersion } : isRepository && lesson.current?.lessonId?.startsWith('course-') ? { commit: course.course?.sourceVersion } : repositoryContext} conversation="learn" headerTitle="Learn Agent" demo={isRepository ? null : demo} boardContext={boardContext} contentPanel={lessonSource ? <RepositorySource appName={app.name} {...lessonSource} onClose={() => setLessonSource(null)} /> : wikiOpen && wikiContext ? <LearnWiki app={app.name} article={wikiContext} openAt={wikiOpenAt} onNavigate={next => setWikiContext(previous => ({ ...previous, ...next, selection: null }))} onSection={section => setWikiContext(previous => (previous?.section === section ? previous : { ...previous, section }))} onSelect={text => setWikiContext(previous => ({ ...previous, selection: text }))} onClose={() => setWikiOpen(false)} /> : paperOpen && paperContext ? <LearnPaper app={app.name} paper={paperContext} onPage={page => setPaperContext(previous => ({ ...previous, page, selection: undefined }))} onSelect={selection => { removeImage(); pinned.current = null; setPaperContext(previous => ({ ...previous, selection })); }} onClose={() => setPaperOpen(false)} /> : sourceOpen ? <LessonSource onClose={() => setSourceOpen(false)} /> : null} onCloseContentPanel={() => { setPaperOpen(false); setWikiOpen(false); setSourceOpen(false); setLessonSource(null); }} placeholder={`Ask about ${app.repo || app.name}…`} autoFocus />}
      </div>
    </ResizableSidePanel>
    <input ref={pdfPicker} type="file" accept="application/pdf" className="hidden"
      onChange={event => { takePdf(event.target.files?.[0]); event.target.value = ''; }} />
    {/* With sections on the canvas the rail mirrors the panel's table of
        contents - hover opens it, a click frames that section, and the panel
        stays closed. A sectionless canvas falls back to the course lessons. */}
    {!panelOpen && <ContentsRail entries={canvasOutline.length
        ? canvasOutline.map((entry, index) => ({ n: index + 1, label: entry.label, available: true, active: false, section: entry.id }))
        : railEntries}
      onOpen={entry => { if (entry.section) { canvasApi.current?.showSection(entry.section); return; } setPanelOpen(false); openFromOutline(entry.content, 'lesson', 0); }} />}
  </main>;
}
