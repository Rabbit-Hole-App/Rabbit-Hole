import { CircleAlert, FileCode2, FileText, Film, Globe, Group, Image, Loader2, RotateCw, Shapes, StickyNote, X } from 'lucide-react';
import { useChatWorkspace } from './chat-workspace.jsx';
import { rangeLabel, refKey, sameRef } from './chat-context.js';
import { refIds } from './chat-canvas-context.js';
import { labelOnlyChip } from './pdf-source.js';

// Sub-lane A4a owns this file: attached-context chips under the composer text area (brief section 7). A3a mounts it.
// First a fixed "This canvas" indicator (the canvas scope the server always reads, contract A5), then this conversation's
// attached refs and any upload in flight or failed. A click opens the source beside Chat (never attaches); x detaches
// from this conversation only, never deleting the file or the canvas object.
export const REF_ICONS = { doc: FileText, card: StickyNote, group: Group, code: FileCode2, image: Image, media: Film, web: Globe };
export const RefIcon = ({ kind, size = 14, className = 'shrink-0 text-ink-3' }) => {
  const Icon = REF_ICONS[kind] || FileText;
  return <Icon size={size} strokeWidth={1.75} aria-hidden className={className} />;
};

const CHIP = 'inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md border border-line bg-white text-xs text-ink';
const CHIP_ICON_BUTTON = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink';

// readPaper: the uploaded paper id this turn reads (paper_context), or null; every other uploaded-PDF page chip is marked
// as a label only, the way the server names it to the model (chat-modes.js chatContext).
const LABEL_ONLY = 'Only one uploaded PDF is read per question; this page is sent as a label only.';
// selection: the selected canvas object as chat context, { ref, id, kind, title, pinned, onClear } (pdf-materials-refinement.md
// section 6), or null. One document and page is one entry here: a pinned selection marks the chip of its attached ref (its x
// detaches it and clears the selection, so it does not come straight back as a selection); an unpinned one (a PDF card or page)
// is a dashed chip of its own whose x clears the selection, the way the pill's did. The selection pill above the composer carries
// the same data-canvas-target and data-selected-card markers.
export default function ContextChips({ readPaper = null, selection = null }) {
  const chat = useChatWorkspace();
  if (!chat) return null;
  const chips = chat.context.items.filter(item => item.attached || item.state !== 'ready');
  const failed = chips.filter(item => item.state === 'failed');
  // "This canvas" says what goes with a message (whole-canvas context): the coverage line of the package the draft would send,
  // built on hover or focus, else of the one the last message sent (canvasCoverage: the page sets it whenever it builds one).
  const preview = () => chat.canvasOps?.canvasContext?.({ request: chat.composer.text, attachments: refIds(chat.context.attached) });
  return (
    <div data-context-chips>
      <ul aria-label="Context for this chat" className="flex flex-wrap items-center gap-1">
        <li data-canvas-context title={chat.canvasCoverage || 'An overview of this canvas goes with each message'} data-canvas-coverage={chat.canvasCoverage || undefined}
          tabIndex={0} onPointerEnter={preview} onFocus={preview} className={`${CHIP} bg-hover px-1.5 text-ink-2`}>
          <Shapes size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3" /> This canvas
        </li>
        {selection && !selection.pinned && (() => {
          const { ref } = selection, label = rangeLabel(ref.range), labelOnly = labelOnlyChip(ref, readPaper);
          return (
            <li data-canvas-target data-selected-card={selection.id} data-context-selection data-ref-key={refKey(ref)} data-label-only={labelOnly || undefined}
              title={`${selection.kind}: ${String(selection.title ?? '')}`} className={`${CHIP} border-dashed border-line-strong pr-0.5`}>
              <button type="button" onClick={() => chat.openSource(ref)} title={labelOnly ? `Open ${ref.name}. Selected on the canvas: it goes with the next question. ${LABEL_ONLY}` : `Open ${ref.name}. Selected on the canvas: it goes with the next question; Add to chat keeps it.`}
                className="flex h-full min-w-0 items-center gap-1 rounded-l-md pl-1.5 hover:bg-hover">
                <RefIcon kind={ref.kind} />
                <span className="max-w-40 truncate">{ref.name}</span>
                {label && <span className="shrink-0 text-ink-3">{label}</span>}
                {labelOnly && <span className="shrink-0 text-ink-3">· label only</span>}
                <span className="shrink-0 text-ink-3">· selected</span>
              </button>
              <button type="button" onClick={selection.onClear} aria-label="Remove selected card context" title="Clear the selection" className={CHIP_ICON_BUTTON}><X size={12} aria-hidden /></button>
            </li>
          );
        })()}
        {chips.map(item => {
          const { ref, state } = item, label = rangeLabel(ref.range), busy = state === 'uploading' || state === 'processing', labelOnly = state === 'ready' && labelOnlyChip(ref, readPaper);
          const selected = !!selection?.pinned && state === 'ready' && sameRef(selection.ref, ref);
          return (
            <li key={item.id || refKey(ref)} data-context-chip={state} data-ref-key={refKey(ref)} data-label-only={labelOnly || undefined}
              {...(selected ? { 'data-canvas-target': true, 'data-selected-card': selection.id } : {})}
              className={`${CHIP} pr-0.5 ${state === 'failed' ? 'border-red-300' : selected ? 'border-accent' : ''}`}>
              <button type="button" disabled={state !== 'ready'} onClick={() => chat.openSource(ref)} title={state === 'failed' ? item.error : labelOnly ? `Open ${ref.name}. ${LABEL_ONLY}` : `Open ${ref.name}`}
                className="flex h-full min-w-0 items-center gap-1 rounded-l-md pl-1.5 hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent">
                {busy ? <Loader2 size={14} aria-hidden className="shrink-0 animate-spin text-ink-3" />
                  : state === 'failed' ? <CircleAlert size={14} aria-hidden className="shrink-0 text-red-700" /> : <RefIcon kind={ref.kind} />}
                <span className="max-w-40 truncate">{ref.name}</span>
                {label && <span className="shrink-0 text-ink-3">{label}</span>}
                {labelOnly && <span className="shrink-0 text-ink-3">· label only</span>}
                {busy && <span className="shrink-0 text-ink-3">{state === 'processing' ? 'Processing' : 'Uploading'}</span>}
                {state === 'failed' && <span className="shrink-0 text-red-700">Failed</span>}
                {selected && <span className="shrink-0 text-ink-3">· selected</span>}
              </button>
              {state === 'failed' && <button type="button" onClick={item.retry} aria-label={`Retry uploading ${ref.name}`} title="Retry" className={CHIP_ICON_BUTTON}><RotateCw size={12} aria-hidden /></button>}
              {!busy && <button type="button" onClick={() => { if (item.dismiss) item.dismiss(); else { chat.context.detach(ref); if (selected) selection.onClear?.(); } }}
                aria-label={item.dismiss ? `Dismiss ${ref.name}` : `Remove ${ref.name} from this chat`} title={item.dismiss ? 'Dismiss' : 'Remove from this chat'} className={CHIP_ICON_BUTTON}><X size={12} aria-hidden /></button>}
            </li>
          );
        })}
      </ul>
      {failed.map(item => <p key={item.id} role="alert" className="mt-1 truncate text-xs text-red-700" title={item.error}>{item.ref.name}: {item.error}</p>)}
    </div>
  );
}
