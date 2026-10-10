// The ⋮ of a canvas and of a project - on its card and in the open project's header - is one menu from one list (owner,
// 2026-10-09: "make sure the ... for Projects and Canvas are consistent"; docs/features/visibility-menu.md). An item both
// types share has one label, one icon and one place; an item for one type keeps its slot and is hidden on the other.
// `owner`: only on a card you own. `alt`: the label and icon while its state is on (Pin -> Unpin).
const BOTH = ['canvas', 'repository'], CANVAS = ['canvas'], PROJECT = ['repository'];
export const CARD_MENU = [
  { id: 'open', label: 'Open', icon: 'ArrowUpRight', types: BOTH },
  { id: 'learn', label: 'Learn', icon: 'BookOpen', types: PROJECT },
  { id: 'map', label: 'Map', icon: 'Network', types: PROJECT },
  { id: 'pin', label: 'Pin', icon: 'Pin', alt: { label: 'Unpin', icon: 'PinOff' }, types: PROJECT },
  { id: 'rename', label: 'Rename', icon: 'PenLine', types: BOTH, owner: true },
  { id: 'describe', label: 'Edit description', icon: 'AlignLeft', types: CANVAS, owner: true },
  { id: 'duplicate', label: 'Duplicate', icon: 'CopyPlus', types: CANVAS, owner: true },
  { id: 'new_canvas', label: 'New canvas in project', icon: 'Plus', types: PROJECT, owner: true },
  { separator: true },
  { id: 'visibility', label: 'Visibility', icon: 'Eye', types: BOTH, owner: true },
  { id: 'share', label: 'Share / Manage link', icon: 'Link2', types: BOTH, owner: true },
  { id: 'copy', label: 'Copy link', icon: 'Link', types: BOTH, owner: true },
  { id: 'thumbnail', label: 'Change thumbnail', icon: 'ImageUp', types: BOTH, owner: true },
  { id: 'snapshot', label: 'Use canvas snapshot', icon: 'RotateCcw', types: BOTH, owner: true },
  { id: 'analytics', label: 'Analytics', icon: 'BarChart3', types: CANVAS, owner: true },
  { separator: true },
  { id: 'archive', label: 'Archive', icon: 'Archive', types: CANVAS, owner: true },
  { id: 'trash', label: 'Move to Trash', icon: 'Trash2', types: BOTH, owner: true },
];

// The rows this card shows, in order: its type's items that apply now (`shown(id)`: an item's own condition, as Use
// canvas snapshot only while a picture of yours is up), a separator only between two groups that both show something.
export function menuRows(a, shown = () => true) {
  const rows = [];
  for (const item of CARD_MENU) {
    if (item.separator) { if (rows.length && !rows.at(-1).separator) rows.push(item); continue; }
    if (item.types.includes(a.kind) && (!item.owner || a.canEdit) && shown(item.id)) rows.push(item);
  }
  while (rows.at(-1)?.separator) rows.pop();
  return rows;
}
