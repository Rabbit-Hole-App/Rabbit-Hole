import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, BoxSelect, Check, ChevronLeft, ChevronRight, ClipboardPaste, House, Copy, CopyPlus, FileText, Group, Keyboard, SquareSlash, Ungroup, Upload, Grid3x3, Heading1, Heading2, Heading3, SeparatorHorizontal, StickyNote, Type, Lock, Map as MapIcon, Maximize2, PanelRightClose, PanelRightOpen, Pause, Play, Redo2, RotateCcw, Search, Share2, Trash2, NotebookPen, Undo2, ZoomIn, ZoomOut, GripVertical, Plus } from 'lucide-react';
import { SPEEDS, getSpeed, setSpeed } from './learn-audio.js';
import { api, navigate, wsHeaders } from './api.js';
import { AskPanel } from './ask.jsx';
import { Button, IconBtn, ConfirmDialog, toast } from './ui.jsx';
import SharePanel from './SharePanel.jsx';
import { assetKeysOf, requestWorkspaceExports, setRemoteAssets, setWorkspaceStore } from './learn-board-assets.js';
import { captureSelection, selectionSnapshot } from './sigmoid-context.js';
import { CourseInterview, CoursePanel, useLearnCourse } from './LearnCourse.jsx';
import { LessonNotebook, LessonPractice, LessonReading, LessonSource } from './LearnExtras.jsx';
import LearnOutline from './LearnOutline.jsx';
import ContentsRail from './ContentsRail.jsx';
import CanvasMenubar from './CanvasMenubar.jsx';
import SearchBar from './SearchBar.jsx';
import LearnSlash from './LearnSlash.jsx';
import FeedbackButton from './FeedbackButton.jsx';
import { isLearnCommand, parseSlash, runLearnCommand } from './learn-slash.js';
import { warmLearnTools } from './learn-warmup.js';
import ShortcutsSheet from './ShortcutsSheet.jsx';
// Lazy: it draws real cards, so it brings the card components with it.
const SlashCommandsSheet = lazy(() => import('./SlashCommandsSheet.jsx'));
import FilesPanel from './FilesPanel.jsx';
import LearnWiki from './LearnWiki.jsx';
import { withSource, toggleSource, isAttached } from './learn-sources.js';
import LessonPlanPreview from './LessonPlanPreview.jsx';
import NanoLessonReading, { useNanoProgress } from './NanoLessonReading.jsx';
import { nanoLesson, nanoSourceVersion } from './nanogpt-lesson.js';
import RepositorySource from './RepositorySource.jsx';
import ResizableSidePanel from './ResizableSidePanel.jsx';
import LearnPaper from './LearnPaper.jsx';
import { cacheAsset, cachedAsset } from './learn-asset-cache.js';
import { classifyDrop } from './learn-drop.js';
import { captureNotePage, notesScope, readNotes, writeNote, deleteNote } from './learn-notes.js';
import { gradeAnswer, parseVerdict, recordBaseline, shadowGrade } from './learn-grade.js';
import { architectureLesson, sampleCourse } from './learn-preview.js';
import { BOARDS, BOARD_SEED_VERSIONS } from './demo-scenes.js';
import { DiveNavigator, DivePortals, holeApp, useDive, usePendingHole } from './Dive.jsx';
import { useTutor } from './LearnTutor.jsx';

const LearnNotes = lazy(() => import('./LearnNotes.jsx'));
const boardSlug = name => String(name).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'test';
const AdaptiveCanvas = lazy(() => import('./AdaptiveCanvas.jsx'));
const SECTION_LEVELS = [[1, 'Section', Heading1], [2, 'Sub-section', Heading2], [3, 'Sub-sub-section', Heading3]];

// A pending Rabbit Hole (Dive.jsx) opens in its parent's place until its first canvas object keeps it.
export default function LearnPage(props) {
  const hole = usePendingHole(props.app);
  return hole ? <LearnSurface key={hole.name} app={holeApp(props.app, hole)} hole={hole} /> : <LearnSurface {...props} />;
}

function LearnSurface({ app, onBack, repositoryContext = null, onGraph = null, hole = null }) {
  const isRepository = app.kind === 'repository';
  // A canvas (smart-home's catalog) holds only what was put on it: never the
  // sample course, its lesson header, outline or progress.
  const isCanvas = /^canvas-[a-f0-9]{8}$/.test(app.name);
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
  const [sampleOutline, setSampleOutline] = useState(app.kind !== 'repository' && !/^canvas-[a-f0-9]{8}$/.test(app.name));
  const [practiceMode, setPracticeMode] = useState('quiz');
  const [learningView, setLearningView] = useState('lesson');
  // The right panel starts closed: the canvas gets the room; View or the
  // panel button opens it.
  const [panelOpen, setPanelOpen] = useState(false);
  // Mirrored from the canvas so the View menu can tick what is on. Held by value
  // rather than by ref, and returned unchanged when nothing moved, or the effect
  // that publishes it would re-render forever.
  const [canvasState, setCanvasState] = useState({ grid: false, lock: false, minimap: true, pages: false, presenting: false, outline: [], selected: 0, units: 0, grouped: false, canPaste: false });
  // boardContext is rebuilt every render but read inside a send; a ref keeps the
  // outline current without making the composer re-render on every tick.
  // A proposal from the tutor. It sits here until the learner applies or
  // discards it; nothing reaches the canvas on its own.
  const [proposal, setProposal] = useState(null);
  // The table of contents: which level is being added, the section being dragged, and the heading it lands before (null: the end).
  const [tocAdding, setTocAdding] = useState(null);
  const [tocEditing, setTocEditing] = useState(null);
  const [tocDrag, setTocDrag] = useState(null);
  const [tocDrop, setTocDrop] = useState(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  // What a /paper <topic> command searches for; null for the plain search bar.
  const [searchSeed, setSearchSeed] = useState(null);
  // Tool Performance v1: common tools fetched on idle, one per quiet moment (learn-warmup.js).
  useEffect(() => { warmLearnTools(app.name); }, [app.name]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [slashHelpOpen, setSlashHelpOpen] = useState(false);
  // / opens Search and ? the shortcuts sheet - the keys the page owns; the
  // canvas owns the rest. Neither fires while typing or presenting.
  useEffect(() => {
    const key = event => {
      if (event.ctrlKey || event.metaKey || event.altKey || (event.key !== '/' && event.key !== '?')) return;
      const active = window.document.activeElement;
      if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
      if (canvasStateRef.current.presenting) return;
      event.preventDefault();
      if (event.key === '/') { setShortcutsOpen(false); setSearchOpen(true); } else setShortcutsOpen(open => !open);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const [videoContext, setVideoContext] = useState(null);
  const [wikiOpen, setWikiOpen] = useState(false);
  // Bumped only by an explicit open, so the reader can tell "go to this section"
  // apart from "you are now looking at this section".
  const [wikiOpenAt, setWikiOpenAt] = useState(0);
  const [wikiContext, setWikiContext] = useState(null);
  const canvasStateRef = useRef(canvasState);
  canvasStateRef.current = canvasState;
  const onCanvasState = useCallback(next => setCanvasState(previous =>
    (previous.grid === next.grid && previous.lock === next.lock && previous.minimap === next.minimap && previous.pages === next.pages && previous.presenting === next.presenting && previous.selected === next.selected && previous.units === next.units && previous.grouped === next.grouped && previous.canPaste === next.canPaste && previous.content === next.content && JSON.stringify(previous.card) === JSON.stringify(next.card) && JSON.stringify(previous.outline) === JSON.stringify(next.outline) && JSON.stringify(previous.cards) === JSON.stringify(next.cards) ? previous : next)), []);
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
  const named = hole ? null : new URLSearchParams(window.location.search).get('board');
  // An unknown review-board name renders a visible notice rather than a blank
  // canvas: a blank is indistinguishable from a broken deploy, and it burned a
  // review twice. Scratch boards are still available - any name works as an
  // empty board - but the emptiness is now announced, never silent.
  const board = named ? boardSlug(named) : null;
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
    return blockId;
  };
  // A seek on a card's window bar moves what "here" means for the next
  // question. Built from the event alone, never from previous state: the card
  // may have been restored from storage or be the second one on the canvas,
  // and either way the one the learner just touched is the one they mean.
  const watchVideo = ({ id, videoId, title, start, end }) =>
    setVideoContext({ blockId: id, videoId, title, start, end: end ?? null });
  const videoAttached = !videoContext?.blockId || isAttached(sources, `video:${videoContext.blockId}`);
  // Search and the tutor put things on the canvas as cards; the side panel
  // only opens through "Open in reader". What rides the next question is the
  // card just added - one context at a time, as before.
  const addWiki = ({ title, section = 0 }) => {
    pauseLesson();
    const blockId = canvas()?.insertWiki({ title, section });
    if (!blockId) return;
    setWikiContext({ blockId, title, section, selection: null });
    setPaperContext(null);
    registerSource({ id: `wiki:${blockId}`, kind: 'wiki', label: String(title).replace(/_/g, ' ') });
    return blockId;
  };
  const addPaper = paper => {
    pauseLesson();
    const page = paper.page || 1;
    const blockId = canvas()?.insertPaper({ id: paper.id, title: paper.title, page });
    if (!blockId) return;
    setPaperContext({ ...paper, page });
    setWikiContext(null);
    registerSource({ id: `paper:${paper.id}`, kind: 'paper', label: paper.title || `arXiv ${paper.id}` });
    return blockId;
  };
  // One road from a search result to a card: the Search bar and the Agent Bar
  // handoff both take it. Returns the card's block id.
  const pickResult = (source, item) => (source === 'arxiv' ? addPaper(item) : source === 'wikipedia' ? addWiki({ title: item.title }) : addVideo(item));
  // A paper card turning its page is where the learner is now - unless the
  // reader is open, which wins, as it does for a wiki card's section.
  const trackPaper = next => {
    if (paperOpen) return;
    setPaperContext(previous => (previous?.id === next.paperId && previous.page === next.page ? previous
      : { id: next.paperId, title: next.title, pdfUrl: previous?.id === next.paperId ? previous.pdfUrl : `https://arxiv.org/pdf/${next.paperId}`, page: next.page }));
  };
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
    setWikiOpen(true); setPaperOpen(false); setSourceOpen(false); setLessonSource(null); setLearnerOpen(false); setSetupChat(false); setPanelOpen(true);
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
    setPaperOpen(true); setSourceOpen(false); setLessonSource(null); setLearnerOpen(false); setSetupChat(false); setPanelOpen(true);
    registerSource({ id: `paper:${paper.id}`, kind: 'paper', label: paper.title || `arXiv ${paper.id}` });
  };
  // A PDF needs no account and no server: the bytes go to this browser's asset
  // store and the block keeps only the key. The file picker is hidden and
  // triggered from the Sources menu, so there is no dialog to dismiss.
  // The Files menu's Upload: same router as a drop, one picker for all kinds.
  const filePicker = useRef(null);
  // An upload asks once whether the card shows the PDF or its pages as slides; Cancel adds nothing.
  const [pdfChoice, setPdfChoice] = useState(null);
  const takePdf = async file => {
    if (!file) return;
    const mode = await new Promise(resolve => setPdfChoice({ name: file.name, resolve }));
    setPdfChoice(null);
    if (!mode) return;
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
    canvas()?.insertPdf({ assetKey, label: stored.title, slides: mode === 'slides' });
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
  // A paper switched off in Files stops reaching the tutor too (uploads are registered as upload:..., arXiv as paper:<id>).
  const paperAttached = !paperContext?.id || isAttached(sources, String(paperContext.id).startsWith('upload:') ? paperContext.id : `paper:${paperContext.id}`);
  // Deleting the paper's card on the canvas drops it from the next question too, as removing it in Files does.
  // Only a card seen and then gone counts: a paper opened in the reader alone never had one.
  const paperCardId = paperContext?.id ? (canvasState.cards || []).find(([, assetKey, paperId]) => assetKey === `pdf:${paperContext.id}` || paperId === paperContext.id)?.[0] || null : null;
  const paperCardSeen = useRef(null);
  useEffect(() => {
    if (paperCardId) { paperCardSeen.current = paperContext.id; return; }
    if (paperCardSeen.current !== (paperContext?.id ?? null)) { paperCardSeen.current = null; return; }
    if (canvasState.cards && paperCardSeen.current) { paperCardSeen.current = null; setPaperContext(null); setPaperOpen(false); }
  }, [paperCardId, paperContext?.id, canvasState.cards]);
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
    else if (action === 'paper-reader') openPaper({ id: payload.id, title: payload.title, pdfUrl: `https://arxiv.org/pdf/${payload.id}`, page: payload.page || 1 });
    else if (action === 'attach-toggle') setSources(previous => toggleSource(previous, payload.sourceId));
    else if (action === 'image-attach') {
      // Re-arm an older dropped image as the one the tutor sees; only the
      // latest drop rides otherwise.
      setImageContext({ blockId: payload.blockId, id: payload.mediaId, title: payload.label });
      registerSource({ id: `image:${payload.blockId}`, kind: 'image', label: payload.label });
      setSources(previous => previous.map(entry => entry.id === `image:${payload.blockId}` ? { ...entry, attached: true } : entry));
    }
  };
  // A group's Ask sends its rendered snapshot with that group's question, so
  // the tutor sees the arrangement, not only our text description of it. It
  // joins the armed group target; a question already sent goes without it.
  const takeGroupShot = async (blob, label, groupId) => {
    try {
      const body = new FormData();
      body.append('file', blob, `${label}.png`);
      const response = await fetch(`/api/learn/media?app=${encodeURIComponent(app.name)}`, { method: 'POST', body, headers: wsHeaders() });
      const stored = await response.json();
      if (!response.ok) throw new Error(stored?.error || 'Upload failed');
      setAskTarget(previous => previous?.id === groupId ? { ...previous, image: stored.id } : previous);
    } catch { /* the text target still asks; the tutor just cannot see it */ }
  };
  // Ask about selection (AdaptiveCanvas askArea): the area becomes the ask target and the thumbnail
  // above the composer; its PNG is uploaded like a group shot, so the tutor sees the pixels.
  const takeAreaShot = async ({ target, preview: shot, blob }) => {
    // One chip: the selection's own thumbnail and its x, no second canvas-image attachment beside it.
    setAskTarget({ ...target, ...(shot ? { preview: shot } : {}) });
    previewRequest.current++;
    setPreview(null);
    if (!blob) return;
    try {
      const body = new FormData();
      body.append('file', blob, 'selected-area.png');
      const response = await fetch(`/api/learn/media?app=${encodeURIComponent(app.name)}`, { method: 'POST', body, headers: wsHeaders() });
      const stored = await response.json();
      if (!response.ok) throw new Error(stored?.error || 'Upload failed');
      setAskTarget(previous => previous?.id === target.id ? { ...previous, image: stored.id } : previous);
    } catch { /* the text of the cards inside still asks */ }
  };
  const repoSourceId = app.repo ? `repo:${app.repo}` : null;
  // The repository is the one source that exists on day one, and detaching it
  // genuinely stops repository_context reaching the agent (ask.jsx:467).
  useEffect(() => { if (repoSourceId) registerSource({ id: repoSourceId, kind: 'repository', label: app.repo }); }, [repoSourceId, app.repo, registerSource]);
  const repoAttached = !repoSourceId || isAttached(sources, repoSourceId);
  // The dock's / commands (docs/features/learn-artifact-generation.md), run
  // against this canvas.
  const learnSlash = {
    Picker: LearnSlash,
    isCommand: isLearnCommand,
    onHelp: () => setSlashHelpOpen(true),
    run: text => {
      // Tutor v1: /deeper and /simplify are the turn's slash (tutor-v1-locked-decisions.md §5).
      const parsed = tutor.active && parseSlash(text);
      if (parsed && ['deeper', 'simplify'].includes(parsed.name)) tutor.slash(parsed.name, text.trim());
      return runLearnCommand(text, {
        app: app.name,
        target: askTarget,
        canvas: {
          insertNotebook: () => canvasApi.current?.insertNotebook(),
          insertBlock: block => canvasApi.current?.insertBlock(block),
          insertPaper: ({ id }) => addPaper({ id }),
          dive: args => dive.run(args),
        },
        openSearch: seed => { setSearchSeed(seed); setSearchOpen(true); },
        post: (path, body) => api(path, { method: 'POST', body: JSON.stringify({ ...body, ...(askScope.pending ? { pending: askScope.pending } : {}) }) }),
      });
    },
  };
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
  // A pending Rabbit Hole's asks carry its parent and title: it has no canvas row until its first object (Dive.jsx).
  const askScope = hole ? { app: app.name, pending: { parent: hole.parent, title: app.title } } : { app: app.name };
  const canvasApi = useRef(null);
  // Sharing (docs/features/canvas-sharing.md): the board is saved on the
  // server while it is shared, so its links show the latest version. A newer
  // copy saved through an edit link replaces this browser's copy on open.
  const boardName = board || 'main';
  // /dive: nested Rabbit Holes from the selected card (docs/features/dive-v1.md).
  const dive = useDive({ app, board: boardName, hole, canvasApi, canvasState, baseFor: name => `small.adaptive-canvas:${app.org}:${app.email || app.owner_email}:${name}`, onTitle: title => saveTitle(title), referent: () => exchangesRef.current.at(-1)?.question || '' });
  // Tutor v1 on the NanoGPT Attention slice and its holes (LearnTutor.jsx).
  const tutor = useTutor({ app, board: boardName, access: askScope, canvasApi, canvasState, dive });
  const boardStorageKey = board ? `${canvasKey}:${board}:s${BOARD_SEED_VERSIONS[board] ?? 0}` : `${canvasKey}:ink`;
  const boardPath = `/api/learn/boards/${encodeURIComponent(app.name)}/${encodeURIComponent(boardName)}`;
  const [sharing, setSharing] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState(null);
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  // Below lg the lesson canvas fills exactly the screen left under the page
  // chrome, so the shared composer sits at the bottom edge like the
  // Mothership's (WP7). It never drops under 45% of the screen (the Cards
  // floor), and the page still scrolls to the contents underneath.
  const canvasFrame = useRef(null);
  const [phoneCanvasHeight, setPhoneCanvasHeight] = useState(null);
  useEffect(() => {
    const frame = canvasFrame.current;
    if (!frame) return;
    const fit = () => {
      if (window.innerWidth >= 1024) { setPhoneCanvasHeight(null); return; }
      const screen = window.visualViewport?.height || window.innerHeight;
      const top = frame.getBoundingClientRect().top + (frame.closest('main')?.scrollTop || 0);
      setPhoneCanvasHeight(Math.round(Math.max(screen * 0.45, screen - top)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame.parentElement);
    window.addEventListener('resize', fit);
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); };
  }, [canvasEpoch, learningView, courseView]);
  const sharingRef = useRef(null);
  sharingRef.current = sharing;
  const boardVersion = useRef(null);
  const exchangesRef = useRef(exchanges);
  exchangesRef.current = exchanges;
  const versionKey = `${boardStorageKey}:v`;
  const boardSnapshot = () => {
    let state = {};
    try { state = JSON.parse(localStorage.getItem(boardStorageKey) || '{}'); } catch { /* an unreadable copy shares as empty */ }
    return { ...state, exchanges: exchangesRef.current };
  };
  // Board files follow the board: this page's cards read the server copy when
  // this browser has none, and while shared, any file not yet uploaded goes up.
  useEffect(() => {
    setRemoteAssets(key => fetch(`${boardPath}/assets/${encodeURIComponent(key)}`, { headers: wsHeaders() }));
    // Notebook workspaces: saved while shared; loaded only into an empty
    // workspace (this owner on another browser), never over local files.
    const workspaceUrl = id => `${boardPath}/assets/${encodeURIComponent(`notebook:${id}`)}`;
    setWorkspaceStore({
      load: id => fetch(workspaceUrl(id), { headers: wsHeaders() }).then(response => (response.ok ? response.json() : null)).catch(() => null),
      save: (id, files) => (sharingRef.current?.shared
        ? fetch(workspaceUrl(id), { method: 'PUT', body: JSON.stringify(files), headers: { 'Content-Type': 'text/x-cached-string', 'X-Asset-Kind': 'string', ...wsHeaders() } }).catch(() => null)
        : null),
      fresh: false,
    });
    return () => { setRemoteAssets(null); setWorkspaceStore(null); };
  }, [boardPath]);
  const uploadedAssets = useRef(null);
  useEffect(() => { uploadedAssets.current = null; }, [boardPath]);
  // `sharingNow`: the caller already knows it is shared (the state has not caught up).
  const syncAssets = async (sharingNow = false) => {
    if (!sharingNow && !sharingRef.current?.shared) return;
    try {
      if (!uploadedAssets.current) uploadedAssets.current = new Set((await api(`${boardPath}/assets`)).keys);
      for (const key of assetKeysOf(boardSnapshot())) {
        if (uploadedAssets.current.has(key)) continue;
        const value = await cachedAsset(key);
        if (value == null) continue;
        const blob = typeof value === 'string' ? new Blob([value], { type: 'text/x-cached-string' }) : value;
        uploadedAssets.current.add(key);
        if (blob.size > 25 * 1024 * 1024) { toast(`${blob.name || 'A file'} is over 25 MB, so it stays in your browser and others will not see it.`); continue; }
        const response = await fetch(`${boardPath}/assets/${encodeURIComponent(key)}`, {
          method: 'PUT', body: blob,
          headers: { 'Content-Type': blob.type || 'application/octet-stream', ...(typeof value === 'string' ? { 'X-Asset-Kind': 'string' } : {}), ...wsHeaders() },
        });
        if (!response.ok) uploadedAssets.current.delete(key);
      }
    } catch { /* tried again after the next save */ }
  };
  useEffect(() => {
    let live = true;
    api(boardPath).then(data => {
      if (!live) return;
      setSharing(data.sharing);
      if (data.exists === false) return; // never saved on the server
      boardVersion.current = data.version;
      const mine = Number(localStorage.getItem(versionKey) || 0);
      // A newer server copy wins when this browser has none (a fork, or this
      // board on another device) or someone else saved it.
      const hasLocal = localStorage.getItem(boardStorageKey) !== null;
      if (data.version > mine && (!hasLocal || (data.sharing.shared && data.updated_by !== (app.email || app.owner_email)))) {
        const { exchanges: chats, ...state } = data.state || {};
        try { localStorage.setItem(boardStorageKey, JSON.stringify(state)); localStorage.setItem(versionKey, String(data.version)); } catch { /* keep the local copy */ }
        if (Array.isArray(chats)) setExchanges(chats);
        setCanvasEpoch(epoch => epoch + 1);
        toast(data.forked_from ? `Your fork of ${data.forked_from.title} is ready. It is yours to edit.` : 'You are seeing the latest saved version of this board.');
      }
    }).catch(error => { if (live) setSharing(error.status === 404 ? (error.data?.sharing || { shared: false }) : { unavailable: error.message }); });
    return () => { live = false; };
  }, [boardPath]);
  const pushTimer = useRef(null);
  const pushBoard = useCallback(() => {
    if (!sharingRef.current?.shared) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      try {
        const data = await api(boardPath, { method: 'PUT', body: JSON.stringify({ state: boardSnapshot(), version: boardVersion.current }) });
        boardVersion.current = data.version;
        try { localStorage.setItem(versionKey, String(data.version)); } catch { /* the next open re-checks */ }
        syncAssets();
      } catch (error) {
        if (error.status === 409) toast('This board changed in another tab or on another device. Reload to see those changes; your newer edits here are not saved to the link yet.', { tone: 'error' });
      }
    }, 1500);
  }, [boardPath]);
  useEffect(() => { pushBoard(); }, [exchanges, pushBoard]);
  const changeSharing = async next => {
    setShareBusy(true);
    setShareError(null);
    try {
      const data = await api(`${boardPath}/share`, { method: 'POST', body: JSON.stringify({ ...next, state: boardSnapshot() }) });
      boardVersion.current = data.version;
      setSharing(data.sharing);
      // Sharing on: the server gets this browser's board as it is now.
      if (data.sharing.shared) {
        const saved = await api(boardPath, { method: 'PUT', body: JSON.stringify({ state: boardSnapshot(), version: boardVersion.current }) });
        boardVersion.current = saved.version;
        try { localStorage.setItem(versionKey, String(saved.version)); } catch { /* the next open re-checks */ }
        await syncAssets(true);
        requestWorkspaceExports();
      }
    } catch (error) { setShareError(error.message); }
    finally { setShareBusy(false); }
  };
  // Challenge blocks ask the tutor to judge a committed answer. Jev grades the
  // same attempt side by side (docs/features/jev-grading.md). The learner only
  // ever sees Opus: the shadow promise is never awaited here, and the Opus
  // error is rethrown unchanged by the try/finally.
  const gradeCanvasAnswer = async (block, answer, onDelta) => {
    const pending = shadowGrade({ app, board, block, answer });
    const started = performance.now();
    let text = '';
    let verdict = null;
    try {
      await gradeAnswer({ app: app.name, block, answer, onDelta: delta => { text += delta; onDelta(delta); } });
      verdict = parseVerdict(text);
    } finally {
      const ms = Math.round(performance.now() - started);
      pending.then(gradeId => gradeId && recordBaseline({ app: app.name, gradeId, verdict, ms }));
    }
  };
  // A file reference clicked inside a canvas block opens in the right panel.
  // A cited source names its own revision (and repository, for the link out);
  // a bare path reference reads the lesson's.
  const openCanvasFile = (path, line, lineEnd, cited = {}) => {
    setPaperOpen(false); setSourceOpen(false); setWikiOpen(false); setPanelOpen(true);
    setLessonSource({ path, line, lineEnd, commit: cited.commit || (nanoActive ? nanoSourceVersion : repositoryContext?.commit), repo: cited.repo });
  };
  const clearAskTarget = () => { setAskTarget(null); canvasApi.current?.deselect(); };
  const playback = useRef(null);
  const startDemo = useRef(null);
  const [progress, setProgress] = useState(null);
  const [completed, setCompleted] = useState({});
  const recordProgress = value => {
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
  const [lessonSpeed, setLessonSpeed] = useState(getSpeed());
  // Learn is immersive: entering collapses the sidebar; the top-left Home restores it.
  useEffect(() => { window.dispatchEvent(new CustomEvent('small:sidebar', { detail: { collapsed: true } })); }, []);
  const [canvasPick] = useState(null);
  // The red selection ellipse stays on the canvas while the question is asked.
  const regionMarker = useRef(null);
  const clearRegionMarker = () => {
    if (regionMarker.current && editor?.getShape(regionMarker.current)) editor.deleteShapes([regionMarker.current]);
    regionMarker.current = null;
  };

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
  // Removing the thumbnail also drops a selected area's picture from the question.
  const removeImage = () => { previewRequest.current++; setPreview(null); setAskTarget(previous => (String(previous?.id || '').startsWith('area:') ? { ...previous, image: undefined, preview: undefined } : previous)); };
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
          // A card's Wikipedia source opens in the wiki reader, like the tutor's.
          const wiki = link.getAttribute('data-source-wiki');
          if (wiki) { if (event.type === 'click') { event.preventDefault(); event.stopPropagation(); openWiki({ title: wiki }); } else event.stopPropagation(); return; }
          let url; try { url = new URL(href); } catch { return; }
          if (url.protocol !== 'https:' || url.hostname !== 'arxiv.org') return;
          const match = url.pathname.match(/^\/(?:pdf|abs)\/(\d{4}\.\d{4,5}(?:v\d+)?|[a-z.-]+\/\d{7}(?:v\d+)?)(?:\.pdf)?$/i);
          if (!match) return;
          const shape = editor?.getCurrentPageShapes().find(shape => shape.meta?.paper?.id === match[1]);
          const paper = shape?.meta.paper || { id: match[1], title: link.textContent, pdfUrl: `https://arxiv.org/pdf/${match[1]}`, page: 1 };
          event.preventDefault(); event.stopPropagation();
          const paged = { ...paper, page: Number(url.hash.match(/page=(\d+)/)?.[1]) || paper.page };
          // A card's Sources link opens the paper reader, one reader at a time as openPaper does;
          // any other arXiv link on the canvas lands as a paper card.
          if (link.hasAttribute('data-source-link')) openPaper(paged); else addPaper(paged);
  };
  const boardContext = {
    paper: paperAttached ? paperContext : null, clearPaper: () => { setPaperContext(null); setPaperOpen(false); setWikiContext(null); setWikiOpen(false); },
    // Detaching the source is a context switch, not a deletion: the card stays
    // on the canvas and the reader stays open, the tutor just stops being told.
    wiki: wikiAttached ? wikiContext : null,
    video: videoAttached ? videoContext : null,
    image: imageAttached ? imageContext : null,
    onShowWiki: article => addWiki(article),
    onShowVideo: moment => addVideo(moment),
    // Read at send time, so a question always carries the outline as it is now.
    outline: () => canvasStateRef.current.outline || [],
    onOutlineProposal: ops => setProposal(ops),
    onShowPaper: paper => addPaper(paper),
    preview: paperContext?.selection?.preview || preview,
    previewKind: paperContext?.selection ? 'paper' : 'canvas',
    removeImage: () => { removeImage(); setPaperContext(previous => previous ? { ...previous, selection: undefined } : previous); },
    pause: pauseLesson, setAnswering,
  };
  const demo = {
    startRef: startDemo,
    prompt: 'Explain the sigmoid function',
    disabled: !editor || progress?.playing || course.dirty || !!noteEditing,
    run: async (replace) => {
      clearRegionMarker();
      setCourseView(false); setLearningView('lesson'); setSetupChat(false); setNarration('');
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
    clearRegionMarker(); setLessonSource(null); setPaperOpen(false); setSourceOpen(false);
    playback.current?.dispose(); pinned.current = null; removeImage();
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
  const returnToNoteLesson = async (record, resume = true) => {
    // ponytail: with the lesson player parked there is no editor to seek, so a note just closes back to the canvas.
    if (!editor) { setNoteEditing(null); setLearningView('lesson'); setCourseView(false); return; }
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
    pinned.current = null; removeImage(); clearRegionMarker();
    playback.current?.[action](value, position);
    refreshSelection(v => v + 1);
  };
  const changeLearningView = value => {
    clearRegionMarker(); pauseLesson(); setSourceOpen(false); setLessonSource(null); setPaperOpen(false);
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
  const canvas = () => canvasApi.current;
  // The Agent Bar's way in, from Home, Library and Project. A request arrives
  // as the one-shot sessionStorage key small.learn.request, written before
  // navigating here, or as a small:learn-request event while Learn is open:
  //   { id, kind: 'teach', app, prompt }
  //   { id, kind: 'research', app, board?, source: { kind: 'arxiv' | 'wiki' | 'youtube', ref } }
  // Each id gets one small:learn-result { id, kind, status, reason?, resourceId? },
  // also kept at small.learn.result:<id> for a caller that remounted. A
  // repeated id replays its result and does nothing twice. Teach only fills
  // the dock composer - the learner sends it, with whatever context Send adds.
  const handoff = useRef({ busy: new Set() });
  handoff.current.latest = { app: app.name, board, pickResult, lessonShown: learningView === 'lesson' && !courseView, requestLearningView };
  useEffect(() => {
    const until = async (check, ms) => {
      for (const end = Date.now() + ms; ; await new Promise(resolve => setTimeout(resolve, 50))) {
        const value = check();
        if (value || Date.now() > end) return value;
      }
    };
    const settle = result => {
      try { sessionStorage.setItem(`small.learn.result:${result.id}`, JSON.stringify(result)); } catch { /* the event still carries it */ }
      window.dispatchEvent(new CustomEvent('small:learn-result', { detail: result }));
    };
    const run = async (id, kind, request) => {
      const latest = handoff.current.latest;
      const no = (status, reason) => ({ id, kind, status, reason });
      if (request.app !== latest.app) return no('rejected', `This request is for ${request.app || 'no app'}, but Learn is open on ${latest.app}.`);
      if ((request.board ? boardSlug(request.board) : null) !== latest.board) return no('rejected', `Learn is open on another canvas. Open /apps/${latest.app}?tab=learn${request.board ? `&board=${boardSlug(request.board)}` : ''} first.`);
      if (kind === 'research' && request.source?.kind === 'pdf') return no('rejected', 'Uploaded PDFs do not have a portable source reference for this handoff. Add/upload the PDF from Learn instead.');
      const from = kind === 'research' && { arxiv: 'arxiv', wiki: 'wikipedia', youtube: 'youtube' }[request.source?.kind];
      const ref = String(request.source?.ref || '').trim();
      if (kind === 'research' && !from) return no('rejected', 'Unsupported source kind. Use arxiv, wiki or youtube.');
      if (kind === 'research' && !ref) return no('rejected', 'The source reference is empty.');
      const prompt = typeof request.prompt === 'string' ? request.prompt.trim() : '';
      if (kind === 'teach' && !prompt) return no('rejected', 'The prompt is empty.');
      if (!latest.lessonShown) latest.requestLearningView('lesson');
      if (kind === 'teach') {
        const input = await until(() => window.document.querySelector('[data-learn-dock] [data-chat-composer] input:not([type="file"])'), 10000);
        if (!input) return no('failed', 'The Learn chat did not open. Open Learn and try again.');
        if (input.value.trim() && input.value !== prompt) return no('rejected', 'The Learn chat already has a draft. Send or clear it, then try again.');
        // The composer is React-controlled: set the value the way typing does,
        // so its own onChange takes it.
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, prompt);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (!input.isConnected || input.value !== prompt) return no('failed', 'The prompt could not be placed in the Learn chat.');
        input.focus(); input.setSelectionRange(prompt.length, prompt.length);
        return { id, kind, status: 'prefilled' };
      }
      if (!await until(() => canvasApi.current, 10000)) return no('failed', 'The Learn canvas did not open. Open Learn and try again.');
      let results;
      try {
        // The Search bar's own lookup, so a link or id resolves exactly and a
        // title finds what Search would put first.
        const response = await fetch(`/api/learn/search?app=${encodeURIComponent(latest.app)}&source=${from}&q=${encodeURIComponent(ref)}`, { headers: wsHeaders() });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || 'Search failed. Try again.');
        results = data.results || [];
      } catch (problem) { return no('failed', problem.message); }
      if (!results[0]?.item) return no('rejected', `Nothing on ${request.source.kind} matched ${ref}.`);
      const blockId = handoff.current.latest.pickResult(from, results[0].item);
      const card = blockId && await until(() => window.document.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`), 5000);
      return card ? { id, kind, status: 'added', resourceId: blockId } : no('failed', 'The card did not appear on the canvas.');
    };
    const take = async request => {
      const id = typeof request?.id === 'string' ? request.id : '';
      if (!id || handoff.current.busy.has(id)) return; // no id, nothing to answer; in flight, it will answer once
      let done = null;
      try { done = JSON.parse(sessionStorage.getItem(`small.learn.result:${id}`) || 'null'); } catch { /* treat as new */ }
      if (done) { window.dispatchEvent(new CustomEvent('small:learn-result', { detail: done })); return; }
      const kind = request.kind === 'teach' || request.kind === 'research' ? request.kind : null;
      if (!kind) { settle({ id, kind: request.kind, status: 'rejected', reason: 'Unknown request kind. Use teach or research.' }); return; }
      handoff.current.busy.add(id);
      try { settle(await run(id, kind, request)); }
      catch (problem) { settle({ id, kind, status: 'failed', reason: problem.message }); }
      finally { handoff.current.busy.delete(id); }
    };
    const onRequest = event => take(event.detail);
    window.addEventListener('small:learn-request', onRequest);
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('small.learn.request') || 'null'); sessionStorage.removeItem('small.learn.request'); } catch { /* blocked storage: the live event still works */ }
    if (pending) take(pending);
    return () => window.removeEventListener('small:learn-request', onRequest);
  }, []);
  // The canvas's own name, editable in the strip. Local like the ink: a board
  // and the main canvas each keep theirs; empty falls back to the course title.
  const titleKey = `${canvasKey}${board ? `:${board}` : ''}:title`;
  const [canvasTitle, setCanvasTitle] = useState(() => { try { return localStorage.getItem(titleKey) || ''; } catch { return ''; } });
  // The copy confirmation lives on the button itself - a toast in the far
  // corner reads as unrelated to the press that caused it.
  // The header names what is actually open: a canvas by its own title, a
  // project by its repository unless one of its course lessons is running,
  // and never the sample course on a canvas or project route.
  const fallbackTitle = isCanvas ? app.title || 'Untitled canvas'
    : isRepository ? (nanoActive || lesson.current?.lessonId?.startsWith('course-') ? courseTitle : app.repo || app.name)
    : courseTitle || app.repo || app.name;
  // Never the canvas id: its title, or plain words when there is none.
  const askPlaceholder = isCanvas ? ((canvasTitle || app.title) ? `Ask about ${canvasTitle || app.title}…` : 'Ask about this canvas…') : `Ask about ${app.repo || app.name}…`;
  const [titleDraft, setTitleDraft] = useState(null); // non-null only while the title is focused
  // Renaming a canvas from the top bar saves it on the server through the Rabbit Hole map's rename
  // (Dive.jsx), so the map, Home, Library and the placeholder follow; that rename calls saveTitle back.
  const renameTitle = value => {
    const here = isCanvas ? dive.navigator.tree?.path?.at(-1) : null;
    if (value && here?.app === app.name && value !== (canvasTitle || fallbackTitle) && value !== here.title) { dive.navigator.rename(here, value); return; }
    saveTitle(value === fallbackTitle ? '' : value);
  };
  // A name given before renames reached the server lived only in this browser: send it once.
  const syncedTitle = useRef(null); // the canvas already checked
  useEffect(() => {
    const here = isCanvas ? dive.navigator.tree?.path?.at(-1) : null;
    if (syncedTitle.current === app.name || !here || here.app !== app.name || here.pending) return;
    syncedTitle.current = app.name;
    if (canvasTitle && canvasTitle !== here.title) dive.navigator.rename(here, canvasTitle);
  }, [dive.navigator.tree]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveTitle = value => {
    const clean = value.trim().slice(0, 120);
    setCanvasTitle(clean);
    try { clean ? localStorage.setItem(titleKey, clean) : localStorage.removeItem(titleKey); } catch { /* a full store loses the name only */ }
  };
  // Which card a source row stands for. Papers from arXiv open in the reader
  // rather than as a card, and the repository is not a card at all.
  const cardOf = source => {
    if (['wiki', 'video', 'image'].includes(source.kind)) return source.id.slice(source.id.indexOf(':') + 1);
    if (source.kind === 'pdf') return (canvasState.cards || []).find(([, assetKey]) => assetKey === `pdf:${source.id}`)?.[0] || null;
    if (source.kind === 'paper') return (canvasState.cards || []).find(([, , paperId]) => paperId === source.id.slice('paper:'.length))?.[0] || null;
    return null;
  };
  // A row whose card was deleted is gone from the list; the stored flag stays,
  // harmless, in case undo brings the card back.
  const listedSources = sources.filter(source => !['wiki', 'video', 'image', 'pdf'].includes(source.kind) || !canvasState.cards
    || canvasState.cards.some(([id]) => id === cardOf(source))).map(source => ({
    ...source,
    locatable: !!cardOf(source) || source.kind === 'paper',
    removable: source.kind !== 'repository',
  }));
  const locateSource = source => {
    const blockId = cardOf(source);
    if (blockId) { canvas()?.focusBlock(blockId); return; }
    // A paper read before papers became cards has only the reader.
    if (source.kind === 'paper') openPaper({ id: source.id.slice('paper:'.length), title: source.label, pdfUrl: `https://arxiv.org/pdf/${source.id.slice('paper:'.length)}` });
  };
  // Removing is removing: the card leaves the canvas, the row leaves the list,
  // and whatever context pointed at it stops riding the next question.
  const removeSource = source => {
    const blockId = cardOf(source);
    if (blockId) canvas()?.removeBlock(blockId);
    setSources(previous => previous.filter(entry => entry.id !== source.id));
    if (wikiContext?.blockId && wikiContext.blockId === blockId) { setWikiContext(null); setWikiOpen(false); }
    if (videoContext?.blockId && videoContext.blockId === blockId) setVideoContext(null);
    if (imageContext?.blockId && imageContext.blockId === blockId) setImageContext(null);
    const paperId = source.kind === 'paper' ? source.id.slice('paper:'.length) : source.kind === 'pdf' ? source.id : null;
    if (paperId && paperContext?.id === paperId) { setPaperContext(null); setPaperOpen(false); }
  };
  const canvasMenus = [
    {
      title: 'Files',
      panel: close => <FilesPanel app={app.name} sources={listedSources} close={close}
        onToggle={id => setSources(previous => toggleSource(previous, id))}
        onLocate={locateSource} onRemove={removeSource} />,
    },
    {
      title: 'Insert',
      items: [
        { label: 'Section', icon: Heading1, size: 19, weight: 650, onSelect: () => canvas()?.insertHeading(1) },
        { label: 'Sub-section', icon: Heading2, size: 16, weight: 600, onSelect: () => canvas()?.insertHeading(2) },
        { label: 'Sub-sub-section', icon: Heading3, size: 14, weight: 550, onSelect: () => canvas()?.insertHeading(3) },
        { divider: true },
        { label: 'Text box', icon: Type, onSelect: () => canvas()?.insertText() },
        { label: 'Sticky note', icon: StickyNote, onSelect: () => canvas()?.insertSticky() },
        { label: 'Divider line', icon: SeparatorHorizontal, onSelect: () => canvas()?.insertDivider() },
        { divider: true },
        { label: 'Notebook', icon: NotebookPen, onSelect: () => canvas()?.insertNotebook() },
        // The one way to add a file besides dropping it on the canvas.
        { label: 'Upload a file', icon: Upload, onSelect: () => filePicker.current?.click() },
      ],
    },
    {
      title: 'Edit',
      items: [
        { label: 'Undo', icon: Undo2, hint: 'Ctrl Z', onSelect: () => canvas()?.undo() },
        { label: 'Redo', icon: Redo2, hint: 'Ctrl Y', onSelect: () => canvas()?.redo() },
        { divider: true },
        { label: 'Copy', icon: Copy, hint: 'Ctrl C', disabled: !canvasState.selected, onSelect: () => canvas()?.copy() },
        { label: 'Paste', icon: ClipboardPaste, hint: 'Ctrl V', disabled: !canvasState.canPaste, onSelect: () => canvas()?.paste() },
        { label: 'Duplicate', icon: CopyPlus, hint: 'Ctrl D', disabled: !canvasState.selected, onSelect: () => canvas()?.duplicate() },
        { divider: true },
        { label: 'Group', icon: Group, hint: 'Ctrl G', disabled: canvasState.selected < 2, onSelect: () => canvas()?.group() },
        { label: 'Ungroup', icon: Ungroup, hint: 'Ctrl Shift G', disabled: !canvasState.grouped, onSelect: () => canvas()?.ungroup() },
        { divider: true },
        { label: 'Select all', icon: BoxSelect, hint: 'Ctrl A', onSelect: () => canvas()?.selectAll() },
        { label: 'Delete selection', icon: Trash2, hint: 'Del', disabled: !canvasState.selected, onSelect: () => canvas()?.deleteSelection() },
      ],
    },
    {
      // Lines up what is selected; a group counts as one piece.
      title: 'Arrange',
      items: [
        { label: 'Align left', icon: AlignStartVertical, disabled: canvasState.units < 2, onSelect: () => canvas()?.arrange('left') },
        { label: 'Align center', icon: AlignCenterVertical, disabled: canvasState.units < 2, onSelect: () => canvas()?.arrange('center') },
        { label: 'Align right', icon: AlignEndVertical, disabled: canvasState.units < 2, onSelect: () => canvas()?.arrange('right') },
        { divider: true },
        { label: 'Align top', icon: AlignStartHorizontal, disabled: canvasState.units < 2, onSelect: () => canvas()?.arrange('top') },
        { label: 'Align middle', icon: AlignCenterHorizontal, disabled: canvasState.units < 2, onSelect: () => canvas()?.arrange('middle') },
        { label: 'Align bottom', icon: AlignEndHorizontal, disabled: canvasState.units < 2, onSelect: () => canvas()?.arrange('bottom') },
        { divider: true },
        { label: 'Distribute horizontally', icon: AlignHorizontalSpaceBetween, disabled: canvasState.units < 3, onSelect: () => canvas()?.arrange('spread-x') },
        { label: 'Distribute vertically', icon: AlignVerticalSpaceBetween, disabled: canvasState.units < 3, onSelect: () => canvas()?.arrange('spread-y') },
      ],
    },
    {
      title: 'View',
      items: [
        { label: 'Zoom in', icon: ZoomIn, hint: 'Ctrl +', onSelect: () => canvas()?.zoomIn() },
        { label: 'Zoom out', icon: ZoomOut, hint: 'Ctrl -', onSelect: () => canvas()?.zoomOut() },
        { label: 'Zoom to 100%', icon: RotateCcw, hint: 'Shift 0', onSelect: () => canvas()?.zoomReset() },
        { label: 'Zoom to fit', icon: Maximize2, hint: 'Shift 1', onSelect: () => canvas()?.zoomFit() },
        { divider: true },
        { label: 'Minimap', icon: MapIcon, checked: canvasState.minimap, onSelect: () => canvas()?.toggleMinimap() },
        { label: 'Snap to grid', icon: Grid3x3, checked: canvasState.grid, onSelect: () => canvas()?.toggleGrid() },
        { label: 'Page guides (A4)', icon: FileText, checked: canvasState.pages, onSelect: () => canvas()?.togglePages() },
        { label: 'Keep tool active', icon: Lock, checked: canvasState.lock, onSelect: () => canvas()?.toggleLock() },
        { divider: true },
        { label: 'Keyboard shortcuts', icon: Keyboard, hint: '?', onSelect: () => setShortcutsOpen(true) },
        { label: 'Slash commands', icon: SquareSlash, onSelect: () => setSlashHelpOpen(true) },
      ],
    },
  ];
  const canvasOutline = canvasState.outline || [];
  const outlineDisabled = !editor || answering || !!noteEditing;
  const coursePanel = <CoursePanel planningOnly={suppliedCourse} state={course} app={app} onPreview={previewLesson} onDeleted={() => {
          if (lesson.current?.lessonId?.startsWith('course-')) {
            playback.current?.dispose(); playback.current = null;
            lesson.current = null; setProgress(null); setNarration('');
            pinned.current = null; removeImage();
          }
          if (editor) editor.deleteShapes(editor.getPages().flatMap(p => [...editor.getPageShapeIds(p.id)]).filter(id => {
            const meta = editor.getShape(id)?.meta;
            return meta?.author === 'script' && meta.learnLesson?.startsWith('course-');
          }));
        }} />;
  return <main className="relative flex min-w-0 flex-1 overflow-hidden max-lg:flex-col max-lg:overflow-y-auto">
    {/* Below lg the panel stacks under the lesson and the page scrolls: the
        lesson canvas keeps a real working height (see below) instead of being
        squeezed into what the panel leaves. */}
    <section aria-label="Learn" className={`min-h-0 min-w-0 flex-1 ${!courseView && learningView === 'lesson' ? 'max-lg:flex-none' : ''}`}>
      {/* The lesson canvas goes full-bleed so its toolbar and zoom controls sit
          at the window edges; every other view keeps the centered page frame. */}
      <div className={`expanded-page-frame mx-auto flex h-full w-full min-h-0 flex-col ${!courseView && learningView === 'lesson' ? '' : 'max-w-[900px] px-6 py-6'}`}>
        {pdfChoice && <ConfirmDialog title="Add this PDF as" body={`Add ${pdfChoice.name} as one PDF, or as slides with a divider between every page.`} altLabel="PDF" onAlt={() => pdfChoice.resolve('pdf')} confirmLabel="Slides" confirmVariant="primary" onConfirm={() => pdfChoice.resolve('slides')} onCancel={() => pdfChoice.resolve(null)} />}
        {pendingNoteView && <ConfirmDialog title="Save notes before switching?" body="Save your changes and open the selected view, or cancel to keep editing." confirmLabel="Save notes" confirmVariant="primary" onCancel={() => setPendingNoteView(null)} onConfirm={async () => { if (await noteSave.current?.()) leaveNote(pendingNoteView); }} />}
        {/* One centered strip is all the chrome the canvas gets: an editable
            title, the menubar, and the three one-press actions. No page
            heading, no rule underneath - the canvas has no boundary. */}
        {/* On a phone the row wraps (menubar compact) instead of clipping its
            start; not a scroller, which would clip the menus' dropdowns. */}
        {!canvasState.presenting && <div className="relative flex shrink-0 items-center justify-center gap-1 px-3 pt-3 pb-1 max-md:flex-wrap max-md:gap-y-0.5 max-md:px-2 max-md:pt-2">
          {/* The page's top-left corner is Home (owner 2026-09-30): the Home page from any Rabbit Hole, at any depth; the
              navigator climbs holes. Learn has no sidebar button; recentring is Shift 0 and the minimap. */}
          <button type="button" data-learn-home aria-label="Home" title="Home"
            onClick={() => navigate('/apps')}
            className="absolute top-3 left-3 flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-white text-ink-2 shadow-md hover:text-ink max-md:hidden"><House size={15} strokeWidth={1.7} /></button>
          <input aria-label="Canvas title" title="Rename this canvas"
            // The name on screen is always the value - editing edits IT, via a
            // focus-scoped draft so the fallback never fights the keystrokes.
            // Saving the fallback verbatim stores nothing, so an untouched
            // name keeps tracking the course title.
            value={titleDraft ?? (canvasTitle || fallbackTitle)}
            onChange={event => setTitleDraft(event.target.value)}
            onBlur={event => { const value = event.target.value.trim().slice(0, 120); setTitleDraft(null); renameTitle(value); }}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            onFocus={event => {
              setTitleDraft(canvasTitle || fallbackTitle);
              const node = event.currentTarget;
              // Only rescue a caret parked at the very start - the complaint.
              // A deliberate placement (or a select-all) is left alone.
              requestAnimationFrame(() => {
                if (document.activeElement === node && node.selectionStart === 0 && node.selectionEnd === 0) node.setSelectionRange(node.value.length, node.value.length);
              });
            }}
            className="h-8 min-w-16 max-w-96 shrink cursor-text truncate rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold text-ink outline-none [field-sizing:content] placeholder:text-ink-2 hover:border-line focus:border-line" />
          <CanvasMenubar menus={canvasMenus} />
          {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}
          {slashHelpOpen && <Suspense fallback={null}><SlashCommandsSheet appName={app.name} onClose={() => setSlashHelpOpen(false)} /></Suspense>}
          {searchOpen && <SearchBar app={app.name} initialSource={searchSeed?.source} initialQuery={searchSeed?.query} onClose={() => { setSearchOpen(false); setSearchSeed(null); }}
            onPick={pickResult} />}
          <div className="flex items-center gap-0.5">
            {/* One search bar for YouTube, arXiv and Wikipedia, beside Present. */}
            <button type="button" title="Search YouTube, arXiv and Wikipedia (/)" aria-label="Search YouTube, arXiv and Wikipedia"
              onClick={() => setSearchOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"><Search size={15} strokeWidth={1.8} /></button>
            <button type="button" title="Present" aria-label="Present"
              onClick={() => { if (canvasApi.current?.present()) setPanelOpen(false); }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"><Play size={15} strokeWidth={1.8} /></button>
            <span className="relative">
              <button type="button" data-share-button title={sharing?.unavailable || (sharing?.shared ? 'Shared - manage links' : 'Share this board')} aria-label="Share" aria-expanded={shareOpen}
                disabled={!!sharing?.unavailable} onClick={() => setShareOpen(open => !open)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-40 ${sharing?.shared ? 'text-[#2383e2]' : 'text-ink-2'} ${shareOpen ? 'bg-hover' : 'hover:bg-hover hover:text-ink'}`}>
                <Share2 size={15} strokeWidth={1.8} /></button>
              {shareOpen && <SharePanel sharing={sharing} busy={shareBusy} error={shareError} onChange={changeSharing} onClose={() => setShareOpen(false)} />}
            </span>
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
        {learnerOpen && !suppliedCourse && <LearnOutline allowSample={!isRepository && !isCanvas} onToggleComplete={toggleSection} completed={completed} state={course} sample={sampleOutline} onSampleChange={setSampleOutline} activeId={lesson.current?.lessonId} activePage={progress?.page} disabled={outlineDisabled} onOpen={openFromOutline} />}
        <div className={`${courseView || learningView !== 'lesson' ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col pr-1`}>
        {!canvasState.presenting && ((!isRepository && !isCanvas) || progress) && <div aria-label="Current lesson and section" className="mb-4"><h2 className="text-lg font-semibold">Lesson {sampleIndex >= 0 ? sampleIndex + 1 : 1}: {currentLesson?.title}</h2><p className="mt-1 text-sm text-ink-2">Section {(progress?.page || 0) + 1} of {pages.length}: {progress?.label || pages[0].label}</p></div>}
        {graphError && <p role="alert" className="text-sm text-red-700">{graphError}</p>}
        {/* The adaptive canvas: a plain React whiteboard where chat exchanges
            land as movable blocks. Lesson playback stays parked. */}
        {board && !BOARDS[board] && <div className="border-b border-line bg-hover px-4 py-2 text-sm text-ink-2">No review board is registered as <span className="font-medium text-ink">{board}</span> - this is an empty scratch board. Registered boards live in BOARDS in demo-scenes.js.</div>}
        <div ref={canvasFrame} aria-label="Lesson canvas" onPointerDownCapture={openPaperReference} onClickCapture={openPaperReference} className="relative min-h-0 flex-1 max-lg:h-[var(--phone-canvas-h,75dvh)] max-lg:flex-none" style={phoneCanvasHeight ? { "--phone-canvas-h": `${phoneCanvasHeight}px` } : undefined}><Suspense fallback={null}><DivePortals.Provider value={dive.portals}><AdaptiveCanvas key={canvasEpoch} gutterTop={dive.tree ? <DiveNavigator {...dive.navigator} /> : null} onSave={pushBoard} bottomLeft={<FeedbackButton app={app.name} board={board} />} onSearch={source => { setSearchSeed({ source }); setSearchOpen(true); }} exchanges={exchanges} onMove={moveExchange} onDelete={deleteExchange} onRestore={setExchanges} onAskTarget={setAskTarget} askTargetId={askTarget?.id ?? null} onOpenFile={openCanvasFile} onAdd={copies => setExchanges(previous => [...previous, ...copies])} onGrade={gradeCanvasAnswer} onResize={resizeExchange} onReply={replyToExchange} appName={app.name} apiRef={canvasApi} onWiki={trackWiki} onWatch={watchVideo} onDropFiles={takeDrop} onPaper={trackPaper} onCardAction={cardAction} attachedIds={sources.filter(source => source.attached).map(source => source.id)} onGroupShot={takeGroupShot} onAreaShot={takeAreaShot} onState={onCanvasState} edgeInset={!panelOpen && canvasOutline.length ? 52 : 0} storageKey={boardStorageKey} seedBlocks={board ? (BOARDS[board]?.() ?? []) : null} renderBlockComposer={(app.hosting !== 'aws' || app.app_chat) ? (exchange, onExchange, target) => <AskPanel compact composerOnly canvasSeed={{ question: exchange.question, answer: exchange.answer, target }} onExchange={onExchange} scope={askScope} appName={app.name} chatConfig={app.app_chat} repositoryContext={!repoAttached ? null : nanoActive ? { commit: nanoSourceVersion } : repositoryContext} conversation="learn" placeholder="Follow up in this block..." autoFocus /> : null} composer={(app.hosting !== 'aws' || app.app_chat) ? <div data-learn-dock className="contents"><AskPanel compact composerOnly dock sheet onAddToCanvas={chat => canvas()?.insertChat(chat)} boardContext={boardContext} onExchange={placeExchange} slash={learnSlash} tutor={tutor.active ? tutor : null} canvasTarget={askTarget} onClearCanvasTarget={clearAskTarget} key={`dock:${app.name}`} scope={askScope} appName={app.name} chatConfig={app.app_chat} repositoryContext={!repoAttached ? null : nanoActive ? { commit: nanoSourceVersion } : isRepository && lesson.current?.lessonId?.startsWith('course-') ? { commit: course.course?.sourceVersion } : repositoryContext} conversation="learn" placeholder={askPlaceholder} autoFocus /></div> : null} /></DivePortals.Provider></Suspense>{dive.emptyHint}{dive.suggestionCard && !tutor.active && <div className="pointer-events-none absolute inset-x-0 bottom-28 z-30 flex justify-center px-4"><div className="pointer-events-auto">{dive.suggestionCard}</div></div>}{dive.confirmDialog}</div>
        {/* ponytail: playback bar and timeline parked while the lesson-2 canvas is redesigned */}
        {false && <div aria-label="Lesson playback" className={`${courseView || (isRepository && !progress) ? 'hidden' : 'flex'} shrink-0 flex-wrap items-center justify-between gap-3 pt-3`}>
          <div className="flex items-center gap-1">
            <button type="button" disabled={!progress || progress.page === 0 || answering} onClick={() => navigateLesson('back')} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-ink-2 hover:bg-hover disabled:opacity-40"><ChevronLeft size={14} />Previous lesson</button>
            <button type="button" disabled={!editor || (progress?.page === pages.length - 1 && progress.pageComplete) || answering} onClick={() => { if (!progress) startDemo.current?.(); else progress.playing ? pauseLesson() : playback.current?.play(); }} className="flex min-w-20 items-center justify-center gap-1.5 rounded border border-line px-3 py-1.5 text-xs hover:bg-hover disabled:opacity-40">{progress?.playing ? <Pause size={14} /> : <Play size={14} />}{progress?.playing ? 'Pause' : 'Play'}</button>
            <button type="button" aria-label={`Playback speed ${lessonSpeed}x`} title="Playback speed" onClick={() => { const next = SPEEDS[(SPEEDS.indexOf(lessonSpeed) + 1) % SPEEDS.length]; setSpeed(next); setLessonSpeed(next); }} className="flex min-w-12 items-center justify-center rounded border border-line px-2 py-1.5 text-xs tabular-nums hover:bg-hover">{lessonSpeed}×</button>
            <button type="button" disabled={!progress || (progress.page === pages.length - 1 && progress.pageComplete) || answering} onClick={() => navigateLesson('next')} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-ink-2 hover:bg-hover disabled:opacity-40">Next lesson<ChevronRight size={14} /></button>
          </div>
          <span aria-live="polite" className="text-xs text-ink-2">{progress ? `Page ${progress.page + 1} of ${pages.length} · ${progress.label}` : 'Logistic regression · 3 pages'}</span>
        </div>}
        {false && <div className={`${courseView || (isRepository && !progress) ? 'hidden' : ''} shrink-0 pt-2 pb-1`}>
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
      {/* The table of contents IS the lesson's structure, not a view onto another
          document: its sections are the canvas headings, and the learner and the agent
          both author them. Dragging a section carries its cards and sub-sections. */}
      <div data-toc className="mb-3 flex max-h-[45%] shrink-0 flex-col overflow-y-auto">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h2 className="text-base font-semibold text-ink">Table of contents</h2>
          <div className="flex items-center gap-0.5 text-ink-2">
            <Plus size={15} aria-hidden className="mr-0.5 text-ink-3" />
            {SECTION_LEVELS.map(([level, label, Icon]) => (
              <button key={level} type="button" onClick={() => setTocAdding(level)} aria-label={`Add a ${label.toLowerCase()}`} title={`Add a ${label.toLowerCase()}`}
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-hover hover:text-ink"><Icon size={17} /></button>
            ))}
          </div>
        </div>
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
        <ol className="space-y-1" onDragEnd={() => { setTocDrag(null); setTocDrop(undefined); }}>
          {canvasOutline.map((entry, index) => (
            <li key={entry.id} draggable={tocEditing !== entry.id} style={{ paddingLeft: (entry.level - 1) * 16 }}
              onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.id); setTocDrag(entry.id); }}
              onDragOver={event => {
                if (!tocDrag) return;
                event.preventDefault();
                const box = event.currentTarget.getBoundingClientRect();
                setTocDrop(event.clientY < box.top + box.height / 2 ? entry.id : canvasOutline[index + 1]?.id ?? null);
              }}
              onDrop={event => { event.preventDefault(); if (tocDrag && tocDrop !== undefined) canvasApi.current?.moveSection(tocDrag, tocDrop); setTocDrag(null); setTocDrop(undefined); }}
              className={`group flex items-start gap-2 border-y-2 border-transparent ${tocDrag === entry.id ? 'opacity-40' : ''} ${tocDrag && tocDrop === entry.id ? 'border-t-accent' : ''} ${tocDrag && tocDrop === null && index === canvasOutline.length - 1 ? 'border-b-accent' : ''}`}>
              <GripVertical size={16} aria-hidden className="mt-1 -mr-1 shrink-0 cursor-grab text-ink-3 opacity-0 group-hover:opacity-100" />
              <input type="checkbox" checked={entry.done} aria-label={`${entry.label} done`}
                onChange={() => canvasApi.current?.toggleSectionDone(entry.id)}
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-green-600" />
              {tocEditing === entry.id ? (
                <input autoFocus defaultValue={entry.label} aria-label={`Rename ${entry.label}`} onFocus={event => event.currentTarget.select()}
                  onKeyDown={event => {
                    if (event.key === 'Escape') { event.currentTarget.dataset.cancel = '1'; event.currentTarget.blur(); }
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                  onBlur={event => {
                    const text = event.currentTarget.value.trim();
                    if (!event.currentTarget.dataset.cancel && text && text !== entry.label) canvasApi.current?.applyOutline([{ op: 'retitle', id: entry.id, text }]);
                    setTocEditing(null);
                  }}
                  className="h-7 min-w-0 flex-1 rounded border border-line px-1.5 text-base outline-none focus:border-ink-3" />
              ) : (
                <button type="button" title="Double-click to rename" onClick={() => { setPanelOpen(true); canvasApi.current?.showSection(entry.id); }} onDoubleClick={() => setTocEditing(entry.id)}
                  className={`flex-1 rounded text-left hover:text-accent ${entry.level === 1 ? 'text-base font-medium' : 'text-[15px] text-ink-2'} ${entry.done ? 'line-through decoration-ink-3' : ''}`}>
                  {entry.label}
                </button>
              )}
              {/* Deletes the heading only; the cards under it stay, and Ctrl+Z brings it back. */}
              <button type="button" aria-label={`Delete ${entry.label}`} title="Delete section" onClick={() => canvasApi.current?.removeBlock(entry.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-red-700 focus-visible:opacity-100 max-md:opacity-100"><Trash2 size={15} /></button>
            </li>
          ))}
          {tocAdding && (
            <li style={{ paddingLeft: (tocAdding - 1) * 16 + 18 }} className="flex items-center gap-2">
              <input autoFocus aria-label={`New ${SECTION_LEVELS[tocAdding - 1][1].toLowerCase()} title`} placeholder={`${SECTION_LEVELS[tocAdding - 1][1]} title`}
                onKeyDown={event => {
                  if (event.key === 'Escape') setTocAdding(null);
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                onBlur={event => {
                  const text = event.currentTarget.value.trim();
                  if (text) canvasApi.current?.applyOutline([{ op: 'add', level: tocAdding, text, after: null }]);
                  setTocAdding(null);
                }}
                className="h-8 min-w-0 flex-1 rounded border border-line px-2 text-base outline-none focus:border-ink-3" />
            </li>
          )}
        </ol>
      </div>
      {setupChat && <CourseInterview state={course} app={app} sectionEditor={suppliedCourse ? sectionEditor : null} />}
      <div className={`${setupChat ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col`}>
      {narration && !paperOpen && !wikiOpen && !sourceOpen && !lessonSource && !learnerOpen && <details className="mb-3 max-h-40 overflow-auto rounded border border-line p-3 text-sm" open><summary className="cursor-pointer text-xs font-medium">Current page explanation</summary><p className="mt-2 whitespace-pre-wrap text-ink-2">{narration}</p></details>}
      {app.hosting === 'aws' && !app.app_chat
        ? <p className="text-sm text-ink-2">Coaching is not connected for AWS jobs yet. Your job data stays in your AWS account.</p>
        : !courseView && learningView === 'lesson'
        // lesson view: chat is docked under the canvas - the panel only displays papers and source
        ? (lessonSource ? <RepositorySource appName={app.name} {...lessonSource} onClose={() => setLessonSource(null)} /> : wikiOpen && wikiContext ? <LearnWiki app={app.name} article={wikiContext} openAt={wikiOpenAt} onNavigate={next => setWikiContext(previous => ({ ...previous, ...next, selection: null }))} onSection={section => setWikiContext(previous => (previous?.section === section ? previous : { ...previous, section }))} onSelect={text => setWikiContext(previous => ({ ...previous, selection: text }))} onClose={() => setWikiOpen(false)} /> : paperOpen && paperContext ? <LearnPaper app={app.name} paper={paperContext} onPage={page => setPaperContext(previous => ({ ...previous, page, selection: undefined }))} onSelect={selection => { removeImage(); pinned.current = null; setPaperContext(previous => ({ ...previous, selection })); }} onClose={() => setPaperOpen(false)} /> : sourceOpen ? <LessonSource onClose={() => setSourceOpen(false)} /> : null)
        : <AskPanel onGraph={onGraph} key={app.name} scope={askScope} appName={app.name} chatConfig={app.app_chat} repositoryContext={!repoAttached ? null : nanoActive ? { commit: nanoSourceVersion } : isRepository && lesson.current?.lessonId?.startsWith('course-') ? { commit: course.course?.sourceVersion } : repositoryContext} conversation="learn" headerTitle="Learn Agent" boardContext={boardContext} contentPanel={lessonSource ? <RepositorySource appName={app.name} {...lessonSource} onClose={() => setLessonSource(null)} /> : wikiOpen && wikiContext ? <LearnWiki app={app.name} article={wikiContext} openAt={wikiOpenAt} onNavigate={next => setWikiContext(previous => ({ ...previous, ...next, selection: null }))} onSection={section => setWikiContext(previous => (previous?.section === section ? previous : { ...previous, section }))} onSelect={text => setWikiContext(previous => ({ ...previous, selection: text }))} onClose={() => setWikiOpen(false)} /> : paperOpen && paperContext ? <LearnPaper app={app.name} paper={paperContext} onPage={page => setPaperContext(previous => ({ ...previous, page, selection: undefined }))} onSelect={selection => { removeImage(); pinned.current = null; setPaperContext(previous => ({ ...previous, selection })); }} onClose={() => setPaperOpen(false)} /> : sourceOpen ? <LessonSource onClose={() => setSourceOpen(false)} /> : null} onCloseContentPanel={() => { setPaperOpen(false); setWikiOpen(false); setSourceOpen(false); setLessonSource(null); }} placeholder={askPlaceholder} autoFocus />}
      </div>
    </ResizableSidePanel>
    <input ref={filePicker} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.pdf" className="hidden"
      onChange={event => { takeDrop([...(event.target.files || [])]); event.target.value = ''; }} />
    {/* With sections on the canvas the rail mirrors the panel's table of
        contents - hover opens it, a click frames that section, and the panel
        stays closed. A canvas with no sections shows no rail (user, 2026-09-29). */}
    {!panelOpen && <ContentsRail entries={canvasOutline.map((entry, index) => ({ n: index + 1, label: entry.label, available: true, active: false, section: entry.id }))}
      onOpen={entry => { if (entry.section) { canvasApi.current?.showSection(entry.section); return; } setPanelOpen(false); openFromOutline(entry.content, 'lesson', 0); }} />}
  </main>;
}
