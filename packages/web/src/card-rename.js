// Rename a card from its right-click menu (owner, 2026-10-21): only cards whose model already has a string title.
// A wiki card's title is the article it loads (reader, Open on Wikipedia), not a name, so it is not renamable.
export const renamable = block => !!block && typeof block.title === 'string' && block.type !== 'wiki';

// Trimmed; an empty or unchanged title keeps the old one and returns the same array (nothing to save or undo).
export function renameBlock(blocks, id, text) {
  const title = String(text ?? '').trim();
  const target = blocks.find(block => block.id === id);
  if (!title || !renamable(target) || target.title === title) return blocks;
  return blocks.map(block => (block.id === id ? { ...block, title } : block));
}

// A group's name (owner, 2026-10-21): the editor opens on the shown name, the default "Group" when it has none, with the
// caret at its end (after the p), so typing "s" gives "Groups".
export const GROUP_NAME = 'Group';
export const groupEditText = label => label || GROUP_NAME;
// Trimmed and at most 60 characters; an empty name keeps the old one.
export const groupLabelFrom = (old, text) => String(text ?? '').trim().slice(0, 60) || old || '';
