import { MessageSquareText } from 'lucide-react';
import { showPlanInChat } from './explain-client.js';

// The one 'Go to plan' control of every canvas skeleton (the reverse of the chat plan card's Go to card): an icon-only button (owner 2026-11-07) that opens Chat
// on the plan's thread and brings the plan card into view (explain-client.js showPlanInChat, chat-workspace.jsx). A skeleton passes only its ids and stage; this
// file owns the markup, the icon-button style (the ToC row's hover pattern at 32 px) and the rule that it shows only while the plan waits for Generate (not while it
// runs, after it, or on a read-only canvas). threadless: the plan card sits above the composer of any thread (the /cad review), so no thread is needed.
export default function GoToPlanButton({ stage, threadId = null, jobId = null, proposalId = null, readOnly = false, threadless = false, ...rest }) {
  if (readOnly || stage !== 'awaiting_approval' || !(jobId || proposalId) || !(threadId || threadless)) return null;
  return (
    <button type="button" data-go-to-plan aria-label="Go to plan" title="Go to plan" onClick={() => showPlanInChat({ threadId, jobId, proposalId })} {...rest}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink"><MessageSquareText size={16} aria-hidden="true" /></button>
  );
}
