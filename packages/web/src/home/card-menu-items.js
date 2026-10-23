// The Card options menu of a canvas and of a project - on its card, Home and Library alike - is one menu from one list
// (owner, 2026-10-09: "make sure the ... for Projects and Canvas are consistent"; simplified by the owner brief 2026-10-22:
// Open, Explore codebase, New canvas | Pin, Rename, Edit description, Duplicate, Move to folder, Change cover | Share,
// Analytics | Move to Trash). An item both types share has one label, one icon and one place; an item for one type keeps its
// slot and is hidden on the other. Only the actions that apply to this card and this person show.
// `owner`: only on a card you own. `alt`: the label and icon while its state is on (Pin -> Unpin).
// Learn, Visibility, Copy link, Archive and Use canvas snapshot are not rows any more: access and links live in Share, the
// snapshot reset in the Change cover picker, and Archive left the active-card menu (archived items keep their Restore).
const BOTH = ['canvas', 'repository'], CANVAS = ['canvas'], PROJECT = ['repository'];
export const CARD_MENU = [
  { id: 'open', label: 'Open', icon: 'ArrowUpRight', types: BOTH },
  { id: 'map', label: 'Explore codebase', icon: 'Network', types: PROJECT }, // the canvas with its Graph beside Chat (routes.js repositoryView)
  { id: 'new_canvas', label: 'New canvas in project', icon: 'Plus', types: PROJECT, owner: true },
  { separator: true },
  { id: 'pin', label: 'Pin', icon: 'Pin', alt: { label: 'Unpin', icon: 'PinOff' }, types: BOTH, owner: true },
  { id: 'rename', label: 'Rename', icon: 'PenLine', types: BOTH, owner: true },
  { id: 'describe', label: 'Edit description', icon: 'AlignLeft', types: CANVAS, owner: true },
  { id: 'duplicate', label: 'Duplicate', icon: 'CopyPlus', types: CANVAS, owner: true },
  { id: 'folder', label: 'Move to folder', icon: 'FolderInput', types: BOTH, owner: true },
  { id: 'thumbnail', label: 'Change cover', icon: 'ImageUp', types: BOTH, owner: true },
  { separator: true },
  { id: 'share', label: 'Share', icon: 'Link2', types: BOTH, owner: true },
  { id: 'analytics', label: 'Analytics', icon: 'BarChart3', types: CANVAS, owner: true },
  { separator: true },
  { id: 'trash', label: 'Move to Trash', icon: 'Trash2', types: BOTH, owner: true },
];

// The rows this card shows, in order: its type's items that apply now (`shown(id)`: an item's own condition, as Analytics
// only for an eligible published canvas), a separator only between two groups that both show something.
export function menuRows(a, shown = () => true) {
  const rows = [];
  for (const item of CARD_MENU) {
    if (item.separator) { if (rows.length && !rows.at(-1).separator) rows.push(item); continue; }
    if (item.types.includes(a.kind) && (!item.owner || a.canEdit) && shown(item.id)) rows.push(item);
  }
  while (rows.at(-1)?.separator) rows.pop();
  return rows;
}
