// The source line under a card made from a selected passage (source-ref.js, Tutor release R3; docs/features/source-refs.md): where
// the card came from, one quiet row in the card's footer like Sources and evidence. "View passage" opens the source at the
// passage: the PDF reader at the page with the anchor emphasized, or the Markdown file card with the quote emphasized. A source
// that changed, went away or is not yours says so and offers nothing: the passage is never found by position or by text.
// A shared reader's card has no id: it shows only the name.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BookOpen, FileText, ScanText } from 'lucide-react';
import { api } from './api.js';
import { NO_FILE_CARD, STATUS_SHORT, STATUS_TEXT, navigable, refLabel, sourceRefOf } from './source-ref.js';
import { cachedExcerpt, publishBlocks, published, resolveSourceRef, stepExcerpt, subscribeBlocks, viewPassage } from './source-refs.js';

const NONE = [];
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });

// The canvas publishes its blocks and camera so the readers outside its React tree (the PDF reader, a Markdown file card) can
// find an explanation card and move to it. One line in AdaptiveCanvas: useSourceRefIndex(blocks, focusCard).
export function useSourceRefIndex(blocks, focus) {
  const latest = useRef(focus);
  latest.current = focus;
  const stable = useCallback(id => latest.current?.(id), []);
  useEffect(() => { publishBlocks(blocks, stable); }, [blocks, stable]);
  useEffect(() => () => publishBlocks([], null), []);
}
// The published blocks, for a reader that lists explanations for its own source.
export const useSourceRefBlocks = () => useSyncExternalStore(subscribeBlocks, () => published().blocks, () => NONE); // NONE: the server render (and its test) sees no blocks
// The Tutor's slots with a passage (source-refs.js publishPending), for a Markdown file card's passage menu.
export const useSourcePending = () => useSyncExternalStore(subscribeBlocks, () => published().pending, () => NONE);
// A ref's status as the server checks it now (null: not asked yet, or the answer failed): the chip's own read, shared with a Tutor slot's source line.
export function useSourceRefStatus(id, app, rev) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!id || !app) return undefined;
    let live = true;
    resolveSourceRef(post, app, id).then(found => { if (live) setStatus(found?.status ?? null); });
    return () => { live = false; };
  }, [id, app, rev]);
  return status;
}

// The passage a Tutor step is about (source-refs.js stepExcerpt): the slot and the Chat entry call this with the step's `sourceRef` (steps[].sourceRef or
// proposal.sourceRelation.sourceRef: only its `id` is used) and the canvas name. -> { state: 'none' } (no reference to ask), { state: 'loading' },
// { state: 'ready', text } (the exact quote, at most 400 characters) or { state: 'unavailable' } (honest: no quote is invented).
export function useStepExcerpt(sourceRef, app) {
  const id = sourceRef?.id ?? null;
  const [found, setFound] = useState(() => (id && app ? cachedExcerpt(app, id) : null));
  useEffect(() => {
    if (!id || !app) { setFound(null); return undefined; }
    let live = true;
    const held = cachedExcerpt(app, id);
    if (held) setFound(held);
    else { setFound(null); stepExcerpt(post, app, id).then(out => { if (live) setFound(out); }); }
    return () => { live = false; };
  }, [id, app]);
  return !id || !app ? { state: 'none' } : found || { state: 'loading' };
}

export default function SourceRefChip({ block, app, onHeight = null }) {
  const ref = sourceRefOf(block);
  const root = useRef(null);
  const [note, setNote] = useState('');
  const status = useSourceRefStatus(ref?.id ?? null, app, block.sourceRef?.source?.rev); // null: not asked yet, or the answer failed
  // The card's frame grows by exactly this row, as the Sources row does.
  useEffect(() => {
    if (!onHeight || !root.current) return undefined;
    const observer = new ResizeObserver(() => onHeight(root.current ? root.current.offsetHeight : 0));
    observer.observe(root.current);
    return () => { observer.disconnect(); onHeight(0); };
  }, [onHeight]);
  if (!ref) return null;
  const open = () => { if (viewPassage(ref, { raw: !!block.stepId }) === 'no-card') setNote(NO_FILE_CARD); else setNote(''); };
  return <div ref={root} onPointerDown={event => event.stopPropagation()}><SourceRefLine ref_={ref} status={status} note={note} onOpen={open} /></div>;
}

// A delivered Explanation's source in its header (CORE.09, file 04): "Source: filename" and View passage (approved card 07, GAP-04; other surfaces keep View section), the ScanText glyph the Markdown View card button
// shares (file 05). The same status read, gate and viewPassage as the footer row; it replaces that row on the card, so its height counts once.
export function SourceRefHeader({ block, app }) {
  const ref = sourceRefOf(block);
  const [note, setNote] = useState('');
  const status = useSourceRefStatus(ref?.id ?? null, app, block.sourceRef?.source?.rev);
  if (!ref) return null;
  return <SourceRefHead ref_={ref} status={status} note={note} onOpen={() => setNote(viewPassage(ref, { raw: !!block.stepId }) === 'no-card' ? NO_FILE_CARD : '')} />;
}
export function SourceRefHead({ ref_: ref, status, note = '', onOpen }) {
  const bad = status && status !== 'current';
  return (
    <span data-source-ref data-source-ref-status={status || 'unknown'} onPointerDown={event => event.stopPropagation()} className="flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
      <FileText size={14} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate" title={refLabel(ref)}>Source: {refLabel(ref)}</span>
      {bad && <span data-source-ref-note role="status" title={STATUS_TEXT[status]} aria-label={STATUS_TEXT[status]} className="shrink-0">{STATUS_SHORT[status]}</span>}
      {!bad && note && <span data-source-ref-note role="status" className="shrink-0">{note}</span>}
      {navigable(ref) && status === 'current' && (
        <button type="button" data-source-ref-open data-view-section aria-label="View passage" title="View passage" onClick={onOpen}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"><ScanText size={16} aria-hidden="true" /></button>
      )}
    </span>
  );
}

// The row itself, apart from the status read and the camera so it can be rendered and tested as markup. Plain buttons, always shown: the
// keyboard reaches View passage by Tab and presses it with Enter or Space, and nothing here depends on hover.
export function SourceRefLine({ ref_: ref, status, note = '', onOpen }) {
  const bad = status && status !== 'current';
  return (
    <div data-source-ref data-source-ref-status={status || 'unknown'} className="shrink-0 px-4 pb-3">
      <div className="flex items-center gap-1.5 border-t border-line pt-1.5 text-[11px] text-ink-3">
        <FileText size={12} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate" title={refLabel(ref)}>From {refLabel(ref)}</span>
        {bad && <span data-source-ref-note role="status" title={STATUS_TEXT[status]} aria-label={STATUS_TEXT[status]} className="shrink-0 text-ink-2">{STATUS_SHORT[status]}</span>}
        {!bad && note && <span data-source-ref-note role="status" className="shrink-0 text-ink-2">{note}</span>}
        {navigable(ref) && status === 'current' && (
          <button type="button" data-source-ref-open aria-label="View passage" title="View passage" onClick={onOpen}
            className="flex shrink-0 items-center rounded p-1 text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"><BookOpen size={12} aria-hidden="true" /></button>
        )}
      </div>
    </div>
  );
}
