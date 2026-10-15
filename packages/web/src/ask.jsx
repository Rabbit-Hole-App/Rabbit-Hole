import ChatComposer, { COMPOSER_ADD, COMPOSER_PILL, COMPOSER_TOOL } from './ChatComposer.jsx';
import ModeSelector from './ModeSelector.jsx';
import ContextChips from './ContextChips.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';
import { refsForSend } from './chat-draft.js';
import { MAX_REFS, sameRef } from './chat-context.js';
import { turnHasPage, turnPaper, tutorPage } from './pdf-source.js';
import { chatHistory, refIds } from './chat-canvas-context.js';
import { VoiceField, VoiceToggle } from './VoiceMode.jsx';
import ContextDocs from './ContextDocs.jsx';
import { CONTEXT_ACCEPT, useContextDocs } from './context-docs.js';
import RepositorySource, { SourceSelectionContext } from './RepositorySource.jsx';
import { codeRef } from './chat-sources.js';
// ─── Ask (phase 1 - read only): the chat panel behind the Agent tab, the run
// peek's ask box, and ⌘K's Ask tab. POST /api/ask streams SSE; org-scope
// ambiguity comes back as { choose } and renders candidate pills. ───
import { useEffect, useRef, useState } from 'react';
import { CodeRefs } from './code-refs.js';
import { ChatMessages, RunResultCard } from './ChatMessages.jsx';
import { useFollowLatest } from './chat-scroll.js';
import { ArrowUp, AtSign, BookOpen, ChevronUp, CornerDownRight, Eraser, RefreshCw, Copy, Crown, Feather, FileText, Files, Globe, History, Loader2, MoreHorizontal, Minus, Package, Paperclip, Pencil, Play, Plus, ScrollText, Shield, SlidersHorizontal, Trash2, X, Zap, Library, Upload } from 'lucide-react';
import { ago, api, navigate, wsHeaders } from './api.js';
import { colorLine } from './code.jsx';
import { contextPassage } from './map-files.js';
import { MODEL_CHOICES } from './model-choices.js';
import { canvasTargetField } from './learn-ask-target.js';
import { destinationOf } from './answer-destination.js';
import { commandTone } from './CommandTone.jsx';
import { TutorPromptTray, journeyStartsHere } from './LearnJourney.jsx';
import { composerKey } from './composer-keys.js';
import { holdsLine, parseSlash, releaseLine } from './learn-slash.js';
import { openOnce } from './learn-opening.js';
import { lateEvent, settle, withAnswerMeta, withDone } from './chat-threads.js';
import { newThreadId, turnSaver } from './chat-persist.js';
import { tutorTurn } from './chat-route.js';
import { cn, ConfirmDialog, KindIcon, Menu, MenuItem, SlidePanel, Toggle } from './ui.jsx';

// What the agent may read, per scope - the ⚙ picker mirrors Notion's "My sources".
// Mentioned apps a chat reads at most (MENTION_LIMIT in control-plane learn-models.js).
const MENTION_CHIPS = 3;
const SOURCE_OPTIONS = {
  run: [['log', 'Log'], ['outputs', 'Outputs'], ['runbook', 'Runbook'], ['review', 'Review'], ['agent', 'AGENT.md']],
  app: [['runs', 'Runs'], ['requests', 'Request log'], ['runbook', 'Runbook'], ['review', 'Review'], ['agent', 'AGENT.md']],
};
const PRIVATE_SOURCE_OPTIONS = {
  run: [['log', 'Log'], ['outputs', 'Outputs']],
  app: [['runs', 'Recent runs'], ['log', 'Latest run log'], ['outputs', 'Latest run outputs']],
};
const SOURCE_ICON = { log: ScrollText, outputs: Package, runs: Play, requests: Globe, runbook: BookOpen, review: Shield, agent: FileText };
// model rows carry a strength icon + one-word hint (Opus strongest, Haiku fastest)
const MODEL_ICON = { auto: SlidersHorizontal, 'opus-5': Crown, 'sonnet-5': Zap, 'haiku-4.5': Feather };
const MODEL_META = Object.fromEntries(MODEL_CHOICES.map(({ key, hint }) => [key, [MODEL_ICON[key], hint]]));

// Model picker keys → labels (server holds the allowlist; auto = default).
const MODELS = MODEL_CHOICES.map(({ key, label }) => [key, label]);

export { Md } from './Md.jsx';

// Code references on a repository context (code-refs.js; repository-browser.md "Code references"): inside it a path:start-end
// in an answer is a link only when the snapshot has that file, and a click opens it in that page's reader with the range
// selected - Learn's Files panel on the Main canvas, the Map's Files view on the Map. No model is asked. Elsewhere `onFile` decides.
export { CodeRefs };

// The cited file in a side panel, scrolled to (and highlighting) the cited line.
const evidenceCrumbs = (appName, label, onBack) => [
  { label: 'Apps', onClick: () => navigate('/apps') },
  ...(appName ? [{ label: appName, onClick: () => navigate('/apps/' + encodeURIComponent(appName)) }, { label: 'Agent' }] : []),
  { label: 'Chat', onClick: onBack }, { label },
];

export function FilePeek({ appName, path, line, lineEnd, onClose }) {
  const [content, setContent] = useState(null);
  // a citation spanning the whole file highlights nothing: all-green is no signal
  const total = content ? content.split('\n').length : 0;
  const whole = line === 1 && lineEnd && total && lineEnd >= total - 1;
  const hi = (n) => !whole && line && n >= line && n <= (lineEnd || line);
  const [err, setErr] = useState(null);
  const lineRef = useRef(null);
  useEffect(() => {
    api('/api/ask/file', { method: 'POST', body: JSON.stringify({ app: appName, path }) })
      .then((d) => setContent(d.content))
      .catch((e) => setErr(e.message));
  }, [appName, path]);
  useEffect(() => {
    if (content && lineRef.current) lineRef.current.scrollIntoView({ block: 'center' });
  }, [content]);
  return (
    <SlidePanel
      width={560}
      expandable
      breadcrumbs={evidenceCrumbs(appName, path, onClose)}
      z={40}
      onClose={onClose}
      title={
        <>
          <span className="truncate font-mono text-sm">{path}{line ? `:${line}${lineEnd ? `-${lineEnd}` : ''}` : ''}</span>
          <button
            aria-label="Copy file"
            title="Copy"
            onClick={() => { navigator.clipboard.writeText(content || ''); }}
            className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink"
          >
            <Copy size={13} strokeWidth={1.5} />
          </button>
        </>
      }
    >
      <div data-panel-content className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {err && <div role="alert" className="flex items-start gap-2 text-sm text-danger"><span className="min-w-0 flex-1">✗ {err}</span><button type="button" aria-label="Copy error" title="Copy error" onClick={() => navigator.clipboard.writeText(String(err))} className="shrink-0 rounded p-1 hover:bg-danger/10"><Copy size={14} /></button></div>}
        {content == null && !err && <span className="flex items-center gap-2 text-xs text-ink-2"><Loader2 size={14} className="animate-spin text-ink-3" />Reading source?</span>}
        {content != null && (
          <pre className="rounded-sm bg-code p-3 font-mono text-xs leading-relaxed text-ink">
            {content.split('\n').map((l, i) => (
              <div key={i} ref={i + 1 === line ? lineRef : null} className={cn('flex gap-3 px-1', hi(i + 1) && 'rounded-xs bg-[#DBEDDB] dark:bg-[#1C3829]')}>
                <span className="w-7 shrink-0 text-right text-ink-3 select-none">{i + 1}</span>
                <span className="whitespace-pre-wrap">{colorLine(l)}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </SlidePanel>
  );
}


// One chat, scoped: {app} | {run} | {} (org). Style per the Notion AI reference -
// user turns as a right-aligned bubble, answers as plain text, pill input at the bottom.
// The Learn chat sheet's History lists only chats started in the sheet: card
// questions and grading also make learn threads, and the server does not say
// which is which.
// ponytail: remembered per browser; a thread source column when History must follow the learner across devices.
const sheetThreadsKey = app => `small.learn-sheet-threads:${app || ''}`;
const sheetThreadIds = app => { try { return JSON.parse(localStorage.getItem(sheetThreadsKey(app)) || '[]'); } catch { return []; } };
const rememberSheetThread = (app, id) => {
  try { localStorage.setItem(sheetThreadsKey(app), JSON.stringify([String(id), ...sheetThreadIds(app).filter(entry => entry !== String(id))].slice(0, 50))); }
  catch { /* storage off: History stays empty */ }
};

// A selected card's material, by icon (the composer strip).
export function MaterialIcon({ type }) {
  const Icon = type === 'wiki' ? Globe : ['paper', 'pdf', 'slide'].includes(type) ? FileText : type === 'video' ? Play : type === 'notebook' ? BookOpen : ScrollText;
  return <Icon size={13} aria-hidden="true" className="shrink-0 text-ink-3" />;
}

// Professor Next Steps (docs/features/professor-next-steps.md §1.2, §1.6): the one hook card, on owned and shared canvases.
// Exactly the 3 hooks of a set, verbatim and in order: ready, or stale (kept on screen, its buttons disabled, until the new set
// lands); any other status draws nothing. A click validates through select() and hands the step on once: the clicked hook
// shows a spinner and no second click goes through. The step itself is never read or shown here.
// r29 (owner 2026-10-08): the next-section hook names where it goes; when this section's evidence is not met it skips it.
// A selected page of a context document rides as that document's ref at its page (pdf-to-canvas.md): first, once, within the limit.
const withPage = (refs, page) => (page && !refs.some(ref => sameRef(ref, page)) ? [page, ...refs].slice(0, MAX_REFS) : refs);
const sectionNote = section => (section.skips ? 'Next section - skips this section' : 'Next section');
// HOOK_ROW: one option's height, two lines of hook text, so the skeleton and the three hooks are the same size.
const HOOK_ROW = 'min-h-14 rounded-lg border border-line';
// The card's header (owner brief 2 item 6): Refresh asks the same pipeline for a new set (a ready set only, one at a time);
// Minimize folds the card to a chip. Neither sends a message, navigates, adds a card or starts a Rabbit Hole.
function NextStepsHeader({ steps, spinning = false, onMinimize }) {
  const refreshing = steps.refresh_state === 'loading';
  return (
    <div className="flex items-center gap-1">
      <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-ink-2">Curious where this goes?{spinning && <Loader2 size={12} aria-hidden="true" className="shrink-0 animate-spin text-ink-3 motion-reduce:animate-none" />}</h2>
      {typeof steps.refresh === 'function' && (
        <button type="button" data-next-steps-refresh aria-label="Refresh suggestions" title="Refresh suggestions: a new set for this canvas" disabled={steps.status !== 'ready' || refreshing} aria-busy={refreshing || undefined}
          onClick={() => steps.refresh()} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink disabled:opacity-50 disabled:hover:bg-transparent">
          <RefreshCw size={13} className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
        </button>
      )}
      <button type="button" data-next-steps-minimize aria-label="Minimize suggestions" title="Minimize suggestions" aria-expanded="true" onClick={onMinimize}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"><Minus size={13} /></button>
    </div>
  );
}

export function NextStepsCard({ steps, onPick }) {
  const [working, setWorking] = useState(null);
  // Minimized: a small chip that frees the card's room; Restore shows the same suggestions again, never asking for new ones.
  const [minimized, setMinimized] = useState(false);
  // The last set's height: the skeleton that replaces it keeps it, so the card does not change size while the next set loads.
  const frame = useRef(null), height = useRef(0);
  useEffect(() => { if (steps?.status === 'ready' && frame.current) height.current = frame.current.offsetHeight; });
  if (!steps) return null;
  const visible = steps.status === 'loading' || steps.status === 'stale' || (steps.status === 'ready' && steps.options.length === 3);
  if (minimized && visible) return (
    <section data-next-steps={steps.status} data-next-steps-minimized aria-label="Curious where this goes? (minimized)" className="ml-auto flex w-max max-w-full items-center gap-1 rounded-full border border-line bg-white py-1 pr-1 pl-3 shadow-pop">
      <span className="truncate text-xs font-medium text-ink-2">Curious where this goes?</span>
      <button type="button" data-next-steps-restore aria-label="Restore suggestions" title="Show the suggestions" aria-expanded="false" onClick={() => setMinimized(false)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink"><ChevronUp size={14} /></button>
    </section>
  );
  // A set on its way for this basis, loading or stale (owner, 2026-10-08: "if the questions are still being loaded just show
  // the skeleton and a spinner and not the previous question"): the same card with three placeholder rows and a spinner,
  // never the previous hooks (contract §1.2). Unavailable, whatever its reason, draws nothing.
  if (steps.status === 'loading' || steps.status === 'stale') {
    return (
      <section data-next-steps={steps.status} data-next-steps-skeleton aria-label="Curious where this goes?" aria-busy="true" style={height.current ? { minHeight: height.current } : undefined} className="flex w-full flex-col gap-1.5 rounded-xl border border-line bg-white p-3 shadow-pop">
        <NextStepsHeader steps={steps} spinning onMinimize={() => setMinimized(true)} />
        <span className="sr-only">Loading suggestions</span>
        {[0, 1, 2].map(row => <div key={row} aria-hidden="true" data-next-step-placeholder className={`${HOOK_ROW} flex-1 bg-hover motion-safe:animate-pulse`} />)}
      </section>
    );
  }
  if (steps.status !== 'ready' || steps.options.length !== 3) return null;
  const pick = async hook => {
    if (working) return;
    const r = steps.select(hook.id);
    if (!r.ok) return;
    setWorking(hook.id);
    try { await onPick(r.selected_next_step, hook); } finally { setWorking(null); }
  };
  return (
    <section ref={frame} data-next-steps={steps.status} data-next-steps-refresh-state={steps.refresh_state || undefined} aria-label="Curious where this goes?" className="flex w-full flex-col gap-1.5 rounded-xl border border-line bg-white p-3 shadow-pop">
      <NextStepsHeader steps={steps} onMinimize={() => setMinimized(true)} />
      {steps.refresh_state === 'loading' && <span role="status" className="sr-only">Refreshing suggestions</span>}
      {steps.refresh_state === 'error' && (
        <p role="alert" data-next-steps-refresh-error className="flex items-center gap-2 text-xs text-ink-2">
          {steps.refresh_reason === 'limited' ? 'Refresh limit reached for now; these suggestions stay.' : 'Could not refresh; these suggestions stay.'}
          {steps.refresh_reason !== 'limited' && <button type="button" onClick={() => steps.refresh()} className="font-medium text-ink underline-offset-2 hover:underline">Try again</button>}
        </p>
      )}
      {steps.options.map(hook => (
        <button key={hook.id} type="button" data-next-step={hook.id} data-next-section={hook.section?.id} aria-label={hook.section ? `${hook.hook} (${sectionNote(hook.section)})` : undefined} disabled={!!working} aria-busy={working === hook.id || undefined} onClick={() => pick(hook)}
          className="flex min-h-14 w-full cursor-pointer items-start gap-2 rounded-lg border border-line px-3 py-2 text-left text-sm text-ink hover:border-[#b42318]/40 hover:bg-hover disabled:cursor-default disabled:opacity-55 disabled:hover:border-line disabled:hover:bg-transparent">
          {working === hook.id ? <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-ink-3" /> : <CornerDownRight size={14} className="mt-0.5 shrink-0 text-[#b42318]/70" />}
          <span className="min-w-0">{hook.hook}{hook.section && <span data-next-section-note className="block text-xs text-ink-3">{sectionNote(hook.section)}</span>}</span>
        </button>
      ))}
    </section>
  );
}

// The hole openings this tab has sent, by opening key (openOnce): module-level, not a ref, so a dock remounted while the
// hole's board lands from the server (LearnPage canvasEpoch) never sends the same opening twice.
const openedHoles = new Set();
export function AskPanel({ scope, appName = null, placeholder = 'Ask anything…', compact = false, composerOnly = false, autoFocus = false, onSent = null, onHasChat = null, headerExtra = null, headerTitle = null, conversation = 'agent', chatConfig = null, demo = null, boardContext = null, contentPanel = null, onCloseContentPanel = null, repositoryContext = null, repositoryExcerpt = null, onClearRepository = null, onGraph = null, onExchange = null, canvasSeed = null, canvasTarget = null, onClearCanvasTarget = null, slash = null, tutor = null, dock = false, sheet = false, onAddToCanvas = null, voice = null, journey = null, journeyStarter = null, journeySetup = false, tray = null, nextStepRef = null }) {
  const repository = appName?.startsWith('repo-');
  const [repositoryCommit, setRepositoryCommit] = useState(repositoryContext?.commit || null);
  const [codeSelection, setCodeSelection] = useState(null);
  const chatApi = (path, options) => {
    if (!repository) return api(path, options);
    const tail = path.replace('/api/ask/threads', '').split('?')[0];
    const action = tail.endsWith('/delete') ? 'DELETE' : tail.endsWith('/rename') ? 'PATCH' : null;
    return api(`/api/repositories/${appName}/threads${tail.replace(/\/(delete|rename)$/, '')}`, action ? { ...options, method: action } : options);
  };
  const privateChat = chatConfig?.provider === 'bedrock';
  // A standalone canvas chat (canvases.js): no + attachments, and no app context to filter.
  const canvasChat = /^canvas-[a-f0-9]{8}$/.test(scope.app || '');
  const learnChat = conversation === 'learn';
  // The Learn Chat pane (owner brief 2026-10-13 sections 3-5): the one Learn AskPanel that is neither the canvas dock nor a
  // card's follow-up composer. Its thread, History, New chat and resume (A2), and its draft, / command and mode (A3a) live
  // in the chat workspace, so menus, mode changes and resizing never clear them. Every other chat (chat === null) keeps its own state.
  const workspace = useChatWorkspace();
  const chat = workspace && learnChat && !composerOnly && !canvasSeed ? workspace : null, chatThread = chat ? chat.thread : null;

  // Voice Mode (VoiceMode.jsx, the dock only): while on, the field is the voice state, the side controls rest, and
  // tutor.extras move to the left caption.
  const voiceOn = !!((dock || chat) && voice && voice.state !== 'off');
  const guardedHistory = privateChat || learnChat;
  const [msgs, setMsgs] = useState([]);
  // The Learn canvas dock (sheet): plain questions answer in a panel above the
  // composer, in one thread, and make no card; Add to canvas turns an answer
  // into a card. Asking about a selected card still answers as a linked card.
  const sheetMode = sheet && composerOnly;
  const [sheetOpen, setSheetOpen] = useState(true);
  const [sheetHistory, setSheetHistory] = useState(false);
  const sheetThread = useRef(null);
  const [localInput, setLocalInput] = useState('');
  const input = chat ? chat.composer.text : localInput, setInput = chat ? chat.composer.setText : setLocalInput;
  // Learn's command slot (owner 2026-09-30; "/" since 2026-10-13): "/", or the chosen command as a removable pill. The command
  // is structured state beside the text, never parsed back out of it. `stash` keeps the typed text while
  // the palette is open over it, so choosing or closing gives it back.
  const [localCommand, setLocalCommand] = useState(null);
  const command = chat ? chat.composer.command : localCommand, setCommand = chat ? chat.composer.setCommand : setLocalCommand;
  const stash = useRef(null);
  const setComposerInput = (value) => {
    const chosen = slash && value.match(/^\/([\w-]+) $/);
    if (chosen && slash.isCommand?.(chosen[1])) { setCommand(chosen[1]); setInput(stash.current ?? ''); stash.current = null; return; }
    if (value === '' && stash.current !== null) { setInput(stash.current); stash.current = null; return; }
    setInput(value);
  };
  // Auto (and a pill's name) open the palette on its own search field (LearnSlash.jsx); typing / searches from the composer.
  const openPalette = () => { if (!input.startsWith('/')) { stash.current = input; setInput('/'); } slashRef.current?.search(); };
  // A click outside the composer closes the command palette the way Escape does (LearnSlash.jsx):
  // the command search is dropped and what was typed before it comes back.
  const composerBox = useRef(null);
  const paletteOpen = !!slash && input.startsWith('/');
  useEffect(() => {
    if (!paletteOpen) return;
    const away = event => { if (!composerBox.current?.contains(event.target)) setComposerInput(''); };
    document.addEventListener('pointerdown', away, true); // capture: the canvas stops its own pointer events
    return () => document.removeEventListener('pointerdown', away, true);
  }, [paletteOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState(null); // { message, candidates }
  const [file, setFile] = useState(null); // one attachment per question
  const [mentions, setMentions] = useState([]); // @app chips
  const [plusOpen, setPlusOpen] = useState(false);
  // Canvas context documents (canvas-context-docs.md): the composer's Context button and list.
  const contextDocs = useContextDocs(scope?.app);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [threads, setThreads] = useState([]); // past chats for this scope
  const [view, setView] = useState('chat'); // 'chat' | 'history' - history REPLACES the chat
  const [rowMenu, setRowMenu] = useState(null); // thread id with its ⋯ open
  const [renaming, setRenaming] = useState(null); // { id, value }
  const [confirmDel, setConfirmDel] = useState(null); // thread pending delete
  const [runPeek, setRunPeek] = useState(null);
  const [filePeek, setFilePeekHere] = useState(null); // { path, line } from a Sources click
  // On the Learn Chat a cited file opens in the Sources pane beside the transcript (brief 6, 13.1); elsewhere it peeks here.
  const setFilePeek = peek => (chat && peek ? chat.openSource(codeRef({ commit: repositoryCommit || repositoryContext?.commit || '', path: peek.path, start: peek.line, end: peek.lineEnd })) : setFilePeekHere(peek));
  const fileApp = appName || scope.app || null; // /api/ask/file needs the app name
  const scopeKind = scope.run ? 'run' : scope.app ? 'app' : 'org';
  const scopeRef = scope.run || scope.app || null;
  const historyScope = learnChat ? 'learn' : scopeKind;
  const askPath = learnChat ? '/api/learn/ask' : '/api/ask';
  const srcOpts = repository || canvasChat ? [] : (privateChat ? PRIVATE_SOURCE_OPTIONS : SOURCE_OPTIONS)[scopeKind] || [];
  const [srcOn, setSrcOn] = useState(() => new Set(srcOpts.map(([k]) => k)));
  const [srcOpen, setSrcOpen] = useState(false);
  // Learn never shows a model: users choose intent, Rabbit Hole chooses the model (the server's auto routing).
  const [model, setModel] = useState(() => privateChat || learnChat ? 'auto' : localStorage.getItem('small.askModel') || 'auto'); // Settings > Small AI sets the default
  const modelOptions = privateChat ? [['auto', 'Bedrock']] : MODELS;
  const [modelOpen, setModelOpen] = useState(false);
  const [appNames, setAppNames] = useState(null); // lazy, for @-mentions
  const threadId = useRef(null);
  useEffect(() => { if (chatThread) threadId.current = chatThread.id; }, [chatThread?.id]);
  const historyRequest = useRef(0);
  const boxRef = useRef(null);
  const localInputRef = useRef(null);
  const inputRef = chat ? chat.composer.inputRef : localInputRef;
  const fileRef = useRef(null);
  useEffect(() => {
    if (!demo?.startRef) return;
    demo.startRef.current = () => send(demo.prompt);
    return () => { demo.startRef.current = null; };
  });

  // "@yol" at the end of the input → app-name suggestions
  // The server reads at most three mentions, so the composer offers no fourth chip.
  const atMatch = privateChat || mentions.length >= MENTION_CHIPS ? null : input.match(/@([a-z0-9-]*)$/);
  useEffect(() => {
    if (atMatch && appNames === null) api('/api/apps').then((d) => setAppNames(d.apps.map((a) => ({ name: a.name, kind: a.kind, schedule: a.schedule })))).catch(() => setAppNames([]));
  }, [!!atMatch]);
  // Only apps this chat can resolve: a repository chat reads other repositories,
  // any other chat reads deployed apps (never canvases); never the chat's own app.
  const atHits = atMatch && appNames ? appNames.filter((a) => a.name.includes(atMatch[1]) && a.name !== appName && (repository ? a.name.startsWith('repo-') : !a.name.startsWith('repo-') && !a.name.startsWith('canvas-'))) : [];

  // An Ask action (agent/scope.js askDraft) writes its question here and focuses; it never sends (owner, 2026-10-08).
  // The learner's own words stay; only an untouched earlier question is replaced.
  const typed = useRef(''), prefilled = useRef(null);
  typed.current = input;
  useEffect(() => {
    const focus = (e) => {
      const text = e.detail?.text;
      if (text && (!typed.current.trim() || typed.current === prefilled.current)) { prefilled.current = text; setInput(text); }
      inputRef.current?.focus();
    };
    if (canvasSeed) return;
    window.addEventListener('small:ask-focus', focus);
    return () => window.removeEventListener('small:ask-focus', focus);
  }, []);

  // Resume the latest saved thread for this scope on mount.
  const loadThread = async (id, toChat = true, request = ++historyRequest.current) => {
    if (chatThread) return chatThread.open(id).catch(() => {});
    try {
      const d = await chatApi(`/api/ask/threads/${id}`);
      if (repository) { setRepositoryCommit(d.commit); setCodeSelection(null); }
      if (guardedHistory && request !== historyRequest.current) return;
      threadId.current = d.id;
      sheetThread.current = d.id;
      setMsgs(d.messages);
      setChoices(null);
      if (d.messages?.length) onHasChat?.(); // the parent may surface a Chat tab
      if (toChat) setView('chat'); // the silent resume-on-mount must not yank the user out of History
    } catch { /* stale id - stay on the empty chat */ }
  };
  const threadsPath = `/api/ask/threads?scope=${historyScope}${scopeRef ? `&ref=${encodeURIComponent(scopeRef)}` : ''}${privateChat ? `&app=${encodeURIComponent(fileApp)}` : ''}`;
  useEffect(() => {
    if (composerOnly || canvasSeed || chatThread) return; // Canvas conversations never resume an unrelated thread; the Chat pane's thread resumes itself (chat-threads.js).
    const request = ++historyRequest.current;
    chatApi(threadsPath)
      .then(async (d) => {
        if (guardedHistory && request !== historyRequest.current) return;
        setThreads(d.threads || []);
        if (d.threads?.[0]) await loadThread(d.threads[0].id, false, request);
      })
      .catch(() => {});
    return () => { if (guardedHistory) historyRequest.current++; };
  }, [historyScope, scopeRef, privateChat, appName]);
  const newChat = () => { if (chatThread) { boardContext?.removeImage(); return chatThread.newChat(); } setCodeSelection(null); setFilePeek(null); setRepositoryCommit(repositoryContext?.commit || null); boardContext?.clearPaper?.(); onCloseContentPanel?.(); historyRequest.current++; threadId.current = null; sheetThread.current = null; setSheetHistory(false); boardContext?.removeImage(); setMsgs([]); setChoices(null); setView('chat'); };
  const follow = useFollowLatest(boxRef, [msgs]);

  // Learn / commands (LearnSlash.jsx): a line starting with / runs as a
  // command, never as a chat message. held: a /command Enter while busy (learn-slash.js holdsLine), sent when busy clears.
  const slashRef = useRef(null), held = useRef(null);
  // The command a sent /line ran, so a command whose prompt comes back to this chat route (onPrompt) is named in its body.
  const promptCommand = useRef(null);
  // Stop (the docked shell): aborts the answer being streamed.
  const answerFlight = useRef(null);
  // A thread opened from History, New chat or a canvas change (thread.restore.key) replaces the transcript with its saved
  // messages. A turn still streaming for the old thread runs on to the server, which saves it there, but it no longer holds
  // this composer, and its late events are dropped (contract A5).
  useEffect(() => {
    if (!chatThread) return;
    setMsgs(chatThread.restore.messages || []); setChoices(null); setCodeSelection(null); setView('chat');
    if (answerFlight.current) { answerFlight.current = null; setBusy(false); }
  }, [chatThread?.restore.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // The restore keeps the transcript this pane shows, so a remounted Chat pane comes back to it, not to the thread as opened.
  useEffect(() => { if (chatThread) chatThread.restore.messages = msgs; }, [msgs]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (raw, scopeOverride, { opening = false, skipJourney = false, command: commandName = null, regenerate = null } = {}) => {
    // A chosen command pill sends exactly "/command text" (LearnSlash runs it); the slot goes back to "/".
    // A typed /command replaces the pill rather than nesting inside it.
    if (!regenerate && slash && command && !raw.trim().startsWith('/')) { const line = `/${command} ${raw.trim()}`.trim(); promptCommand.current = command; setCommand(null); setInput(''); slashRef.current?.intercept(line); return; }
    if (!regenerate && slash && raw.trim().startsWith('/')) { promptCommand.current = parseSlash(raw)?.name || null; setCommand(null); if (slashRef.current?.intercept(raw)) return; }
    // An explicit Ask never goes to the journey resolver or starts a journey (owner brief section 5): a course or journey
    // on this canvas must not turn an Ask turn into syllabus work.
    if (chat?.thread.mode === 'ask') skipJourney = true;
    // Learning journeys (LearnJourney.jsx, adaptive-learning-path-v1-architecture.md §6.1, §7.2): on a board with a
    // journey (or an open Tutor Prompt Tray) a turn goes through the shared resolver first. A tray answer, path edit,
    // cancel, clarification or a second broad intent (continue or start?) is the journey's: no chat bubble, no card, no
    // /api/learn/ask, no Tutor call. An unrelated question (or Ask the Tutor) goes on to the responder below. A failed
    // journey request gives the words back to the composer. LP1 Task 12: a live journey makes the Tutor this canvas's
    // responder, and its turn runs the resolver for typed and voice turns alike (LearnTutor.jsx), so the call here is
    // left for a canvas with no Tutor, whose only trays belong to a journey being started (What do you want to learn?).
    let routed = null;
    if ((journey?.journey || journey?.tray) && !skipJourney && raw.trim() && !busy) {
      if (journey.busy) { tutor?.slash?.(null); return; } // the words stay in the composer while the tray works
      if (!tutor) {
        setInput('');
        routed = await journey.handleText(raw.trim());
        if (routed.handled) {
          if (routed.failed) setInput(current => current || raw);
          return;
        }
        raw = routed.text ?? raw;
      }
    }
    // A broad learning intent on a canvas with no journey and no Tutor starts one on the server (§6.1); the tray opens.
    if (!routed?.text && !skipJourney && !busy && journeyStartsHere(raw, { tutor, journeyStarter })) {
      setInput('');
      const started = await journeyStarter(raw.trim());
      if (started.handled) {
        if (started.failed) setInput(current => current || raw);
        return;
      }
    }
    // @-chips ride at the front of the message text
    const message = [...mentions.map((m) => `@${m}`), raw.trim()].filter(Boolean).join(' ');
    // A refused turn leaves no /deeper or /simplify waiting for the next one (LearnTutor slash).
    if (!message || busy) { tutor?.slash?.(null); return; }
    // The main composer starts a new block; the sheet keeps its own thread.
    // A journey in setup (intake, diagnostic, path review) gets no permanent card before its path is accepted: the
    // Tutor's answer stays in the sheet, even about a selected card, and opens no reader on the canvas.
    // Legacy streaming asks keep their destination at Send. Tutor turns resolve it from the completed plan below.
    let panelAsk = sheetMode && (!canvasTarget || (canvasTarget.card && !canvasTarget.asked) || journeySetup);
    if (composerOnly && !canvasSeed) threadId.current = panelAsk ? sheetThread.current : null;
    let exchange = panelAsk || journeySetup ? null : onExchange;
    const isDemo = demo && message.toLowerCase().replace(/[.!?]+$/, '') === demo.prompt.toLowerCase() && !file;
    if (isDemo && demo.disabled) return;
    if (!isDemo) { boardContext?.pause(); boardContext?.setAnswering(true); }
    if (guardedHistory) historyRequest.current++;
    chatThread?.claim(); // a restore still on its way never replaces this turn
    onSent?.();
    if (contentPanel) { setFilePeek(null); onCloseContentPanel?.(); setView('chat'); }
    setChoices(null);
    setBusy(true);
    const flight = new AbortController();
    answerFlight.current = flight;
    if (!regenerate) { setInput(''); setMentions([]); }
    const sourceRange = codeSelection;
    setCodeSelection(null);
    const attached = regenerate ? null : file;
    if (!regenerate) setFile(null);
    const canvasImage = !isDemo ? boardContext?.preview || (canvasTarget?.id?.startsWith?.('area:') ? canvasTarget.preview : null) : null;
    const questionPaper = boardContext?.paper;
    const questionWiki = boardContext?.wiki;
    const questionVideo = boardContext?.video;
    const questionImage = boardContext?.image;
    const questionOutline = boardContext?.outline?.();
    if (!isDemo) boardContext?.removeImage();
    const target = canvasTarget; // selected lesson block riding as context
    // The attachment follows its card until this exact moment: a function-
    // valued text resolves the card's CURRENT visible state now, and the
    // string it returns is frozen into this one request. A later input
    // change can never rewrite an in-flight question's evidence.
    const targetText = target ? (typeof target.text === 'function' ? target.text() : target.text) : null;
    // A selected card stays the context for the follow-up (canvas-card-selection.md); a region, area or group rides once.
    if (target && !target.card) onClearCanvasTarget?.();
    const imageId = !target?.paper && !questionPaper ? target?.image || questionImage?.id : null;
    const tutorImage = !target?.paper && !questionPaper ? (target?.image ? { id: target.image } : questionImage?.blockId ? { block_id: questionImage.blockId } : questionImage?.id ? { id: questionImage.id } : null) : null;
    // Whole-canvas context (chat-canvas-context.js): every Learn canvas turn carries the live canvas, built at submit by the page -
    // below for /api/learn/ask, in the Tutor's turn for its plan. The selection is the target and what is selected now; the user
    // message keeps the ids it went with (refs), so a follow-up's history still points at them. imageObject: the canvas object
    // whose picture rides (image_context), the only one the package may call inspected.
    const canvasOps = learnChat && !isDemo ? workspace?.canvasOps : null;
    const selection = [(target || canvasSeed?.target)?.id, ...(canvasOps?.selection?.() || [])].filter(Boolean);
    const attachments = chat ? refIds(chat.context.attached) : [];
    const canvasArgs = { history: chatHistory(msgs), selection, attachments };
    const sentRefs = [...new Set([...selection, ...attachments])];
    const imageObject = target?.image ? target.id : questionImage?.blockId || null;
    const replyId = crypto.randomUUID();
    // The late-response guard (contract A5): the Chat's open thread when this turn was sent, against the one open now, read
    // from the thread hook itself, so a turn whose pane went away with its canvas is late too.
    const sentKey = chatThread?.liveKey(), late = () => !!chatThread && lateEvent(sentKey, chatThread.liveKey());
    // Chat persistence (chat-persist.js): an Auto turn the Tutor answers is saved by this client, bound now to this canvas and
    // thread (a new chat's thread id is made here), so a late reply is saved where it was asked. Ask and Tutor modes are saved
    // by /api/learn/ask. A demo or a regenerated answer is no new turn.
    const askedTitle = message.slice(0, 120);
    const autoSave = chatThread && !isDemo && !regenerate ? turnSaver({ app: chat.canvas, threadId: chatThread.id || newThreadId(), turnId: replyId, title: chatThread.id ? null : askedTitle, onAsked: () => { if (!late()) chatThread.adopt(autoSave.threadId, askedTitle); } }) : null;
    let card = sheetMode && !panelAsk ? { card: true } : {}; // answered as a card, kept out of the sheet
    // The turn's chat bubbles and canvas exchange, drawn once, and the sheet opened for them. The Tutor draws them itself
    // (begin), only for a turn it answers: a turn its journey resolver takes (LearnTutor.jsx) has neither.
    // A question about a file or lines of the repository (Learn's Files panel or the Map: "Asking about: train.py:5–7") is
    // answered by the repository's own reader on the Learn chat path (repositoryAsk reads that range or file), not the Tutor
    // turn, which does not carry it (repository-browser.md "Files in Learn"). A symbol context stays with the Tutor.
    const codeTurn = repository && !!(repositoryContext?.range || repositoryContext?.path);
    const codePassage = codeTurn ? contextPassage(repositoryContext) : null;
    let begun = false;
    const begin = () => {
      if (begun) return;
      begun = true;
      if (panelAsk) { setSheetOpen(true); setSheetHistory(false); }
      // A Tutor turn's question is saved now, before the Tutor generates; the thread is this Chat's at once (saved, it also
      // becomes the canvas's active thread: onAsked).
      if (viaTutor && autoSave) { if (!late()) chatThread.adopt(autoSave.threadId, askedTitle, { remember: false }); autoSave.user(message); }
      if (late()) return; // another thread or canvas is open in this Chat now: nothing of this turn is drawn there
      // In the Chat pane each message carries { messageId, status } (contract A2): local ids until `done` names the server's.
      // A regenerated answer streams in its old answer's place; the server keeps the old one as an alternative (B5).
      const reply = { role: 'assistant', content: '', id: replyId, demo: !!isDemo, ...card, ...(chatThread ? { messageId: `local-${replyId}`, status: 'streaming' } : {}) };
      if (regenerate) { setMsgs(m => m.map(item => (item.messageId === regenerate.messageId ? reply : item))); return; }
      setMsgs((m) => [...m, { role: 'user', content: attached ? `${message} 📎 ${attached.name}` : message, ...card, ...(sentRefs.length ? { refs: sentRefs } : {}), ...(canvasImage ? { canvasImage } : {}), ...(sourceRange ? { passage: `${sourceRange.path}:${sourceRange.start}-${sourceRange.end}` } : codePassage ? { passage: `${codePassage.path} · ${codePassage.lines}` } : {}), ...(chatThread ? { messageId: `local-q-${replyId}`, status: 'done' } : {}) }, reply]);
      if (!isDemo) exchange?.({ id: replyId, question: message, ...(target ? { linkFrom: target.id } : {}) });
    };
    // Which path answers (chat-route.js): the active Tutor in Auto (and off the Chat pane), else /api/learn/ask with the mode.
    // A Tutor turn begins in its own branch below; every other turn begins here.
    // A turn about one PDF page keeps the Tutor, which reads that page (tutorPage, page_context); several pages go to /api/learn/ask.
    const pdfPage = tutorPage(target, chat?.context.attached);
    const viaTutor = tutorTurn({ tutor, codeTurn, pageTurn: turnHasPage(target, chat?.context.attached) && !pdfPage, chat, mode: chat?.thread.mode });
    if (!viaTutor || isDemo) begin();
    const append = (t) => setMsgs((m) => {
      const next = m.slice();
      next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + t };
      return next;
    });
    const mirror = (t) => { exchange?.({ id: replyId, delta: t }); append(t); };
    let responseGraph = null;
    // The cards this answer committed to opening (a progress event's card): each holds its place on the canvas
    // until its card lands; whatever is still held when the answer ends goes (docs/features/canvas-skeleton-cards.md).
    const slots = {};
    try {
      if (isDemo) {
        // Demo replies are temporary and never written into a saved conversation.
        setView('chat');
        await demo.run(text => setMsgs(m => m.map(item => item.id === replyId ? { ...item, content: text } : item)));
        return;
      }
      // Tutor v1 (LearnTutor.jsx): on the NanoGPT Attention slice the Tutor answers instead of the
      // Learn chat - the learner's own words, and the card they armed or selected. On a journey canvas a turn the
      // journey takes comes back handled, with nothing drawn; a failed one gives the words back.
      // In the Learn Chat, Ask and Tutor modes post to /api/learn/ask with their mode (contract B6); Auto keeps the active
      // Tutor's workflow on a journey or Tutor canvas (owner brief section 5).
      if (viaTutor) {
        // A block's follow-up composer (canvasSeed, a journey canvas) asks about that block.
        const reply = await tutor.ask({ raw: raw.trim(), targetId: (target || canvasSeed?.target)?.id || null, image: tutorImage, page: pdfPage, opening, signal: flight.signal, skipJourney, resolved: sheetMode, begin: sheetMode ? null : begin, ...canvasArgs, inspected: tutorImage && imageObject ? [imageObject] : [] }).catch(e => { if (e.name === 'AbortError') return 'Stopped.'; if (e.name === 'TimeoutError') throw new Error('The Tutor took too long to answer. Try again.'); throw e; });
        if (reply?.handled) { if (reply.failed) setInput(current => current || raw); return; }
        if (sheetMode) {
          const routed = typeof reply === 'string' ? { to: 'tray', text: reply } : destinationOf(reply, target, { setup: journeySetup });
          setSheetOpen(true); setSheetHistory(false);
          if (!routed.to) return; // the material card is the answer; extras carries its status
          panelAsk = routed.to !== 'card';
          exchange = panelAsk ? null : onExchange;
          card = panelAsk ? {} : { card: true };
          begin();
          mirror(routed.text);
        } else {
          // The reply as shown, or a Stop as interrupted, saved in the turn's own thread - even when the learner is elsewhere now.
          begin();
          const stopped = flight.signal.aborted;
          autoSave?.assistant(reply, stopped ? 'interrupted' : 'done').catch(error => console.info('[chat] answer not saved:', error.message));
          if (late()) return;
          mirror(reply);
          if (stopped && chatThread) setMsgs(messages => settle(messages, replyId, 'stopped'));
        }
        return;
      }
      const canvasContext = canvasOps?.canvasContext?.({ request: message, ...canvasArgs, inspected: imageId && imageObject ? [imageObject] : [] });
      const payload = {
        // The lesson's table of contents. Separate from lesson_snapshot, which
        // is tldraw-shaped and would reject it.
        ...(questionOutline?.length ? { outline: questionOutline } : {}),
        // The page read: a selected page, else the open reader (its selection included), else an uploaded-paper page chip in the
        // composer (pdf-to-canvas.md), so the chip asks about its page after the selection is cleared. home: a copied page's canvas.
        ...(target?.paper ? { paper_context: target.paper } : questionPaper ? { paper_context: { id: questionPaper.id, page: questionPaper.page, ...(questionPaper.home ? { home: questionPaper.home } : {}), ...(questionPaper.selection ? { selection: questionPaper.selection } : {}) } } : chat && turnPaper(null, chat.context.attached) ? { paper_context: turnPaper(null, chat.context.attached) } : {}),
        // One reader holds one thing, so an open paper is what rides; a detached
        // wiki source arrives here as null and the key is simply absent.
        // A dropped image outranks the article and video cards - it is the
        // thing most recently put in front of the tutor - but a paper wins.
        // A group's own snapshot rides only with the question about that group.
        ...(imageId ? { image_context: { id: imageId } } : {}),
        ...(!target?.paper && !questionPaper && !imageId && questionWiki?.title ? { wiki_context: { title: questionWiki.title, section: questionWiki.section || 0, ...(questionWiki.selection ? { selection: questionWiki.selection } : {}) } } : {}),
        // A video card is the quietest context: any open reader outranks it.
        ...(!target?.paper && !questionPaper && !imageId && !questionWiki?.title && questionVideo?.videoId ? { video_context: { videoId: questionVideo.videoId, start: questionVideo.start || 0, ...(questionVideo.end != null ? { end: questionVideo.end } : {}), ...(questionVideo.title ? { title: questionVideo.title } : {}) } } : {}),
        scope: scopeOverride || scope,
        ...(repository && repositoryContext ? { repository_context: { ...repositoryContext, commit: sourceRange?.commit || repositoryCommit || repositoryContext?.commit, ...(sourceRange ? {range:{path:sourceRange.path,start:sourceRange.start,end:sourceRange.end}} : {}) } } : {}),
        // @-mentioned apps: the server adds each one's context to this chat.
        ...(mentions.length ? { mentions: [...mentions] } : {}),
        // The learner's own words; the card, group or region they asked about rides beside them,
        // its text resolved at send (targetText) so a live card sends the state the learner sees.
        message,
        ...(target ? { canvas_target: canvasTargetField({ ...target, text: targetText }) } : {}),
        thread_id: threadId.current,
        ...(regenerate ? { regenerate } : {}),
        // A Continue convo's first request also carries the card its answer was linked from.
        ...(canvasSeed && !threadId.current ? { canvas_seed: { question: canvasSeed.question, answer: canvasSeed.answer }, ...(!target && canvasSeed.target ? { canvas_target: canvasTargetField(canvasSeed.target) } : {}) } : {}),
        ...(srcOpts.length && srcOn.size < srcOpts.length ? { sources: [...srcOn] } : {}),
        ...(model !== 'auto' ? { model } : {}),
        // The Chat pane's turn (contract A4): its mode, the command whose prompt this is (other commands keep their own
        // path), exactly the chips attached at Send with card, group, image and media text resolved now.
        ...(chat ? { mode: chat.thread.mode, command: commandName, context_refs: refsForSend(withPage(chat.context.attached, target?.docPage)) } : {}),
        // The live canvas (whole-canvas context): its inventory, relevant excerpts, relations and coverage.
        ...(canvasContext ? { canvas_context: canvasContext } : {}),
      };
      if (privateChat) {
        const d = await api(askPath, { method: 'POST', body: JSON.stringify({ ...payload,
          scope: { app: fileApp, ...(scope.run ? { run: scope.run } : {}) } }) });
        mirror(d.answer);
        threadId.current = d.threadId;
        setThreads((ts) => [d.thread, ...ts.filter((t) => t.id !== d.threadId)]);
        return;
      }
      let r;
      if (attached) {
        const fd = new FormData();
        fd.append('body', JSON.stringify(payload));
        fd.append('file', attached);
        r = await fetch(askPath, { method: 'POST', headers: wsHeaders(), body: fd, signal: flight.signal });
      } else {
        r = await fetch(askPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...wsHeaders() },
          body: JSON.stringify(payload),
          signal: flight.signal,
        });
      }
      if ((r.headers.get('Content-Type') || '').includes('json')) {
        const d = await r.json();
        if (late()) return;
        if (d.choose) {
          setMsgs((m) => m.slice(0, -2)); // no turn happened yet - the pills replace it
          setChoices({ message, candidates: d.choose });
        } else {
          mirror(`✗ ${d.error || `HTTP ${r.status}`}`);
        }
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop();
        for (const ev of events) {
          const type = (ev.match(/^event: (.+)$/m) || [])[1];
          const data = (ev.match(/^data: (.+)$/m) || [])[1];
          if (!type || !data || late()) continue; // read on to the end, so the server finishes and saves the turn
          const d = JSON.parse(data);
          if (type === 'chunk') mirror(d.text);
          else if (type === 'progress') { if (d.card && !slots[d.card] && !journeySetup) slots[d.card] = boardContext?.reserveCard?.(d.card); exchange?.({ id: replyId, stage: d.stage }); setMsgs(messages => messages.map(item => item.id === replyId ? (chatThread ? { ...item, stage: d.stage } : { ...item, status: d.stage }) : item)); }
          else if (type === 'graph') { responseGraph=d; setMsgs(messages=>messages.map(item=>item.id===replyId?{...item,graph:d}:item)); }
          else if (type === 'outline') { boardContext?.onOutlineProposal?.(d.ops); }
          else if (type === 'paper') { if (!journeySetup) boardContext?.onShowPaper?.(d, slots.paper); }
          else if (type === 'wiki') { if (!journeySetup) boardContext?.onShowWiki?.(d, slots.wiki); }
          else if (type === 'video') { if (!journeySetup) boardContext?.onShowVideo?.(d, slots.video); }
          else if (type === 'papers') setMsgs(messages => messages.map(item => item.id === replyId ? { ...item, papers: d.papers } : item));
          else if (type === 'proposal') setMsgs((m) => [...m, { role: 'proposal', proposal: d }]);
          else if (type === 'answer_meta') setMsgs(messages => withAnswerMeta(messages, replyId, d));
          else if (type === 'done' && d.threadId) {
            if (chatThread) { setMsgs(messages => withDone(messages, replyId, d)); chatThread.adopt(d.threadId, message.slice(0, 120)); }
            threadId.current = d.threadId;
            if (panelAsk) { sheetThread.current = d.threadId; rememberSheetThread(appName, d.threadId); }
            if (repository && d.commit) setRepositoryCommit(d.commit);
            if (responseGraph && onGraph) onGraph(responseGraph);
            if (learnChat) setThreads(ts => ts.some(t => t.id === d.threadId) ? ts : [{ id: d.threadId, title: message.slice(0, 120) }, ...ts]);
          }
          else if (type === 'error') { mirror(`✗ ${d.error}`); if (chatThread) setMsgs(messages => settle(messages, replyId, 'error')); }
        }
      }
    } catch (e) {
      // A stopped answer keeps what arrived; it is not an error. In the Chat pane it is marked Stopped.
      if (late()) return;
      if (e.name !== 'AbortError') {
        if (sheetMode && tutor && !codeTurn) { panelAsk = true; exchange = null; card = {}; }
        begin(); mirror(`✗ ${e.message}`);
      }
      if (chatThread) setMsgs(messages => settle(messages, replyId, e.name === 'AbortError' ? 'stopped' : 'error'));
    } finally {
      const mine = answerFlight.current === flight;
      if (mine) answerFlight.current = null;
      for (const slot of Object.values(slots)) boardContext?.releaseCard?.(slot);
      if (!isDemo) exchange?.({ id: replyId, done: true });
      if (!isDemo) boardContext?.setAnswering(false);
      if (chatThread && !late()) setMsgs(messages => settle(messages, replyId, 'done'));
      // A turn the Chat let go of (another thread opened) leaves the composer to whatever runs there now.
      if (!chatThread || mine) setBusy(false);
    }
  };
  // Regenerate (contract B5, chat.regenerate): the footer re-sends a turn through this loop with regenerate: { messageId };
  // the server reuses that turn's stored question, mode, command and refs, so nothing open now leaks in.
  useEffect(() => (chatThread ? chat.registerSender(({ regenerate } = {}) => {
    const index = msgs.findIndex(m => m.messageId === regenerate?.messageId);
    const question = index > 0 ? msgs.slice(0, index).findLast(m => m.role === 'user')?.content : null;
    return question ? send(question, undefined, { skipJourney: true, regenerate }) : undefined;
  }) : undefined));

  // Professor Next Steps (docs/features/professor-next-steps.md §1.4): a hook the learner clicked (NextStepsCard), or one
  // carried into a new hole. The step travels as structured data, never as typed text: one tutor.askStep turn, drawn in the
  // dock's sheet as a selection chip (visibly a choice, not a learner bubble) with the Tutor's reply under it, and no canvas
  // card. Voice Mode on: the spoken session's turn (say with nextStep), never askStep - a typed reply would not be spoken and
  // old audio would keep playing; a refusal (a turn is thinking) reads as busy. Resolves to whether the turn was taken.
  const sendStep = async (step, hook) => {
    if (voice?.on) return voice.say('', { nextStep: step, selectedAt: new Date().toISOString() });
    if (busy || !tutor?.askStep) return false;
    boardContext?.pause();
    boardContext?.setAnswering(true);
    setBusy(true);
    const flight = new AbortController();
    answerFlight.current = flight;
    const replyId = crypto.randomUUID();
    let begun = false;
    const begin = () => {
      if (begun) return;
      begun = true;
      setSheetOpen(true); setSheetHistory(false);
      setMsgs(m => [...m, { role: 'step', content: hook }, { role: 'assistant', content: '', id: replyId }]);
    };
    const reply = text => { begin(); setMsgs(m => m.map(item => (item.id === replyId ? { ...item, content: item.content + text } : item))); };
    try {
      const answer = await tutor.askStep({ selected_next_step: step, signal: flight.signal, resolved: sheetMode, begin: sheetMode ? null : begin }).catch(e => { if (e.name === 'AbortError') return 'Stopped.'; if (e.name === 'TimeoutError') throw new Error('The Tutor took too long to answer. Try again.'); throw e; });
      if (!answer?.handled) {
        if (!sheetMode || typeof answer === 'string') reply(answer);
        else {
          const routed = destinationOf(answer, null, { setup: journeySetup });
          setSheetOpen(true); setSheetHistory(false);
          if (routed.to === 'card') onAddToCanvas?.({ question: hook, answer: routed.text });
          else if (routed.text) reply(routed.text);
        }
      }
    } catch (e) {
      reply(`✗ ${e.message}`);
    } finally {
      if (answerFlight.current === flight) answerFlight.current = null;
      boardContext?.setAnswering(false);
      setBusy(false);
    }
    return true;
  };
  if (nextStepRef) nextStepRef.current = sendStep; // the page's hook card sends through the dock (LearnPage)

  // Tutor v1: a hole's opening turn goes through send once, as the learner's carried-down question - from the dock or the Chat pane only
  // (final review C-I1: a journey hole's block composers get the same Tutor and would each send it again).
  useEffect(() => {
    if (!(dock || chat) || !tutor?.opening || busy || !openOnce(openedHoles, tutor.opening.key)) return;
    // A hook carried from a shared canvas (contract §1.4): the hole opens on it once, as the step, keyed by opening.key.
    if (tutor.opening.next_step) { sendStep(tutor.opening.next_step, tutor.opening.next_step.hook); return; }
    // Voice Mode: the opening is a voice turn - spoken, in the Tutor caption only, never a chat bubble.
    if ((dock || chat) && voice?.on && voice.say(tutor.opening.question, { opening: true })) return;
    send(tutor.opening.question, undefined, { opening: true });
  }, [tutor?.opening?.key, busy, voice?.on]); // eslint-disable-line react-hooks/exhaustive-deps
  // A /command Enter while busy (held, below in onKeyDown) runs once the turn ends, if the composer still shows it.
  useEffect(() => {
    if (busy || held.current == null) return;
    const line = releaseLine(held.current, input);
    held.current = null;
    if (line) send(line);
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const modelControl = (
          <div className="relative shrink-0">
            <button
              type="button"
              title={privateChat ? chatConfig.model : undefined}
              onMouseDown={(e) => { e.stopPropagation(); setModelOpen(!modelOpen); }}
              className={cn(dock ? COMPOSER_PILL : 'h-6 cursor-pointer rounded-full px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink', modelOpen && 'bg-active text-ink')}
            >
              {modelOptions.find(([k]) => k === model)?.[1]}
            </button>
            <Menu open={modelOpen} onClose={() => setModelOpen(false)} className={dock ? 'bottom-11 left-0 w-52' : 'right-0 bottom-8 w-52'}>
              {modelOptions.map(([k, label]) => (
                <MenuItem key={k} type="button" icon={MODEL_META[k]?.[0]} onClick={() => { setModel(k); setModelOpen(false); }}>
                  <span className="flex w-full items-center justify-between">
                    <span className={cn(k === model && 'font-medium')}>{label}</span>
                    <span className="text-xs text-ink-3">{privateChat ? 'AWS model' : MODEL_META[k]?.[1]}</span>
                  </span>
                </MenuItem>
              ))}
            </Menu>
          </div>
  );
  // Learn's command slot (owner brief 2026-10-13 section 5): "/" opens the same palette typing / does; a chosen command
  // sits here as a pill (/name) - the name reopens the palette to swap it, × returns the slot to "/" and keeps the text.
  // The slot is never the mode: Auto / Ask / Tutor is the separate ModeSelector, and removing a command never changes it.
  const slashControl = slash && (command
    // A command with a family wears its tint (CommandTone.jsx); the rest stay neutral. Never the whole composer.
    ? <span data-command-pill data-command-tone={commandTone(command) || undefined} className={cn(chat ? 'h-8 rounded-lg pl-2 text-sm' : dock ? 'h-9 rounded-lg pl-2.5 text-sm max-md:pl-1.5' : 'h-6 rounded-full pl-2 text-xs', 'inline-flex shrink-0 items-center border', !commandTone(command) && 'border-line bg-hover text-ink', voiceOn && 'opacity-45')}>
        <button type="button" title="Change the command" disabled={voiceOn} onMouseDown={event => event.preventDefault()} onClick={openPalette} className="inline-flex cursor-pointer items-center gap-1 font-medium">/{command}</button>
        <button type="button" aria-label={`Remove ${command}`} title="Remove the command" onMouseDown={event => event.preventDefault()} onClick={() => { setCommand(null); inputRef.current?.focus(); }} disabled={voiceOn}
          className={cn(chat ? 'mx-0.5 h-6 w-6' : dock ? 'mx-1 h-7 w-7' : 'mx-0.5 h-5 w-5', 'flex cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-white hover:text-ink')}><X size={13} /></button>
      </span>
    : <button type="button" data-command-slot aria-label="Commands" title="Choose a command" aria-expanded={input.startsWith('/')} disabled={voiceOn}
        onMouseDown={event => event.preventDefault()} onClick={() => { if (!input.startsWith('/')) return openPalette(); setComposerInput(''); inputRef.current?.focus(); }}
        className={cn(chat ? cn(COMPOSER_TOOL, 'font-mono text-[15px]') : dock ? COMPOSER_PILL : 'h-6 cursor-pointer rounded-full px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink', input.startsWith('/') && 'bg-active text-ink', voiceOn && 'cursor-default opacity-45')}>/</button>);
  const chatControl = learnChat ? slashControl : modelControl;
  // The Learn Chat never shows a reader in place of its transcript, and sending never closes one (brief 13.1, 13.2): readers
  // live in the Sources pane beside it, so here there is no content panel to hide the transcript or for send() to close.
  if (chat) contentPanel = null;
  else if (repository && filePeek) contentPanel = <RepositorySource appName={fileApp} {...filePeek} commit={repositoryCommit || repositoryContext?.commit} onClose={() => setFilePeek(null)} />;
  return (
    <div className={cn('flex min-h-0 flex-col', compact ? 'max-h-[320px]' : 'flex-1', sheetMode && 'relative')}>
      {/* The Chat pane's own header (ChatPane: title, History, New chat) replaces this row there. */}
      {!compact && !chat && (msgs.length > 0 || threads.length > 0 || headerExtra || headerTitle) && (
        <div className="flex shrink-0 items-center justify-end gap-1 pb-1">
          {headerTitle && <h2 className="mr-auto text-sm font-semibold">{headerTitle}</h2>}
          {/* No History or New chat (owner, 2026-10-04): one icon clears the conversation. */}
          <button type="button" data-chat-clear aria-label="Clear the conversation" title="Clear" disabled={guardedHistory && busy} onClick={newChat} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50"><Eraser size={13} /></button>
          {headerExtra}
        </div>
      )}
      {compact && !composerOnly && msgs.length > 0 && (
        <div className="flex shrink-0 justify-end pb-1">
          <button disabled={privateChat && busy} onClick={newChat} className="flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">
            Clear chat
          </button>
        </div>
      )}
      {runPeek && (
        <SlidePanel key={runPeek} width={560} expandable breadcrumbs={evidenceCrumbs(fileApp, 'Run ' + runPeek, () => setRunPeek(null))} title={'Run ' + runPeek} onClose={() => setRunPeek(null)}>
          <div data-panel-content className="min-h-0 flex-1 overflow-y-auto px-5 pb-5"><RunResultCard runId={runPeek} app={fileApp ? { name: fileApp } : null} /></div>
        </SlidePanel>
      )}
      {filePeek && !repository && <FilePeek appName={fileApp} path={filePeek.path} line={filePeek.line} lineEnd={filePeek.lineEnd} onClose={() => setFilePeek(null)} />}
      {confirmDel && (
        <ConfirmDialog
          title="Delete this chat?"
          body={`"${confirmDel.title.slice(0, 80)}" and its messages are removed for good. Approved actions stay in the log.`}
          onConfirm={async () => {
            const t = confirmDel;
            setConfirmDel(null);
            try {
              await chatApi(`/api/ask/threads/${t.id}/delete`, { method: 'POST' });
              setThreads((ts) => ts.filter((x) => x.id !== t.id));
              if (threadId.current === t.id) newChat();
            } catch { /* row stays if the delete failed */ }
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
      {view === 'history' && !contentPanel && (
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {threads.map((t) => (
            <div key={t.id} className="group/h relative flex items-center border-b border-line">
              {renaming?.id === t.id ? (
                <form
                  className="flex-1 py-1"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const title = renaming.value.trim();
                    setRenaming(null);
                    if (!title) return;
                    try {
                      await chatApi(`/api/ask/threads/${t.id}/rename`, { method: 'POST', body: JSON.stringify({ title }) });
                      setThreads((ts) => ts.map((x) => (x.id === t.id ? { ...x, title } : x)));
                    } catch { /* row keeps its old title */ }
                  }}
                >
                  <input
                    autoFocus
                    value={renaming.value}
                    onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                    onBlur={() => setRenaming(null)}
                    className="h-7 w-full rounded-sm bg-hover px-2 text-sm outline-none"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => loadThread(t.id)}
                  className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover"
                >
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-ink-3">{ago(t.created_at)}</span>
                </button>
              )}
              <button
                type="button"
                aria-label="Thread options"
                onMouseDown={(e) => { e.stopPropagation(); setRowMenu(rowMenu === t.id ? null : t.id); }}
                className={cn('mr-0.5 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ink-2 opacity-0 group-hover/h:opacity-100 hover:bg-hover hover:text-ink', rowMenu === t.id && 'bg-active text-ink opacity-100')}
              >
                <MoreHorizontal size={15} strokeWidth={1.5} />
              </button>
              <Menu open={rowMenu === t.id} onClose={() => setRowMenu(null)} className="top-8 right-0 w-36">
                <MenuItem icon={Pencil} type="button" onClick={() => { setRowMenu(null); setRenaming({ id: t.id, value: t.title }); }}>Rename</MenuItem>
                <MenuItem icon={Trash2} type="button" className="text-danger" onClick={() => { setRowMenu(null); setConfirmDel(t); }}>Delete</MenuItem>
              </Menu>
            </div>
          ))}
          {threads.length === 0 && <div className="py-3 text-sm text-ink-3">No past chats.</div>}
        </div>
      )}
      {(view === 'chat' || contentPanel) && (<>
      {contentPanel && <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><SourceSelectionContext.Provider value={{value:codeSelection,set:setCodeSelection}}>{contentPanel}</SourceSelectionContext.Provider></div>}
      <div ref={boxRef} data-chat-sheet={sheetMode || undefined} className={cn('no-scrollbar min-h-0 flex-1 overflow-y-auto', (contentPanel || (composerOnly && !sheetMode)) && 'hidden',
        sheetMode && 'absolute right-0 bottom-full left-0 z-30 mb-2 max-h-[45vh] rounded-xl border border-line bg-white px-3 pb-3 shadow-pop',
        sheetMode && !(sheetOpen && (sheetHistory || msgs.some(m => !m.card) || tutor?.extras)) && 'hidden')}>
        {sheetMode && (
          <div className="sticky top-0 z-10 -mx-3 flex items-center gap-1 bg-white px-3 pt-2 pb-1">
            <span className="mr-auto text-xs text-ink-2">Rabbit Hole</span>
            <button type="button" data-chat-clear aria-label="Clear the conversation" title="Clear" disabled={busy} onClick={newChat} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50"><Eraser size={13} /></button>
            <button type="button" aria-label="Collapse chat" title="Collapse" onClick={() => setSheetOpen(false)} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink">
              <Minus size={14} />
            </button>
          </div>
        )}
        {sheetMode && sheetHistory && (threads.length ? threads.map(t => (
          <button key={t.id} type="button" onClick={async () => { await loadThread(t.id); setSheetHistory(false); }} className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover">
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            {t.created_at && <span className="shrink-0 text-xs text-ink-3">{ago(t.created_at)}</span>}
          </button>
        )) : <p className="py-2 text-sm text-ink-3">No past chats.</p>)}
        {/* The Learn Chat opens empty: these starters are the apps agent's, not a canvas's, and Explore next (Lane B) follows answers. */}
        {!sheetMode && !chat && msgs.length === 0 && !choices && (
          <div className="flex flex-col items-start gap-1.5 py-3">
            {(repository
              ? ['What are the main concepts in this repository?', 'How does the code fit together?', 'Where should I start reading?']
              : scope.run
              ? ['What happened in this run?', 'Why did it fail?', 'What changed since the last successful run?']
              : scope.app
                ? ['When did this last run, and how did it go?', 'What does the code actually do?', 'Who has access to this app?']
                : ['What apps do we have and what do they do?', 'Any failed runs recently?', 'What did Watch find this week?']
            ).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className="cursor-pointer rounded-full border border-line bg-white px-3 py-1 text-left text-[13px] text-ink-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-line-strong hover:text-ink"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {!(sheetMode && sheetHistory) && <ChatMessages msgs={msgs} sheetMode={sheetMode} busy={busy} learnChat={learnChat} privateChat={privateChat} fileApp={fileApp} appName={appName} onGraph={onGraph} onAddToCanvas={onAddToCanvas} setMsgs={setMsgs} setInput={setInput} inputRef={inputRef} setFilePeek={setFilePeek} setRunPeek={setRunPeek} follow={follow} />}
        {choices && (
          <div className="py-2">
            <div className="pb-1.5 text-sm text-ink-2">Which one do you mean?</div>
            <div className="flex flex-col gap-1">
              {choices.candidates.map((c) => (
                <button
                  key={c.app}
                  onClick={() => send(choices.message, { app: c.app })}
                  className="cursor-pointer rounded-sm border border-line px-3 py-1.5 text-left text-sm hover:bg-hover"
                >
                  <span className="font-medium">{c.app}</span>
                  {c.hint && <span className="block truncate text-xs text-ink-2">{c.hint}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Tutor v1: its suggestion chips and the dive suggestion sit under its reply, never over it. */}
        {tutor?.extras && !voiceOn && <div data-tutor-extras className="flex flex-col items-start gap-2 py-2">{tutor.extras}</div>}
      </div>
      {/* non-compact: the box sticks to the viewport bottom - the page can scroll, the input never leaves */}
      <div ref={composerBox} className={cn('relative mt-2 shrink-0', !compact && 'sticky bottom-0 bg-white pt-1 pb-2')}>
        {/* @-mention suggestions above the input */}
        {atHits.length > 0 && (
          <div className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-64 overflow-y-auto rounded-md bg-white p-1 shadow-pop">
            {atHits.map((a) => (
              <button
                key={a.name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setMentions((m) => (m.includes(a.name) ? m : [...m, a.name]));
                  setInput(input.replace(/@[a-z0-9-]*$/, ''));
                  inputRef.current?.focus();
                }}
                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover"
              >
                <KindIcon kind={a.kind} schedule={a.schedule} />
                {a.name}
              </button>
            ))}
          </div>
        )}
        {(file || mentions.length > 0) && (
          <div className="mb-1 flex flex-wrap gap-1.5">
            {mentions.map((m) => (
              <span key={m} className="inline-flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs">
                @{m}
                <button aria-label={`Remove ${m}`} className="cursor-pointer text-ink-2 hover:text-ink" onClick={() => setMentions((ms) => ms.filter((x) => x !== m))}><X size={11} /></button>
              </span>
            ))}
            {file && (
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-xs text-ink-2">
                <Paperclip size={12} strokeWidth={1.5} /> {file.name}
                <button aria-label="Remove attachment" className="cursor-pointer hover:text-ink" onClick={() => setFile(null)}><X size={12} /></button>
              </span>
            )}
          </div>
        )}
        {!contentPanel && demo && <button type="button" disabled={busy || demo.disabled} onClick={() => send(demo.prompt)} className="mb-2 self-start rounded-full border border-line px-3 py-1.5 text-xs text-ink-2 hover:bg-hover disabled:opacity-50">
          {demo.prompt} <span className="ml-1 text-ink-3">· Demo</span>
        </button>}
        {/* Learn's repository context. A file or lines also show the file's path, the lines (or Whole file) and, for lines, the
            first few as a preview (repositoryExcerpt, display only; repository-browser.md "Files in Learn"). */}
        {repository && repositoryContext?.label && (() => { const passage = contextPassage(repositoryContext, repositoryExcerpt); return <div data-repository-context className="mb-2 flex max-w-full self-start flex-col rounded-md border border-green-600/45 bg-green-50 px-2 py-1.5 text-xs text-green-800">
          <div className="flex min-w-0 items-center gap-1.5"><span className="min-w-0 truncate">Asking about: {repositoryContext.label} · {(repositoryCommit || repositoryContext?.commit || '').slice(0,7)}</span>{onClearRepository && <button type="button" className="shrink-0 rounded p-0.5 hover:bg-green-100" aria-label="Clear repository selection" onClick={onClearRepository}><X size={12}/></button>}</div>
          {passage && <div data-context-path className="mt-0.5 truncate font-mono text-[11px] text-green-900/80" title={passage.path}>{passage.path} · {passage.lines}</div>}
          {passage?.excerpt.length > 0 && <pre data-context-excerpt className="mt-1 max-w-full overflow-hidden rounded border border-green-600/25 bg-white px-1.5 py-1 font-mono text-[10px] leading-4 text-ink">{passage.excerpt.map(line => <div key={line.n} className="truncate"><span className="mr-2 text-ink-3">{line.n}</span>{colorLine(line.text)}</div>)}{passage.more && <div className="text-ink-3">…</div>}</pre>}
        </div>; })()}
        {/* The selected card (or armed region, area or group) the next question is about: always visible while it rides. */}
        {canvasTarget && <div data-canvas-target {...(canvasTarget.card ? { 'data-selected-card': canvasTarget.id, title: `${canvasTarget.kind}: ${String(canvasTarget.title ?? '')}` } : {})} className="mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-hover py-1 pr-1.5 pl-2.5 text-xs text-ink-2">
          {canvasTarget.preview && <img src={canvasTarget.preview} alt="Selected region" className="h-7 w-10 shrink-0 rounded border border-line bg-white object-contain" />}
          {canvasTarget.preview && !canvasTarget.paper && !canvasTarget.docPage && !canvasTarget.image && !canvasTarget.id?.startsWith?.('area:') && <span data-text-only title="The tutor gets the shapes' text, not this picture" className="shrink-0 text-ink-3">text only</span>}
          {/* A card shows its material icon, unless it has a picture; a title that already names its kind (a group called Group 2) is shown once. */}
          {canvasTarget.card && !canvasTarget.preview && <MaterialIcon type={canvasTarget.context?.material_type} />}
          {!canvasTarget.card && !String(canvasTarget.title ?? '').toLowerCase().startsWith(String(canvasTarget.kind).toLowerCase()) && <span className="shrink-0 font-medium text-ink">{canvasTarget.kind}</span>}
          <span className="max-w-[260px] truncate">{String(canvasTarget.title).replace(/\$([^$]*)\$/g, '$1')}</span>
          <button type="button" aria-label={canvasTarget.card ? 'Remove selected card context' : 'Clear block selection'} title={canvasTarget.card ? 'Remove selected card context' : 'Clear block selection'} onClick={onClearCanvasTarget} className="shrink-0 rounded-full p-0.5 hover:bg-active hover:text-ink"><X size={12} /></button>
        </div>}
        {codeSelection&&<div aria-label="Selected code attachment" className="mb-2 rounded-lg border border-accent/40 bg-accent/5 p-2 text-xs text-ink"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="text-ink-2">Asking about selected code</div><div className="mt-1 truncate font-mono font-medium">{codeSelection.path}:{codeSelection.start}–{codeSelection.end}</div></div><button type="button" aria-label="Clear code selection" onClick={()=>setCodeSelection(null)}><X size={13}/></button></div><pre className="mt-2 max-h-20 overflow-auto rounded border border-line bg-white p-2 font-mono text-[10px] leading-4">{codeSelection.text.split('\n').slice(0,4).map((line,i)=><div key={i}><span className="mr-2 text-ink-3">{codeSelection.start+i}</span>{colorLine(line)}</div>)}{codeSelection.end-codeSelection.start>=4&&<span className="text-ink-3">… {codeSelection.end-codeSelection.start+1} selected lines</span>}</pre></div>}
        {boardContext?.paper && <div className="mb-2 flex items-center gap-2 rounded border border-line p-2 text-xs"><span className="min-w-0 flex-1">Asking about: {boardContext.paper.title} / Page {boardContext.paper.page}</span><button type="button" aria-label="Clear paper context" onClick={boardContext.clearPaper}><X size={12} /></button></div>}
        {boardContext?.preview && <div className="relative mb-2 w-28" data-canvas-attachment>
          <img src={boardContext.preview} alt={boardContext.previewKind === 'paper' ? 'Selected paper region' : 'Selected canvas preview'} className="h-20 w-28 rounded-lg border border-line bg-white object-contain" />
          <button type="button" aria-label={boardContext.previewKind === 'paper' ? 'Remove paper selection' : 'Remove canvas image'} title="Remove image preview" onClick={boardContext.removeImage} className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-white text-ink-2 shadow-sm hover:bg-hover"><X size={12} /></button>
        </div>}
        {tray?.tray && <TutorPromptTray tray={tray.tray} onOption={async id => { const out = await tray.onOption(id); if (out?.ask) send(out.ask, undefined, { skipJourney: true }); }} />}
        {slash && <div className="relative"><slash.Picker apiRef={slashRef} composerRef={inputRef} input={input} setInput={setComposerInput} target={canvasTarget} run={slash.run} onFocusBlock={slash.focusBlock} onPrompt={prompt => send(prompt, undefined, { skipJourney: true, command: promptCommand.current })} onHelp={slash.onHelp && (() => { setComposerInput(''); slash.onHelp(); })} /></div>}
        {(dock || chat) && voice?.state === 'off' && voice.caption?.error && <div role="alert" data-voice-error className="mb-1.5 truncate text-xs text-fail">{voice.caption.error}</div>}
        <ChatComposer value={input} onChange={value => { boardContext?.pause(); setComposerInput(value); }} onSubmit={send} ready={!!command}
          onKeyDown={slash ? event => { if (command && event.key === 'Backspace' && !input) { event.preventDefault(); setCommand(null); return; } slashRef.current?.onKeyDown(event);
            if (busy && !event.defaultPrevented && composerKey(event.nativeEvent) === 'send' && holdsLine(input)) { event.preventDefault(); held.current = input; } } : undefined} inputRef={inputRef} autoFocus={autoFocus} placeholder={command ? 'Add details, or press Enter' : tray?.tray?.free_text ? 'Type your answer, or ask anything' : placeholder} busy={busy}
          dock={dock} onStop={dock || chat ? () => answerFlight.current?.abort() : undefined}
          stacked={!!chat} chips={chat ? <ContextChips readPaper={(canvasTarget?.paper || boardContext?.paper || turnPaper(null, chat.context.attached))?.id ?? null} /> : null}
          leading={<>
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Add"
              disabled={voiceOn}
              title={chat ? 'Add context' : undefined}
              onMouseDown={(e) => { e.stopPropagation(); setPlusOpen(!plusOpen); }}
              className={cn(chat ? COMPOSER_TOOL : dock ? COMPOSER_ADD : 'inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-line text-ink-2 hover:bg-hover hover:text-ink', plusOpen && 'bg-active text-ink', voiceOn && 'cursor-default opacity-45')}
            >
              <Plus size={chat ? 16 : 14} strokeWidth={1.5} />
            </button>
            <Menu open={plusOpen} onClose={() => setPlusOpen(false)} className={chat ? 'bottom-10 left-0 w-64' : dock ? 'bottom-11 left-0 w-64' : 'bottom-8 left-0 w-64'}>
              {/* The Chat pane uploads into the canvas's one context collection (chat.context.upload: the context-docs upload). */}
              {chat ? <MenuItem icon={Upload} onClick={() => { setPlusOpen(false); fileRef.current?.click(); }}>Upload a PDF, text or Markdown file</MenuItem> : <MenuItem icon={Paperclip} disabled={privateChat || canvasChat} title={privateChat ? 'Attachments are not connected for private chat yet.' : canvasChat ? 'Attachments are not available on canvases yet. Upload a PDF from the canvas menu.' : undefined} onClick={() => { setPlusOpen(false); fileRef.current?.click(); }}>
                Add images, PDFs, or CSVs
              </MenuItem>}
              <MenuItem icon={AtSign} disabled={privateChat || mentions.length >= MENTION_CHIPS} title={privateChat ? `This chat uses only the selected ${scope.run ? 'run' : 'app'}.` : mentions.length >= MENTION_CHIPS ? 'A question reads at most three mentioned apps.' : undefined} onClick={() => { setPlusOpen(false); setInput((v) => `${v}@`); inputRef.current?.focus(); }}>
                Mention an app
              </MenuItem>
            </Menu>
            <input
              ref={fileRef}
              type="file"
              accept={chat ? CONTEXT_ACCEPT : '.png,.jpg,.jpeg,.gif,.webp,.pdf,.csv,.txt'}
              className="hidden"
              onChange={(e) => { const picked = e.target.files[0]; e.target.value = ''; if (picked) { if (chat) chat.context.upload(picked); else setFile(picked); } }}
            />
          </div>
          {contextDocs.enabled && !chat && (
            <div className="relative shrink-0">
              <button type="button" aria-label="Context documents" title="Documents the agent reads" data-context-button disabled={voiceOn}
                onMouseDown={(e) => { e.stopPropagation(); setCtxOpen(!ctxOpen); }}
                className={cn(dock ? COMPOSER_ADD.replace(' w-9 ', ' min-w-9 ') : 'inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-full border border-line text-ink-2 hover:bg-hover hover:text-ink', 'gap-1 px-2', ctxOpen && 'bg-active text-ink', voiceOn && 'cursor-default opacity-45')}>
                <Files size={dock ? 16 : 14} strokeWidth={1.5} />
                {contextDocs.on > 0 && <span className="text-xs font-medium">{contextDocs.on}</span>}
              </button>
              <Menu open={ctxOpen} onClose={() => setCtxOpen(false)} className={dock ? 'bottom-11 left-0 w-[22rem] max-w-[92vw] p-1' : 'bottom-8 left-0 w-[22rem] max-w-[92vw] p-1'}>
                <ContextDocs context={contextDocs} />
              </Menu>
            </div>
          )}
          {srcOpts.length > 0 && !chat && (
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Sources"
                title="What the agent reads"
                onMouseDown={(e) => { e.stopPropagation(); setSrcOpen(!srcOpen); }}
                className={cn('inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink', srcOpen && 'bg-active text-ink')}
              >
                <SlidersHorizontal size={14} strokeWidth={1.5} />
              </button>
              <Menu open={srcOpen} onClose={() => setSrcOpen(false)} className="bottom-8 left-0 w-64 p-2">
                <div className="pb-1.5 text-xs font-medium text-ink-2">Sources</div>
                {srcOpts.map(([k, label]) => {
                  const SI = SOURCE_ICON[k];
                  return (
                  <div key={k} className="flex h-7 items-center justify-between text-sm">
                    <span className="flex items-center gap-2">{SI && <SI size={14} strokeWidth={1.5} className="text-ink-2" />}{label}</span>
                    <Toggle
                      aria-label={label}
                      on={srcOn.has(k)}
                      onChange={() => setSrcOn((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                    />
                  </div>
                  );
                })}
                <div className="pt-1.5 text-xs text-ink-3">{privateChat
                  ? `${scope.run ? 'Run details' : 'Job definition'} always included. Choose additional evidence above.`
                  : "The agent only reads what's on here."}</div>
              </Menu>
            </div>
          )}
          {/* The Chat toolbar after Plus, in order: Sources, the mode, the / slot, the mic; Send sits at the far right. */}
          {chat && <button type="button" data-chat-sources aria-label="Sources" title="Open sources" disabled={voiceOn} onMouseDown={event => event.preventDefault()} onClick={() => chat.panels.openSources()} className={COMPOSER_TOOL}><Library size={16} strokeWidth={1.5} /></button>}
          {chat && <ModeSelector disabled={voiceOn} />}
          {(dock || chat) && chatControl}
          {(dock || chat) && voice && voice.state === 'off' && (chat ? <span className="contents [&>button]:h-8 [&>button]:w-8 [&>button]:rounded-lg [&>button]:border-0"><VoiceToggle voice={voice} disabled={busy} /></span> : <VoiceToggle voice={voice} disabled={busy} />)}
          </>}
          voice={voiceOn ? <VoiceField voice={voice} /> : null}
          trailing={dock || chat ? null : chatControl}
        />
      </div>
      </>)}
    </div>
  );
}
