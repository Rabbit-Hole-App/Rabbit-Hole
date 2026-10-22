// The per-type rows of the canvas right-click menu (UI-25, owner brief C:/s/spec/share/brief-ui25.md section 2; contract
// C:/s/spec/share/contract-actions.md section 6). Each row reuses the working handler the card already has, reached through
// ctx.canvas, and shows only when the actual object supports it. What is NOT here is listed, with its reason, in
// C:/s/spec/share/ui25-capabilities.md. Pure: no React, no DOM at import; nothing runs until a row's run() is clicked.
import { openTarget } from './card-open.js';
import { notebookFromCode, ipynbPath } from './learn-notebook.js';
import { cadArtifact } from './cad-client.js';
import { EQUATION_LEVELS, equationLevel } from './canvas-equation.js';
import { pdfBytesUrl } from './pdf-source.js';
import { codeCardOf } from './code-card.js';
import { notebookActions } from './notebook-inline-client.js';
import { viewOf } from './cad-viewer-store.js';

export const CLOSED_SHAPES = ['rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star'];
export const LINE_SHAPES = ['line', 'arrow', 'curve', 'elbow'];
// The saved CAD formats a card can carry (CadCard.jsx CAD_DOWNLOADS): one row per format actually present.
export const CAD_FORMATS = ['step', 'glb', 'stl', '3mf'];
const NEWLINE = String.fromCharCode(10);

const block = t => (t.family === 'block' ? t.object : null);
const isCodeBox = o => o?.kind === 'text' && o.mode === 'code';
const busy = (t, ctx) => ['loading', 'running'].includes(ctx.jobOf?.(t.object));

// A card's own text, for Copy text (never a description written for the tutor): only types whose content is text.
export function contentText(t) {
  const o = t.object;
  if (!o) return '';
  if (t.family === 'chat') return [o.question, o.answer].filter(Boolean).join(NEWLINE + NEWLINE);
  if (t.family !== 'block') return '';
  if (o.type === 'explanation') return o.excerpt?.quote || [o.title, o.body, ...(o.more || []).map(section => section.text)].filter(Boolean).join(NEWLINE + NEWLINE);
  if (o.type === 'table') return [o.title, (o.columns || []).join('\t'), ...(o.rows || []).map(row => row.join('\t'))].filter(Boolean).join(NEWLINE);
  if (o.type === 'quiz') return [o.question, ...(o.options || []).map(option => `${option.key}. ${option.text}`)].join(NEWLINE);
  if (o.type === 'flashcards') return (o.cards || []).map(card => `${card.front} - ${card.back}`).join(NEWLINE);
  return '';
}

// The code a code object holds: a Code sample's code, a Code exercise's current code, a code box's text, a repository or
// uploaded code card's shown code (CodeCard publishes it once read; null while it loads).
export function codeOf(t) {
  const o = t.object;
  if (!o) return null;
  if (isCodeBox(o)) return o.text ?? '';
  if (t.family !== 'block') return null;
  if (o.type === 'snippet') return o.code ?? '';
  if (o.type === 'code') return o.draft ?? o.starter ?? '';
  if (o.type === 'repo-code') return codeCardOf(o.id)?.code || null;
  return null;
}

// The tutor source a card can be attached as (LearnPage attach-toggle), and what the row calls it.
export function tutorSource(o) {
  if (o?.type === 'wiki') return { id: `wiki:${o.id}`, noun: 'article' };
  if (o?.type === 'video' && o.videoId) return { id: `video:${o.id}`, noun: 'video' };
  if (o?.type === 'paper' && o.paper?.id) return { id: `paper:${o.paper.id}`, noun: 'paper' };
  if (o?.type === 'file' && o.kind === 'image' && o.mediaId) return { id: `image:${o.id}`, noun: 'image' };
  return null;
}

// Start Rabbit Hole goes on content a learner can go deeper into, not on structure: no divider, heading, link card,
// attachment or a card that is still being made or failed.
const NOT_CONTENT = new Set(['divider', 'heading', 'canvas-ref']);
export const rabbitHoleTarget = o => !!o && !NOT_CONTENT.has(o.type) && !(o.type === 'file' && o.kind === 'attachment') && o.status !== 'failed';

const reader = (t, ctx) => block(t) && openTarget(t.object, { readers: !!ctx.canvas.cardAction });
const download = format => ({
  id: `cad.download-${format}`, label: `Download ${format.toUpperCase()}`, icon: 'Download', group: 'type', order: 60,
  targets: ['card'], types: ['cad'], requires: 'content.copy', data: { 'data-menu-cad-download': format },
  applies: t => !!cadArtifact(t.object.manifest, format),
  run: (t, ctx) => ctx.canvas.downloadCad(t.object, cadArtifact(t.object.manifest, format)),
});
const equationSize = level => ({
  id: `equation.size-${level.id}`, label: `Size ${level.label}`, icon: 'Sigma', group: 'type', order: 40 + EQUATION_LEVELS.indexOf(level),
  targets: ['object'], types: ['equation'], requires: 'canvas.local-edit', mutates: true,
  checked: t => equationLevel(t.object.size) === level.id,
  run: (t, ctx) => ctx.canvas.patchItem(t.id, { size: level.size }),
});

export const TYPE_ACTIONS = [
  // Start Rabbit Hole (owner, 2026-10-07): from the right-clicked card; the canvas's flow enters the card's existing hole
  // when it has one and makes one only otherwise (Dive.jsx), a view-only board starts the viewer's own.
  {
    id: 'card.start-rabbit-hole', label: 'Start Rabbit Hole', icon: 'ArrowDownToLine', group: 'primary', order: 10,
    targets: ['card'], requires: 'canvas.child', denied: 'disable',
    data: t => ({ 'data-menu-start-rabbit-hole': '', 'data-origin': t.id }),
    applies: (t, ctx) => t.family === 'block' && !!ctx.canvas.startRabbitHole && rabbitHoleTarget(t.object),
    state: (t, ctx) => (busy(t, ctx) ? { disabled: 'Still generating' } : null),
    run: (t, ctx) => ctx.canvas.startRabbitHole(t.id),
  },
  // Open: the card's reader at its own page (wiki, arXiv paper, PDF card or page) or a YouTube moment at its time (card-open.js).
  {
    id: 'card.open', label: (t, ctx) => reader(t, ctx).label, icon: 'BookOpen', group: 'type', order: 10,
    targets: ['card'], requires: 'card.open', data: 'data-menu-open',
    applies: (t, ctx) => ['reader', 'external'].includes(reader(t, ctx)?.kind),
    run: (t, ctx) => { const open = reader(t, ctx); return open.kind === 'reader' ? ctx.canvas.cardAction(open.action, open.payload) : ctx.canvas.openUrl(open.url); },
  },
  {
    id: 'wiki.open-source', label: 'Open on Wikipedia', icon: 'ExternalLink', group: 'type', order: 12,
    targets: ['card'], types: ['wiki'], requires: 'card.open', applies: t => !!t.object.title,
    run: (t, ctx) => ctx.canvas.openUrl(`https://en.wikipedia.org/wiki/${encodeURIComponent(t.object.title)}`),
  },
  {
    id: 'paper.open-source', label: 'Open on arXiv', icon: 'ExternalLink', group: 'type', order: 12,
    targets: ['card'], types: ['paper'], requires: 'card.open', applies: t => !!t.object.paper?.id,
    run: (t, ctx) => ctx.canvas.openUrl(`https://arxiv.org/abs/${encodeURIComponent(t.object.paper.id)}`),
  },
  {
    id: 'webpage.open-source', label: 'Open original page', icon: 'ExternalLink', group: 'type', order: 12,
    targets: ['card'], types: ['webpage'], requires: 'card.open', data: 'data-menu-open-url',
    applies: t => /^https?:\/\//i.test(t.object.url || ''),
    run: (t, ctx) => ctx.canvas.openUrl(t.object.url),
  },
  {
    id: 'webpage.scroll-lock', label: 'Lock scroll', icon: 'Lock', group: 'type', order: 20,
    targets: ['card'], types: ['webpage'], requires: 'canvas.local-edit', mutates: true, data: 'data-menu-scroll-lock',
    checked: t => !!t.object.scrollLocked,
    run: (t, ctx) => ctx.canvas.updateBlock(t.id, { scrollLocked: !t.object.scrollLocked }),
  },
  {
    id: 'card.attach-tutor', icon: 'Paperclip', group: 'type', order: 30, targets: ['card'], requires: 'chat.ask',
    label: (t, ctx) => { const source = tutorSource(t.object); return ctx.canvas.attached(source.id) ? `Detach ${source.noun} from tutor` : `Attach ${source.noun} to tutor`; },
    applies: (t, ctx) => t.family === 'block' && !!ctx.canvas.cardAction && !!tutorSource(t.object),
    run: (t, ctx) => ctx.canvas.cardAction('attach-toggle', { sourceId: tutorSource(t.object).id }),
  },
  {
    id: 'image.show-tutor', label: 'Show the tutor this image', icon: 'Eye', group: 'type', order: 31,
    targets: ['card'], types: ['file'], requires: 'chat.ask',
    applies: (t, ctx) => t.object.kind === 'image' && !!t.object.mediaId && !!ctx.canvas.cardAction,
    run: (t, ctx) => ctx.canvas.cardAction('image-attach', { blockId: t.id, mediaId: t.object.mediaId, label: t.object.label }),
  },

  // Selected text inside a card, captured when the menu opened (contract section 1 part.text).
  {
    id: 'selection.copy', label: 'Copy selected text', icon: 'Copy', group: 'content', order: 5,
    targets: ['card', 'object'], part: ['text', 'code-lines', 'pdf-selection'], requires: 'content.copy', data: 'data-menu-copy-selection',
    applies: t => !!t.part?.text, run: (t, ctx) => ctx.canvas.copyText(t.part.text),
  },
  {
    id: 'selection.add-to-chat', icon: 'MessageSquarePlus', group: 'chat', order: 20,
    label: t => (t.part.kind === 'code-lines' ? 'Add selected lines to chat' : 'Add selection to chat'),
    targets: ['card', 'object'], part: ['text', 'code-lines', 'pdf-selection'], requires: 'chat.ask', data: 'data-menu-add-selection',
    applies: t => !!t.part?.text, run: (t, ctx) => ctx.canvas.addToChat({ quote: t.part.text }),
  },
  {
    id: 'card.copy-content', label: 'Copy text', icon: 'Copy', group: 'content', order: 10,
    targets: ['card'], requires: 'content.copy', data: 'data-menu-copy-text',
    applies: t => !t.part && !!contentText(t), run: (t, ctx) => ctx.canvas.copyText(contentText(t)),
  },

  // Code: Copy code, Open source, Edit for a code box (repository source is never editable here), Open in notebook.
  {
    id: 'code.copy', label: 'Copy code', icon: 'Copy', group: 'content', order: 10,
    targets: ['card', 'object'], types: ['code', 'snippet', 'repo-code', 'text'], requires: 'content.copy', data: 'data-menu-copy-code',
    applies: t => !t.part && codeOf(t) != null, run: (t, ctx) => ctx.canvas.copyText(codeOf(t)),
  },
  {
    id: 'code.open-source', label: 'Open source', icon: 'ExternalLink', group: 'type', order: 12,
    targets: ['card'], types: ['repo-code'], requires: 'card.open', data: 'data-menu-open-source',
    applies: t => !!codeCardOf(t.id)?.openSource, run: t => codeCardOf(t.id).openSource(),
  },
  {
    id: 'code.edit', label: 'Edit code', icon: 'Pencil', group: 'type', order: 20,
    targets: ['object'], types: ['text'], requires: 'canvas.local-edit', mutates: true, data: 'data-menu-edit',
    applies: t => isCodeBox(t.object), run: (t, ctx) => ctx.canvas.edit(t.id),
  },
  {
    id: 'code.open-notebook', label: 'Open in notebook', icon: 'NotebookPen', group: 'type', order: 25,
    targets: ['card', 'object'], types: ['code', 'snippet', 'text'], requires: 'canvas.local-edit', mutates: true, data: 'data-menu-open-notebook',
    applies: t => !!notebookFromCode(t.object),
    state: t => { const reason = notebookFromCode(t.object)?.disabled; return reason ? { disabled: reason } : null; },
    run: (t, ctx) => ctx.canvas.openInNotebook(t.id),
  },

  // Notebook frame: its own Run all / Restart (the browser's Python, no server execution) and the .ipynb it already exports.
  {
    id: 'notebook.run-all', label: 'Run all', icon: 'Play', group: 'type', order: 20,
    targets: ['card'], types: ['notebook'], requires: 'canvas.local-edit', mutates: true, data: 'data-menu-run-all',
    state: t => notebookState(t), run: t => notebookActions(t.id).runAll(),
  },
  {
    id: 'notebook.restart', label: 'Restart', icon: 'RotateCcw', group: 'type', order: 21,
    targets: ['card'], types: ['notebook'], requires: 'canvas.local-edit', mutates: true, data: 'data-menu-restart',
    state: t => notebookState(t), run: t => notebookActions(t.id).restart(),
  },
  {
    id: 'notebook.download', label: t => `Download ${ipynbPath(t.object).split('/').pop()}`, icon: 'Download', group: 'type', order: 60,
    targets: ['card'], types: ['notebook'], requires: 'content.copy', data: 'data-menu-download',
    applies: t => !!t.object.ipynb,
    run: (t, ctx) => ctx.canvas.downloadText(ipynbPath(t.object).split('/').pop(), JSON.stringify(t.object.ipynb, null, 1), 'application/x-ipynb+json'),
  },

  // Text, notes, shapes and connectors: local editing and the existing style panel (fill, stroke, width, arrowheads, route,
  // text formatting), never a second set of style controls.
  {
    id: 'text.edit', label: 'Edit text', icon: 'Pencil', group: 'type', order: 20,
    targets: ['object'], types: ['text', 'sticky', ...CLOSED_SHAPES], requires: 'canvas.local-edit', mutates: true, data: 'data-menu-edit',
    applies: t => !isCodeBox(t.object), run: (t, ctx) => ctx.canvas.edit(t.id),
  },
  {
    id: 'connector.edit-label', label: 'Edit label', icon: 'Pencil', group: 'type', order: 20,
    targets: ['object', 'connector'], types: ['connector', ...LINE_SHAPES], requires: 'canvas.local-edit', mutates: true, data: 'data-menu-edit-label',
    run: (t, ctx) => ctx.canvas.edit(t.id),
  },
  {
    id: 'text.copy', label: 'Copy text', icon: 'Copy', group: 'content', order: 10,
    targets: ['object'], types: ['text', 'sticky'], requires: 'content.copy', data: 'data-menu-copy-text',
    applies: t => !t.part && !isCodeBox(t.object) && !!t.object.text, run: (t, ctx) => ctx.canvas.copyText(t.object.text),
  },
  {
    id: 'object.style', label: 'Style', icon: 'Palette', group: 'type', order: 30,
    targets: ['object', 'connector', 'multi'], types: ['text', 'sticky', 'connector', ...CLOSED_SHAPES, ...LINE_SHAPES],
    requires: 'canvas.local-edit', mutates: true, data: 'data-menu-style',
    applies: t => !isCodeBox(t.object), run: (t, ctx) => ctx.canvas.openStyle(),
  },

  // Equations: the formula itself, never a description of it.
  {
    id: 'equation.edit', label: 'Edit LaTeX', icon: 'Sigma', group: 'type', order: 20,
    targets: ['object'], types: ['equation'], requires: 'canvas.local-edit', mutates: true, data: 'data-menu-edit-latex',
    run: (t, ctx) => ctx.canvas.editEquation(t.id),
  },
  {
    id: 'equation.copy', label: 'Copy LaTeX', icon: 'Copy', group: 'content', order: 10,
    targets: ['object'], types: ['equation'], requires: 'content.copy', data: 'data-menu-copy-latex',
    applies: t => !!t.object.latex, run: (t, ctx) => ctx.canvas.copyText(t.object.latex),
  },
  ...EQUATION_LEVELS.map(equationSize),

  // PDF card or page: its stored original, read as this learner (pdf-source.js); the owner's own canvas only.
  {
    id: 'pdf.download', label: 'Download PDF', icon: 'Download', group: 'type', order: 60,
    targets: ['card'], types: ['pdf', 'slide'], requires: 'content.copy', data: 'data-menu-download',
    applies: (t, ctx) => !ctx.readOnly && !!ctx.canvas.appName && !!pdfBytesUrl(ctx.canvas.appName, t.object.type === 'slide' ? t.object.pdf : t.object.assetKey),
    run: (t, ctx) => ctx.canvas.downloadUrl(pdfBytesUrl(ctx.canvas.appName, t.object.type === 'slide' ? t.object.pdf : t.object.assetKey, t.object.home || null), `${t.object.label || 'document'}`.replace(/(\.pdf)?$/i, '.pdf')),
  },
  // A file card's original (image, video clip, audio, SVG, 3D model, document): the same bytes its own Download reads.
  {
    id: 'file.download', label: 'Download original', icon: 'Download', group: 'type', order: 60,
    targets: ['card'], types: ['file'], requires: 'content.copy', data: 'data-menu-download',
    applies: t => !t.object.excerpt && !!(t.object.assetKey || t.object.fileRef),
    run: (t, ctx) => ctx.canvas.downloadOriginal(t.object),
  },

  // CAD: the viewer's own Interact and Fit view (cad-viewer-store.js), and only the formats this revision saved.
  {
    id: 'cad.interact', label: t => (viewOf(t.id).interacting ? 'Stop interacting' : 'Interact'), icon: 'Rotate3d', group: 'type', order: 20,
    targets: ['card'], types: ['cad'], requires: 'card.open', data: 'data-menu-interact',
    applies: t => !!viewOf(t.id).live && !!viewOf(t.id).api,
    run: t => { const view = viewOf(t.id); return view.interacting ? view.api.exit() : view.api.enter(); },
  },
  {
    id: 'cad.reset-view', label: 'Reset view', icon: 'Scan', group: 'type', order: 21,
    targets: ['card'], types: ['cad'], requires: 'card.open', data: 'data-menu-reset-view',
    applies: t => !!viewOf(t.id).live && !!viewOf(t.id).api?.fit, run: t => viewOf(t.id).api.fit(),
  },
  ...CAD_FORMATS.map(download),

  // Headings: progress and presenting, as before.
  {
    id: 'heading.done', label: t => (t.object.done ? 'Mark not done' : 'Mark done'), icon: 'CircleCheck', group: 'type', order: 20,
    targets: ['card'], types: ['heading'], requires: 'canvas.local-edit', mutates: true,
    run: (t, ctx) => ctx.canvas.updateBlock(t.id, { done: !t.object.done }),
  },
  {
    id: 'heading.present', label: 'Present from here', icon: 'Play', group: 'type', order: 21,
    targets: ['card'], types: ['heading'], requires: 'card.open', applies: (t, ctx) => !!ctx.canvas.presentFrom,
    run: (t, ctx) => ctx.canvas.presentFrom(t.id),
  },

  // Empty canvas: local insertion where the menu opened, and Fit canvas. Paste and Select all are the engine's.
  {
    id: 'canvas.add-text', label: 'Add text', icon: 'Type', group: 'canvas', order: 20,
    targets: ['canvas'], requires: 'canvas.local-edit', mutates: true, data: 'data-menu-add-text',
    run: (t, ctx) => ctx.canvas.insertText(t.point),
  },
  {
    id: 'canvas.add-sticky', label: 'Add sticky note', icon: 'StickyNote', group: 'canvas', order: 21,
    targets: ['canvas'], requires: 'canvas.local-edit', mutates: true, data: 'data-menu-add-sticky',
    run: (t, ctx) => ctx.canvas.insertSticky(t.point),
  },
  {
    id: 'canvas.fit', label: 'Fit canvas', icon: 'Maximize', group: 'canvas', order: 40, hint: 'Shift 1',
    targets: ['canvas'], requires: 'canvas.view', data: 'data-menu-fit',
    run: (t, ctx) => ctx.canvas.zoomFit(),
  },
];

// A notebook's own controls work once its Python is up, on a notebook file (NotebookCard registers them).
function notebookState(t) {
  const notebook = notebookActions(t.id);
  if (!notebook?.ready()) return { disabled: 'Starting Python' };
  if (!notebook.isNotebook()) return { disabled: 'Open a notebook file' };
  return null;
}
