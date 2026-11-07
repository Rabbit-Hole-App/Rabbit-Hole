import { useEffect, useState } from 'react';
import { ChevronDown, Eraser, MessageSquarePlus, X } from 'lucide-react';
import { AskPanel } from './ask.jsx';
import { Button } from './ui.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';

// The Table of contents' own conversation (owner brief 2026-10-16 item 7; owner approved 2026-11-07, over checklist UI.02): the learner's
// requests and the Tutor's replies in a small window above the TOC composer, which stays fixed under the scrolling outline. Mounted inside
// TocWorkspace, so its thread, draft and context pills are the TOC's, never Chat's. The window is capped and scrolls inside; its header
// minimizes it (only the header shows) and clears it: Clear starts a new empty conversation, the old one stays in Chat History.
// Empty state: no messages, no window, only one compact "Ask the Tutor about this outline" entry; pressing it opens the composer (focused,
// closable while empty). A pill the learner added with a contents row's Add to chat keeps the composer open. Nothing shows while the saved
// thread is still loading, so a restored conversation never flashes the entry.
export default function TocConversation(askProps) {
  const [open, setOpen] = useState(true), [shownIn, setShownIn] = useState(null), [composing, setComposing] = useState(false), [closed, setClosed] = useState(false), [clearing, setClearing] = useState(false);
  const { thread, composer, context } = useChatWorkspace() || {};
  // Latched per restore key (a sent turn, or a restore that brought messages): AskPanel later writes its live transcript into
  // restore.messages, starting from an empty one on mount, so that array alone would hide the conversation it just restored.
  if (thread?.restore.messages?.length > 0 && shownIn !== thread.restore.key) setShownIn(thread.restore.key);
  const has = !!thread && shownIn === thread.restore.key;
  const pills = (context?.attached || []).filter(ref => ref.kind !== 'doc').length; // a pill added from the contents; the canvas documents never ride here
  const drafted = !!(composer?.text || composer?.command) || pills > 0;
  // A press outside the open Clear popover (or Escape) cancels it.
  useEffect(() => {
    if (!clearing) return undefined;
    const away = event => { if (!event.target?.closest?.('[data-toc-clear-confirm],[data-toc-clear]')) setClearing(false); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [clearing]);
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
        <div className="relative mb-1 flex h-7 shrink-0 items-center">
          <button type="button" aria-expanded={open} data-toc-conversation-toggle onClick={() => setOpen(shown => !shown)}
            className="flex h-7 min-w-0 flex-1 items-center justify-between rounded-md px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">
            <span>TOC conversation</span><ChevronDown size={14} aria-hidden className={open ? '' : 'rotate-180'} />
          </button>
          <button type="button" data-toc-clear aria-label="Clear the conversation" aria-haspopup="dialog" aria-expanded={clearing} title="Clear the conversation" onClick={() => setClearing(shown => !shown)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"><Eraser size={14} aria-hidden /></button>
          {clearing && (
            <div role="alertdialog" aria-label="Clear the conversation" data-toc-clear-confirm className="absolute top-8 right-0 z-30 w-64 rounded-md border border-line bg-white p-3 text-left shadow-md"
              onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setClearing(false); } }}>
              <p className="text-[13px] font-medium text-ink">Clear this conversation?</p>
              <p className="mt-1 text-xs leading-normal text-ink-2">It starts a new one. The old conversation stays in Chat history.</p>
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" size="sm" variant="secondary" data-toc-clear-cancel autoFocus onClick={() => setClearing(false)}>Cancel</Button>
                <Button type="button" size="sm" variant="danger" data-toc-clear-run onClick={() => { setClearing(false); setOpen(true); thread.newChat(); }}>Clear</Button>
              </div>
            </div>
          )}
        </div>
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
