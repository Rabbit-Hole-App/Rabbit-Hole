// The parts of a PDF excerpt card (pdf-excerpt.js; contract "Canvas cards"): the learner's note and the compact source footer,
// shared by the text card (LearningBlocks ExcerptBody) and the region card (AdaptiveCanvas FileCard).
import { useEffect, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { excerptSourceRef, pageText, sourceAvailable } from './pdf-excerpt.js';

// The note is the learner's own words, kept apart from the quotation. Typing stays in the field; leaving it saves once (one Undo).
export function ExcerptNote({ block, onChange, readOnly = false }) {
  const [text, setText] = useState(block.note || '');
  useEffect(() => setText(block.note || ''), [block.note]);
  if (readOnly && !text) return null;
  return (
    <textarea data-excerpt-note aria-label="Your note" placeholder="Add a note…" value={text} readOnly={readOnly} rows={2}
      onPointerDown={event => event.stopPropagation()} onChange={event => setText(event.target.value)}
      onBlur={() => { if (text !== (block.note || '')) onChange?.({ ...block, note: text }); }}
      className="mt-2 w-full resize-none rounded-md border border-line bg-white px-2 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-line-strong focus:outline-none" />
  );
}

// Title, page and Open source: the existing companion reader at the excerpt's page and anchor (LearnPage 'small:excerpt-source').
// The PDF's own access check runs first; a refusal says so here and changes nothing else on the card.
export function ExcerptSource({ excerpt, app }) {
  const [state, setState] = useState('idle');
  const open = async () => {
    setState('checking');
    if (!(await sourceAvailable({ app, excerpt }))) { setState('unavailable'); return; }
    setState('idle');
    window.dispatchEvent(new CustomEvent('small:excerpt-source', { detail: { ref: excerptSourceRef(excerpt) } }));
  };
  return (
    <div data-excerpt-source className="mt-2 flex items-center gap-1.5 border-t border-line pt-1.5 text-[11px] text-ink-3">
      <span className="min-w-0 flex-1 truncate" title={excerpt.source?.name}>{excerpt.source?.name || 'PDF'}</span>
      <span className="shrink-0">p. {pageText(excerpt.page)}</span>
      {state === 'unavailable' && <span data-excerpt-source-unavailable role="status" className="shrink-0 text-ink-2">Source not available</span>}
      <button type="button" aria-label="Open source" title="Open source" disabled={state === 'checking'} onPointerDown={event => event.stopPropagation()} onClick={open}
        className="flex shrink-0 items-center rounded p-1 text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-60">
        {state === 'checking' ? <Loader2 size={12} className="animate-spin" /> : <BookOpen size={12} />}
      </button>
    </div>
  );
}
