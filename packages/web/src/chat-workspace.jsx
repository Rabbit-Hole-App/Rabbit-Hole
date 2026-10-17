import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useChatPanels } from './chat-panels.js';
import { useChatThread } from './chat-threads.js';
import { useChatDraft } from './chat-draft.js';
import { useChatContext } from './chat-context.js';
import { useChatSources } from './chat-sources.js';

// The right-side Chat workspace on a Learn canvas (owner brief 2026-10-13; contract:
// agent-coordination/tasks/chat-workspace-CONTRACT.md, Part A). One provider per canvas composes five hooks, one per
// sub-lane, so each owns its own file:
//   panels   (chat-panels.js, A1)   the right panel's one open state and tab (Chat, ..., Context = Sources)
//   thread   (chat-threads.js, A2)  the open thread, its mode, History, New chat, restore, the late-response key
//   composer (chat-draft.js, A3a)   draft text and command per thread, prepare(), focus()
//   context  (chat-context.js, A4a) the one shared context collection: docs, attached refs, upload state
//   sources  (chat-sources.js, A4b) the active source, back stack, reading position per source
// Surfaces outside a Learn canvas get null from useChatWorkspace() and keep their old behaviour.
const ChatWorkspace = createContext(null);
export const useChatWorkspace = () => useContext(ChatWorkspace);

// canvasOps (LearnPage fills it from canvasApi): { insertNotebook(cells, language), insertChat(chat), insertCard(block, { same }), hasBlock(id), locate(id),
// canvasContext(options) - a turn's canvas_context built now (chat-canvas-context.js) - selection() },
// for Lane B's footer and actions (contract B3, B5). null until the canvas mounts; callers check before use.
export function ChatWorkspaceProvider({ canvas, canvasOps: initialOps = null, children }) {
  // The canvas API lives below the provider, so the page sets canvasOps once its canvas mounts (setCanvasOps).
  const [canvasOps, setCanvasOps] = useState(initialOps);
  const panels = useChatPanels(canvas);
  const thread = useChatThread(canvas);
  // thread.restore = { key, mode, contextRefs, draft }: a new key (open, New chat, canvas change) resets both hooks below.
  const composer = useChatDraft(canvas, thread);
  const context = useChatContext(canvas, thread);
  const sources = useChatSources(canvas);
  // The Table of contents' own conversation (owner brief 2026-10-16 item 7): its own thread (slot 'toc', always Tutor), draft
  // and attachments, so TOC and Chat never share messages, drafts or New chat. TocWorkspace hands them to the TOC's AskPanel.
  const tocThread = useChatThread(canvas, { slot: 'toc' });
  const tocComposer = useChatDraft(`${canvas}.toc`, tocThread);
  const tocContext = useChatContext(canvas, tocThread);
  const holdTutor = tocThread.holdMode;
  useEffect(() => { holdTutor('tutor'); }, [holdTutor]);
  const toc = useMemo(() => ({ thread: tocThread, composer: tocComposer, context: tocContext }), [tocThread, tocComposer, tocContext]);
  // composer.prepare (contract A6) for Lane B actions and Explore next: opens Chat, applies mode and refs, then the draft rules.
  const prepareDraft = composer.prepare;
  const prepare = useCallback((options = {}) => { panels.openChat(); if (options.mode) thread.setMode(options.mode); options.contextRefs?.forEach(context.attach); prepareDraft(options); }, [panels, thread, context, prepareDraft]);
  const chatComposer = useMemo(() => ({ ...composer, prepare }), [composer, prepare]);
  // A ref's reader opens in the Context tab; viewing never attaches (contract A5). options.reveal false: a late completion
  // loads the reader without reopening a panel the learner hid (chat-panels.js openSources).
  const openSource = useCallback((ref, options) => { panels.openSources(options); sources.open(ref); }, [panels, sources]);
  // Add to Chat (contract A5): open Chat, Ask mode, attach, keep the draft, focus, never send.
  const addToChat = useCallback((ref, options) => { if (canvasOps?.retainFileForContext?.(ref, options?.fileRef) === false) return false; panels.openChat(); thread.setMode('ask'); context.attach(ref); composer.focus(); }, [panels, thread, context, composer, canvasOps]);
  // The Chat's AskPanel registers its send loop (A2); regenerate(messageId) re-sends that turn with regenerate: { messageId }
  // (contract B5). The server reuses the stored turn's mode, command and refs, so nothing open now leaks in.
  const sender = useRef(null);
  const registerSender = useCallback(send => { sender.current = send; return () => { if (sender.current === send) sender.current = null; }; }, []);
  const regenerate = useCallback(messageId => sender.current?.({ regenerate: { messageId: String(messageId) } }), []);
  // The "This canvas" chip's line: coverage.summary of the last canvas_context the page built (a sent turn, or the chip's preview).
  const [canvasCoverage, setCanvasCoverage] = useState(null);
  const value = useMemo(() => ({ canvas, canvasOps, panels, thread, composer: chatComposer, context, sources, openSource, addToChat, registerSender, regenerate, setCanvasOps, canvasCoverage, setCanvasCoverage, toc, tocThreadId: tocThread.id }), [canvas, canvasOps, panels, thread, chatComposer, context, sources, openSource, addToChat, registerSender, regenerate, canvasCoverage, toc, tocThread.id]);
  return <ChatWorkspace.Provider value={value}>{children}</ChatWorkspace.Provider>;
}

// The Table of contents view's workspace: the page's, with the TOC's own thread, draft and attachments in place of Chat's,
// and its own send loop. tocView: the composer shows Tutor as its only mode (ModeSelector).
export function TocWorkspace({ children }) {
  const parent = useChatWorkspace();
  const sender = useRef(null);
  const registerSender = useCallback(send => { sender.current = send; return () => { if (sender.current === send) sender.current = null; }; }, []);
  const regenerate = useCallback(messageId => sender.current?.({ regenerate: { messageId: String(messageId) } }), []);
  const value = useMemo(() => parent && ({ ...parent, ...parent.toc, registerSender, regenerate, tocView: true }), [parent, registerSender, regenerate]);
  return <ChatWorkspace.Provider value={value}>{children}</ChatWorkspace.Provider>;
}
