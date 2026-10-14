// Whole-canvas context (owner brief 2026-10-14, contract v1.1; canvas-context-SUBLANES.md A-wire): the ONE place a chat turn's
// canvas_context is built. The canvas API's liveBoard() (the live lists with the open text editor's unsaved words, and the
// measured boxes) goes through inline-ai-context.js boardObjects and buildCanvasContext at submit. Every canvas-chat path calls it
// through the page (LearnPage canvasContext): Ask and Tutor modes on /api/learn/ask (ask.jsx), Auto's Tutor plan (LearnTutor.jsx)
// and the "This canvas" chip's coverage line.
import { boardObjects, buildCanvasContext } from './inline-ai-context.js';

// api: the canvas API (AdaptiveCanvas commandsRef); null without one. selection: the target's ids plus the live canvas selection
// (api.selection()); a group id brings its members, a multi-select target (`selection:a+b`) its ids, and an id not on the board
// (a deleted object, a marked area) is dropped - in history refs too. inspected: the objects whose picture rides in this request
// (image_context), the only media the package may call inspected. build: the builder (a test passes a recorder).
export function canvasContextNow({ api, title = null, request = '', history = [], selection = [], attachments = [], inspected = [] }, build = buildCanvasContext) {
  if (!api?.liveBoard) return null;
  const { objects, connectors, groups } = boardObjects(api.liveBoard());
  const members = new Map(groups.map(group => [group.id, group.member_ids]));
  const known = new Set([...objects.map(object => object.id), ...members.keys()]);
  const ids = list => [...new Set(list.flatMap(id => (String(id).startsWith('selection:') ? String(id).slice(10).split('+') : [id]))
    .flatMap(id => [id, ...(members.get(id) || [])]))].filter(id => known.has(id));
  const shown = new Set(inspected);
  return build({
    objects: objects.map(object => (shown.has(object.id) ? { ...object, inspected: true } : object)), connectors, groups, title, request,
    history: history.map(turn => (turn.refs ? { ...turn, refs: ids(turn.refs) } : turn)),
    selection: ids([...selection, ...(api.selection?.() || [])]), attachments: ids(attachments),
  });
}

// The builder's history: the chat's last six messages, oldest first; a user message keeps the ids it was sent with (refs).
export const chatHistory = (messages = []) => messages.filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content)
  .slice(-6).map(m => ({ role: m.role, text: m.content, ...(m.refs?.length ? { refs: m.refs } : {}) }));

// The canvas objects behind the chat's attached refs (chat-context.js ContextRef, selection-ref.js): a card ref's own id, a
// group ref's members. Documents, web and code refs are not canvas objects.
export const refIds = (refs = []) => refs.flatMap(ref => (ref.kind === 'group' ? ref.range?.cardIds || [] : ref.kind === 'card' ? [ref.sourceId.slice(ref.sourceId.indexOf(':') + 1)] : []));
