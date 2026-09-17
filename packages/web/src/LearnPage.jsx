import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minimize2, Network, Pause, Play, Scan, Trophy, NotebookPen, Volume2, VolumeX } from 'lucide-react';
import { isMuted, setMuted } from './learn-audio.js';
import { api, navigate } from './api.js';
import { requestBoardExplanation } from './learn-board-request.js';
import { AskPanel } from './ask.jsx';
import { Button, ExpandedPageFrame, IconBtn, PeekBreadcrumbs, ConfirmDialog } from './ui.jsx';
import { captureSelection, selectionSnapshot } from './sigmoid-context.js';
import RegionPicker from './RegionPicker.jsx';
import { CourseInterview, CoursePanel, useLearnCourse } from './LearnCourse.jsx';
import { LessonNotebook, LessonPractice, LessonReading, LessonSource } from './LearnExtras.jsx';
import LearnOutline from './LearnOutline.jsx';
import LessonPlanPreview from './LessonPlanPreview.jsx';
import NanoLessonReading, { useNanoProgress } from './NanoLessonReading.jsx';
import { nanoLesson, nanoSourceVersion } from './nanogpt-lesson.js';
import RepositorySource from './RepositorySource.jsx';
import ResizableSidePanel from './ResizableSidePanel.jsx';
import LearnPaper from './LearnPaper.jsx';
import { captureNotePage, notesScope, readNotes, writeNote, deleteNote } from './learn-notes.js';
import { architectureLesson, sampleCourse } from './learn-preview.js';

const LearnNotes = lazy(() => import('./LearnNotes.jsx'));
const LearnCanvas = lazy(() => import('./LearnCanvas.jsx'));

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
  const explanation = useRef(null);
  const boardRequest = useRef(0);
  const [boardVisible, setBoardVisible] = useState(false);
  const [boardStage, setBoardStage] = useState('Preparing explanation...');
  const dismissBoard = () => {
    boardRequest.current++;
    const old = explanation.current; explanation.current = null;
    old?.dispose(); setBoardVisible(false);
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
    ready: !!editor, status: boardStage, paper: paperContext, clearPaper: () => { setPaperContext(null); setPaperOpen(false); },
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
      explanation.current = { dispose: () => { layer.dispose(); previous?.dispose(); }, runId: snapshot.runId };
    },
    label: pinned.current?.label,
    preview: paperContext?.selection?.preview || preview,
    previewKind: paperContext?.selection ? 'paper' : 'canvas',
    removeImage: () => { removeImage(); setPaperContext(previous => previous ? { ...previous, selection: undefined } : previous); },
    pause: pauseLesson, setAnswering,
    clear: () => { pinned.current = null; editor?.selectNone(); removeImage(); refreshSelection(v => v + 1); },
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
    setRegion(false); pinned.current = null; removeImage();
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
  return <main className="flex min-w-0 flex-1 overflow-hidden max-lg:flex-col">
    <section aria-label="Learn" className="min-h-0 min-w-0 flex-1">
      <ExpandedPageFrame wide>
        {pendingNoteView && <ConfirmDialog title="Save notes before switching?" body="Save your changes and open the selected view, or cancel to keep editing." confirmLabel="Save notes" confirmVariant="primary" onCancel={() => setPendingNoteView(null)} onConfirm={async () => { if (await noteSave.current?.()) leaveNote(pendingNoteView); }} />}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><PeekBreadcrumbs items={[
            { label: 'Apps', onClick: () => navigate('/apps') },
            { label: app.repo || app.name, onClick: onBack },
            { label: 'Learn' },
          ]} /></div>
          <IconBtn aria-label="Minimize Learn" title="Back to app" onClick={onBack}><Minimize2 size={14} strokeWidth={1.5} /></IconBtn>
        </div>
        <div className="flex items-center justify-between gap-3 pb-4">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="text-2xl font-semibold">Learn</h1><span aria-label="Course title" className="text-base text-ink-2">{courseTitle}</span></div>
          {isRepository&&<Button variant="primary" onClick={onBack}><Network size={15}/>Graph</Button>}
        </div>
        <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <nav aria-label="Lesson views" className="flex flex-wrap gap-1">{['curriculum', 'lesson', 'notes'].map(value => <button key={value} type="button" disabled={!course.loaded || course.dirty && value !== 'curriculum'} aria-pressed={learningView === value} onClick={() => requestLearningView(value)} className={`rounded px-3 py-1.5 text-sm disabled:opacity-40 ${learningView === value ? 'bg-hover font-medium text-ink' : 'text-ink-2 hover:bg-hover'}`}>{value === 'notes' ? 'My notes' : value[0].toUpperCase() + value.slice(1)}</button>)}</nav>
          {!isRepository && <div className="flex gap-1">{['notebook', 'practice'].map(value => <button key={value} disabled={course.dirty} aria-pressed={learningView === value} onClick={() => requestLearningView(value)} className="rounded border border-line px-3 py-1.5 text-sm hover:bg-hover">{value === 'notebook' ? 'Notebook' : 'Quiz & flashcards'}</button>)}</div>}
        </div>
        {learningView === 'curriculum' && course.canAuthor && !(suppliedCourse && planOpen) && <div role="tablist" aria-label="Curriculum views" className="mb-4 flex gap-1">{[['edit', 'Edit course'], ['learner', 'Learner view']].map(([value, label]) => <button key={value} role="tab" aria-selected={value === 'edit' ? courseView : learnerOpen} disabled={course.dirty} className={`rounded px-3 py-1.5 text-xs hover:bg-hover ${(value === 'edit' ? courseView : learnerOpen) ? 'bg-hover font-medium' : 'text-ink-2'}`} onClick={() => { setCourseView(value === 'edit'); setSetupChat(value === 'edit'); setLearnerOpen(value === 'learner'); }}>{label}</button>)}</div>}
        {planStorageError && <p role="alert" className="mb-3 text-xs text-red-700">{planStorageError}</p>}
        {suppliedCourse && learningView === 'curriculum' && <LessonPlanPreview onPreview={editor && nanoProgress.loaded && !answering ? () => previewLesson(nanoLesson, true) : null} edits={course.canAuthor ? planEdits : {}} selectedSection={sectionTarget?.id} onEdit={target => { setSectionTarget(target); setSetupChat(true); }} course={course.course} learnerView={!course.canAuthor || learnerOpen} editorPanel={courseView ? coursePanel : null} view={planOpen ? 'plan' : 'curriculum'} selected={plannedLesson} onBack={() => { setPlanOpen(false); setSectionTarget(null); }} onSelect={index => { setPlannedLesson(index); setPlanOpen(true); }} />}
        {courseView && !suppliedCourse && coursePanel}
        {learnerOpen && !suppliedCourse && <LearnOutline allowSample={!isRepository} onToggleComplete={key => setCompleted(previous => ({ ...previous, [key]: !previous[key] }))} completed={completed} state={course} sample={sampleOutline} onSampleChange={setSampleOutline} activeId={lesson.current?.lessonId} activePage={progress?.page} disabled={!editor || answering || !!noteEditing} onOpen={async (content, view, index) => {
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
        }} />}
        <div className={`${courseView || learningView !== 'lesson' ? 'hidden' : ''} min-h-0 flex-1 overflow-y-auto pr-1`}>
        {(!isRepository || progress) && <div aria-label="Current lesson and section" className="mb-4"><h2 className="text-lg font-semibold">Lesson {sampleIndex >= 0 ? sampleIndex + 1 : 1}: {currentLesson?.title}</h2><p className="mt-1 text-sm text-ink-2">Section {(progress?.page || 0) + 1} of {pages.length}: {progress?.label || pages[0].label}</p></div>}
        {boardVisible && <div className="mb-2 flex items-center justify-between gap-2 py-2 text-xs text-ink-2"><span>Agent explanation · lesson paused</span><button type="button" onClick={dismissBoard} className="rounded border border-line bg-white px-2 py-1">Dismiss explanation</button></div>}
        <div className="flex items-start gap-2">
        {graphError && <p role="alert" className="text-sm text-red-700">{graphError}</p>}
        <div aria-label="Lesson canvas" onPointerDownCapture={event => { editor?.updateViewportScreenBounds(editor.getContainer()); pauseLesson(); openPaperReference(event); }} onClickCapture={openPaperReference} onWheelCapture={e => { if (!e.ctrlKey && !e.metaKey && !e.target.closest?.('[data-shape-type="interactive-graph"], [data-shape-type="three-d-viewer"]')) e.stopPropagation(); }} className={`relative h-[480px] min-h-[360px] min-w-0 flex-1 overflow-hidden rounded-lg border border-line`}>
          <Suspense fallback={<p className="p-4 text-sm text-ink-2">Loading canvas…</p>}>
            <LearnCanvas key={app.name} onReady={setEditor} />
          </Suspense>
          {region && <RegionPicker editor={editor} lesson={lesson.current} onCancel={cancelRegion} onSelect={(ids, ellipse) => {
            editor.select(...ids);
            pinned.current = captureSelection(editor, lesson.current);
            if (pinned.current) pinned.current.region = ellipse;
            preparePreview();
            setRegion(false);
            refreshSelection(v => v + 1);
          }} />}
        </div>
          <div className="flex shrink-0 self-center flex-col gap-1 rounded-lg border border-line bg-white p-1 shadow-sm">
            <IconBtn aria-label="Ask about selection" title="Ask about selection: draw a red ellipse" disabled={!editor || (!progress && !boardVisible) || answering} onClick={() => { pauseLesson(); pinned.current = null; removeImage(); setRegion(true); }}><Scan size={17} strokeWidth={1.5} /></IconBtn>
            <IconBtn aria-label="Add personal note" title="Pause and add a personal note" disabled={!editor || (!progress && !boardVisible) || !notesLoaded || answering} onClick={addNote}><NotebookPen size={17} strokeWidth={1.5} /></IconBtn>
            <IconBtn aria-label={narrationMuted ? 'Unmute narration' : 'Mute narration'} title={narrationMuted ? 'Unmute narration audio' : 'Mute narration audio'} aria-pressed={narrationMuted} onClick={() => { setMuted(!narrationMuted); setNarrationMuted(!narrationMuted); }}>{narrationMuted ? <VolumeX size={17} strokeWidth={1.5} /> : <Volume2 size={17} strokeWidth={1.5} />}</IconBtn>
          </div>
        </div>
        <div aria-label="Lesson playback" className={`${courseView || (isRepository && !progress) ? 'hidden' : 'flex'} shrink-0 flex-wrap items-center justify-between gap-3 pt-3`}>
          <div className="flex items-center gap-1">
            <button type="button" disabled={!progress || progress.page === 0 || answering} onClick={() => navigateLesson('back')} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-ink-2 hover:bg-hover disabled:opacity-40"><ChevronLeft size={14} />Back</button>
            <button type="button" disabled={!editor || (progress?.page === pages.length - 1 && progress.pageComplete) || answering} onClick={() => { setRegion(false); if (!progress) startDemo.current?.(); else progress.playing ? pauseLesson() : playback.current?.play(); }} className="flex min-w-20 items-center justify-center gap-1.5 rounded border border-line px-3 py-1.5 text-xs hover:bg-hover disabled:opacity-40">{progress?.playing ? <Pause size={14} /> : <Play size={14} />}{progress?.playing ? 'Pause' : 'Play'}</button>
            <button type="button" disabled={!progress || (progress.page === pages.length - 1 && progress.pageComplete) || answering} onClick={() => navigateLesson('next')} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-ink-2 hover:bg-hover disabled:opacity-40">Next<ChevronRight size={14} /></button>
          </div>
          <span aria-live="polite" className="text-xs text-ink-2">{progress ? `Page ${progress.page + 1} of ${pages.length} · ${progress.label}` : 'Logistic regression · 3 pages'}</span>
        </div>
        <div className={`${courseView || (isRepository && !progress) ? 'hidden' : ''} shrink-0 pt-2 pb-1`}>
          <div className="relative flex items-center">
            <input type="range" aria-label="Lesson timeline" aria-valuetext={progress ? `Page ${progress.page + 1} of ${pages.length}, ${Math.round((progress.timeline / 1000 - progress.page) * 100)} percent` : 'Start the lesson to scrub'} min="0" max={pages.length * 1000} step="1" value={progress?.timeline || 0} disabled={!progress || answering} onPointerDown={pauseLesson} onChange={e => navigateLesson('scrub', Number(e.target.value))} className="h-4 w-full cursor-pointer accent-accent disabled:opacity-40" />
            {pages.slice(1).map((_, i) => <span key={i} style={{ left: `${(i + 1) * 100 / pages.length}%` }} className="pointer-events-none absolute h-2 w-px bg-white" />)}
          </div>
          <div className="mt-1 grid gap-2 text-[10px] text-ink-2" style={{ gridTemplateColumns: `repeat(${pages.length}, minmax(0, 1fr))` }}>
            {pages.map(({ label }, i) => <button key={i} type="button" disabled={!progress || answering} onClick={() => navigateLesson('seek', i)} className="truncate text-left hover:text-ink disabled:opacity-40" title={label}>{i + 1}. {i === 1 && lesson.current?.lessonId === 'sigmoid-demo' ? 'The formula' : label}</button>)}
          </div>
        </div>
        <div className="mt-5">{nanoActive ? <NanoLessonReading page={progress?.page || 0} progress={nanoProgress} onSource={source => { pauseLesson(); setPaperOpen(false); setSourceOpen(false); setLessonSource(source); }} /> : isRepository ? <p className="whitespace-pre-wrap text-sm text-ink-2">{narration}</p> : <LessonReading architecture={lesson.current?.lessonId === architectureLesson.id} page={progress?.page || 0} narration={narration} onSource={() => { pauseLesson(); setSourceOpen(true); }} onNotebook={() => changeLearningView('notebook')} />}</div>
        </div>
        {!courseView && learningView === 'notes' && <Suspense fallback={<p className="text-sm text-ink-2">Loading notes...</p>}><LearnNotes saveRef={noteSave} onChange={setNoteChanged} records={noteRecords} editing={noteEditing} onSave={saveNote} onDelete={removeNote} onResume={returnToNoteLesson} onEdit={record => { setNoteChanged(false); setNoteEditing(record); }} onReturn={() => setNoteEditing(null)} loaded={notesLoaded} error={notesError} /></Suspense>}
        <LessonNotebook active={!courseView && learningView === 'notebook'} />
        <LessonPractice mode={practiceMode} setMode={setPracticeMode} active={!courseView && learningView === 'practice'} onReview={async index => {
          if (lesson.current?.lessonId !== architectureLesson.id) await previewLesson(architectureLesson);
          setCourseView(false); changeLearningView('lesson'); navigateLesson('seek', index);
        }} />
      </ExpandedPageFrame>
    </section>
    <ResizableSidePanel aria-label="Learn agent chat" resizeLabel="Resize Learn panel" onClickCapture={openPaperReference} className="px-5 pt-6 pb-4">
      <div className="mb-3 flex shrink-0 items-center gap-3">
        <div role="progressbar" aria-label={suppliedCourse ? "Lesson 1 participation progress" : "Course completion"} aria-valuemin={0} aria-valuemax={sectionKeys.length} aria-valuenow={finishedCount} className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover"><div className="h-full rounded-full bg-green-600 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${sectionKeys.length ? finishedCount / sectionKeys.length * 100 : 0}%` }} /></div>
        <Trophy size={18} role="img" aria-label={suppliedCourse ? 'Complete all six pages and three objective checks to finish Lesson 1' : allFinished ? 'Course complete' : 'Complete all sections and activities to earn this award'} className={allFinished ? 'text-green-600 drop-shadow-sm' : 'text-ink-3 opacity-35'} />
      </div>
      {setupChat && <CourseInterview state={course} app={app} sectionEditor={suppliedCourse ? sectionEditor : null} />}
      <div className={`${setupChat ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col`}>
      {narration && !paperOpen && !sourceOpen && !lessonSource && !learnerOpen && <details className="mb-3 max-h-40 overflow-auto rounded border border-line p-3 text-sm" open><summary className="cursor-pointer text-xs font-medium">Current page explanation</summary><p className="mt-2 whitespace-pre-wrap text-ink-2">{narration}</p></details>}
      {app.hosting === 'aws' && !app.app_chat
        ? <p className="text-sm text-ink-2">Coaching is not connected for AWS jobs yet. Your job data stays in your AWS account.</p>
        : <AskPanel onGraph={onGraph} key={app.name} scope={{ app: app.name }} appName={app.name} chatConfig={app.app_chat} repositoryContext={nanoActive ? { commit: nanoSourceVersion } : isRepository && lesson.current?.lessonId?.startsWith('course-') ? { commit: course.course?.sourceVersion } : repositoryContext} conversation="learn" headerTitle="Learn Agent" demo={isRepository ? null : demo} boardContext={boardContext} contentPanel={lessonSource ? <RepositorySource appName={app.name} {...lessonSource} onClose={() => setLessonSource(null)} /> : paperOpen && paperContext ? <LearnPaper app={app.name} paper={paperContext} onPage={page => setPaperContext(previous => ({ ...previous, page, selection: undefined }))} onSelect={selection => { removeImage(); pinned.current = null; setPaperContext(previous => ({ ...previous, selection })); }} onClose={() => setPaperOpen(false)} /> : sourceOpen ? <LessonSource onClose={() => setSourceOpen(false)} /> : null} onCloseContentPanel={() => { setPaperOpen(false); setSourceOpen(false); setLessonSource(null); }} placeholder={`Ask about ${app.repo || app.name}…`} autoFocus />}
      </div>
    </ResizableSidePanel>
  </main>;
}
