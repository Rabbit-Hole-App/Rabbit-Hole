import { CONTEXT_ACCEPT } from './context-docs.js';

// Insert > Upload a file (owner brief 2026-10-22 item 3): after choosing, where the file goes. The AI context road is the Context
// panel's own (context-docs.js uploadContextDoc: a PDF, .txt or .md file kept for the agent); a file that road cannot take can
// only be added to the canvas. Nothing is added to AI context unless the person chooses it.
export const DESTINATIONS = [['canvas', 'Add to canvas'], ['context', 'Use as AI context'], ['both', 'Both']];
const EXTENSIONS = CONTEXT_ACCEPT.split(',').filter(entry => entry.startsWith('.'));
export const isPdf = file => /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
export const takesContext = file => EXTENSIONS.some(extension => file.name.toLowerCase().endsWith(extension));

// Which destinations are open for these files on this canvas. Context needs a canvas that keeps context documents and files the
// context road takes; Both also needs at most one PDF, because adding a PDF to the canvas asks its page choice one PDF at a time.
export function destinationsFor(files, { contextCanvas }) {
  const context = contextCanvas && files.length > 0 && files.every(takesContext);
  return { canvas: files.length > 0, context, both: context && files.filter(isPdf).length <= 1 };
}
