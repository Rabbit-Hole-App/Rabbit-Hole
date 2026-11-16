import { ArrowUpRight, Copy, MessageSquare, MessageSquarePlus, Network, SquareCode, X } from 'lucide-react';
import { IconBtn } from './ui.jsx';

// The one vocabulary for the actions the Graph, Files and the repository viewer offer (owner 2026-11-15): one name and one icon per action, drawn as icons with the name as the tooltip,
// never a text button for one and an icon for another. The same name is used by the menus.
//   chat   Add to chat              keeps the selection or file with the chat
//   canvas Add to canvas            puts the code on the canvas as a code card
//   graph  Add selection as graph   puts the selected nodes on the canvas as a graph card
//   repo   Open in repository       the repository page at this commit
//   ask    Ask in chat              prepares a question about the selected lines
//   copy   Copy                     the selected lines (the caller passes Icon: Check and label 'Copied' for a moment)
//   close  Close all / Clear selection (the caller's `label`)
export const ACTIONS = {
  ask: { label: 'Ask in chat', Icon: MessageSquare },
  chat: { label: 'Add to chat', Icon: MessageSquarePlus },
  canvas: { label: 'Add to canvas', Icon: SquareCode },
  graph: { label: 'Add selection as graph', Icon: Network },
  repo: { label: 'Open in repository', Icon: ArrowUpRight },
  copy: { label: 'Copy', Icon: Copy },
  close: { label: 'Close all', Icon: X },
};

// actions: [{ id: 'chat' | 'canvas' | 'graph' | 'repo' | 'close', onClick?, href?, disabled?, label?, title?, data?: { 'data-x': '' } }] - a compact group that is only as wide as its icons.
export default function ActionBar({ actions, className = '' }) {
  const rows = (actions || []).filter(Boolean);
  if (!rows.length) return null;
  return (
    <span role="group" aria-label="Actions" data-action-bar className={`inline-flex shrink-0 items-center gap-0.5 ${className}`}>
      {rows.map(action => {
        const { Icon: own, label: name } = ACTIONS[action.id], Icon = action.Icon || own, label = action.label || name, size = 15;
        if (action.href) {
          return <a key={action.id} href={action.href} target="_blank" rel="noreferrer" aria-label={label} title={action.title || label} {...(action.data || {})}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink"><Icon size={size} aria-hidden="true" /></a>;
        }
        return <IconBtn key={action.id} type="button" aria-label={label} title={action.title || label} disabled={!!action.disabled} onClick={action.onClick} {...(action.data || {})}><Icon size={size} aria-hidden="true" /></IconBtn>;
      })}
    </span>
  );
}
