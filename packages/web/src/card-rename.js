// Rename a card from its right-click menu (owner, 2026-10-21; every card, owner 2026-11-07).
// Where a card's model has a string title shown as its title, rename writes that title. Everywhere else (a card with no title
// of its own: a quiz, a file, a PDF, a slide, a notebook, a canvas reference; or whose title IS what it loads: a wiki article,
// a webpage capture) it writes `customTitle`, a display name kept beside the model's own fields, so the article, the capture
// and the file name keep their meaning. Clearing a custom title restores the original.
const LOADED = new Set(['wiki', 'webpage']); // their `title` names what they load (reader, Open on Wikipedia, the capture)
// One line, never two (owner 2026-11-07): the longest card title that fits the card header on ONE line at the narrowest normal card width, for the
// largest title font. Derivation: the narrowest normal card is FULL_WIDTH.baseline = 320 px (card-layout.js:3); CardHeader's px-4 padding takes 32 px and
// the type icon (18 px at the Explanation head's text-xl size) plus its gap-2 take 26 px, leaving 262 px for the title; text-xl is 20 px, and semibold
// English text (lowercase and spaces) averages about 0.52 em = 10.4 px a character: 262 / 10.4 = 25, taken down to 24 for the card's own actions.
// At the card's default 560 px column the same arithmetic allows 45 (text-xl) or 66 (text-sm). The header also clips a longer legacy title (CardHeader.jsx).
// Owner 2026-11-08: the header title wraps to TITLE_LINES lines (TITLE_LINES_NARROW when the header is narrower than NARROW_CARD_PX: a minimized tile or a narrow card: CardHeader.jsx, class
// @max-[405px] = NARROW_CARD_PX - 35: a container query measures the content box, the card's 2 px border and the header's 32 px side padding come off a 440 px card; a 408 px tile is narrow), ellipsis only past that. TITLE_TWO_LINES: the title length above which the full text is the tooltip
// (measured in the browser, 12 ordinary titles: two lines hold 66-68 characters at the 440 px Explanation card with the Prompt slot reserved, 90 without it).
export const NARROW_CARD_PX = 440, TITLE_LINES = 2, TITLE_LINES_NARROW = 3, TITLE_TWO_LINES = 66;
export const TITLE_MAX = 40; // a name the learner types: the rename editor, renameBlock and the (N) suffix (owner 2026-11-07 asked for a limit; 24, derived for the narrowest card at the Explanation title size, cut real Tutor titles, so 40)
export const DERIVED_MAX = 80; // a generated or imported title shown as given up to the proposal title bound; the header is one clipped line with the full text as its tooltip, which is what stops wrapping
const HEADING_MAX = 200; // a section heading is document content listed in the Table of contents at full width, not a pinned card header (learn-outline-model.js TITLE_MAX)

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
// A derived name longer than DERIVED_MAX is shown cut there, on a word boundary when one is near, with no ellipsis; the stored title is never changed.
export function cutTitle(text, max = TITLE_MAX) {
  const flat = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  if (flat.length <= max) return flat;
  const head = flat.slice(0, max), space = head.lastIndexOf(' ');
  return (space >= Math.floor(max / 2) ? head.slice(0, space) : head).replace(/[\s,;:\-\u2013\u2014]+$/, '');
}
const short = text => (typeof text === 'string' && text.trim() ? cutTitle(text, DERIVED_MAX) : '');
// The same derived name uncut: the tooltip, chat context and anything that must keep the whole text.
const flatOf = text => (typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '');
const derivedTitleOf = block => short(block?.title) || short(block?.label) || (block?.type === 'heading' ? short(block.text) : '') || short(block?.question) || short(block?.prompt);
// The learner's name or the derived name, or '' when the card has none (a type placeholder is not a name): what title uniqueness compares (unique-title.js).
export const namedTitleOf = block => customTitleOf(block) || derivedTitleOf(block);
// The full text behind the shown name (the header's tooltip): the custom name, else the derived text uncut.
export const fullTitleOf = block => customTitleOf(block) || flatOf(block?.title) || flatOf(block?.label) || (block?.type === 'heading' ? flatOf(block.text) : '') || flatOf(block?.question) || flatOf(block?.prompt);
export function cardTitleOf(block) {
  if (!block) return PLACEHOLDER;
  return customTitleOf(block) || derivedTitleOf(block) || PLACEHOLDERS[block.type] || PLACEHOLDER;
}
// The title the card HEADER shows (CardHeader.jsx, owner 2026-11-07): a file, PDF or slide's label is its FILE NAME, which the header shows under the
// title, so its title is the learner's name or the placeholder; every other card shows cardTitleOf. placeholderTitle: true when no real title exists.
const FILE_NAMED = new Set(['file', 'pdf', 'slide']);
// A quiz question or a practice prompt is the card's CONTENT (it can hold TeX), drawn in the body: the header never repeats it as a title.
// The header shows the title WHOLE (owner 2026-11-08: never truncated): flatOf, not short.
const headerDerived = block => (FILE_NAMED.has(block?.type) ? '' : flatOf(block?.title) || flatOf(block?.label) || (block?.type === 'heading' ? flatOf(block.text) : ''));
export const placeholderTitle = block => !customTitleOf(block) && !headerDerived(block);
export const headerTitleOf = block => customTitleOf(block) || headerDerived(block) || PLACEHOLDERS[block?.type] || PLACEHOLDER;

// What the editor opens on: the learner's name, else the card's own title or text, else the name the card shows today (derived).
export const startTitleOf = (block, derived = '') => customTitleOf(block) || (typeof block?.title === 'string' ? block.title : '') || (block?.type === 'heading' && typeof block.text === 'string' ? block.text : '') || derived || '';

// Trimmed and at most 200 characters. An empty or unchanged name keeps what is there and returns the same array (nothing to save or
// undo); on a custom title an empty name clears it.
export function renameBlock(blocks, id, text) {
  const target = blocks.find(block => block.id === id);
  if (!renamable(target)) return blocks;
  const key = titleKey(target);
  const title = String(text ?? '').trim().slice(0, key === 'text' ? HEADING_MAX : TITLE_MAX);
  if (key === 'customTitle') {
    if (title === customTitleOf(target)) return blocks;
    return blocks.map(block => {
      if (block.id !== id) return block;
      if (title) return { ...block, customTitle: title };
      const { customTitle, ...rest } = block; // eslint-disable-line no-unused-vars
      return rest;
    });
  }
  // A written title or heading text is the name now: a customTitle (set when a duplicate name was stepped to "(2)") would otherwise keep showing.
  if (!title || (target[key] === title && !customTitleOf(target))) return blocks;
  return blocks.map(block => {
    if (block.id !== id) return block;
    const { customTitle, ...rest } = block; // eslint-disable-line no-unused-vars
    return { ...rest, [key]: title };
  });
}

// A group's name (owner, 2026-10-21): the editor opens on the shown name, the default "Group" when it has none, with the
// caret at its end (after the p), so typing "s" gives "Groups".
export const GROUP_NAME = 'Group';
export const groupEditText = label => label || GROUP_NAME;
// Trimmed and at most 60 characters; an empty name keeps the old one.
export const groupLabelFrom = (old, text) => String(text ?? '').trim().slice(0, 60) || old || '';
