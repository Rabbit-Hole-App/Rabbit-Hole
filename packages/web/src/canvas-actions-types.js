// UI-25 per-type rows of the canvas action registry (canvas-actions.js; contract C:/s/spec/share/contract-actions.md).
// Owned by lane U2 (its superset replaces this seed): U1 seeded it with the rows the old right-click menu already had,
// unchanged in label, order and handler. Start Rabbit Hole, Copy selected text and Fit canvas are the engine's (COMMON_ACTIONS). Every handler reaches the canvas through ctx.canvas only; nothing here runs on open.
import { ipynbPath } from './learn-notebook.js';

const CAD_FORMATS = ['step', 'glb', 'stl', '3mf']; // CadCard.jsx CAD_DOWNLOADS: one row per format the card actually saved

const block = type => (t => t.family === 'block' && t.type === type);
const attached = (sourceId, ctx) => ctx.canvas.attached(sourceId);
const attachRow = (id, type, sourceOf, noun, order) => ({
  id, label: (t, ctx) => (attached(sourceOf(t), ctx) ? `Detach ${noun} from tutor` : `Attach ${noun} to tutor`),
  icon: (t, ctx) => (attached(sourceOf(t), ctx) ? 'Unlink' : 'Paperclip'), group: 'type', order, targets: ['card'], types: [type],
  applies: (t, ctx) => !!ctx.canvas.cardAction, requires: 'chat.ask', run: (t, ctx) => ctx.canvas.cardAction('attach-toggle', { sourceId: sourceOf(t) }),
});

export const TYPE_ACTIONS = [
  // Open in notebook (canvas-notebook.md): a code card or code box; off with its reason when it cannot run here.
  { id: 'code.open-notebook', label: 'Open in notebook', icon: 'NotebookPen', group: 'type', order: 10, targets: ['card', 'object'],
    applies: (t, ctx) => !!ctx.canvas.notebookFrom?.(t.object), state: (t, ctx) => { const made = ctx.canvas.notebookFrom(t.object); return made.disabled ? { disabled: made.disabled } : null; },
    requires: 'canvas.local-edit', data: 'data-menu-open-notebook', run: (t, ctx) => ctx.canvas.openInNotebook(t.id) },

  { id: 'wiki.open-reader', label: 'Open in reader', icon: 'BookOpen', group: 'type', order: 20, targets: ['card'], types: ['wiki'], requires: 'card.open',
    run: (t, ctx) => ctx.canvas.cardAction('wiki-reader', { title: t.object.title, section: t.object.section || 0 }) },
  { id: 'wiki.open-source', label: 'Open on Wikipedia', icon: 'ExternalLink', group: 'type', order: 21, targets: ['card'], types: ['wiki'], requires: 'card.open',
    run: (t, ctx) => ctx.canvas.openUrl(`https://en.wikipedia.org/wiki/${encodeURIComponent(t.object.title)}`) },
  attachRow('wiki.attach', 'wiki', t => `wiki:${t.id}`, 'article', 22),

  { id: 'video.open-source', label: 'Open on YouTube', icon: 'ExternalLink', group: 'type', order: 30, targets: ['card'], types: ['video'], requires: 'card.open',
    run: (t, ctx) => ctx.canvas.openUrl(`https://www.youtube.com/watch?v=${t.object.videoId}${t.object.start ? `&t=${Math.floor(t.object.start)}s` : ''}`) },
  attachRow('video.attach', 'video', t => `video:${t.id}`, 'video', 31),

  { id: 'paper.open-reader', label: 'Open in reader', icon: 'BookOpen', group: 'type', order: 40, targets: ['card'], types: ['paper'], requires: 'card.open',
    applies: t => !!t.object.paper?.id, run: (t, ctx) => ctx.canvas.cardAction('paper-reader', { id: t.object.paper.id, title: t.object.title, page: t.object.paper.page || 1 }) },
  { ...attachRow('paper.attach', 'paper', t => `paper:${t.object.paper.id}`, 'paper', 41), applies: (t, ctx) => !!t.object.paper?.id && !!ctx.canvas.cardAction },

  // A PDF card or page opens its own source in the reader, a page at its own page (card-open.js openTarget).
  { id: 'pdf.open-reader', label: 'Open in reader', icon: 'BookOpen', group: 'type', order: 50, targets: ['card'], types: ['pdf', 'slide'], requires: 'card.open',
    applies: (t, ctx) => !!ctx.canvas.reader?.(t.object), run: (t, ctx) => { const reader = ctx.canvas.reader(t.object); ctx.canvas.cardAction(reader.action, reader.payload); } },

  { id: 'image.show-tutor', label: 'Show the tutor this image', icon: 'Eye', group: 'type', order: 60, targets: ['card'], types: ['file'],
    applies: t => t.object.kind === 'image' && !!t.object.mediaId, requires: 'chat.ask',
    run: (t, ctx) => ctx.canvas.cardAction('image-attach', { blockId: t.id, mediaId: t.object.mediaId, label: t.object.label }) },
  { ...attachRow('image.attach', 'file', t => `image:${t.id}`, 'image', 61), applies: (t, ctx) => t.object.kind === 'image' && !!t.object.mediaId && !!ctx.canvas.cardAction },

  // A CAD card's saved files (owner brief section 4: Download also in the context menu), one row per saved format.
  ...CAD_FORMATS.map((format, n) => ({
    id: `cad.download-${format}`, label: `Download ${format.toUpperCase()}`, icon: 'Download', group: 'type', order: 70 + n, targets: ['card'], types: ['cad'],
    applies: (t, ctx) => !!ctx.canvas.cadArtifact?.(t.object, format), requires: 'card.open', data: { 'data-menu-cad-download': format },
    run: (t, ctx) => ctx.canvas.downloadCad(t.object, format) })),

  // A notebook's existing .ipynb (its header ⋮ and the right-click menu alike): the file the card holds, nothing fetched.
  { id: 'notebook.download', label: t => `Download ${ipynbPath(t.object).split('/').pop()}`, icon: 'Download', group: 'type', order: 75,
    targets: ['card'], types: ['notebook'], requires: 'content.copy', data: 'data-menu-download', applies: t => !!t.object.ipynb,
    run: (t, ctx) => ctx.canvas.downloadText(ipynbPath(t.object).split('/').pop(), JSON.stringify(t.object.ipynb, null, 1), 'application/x-ipynb+json') },
  { id: 'heading.done', label: t => (t.object.done ? 'Mark not done' : 'Mark done'), icon: t => (t.object.done ? 'Circle' : 'CircleCheck'), group: 'type', order: 80,
    targets: ['card'], types: ['heading'], requires: 'canvas.local-edit', mutates: true, run: (t, ctx) => ctx.canvas.toggleDone(t.id) },
  { id: 'heading.present', label: 'Present from here', icon: 'Play', group: 'type', order: 81, targets: ['card'], types: ['heading'], requires: 'canvas.local-edit',
    run: (t, ctx) => ctx.canvas.presentFrom(t.id) },

  { id: 'chat.copy-text', label: 'Copy text', icon: 'Copy', group: 'content', order: 20, targets: ['card'], types: ['chat'], requires: 'content.copy',
    run: (t, ctx) => ctx.canvas.copyText([t.object.question, t.object.answer].filter(Boolean).join('\n\n')) },
  { id: 'equation.copy-latex', label: 'Copy LaTeX', icon: 'Copy', group: 'content', order: 30, targets: ['object'], types: ['equation'], requires: 'content.copy',
    applies: t => !!t.object.latex, run: (t, ctx) => ctx.canvas.copyText(t.object.latex) },
];
