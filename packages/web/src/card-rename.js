// Rename a card from its right-click menu (owner, 2026-10-21; every card, owner 2026-11-07).
// Where a card's model has a string title shown as its title, rename writes that title. Everywhere else (a card with no title
// of its own: a quiz, a file, a PDF, a slide, a notebook, a canvas reference; or whose title IS what it loads: a wiki article,
// a webpage capture) it writes `customTitle`, a display name kept beside the model's own fields, so the article, the capture
// and the file name keep their meaning. Clearing a custom title restores the original.
const LOADED = new Set(['wiki', 'webpage']); // their `title` names what they load (reader, Open on Wikipedia, the capture)
const MAX = 200;

export const customTitleOf = block => (typeof block?.customTitle === 'string' ? block.customTitle.trim() : '');
// Every canvas card (a block). A chat card (an exchange) has no type: it is held by the page, not by this canvas's blocks.
export const renamable = block => !!block && typeof block.type === 'string';
// The field a rename writes: the card's own title, a heading's text, or the display name.
export const titleKey = block => (typeof block?.title === 'string' && !LOADED.has(block.type) ? 'title' : block?.type === 'heading' ? 'text' : 'customTitle');
// The ONE name to show for a card, everywhere a title is wanted (stable API; see docs/features/explain-on-canvas/card-rename-audit.md):
// the learner's customTitle, else the card's own derived name (title; a file, PDF or slide label; a heading's text; a quiz question or
// practice prompt, shortened), else a neutral type-based placeholder ("Untitled note"). The placeholder is computed, never stored, and
// never written back by a rename that is cancelled or left empty.
export const PLACEHOLDERS = { note: 'Untitled note', notebook: 'Untitled notebook', heading: 'Untitled heading', file: 'Untitled file', pdf: 'Untitled PDF', slide: 'Untitled slide', divider: 'Untitled divider', 'canvas-ref': 'Untitled link', 'repo-code': 'Untitled code', 'repo-graph': 'Untitled graph', wiki: 'Untitled article', webpage: 'Untitled page', quiz: 'Untitled quiz', challenge: 'Untitled practice', flashcards: 'Untitled flashcards', explanation: 'Untitled explanation', table: 'Untitled table', image: 'Untitled image', video: 'Untitled video', audio: 'Untitled audio', code: 'Untitled code', snippet: 'Untitled code', cad: 'Untitled model' };
export const PLACEHOLDER = 'Untitled card';
const short = text => (typeof text === 'string' && text.trim() ? text.trim().replace(/\s+/g, ' ').slice(0, 80) : '');
export function cardTitleOf(block) {
  if (!block) return PLACEHOLDER;
  return customTitleOf(block) || short(block.title) || short(block.label) || (block.type === 'heading' ? short(block.text) : '') || short(block.question) || short(block.prompt) || PLACEHOLDERS[block.type] || PLACEHOLDER;
}

// What the editor opens on: the learner's name, else the card's own title or text, else the name the card shows today (derived).
export const startTitleOf = (block, derived = '') => customTitleOf(block) || (typeof block?.title === 'string' ? block.title : '') || (block?.type === 'heading' && typeof block.text === 'string' ? block.text : '') || derived || '';

// Trimmed and at most 200 characters. An empty or unchanged name keeps what is there and returns the same array (nothing to save or
// undo); on a custom title an empty name clears it.
export function renameBlock(blocks, id, text) {
  const title = String(text ?? '').trim().slice(0, MAX);
  const target = blocks.find(block => block.id === id);
  if (!renamable(target)) return blocks;
  const key = titleKey(target);
  if (key === 'customTitle') {
    if (title === customTitleOf(target)) return blocks;
    return blocks.map(block => {
      if (block.id !== id) return block;
      if (title) return { ...block, customTitle: title };
      const { customTitle, ...rest } = block; // eslint-disable-line no-unused-vars
      return rest;
    });
  }
  if (!title || target[key] === title) return blocks;
  return blocks.map(block => (block.id === id ? { ...block, [key]: title } : block));
}

// A group's name (owner, 2026-10-21): the editor opens on the shown name, the default "Group" when it has none, with the
// caret at its end (after the p), so typing "s" gives "Groups".
export const GROUP_NAME = 'Group';
export const groupEditText = label => label || GROUP_NAME;
// Trimmed and at most 60 characters; an empty name keeps the old one.
export const groupLabelFrom = (old, text) => String(text ?? '').trim().slice(0, 60) || old || '';
