import { useState } from 'react';
import { History, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { AskPanel } from './ask.jsx';
import { ConfirmDialog, Menu, MenuItem } from './ui.jsx';
import ChatHistory from './ChatHistory.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';

// The Learn canvas's permanent Chat tab (owner brief 2026-10-13 sections 2-3; sub-lane A1): a compact header (the thread
// title, History, New chat, an overflow menu), then the conversation and its composer. History shows in place of the
// conversation, which stays mounted underneath so its draft and scroll survive. Mounted only under ChatWorkspaceProvider.
// unavailable: what shows instead of the AskPanel (an AWS job without app chat); every other prop goes to the AskPanel,
// then chatAskProps (A3b: slash, tutor, journey, voice and the other props the removed dock had).
const ICON = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink';

export default function ChatPane({ hidden = false, unavailable = null, chatAskProps = {}, ...askProps }) {
  const { thread } = useChatWorkspace();
  const title = thread.title || 'New chat';
  const [menu, setMenu] = useState(false), [renaming, setRenaming] = useState(false), [deleting, setDeleting] = useState(false);
  // Rename and Delete come from the thread hook (A2) once it has them; until then the menu is not drawn.
  const actions = thread.id ? [thread.rename && ['Rename', Pencil, () => setRenaming(true)], thread.remove && ['Delete', Trash2, () => setDeleting(true)]].filter(Boolean) : [];
  return (
    <div role="tabpanel" aria-label="Chat" data-chat-pane className={`${hidden ? 'hidden' : 'flex'} @container min-h-0 flex-1 flex-col`}>
      <div data-chat-header className="mb-2 flex h-8 shrink-0 items-center gap-0.5">
        {renaming
          ? <input autoFocus defaultValue={thread.title} aria-label="Chat title" onFocus={event => event.currentTarget.select()}
            onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.dataset.cancel = '1'; event.currentTarget.blur(); } if (event.key === 'Enter') event.currentTarget.blur(); }}
            onBlur={event => { const next = event.currentTarget.value.trim(); if (!event.currentTarget.dataset.cancel && next && next !== thread.title) thread.rename(next); setRenaming(false); }}
            className="mr-1 h-8 min-w-0 flex-1 rounded-lg border border-line px-2 text-sm font-semibold text-ink outline-none focus:border-ink-3" />
          : <h2 data-chat-title title={title} className="mr-auto min-w-0 flex-1 truncate text-sm font-semibold text-ink">{title}</h2>}
        <button type="button" data-chat-history aria-label="History" title="History" aria-pressed={thread.historyOpen} onClick={() => thread.setHistoryOpen(!thread.historyOpen)}
          className={`${ICON} ${thread.historyOpen ? 'bg-hover text-ink' : ''}`}><History size={16} strokeWidth={1.8} aria-hidden /></button>
        {/* Icon only in a pane under 360 px; the accessible name stays "New chat". */}
        <button type="button" data-chat-new aria-label="New chat" title="New chat" onClick={() => { thread.newChat(); thread.setHistoryOpen(false); }}
          className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-sm text-ink-2 hover:bg-hover hover:text-ink @max-[360px]:w-8 @max-[360px]:justify-center @max-[360px]:px-0">
          <Plus size={16} strokeWidth={1.8} aria-hidden /><span className="@max-[360px]:hidden">New chat</span></button>
        {actions.length > 0 && <span className="relative">
          <button type="button" data-chat-more aria-label="More chat actions" title="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(open => !open)}
            className={`${ICON} ${menu ? 'bg-hover text-ink' : ''}`}><MoreHorizontal size={16} strokeWidth={1.8} aria-hidden /></button>
          <Menu open={menu} onClose={() => setMenu(false)} className="top-9 right-0 w-40">
            <div role="menu" aria-label="Chat actions">
              {actions.map(([label, Icon, run]) => <MenuItem key={label} type="button" role="menuitem" icon={Icon} onClick={() => { setMenu(false); run(); }}>{label}</MenuItem>)}
            </div>
          </Menu>
        </span>}
      </div>
      {deleting && <ConfirmDialog title="Delete this chat?" body={`"${title.slice(0, 80)}" and its messages are removed for good. Uploaded materials stay on the canvas.`}
        onConfirm={() => { setDeleting(false); thread.remove(); }} onCancel={() => setDeleting(false)} />}
      {thread.historyOpen && <ChatHistory />}
      <div className={`${thread.historyOpen ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col`}>{unavailable || <AskPanel {...askProps} {...chatAskProps} />}</div>
    </div>
  );
}

// The narrow layout's Chat/Sources switch (chat-panels.js layoutFor): it only picks which pane shows; both stay mounted.
export function PaneSwitch({ view, onView }) {
  return (
    <div role="tablist" aria-label="Chat or Sources" data-pane-switch className="mb-2 flex shrink-0 gap-0.5 rounded-lg border border-line bg-hover p-0.5">
      {[['chat', 'Chat'], ['sources', 'Sources']].map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={view === id} data-pane-switch-tab={id} onClick={() => onView(id)}
          className={`h-7 flex-1 rounded-md text-xs ${view === id ? 'bg-white font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}>{label}</button>
      ))}
    </div>
  );
}
