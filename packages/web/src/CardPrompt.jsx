import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Copy, MessageSquarePlus } from 'lucide-react';
import { copyAnswer } from './AnswerFooter.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';

const icon = 'flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink';

// A generated card's Prompt row (docs/features/card-prompt.md): closed on every load; open, it shows the words typed to
// make the card. Copy copies them; the chat icon puts them in the Chat box (the draft rules: a written draft is kept),
// never sends. Off a Learn canvas (a shared board) there is no Chat box, so only Copy shows.
// onHeight: the card's frame grows by this row, as with SourcesDisclosure. A view-only board pans with the hand, so its cards
// take no pointer; this row takes it back (pointer-events-auto) so a viewer can open and copy the prompt.
export default function CardPrompt({ text, onHeight = null, className = 'px-4 pb-3' }) {
  const root = useRef(null);
  const chat = useChatWorkspace();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!onHeight || !root.current) return undefined;
    const observer = new ResizeObserver(() => onHeight(root.current ? root.current.offsetHeight : 0));
    observer.observe(root.current);
    return () => { observer.disconnect(); onHeight(0); };
  }, [onHeight]);
  useEffect(() => { if (!status) return undefined; const timer = setTimeout(() => setStatus(null), 1800); return () => clearTimeout(timer); }, [status]);
  if (!text) return null;
  const copy = async () => { try { await copyAnswer({ text }); setStatus('Copied'); } catch { setStatus('Copy failed'); } };
  return (
    <div ref={root} data-card-prompt className={`pointer-events-auto shrink-0 ${className}`} onPointerDown={event => event.stopPropagation()}>
      <div className="rounded-lg border border-line bg-white">
        <div className="flex items-center gap-1 px-1.5 py-0.5">
          <button type="button" aria-expanded={open} data-card-prompt-toggle onClick={() => setOpen(value => !value)}
            className="flex flex-1 cursor-pointer items-center gap-1.5 px-1.5 py-1 text-left text-xs text-ink-2 select-none hover:text-ink">
            <ChevronRight size={13} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
            Prompt
          </button>
          {status && <span role="status" className={`text-xs ${status === 'Copied' ? 'text-ink-2' : 'text-danger'}`}>{status}</span>}
          <button type="button" aria-label="Copy prompt" title="Copy prompt" data-card-prompt-copy className={icon} onClick={copy}><Copy size={13} /></button>
          {chat && <button type="button" aria-label="Put prompt in chat" title="Put this prompt in the chat box to edit and send" data-card-prompt-chat className={icon}
            onClick={() => chat.composer.prepare({ text })}><MessageSquarePlus size={13} /></button>}
        </div>
        {/* A long prompt scrolls inside the row (data-scroll: the wheel scrolls it, not the canvas), so the card stays near its size. */}
        {open && <p data-card-prompt-text data-scroll className="max-h-40 overflow-y-auto border-t border-line px-3 py-2 text-xs whitespace-pre-wrap break-words text-ink">{text}</p>}
      </div>
    </div>
  );
}
