import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AskPanel } from './ask.jsx';

// The Table of contents' own conversation (owner brief 2026-10-16 item 7), under the outline: the learner's requests and the
// Tutor's replies, above the TOC composer. Mounted inside TocWorkspace, so its thread, draft and attachments are the TOC's,
// never Chat's. It is capped and scrolls inside, so the outline stays the main content; collapsed, only the composer shows.
export default function TocConversation(askProps) {
  const [open, setOpen] = useState(true);
  return (
    <section aria-label="TOC conversation" data-toc-conversation className="mt-auto flex max-h-[45%] min-h-0 shrink-0 flex-col border-t border-line pt-2">
      <button type="button" aria-expanded={open} data-toc-conversation-toggle onClick={() => setOpen(shown => !shown)}
        className="mb-1 flex h-7 shrink-0 items-center justify-between rounded-md px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">
        <span>TOC conversation</span><ChevronDown size={14} aria-hidden className={open ? '' : 'rotate-180'} />
      </button>
      <div className="flex min-h-0 flex-1 flex-col"><AskPanel {...askProps} hideConversation={!open} /></div>
    </section>
  );
}
