import { useRef, useState } from 'react';
import { Button } from '../ui.jsx';

// Share in a new public thread (docs/features/canvas-comments.md section 15, owner decision D6): the author of a comment in a
// members thread offers some of their OWN words publicly. They select the part (all of it when nothing is selected); the server
// copies only that text into a new public thread of theirs. No other reply, file, person or history goes with it, and the new thread
// does not point back at this one.
export const plainText = message => message.segments.map(segment => segment.text ?? `@${segment.mention.handle}`).join('');

export function PublicCopy({ message, threadId, client, onDone, onClose }) {
  const box = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const text = plainText(message);
  const go = async () => {
    const field = box.current, chosen = field.selectionStart === field.selectionEnd ? '' : text.slice(field.selectionStart, field.selectionEnd);
    setBusy(true); setError(null);
    try {
      const made = await client.publicCopy(threadId, { id: crypto.randomUUID(), comment_id: message.id, ...(chosen.trim() ? { text: chosen } : {}) });
      onClose();
      onDone(made.thread.id);
    } catch (failure) { setError(failure.data?.error || failure.message); } finally { setBusy(false); }
  };
  return (
    <div data-public-copy className="mt-1 rounded-md border border-line p-2">
      <p className="mb-1 text-xs text-ink-2">Start a new public thread with words from your comment. Select the part to share, or share all of it. Nothing else from this thread is copied: no replies, files, people or history.</p>
      <textarea ref={box} readOnly aria-label="Your comment" value={text} rows={3} className="w-full resize-y rounded-md border border-line px-2 py-1 text-sm text-ink" />
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
      <div className="mt-1 flex justify-end gap-1">
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={busy} onClick={go}>Start public thread</Button>
      </div>
    </div>
  );
}
