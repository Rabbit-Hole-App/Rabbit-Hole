// Rename a card from its right-click menu (owner, 2026-10-21): only cards whose model already has a string title.
export const renamable = block => !!block && typeof block.title === 'string';

// Trimmed; an empty or unchanged title keeps the old one and returns the same array (nothing to save or undo).
export function renameBlock(blocks, id, text) {
  const title = String(text ?? '').trim();
  const target = blocks.find(block => block.id === id);
  if (!title || !renamable(target) || target.title === title) return blocks;
  return blocks.map(block => (block.id === id ? { ...block, title } : block));
}
