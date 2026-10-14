import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Plus, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api } from './api.js';
import { cn } from './ui.jsx';

// The answer footer (owner brief section 10; chat-workspace-CONTRACT.md B2, B5): one compact row under a finished assistant
// answer - Add as card, Copy, Regenerate (latest answer only), the turn's alternatives, and thumbs. Everything that
// reaches the canvas, the send loop or the network is a prop, so a test passes fakes; the defaults below are the real ones.

// Server message ids are stringified INTEGERs; 'local-<n>' (still streaming) and older client ids are not.
const serverId = id => /^\d+$/.test(String(id ?? ''));
// chat-<messageId>; a message with no id at all (an old restored row before B3) gets no fixed id, so each Add is new.
export const cardIdFor = message => (message.messageId ?? message.id) == null ? undefined : `chat-${message.messageId ?? message.id}`;
export const REASON_MAX = 280;
// A finished answer: done, not an error line, not the demo's canned reply.
export const footerShown = message => message?.role === 'assistant' && message.status === 'done' && !message.demo && !!message.content && !message.content.startsWith('✗');
// Clicking the active thumb clears it.
export const nextRating = (current, clicked) => (current === clicked ? null : clicked);

// Markdown as text/plain, and the rendered answer as text/html where ClipboardItem exists, so a paste into a doc keeps
// headings, lists and links; otherwise text only.
export async function copyAnswer({ text, html }, clipboard = globalThis.navigator?.clipboard, Item = globalThis.ClipboardItem) {
  if (html && Item && clipboard?.write) {
    return clipboard.write([new Item({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
  }
  return clipboard.writeText(text);
}
export const putAnswerFeedback = (messageId, body) => api(`/api/learn/chat/messages/${messageId}/feedback`, { method: 'PUT', body: JSON.stringify(body) });
export const getAnswerAlternative = messageId => api(`/api/learn/chat/messages/${messageId}`);

const icon = 'flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50';
const quiet = 'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink-3 opacity-60 hover:bg-hover hover:text-ink hover:opacity-100 focus-visible:opacity-100 group-hover/answer:opacity-100 aria-pressed:text-ink aria-pressed:opacity-100';

export default function AnswerFooter({ message, latest = false, onAddAsCard = null, onLocateCard = null, cardExists = null, onRegenerate = null, onSelectAlternative = null, putFeedback = putAnswerFeedback, copyText = copyAnswer }) {
  const root = useRef(null);
  const [justAdded, setJustAdded] = useState(false);
  const [copied, setCopied] = useState(null);
  const [rating, setRating] = useState(message.meta?.feedback?.rating ?? null);
  const [reason, setReason] = useState(null); // null = the reason field is closed
  const [note, setNote] = useState(null);
  const [switching, setSwitching] = useState(false);
  useEffect(() => { if (!copied) return undefined; const timer = setTimeout(() => setCopied(null), 1800); return () => clearTimeout(timer); }, [copied]);
  if (!footerShown(message)) return null;
  const id = message.messageId, saved = serverId(id), cardId = cardIdFor(message);
  const added = justAdded || !!cardExists?.(cardId);
  const alternatives = saved ? (message.meta?.alternatives || []).map(String) : [], at = alternatives.indexOf(String(id));

  const copy = async () => {
    // The rendered answer is the sibling body ChatMessages marks; without it the copy is markdown only.
    const html = root.current?.closest('[data-answer]')?.querySelector('[data-answer-body]')?.innerHTML || null;
    try { await copyText({ text: message.content, html }); setCopied('Copied'); } catch { setCopied('Copy failed'); }
  };
  // The thumbs show only what the PUT returned: a failed save leaves them as they were. A fresh thumbs-down opens the
  // optional reason; sending the reason, or any other rating, closes it.
  const rate = async body => {
    setNote(null);
    try {
      const out = await putFeedback(id, body);
      setRating(out.rating ?? null);
      setReason(out.rating === 'down' && body.reason === undefined ? '' : null);
    } catch { setNote('Not saved'); }
  };
  const pick = async target => {
    if (switching || !target) return;
    setSwitching(true);
    try { await onSelectAlternative(target); } catch { setNote('Could not load that answer'); } finally { setSwitching(false); }
  };

  return (
    <div ref={root} data-answer-footer className="mt-1 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-0.5">
        {onAddAsCard && (added
          ? <button type="button" data-add-to-canvas data-added title="Show the card on the canvas" className={cn(icon, 'text-green-700 hover:text-green-800')} onClick={() => onLocateCard?.(cardId)}><Check size={13} />Added</button>
          : <button type="button" data-add-to-canvas title="Save this answer as a card on the canvas" className={icon} onClick={() => { onAddAsCard({ id: cardId, answer: message.content, sources: message.meta?.contextRefs ?? null }); setJustAdded(true); }}><Plus size={13} />Add as card</button>)}
        <span className="relative flex items-center">
          <button type="button" aria-label="Copy answer" title="Copy answer" className={icon} onClick={copy}><Copy size={13} /></button>
          {copied && <span role="status" className={cn('ml-1 text-xs', copied === 'Copied' ? 'text-ink-2' : 'text-danger')}>{copied}</span>}
        </span>
        {latest && onRegenerate && saved && (
          <button type="button" aria-label="Regenerate answer" title="Regenerate answer" className={icon} onClick={() => onRegenerate(id)}><RotateCcw size={13} /></button>
        )}
        {alternatives.length > 1 && at >= 0 && onSelectAlternative && (
          <span data-alternatives className="flex items-center text-xs text-ink-2">
            <button type="button" aria-label="Previous answer" title="Previous answer" disabled={switching || at === 0} className={icon} onClick={() => pick(alternatives[at - 1])}><ChevronLeft size={13} /></button>
            <span className="tabular-nums">{at + 1}/{alternatives.length}</span>
            <button type="button" aria-label="Next answer" title="Next answer" disabled={switching || at === alternatives.length - 1} className={icon} onClick={() => pick(alternatives[at + 1])}><ChevronRight size={13} /></button>
          </span>
        )}
        {saved && (
          <span className="ml-auto flex items-center">
            <button type="button" aria-label="Good answer" title="Good answer" aria-pressed={rating === 'up'} className={quiet} onClick={() => rate({ rating: nextRating(rating, 'up') })}><ThumbsUp size={13} /></button>
            <button type="button" aria-label="Bad answer" title="Bad answer" aria-pressed={rating === 'down'} className={quiet} onClick={() => rate({ rating: nextRating(rating, 'down') })}><ThumbsDown size={13} /></button>
          </span>
        )}
        {note && <span role="status" className="text-xs text-danger">{note}</span>}
      </div>
      {reason !== null && rating === 'down' && (
        <form data-feedback-reason className="flex items-center gap-1.5" onSubmit={event => { event.preventDefault(); rate({ rating: 'down', reason }); }}>
          <input aria-label="What was wrong? (optional)" placeholder="What was wrong? (optional)" maxLength={REASON_MAX} value={reason} onChange={event => setReason(event.target.value)} className="h-7 min-w-0 flex-1 rounded-md border border-line bg-white px-2 text-xs" />
          <button type="submit" className={cn(icon, 'border border-line')}>Send</button>
          <button type="button" className={icon} onClick={() => setReason(null)}>Skip</button>
        </form>
      )}
    </div>
  );
}
