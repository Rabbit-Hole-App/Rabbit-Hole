import { CircleAlert, FileCode2, FileText, Film, Globe, Group, Image, Loader2, RotateCw, Shapes, StickyNote, X } from 'lucide-react';
import { useChatWorkspace } from './chat-workspace.jsx';
import { rangeLabel, refKey } from './chat-context.js';

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

export default function ContextChips() {
  const chat = useChatWorkspace();
  if (!chat) return null;
  const chips = chat.context.items.filter(item => item.attached || item.state !== 'ready');
  const failed = chips.filter(item => item.state === 'failed');
  return (
    <div data-context-chips>
      <ul aria-label="Context for this chat" className="flex flex-wrap items-center gap-1">
        <li data-canvas-context title="The agent always reads this canvas" className={`${CHIP} bg-hover px-1.5 text-ink-2`}>
          <Shapes size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3" /> This canvas
        </li>
        {chips.map(item => {
          const { ref, state } = item, label = rangeLabel(ref.range), busy = state === 'uploading' || state === 'processing';
          return (
            <li key={item.id || refKey(ref)} data-context-chip={state} className={`${CHIP} pr-0.5 ${state === 'failed' ? 'border-red-300' : ''}`}>
              <button type="button" disabled={state !== 'ready'} onClick={() => chat.openSource(ref)} title={state === 'failed' ? item.error : `Open ${ref.name}`}
                className="flex h-full min-w-0 items-center gap-1 rounded-l-md pl-1.5 hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent">
                {busy ? <Loader2 size={14} aria-hidden className="shrink-0 animate-spin text-ink-3" />
                  : state === 'failed' ? <CircleAlert size={14} aria-hidden className="shrink-0 text-red-700" /> : <RefIcon kind={ref.kind} />}
                <span className="max-w-40 truncate">{ref.name}</span>
                {label && <span className="shrink-0 text-ink-3">{label}</span>}
                {busy && <span className="shrink-0 text-ink-3">{state === 'processing' ? 'Processing' : 'Uploading'}</span>}
                {state === 'failed' && <span className="shrink-0 text-red-700">Failed</span>}
              </button>
              {state === 'failed' && <button type="button" onClick={item.retry} aria-label={`Retry uploading ${ref.name}`} title="Retry" className={CHIP_ICON_BUTTON}><RotateCw size={12} aria-hidden /></button>}
              {!busy && <button type="button" onClick={() => (item.dismiss ? item.dismiss() : chat.context.detach(ref))}
                aria-label={item.dismiss ? `Dismiss ${ref.name}` : `Remove ${ref.name} from this chat`} title={item.dismiss ? 'Dismiss' : 'Remove from this chat'} className={CHIP_ICON_BUTTON}><X size={12} aria-hidden /></button>}
            </li>
          );
        })}
      </ul>
      {failed.map(item => <p key={item.id} role="alert" className="mt-1 truncate text-xs text-red-700" title={item.error}>{item.ref.name}: {item.error}</p>)}
    </div>
  );
}
