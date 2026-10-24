// The canvas description contract (owner, 2026-10-23: at most 340 characters), shared by the server (canvases.js) and the
// card menu's Edit description dialog, so both count the same way: by code point, so an emoji is one character on each side.
export const DESCRIPTION_MAX = 340;
export const descriptionLength = (text) => [...text].length;
