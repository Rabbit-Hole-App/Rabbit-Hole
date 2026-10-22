import {createInlineCodeClient,inlineCodeTicketKey} from './inline-code-client.js';
import {readRegionalOriginal,regionalMaskBlob} from './inline-regional-mask.js';
import { createBackgroundRemovalController, createRegionalImageEditController } from './inline-background-removal.js';
import { createImageJobClient } from './inline-image-job-client.js';
import { cadClient, submitCadOnce } from './cad-client.js';
import { EXPLAIN_JOB_EVENT, explainClient, explainDisabled, explainEditing, explainEditProblem, explainEditRequest, explainPendingBlock } from './explain-client.js';
import { withCardSink } from './chat-output-refs.js';
import { withPrompt } from './card-prompt.js';
import { cloneElement, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, House, Upload, Type, PanelRightClose, PanelRightOpen, Pause, Play, Share2, NotebookPen } from 'lucide-react';
import { SPEEDS, getSpeed, setSpeed } from './learn-audio.js';
import { api, apiFetch, goBack, navigate, wsHeaders } from './api.js';
import { canEditCourse, learnPreview, reviewTools } from './flags.js';
import { AskPanel, NextStepsCard } from './ask.jsx';
import { Button, IconBtn, ConfirmDialog, toast } from './ui.jsx';
import SharePanel from './SharePanel.jsx';
import { ChooseHandle } from './HandleGate.jsx';
import { assetKeysOf, requestWorkspaceExports, setRemoteAssets, setWorkspaceStore } from './learn-board-assets.js';
import { setFileScope, fileScope, uploadSource } from './file-source-client.js';
import {verifySourceReadings} from './inline-source-readings.js';
import { verifyExtractionRead } from './inline-extraction.js';
import { prepareImageRevision } from './inline-image-revision.js';
import { fileChatRef } from './file-chat-ref.js';
import { fileContextManifest } from './file-context-manifest.js';
import { captureSelection, selectionSnapshot } from './sigmoid-context.js';
import { CourseInterview, CoursePanel, useLearnCourse } from './LearnCourse.jsx';
import { LessonNotebook, LessonPractice, LessonReading } from './LearnExtras.jsx';
import LearnOutline from './LearnOutline.jsx';
import ContentsRail, { canvasEmpty } from './ContentsRail.jsx';
import CanvasMenubar from './CanvasMenubar.jsx';
import { canvasEditMenus, localInsertItems } from './canvas-menus.js';
import SearchBar from './SearchBar.jsx';
import LearnSlash from './LearnSlash.jsx';
import FeedbackButton from './FeedbackButton.jsx';
import TableOfContents from './TableOfContents.jsx';
import UsageGauge from './UsageGauge.jsx';
import { available, isLearnCommand, runLearnCommand } from './learn-slash.js';
import { generationField, madeFrom } from './generation-proposal-chat.js';
import { commandsFor, labelOf } from './agent/slash.js';
import { openSourceFinder, returnFocus, setSourceFinderHost, slashOpensFind } from './source-finder.js';
import { httpTransport } from './inline-ai-transport.js';
import { EXPLICIT_ROUTES, ROUTES as INLINE_ROUTES } from './inline-ai-route.js';
import { warmLearnTools } from './learn-warmup.js';
import ShortcutsSheet from './ShortcutsSheet.jsx';
// Lazy: it draws real cards, so it brings the card components with it.
const SlashCommandsSheet = lazyFeature(() => import('./SlashCommandsSheet.jsx'), 'The slash commands');
import FilesPanel from './FilesPanel.jsx';
import FileImportDialog from './FileImportDialog.jsx';
import { useDocImport } from './DocImport.jsx';
import PdfAddDialog from './PdfAddDialog.jsx';
import { pdfBytesUrl, pdfKeyOfRef } from './pdf-source.js';
import { checkImport, codeBlock, importBlock, importKind, pasteBlock, pasteName } from './learn-file-import.js';
import { insertCodeCard } from './code-card.js';
import { copiedCode, languageOf } from './map-files.js';
import { withSource, withRetainedSource, toggleSource, isAttached } from './learn-sources.js';
import LessonPlanPreview from './LessonPlanPreview.jsx';
import NanoLessonReading, { useNanoProgress } from './NanoLessonReading.jsx';
import { nanoLesson, nanoSourceVersion } from './nanogpt-lesson.js';
import ResizableSidePanel from './ResizableSidePanel.jsx';
import { RepositoryBadge } from './repository-canvas.jsx';
import { clearSelection } from './repo-context.js';
import { releaseCodeRef } from './graph-card.js';
import { sameRef } from './chat-context.js';
import PanelHeader, { CanvasSearchPanel, COMPANION_VIEWS, CompanionHeader } from './PanelHeader.jsx';
import ChatPane from './ChatPane.jsx';
import { useCanvasSearch } from './use-canvas-search.jsx';
import { SearchContentProvider } from './canvas-search-content.jsx';
import { sourceTarget } from './card-sources.js';
import TocConversation from './TocConversation.jsx';
import { outlinePlan, planRevisionOf } from './learn-outline-model.js';
import SourcesPane from './SourcesPane.jsx';
import CanvasRefPicker from './CanvasRefPicker.jsx';
import { useCanvasLinks } from './LinksPanel.jsx';
import { newNotebookBlock } from './learn-notebook.js';
import { ChatWorkspaceProvider, TocWorkspace, useChatWorkspace } from './chat-workspace.jsx';
import { effectiveControls } from './learn-coaching-client.js';
import { canCoach, mayRun } from './learn-coaching-contract.js';
import { canvasContextNow } from './chat-canvas-context.js';
import { MessageCircle, RotateCw, Link2, MonitorPlay, ScrollText, Globe } from 'lucide-react';
import { readDocView, writeDocView, boardSizeWarning, BOARD_LIMIT, docOnServerCopy, docSaved } from './canvas-doc.js';
import { CARD_GONE, cardParam, withoutCardParam } from './canvas-refs-model.js';
import CommentsPanel from './comments/CommentsPanel.jsx';
import { badgeText, useCanvasComments } from './comments/useCanvasComments.js';
import { memberBase } from './comments/comments-api.js';
import CommentSettings from './comments/CommentSettings.jsx';
import PeopleWithAccess from './comments/PeopleWithAccess.jsx';
import { readPanelPin, savePanelPin } from './canvas-find.js';
import { cacheAsset, cachedAsset } from './learn-asset-cache.js';
import { classifyDrop } from './learn-drop.js';
import { isModelDrop } from './model-drop.js';
import { mediaFamilyOf } from './media-family.js';
import { acceptList, boardFileLimit, formatBytes } from './file-capabilities.js';
import { captureNotePage, notesScope, readNotes, writeNote, deleteNote } from './learn-notes.js';
import { gradeAnswer, parseVerdict, recordBaseline, shadowGrade } from './learn-grade.js';
import { architectureLesson, sampleCourse } from './learn-preview.js';
import { BOARDS, BOARD_SEED_VERSIONS } from './demo-scenes.js';
import { DiveNavigator, DivePortals, holeApp, useDive, usePendingHole } from './Dive.jsx';
import { TitleHoles } from './TitleHoles.jsx';
import { canvasRepository, useTutor } from './LearnTutor.jsx';
import { useNextSteps } from './LearnNextSteps.jsx';
import LearnProgress from './LearnProgress.jsx';
import { explainMaterial } from './learn-coaching-materials.js';
import { describeBlock } from './LearningBlocks.jsx';
import { registeredCourse } from './learn-tutor-domains.js';
import { inJourneySetup, journeyDiveContext, useJourney } from './LearnJourney.jsx';
import { pathEntries } from './learn-journey.js';
import { useVoiceSession } from './LearnVoice.jsx';
import { TutorCaption } from './VoiceMode.jsx';
import { ProvenanceRow, useProvenance } from './ProvenanceGroup.jsx';
import { cardModel } from './home/provenance.js';
import { browserStorage, hasLocalContent, readBoardCopy, readBoardVersion, unsavedKey } from './home/canvas-local.js';
import { editorClosed, editorOpened } from './chunk-reload.js';
import { chatSaving } from './chat-persist.js';
import { blockedStorage } from './storage-fallback.js';
import { canvasThumbnail } from './card-thumbnail.js';
import { boardFromText, boardPending, boardText, conflictBaseKey, conflictDoc, serial, sharingOf, withPendingWork } from './canvas-persist.js';
import { lazyFeature } from './lazy-feature.jsx';
import { typingIn } from './canvas-equation.js';
import { codeRef, paperRef, wikiRef } from './chat-sources.js';
import { draftChatRef, materialize, placeExcerpts } from './pdf-excerpt.js';
import { EXCERPT_EVENT, get as excerptDraft } from './pdf-excerpt-drafts.js';
import { rekeyed } from './chat-threads.js';

const LearnNotes = lazyFeature(() => import('./LearnNotes.jsx'), 'Notes');
// Follow-up R3 item 3: this browser's copy of a board cannot be read (blocked storage, a value that is not a board), so a save
// sends nothing rather than an empty board. Storage blocked outright is held in memory for the page (storage-fallback.js), so
// edits save to the account but nothing outlives the page here, which the canvas says on open.
const UNREADABLE_COPY = "Not saved: this browser can't read its copy of this canvas, so nothing was sent to replace the saved one.";
const CONFLICT_MERGED = 'This board changed on another device. Your edits here are added to its latest version.';
const UNKEPT = "This browser is blocking storage, so nothing is kept in this browser: your edits save to your account only while you're online.";
// A review board named main gets a slug of its own (owner decision 3, 2026-10-07): review boards stay apart from the learner's
// real board, so ?board=main never shares its server row, journey or Tutor store.
const boardSlug = name => { const slug = String(name).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'test'; return slug === 'main' ? 'review-main' : slug; };
// The review board this page opens (?board=, review builds only), or null for the learner's own canvas.
const reviewBoard = hole => { const named = hole || !reviewTools ? null : new URLSearchParams(window.location.search).get('board'); return named ? boardSlug(named) : null; };
const AdaptiveCanvas = lazyFeature(() => import('./AdaptiveCanvas.jsx'), 'The canvas');
// The Insert menu's source search rows (descriptive icons, never a brand mark).
const FINDER_ICONS = { youtube: MonitorPlay, arxiv: ScrollText, wikipedia: Globe };
// What a reserved research card says while the answer finishes (docs/features/canvas-skeleton-cards.md).
const OPENING = { paper: 'Opening the paper', wiki: 'Opening the article', video: 'Opening the video' };

// A pending Rabbit Hole (Dive.jsx) opens in its parent's place until its first canvas object keeps it.
// The right-side Chat workspace (chat-workspace.jsx, owner brief 2026-10-13) wraps the canvas and its panels; the
// canvas's name scopes its threads.

export default function LearnPage(props) {
  const hole = usePendingHole(props.app);
  // The learner's Tutor controls are per canvas and board (use-learn-coaching.jsx).
  return <ChatWorkspaceProvider canvas={hole ? hole.name : props.app.name} board={reviewBoard(hole) || 'main'}>{hole ? <LearnSurface key={hole.name} app={holeApp(props.app, hole)} hole={hole} /> : <LearnSurface {...props} />}</ChatWorkspaceProvider>;
}

// `switcher`: a project's canvas switcher (RepositoryPage, docs/features/project-canvases.md), beside the title.
// `project`: the open project (RepositoryPage), so the title reads [project] › [canvas] (owner r35).
// repository (repository-canvas.jsx): the canvas's attached repository, for its header badge and the composer's code chips;
// files and graph: its companion viewers; openViewer: 'files' | 'graph' opens that viewer once on mount (an old ?tab= link,
// routes.js repositoryView).
function LearnSurface({ app, onBack, repository = null, repositoryContext = null, repositoryExcerpt = null, onClearRepository = null, onGraph = null, files = null, graph = null, openViewer = null, hole = null, switcher = null, project = null }) {
  const isRepository = app.kind === 'repository';
  // A canvas (smart-home's catalog) holds only what was put on it: never the
  // sample course, its lesson header, outline or progress.
  const isCanvas = /^canvas-[a-f0-9]{8}$/.test(app.name);
  // The header's repository and fork origin for this viewer (C:/s/spec/hdr-provenance.md C2): canvases and repository canvases.
  const provenance = useProvenance(isCanvas || isRepository ? `/api/learn/provenance/apps/${encodeURIComponent(app.name)}` : null);
  const course = useLearnCourse(app);
  const [courseView, setCourseView] = useState(false);
  // The canonical NanoGPT course is product content, so it ships wherever Rabbit Hole does (VITE_RABBIT_HOLE in
  // production, VITE_COACHING_DEV in dev/review), not only in the dev build; the dev tools stay behind their own gates.
  // Which app is that course is registry data (learn-tutor-domains.js, capabilities.suppliedCourse), never a name here.
  const suppliedCourse = learnPreview && !!registeredCourse({ app })?.capabilities?.suppliedCourse;
  const nanoProgress = useNanoProgress(app, suppliedCourse);
  const canAuthor = canEditCourse(course.canAuthor, suppliedCourse);
  // A canvas shared with this learner to view only (no edit rights): its Table of contents is read-only and takes no proposals
  // (R4). Repository Learn boards are each learner's own, so only a canvas's canEdit counts.
  const canEditCanvas = !(app.kind === 'canvas' && app.canEdit === false);
  const canEditRef = useRef(canEditCanvas);
  canEditRef.current = canEditCanvas;
  const [lessonSource, setLessonSource] = useState(null);
  const [plannedLesson, setPlannedLesson] = useState(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [sectionTarget, setSectionTarget] = useState(null);
  const [planEdits, setPlanEdits] = useState({});
  const [planStorageError, setPlanStorageError] = useState('');
  const planKey = `small.lesson-plan:${app.org}:${app.email || app.owner_email}:${app.name}`;
  useEffect(() => {
    if (!canAuthor) return;
    try { setPlanEdits(JSON.parse(localStorage.getItem(planKey) || '{}')); }
    catch { setPlanStorageError('Could not restore draft edits from this browser.'); }
  }, [planKey, canAuthor]);
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
  // The right panel and the Sources pane (chat-panels.js): the canvas and Chat show from the start, Chat is the default
  // tab (owner brief 2026-10-13 sections 2-3); pinned (the default) keeps the panel open while the learner works.
  const chat = useChatWorkspace(), { panels } = chat;
  const { open: panelOpen, setOpen: setPanelOpen, tab: panelTab, setTab: setPanelTab } = panels;
  // The companion column left of Chat (chat-panels.js): Context always, Files and Graph where this canvas has them. A code
  // reference clicked in an answer (small:open-files; repository-browser.md "Code references") opens Files on it, and
  // small:open-graph opens Graph, the right side too when it was hidden. openViewer (an old ?tab=code or ?tab=graph link) opens
  // that view once on arrival. Files and Graph mount on their first show and stay mounted (the graph code loads only then).
  const { companion } = panels;
  const companionViews = COMPANION_VIEWS.filter(entry => (entry.id === 'files' ? files : entry.id === 'graph' ? graph : true));
  const companionView = companionViews.some(entry => entry.id === companion.view) ? companion.view : 'context';
  const shown = useRef(new Set());
  if (panelOpen && companion.open) shown.current.add(companionView);
  if (panelOpen && panelTab === 'progress') shown.current.add('progress'); // Progress mounts on its first show, then stays
  useEffect(() => { if (openViewer) companion.show(openViewer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // An invisible selection never rides a later question (brief section 6): closing the column on a wide layout (not Hide
  // right panel, which hides Chat too and restores both), or leaving this canvas, clears the repository's temporary graph and Files selection; pinned chips stay with
  // their thread. Below lg, Back to chat swaps the column for Chat with the chips in view, so the selection stays for the ask.
  const viewerShown = companion.open, heldRepository = useRef(repository);
  heldRepository.current = repository;
  useEffect(() => { if (!viewerShown && window.matchMedia('(min-width: 64rem)').matches) clearSelection(heldRepository.current); }, [viewerShown]);
  useEffect(() => () => clearSelection(heldRepository.current), []);
  // Each column leaves the other's on-screen width out of its own maximum, so together they keep the canvas its 360 px floor.
  const [chatWidth, setChatWidth] = useState(0), [companionWidth, setCompanionWidth] = useState(0);
  // The listeners outlive renders: they read the latest companion.
  const companionNow = useRef(companion);
  companionNow.current = companion;
  useEffect(() => {
    const showFiles = () => companionNow.current.show('files'), showGraph = () => companionNow.current.show('graph');
    if (files) window.addEventListener('small:open-files', showFiles);
    if (graph) window.addEventListener('small:open-graph', showGraph);
    return () => { window.removeEventListener('small:open-files', showFiles); window.removeEventListener('small:open-graph', showGraph); };
  }, [!!files, !!graph]); // eslint-disable-line react-hooks/exhaustive-deps
  const [panelPinned, setPanelPinned] = useState(() => readPanelPin(() => localStorage));
  const pinPanel = value => { setPanelPinned(value); savePanelPin(() => localStorage, value); };
  const findInput = useRef(null);
  // Mirrored from the canvas so the View menu can tick what is on. Held by value
  // rather than by ref, and returned unchanged when nothing moved, or the effect
  // that publishes it would re-render forever.
  const [canvasState, setCanvasState] = useState({ grid: false, lock: false, minimap: true, holeMap: true, curious: true, pages: false, presenting: false, outline: [], selected: 0, units: 0, grouped: false, canPaste: false });
  // boardContext is rebuilt every render but read inside a send; a ref keeps the
  // outline current without making the composer re-render on every tick.
  // A proposal from the tutor. It sits here until the learner applies or
  // discards it; nothing reaches the canvas on its own.
  const [proposal, setProposal] = useState(null);
  // The source finder (SearchBar), opened only through openSourceFinder (source-finder.js; Release B, B3): Chat's and Ctrl+K's
  // /youtube /arxiv /wikipedia, a typed /paper <topic>, the Insert menu and the + palette's YouTube moment. finder:
  // { source, query, origin, from, done } while it is open, else null; done settles the opener's promise once ({ added }).
  const [finder, setFinder] = useState(null);
  const finderNow = useRef(null);
  finderNow.current = finder;
  useEffect(() => setSourceFinderHost(({ source, query, origin }) => new Promise(resolve => {
    finderNow.current?.done({ added: false });
    let settled = false;
    const done = result => { if (!settled) { settled = true; resolve(result); } };
    setFinder({ source, query, origin, from: document.activeElement, done });
  })), []);
  const closeFinder = () => {
    const open = finderNow.current;
    if (!open) return;
    setFinder(null);
    open.done({ added: false });
    requestAnimationFrame(() => returnFocus(open.origin, open.from));
  };
  // "/" focuses the right panel's Find (owner decision 5A): bumped to focus it once the panel has rendered open.
  const [findFocus, setFindFocus] = useState(0);
  useEffect(() => { if (findFocus) requestAnimationFrame(() => findInput.current?.focus()); }, [findFocus]);
  // Tool Performance v1: common tools fetched on idle, one per quiet moment (learn-warmup.js).
  useEffect(() => { warmLearnTools(app.name); }, [app.name]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [slashHelpOpen, setSlashHelpOpen] = useState(false);
  // / focuses the right panel's canvas Find (owner decision 5A, Release B; it opened Search before) and ? the shortcuts
  // sheet - the keys the page owns; the canvas owns the rest. Neither fires while typing or presenting: "/" keeps its typing
  // or slash-picker meaning in Chat, Ctrl+K, fields, BlockNote and code editors (slashOpensFind).
  useEffect(() => {
    const key = event => {
      if (event.ctrlKey || event.metaKey || event.altKey || (event.key !== '/' && event.key !== '?')) return;
      const active = window.document.activeElement;
      if (typingIn(active) || active?.tagName === 'SELECT') return;
      if (event.key === '/' && !slashOpensFind(active)) return;
      if (canvasStateRef.current.presenting) return;
      event.preventDefault();
      if (event.key === '/') { setPanelOpen(true); setPanelTab('find'); setFindFocus(n => n + 1); } else setShortcutsOpen(open => !open);
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
    (previous.grid === next.grid && previous.lock === next.lock && previous.minimap === next.minimap && previous.holeMap === next.holeMap && previous.curious === next.curious && previous.pages === next.pages && previous.presenting === next.presenting && previous.selected === next.selected && previous.units === next.units && previous.grouped === next.grouped && previous.canPaste === next.canPaste && previous.content === next.content && previous.attempts === next.attempts && previous.semanticFingerprint === next.semanticFingerprint && previous.semanticSettling === next.semanticSettling && previous.activeSection === next.activeSection && JSON.stringify(previous.card) === JSON.stringify(next.card) && JSON.stringify(previous.outline) === JSON.stringify(next.outline) && JSON.stringify(previous.cards) === JSON.stringify(next.cards) ? previous : next)), []);
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
  // Chat exchanges shown on the adaptive canvas (saved cards; a Chat answer becomes one only through Add as card,
  // never automatically); the canvas renders them as movable cards. Blocks persist in
  // this browser so a refresh does not clear the canvas; a stream cut by a
  // refresh is kept as-is and marked done.
  const canvasKey = `small.adaptive-canvas:${app.org}:${app.email || app.owner_email}:${app.name}`;
  // ?board=<name> opens a SEPARATE board under its own storage key, so trying
  // something out never touches the learner's own canvas, and edits there
  // survive a reload. A name listed in BOARDS seeds the scenes under review;
  // any other name is an empty board to work in. The name is slugged rather
  // than validated, because a rejected name would silently fall through to the
  // learner's real canvas - the one place a test board must never land.
  // Review boards are review tooling: only in the dev/review build (reviewTools), never on production.
  // An unknown review-board name renders a visible notice rather than a blank
  // canvas: a blank is indistinguishable from a broken deploy, and it burned a
  // review twice. Scratch boards are still available - any name works as an
  // empty board - but the emptiness is now announced, never silent.
  const board = reviewBoard(hole);
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
  // `into`: the slot the canvas reserved for this card (docs/features/canvas-skeleton-cards.md), here and below.
  const addVideo = (video, into = null) => {
    pauseLesson();
    const blockId = canvas()?.insertVideo({ ...video, into });
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
  const addWiki = ({ title, section = 0 }, into = null) => {
    pauseLesson();
    const blockId = canvas()?.insertWiki({ title, section, into });
    if (!blockId) return;
    setWikiContext({ blockId, title, section, selection: null });
    setPaperContext(null);
    registerSource({ id: `wiki:${blockId}`, kind: 'wiki', label: String(title).replace(/_/g, ' ') });
    return blockId;
  };
  const addPaper = (paper, into = null) => {
    pauseLesson();
    const page = paper.page || 1;
    const blockId = canvas()?.insertPaper({ id: paper.id, title: paper.title, page, into });
    if (!blockId) return;
    setPaperContext({ ...paper, page });
    setWikiContext(null);
    registerSource({ id: `paper:${paper.id}`, kind: 'paper', label: paper.title || `arXiv ${paper.id}` });
    return blockId;
  };
  // One road from a search result to a card: the Search bar and the Agent Bar
  // handoff both take it. Returns the card's block id.
  const pickResult = (source, item, into = null) => (source === 'arxiv' ? addPaper(item, into) : source === 'wikipedia' ? addWiki({ title: item.title }, into) : addVideo(item, into));
  // A paper card turning its page is where the learner is now - unless the
  // reader is open, which wins, as it does for a wiki card's section.
  // The Learn Chat workspace's handle (chat-workspace.jsx). This page renders the provider, so A1 mounts
  // <ChatWorkspaceRef into={chatWorkspace} /> (SourceReader.jsx) inside it. While it is set, every reader opener below opens the
  // source in the Sources pane beside Chat instead of in place of the transcript (brief 6, 13.1), and changes no request context:
  // viewing never attaches (contract A5). While it is null, the old right-panel readers open as before.
  // canvasOps (chat-workspace.jsx) for Lane B's footer and actions: Add as card, Open in Notebook, locate.
  useEffect(() => chat?.setCanvasOps?.({
    // Retain the immutable file manifest in the board's existing provenance list. Chat keeps only its compact identity.
    // Deleting the visible card must not discard a model's dependency paths or the board's authorized file references.
    retainFileForContext: (ref, selectedFile) => {
      if (board || ref?.kind !== 'file') return;
      const selected = selectedFile || canvasApi.current?.blocks?.().find(block => fileChatRef(block)?.sourceId === ref.sourceId)?.fileRef;
      if (!selected) return;
      const fileRef = fileContextManifest(selected);
      if (!fileRef) { toast('Finish uploading this file and its dependencies before adding it to Chat.'); return false; }
      setSources(previous => [...previous.filter(source => source.id !== ref.sourceId), { id: ref.sourceId, kind: 'file', label: ref.name, attached: false, fileRef }]);
    },
    fileForContext: ref => sourcesRef.current.find(source => source.kind === 'file' && source.id === ref.sourceId)?.fileRef,
    insertChat: entry => canvasApi.current?.insertChat(entry),
    // UI-15 / MOT-20 (generation-proposal-chat.js): what a chat turn sends so the server can propose a Motion video (the canvas
    // is the learner's location: its title names the concept), and whether a proposal already made its card here.
    generation: (target, current, concept = app.title) => generationField({ offered: isLearnCommand('motion'), concept, target, current }),
    proposalMade: proposalId => !!canvasApi.current?.blocks?.().some(madeFrom(proposalId)),
    hasBlock: id => !!canvasApi.current?.blocks?.().some(block => block.id === id) || !!canvasApi.current?.exchanges?.().some?.(entry => entry.id === id),
    // A chat card added under its answer's local id takes the saved message's id (ask.jsx), unless that id is already here.
    rekeyCard: (from, to) => setExchanges(previous => rekeyed(previous, from, to)),
    locate: id => canvasApi.current?.focusBlock(id),
    // The Tutor entry (learn-coaching-entry.js): whether this board has been restored, and how much is on it (cards and native
    // objects). Never content: a count only.
    workspace: () => ({ loaded: boardLoaded.current, content: (canvasApi.current?.blocks?.().length || 0) + (canvasApi.current?.semantic?.()?.snapshot?.objects?.length || 0) }),
    // A Chat prompt's outputs (chat-output-refs.js, ChatOutputs.jsx): read a card, and put a deleted one back from its saved
    // snapshot under its own id (a CAD card through reconcileCad, after its jobs are shown again), for the owner only. Never a
    // generation: no model or executor route is called here.
    block: id => canvasApi.current?.blocks?.().find(block => block.id === id) || null,
    restoreCard: block => (block.type === 'cad' ? canvasApi.current?.reconcileCad(block) : canvasApi.current?.insertImported(block)),
    cadPlacement: (jobId, hidden) => cadClient(api, app.name, board || 'main').action(jobId, 'placement', { hidden }),
    // Review design above the composer (CadReview.jsx): the owner's CAD cards whose brief awaits approval, their jobs, and their
    // actions, whose answer goes back on the card. Approve is the paid confirmation (cad-client.js sends confirmed).
    cadReviews: () => (canEditRef.current ? (canvasApi.current?.blocks?.() || []).filter(block => block.type === 'cad' && block.status === 'awaiting_approval' && block.jobId) : []),
    cadRead: id => cadClient(api, app.name, board || 'main').get(id),
    cadAction: async (id, action, body) => { const result = await cadClient(api, app.name, board || 'main').action(id, action, body); canvasApi.current?.reconcileCad(result.block); return result; },
    canEdit: () => canEditRef.current,
    // Tutor Task 07 (learn-coaching-materials.js applyTutorAction): the live canvas, and the one seam that makes Tutor material -
    // its own material tools on the existing Learn command path (internal; /api/learn/artifact), never a second generator.
    tutorCanvas: () => canvasApi.current && { ...canvasApi.current, startExplain: explainLatest },
    makeTutorMaterial: explainMaterial(runLearnCommand, { app: app.name, openSearch: () => {}, post: (path, body, options) => api(path, { ...options, method: 'POST', body: JSON.stringify({ ...body, ...(askScope.pending ? { pending: askScope.pending } : {}) }) }) }),
    canvasContext, selection: () => canvasApi.current?.selection?.() || [],
    // A card from the companion (repo graph R2, C:/s/spec/repo-graph-r2-plan.md): an equivalent card already here (`same`) is
    // revealed, never added twice by a double-click or a retry; otherwise inserted where the learner looks, one undo step.
    // Returns { id, existed }.
    // `at` (a drop point): the card lands there in one undo step (insertImported); without it, where the learner is looking.
    // Generate on an /explain brief (EXP-T20, Lane C approve): the job on this canvas whose card already waits. A brief made on
    // another canvas is not found here and is refused by the server, never attached to this one. -> the card id.
    approveExplain: async proposal => {
      const boardId = commentBoardRef.current;
      if (!boardId || typeof proposal?.input?.job !== 'string') throw new Error('This explanation can be generated only on its own canvas.');
      const { job } = await explainClient(api, boardId).action(proposal.input.job, 'approve', { proposal });
      window.dispatchEvent(new CustomEvent(EXPLAIN_JOB_EVENT, { detail: { jobId: proposal.input.job } }));
      return job?.cardId || null;
    },
    // A Chat turn while that brief waits (EXP-T20 slice 3, ask.jsx): the job prepares its next version (Lane C refine); the
    // previous approval no longer counts, and the card observes the job again.
    explainWaiting: jobId => !!canvasApi.current?.blocks?.().some(block => block.explainJob?.id === jobId && block.explainJob.stage === 'awaiting_approval'),
    refineExplain: async (proposal, message) => {
      const boardId = commentBoardRef.current;
      if (!boardId || typeof proposal?.input?.job !== 'string') throw new Error('This explanation can be changed only on its own canvas.');
      const { job } = await explainClient(api, boardId).action(proposal.input.job, 'refine', { message });
      window.dispatchEvent(new CustomEvent(EXPLAIN_JOB_EVENT, { detail: { jobId: proposal.input.job } }));
      return job;
    },
    insertCard: (block, { same = null, at = null } = {}) => {
      const existing = same && canvasApi.current?.blocks?.().find(same);
      if (existing) { canvasApi.current.focusBlock(existing.id); return { id: existing.id, existed: true }; }
      const id = at ? canvasApi.current?.insertImported({ ...block, id: crypto.randomUUID(), dx: 0, dy: 0 }, at) : canvasApi.current?.insertBlock(block);
      return { id: id ?? null, existed: false };
    },
    // Several cards as one group (canvas insertGroup: a grid in free space, one undo step). sameAs(block) finds an equivalent
    // card already on the canvas: those are not added again; the last one found is revealed when nothing new is added.
    insertCards: (list, { sameAs = null, size } = {}) => {
      const blocks = canvasApi.current?.blocks?.() || [];
      const existing = sameAs ? list.map(block => blocks.find(sameAs(block))).filter(Boolean) : [];
      const fresh = sameAs ? list.filter(block => !blocks.some(sameAs(block))) : list;
      if (!fresh.length) { if (existing.length) canvasApi.current.focusBlock(existing.at(-1).id); return existing.map(block => block.id); }
      return canvasApi.current?.insertGroup?.(fresh, size) || [];
    },
    insertNotebook: (cells, language = 'python') => {
      const block = newNotebookBlock(), [cell] = block.ipynb.cells;
      return canvasApi.current?.insertImported({ ...block, language, ipynb: { ...block.ipynb, cells: cells.map((source, index) => ({ ...cell, id: index ? crypto.randomUUID().slice(0, 8) : cell.id, source: String(source ?? '') })) } });
    },
  }), [chat?.setCanvasOps, board]); // eslint-disable-line react-hooks/exhaustive-deps
  const chatWorkspace = useRef(null);
  chatWorkspace.current = chat; // the provider wraps this page (A1), so the handle is the page's own workspace
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
    const chat = chatWorkspace.current;
    if (chat) { if (section) chat.sources.savePosition(`wiki:${title}`, { section }); chat.openSource(wikiRef({ title })); } else {
    setWikiContext({ blockId: blockId || null, title, section, selection: null });
    setWikiOpenAt(previous => previous + 1);
    // One reader holds one thing. Leaving paperContext set would keep sending
    // the paper instead - ask.jsx prefers it - for the rest of the session.
    setPaperContext(null);
    setWikiOpen(true); setPaperOpen(false); setSourceOpen(false); setLessonSource(null); setLearnerOpen(false); setSetupChat(false); setPanelOpen(true);
    }
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
    if (chatWorkspace.current) chatWorkspace.current.openSource(paperRef(paper)); else {
    setPaperContext({ ...paper, page: paper.page || 1 });
    setWikiContext(null); setWikiOpen(false);
    setPaperOpen(true); setSourceOpen(false); setLessonSource(null); setLearnerOpen(false); setSetupChat(false); setPanelOpen(true);
    }
    registerSource({ id: `paper:${paper.id}`, kind: 'paper', label: paper.title || `arXiv ${paper.id}` });
  };
  // A PDF needs no account and no server: the bytes go to this browser's asset
  // store and the block keeps only the key. The file picker is hidden and
  // triggered from the Sources menu, so there is no dialog to dismiss.
  // The Files menu's Upload: same router as a drop, one picker for all kinds.
  const filePicker = useRef(null);
  // Add to canvas for a PDF (docs/features/pdf-to-canvas.md), one flow for an upload or drop (takePdf) and for a PDF already in
  // Sources (small:pdf-to-canvas): the dialog's one PDF card, or chosen pages drawn as page images. `place(choice, progress)`
  // does the road's own work; Cancel or Escape (also while drawing) adds nothing, and a second press is never taken.
  const [pdfAdd, setPdfAdd] = useState(null); // { name, total, busy, progress, error }
  const pdfJob = useRef(null); // { place, done, running }
  const askPdf = job => new Promise(done => { pdfJob.current = { place: job.place, done }; setPdfAdd({ name: job.name, total: job.total, busy: job.total == null, progress: null, error: null }); });
  const closePdf = () => { const job = pdfJob.current; pdfJob.current = null; setPdfAdd(null); job?.done(); };
  const confirmPdf = async choice => {
    const job = pdfJob.current;
    if (!job?.place || job.running) return;
    job.running = true;
    setPdfAdd(current => current && { ...current, busy: true, progress: null, error: null });
    try {
      await job.place(choice, progress => {
        if (pdfJob.current !== job) throw new Error('cancelled');
        setPdfAdd(current => current && { ...current, progress });
      });
      if (pdfJob.current === job) closePdf();
    } catch (error) {
      job.running = false;
      if (pdfJob.current === job) setPdfAdd(current => current && { ...current, busy: false, progress: null, error: error.message || 'That PDF could not be added.' });
    }
  };
  // The chosen pages, each drawn once to an image at the slides' width and kept as a board asset (never a blob URL), in order.
  const drawPages = async (pdf, from, to, progress) => {
    const pages = [], sheet = document.createElement('canvas');
    for (let number = from; number <= to; number++) {
      progress(`Drawing page ${number - from + 1} of ${to - from + 1}`);
      try {
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: 1120 / page.getViewport({ scale: 1 }).width });
        sheet.width = viewport.width; sheet.height = viewport.height;
        await page.render({ canvasContext: sheet.getContext('2d'), viewport }).promise;
        const blob = await new Promise(resolve => sheet.toBlob(resolve, 'image/png'));
        const key = `slide:${crypto.randomUUID()}`;
        await cacheAsset(key, blob);
        pages.push({ assetKey: key, number });
      } catch { throw new Error(`Page ${number} could not be drawn.`); }
    }
    return pages;
  };
  // One PDF card (its bytes under the source key) or the drawn pages, as one undoable insert. `source` is pdf-source.js's key.
  // The canvas a PDF card or page names as its home (pdf-to-canvas.md): a project board (repo-*) names none, as only a canvas
  // can be a home (learn-paper.js paperIdentity).
  const pdfHome = /^canvas-[a-f0-9]{8}$/.test(app.name) ? app.name : null;
  const placePdf = async ({ pdf, file, source, label }, { mode, from, to }, progress) => {
    if (mode === 'pdf') { await cacheAsset(source, file); progress('Adding the PDF card'); canvas()?.insertPdf({ assetKey: source, label, home: pdfHome }); return; }
    const pages = await drawPages(pdf, from, to, progress);
    progress(`Adding ${pages.length} page${pages.length === 1 ? '' : 's'}`);
    canvas()?.insertSlides({ pages, label, pdf: source, home: pdfHome });
  };
  const readPdf = async bytes => {
    const { getDocument } = await import('./learn-paper-figures.js');
    return getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  };
  const takePdf = async file => {
    if (!file) return;
    // The reader can only take the learner to a page the model will also read,
    // and paper_context refuses anything past 100. Say so before the upload
    // rather than failing on every question afterwards.
    let pdf;
    try {
      pdf = await readPdf(await file.arrayBuffer());
      if (pdf.numPages > 100) { toast(`That PDF has ${pdf.numPages} pages. The tutor can read up to 100.`); return; }
    } catch { toast(`${file.name || 'That file'}: could not be read as a PDF.`); return; }
    let stored = null; // uploaded once: Add again after a failed draw reuses it
    await askPdf({ name: file.name, total: pdf.numPages, place: async (choice, progress) => {
      if (!stored) {
        progress('Uploading');
        const body = new FormData();
        body.append('file', file, file.name);
        const response = await fetch(`/api/learn/paper?app=${encodeURIComponent(app.name)}`, { method: 'POST', body, headers: wsHeaders() });
        const reply = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(reply?.error || 'That PDF could not be uploaded.');
        stored = reply;
      }
      // The card is the canvas-resident copy and survives a reload because the bytes are a board asset and the block keeps
      // only the key (pdf:<paper id>, pdf-source.js).
      await placePdf({ pdf, file, source: `pdf:${stored.id}`, label: stored.title }, choice, progress);
      // Opening it in the reader, at the first page added, is what makes the tutor page-aware: boardContext carries
      // paperContext, and ask.jsx turns that into paper_context with the page the learner is actually on. The card cannot do
      // that job - an iframe never says which page is on screen.
      const page = choice.mode === 'pages' ? choice.from : 1;
      pauseLesson();
      // reveal false: the upload and drawing take a while; a panel the learner hid meanwhile stays hidden (hide-right-panel.md).
      if (chatWorkspace.current) chatWorkspace.current.openSource(paperRef({ id: stored.id, title: stored.title, page }), { reveal: false }); else {
      setPaperContext({ ...stored, pdfUrl: null, page });
      setWikiContext(null); setWikiOpen(false);
      setPaperOpen(true); setSourceOpen(false); setLearnerOpen(false); setSetupChat(false);
      }
      registerSource({ id: stored.id, kind: 'pdf', label: stored.title });
    } });
  };
  // Add to canvas from the Sources pane (SourcesPane.jsx): the PDF already stored there - a context document or an uploaded
  // paper - read once from its own route (pdfBytesUrl). Nothing is uploaded or created, and its attachment is left as it is.
  useEffect(() => {
    const add = async event => {
      const { sourceId, kind, name } = event.detail || {};
      const source = pdfKeyOfRef({ sourceId, kind });
      if (!source || pdfJob.current) return;
      const label = name || 'PDF';
      const opened = askPdf({ name: label, total: null, place: null });
      const job = pdfJob.current;
      try {
        const response = await fetch(pdfBytesUrl(app.name, source), { headers: wsHeaders() });
        if (!response.ok || !/pdf/.test(response.headers.get('content-type') || '')) throw new Error();
        const file = await response.blob();
        const pdf = await readPdf(await file.arrayBuffer());
        if (pdfJob.current !== job) return;
        job.place = (choice, progress) => placePdf({ pdf, file, source, label }, choice, progress);
        setPdfAdd(current => current && { ...current, total: pdf.numPages, busy: false });
      } catch {
        if (pdfJob.current === job) setPdfAdd(current => current && { ...current, busy: false, error: 'That PDF could not be read.' });
      }
      await opened;
    };
    window.addEventListener('small:pdf-to-canvas', add);
    return () => window.removeEventListener('small:pdf-to-canvas', add);
  }, [app.name]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // A .ipynb, .py or other code file, dropped (at its drop point) or uploaded (where the learner is looking), waits for the
  // Add to canvas dialog (docs/features/canvas-file-drop.md); several from one drop are one dialog (kind 'batch'), each file
  // and what it becomes, and nothing is placed until every one of them reads. Importing reads the file and keeps its bytes
  // in this browser for the board's server copy - no code runs, nothing is installed, no model is asked.
  const [imports, setImports] = useState([]); // [{ id, file, kind, at }] or [{ id, kind: 'batch', files: [{ file, kind }], at }]
  const [importState, setImportState] = useState({ error: null, busy: false });
  // Tables, workbooks, Word documents and presentations (DocImport.jsx, canvas-file-imports.md lane 2): their own checks and choices.
  const docImport = useDocImport({ canvas: () => canvasApi.current, toast });
  const nextImport = () => { setImportState({ error: null, busy: false }); setImports(queue => queue.slice(1)); };
  const addImport = async choice => {
    const { at, ...entry } = imports[0];
    const items = entry.kind === 'batch' ? entry.files : [entry], choices = entry.kind === 'batch' ? choice : [choice];
    setImportState({ error: null, busy: true });
    try {
      const made = [];
      for (const [index, { file, kind, copy }] of items.entries()) {
        const assetKey = `import:${crypto.randomUUID()}`, chosen = choices[index];
        // A dropped file's Code card is a repo-code card, its text in its asset (codeBlock); a pasted one stays a snippet.
        const block = kind === 'paste' ? pasteBlock({ text: await file.text(), copy, choice: chosen, assetKey, language: languageOf(copy?.path) })
          : chosen === 'code' ? codeBlock({ name: file.name, text: await file.text(), assetKey, size: file.size })
            : importBlock({ name: file.name, kind, choice: chosen, text: chosen === 'attachment' ? '' : await file.text(), assetKey, size: file.size });
        made.push({ file, assetKey, block });
      }
      for (const { file, assetKey, block } of made) {
        await cacheAsset(assetKey, file);
        if (block.type === 'repo-code') insertCodeCard(chat?.canvasOps, block, at); else canvas()?.insertImported(block, at);
      }
      nextImport();
    } catch (problem) { setImportState({ error: problem.message, busy: false }); }
  };
  // Pasted code (AdaptiveCanvas paste, canvas-paste.js; repository-browser.md "Files in Learn"): the same Add to canvas dialog,
  // Code card or Jupyter notebook, before anything is placed - where the learner is looking. Text copied from a repository file
  // keeps its file's name, path and language; Cancel or Esc places nothing; nothing runs, installs or asks a model.
  const pasteCode = text => {
    const copy = copiedCode(() => sessionStorage, text);
    setImports(queue => [...queue, { id: crypto.randomUUID(), file: new File([text], pasteName(copy), { type: 'text/plain' }), kind: 'paste', at: null, copy }]);
  };
  // Ask in chat on lines in the Files panel (RepositoryPage small:code-card; repository-browser.md "Files in Learn", owner
  // 2026-10-08): the lines become a Code card - the paste dialog's Code card (pasteBlock), its file, lines and language kept
  // as its code source - placed where the learner is looking, in the flow, and selected, so it is the question's selected
  // card beside the repository range. The same lines again reselect their card. Nothing is sent; no model is asked.
  useEffect(() => {
    const place = async event => {
      const { text, path, start, end, commit, repo } = event.detail || {};
      const surface = canvasApi.current;
      if (!surface || typeof text !== 'string' || !path) return;
      const same = (surface.blocks?.() || []).find(block => block.type === 'snippet' && (block.sources || []).some(source => source.kind === 'code' && source.repo === repo && source.revision === commit && source.path === path && source.lines?.[0] === start && source.lines?.[1] === end));
      let id = same?.id;
      if (!id) {
        const copy = { path, repo, commit, start, end }, assetKey = `import:${crypto.randomUUID()}`;
        const block = pasteBlock({ text, copy, choice: 'code', assetKey, language: languageOf(path) });
        await cacheAsset(assetKey, new File([text], pasteName(copy), { type: 'text/plain' }));
        id = surface.insertImported(block);
      }
      surface.select(id);
    };
    window.addEventListener('small:code-card', place);
    return () => window.removeEventListener('small:code-card', place);
  }, []);
  const takeDrop = async (files, at = null) => {
    // 3D models, splats, CAD, ZIP and folder packages (model-import.js, lazily loaded): one card per model, placed in
    // input order; files no model uses (a photo alongside) carry on below as ordinary drops.
    if (isModelDrop(files)) {
      const [{ importModelFiles }, { placeModelCard }] = await Promise.all([import('./model-import.js'), import('./model-storage.js')]);
      const { cards, leftovers, errors } = await importModelFiles(files);
      for (const error of errors) toast(error, { tone: 'error' });
      for (const card of cards) {
        try { canvas()?.insertImported(await placeModelCard(card), at); } catch (problem) { toast(`${card.block.label}: ${problem.message}`, { tone: 'error' }); }
      }
      files = leftovers;
    }
    const asked = [];
    for (const file of files) {
      if (importKind(file.name)) {
        const { kind, error } = checkImport(file);
        if (error) toast(error, { tone: 'error' }); else asked.push({ id: crypto.randomUUID(), file, kind, at });
        continue;
      }
      if (docImport.claims(file)) { await docImport.take(file, at); continue; }
      // Images, GIFs, SVG, audio and video are read from their bytes (media-import.js, loaded with the first media drop).
      const media = mediaFamilyOf(file.name) ? await (await import('./media-import.js')).importMedia(file) : null;
      const { kind, error } = media || classifyDrop(file);
      if (error) { toast(error); continue; }
      if (kind === 'pdf') { await takePdf(file); continue; }
      // SVG and audio: a stored source once the file client is injected (media-storage.js); everything else a board asset.
      if (kind === 'svg' || kind === 'audio') {
        try { canvas()?.insertFile(await (await import('./media-storage.js')).storeMedia(file, media)); } catch (problem) { toast(`${file.name}: ${problem.message}`); }
        continue;
      }
      const assetKey = `drop:${crypto.randomUUID()}`;
      await cacheAsset(assetKey, file);
      if (kind !== 'image') { canvas()?.insertFile({ assetKey, kind: kind === 'gif' ? 'image' : kind, label: file.name, meta: media?.meta }); continue; }
      let stored = null;
      try {
        const body = new FormData();
        body.append('file', file, file.name);
        const response = await fetch(`/api/learn/media?app=${encodeURIComponent(app.name)}`, { method: 'POST', body, headers: wsHeaders() });
        stored = await response.json();
        if (!response.ok) throw new Error(stored?.error || 'Upload failed');
      } catch (problem) { toast(`${file.name}: ${problem.message}. The card is here, but the tutor will not see this image.`); stored = null; }
      const blockId = canvas()?.insertFile({ assetKey, kind: 'image', label: stored?.title || file.name, mediaId: stored?.id || null, meta: media?.meta });
      if (stored && blockId) {
        setImageContext({ blockId, id: stored.id, title: stored.title });
        registerSource({ id: `image:${blockId}`, kind: 'image', label: stored.title });
      }
    }
    if (asked.length > 1) setImports(queue => [...queue, { id: crypto.randomUUID(), kind: 'batch', files: asked, at }]);
    else if (asked.length) setImports(queue => [...queue, ...asked]);
  };
  // The card context menu's type-specific rows land here: the canvas names
  // the action, this page owns the readers, sources, and contexts involved.
  const cardAction = (action, payload) => {
    if (action === 'wiki-reader') openWiki({ title: payload.title, section: payload.section || 0 });
    else if (action === 'pdf-reader') openPaper({ id: payload.id, title: payload.title, pdfUrl: null, page: payload.page || 1, ...(payload.home ? { home: payload.home } : {}) });
    // A context document (pdf-to-canvas.md) opens in Sources, at the page's own page.
    else if (action === 'doc-reader') chatWorkspace.current?.openSource({ sourceId: `doc:${payload.id}`, kind: 'doc', name: payload.title || 'Document', version: '', range: { page: payload.page || 1 } });
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
    // EXP-T28: the crop lands in Chat, opened and focused, beside the draft and attachments already there; nothing is sent.
    chatWorkspace.current?.panels?.openChat?.();
    chatWorkspace.current?.composer?.focus?.();
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
    focusBlock: id => canvas()?.focusBlock(id),
    // turn (ask.jsx recordCommand): { onCard }, the sink each card this command inserts is reported to, so the Chat keeps it
    // under the command's saved message (chat-output-refs.js withCardSink).
    run: (text, _target, turn = null) => {
      const sink = turn?.onCard || null;
      // /deeper, /simplify, /ask and /teach no longer reach the Tutor as a turn's slash (owner, 2026-10-20): they are removed
      // commands, and runLearnCommand says so; the same words without the slash are an ordinary Tutor turn.
      return runLearnCommand(text, {
        app: app.name,
        target: askTarget,
        // The composer's attached image (its uploaded media id), as a question carries it (ask.jsx image_context).
        attachedImage: imageAttached && imageContext?.id ? imageContext.id : null,
        canvas: withCardSink({
          startCad: async (prompt, options) => { const result = await startCad(prompt, options); if (result?.block?.id) sink?.(result.block.id); return result; },
          // turn (ask.jsx recordCommand): the thread its line was saved in (a reviewed brief is posted there) and the Chat's
          // pinned and temporary refs, which the server resolves under this canvas's authorization.
          startExplain: async (prompt, options) => { const result = await startExplain(prompt, { ...options, thread: turn?.thread ?? null, refs: turn?.refs ?? null }); if (result?.blockId) sink?.(result.blockId); return result; },
          insertNotebook: () => canvasApi.current?.insertNotebook(),
          insertBlock: (block, options) => canvasApi.current?.insertBlock(block, options),
          // A paid Generate whose job a card here already shows reveals that card (learn-slash.js existingGeneration).
          blocks: () => canvasApi.current?.blocks?.() || [],
          focusBlock: id => canvasApi.current?.focusBlock(id),
          reserve: slot => canvasApi.current?.reserve(slot),
          release: id => canvasApi.current?.release(id),
          dive: args => dive.run(args),
          goal: args => chat.goals?.open(args), // /goal: goal management in Progress (chat-workspace.jsx goals.open)
        }, sink),
        // A Chat source command's finder (the shared opener): settles { added } when it closes, so the composer keeps its
        // draft until then; focus goes back to the composer.
        openSearch: seed => openSourceFinder({ source: seed.source, query: seed.query, origin: { returnFocus: document.activeElement } }).then(done => { if (done?.blockId) sink?.(done.blockId); return done; }),
        post: (path, body, options) => api(path, { ...options, method: 'POST', body: JSON.stringify({ ...body, ...(askScope.pending ? { pending: askScope.pending } : {}) }) }),
      });
    },
  };
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
  const startExplainRef = useRef(null), explainLatest = useRef((prompt, options) => startExplainRef.current?.(prompt, options) ?? null).current;
  // Whole-canvas context (chat-canvas-context.js): the canvas_context every chat turn on this canvas carries, built from the live
  // canvas when it is sent - Ask and Tutor modes (canvasOps, ask.jsx) and Auto's Tutor (useTutor) alike. The title is a weak hint
  // (titleNow, set below); the summary is the "This canvas" chip's line. Refs and stable setters only, so any render's copy works.
  const titleNow = useRef(null);
  const canvasContext = options => {
    const built = canvasContextNow({ api: canvasApi.current, title: titleNow.current, ...options });
    if (built) chat.setCanvasCoverage?.(built.coverage.summary);
    return built;
  };
  // The server is the source of truth for every owned board (docs/features/canvas-persistence.md): each is saved there,
  // and a newer server copy replaces this browser's on open. This browser keeps the instant copy, the offline queue and
  // the cache. Review boards (?board=, dev tooling) are saved there only while shared (canvas-sharing.md).
  const boardName = board || 'main';
  // PDF excerpts from the reader (pdf-excerpts contract, 'small:pdf-excerpt'; the canvas drop sends the same event with `at`).
  // canvas: the card - crop stored and highlight saved first, so a failure leaves none (Retry offers the same intent again) - one
  // insertion and one Undo step for the whole intent (draftIds: a split's parts). chat: attached to the conversation, nothing sent.
  useEffect(() => {
    const take = async ({ action, draftId, draftIds, at = null }) => {
      const ids = draftIds?.length ? draftIds : draftId ? [draftId] : [];
      const surface = canvasApi.current, options = { app: app.name, board: boardName, saveBoard: () => canvasApi.current?.persist?.() };
      if (!ids.length) return;
      try {
        if (action === 'chat') {
          const drafts = ids.map(excerptDraft);
          if (drafts.some(entry => !entry)) throw new Error('This selection is no longer available. Select it again.');
          for (const entry of drafts) { const { ref, fileRef } = await draftChatRef(entry, options); if (ref) chatWorkspace.current?.addToChat(ref, fileRef ? { fileRef } : undefined); }
          return;
        }
        if (action !== 'canvas' || !surface?.insertExcerpts) return;
        await placeExcerpts(ids, {
          draft: excerptDraft, build: entry => materialize(entry, options),
          find: id => canvasApi.current?.blocks?.().find(block => block.excerpt?.id === id)?.id || null,
          insert: blocks => canvasApi.current?.insertExcerpts(blocks, at), focus: id => canvasApi.current?.focusBlock(id),
        });
      } catch (problem) {
        toast(`${action === 'chat' ? 'Not added to chat' : 'Not added to the canvas'}: ${problem.message}`, { tone: 'error', action: { label: 'Retry', run: () => take({ action, draftIds: ids, at }) } });
      }
    };
    const onExcerpt = event => take(event.detail || {});
    // Open source from an excerpt card's footer (ExcerptCard.jsx, after its access check): the companion reader at the excerpt's
    // page and anchor; the canvas and its camera stay as they are.
    const onSource = event => {
      const ref = event.detail?.ref;
      if (!ref) return;
      if (chatWorkspace.current) chatWorkspace.current.openSource(ref);
      else if (ref.kind === 'web') openPaper({ id: ref.sourceId.slice('paper:'.length), title: ref.name, pdfUrl: null, page: ref.range.page, ...(ref.home ? { home: ref.home } : {}) });
    };
    window.addEventListener(EXCERPT_EVENT, onExcerpt);
    window.addEventListener('small:excerpt-source', onSource);
    return () => { window.removeEventListener(EXCERPT_EVENT, onExcerpt); window.removeEventListener('small:excerpt-source', onSource); };
  }, [app.name, boardName]); // eslint-disable-line react-hooks/exhaustive-deps
  // The inline AI editor (docs/features/inline-ai-editor.md): this canvas's routes - the registry's commands available
  // here (Motion only in its development build) - the same transport and auth as a / command, and its telemetry rows.
  const cadRequests = useRef(new Map());
  // /explain v2 (EXP-T20 slice 1): one job per press, its card placed at once under the job's card id. null where v2 is off
  // here (the server's 404), which keeps today's /explain; remembered so later presses do not ask again.
  const explainRequests = useRef(new Map()), explainOff = useRef(false);
  // stamp: fields the pending card carries from its maker (a Tutor activity's tutor_action and coaching, learn-coaching-materials.js).
  // thread: a promise of the chat thread the line was saved in (or its id); else this canvas's open chat thread, so a brief
  // that needs review has a place to appear. refs: ContextRef[] (refsForSend), resolved by the server, never read as given.
  const startExplain = async (prompt, { context = null, image = null, promptUsed = prompt, source = 'explicit', stamp = null, thread = null, refs = null } = {}) => {
    if (explainOff.current || !commentBoard || !prompt.trim()) return null;
    // shortcut: a line save slower than 5 s goes on without its thread (the open one, if any); the job never waits longer.
    const threadId = (await Promise.race([Promise.resolve(thread).catch(() => null), new Promise(done => setTimeout(done, 5000, null))])) || chat?.thread?.id || null;
    const payload = { prompt, requestClass: 'simple', source, ...(context ? { context: { text: context } } : {}), ...(image ? { image_context: { id: image }, image_role: 'layout_reference' } : {}),
      ...(threadId ? { threadId } : {}), ...(refs?.length ? { context_refs: refs } : {}) };
    let result;
    try { result = await submitCadOnce(explainRequests.current, JSON.stringify({ board: commentBoard, ...payload }), explainClient(api, commentBoard).create, payload); }
    catch (error) { if (explainDisabled(error)) { explainOff.current = true; return null; } throw error; }
    const blockId = canvasApi.current?.placeExplain({ ...withPrompt(explainPendingBlock({ job: result.job, prompt, threadId }), promptUsed), ...(stamp || {}) });
    return { blockId: blockId || result.job.cardId };
  };
  // EXP-T21: the Tutor (a turn's create_material, a coaching activity's material) opens the same job and card, read through a ref
  // so its long-lived callbacks see this render's canvas.
  startExplainRef.current = startExplain;
  // Ctrl+K Edit on an Explanation (EXP-T20 slice 2): an edit job bound to the card and the revision the learner saw; the card
  // shows its stage, then Current / Proposed with Apply changes and Discard (ExplainEditBar).
  const startExplainEdit = async (block, instruction) => {
    const off = 'Editing explanations is not available here yet.';
    if (explainOff.current || !commentBoard) throw new Error(off);
    const problem = explainEditProblem(block);
    if (problem) throw new Error(problem);
    const payload = explainEditRequest(block, instruction);
    let result;
    try { result = await submitCadOnce(explainRequests.current, JSON.stringify({ board: commentBoard, ...payload }), explainClient(api, commentBoard).create, payload); }
    catch (error) { if (explainDisabled(error)) { explainOff.current = true; throw new Error(off); } throw error; }
    canvasApi.current?.updateBlock(block.id, current => (explainEditProblem(current) ? null : explainEditing(current, result.job, instruction)));
    return result.job;
  };
  // promptUsed: the typed line the card keeps (card-prompt.js); the inline editor's words are the prompt itself. An edit keeps
  // none here: the server's Accept answer carries the accepted revision's words (cad-jobs.js acceptedResponse), on the card's
  // Accept, the inline editor's and after a reload alike; a rejected edit leaves the old prompt.
  const startCad = async (prompt, { context = null, cardId = null, baseRevisionId = null, promptUsed = prompt } = {}) => {
    if (!prompt.trim()) throw new Error('What would you like to create? Include dimensions or explain its purpose.');
    const destination = canvasApi.current;
    const payload={prompt,cardId,context:context || destination?.cadContext(prompt,askTarget?.id) || null,...(baseRevisionId?{baseRevisionId}:{})};
    const key=JSON.stringify({app:app.name,board:boardName,...payload});
    const result=await submitCadOnce(cadRequests.current,key,cadClient(api,app.name,boardName).start,payload);
    destination?.reconcileCad(cardId ? result.block : withPrompt(result.block, promptUsed));
    return result;
  };
  const inlineAi = (app.hosting !== 'aws' || app.app_chat) ? {
    backgroundOwnerKey: `${app.org}:${app.email || app.owner_email}`,
    prepareBackground: !board && !hole && canEditCanvas ? ({block,current}) => {
      const scope=fileScope(),ownerKey=`${app.org}:${app.email || app.owner_email}`;
      const key=`small.image-job:${JSON.stringify([ownerKey,scope.app,scope.board,block.id,block.fileRef?.source])}`;
      let savedEnvelope=null;try{savedEnvelope=JSON.parse(localStorage.getItem(key)||'null');}catch{}
      const headers=wsHeaders();
      const controller=createBackgroundRemovalController({block,scope,ownerKey,current,headers,jobClient:createImageJobClient({headers}),prepareRevision:prepareImageRevision,persistTicket:value=>localStorage.setItem(key,JSON.stringify(value))});
      return{controller,savedEnvelope,key,clear:()=>localStorage.removeItem(key)};
    } : null,
    prepareCodeRun: !board && !hole && canEditCanvas ? async ({item,input,current}) => {
      const ownerKey=`${app.org}:${app.email || app.owner_email}`,scope={app:app.name,board:boardName,sourceId:item.id};
      const key=await inlineCodeTicketKey({ownerKey,scope,code:item.text,input});
      let savedTicket=null;try{savedTicket=JSON.parse(localStorage.getItem(key)||'null');}catch{}
      return {key,savedTicket,client:createInlineCodeClient({ownerKey,scope,language:'javascript',code:item.text,input,current,headers:wsHeaders(),persistTicket:ticket=>localStorage.setItem(key,JSON.stringify(ticket))})};
    } : null,
    prepareRegional: !board && !hole && canEditCanvas ? ({block,current,initialPrompt=''}) => {
      const scope=structuredClone(fileScope()),ownerKey=`${app.org}:${app.email || app.owner_email}`,headers=wsHeaders();
      const key=`small.image-region-job:${JSON.stringify([ownerKey,scope.app,scope.board,block.id,block.fileRef?.source])}`;
      let savedEnvelope=null;try{savedEnvelope=JSON.parse(localStorage.getItem(key)||'null');}catch{}
      const check=()=>{const now=current();if(now.ownerKey!==ownerKey||now.readOnly||now.locked||JSON.stringify(now.scope)!==JSON.stringify(scope)||JSON.stringify(now.block)!==JSON.stringify(block))throw Error('The image or its permissions changed.');};
      const read=async signal=>{check();const original=await readRegionalOriginal({block,scope,headers,signal});check();return original;};
      return {key,savedEnvelope,read,initialPrompt,clear:()=>localStorage.removeItem(key),prepare:edit=>({savedEnvelope,controller:createRegionalImageEditController({block,scope,ownerKey,current,edit,headers,jobClient:createImageJobClient({headers}),prepareRevision:prepareImageRevision,persistTicket:value=>localStorage.setItem(key,JSON.stringify(value)),prepareMask:async({edit,signal})=>{
        const original=await read(signal),blob=await regionalMaskBlob(edit.region,original.width,original.height);check();signal.throwIfAborted();
        const stored=await uploadSource(new File([blob],'regional-mask.png',{type:'image/png'}),{app:scope.app,board:scope.board,family:'image'});
        check();signal.throwIfAborted();return{maskSourceId:stored.source.id,maskSha256:stored.source.rev};
      }})})};
    } : null,
    repositoryEvidence: isRepository && !board && !hole && repository?.canEdit && /^[a-f0-9]{40}$/.test(repositoryContext?.commit || repository?.commit || '') ? {scope:{app:app.name,repo:app.repo,commit:repositoryContext?.commit || repository.commit},headers:wsHeaders(),onOpenSource:ref=>openCanvasFile(ref.path,ref.start,ref.end,ref)} : null,
    verifySourceReadings: !board && !hole && canEditCanvas ? options => verifySourceReadings({...options,headers:wsHeaders()}) : null,
    verifyExtraction: !board && !hole && canEditCanvas ? options => verifyExtractionRead({...options,headers:wsHeaders()}) : null,
    imageScope: () => !board && !hole && canEditCanvas ? fileScope() : null,
    prepareImage: !board && !hole && canEditCanvas ? options => prepareImageRevision({...options,headers:wsHeaders(),upload:uploadSource}) : null,
    retainImageSources: list => {
      if(board || hole || !canEditCanvas)return false;
      let next=sourcesRef.current;
      for(const source of list)next=withRetainedSource(next,source);
      sourcesRef.current=next;setSources(next);return true;
    },
    cad: startCad,
    explainEdit: startExplainEdit,
    explainCreate: explainLatest, // a command-bearing Ctrl+K /explain (EXP-T20 slice 3): the same job and card; null where v2 is off
    cadRead: id => cadClient(api,app.name,boardName).get(id),
    cadAction: async (id,action,body) => {
      const destination=canvasApi.current;
      const result=await cadClient(api,app.name,boardName).action(id,action,body);
      destination?.reconcileCad(result.block);
      return result;
    },
    transport: httpTransport({ app: app.name, pending: askScope.pending || null, board: boardName, fetchRaw: apiFetch, post: (path, body, options) => api(path, { ...options, method: 'POST', body: JSON.stringify(body) }) }),
    // internal: Ctrl+K's automatic routing still makes comparisons and walkthroughs from plain words (owner, 2026-10-20), though
    // /compare and /walkthrough are no longer typed commands (its / list is the registry's user commands, inline-ai-command.js).
    enabled: ['note', 'equation', ...commandsFor('learn', { internal: true }).filter(available).map(command => command.name).filter(name => INLINE_ROUTES[name] || EXPLICIT_ROUTES[name])],
    // Ctrl+K's proposed capabilities (proposal-capabilities.js; /motion first, MOT-20b): the Chat's own command turn about Ctrl+K's
    // selection, so it is proposed on the same shared card as the composer's; nothing starts here. Answers false where this
    // build does not offer the command or the Chat cannot take the turn.
    propose: async (command, args, about = {}) => { const live = chatWorkspace.current; if (!isLearnCommand(command) || !live?.ask) return false; live.panels?.openChat?.(); return (await live.ask({ prompt: args, command, about })) !== false; },
    // Current Chat's live transcript and deliberately attached source metadata support the selected edit.
    // The existing context builder budgets these separately from the complete editable target. A listed reference
    // is not source-text coverage; TOC has its own conversation and is never inherited here.
    extras: () => ({
      title: app.title || '',
      conversation: (chat?.thread?.restore.messages || [])
        .filter(message => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
        .map(message => ({ role: message.role, text: message.content })),
      sources: (chat?.context?.attached || []).map(ref => ({
        kind: ref.kind, title: ref.name || '', sourceId: ref.sourceId, range: ref.range || null, coverage: 'listed',
      })),
    }),
    // Ctrl+K's /youtube /arxiv /wikipedia: the shared source finder (B3), origin from the editor so focus returns there.
    openSearch: ({ source, query, origin }) => openSourceFinder({ source, query, origin }),
    sendTelemetry: rows => { apiFetch('/api/learn/inline/telemetry', { method: 'POST', body: JSON.stringify({ app: app.name, ...(askScope.pending ? { pending: askScope.pending } : {}), rows }) }).catch(() => {}); },
  } : null;
  // The board revision the server last answered (boardVersion below, mirrored for render): Tutor decision telemetry only
  // (Professor Next Steps contract §1.7, identity.canvas_version).
  const [canvasVersion, setCanvasVersion] = useState(null);
  // Graded canvas answers so far: a Professor Next Steps basis trigger (contract §2.3), bumped as gradeCanvasAnswer resolves.
  const [graded, setGraded] = useState(0);
  // /dive: nested Rabbit Holes from the selected card (docs/features/dive-v1.md). A hole opened on an active journey
  // carries its journey context (LP1 Task 14); `journey` (below) is read when the dive starts, not during render.
  // ponytail: a hole inside a journey hole carries no journey (the hole board has no live journey of its own); hand the
  // record's journey down when nested journey holes need their cause too.
  const dive = useDive({ app, board: boardName, hole, canvasApi, canvasState, baseFor: name => `small.adaptive-canvas:${app.org}:${app.email || app.owner_email}:${name}`, onTitle: title => saveTitle(title), referent: () => exchangesRef.current.at(-1)?.question || '', journeyContext: block => journeyDiveContext(journey.journey, journey.path, block), entryControls: () => (chat?.coaching ? effectiveControls(chat.coaching, chat.thread) : null) });
  // Learning journeys (LearnJourney.jsx) on Learn canvases: its tray sits in the Chat composer, and a broad intent starts
  // one while the board has none. Not on repository apps (the route refuses them; the supplied nanoGPT course is one) nor
  // on a pending hole, which has no canvas row yet.
  const journey = useJourney({ app, board: boardName, access: askScope, canvasApi, enabled: learnPreview && isCanvas && !hole });
  // Tutor v1 on the NanoGPT Attention slice and its holes (LearnTutor.jsx).
  // The composer is the Tutor on a registered course with a Tutor (learn-tutor-domains.js; the supplied NanoGPT course,
  // owner 2026-10-04) when this is the app's own canvas, and in the Rabbit Holes under it. On a
  // canvas with a live journey it is Tutor v2 with the journey domain, for typed and voice turns and the follow-ups typed
  // in a canvas block (renderBlockComposer), with that block as the target (LP1 Task 12, D1, D6).
  // repository: a detached repository source is honoured by the Tutor's handoff too, as by Learn chat (contract §4.7.2).
  // ponytail: no openResearch until a Home/Library Research entry can take a seeded request; until then the Tutor offers no
  // Research this (contract §4.5).
  // Q5 (integrator ruling, owner 3a): the Tutor's proactive actions read the learner's current controls when a turn is planned
  // and again before anything applies (learn-tutor.js heldActions). A canvas without coaching state coaches nothing on its own.
  // A turn is the learner's own interaction (typed, spoken in Voice Mode or in a card's composer), so Chat counts as open, as
  // the hooks' allowed reads it below.
  const coachNow = useRef(null);
  coachNow.current = kind => !!chat?.coaching && mayRun(kind, effectiveControls(chat.coaching, chat.thread), { chatOpen: true, ready: ['ready', 'local'].includes(chat.coaching.status) });
  const coaching = useCallback(kind => coachNow.current(kind), []);
  const tutor = useTutor({ app, board: boardName, access: askScope, canvasApi, canvasState, dive, courseCanvas: learnPreview && !board, journey, canvasVersion, repository: repoAttached && canvasRepository(app), describe: describeBlock, canvasContext, coaching, startExplain: explainLatest });
  // Professor Next Steps (docs/features/professor-next-steps.md §1.7): the hooks mount only with Rabbit Hole on and a Chat
  // composer, never on a review board; a click opens Chat and goes through its AskPanel (nextStepRef, chatAskProps).
  const nextStepsHere = learnPreview && (app.hosting !== 'aws' || !!app.app_chat) && !(reviewTools && board);
  // Owner 3a: hooks are proactive, so they ask only in selected, enabled, unpaused Tutor with Chat open (LearnNextSteps.jsx).
  const hooksCoaching = { allowed: !!chat?.coaching && canCoach(effectiveControls(chat.coaching, chat.thread), { chatOpen: true, ready: ['ready', 'local'].includes(chat.coaching.status) }), visible: panels.chatOpen };
  const nextStepSend = useRef(null);
  // The path rail's upcoming section whose purpose is open (a click on it never generates anything, §8).
  const [openEntry, setOpenEntry] = useState(null);
  // The board path whose saved board the canvas holds: the server's copy may replace this browser's (canvasEpoch) when
  // the board GET lands, so until then the canvas may be an empty stand-in.
  const [restoredBoard, setRestoredBoard] = useState(null);
  // Voice Mode wherever the Tutor is (docs/features/voice-tutor-mvp.md §6b): the Chat composer's mic, the left caption.
  // A selected card stays the context after a voice turn too, as after a typed one (ask.jsx); a region or group rides once.
  const voice = useVoiceSession({ tutor, app, access: askScope, targetId: askTarget?.id, onTargetUsed: () => { if (!askTarget?.card) clearAskTarget(); } });
  const voiceOn = !!voice && voice.state !== 'off';
  const boardStorageKey = board ? `${canvasKey}:${board}:s${BOARD_SEED_VERSIONS[board] ?? 0}` : `${canvasKey}:ink`;
  const boardPath = `/api/learn/boards/${encodeURIComponent(app.name)}/${encodeURIComponent(boardName)}`;
  // A Rabbit Hole from a PDF excerpt card opens on a copy of that card (Dive.jsx seed), placed once the hole's board has loaded.
  useEffect(() => {
    const seed = hole?.seed, surface = canvasApi.current;
    if (!seed?.excerpt || restoredBoard !== boardPath || !surface?.insertBlock) return;
    if (!(surface.blocks?.() || []).some(block => block.excerpt?.id === seed.excerpt.id)) surface.insertBlock(seed);
  }, [restoredBoard, boardPath]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sharing, setSharing] = useState(null);
  // Comments (docs/features/canvas-comments.md): keyed by the main board's id, which the owner's board reads return.
  const [commentBoard, setCommentBoard] = useState(null);
  const commentBoardRef = useRef(null);
  commentBoardRef.current = commentBoard;
  const openComments = useCallback(() => { setPanelOpen(true); setPanelTab('comments'); }, []);
  const commentsShown = panelOpen && panelTab === 'comments';
  const comments = useCanvasComments({ base: commentBoard && memberBase(commentBoard), enabled: isCanvas && !hole && boardName === 'main', openPanel: openComments, canvasApi, link: commentBoard && `/c/${commentBoard}`, shown: panelOpen && panelTab === 'comments' });
  useEffect(() => { if (!comments.active && panelTab === 'comments') setPanelTab('chat'); }, [comments.active, panelTab]); // eslint-disable-line react-hooks/exhaustive-deps
  // Canvas references (C:/s/spec/references-plan.md): the board's links feed Search's Links results and the cards' chips; the
  // picker opens from a card's menu ({ blockId }), the empty canvas ({ point }) or Insert ({}). Same-tab link
  // navigation saves first. A save that changed the links refreshes them (the server indexes the saved board).
  const [refPick, setRefPick] = useState(null);
  const links = useCanvasLinks({ boardId: commentBoard, shown: panelOpen && panelTab === 'find' });
  // A /c/ href is a member page, outside AppRoot: a full load, after the save.
  const refLinks = useMemo(() => ({ resolve: links.resolve, go: async href => { const saving = canvasApi.current?.persist?.(); if (!href.startsWith('/c/')) return navigate(href); await saving; window.location.assign(href); }, onRemove: (blockId, refId) => canvasApi.current?.removeRef?.(blockId, refId) }), [links.resolve]);
  const savedRefs = useRef(null);
  // The course interview (Edit course) still lives under the Table of contents tab, so starting one brings that tab forward.
  useEffect(() => { if (setupChat) setPanelTab('toc'); }, [setupChat]); // eslint-disable-line react-hooks/exhaustive-deps
  // Owner brief 2026-10-16 item 7: the Table of contents has its own conversation (TocConversation, TocWorkspace's thread), not
  // Chat's composer docked. Coming back to the tab puts the contents where they were scrolled (a hidden tab loses its scroll).
  // The learning goal under the contents' heading: the learner's accepted goal record, never the latest planning message
  // ("rename section 2" cannot replace it). Tutor Task 11, draft acceptance 52, superseding the lead ruling of 2026-10-16 that
  // showed the TOC conversation's latest request (owner decision 2a). No accepted goal, nothing shown.
  const coachingState = chat?.coaching?.state;
  const tocGoal = coachingState?.goals?.find(goal => goal.goalId === coachingState.activeGoalId)?.label || null;
  // Task 11: the accepted plan beside the outline (learn-outline-model.js outlinePlan), all of it this learner's own: their
  // journey, its goal's criteria, and the canvas headings read for their journey stamps only. A proposal carries the plan
  // revision it was asked on (boardContext.planRevision) and applies only while it still holds.
  const journeyGoal = journey.journey?.id ? coachingState?.goals?.find(goal => goal.journeyId === journey.journey.id) || null : null;
  const tocPlan = outlinePlan({ headings: (canvasApi.current?.blocks?.() || []).filter(block => block.type === 'heading'), journey: journey.journey, path: journey.path, goal: journeyGoal });
  const planRevision = planRevisionOf(journey.journey, journey.path);
  const planRevisionRef = useRef(planRevision);
  planRevisionRef.current = planRevision;
  // Start/Resume of the current step (draft: a separate explicit action from navigating a title): start_guided clears Suggestions
  // paused only in selected, enabled Tutor and changes nothing in Auto, Ask or Off; then its section and Chat come forward.
  // No model call and no goal change.
  const resumeFromToc = () => {
    chat.coaching?.dispatch({ type: 'start_guided' });
    if (tocPlan.learningNow?.headingId) canvasApi.current?.showSection(tocPlan.learningNow.headingId);
    panels.openChat();
    chat.composer?.focus?.();
  };
  const tocPanel = useRef(null), tocScroll = useRef(0); // the tabpanel's onScrollCapture keeps the contents' scrollTop
  useLayoutEffect(() => {
    const list = panelOpen && panelTab === 'toc' && tocPanel.current?.querySelector('[data-toc]');
    if (list) list.scrollTop = tocScroll.current;
  }, [panelOpen, panelTab]);
  // ?share=1 (the Library's Share / Manage link) opens this canvas's Share panel once; the query is dropped at once.
  const [shareOpen, setShareOpen] = useState(() => new URLSearchParams(window.location.search).get('share') === '1');
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('share') !== '1') return;
    url.searchParams.delete('share');
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
  }, []);
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
  // Unpinned, a press on the canvas surface closes the panel. A native listener on the frame, so a card's own
  // pointer handlers cannot swallow the press first; a link that opens a reader stops it in capture and stays open.
  // Never on the Chat tab: Chat stays usable while canvas objects are selected (owner brief 2026-10-13 13.8). Nor on
  // Context, which was the separate Sources pane this press never closed (pages are picked on the canvas beside it).
  useEffect(() => {
    const frame = canvasFrame.current;
    if (panelPinned || !panelOpen || panelTab === 'chat' || panelTab === 'context' || !frame) return undefined;
    const close = event => { if (event.target.closest?.('[data-canvas-surface]')) setPanelOpen(false); };
    frame.addEventListener('pointerdown', close);
    return () => frame.removeEventListener('pointerdown', close);
  }, [panelPinned, panelOpen, panelTab]); // eslint-disable-line react-hooks/exhaustive-deps
  const sharingRef = useRef(null);
  sharingRef.current = sharing;
  const boardVersion = useRef(null);
  // The board's server state (docs/features/canvas-persistence.md): its GET answered, so a PUT knows the version it is
  // based on; the boardText the server holds at boardVersion; an edit not on the server yet (offline, or refused); a 409,
  // which stops pushing until reload; and the last refusal shown, so an over-cap board says so once, not on every edit.
  const boardLoaded = useRef(false), boardSynced = useRef(null), boardUnsynced = useRef(false), boardStopped = useRef(false), boardRefused = useRef(null);
  // After a 409: the board text the server held before it (conflictBaseKey), and the recoveries since the last save (refused).
  const conflictBase = useRef(null), recoveries = useRef(0);
  // The canvas's document (docs/features/blocknote-canvas.md). Canvas or Editor, this browser's choice for this person and
  // canvas (owner decision B1); the save status of the board that holds it (Saving / Saved / Couldn't save, the server's
  // answer, never assumed); its size against the server's 1.9 MB; a 409 (this canvas changed elsewhere) and a document a
  // newer server copy replaced on open, both kept and offered back, never dropped.
  const [docView, setDocViewState] = useState(() => readDocView(browserStorage(), canvasKey));
  useEffect(() => { setDocViewState(readDocView(browserStorage(), canvasKey)); }, [canvasKey]);
  const setDocView = view => { writeDocView(browserStorage(), canvasKey, view); setDocViewState(view === 'editor' ? 'editor' : 'canvas'); };
  const [saveState, setSaveState] = useState(null);
  useEffect(() => {
    if (saveState?.state !== 'saved') return;
    const now = JSON.stringify(canvasApi.current?.liveRefs?.() || []);
    if (savedRefs.current !== null && now !== savedRefs.current) links.refresh();
    savedRefs.current = now;
  }, [saveState]); // eslint-disable-line react-hooks/exhaustive-deps
  const [boardChars, setBoardChars] = useState(0);
  const [docConflict, setDocConflict] = useState(false);
  const [docRestore, setDocRestore] = useState(null);
  const docKeepKey = `${boardStorageKey}:doc-keep`;
  useEffect(() => { setSaveState(null); setBoardChars(0); setDocConflict(false); setDocRestore(null); }, [boardPath]);
  const exchangesRef = useRef(exchanges);
  exchangesRef.current = exchanges;
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const versionKey = `${boardStorageKey}:v`;
  // The sources list rides with the main board (canvas-persistence.md); a review board has none of its own.
  // An unreadable copy (blocked storage, a value that is not a board) throws: it is never saved or shared as an empty board
  // over the server's content (follow-up R3 item 3). The save says so instead (refused, below).
  const boardSnapshot = () => {
    const state = readBoardCopy(browserStorage(), boardStorageKey);
    if (!state) throw Object.assign(new Error(UNREADABLE_COPY), { unreadable: true });
    return { ...state, exchanges: exchangesRef.current, ...(board ? {} : { sources: sourcesRef.current }) };
  };
  // Board files follow the board: this page's cards read the server copy when
  // this browser has none, and once the board is on the server, any file not yet uploaded goes up.
  useEffect(() => {
    setRemoteAssets(key => fetch(`${boardPath}/assets/${encodeURIComponent(key)}`, { headers: wsHeaders() }));
    setFileScope({ app: app.name, board: boardName }); // imported files read through this board (file-source-client.js)
    // Notebook workspaces: saved once the board has its server row (a review board: while shared or published), and
    // not after a 409; loaded only into an empty workspace (this owner on another browser), never over local files.
    const workspaceUrl = id => `${boardPath}/assets/${encodeURIComponent(`notebook:${id}`)}`;
    setWorkspaceStore({
      load: id => fetch(workspaceUrl(id), { headers: wsHeaders() }).then(response => (response.ok ? response.json() : null)).catch(() => null),
      save: (id, files) => ((!board || sharingOf(sharingRef.current) === 'shared') && boardVersion.current != null && !boardStopped.current
        ? fetch(workspaceUrl(id), { method: 'PUT', body: JSON.stringify(files), headers: { 'Content-Type': 'text/x-cached-string', 'X-Asset-Kind': 'string', ...wsHeaders() } }).catch(() => null)
        : null),
      fresh: false,
    });
    return () => { setRemoteAssets(null); setWorkspaceStore(null); setFileScope(null); };
  }, [boardPath]);
  const uploadedAssets = useRef(null);
  const refusedAssets = useRef(new Set()); // board files the server refused: said once per open
  useEffect(() => { uploadedAssets.current = null; refusedAssets.current = new Set(); }, [boardPath]);
  // Runs after a board PUT, so the board has its server row.
  const [assetQueue] = useState(serial);
  const syncAssets = () => assetQueue(async () => {
    let complete = true;
    try {
      if (!uploadedAssets.current) uploadedAssets.current = new Set((await api(`${boardPath}/assets`)).keys);
      for (const key of assetKeysOf(boardSnapshot())) {
        if (uploadedAssets.current.has(key)) continue;
        const value = await cachedAsset(key);
        if (value == null) { complete = false; continue; }
        const blob = typeof value === 'string' ? new Blob([value], { type: 'text/x-cached-string' }) : value;
        // The server's own cap for this type (file-capabilities.js): 50 MiB for a video, 25 MiB otherwise.
        const limit = boardFileLimit(blob.type).bytes;
        if (refusedAssets.current.has(key)) { complete = false; continue; }
        if (blob.size > limit) { toast(`${blob.name || 'A file'} is over ${formatBytes(limit)}, so it was not saved to your account and stays only in this browser.`); refusedAssets.current.add(key); complete = false; continue; }
        const response = await fetch(`${boardPath}/assets/${encodeURIComponent(key)}`, {
          method: 'PUT', body: blob,
          headers: { 'Content-Type': blob.type || 'application/octet-stream', ...(typeof value === 'string' ? { 'X-Asset-Kind': 'string' } : {}), ...wsHeaders() },
        });
        if (response.ok) uploadedAssets.current.add(key);
        else {
          complete = false;
          // A refusal (too large, not the type it claims) says why once; any other failure retries after the next save.
          if ([413, 415].includes(response.status)) { refusedAssets.current.add(key); toast(`${blob.name || 'A file'}: ${(await response.json().catch(() => ({}))).error || 'it was not saved to your account'}`, { tone: 'error' }); }
        }
      }
    } catch { complete = false; /* tried again after the next save */ }
    return complete;
  });
  // A pending Rabbit Hole has no canvas row, so its board GET is refused; once its first object keeps it, ask again.
  const [boardLoad, setBoardLoad] = useState(0);
  useEffect(() => { if (hole && !dive.pending) setBoardLoad(load => load + 1); }, [dive.pending]); // eslint-disable-line react-hooks/exhaustive-deps
  // Hydration (docs/features/canvas-persistence.md, Load): the canvas has rendered this browser's copy; the server's answer
  // decides. None: this browser's content becomes its first server copy (version 1; saveOwn moves no updated_at). Newer
  // than this browser's base: it replaces this browser's copy. The same version: edits made here since (offline) go up.
  useEffect(() => {
    let live = true;
    boardLoaded.current = false; boardSynced.current = null; boardStopped.current = false;
    // Read now, before the canvas writes its first copy over a value it could not read (AdaptiveCanvas, 400 ms after mount):
    // an unreadable copy or version is never proof this browser's copy is current, so the server's copy decides.
    const storage = browserStorage();
    const unreadable = readBoardCopy(storage, boardStorageKey) === null || readBoardVersion(storage, versionKey) === null;
    api(boardPath).then(data => {
      if (!live) return;
      setSharing(data.sharing);
      setCommentBoard(data.board_id || null);
      boardLoaded.current = true;
      // Empty keys are not a copy: the canvas writes them on mount, before a slow reply lands.
      const hasLocal = hasLocalContent(storage, { ink: boardStorageKey, chat: chatKey });
      if (!storage || blockedStorage.includes('localStorage')) toast(UNKEPT, { tone: 'error' });
      if (data.exists === false) {
        boardVersion.current = null; setCanvasVersion(null);
        if (hasLocal) pushBoard(null, { now: true });
        return;
      }
      boardVersion.current = data.version; setCanvasVersion(data.version);
      boardSynced.current = boardText(data.state);
      const mine = readBoardVersion(storage, versionKey);
      if (!unreadable && mine !== null && data.version <= mine) {
        try { localStorage.removeItem(docKeepKey); localStorage.removeItem(conflictBaseKey(boardStorageKey)); } catch { /* nothing to keep: this browser's copy is the newest */ }
        conflictBase.current = null;
        if (boardText(boardSnapshot()) !== boardSynced.current) pushBoard();
        return;
      }
      let { exchanges: chats, sources: list, ...state } = data.state || {};
      // After a 409 (conflictBaseKey; owner 2026-10-22): the edits made here since the server's copy this browser last had,
      // here or before a reload or a canvas switch, go onto the server's newer copy below instead of being replaced by it.
      let base;
      try { const text = conflictBase.current ?? localStorage.getItem(conflictBaseKey(boardStorageKey)); base = text ? boardFromText(text) : undefined; } catch { base = undefined; }
      conflictBase.current = null;
      if (base && Array.isArray(chats)) {
        const known = new Set([...(base.exchanges || []), ...chats].map(entry => entry?.id));
        const asked = (exchangesRef.current || []).filter(entry => entry?.id != null && !known.has(entry.id));
        if (asked.length) { chats = [...chats, ...asked]; setTimeout(() => pushBoard(), 0); }
      }
      try {
        // ponytail: what the server copy replaces is kept under :replaced when it held other content, so content that never
        // reached the server is recoverable by hand; only its document has a restore action (below), the rest has no UI.
        const copy = readBoardCopy(storage, boardStorageKey);
        // The canvas on screen is about to be remounted on the server's copy: retired, nothing it still has pending may write
        // over that copy or push it; it answers what was made on it since mount, the document as typed included
        // (board-empty-report). Its board work goes onto the server's copy below; its document is this browser's document
        // that the server's replaces, so docOnServerCopy keeps it aside and offers it back (Restore my unsaved document).
        const mine = canvas()?.retire?.(base) || {};
        const local = hasLocal && copy && boardText(boardSnapshot()) !== boardSynced.current ? boardSnapshot() : null;
        // After Reload and keep my document, the document kept at that press goes over the server's board; words typed while
        // that reload ran are newer still, so the canvas's live document is the one kept. Otherwise it is the document the
        // server's replaces, kept aside and offered back.
        const keptAtPress = JSON.parse(localStorage.getItem(docKeepKey) || 'null');
        // After a 409, a document only this browser changed since the base goes up as the newer edit (conflictDoc).
        const ownDoc = base ? conflictDoc({ base, server: state, mine: mine.doc }) : null;
        const replaced = mine.doc && !keptAtPress && !ownDoc ? { ...(local || {}), doc: mine.doc } : local;
        // The document (blocknote-canvas.md): Reload and keep my document (after a 409) puts this browser's document over
        // the newer server copy as the newer edit, pushed below. Whatever document loses - the server's then, this
        // browser's on a plain open - is kept under :replaced and offered back (docOnServerCopy).
        const kept = keptAtPress && mine.doc ? mine.doc : keptAtPress || ownDoc;
        const next = docOnServerCopy(state, { kept, replaced });
        if (next.replaced) localStorage.setItem(`${boardStorageKey}:replaced`, JSON.stringify(next.replaced));
        // What was made on the canvas while the board loaded is added to the server's copy and pushed, so neither the server's
        // content nor that work is lost.
        const work = withPendingWork(next.state, mine);
        localStorage.setItem(boardStorageKey, JSON.stringify(work.state)); localStorage.setItem(versionKey, String(data.version));
        localStorage.removeItem(conflictBaseKey(boardStorageKey));
        if (work.count) setTimeout(() => pushBoard(), 0);
        const where = base ? 'here' : 'while this board loaded';
        if (work.conflicts) toast(`${work.conflicts === 1 ? `A card you changed ${where} was` : `${work.conflicts} cards you changed ${where} were`} also changed elsewhere. Both versions are on the canvas.`);
        localStorage.removeItem(docKeepKey);
        if (next.push) setTimeout(() => pushBoard(), 0);
        if (next.offer) setDocRestore(next.offer);
      } catch { /* keep the local copy */ }
      if (Array.isArray(chats)) setExchanges(chats);
      if (!board && Array.isArray(list)) setSources(list);
      setCanvasEpoch(epoch => epoch + 1);
      // A Rabbit Hole just started from a shared canvas opens on its one anchor card (docs/features/shared-canvas-rabbit-hole.md).
      const startedFromShare = data.version === 1 && data.state?.blocks?.[0]?.anchor?.source === 'shared';
      toast(base ? CONFLICT_MERGED : data.forked ? 'Your fork is ready. It is yours to edit.' : startedFromShare ? 'Your Rabbit Hole is ready. It is private to you.' : 'You are seeing the latest saved version of this board.');
    }).catch(error => { if (live) setSharing(error.status === 404 ? (error.data?.sharing || { shared: false }) : { unavailable: error.message }); })
      .finally(() => { if (live) setRestoredBoard(boardPath); });
    return () => { live = false; };
  }, [boardPath, boardLoad]);
  // The journey's section materializer reads the canvas for a section an earlier visit drew (ruling C-3): only once the
  // board is restored and the canvas has reported (onCanvasState runs after it published canvasApi), never an empty
  // canvas before the restore, which would get a second heading. canvasReady acts once per board.
  useEffect(() => { if (restoredBoard === boardPath) journey.canvasReady?.(); }, [restoredBoard, boardPath, canvasState, journey.canvasReady]);
  // Accepted jobs survive a tab closing before the pending card's first board save.
  useEffect(() => {
    if(restoredBoard!==boardPath || !canvasApi.current)return;
    let live=true;
    cadClient(api,app.name,boardName).list().then(result=>{if(live)for(const block of result.blocks || [])canvasApi.current?.reconcileCad(block);}).catch(problem=>{if(live && problem.status!==503)toast(`CAD status could not be restored: ${problem.message}`);});
    return()=>{live=false;};
  },[restoredBoard,boardPath]);
  // card=<objectId>, a backlink's origin card (C:/s/spec/references-plan.md, URLs): once the final board is on the canvas
  // (as above), that card is shown - in Canvas view, the document kept - or, gone, a toast and nothing selected; the param
  // is dropped either way.
  const cardFocus = useRef(cardParam(window.location.search));
  useEffect(() => {
    const id = cardFocus.current, api = canvasApi.current;
    if (!id || restoredBoard !== boardPath || !api) return;
    cardFocus.current = null;
    window.history.replaceState(window.history.state, '', withoutCardParam(window.location.href));
    if (!api.blocks().some(block => block.id === id)) { api.deselect(); toast(CARD_GONE); return; }
    if (docView !== 'editor') { api.focusBlock(id); return; }
    setDocView('canvas');
    requestAnimationFrame(() => requestAnimationFrame(() => canvasApi.current?.focusBlock(id)));
  }, [restoredBoard, boardPath, canvasState]); // eslint-disable-line react-hooks/exhaustive-deps
  // Card thumbnails (card-thumbnails.md): the main board's picture for its cards, drawn after its saves pause, never by AI.
  // A board with none yet (made before thumbnails, a fork) gets one shortly after it opens.
  const thumbs = useRef(null);
  useEffect(() => {
    if (board || boardName !== 'main') return undefined;
    const name = app.name;
    const scheduler = thumbs.current = canvasThumbnail({
      name,
      capture: () => canvasApi.current?.thumbnail?.() ?? null,
      put: blob => api(`${boardPath}/thumbnail`, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } }),
    });
    fetch(`${boardPath}/thumbnail`, { method: 'HEAD', credentials: 'same-origin' }).then(r => { if (r.status === 204) scheduler.saved('none yet'); }, () => {});
    return () => { scheduler.stop(); if (thumbs.current === scheduler) thumbs.current = null; };
  }, [boardPath]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the canvas (to Home, or to another canvas: callers key this page by canvas, so it unmounts): its last change
  // is drawn now under this canvas's name, in a layout cleanup, which runs while the canvas is still in the page (a passive
  // one runs after it is gone). The live board, as boardUnsaved reads it, so an edit still inside the canvas's 400 ms
  // browser save or this page's 1.5 s server save counts; that save goes up after this.
  const leaveThumb = useRef(null);
  leaveThumb.current = () => {
    let text;
    try {
      const now = canvas()?.boardNow?.();
      text = boardText(now ? { ...now, exchanges: exchangesRef.current, ...(board ? {} : { sources: sourcesRef.current }) } : boardSnapshot());
    } catch { /* no readable copy: only a save already made is drawn */ }
    thumbs.current?.flush(boardLoaded.current && text !== boardSynced.current ? text : undefined);
  };
  useLayoutEffect(() => () => leaveThumb.current(), []);
  const pushTimer = useRef(null);
  // One PUT of this browser's board, run inside pushQueue: based on the version the server last answered, or 0 when it
  // had none (so a row made meanwhile elsewhere is a 409, never overwritten); none at all when the server already holds
  // this content. The board's first server copy asks the notebook cards for their workspaces, as sharing does.
  const saveBoard = async () => {
    const state = boardSnapshot(), text = boardText(state), first = boardVersion.current == null;
    setBoardChars(text.length);
    if (text !== boardSynced.current) {
      const saved = await api(boardPath, { method: 'PUT', body: JSON.stringify({ state, version: boardVersion.current ?? 0 }) });
      boardVersion.current = saved.version; setCanvasVersion(saved.version);
      if (saved.board_id) setCommentBoard(saved.board_id);
      boardSynced.current = text;
      recoveries.current = 0;
      thumbs.current?.saved(text);
      try { localStorage.setItem(versionKey, String(saved.version)); } catch { /* the next open re-checks */ }
      if (first) requestWorkspaceExports();
    }
    boardUnsynced.current = false;
    boardRefused.current = null;
    // Saved only when this answer covers the document as shown: words not in the snapshot keep Saving… until the PUT that
    // carries them answers (the editor's pause always ends in setDoc, the canvas's save, then pushBoard and another saveBoard).
    const shown = canvas()?.liveBoard?.();
    setSaveState(!shown || docSaved(state.doc, shown.doc) ? { state: 'saved' } : { state: 'saving' });
    try { localStorage.removeItem(unsavedKey({ ink: boardStorageKey })); } catch { /* the cards read it as unsaved */ }
  };
  // A refused PUT keeps this browser's copy and says why (canvas-persistence.md). No status: offline, so it waits for the
  // reconnect. 409: another tab or device saved since, so pushing stops until reload. Anything else (over 1.9 MB): the
  // server's own words, once, and the next edit tries again; Home and the Library keep calling it browser-only (step 8).
  const refused = error => {
    // 409 (owner 2026-10-22: a conflicting save never loses either device's edits): the server's newer copy loads, this
    // browser's edits since the copy it had go onto it (Load, conflictBaseKey) and that board is pushed. The document is one
    // object, so a document changed here goes to the person as before (decision 3: [data-doc-conflict], Reload and keep my
    // document), as does a fourth 409 without a save in between; the base is kept for that reload too.
    if (error.status === 409) {
      conflictBase.current = boardSynced.current ?? boardText({});
      try { localStorage.setItem(conflictBaseKey(boardStorageKey), conflictBase.current); } catch { /* kept in memory for this page */ }
    }
    const docChanged = error.status === 409 && JSON.stringify(boardSnapshot().doc ?? null) !== JSON.stringify(boardFromText(conflictBase.current).doc ?? null);
    if (error.status === 409 && !docChanged && recoveries.current < 3) {
      recoveries.current += 1;
      boardStopped.current = true;
      setSaveState({ state: 'saving' });
      setBoardLoad(load => load + 1);
      return;
    }
    boardUnsynced.current = true;
    setSaveState({ state: 'error', status: error.status || 0, unreadable: !!error.unreadable, message: error.status === 413 ? 'Not saved: this canvas is over the 1.9 MB limit. Remove large images or long content, then retry.' : error.status === 409 ? 'Not saved: this canvas changed elsewhere.' : error.status || error.unreadable ? error.message : 'Not saved yet: offline. It saves when you are back online.' });
    if (error.status === 409) setDocConflict(true);
    if (!error.status && !error.unreadable) return;
    if (error.status === 413) try { localStorage.setItem(unsavedKey({ ink: boardStorageKey }), '1'); } catch { /* not kept */ }
    if (error.status === 409) {
      boardStopped.current = true;
      toast('This board changed in another tab or on another device. Reload to see those changes; your newer edits here are not saved.', { tone: 'error' });
    } else if (boardRefused.current !== error.message) toast(error.message, { tone: 'error' });
    boardRefused.current = error.message;
  };
  // The board's server copy, 1500 ms after the last change. `now` (the canvas's persist(), LP1 Task 15): the PUT at once,
  // awaited, 'ok' or 'failed' - a journey section is recorded only once the server has its board. Until the board GET has
  // answered (or after a 409) the edit waits in this browser and an immediate push fails.
  // Every PUT goes through one serial queue (canvas-persist.js; review round 1, C-15a) and reads boardVersion only once
  // the PUT before it wrote it, so a section save's PUT and the canvas's debounced one never 409 each other.
  const [pushQueue] = useState(serial);
  const pushBoard = useCallback((_state, { now = false } = {}) => {
    const how = sharingOf(sharingRef.current);
    if (board && how !== 'shared') return now && how === 'unknown' ? 'failed' : 'skipped';
    if (!boardLoaded.current || boardStopped.current) { boardUnsynced.current = true; return now ? 'failed' : undefined; }
    clearTimeout(pushTimer.current);
    setSaveState(previous => (previous?.status === 409 ? previous : { state: 'saving' }));
    const put = () => pushQueue(async () => {
      if (boardStopped.current) return 'failed';
      try { await saveBoard(); } catch (error) { refused(error); return 'failed'; }
      if (now) return await syncAssets() ? 'ok' : 'failed';
      syncAssets();
      return 'ok';
    });
    if (now) return put();
    pushTimer.current = setTimeout(put, 1500);
  }, [boardPath]);
  useEffect(() => { pushBoard(); }, [exchanges, sources, pushBoard]);
  // Reload and keep my document (a 409, blocknote-canvas.md): this browser's document - its unsaved words written first -
  // is put aside, the server's newer board loads (the board GET), and the kept document goes over it as the newer edit.
  const keepMyDoc = () => {
    canvas()?.flushDoc?.();
    try { const local = JSON.parse(localStorage.getItem(boardStorageKey) || '{}'); if (local.doc) localStorage.setItem(docKeepKey, JSON.stringify(local.doc)); } catch { /* the doc stays in this browser's copy, kept under :replaced */ }
    setDocConflict(false);
    setSaveState(null);
    setBoardLoad(load => load + 1);
  };
  // Offline queue: edits keep going to this browser; on reconnect the latest copy goes up through the same queue.
  // ponytail: a board whose GET failed offline waits for its next open (Load, above); re-ask on reconnect if that matters.
  useEffect(() => {
    const online = () => { if (boardUnsynced.current) pushBoard(); };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [pushBoard]);
  // An open board holds back the automatic reload for a new build, and Retry's reload while a reload could lose an edit
  // (chunk-reload.js, follow-up R3 item 1; offline-recovery brief 2026-10-16): this browser's copy unreadable (boardSnapshot
  // throws), a 409 (the server's copy would replace it), or the live canvas - every card, shape, stroke, connection, deletion
  // and document word, including one still inside the canvas's 400 ms browser save - not what a reload would read back: the
  // server's copy, or, for a board the server never answered for (or a review board that is not shared), this browser's copy,
  // which survives a reload only when storage is not blocked (canvas-persist.js boardPending).
  const boardUnsaved = () => {
    const copy = boardSnapshot(), now = canvas()?.boardNow?.();
    if (boardStopped.current) return true;
    const live = now ? { ...now, exchanges: exchangesRef.current, ...(board ? {} : { sources: sourcesRef.current }) } : copy;
    const answered = boardLoaded.current && !(board && sharingOf(sharingRef.current) !== 'shared');
    return boardPending({ live, copy: blockedStorage.includes('localStorage') ? null : copy, answered, synced: boardSynced.current });
  };
  // "Reload to update" asks more than Retry's reload (owner clarification 8, 2026-10-20): the server answered for this board
  // and holds exactly the live one (boardUnsaved false), storage is not memory-only, no card's file is still only in this
  // browser, and no chat message is still on its way. Anything it cannot confirm blocks the reload.
  const boardDurable = () => {
    const answered = boardLoaded.current && !(board && sharingOf(sharingRef.current) !== 'shared');
    const uploading = (canvas()?.boardNow?.()?.blocks || []).some(block => [block.fileRef, ...(block.fileRef?.bundle || [])].some(ref => ref?.local && !ref.source?.id));
    return answered && !blockedStorage.length && !boardUnsaved() && !uploading && !chatSaving();
  };
  const unsavedRef = useRef(boardUnsaved), durableRef = useRef(boardDurable);
  unsavedRef.current = boardUnsaved; durableRef.current = boardDurable;
  useEffect(() => { editorOpened(boardPath, () => unsavedRef.current(), () => durableRef.current()); return () => editorClosed(boardPath); }, [boardPath]);
  const changeSharing = async next => {
    setShareBusy(true);
    setShareError(null);
    try {
      const data = await api(`${boardPath}/share`, { method: 'POST', body: JSON.stringify({ ...next, state: boardSnapshot() }) });
      boardVersion.current = data.version; setCanvasVersion(data.version);
      setSharing(data.sharing);
      // Sharing on: the server gets this browser's board as it is now, through the board push queue (review round 2), so
      // it never races a queued PUT: it reads the version the one before it wrote and writes its own before the next runs.
      if (data.sharing.shared) {
        await pushQueue(saveBoard);
        await syncAssets();
        requestWorkspaceExports();
      }
    } catch (error) { setShareError(error.message); }
    finally { setShareBusy(false); }
  };
  // Publish to Explore / Remove from Explore (docs/features/explore-publish.md). A publication shows the live board, so the
  // server first gets this browser's board as it is now, through the push queue, as sharing does. With no @handle yet
  // the server refuses (409 needsHandle): the person chooses one in place and the same Publish carries on.
  const [choosingHandle, setChoosingHandle] = useState(false);
  const changePublication = async publish => {
    setShareBusy(true);
    setShareError(null);
    try {
      if (publish) {
        await pushQueue(saveBoard);
        await syncAssets();
      }
      const made = await api(`/api/apps/${app.name}/${publish ? 'publish' : 'unpublish'}`, { method: 'POST', body: '{}' });
      setSharing(current => ({ ...current, published: made.published || undefined, publication: made.publication_token || undefined }));
    } catch (error) {
      if (error.status === 409 && error.data?.needsHandle) setChoosingHandle(true);
      else setShareError(error.message);
    } finally { setShareBusy(false); }
  };
  // Challenge blocks ask the tutor to judge a committed answer. Jev grades the
  // same attempt side by side (docs/features/jev-grading.md). The learner only
  // ever sees Opus: the shadow promise is never awaited here, and the Opus
  // error is rethrown unchanged by the try/finally.
  // ponytail: Jev grades text only, so an Explain Back attempt with a sketch skips the shadow row instead of
  // recording a verdict on half the answer; feed it the sketch's words once Jev is benchmarked on them.
  const gradeCanvasAnswer = async (block, answer, onDelta, sketch = null) => {
    const pending = sketch ? Promise.resolve(null) : shadowGrade({ app, board, block, answer });
    const started = performance.now();
    let text = '';
    let verdict = null;
    try {
      await gradeAnswer({ app: app.name, block, answer, sketch, onDelta: delta => { text += delta; onDelta(delta); } });
      verdict = parseVerdict(text);
      setGraded(count => count + 1);
    } finally {
      const ms = Math.round(performance.now() - started);
      pending.then(gradeId => gradeId && recordBaseline({ app: app.name, gradeId, verdict, ms }));
    }
  };
  // A file reference clicked inside a canvas block opens in the right panel.
  // A cited source names its own revision (and repository, for the link out);
  // a bare path reference reads the lesson's.
  const openCanvasFile = (path, line, lineEnd, cited = {}) => {
    const commit = cited.commit || (nanoActive ? nanoSourceVersion : repositoryContext?.commit);
    if (chatWorkspace.current) return chatWorkspace.current.openSource(codeRef({ repo: cited.repo || '', commit: commit || '', path, start: line, end: lineEnd }));
    setPaperOpen(false); setSourceOpen(false); setWikiOpen(false); setPanelOpen(true);
    setLessonSource({ path, line, lineEnd, commit, repo: cited.repo });
  };
  const [searchThread, setSearchThread] = useState(null);
  const searchScope = `${canvasKey}:${boardName}:${hole || ''}:${canEditCanvas ? 'edit' : 'read'}`;
  const canvasSearch = useCanvasSearch({ scopeKey: searchScope, canvasApi, epoch: canvasEpoch,
    shown: panelOpen && panelTab === 'find', commentsBase: comments.active ? memberBase(commentBoard) : null,
    links, linkResults: true, onOpenLink: href => refLinks.go(href), children: dive.navigator?.tree?.children,
    onComment: result => { setSearchThread({ scope: searchScope, id: result.target.id }); comments.openPin(result.target.id); },
    revealDocument: () => setDocView('editor'), canInsert: canEditCanvas });
  const openSearchAction = (result, action) => {
    if (action.kind === 'rabbit-hole') return dive.portals.enter(action.rabbitHole.name);
    if (action.kind === 'link-card') return canvasApi.current?.focusBlock(action.objectId);
    if (action.kind === 'link-open') return refLinks.go(action.href);
    const ref = action.reference;
    if (!ref || ref.unavailable) return;
    if (ref.kind === 'canvas') { const live = links.resolve(ref.target); if (live?.href && !live.unavailable) return refLinks.go(live.href); return toast('This canvas reference is unavailable.'); }
    if (ref.sourceId) return chatWorkspace.current?.openSource({ ...ref, kind: ref.sourceId.startsWith('doc:') ? 'doc' : ref.sourceId.startsWith('paper:') ? 'web' : ref.kind, name: ref.name || ref.title || 'Source' });
    if (ref.kind === 'code' || ref.kind === 'repository') return openCanvasFile(ref.path, ref.lines?.[0] || ref.range?.start || 1, ref.lines?.[1] || ref.range?.end, { repo: ref.repo, commit: ref.revision || ref.commit });
    const target = sourceTarget(ref);
    if (ref.kind === 'paper' && (ref.arxiv || ref.id)) return openPaper({ id: ref.arxiv || ref.id, title: ref.title, pdfUrl: `https://arxiv.org/pdf/${ref.arxiv || ref.id}`, page: ref.page || 1 });
    if (target.open === 'wiki') return openWiki({ title: target.title });
    if (target.href && /^https:\/\//.test(target.href)) window.open(target.href, '_blank', 'noopener,noreferrer');
  };
  const clearAskTarget = () => { setAskTarget(null); canvasApi.current?.deselect(); };
  // The selected-card context belongs to the canvas it was chosen on: another canvas or board (a Rabbit Hole) starts clear.
  useEffect(() => { setAskTarget(null); }, [app.name, boardName]);
  // The page's own handlers (the hook card, the teach handoff) run outside the Chat workspace provider: ChatHandle reads it from inside.
  const chatRef = useRef(null);
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
    onShowWiki: (article, into) => addWiki(article, into),
    onShowVideo: (moment, into) => addVideo(moment, into),
    // A research answer that commits to opening a card holds its place until it lands (ask.jsx).
    reserveCard: card => canvas()?.reserve({ label: OPENING[card], card: card === 'video' ? 'videoMoment' : card }),
    releaseCard: id => canvas()?.release(id),
    // Read at send time, so a question always carries the outline as it is now.
    outline: () => canvasStateRef.current.outline || [],
    planRevision: () => planRevisionRef.current,
    // R4 (lead, 2026-10-16): 'Use as table of contents' (source 'syllabus') is the learner's click, so the contents come
    // forward with the Apply/Discard card; a Tutor proposal arrives unasked, so it only marks the tab (PanelHeader
    // tocPending) and never switches tabs or scrolls. A canvas the learner cannot edit takes no proposals.
    onOutlineProposal: canEditCanvas ? proposal => { setProposal(proposal); if (proposal?.source === 'syllabus') setPanelTab('toc'); } : undefined,
    onShowPaper: (paper, into) => addPaper(paper, into),
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
    setLearningView(value); if (value !== 'curriculum') setSectionTarget(null); setCourseView(value === 'curriculum' && canAuthor);
    setLearnerOpen(value === 'curriculum' && !canAuthor);
    setSetupChat(value === 'curriculum' && canAuthor);
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
        // The right-side Chat's composer (contract A6 prepare): it opens Chat and focuses, and never sends.
        const chat = await until(() => chatRef.current, 10000);
        if (!chat) return no('failed', 'The Learn chat did not open. Open Learn and try again.');
        if (chat.composer.text.trim() && chat.composer.text !== prompt) return no('rejected', 'The Learn chat already has a draft. Send or clear it, then try again.');
        chat.composer.prepare(chat.composer.text === prompt ? {} : { text: prompt });
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
    : isRepository ? (nanoActive || lesson.current?.lessonId?.startsWith('course-') ? courseTitle : project ? 'Main canvas' : app.repo || app.name)
    : courseTitle || app.repo || app.name;
  titleNow.current = canvasTitle || fallbackTitle;
  // Never the canvas id: its title, or plain words when there is none.
  // A canvas title is a weak hint (chat brief section 8), so the canvas composer never names it.
  const askPlaceholder = isCanvas ? 'Ask about this canvas' : `Ask about ${app.repo || app.name}`;
  // The right-side Chat is the one main Learn composer (owner brief 2026-10-13 section 4): the canvas dock is gone, and what it
  // carried rides on the Chat's AskPanel (ChatPane, A1 spreads these): the / commands, the Tutor, the journey's starter and tray,
  // Voice Mode, the Next Steps hook sends and the selected card's chip. Its answers never land on the canvas by themselves (no
  // onExchange): Add as card is Lane B's footer, through the provider's canvasOps.
  const chatAskProps = { slash: learnSlash, tutor: tutor.active ? tutor : null, journey, journeyStarter: journey.journey ? null : journey.start, journeySetup: inJourneySetup(journey.journey), tray: journey.trayProps, voice, nextStepRef: nextStepSend, canvasTarget: askTarget, onClearCanvasTarget: clearAskTarget };
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
    // A PDF added as slides is one block per page: removing it removes every page.
    if (source.kind === 'pdf') for (const [id, key] of canvasState.cards || []) { if (key === `pdf:${source.id}`) canvas()?.removeBlock(id); }
    else if (blockId) canvas()?.removeBlock(blockId);
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
        ...localInsertItems(canvas),
        { divider: true },
        { label: 'Notebook', icon: NotebookPen, onSelect: () => canvas()?.insertNotebook() },
        // The one way to add a file besides dropping it on the canvas.
        { label: 'Upload a file', icon: Upload, onSelect: () => filePicker.current?.click() },
        { divider: true },
        // Source search (owner decisions 4A and 5A, Release B): the registry's 'insert' commands open the shared finder; it adds
        // a card only on Add to canvas.
        ...commandsFor('insert').map(command => ({ label: `${labelOf(command)}`, icon: FINDER_ICONS[command.source], onSelect: () => openSourceFinder({ source: command.source }) })),
        { divider: true },
        { label: 'Link to canvas', icon: Link2, onSelect: () => setRefPick({}) },
      ],
    },
    ...canvasEditMenus({ canvas, canvasState, inlineAi, quickEdit: true, comments, docView, setDocView, onShortcuts: () => setShortcutsOpen(true), onSlashHelp: () => setSlashHelpOpen(true) }),
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
  // The lesson canvas fills its workspace up to the page's top edge (owner, 2026-10-22): the header floats over it, with no
  // band of its own, unless a lesson heading, an error or the review-board note sits between them.
  const headerOver = !courseView && learningView === 'lesson' && !((!isRepository && !isCanvas) || progress) && !graphError && !(reviewTools && board && !BOARDS[board]);
  return <main className="relative flex min-w-0 flex-1 overflow-hidden max-lg:flex-col max-lg:overflow-y-auto">
    {/* Below lg the panel stacks under the lesson and the page scrolls: the
        lesson canvas keeps a real working height (see below) instead of being
        squeezed into what the panel leaves. */}
    <section aria-label="Learn" className={`min-h-0 min-w-0 flex-1 ${!courseView && learningView === 'lesson' ? 'max-lg:flex-none' : ''}`}>
      {/* The lesson canvas goes full-bleed so its toolbar and zoom controls sit
          at the window edges; every other view keeps the centered page frame. */}
      <div className={`expanded-page-frame @container/frame relative mx-auto flex h-full w-full min-h-0 flex-col ${!courseView && learningView === 'lesson' ? '' : 'max-w-[900px] px-6 py-6'}`}>
        {pdfAdd && <PdfAddDialog key={pdfAdd.total ?? 'reading'} name={pdfAdd.name} total={pdfAdd.total} busy={pdfAdd.busy} progress={pdfAdd.progress} error={pdfAdd.error} onCancel={closePdf} onConfirm={confirmPdf} />}
        {pendingNoteView && <ConfirmDialog title="Save notes before switching?" body="Save your changes and open the selected view, or cancel to keep editing." confirmLabel="Save notes" confirmVariant="primary" onCancel={() => setPendingNoteView(null)} onConfirm={async () => { if (await noteSave.current?.()) leaveNote(pendingNoteView); }} />}
        {/* One centered strip is all the chrome the canvas gets: an editable
            title, the menubar, and the three one-press actions. No page
            heading, no rule underneath - the canvas has no boundary. */}
        {/* Home alone at the far left, and everything else ONE centred group (owner brief 2026-10-16 item 2; the approved
            centred-menubar mockup): the project name and canvas selector, Files to View, the one-press actions and save
            status, the right-panel toggle, then the repository dropdown. With the right panel open or closed the group
            centres in the canvas column; a row narrower than the group wraps it (centred while it fits: justify-center-safe)
            instead of clipping or overlapping, never a scroller, which would clip the dropdowns. Equal side padding (px-12)
            clears the absolute Home button on the left and balances it on the right, so Home never shifts the group off the
            canvas area's centre (owner header correction, 2026-10-16). */}
        {/* Over the canvas (headerOver) it takes no pointer itself: only its controls do, so the canvas under the rest of the row
            pans, draws and selects (owner, 2026-10-22: no full-width band). */}
        {!canvasState.presenting && <div data-canvas-header className={`${headerOver ? 'pointer-events-none absolute inset-x-0 top-0 z-40 [&>*]:pointer-events-auto' : 'relative shrink-0'} flex items-center justify-center-safe px-12 pt-3 pb-1 max-md:px-2 max-md:pt-2`}>
          {/* The page's top-left corner goes back (owner 2026-10-04: Back, not a jump to Home): to the page the learner
              came from, or Home when the canvas was opened directly. The navigator climbs holes; recentring is Shift 0. */}
          <button type="button" data-learn-home aria-label="Back" title="Back"
            onClick={() => goBack('/apps')}
            className="absolute top-3 left-3 flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-white text-ink-2 shadow-md hover:text-ink max-md:hidden"><House size={15} strokeWidth={1.7} /></button>
          <div data-header-group className="flex max-w-full min-w-0 flex-wrap items-center justify-center-safe gap-1 gap-y-0.5">
          {/* One line, never wrapped (owner r35): in a project, [project] › [canvas selector]. The project name is plain text
              (owner brief 2026-10-16 item 2: project management lives in Home and the Library, which rename it); the name is
              the one its card shows (cardModel), never the repository's own. A canvas outside a project keeps its editable
              title here. */}
          <div data-title-crumbs className="flex max-w-full min-w-0 items-center">
          {project && <>
            <span data-project-crumb title={cardModel(project).title}
              className="block h-8 max-w-60 min-w-12 shrink-[50] truncate px-1.5 text-sm leading-8 text-ink-2 md:shrink-0">{cardModel(project).title}</span>
            <span aria-hidden="true" className="shrink-0 px-0.5 text-ink-3">›</span>
          </>}
          {switcher ? cloneElement(switcher, { holes: dive.titleHoles, title: canvasTitle || fallbackTitle, onRename: renameTitle }) : <><input aria-label="Canvas title" title={canvasTitle || fallbackTitle}
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
          {/* A canvas with kept Rabbit Holes: a chevron and the hole tree (owner r35). A project canvas's selector holds them as
              a group in its menu, never a second control. */}
          <TitleHoles {...dive.titleHoles} /></>}
          </div>
          <CanvasMenubar menus={canvasMenus} />
          {/* The document's save status and the board's size (blocknote-canvas.md): Saved only once the server has it. A 409 or
              a document a newer server copy replaced are offered back here, never dropped. */}
          {docView === 'editor' && saveState && (
            <span data-doc-save-status data-state={saveState.state} className={`flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs ${saveState.state === 'error' ? 'text-red-700' : 'text-ink-3'}`} title={saveState.message || undefined}>
              {saveState.state === 'saving' ? 'Saving' : saveState.state === 'saved' ? 'Saved' : <>Couldn&apos;t save{saveState.status === 413 ? ' - Not saved: over 1.9 MB' : saveState.status || saveState.unreadable ? '' : ' - offline'}
                <button type="button" onClick={() => (saveState.status === 409 ? keepMyDoc() : pushBoard(null, { now: true }))} className="ml-1 flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-ink hover:bg-hover"><RotateCw size={12} aria-hidden />Retry</button></>}
            </span>
          )}
          {boardSizeWarning(boardChars) && (
            <span data-board-size-warning role="status" className="flex h-8 shrink-0 items-center rounded-lg px-2 text-xs text-amber-700" title={`${(boardChars / 1e6).toFixed(2)} MB of ${(BOARD_LIMIT / 1e6).toFixed(1)} MB`}>
              Close to the 1.9 MB limit ({Math.round((boardChars / BOARD_LIMIT) * 100)}%)
            </span>
          )}
          {docConflict && (
            <span data-doc-conflict role="alert" className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-ink-2">
              This canvas changed elsewhere.
              <button type="button" onClick={keepMyDoc} className="rounded-md border border-line px-1.5 py-0.5 text-ink hover:bg-hover">Reload and keep my document</button>
            </span>
          )}
          {docRestore && (
            <span data-doc-restore role="status" className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-ink-2">
              Another version of this document was kept aside.
              {/* Restoring keeps the document it replaces under :replaced in turn, so neither version is ever lost. */}
              <button type="button" onClick={() => {
                try { const aside = JSON.parse(localStorage.getItem(`${boardStorageKey}:replaced`) || '{}'); localStorage.setItem(`${boardStorageKey}:replaced`, JSON.stringify({ ...aside, doc: canvas()?.liveBoard?.().doc ?? null })); } catch { /* the restore still runs */ }
                canvas()?.replaceDoc(docRestore); setDocRestore(null);
              }} className="rounded-md border border-line px-1.5 py-0.5 text-ink hover:bg-hover">Restore my unsaved document</button>
            </span>
          )}
          {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}
          {slashHelpOpen && <Suspense fallback={null}><SlashCommandsSheet appName={app.name} onClose={() => setSlashHelpOpen(false)}
            onUseExample={draft => { setSlashHelpOpen(false); chat.composer.prepare(draft); }} /></Suspense>}
          {finder && <SearchBar key={`${finder.source}:${finder.query}`} app={app.name} initialSource={finder.source} initialQuery={finder.query} onClose={closeFinder}
            onPick={(source, item) => { const blockId = pickResult(source, item, finder.origin?.into ?? null); finder.done({ added: !!blockId, blockId }); return blockId; }} />}
          <div className="flex items-center gap-0.5">
            <button type="button" title="Present" aria-label="Present"
              onClick={() => { if (canvasApi.current?.present()) setPanelOpen(false); }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"><Play size={15} strokeWidth={1.8} /></button>
            {/* No Fork on your own canvas (owner, 2026-10-08): Duplicate in the Library's ⋮ copies it. */}
            <span className="relative">
              <button type="button" data-share-button title={sharing?.unavailable || (sharing?.shared ? 'Shared - manage links' : 'Share this board')} aria-label="Share" aria-expanded={shareOpen}
                disabled={!!sharing?.unavailable} onClick={() => setShareOpen(open => !open)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-40 ${sharing?.shared ? 'text-[#2383e2]' : 'text-ink-2'} ${shareOpen ? 'bg-hover' : 'hover:bg-hover hover:text-ink'}`}>
                <Share2 size={15} strokeWidth={1.8} /></button>
              {shareOpen && <SharePanel sharing={sharing} busy={shareBusy} error={shareError} onChange={changeSharing} onPublish={isCanvas && !hole && !board ? changePublication : null} onClose={() => setShareOpen(false)}
                comments={comments.active ? <><PeopleWithAccess base={memberBase(commentBoard)} /><CommentSettings base={memberBase(commentBoard)} published={!!sharing?.published} /></> : null} />}
              {choosingHandle && <div className="fixed inset-0 z-[70] overflow-y-auto bg-white"><ChooseHandle onDone={() => { setChoosingHandle(false); changePublication(true); }} /></div>}
            </span>
            {/* Comments (docs/features/canvas-comments.md): toggles the right panel on its Comments tab, as Progress toggles its pane; the badge
                counts the open threads the tab lists (owner, 2026-10-21), hidden at 0; a dot when a thread has news for you. */}
            {comments.active && <button type="button" data-comments-header title="Comments" aria-label={['Comments', comments.open && `${badgeText(comments.open)} open`, comments.unread && `${comments.unread} unread`].filter(Boolean).join(', ')} aria-pressed={commentsShown} onClick={commentsShown ? () => setPanelOpen(false) : openComments}
              className={`relative flex h-8 w-8 items-center justify-center rounded-lg ${commentsShown ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}><MessageCircle size={15} strokeWidth={1.8} aria-hidden />{comments.unread > 0 && <span data-unread-dot className="absolute top-1.5 left-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-white" />}{comments.open > 0 && <span data-comments-count aria-hidden className="absolute -top-0.5 -right-0.5 min-w-[16px] rounded-full bg-ink px-1 text-center text-[10px] font-medium leading-4 text-white">{badgeText(comments.open)}</span>}</button>}
            {/* The signed-in person's own monthly AI allowance (owner D4 section 2), never this canvas's owner's. */}
            {learnPreview && <UsageGauge />}
            <button type="button" title={panelOpen ? 'Hide the right panel' : 'Show the right panel'}
              aria-label={panelOpen ? 'Hide the right panel' : 'Show the right panel'} aria-pressed={panelOpen}
              onClick={() => setPanelOpen(previous => !previous)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${panelOpen ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
              {panelOpen ? <PanelRightClose size={15} strokeWidth={1.8} /> : <PanelRightOpen size={15} strokeWidth={1.8} />}
            </button>
          </div>
          {/* The canvas's repository and fork origin (decisions 1A-4A, C:/s/spec/hdr-provenance.md), from the server's provenance for
              this viewer, last in the centred group: the repository is one named dropdown (owner brief 2026-10-16 item 1) with
              its branch, commit, status and Refresh branch; its indexing state shows beside it while there is no snapshot. */}
          <ProvenanceRow provenance={provenance} repository={repository} end={false}>{repository && <RepositoryBadge repository={repository} />}</ProvenanceRow>
          </div>
        </div>}
        {learningView === 'curriculum' && canAuthor && !(suppliedCourse && planOpen) && <div role="tablist" aria-label="Curriculum views" className="mb-4 flex gap-1">{[['edit', 'Edit course'], ['learner', 'Learner view']].map(([value, label]) => <button key={value} role="tab" aria-selected={value === 'edit' ? courseView : learnerOpen} disabled={course.dirty} className={`rounded px-3 py-1.5 text-xs hover:bg-hover ${(value === 'edit' ? courseView : learnerOpen) ? 'bg-hover font-medium' : 'text-ink-2'}`} onClick={() => { setCourseView(value === 'edit'); setSetupChat(value === 'edit'); setLearnerOpen(value === 'learner'); }}>{label}</button>)}</div>}
        {planStorageError && <p role="alert" className="mb-3 text-xs text-red-700">{planStorageError}</p>}
        {suppliedCourse && learningView === 'curriculum' && <LessonPlanPreview onPreview={editor && nanoProgress.loaded && !answering ? () => previewLesson(nanoLesson, true) : null} edits={canAuthor ? planEdits : {}} selectedSection={sectionTarget?.id} onEdit={target => { setSectionTarget(target); setSetupChat(true); }} course={course.course} learnerView={!canAuthor || learnerOpen} editorPanel={courseView ? coursePanel : null} view={planOpen ? 'plan' : 'curriculum'} selected={plannedLesson} onBack={() => { setPlanOpen(false); setSectionTarget(null); }} onSelect={index => { setPlannedLesson(index); setPlanOpen(true); }} />}
        {courseView && !suppliedCourse && coursePanel}
        {learnerOpen && !suppliedCourse && <LearnOutline allowSample={!isRepository && !isCanvas} onToggleComplete={toggleSection} completed={completed} state={course} sample={sampleOutline} onSampleChange={setSampleOutline} activeId={lesson.current?.lessonId} activePage={progress?.page} disabled={outlineDisabled} onOpen={openFromOutline} />}
        <div className={`${courseView || learningView !== 'lesson' ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col`}>
        {!canvasState.presenting && ((!isRepository && !isCanvas) || progress) && <div aria-label="Current lesson and section" className="mb-4"><h2 className="text-lg font-semibold">Lesson {sampleIndex >= 0 ? sampleIndex + 1 : 1}: {currentLesson?.title}</h2><p className="mt-1 text-sm text-ink-2">Section {(progress?.page || 0) + 1} of {pages.length}: {progress?.label || pages[0].label}</p></div>}
        {graphError && <p role="alert" className="text-sm text-red-700">{graphError}</p>}
        {/* The adaptive canvas: a plain React whiteboard where chat exchanges
            land as movable blocks. Lesson playback stays parked. */}
        {reviewTools && board && !BOARDS[board] && <div className="border-b border-line bg-hover px-4 py-2 text-sm text-ink-2">No review board is registered as <span className="font-medium text-ink">{board}</span> - this is an empty scratch board. Registered boards live in BOARDS in demo-scenes.js.</div>}
        <div ref={canvasFrame} aria-label="Lesson canvas" onPointerDownCapture={openPaperReference} onClickCapture={openPaperReference} className="relative min-h-0 flex-1 max-lg:h-[var(--phone-canvas-h,75dvh)] max-lg:flex-none" style={phoneCanvasHeight ? { "--phone-canvas-h": `${phoneCanvasHeight}px` } : undefined}><Suspense fallback={null}><SearchContentProvider key={searchScope} registry={canvasSearch.registry}><DivePortals.Provider value={dive.portals}><NextStepsHost on={nextStepsHere} coaching={hooksCoaching} tutor={tutor} journey={journey} canvasApi={canvasApi} canvasState={canvasState} record={dive.tree?.dive || null} access={askScope} title={app.title || ''} graded={graded} canvasVersion={canvasVersion} board={boardName} describe={describeBlock} repositoryCommit={repository?.commit || null} shown={canvasState.curious !== false}>{steps => <AdaptiveCanvas key={canvasEpoch} {...comments.canvasProps} leftRail={voiceOn ? <TutorCaption caption={voice.caption} state={voice.state} extras={tutor.extras} /> : null}
          hooks={steps ? <NextStepsCard steps={steps} onPick={(step, hook) => (step.section ? journey?.nextSection?.() : (chatRef.current?.panels.openChat(), nextStepSend.current?.(step, hook.hook)))} /> : null} gutterTop={dive.tree ? <DiveNavigator {...dive.navigator} /> : null} onSave={pushBoard} refLinks={refLinks} onLinkCanvas={setRefPick} docView={docView} docReady={restoredBoard === boardPath} docError={restoredBoard === boardPath && sharing?.unavailable ? sharing.unavailable : null} onDocRetry={() => setBoardLoad(load => load + 1)} onDocDirty={() => setSaveState(previous => (previous?.state === 'error' ? previous : { state: 'saving' }))} inlineAi={inlineAi} bottomLeft={<FeedbackButton app={app.name} board={board} />} onSearch={source => openSourceFinder({ source })} exchanges={exchanges} onMove={moveExchange} onDelete={deleteExchange} onRestore={setExchanges} onAskTarget={setAskTarget} askTargetId={askTarget?.id ?? null} onOpenFile={openCanvasFile} onAdd={copies => setExchanges(previous => [...previous, ...copies])} onGrade={gradeCanvasAnswer} onResize={resizeExchange} onReply={replyToExchange} appName={app.name} apiRef={canvasApi} onWiki={trackWiki} onWatch={watchVideo} onDropFiles={takeDrop} onPasteCode={pasteCode} onPaper={trackPaper} onCardAction={cardAction} attachedIds={sources.filter(source => source.attached).map(source => source.id)} onGroupShot={takeGroupShot} onAreaShot={takeAreaShot} onState={onCanvasState} edgeInset={journey.path ? 52 : (!panelOpen && canvasOutline.length ? 52 : 0)} storageKey={boardStorageKey} seedBlocks={reviewTools && board ? (BOARDS[board]?.() ?? []) : null} renderBlockComposer={(app.hosting !== 'aws' || app.app_chat) ? (exchange, onExchange, target) => <AskPanel compact composerOnly canvasSeed={{ question: exchange.question, answer: exchange.answer, target }} onExchange={onExchange} tutor={tutor.active ? tutor : null} scope={askScope} appName={app.name} chatConfig={app.app_chat} repositoryContext={!repoAttached ? null : nanoActive ? { commit: nanoSourceVersion } : repositoryContext} onClearRepository={onClearRepository} conversation="learn" placeholder="Follow up in this block" autoFocus /> : null} />}</NextStepsHost></DivePortals.Provider></SearchContentProvider></Suspense>{/* The journey's Adaptive Contents Rail (§8, D5): inside the canvas frame, so it stays beside the Learn agent chat panel; pinned open while the path is reviewed. A materialized section frames its heading, any other entry opens its purpose. */}{journey.path && <ContentsRail placement="canvas" entries={pathEntries(journey.path, journey.prevPath).map(entry => ({ ...entry, open: entry.id === openEntry }))} pinned={journey.journey?.state === 'path_review'} empty={canvasEmpty(canvasState, exchanges)} onOpen={entry => (entry.heading_block_id ? canvasApi.current?.showSection(entry.heading_block_id) : setOpenEntry(id => (id === entry.id ? null : entry.id)))} />}{dive.emptyHint}{dive.suggestionCard && !tutor.active && <div className="pointer-events-none absolute inset-x-0 bottom-28 z-30 flex justify-center px-4"><div className="pointer-events-auto">{dive.suggestionCard}</div></div>}{dive.confirmDialog}{refPick && <CanvasRefPicker exclude={commentBoard} onClose={() => setRefPick(null)}
            linked={refPick.blockId ? ((canvasApi.current?.liveRefs?.() || []).find(entry => entry.blockId === refPick.blockId)?.refs || []).map(ref => ref.target) : []}
            returnFocus={() => (refPick.blockId ? document.querySelector(`[data-block-id="${CSS.escape(refPick.blockId)}"]`) : null)}
            onPick={async canvas => {
              links.remember(canvas);
              // addRef answers { ok } or { ok: false, reason }; insertRefCard answers the new card's id.
              const api = canvasApi.current;
              if (refPick.blockId) return (await api?.addRef?.(refPick.blockId, canvas.id)) || { ok: false };
              return (await api?.insertRefCard?.(canvas.id, refPick.point)) ? { ok: true } : { ok: false };
            }} />}<ChatHandle to={chatRef} /></div>
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
        {!courseView && learningView === 'notes' && <Suspense fallback={<p className="text-sm text-ink-2">Loading notes</p>}><LearnNotes saveRef={noteSave} onChange={setNoteChanged} records={noteRecords} editing={noteEditing} onSave={saveNote} onDelete={removeNote} onResume={returnToNoteLesson} onEdit={record => { setNoteChanged(false); setNoteEditing(record); }} onReturn={() => setNoteEditing(null)} loaded={notesLoaded} error={notesError} /></Suspense>}
        <LessonNotebook active={!courseView && learningView === 'notebook'} />
        <LessonPractice mode={practiceMode} setMode={setPracticeMode} active={!courseView && learningView === 'practice'} onReview={async index => {
          if (lesson.current?.lessonId !== architectureLesson.id) await previewLesson(architectureLesson);
          setCourseView(false); changeLearningView('lesson'); navigateLesson('seek', index);
        }} />
      </div>
    </section>
    {/* Canvas, then the companion column, then Chat's panel, side by side (owner decision 1A, 2026-10-15; chat-panels.js): one
        open state for the right side, so Hide right panel hides both columns and reopening restores both. The companion holds
        Context (Sources: Materials and the reader), Files and Graph, one view at a time; every view and every Chat tab stays
        mounted while hidden, so the draft, the reader's page and the graph survive a switch or a hide. Below lg one column
        shows at a time: the companion in Chat's place, with Back to chat. */}
    <ResizableSidePanel aria-label="Viewer" data-companion phoneHeight="max-lg:h-[60%] max-lg:min-h-[28rem]" resizeLabel="Resize viewer" defaultWidth={360} storageKey="rh.companion.width" collapsed={!panelOpen || !companion.open} reserve={panelOpen ? chatWidth : 0} onWidth={setCompanionWidth} onClickCapture={openPaperReference}>
      <CompanionHeader views={companionViews} view={companionView} onView={view => companion.show(view)} onClose={companion.close} />
      <div role="tabpanel" aria-label="Context" data-context-panel className={`${companionView === 'context' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}><SourcesPane onSwitchOff={ref => { releaseCodeRef(repository, ref); if (askTarget?.ref && sameRef(askTarget.ref, ref)) clearAskTarget(); }} /></div>
      {/* The repository's Files (RepositoryPage's reader): click a file, select lines, Ask - the question waits in the chat. */}
      {files && shown.current.has('files') && <div role="tabpanel" aria-label="Repository files" data-learn-files className={`${companionView === 'files' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col px-4 pt-2 pb-4`}>{files}</div>}
      {graph && shown.current.has('graph') && <div role="tabpanel" aria-label="Repository graph" data-learn-graph className={`${companionView === 'graph' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col px-4 pt-2 pb-4`}>{graph}</div>}
    </ResizableSidePanel>
    <ResizableSidePanel aria-label="Learn agent chat" resizeLabel="Resize Learn panel" defaultWidth={420} storageKey="rh.chat.width" collapsed={!panelOpen} reserve={panelOpen && companion.open ? companionWidth : 0} narrowHidden={companion.open} onWidth={setChatWidth} onClickCapture={openPaperReference} className="px-5 pt-3 pb-4">
      <PanelHeader tab={panelTab} commentsOn={comments.active} commentsUnread={comments.unread} tocPending={proposal && canEditCanvas ? 1 : 0} companion={{ views: companionViews, open: panelOpen && companion.open, onToggle: companion.toggle }} pinned={panelPinned} onPin={pinPanel} onClose={() => setPanelOpen(false)}
        onTab={(tab, clicked) => { setPanelTab(tab); if (clicked && tab === 'find') requestAnimationFrame(() => findInput.current?.focus()); }} />
      <CanvasSearchPanel hidden={panelTab !== 'find'} inputRef={findInput} {...canvasSearch.panel} onOpenAction={openSearchAction} />
      {panelTab === 'comments' && searchThread?.scope === searchScope && <button type="button" data-search-return onClick={() => setPanelTab('find')} className="mb-2 self-start rounded px-2 py-1 text-xs text-ink-2 hover:bg-hover">Back to Search</button>}
      {comments.active && <CommentsPanel hidden={panelTab !== 'comments'} {...comments.panelProps} />}
      {/* Progress (owner 2026-10-22: a tab here, no column beside Chat) keeps its viewed goal, open skill and goal drafts while
          another tab shows. Its Close and Escape go back to Chat. */}
      {shown.current.has('progress') && <div role="tabpanel" aria-label="Progress" data-progress-tab className={`${panelTab === 'progress' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}>
        <LearnProgress scope={{ app: chat.canvas, board: boardName }} coaching={chat.coaching} composer={chat.composer} chat={chat} journey={journey} onClose={() => { setPanelTab('chat'); requestAnimationFrame(() => document.querySelector('[data-panel-tab="chat"]')?.focus()); }} /></div>}
      {/* The Table of contents tab: the outline, and under it any open reader, as before the header. */}
      <div role="tabpanel" aria-label="Table of contents" className={`${panelTab === 'toc' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}
        ref={tocPanel} onScrollCapture={event => { if (event.target.matches?.('[data-toc]')) tocScroll.current = event.target.scrollTop; }}>
      {/* The table of contents IS the lesson's structure (TableOfContents.jsx). Its scroll container's sizing is the page's. */}
      <TableOfContents subtitle={project?.repo || app.repo || (project ? cardModel(project).title : null)} goal={tocGoal} outline={canvasOutline} canvasApi={canvasApi} proposal={proposal} onProposal={setProposal} activeId={canvasState.activeSection ?? null} readOnly={!canEditCanvas} onShow={id => { setPanelOpen(true); canvasApi.current?.showSection(id); }}
        plan={tocPlan} planRevision={planRevision} evidence={journeyGoal ? { app: chat.canvas, board: boardName, goalId: journeyGoal.goalId, revision: coachingState?.revision } : null}
        onProgress={panels.openProgress} onResume={tocPlan.learningNow ? resumeFromToc : null}
        className={`mb-3 flex ${setupChat ? 'max-h-[45%] shrink-0' : 'min-h-0'} flex-col overflow-y-auto`} />
      {setupChat && <CourseInterview state={course} app={app} sectionEditor={suppliedCourse ? sectionEditor : null} />}
      <div className={`${setupChat ? 'hidden' : 'flex'} shrink-0 flex-col`}>
      {narration && !paperOpen && !wikiOpen && !sourceOpen && !lessonSource && !learnerOpen && <details className="mb-3 max-h-40 overflow-auto rounded border border-line p-3 text-sm" open><summary className="cursor-pointer text-xs font-medium">Current page explanation</summary><p className="mt-2 whitespace-pre-wrap text-ink-2">{narration}</p></details>}
      </div>
      {/* The TOC conversation (owner brief item 7): its own thread, always Tutor. An outline change the Tutor proposes here is
          the learner's own request, so it applies to the contents at once (the outline renumbers itself); one that cannot
          apply (stale or refused) waits as the Apply/Discard card with its reason. */}
      {!setupChat && (app.hosting !== 'aws' || app.app_chat) && <TocWorkspace key={app.name}><TocConversation {...chatAskProps} scope={askScope} appName={app.name} chatConfig={app.app_chat} conversation="learn" placeholder="Describe your goal or refine the outline"
        codebase={repository} repositoryExcerpt={repositoryExcerpt} repositoryContext={!repoAttached ? null : nanoActive ? { commit: nanoSourceVersion } : repositoryContext} onClearRepository={onClearRepository}
        boardContext={{ ...boardContext, onOutlineProposal: canEditCanvas ? proposal => { const result = canvasApi.current?.applyOutline(proposal.ops, { base: proposal.base, source: proposal.source, planBase: proposal.planBase, plan: planRevisionRef.current }); if (!result?.ok) setProposal(proposal); } : undefined }} /></TocWorkspace>}
      </div>
      <ChatPane key={app.name} hidden={panelTab !== 'chat'} chatAskProps={chatAskProps} unavailable={app.hosting === 'aws' && !app.app_chat ? <p className="text-sm text-ink-2">Coaching is not connected for AWS jobs yet. Your job data stays in your AWS account.</p> : null}
        codebase={repository} onGraph={onGraph} repositoryExcerpt={repositoryExcerpt} scope={askScope} appName={app.name} chatConfig={app.app_chat} repositoryContext={!repoAttached ? null : nanoActive ? { commit: nanoSourceVersion } : isRepository && lesson.current?.lessonId?.startsWith('course-') ? { commit: course.course?.sourceVersion } : repositoryContext} onClearRepository={onClearRepository} conversation="learn" boardContext={boardContext} placeholder={askPlaceholder}
        // Focus on open only beside the canvas (lg up): below lg the pane stacks under the canvas, and focusing it scrolled
        // the page past Learn's header strip.
        autoFocus={!!globalThis.matchMedia?.('(min-width: 1024px)').matches} />
    </ResizableSidePanel>
    <input ref={filePicker} type="file" multiple accept={acceptList()} className="hidden"
      onChange={event => { takeDrop([...(event.target.files || [])]); event.target.value = ''; }} />
    {docImport.dialog}
    {imports[0] && <FileImportDialog key={imports[0].id} file={imports[0].file} kind={imports[0].kind} files={imports[0].files} error={importState.error} busy={importState.busy}
      onCancel={nextImport} onConfirm={addImport} />}
    {/* With sections on the canvas the rail mirrors the panel's table of
        contents - hover opens it, a click frames that section, and the panel
        stays closed. A canvas with no sections shows no rail (user, 2026-09-29).
        A canvas with a journey path shows the path rail in the canvas frame instead. */}
    {!panelOpen && !journey.path && <ContentsRail entries={canvasOutline.map((entry, index) => ({ n: index + 1, label: entry.label, available: true, active: false, section: entry.id }))}
      onOpen={entry => { if (entry.section) { canvasApi.current?.showSection(entry.section); return; } setPanelOpen(false); openFromOutline(entry.content, 'lesson', 0); }} />}
  </main>;
}

// The Chat workspace from inside its provider (A1 mounts it around the canvas and panels), for the page's handlers above it. The
// shortcuts that focused the canvas dock (Ctrl/Cmd+J, and Ctrl/Cmd+O in the preview: small:ask-focus) open Chat and focus it.
function ChatHandle({ to }) {
  to.current = useChatWorkspace();
  useEffect(() => {
    const open = () => { to.current?.panels.openChat(); to.current?.composer.focus(); };
    window.addEventListener('small:ask-focus', open);
    return () => window.removeEventListener('small:ask-focus', open);
  }, [to]);
  return null;
}
// Professor Next Steps (docs/features/professor-next-steps.md §1.3, §1.7): useNextSteps mounts only where the page allows it
// (on), and outside the canvas, so presenting or a canvas remount never asks for a set again. children(steps): the hooks'
// state, or null where they are not mounted.
function NextStepsHost({ on, children, ...props }) {
  return on ? <NextStepsMounted {...props}>{children}</NextStepsMounted> : children(null);
}
function NextStepsMounted({ children, ...props }) {
  return children(useNextSteps(props));
}
