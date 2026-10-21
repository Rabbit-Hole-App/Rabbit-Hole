import { useState } from 'react';
import { ChevronDown, MessageSquarePlus, X } from 'lucide-react';
import { AskPanel } from './ask.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';

// The Table of contents' own conversation (owner brief 2026-10-16 item 7), under the outline: the learner's requests and the
// Tutor's replies, above the TOC composer. Mounted inside TocWorkspace, so its thread, draft and attachments are the TOC's,
// never Chat's. It is capped and scrolls inside, so the outline stays the main content; collapsed, only the composer shows.
// Empty state (owner UI brief 2026-10-20 section 6): with no TOC messages there is no "TOC conversation" section, only one
// compact "Ask the Tutor about this outline" entry; pressing it opens the composer (focused, closable while empty). The
// section shows once a turn is sent or the saved TOC thread has messages (after a refresh too); an unsent draft keeps the
// composer open. Nothing shows while the saved thread is still loading, so a restored conversation never flashes the entry.
export default function TocConversation(askProps) {
  const [open, setOpen] = useState(true), [shownIn, setShownIn] = useState(null), [composing, setComposing] = useState(false), [closed, setClosed] = useState(false);
  const { thread, composer } = useChatWorkspace() || {};
  // Latched per restore key (a sent turn, or a restore that brought messages): AskPanel later writes its live transcript into
  // restore.messages, starting from an empty one on mount, so that array alone would hide the conversation it just restored.
  if (thread?.restore.messages?.length > 0 && shownIn !== thread.restore.key) setShownIn(thread.restore.key);
  const has = !!thread && shownIn === thread.restore.key;
  const drafted = !!(composer?.text || composer?.command);
  if (thread?.status === 'loading' && !has) return null;
  if (!has && !composing && !drafted) return (
    <div data-toc-start className="mt-auto shrink-0 border-t border-line pt-2">
      {/* autoFocus only after the composer was closed: focus returns here, never on first render. */}
      <button type="button" autoFocus={closed} onClick={() => setComposing(true)} title="Ask the Tutor about this outline"
        className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-xs text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60">
        <MessageSquarePlus size={14} strokeWidth={1.8} aria-hidden className="shrink-0" />Ask the Tutor about this outline
      </button>
    </div>
  );
  // One section either way, so the composer (and a turn in flight) is never remounted when the first message lands.
  return (
    <section aria-label={has ? 'TOC conversation' : 'Ask the Tutor'} data-toc-conversation={has ? '' : undefined} data-toc-ask={has ? undefined : ''} className="mt-auto flex max-h-[45%] min-h-0 shrink-0 flex-col border-t border-line pt-2">
      {has ? (
        <button type="button" aria-expanded={open} data-toc-conversation-toggle onClick={() => setOpen(shown => !shown)}
          className="mb-1 flex h-7 shrink-0 items-center justify-between rounded-md px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">
          <span>TOC conversation</span><ChevronDown size={14} aria-hidden className={open ? '' : 'rotate-180'} />
        </button>
      ) : (
        <div className="mb-1 flex h-7 shrink-0 items-center justify-between px-1.5 text-xs text-ink-2">
          <span>Ask the Tutor about this outline</span>
          {!drafted && <button type="button" data-toc-ask-close aria-label="Close the Tutor composer" title="Close the Tutor composer" onClick={() => { setComposing(false); setClosed(true); }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"><X size={14} aria-hidden /></button>}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col"><AskPanel {...askProps} autoFocus={composing && !has} hideConversation={!open || !has}
        onSent={message => { if (thread) setShownIn(thread.restore.key); askProps.onSent?.(message); }} /></div>
    </section>
  );
}
