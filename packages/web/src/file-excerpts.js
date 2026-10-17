// What a chat question about a lane 2 file card reads (docs/features/canvas-file-imports.md section 6). The card parses its
// original in the browser and leaves a bounded excerpt here, by block id: the canvas's selection context and Add to chat
// (learn-ask-target.js describeCanvasObject) read it, so the board never carries the text. Coverage is said, never implied:
// 'extracted' (all of it), 'partial' (the note says which part), or nothing read yet in this browser.
import { DOC_KINDS } from './file-doc-import.js';

const excerpts = new Map();
export const setFileExcerpt = (blockId, excerpt) => { if (excerpt) excerpts.set(blockId, excerpt); else excerpts.delete(blockId); };
export const fileExcerpt = blockId => excerpts.get(blockId) || null;

const KIND = { table: 'Table', workbook: 'Workbook', document: 'Word document', presentation: 'Presentation', text: 'Text file', markdown: 'Markdown file' };
// describeCanvasObject's answer for a lane 2 card: { kind, title, text, material }, or null for any other card.
export function describeFileCard(object) {
  if (object?.type !== 'file' || !DOC_KINDS.has(object.kind)) return null;
  const kind = KIND[object.kind], name = object.label || 'untitled';
  const excerpt = fileExcerpt(object.id);
  const head = `${kind} on the canvas: ${name}${excerpt?.where ? ` (${excerpt.where})` : ''}`;
  if (!excerpt) return { kind, title: name, text: `${head}\n[Its content has not been read in this browser yet; only its name is known.]`, material: 'file' };
  const coverage = excerpt.coverage === 'partial' ? `[Partial content: ${excerpt.note}. The rest is in the original file and was not read.]` : '[Full content below.]';
  return { kind, title: name, text: [head, coverage, excerpt.text].join('\n'), material: 'file' };
}
