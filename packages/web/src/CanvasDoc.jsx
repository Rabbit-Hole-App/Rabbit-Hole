import { useEffect, useState } from 'react';
import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';
import { createReactBlockSpec, createReactInlineContentSpec, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import { isDark } from './api.js';
import { DOC_BLOCK_TYPES, docEdgeKey } from './canvas-doc.js';
import { splitMath, withInlineMath } from './canvas-doc-math.js';
import { MathText } from './MathText.jsx';

// A Document card's editor (docs/features/blocknote-canvas.md): BlockNote's own editor, menus and features, text-first.
// Media, file and embed blocks are configured out of this MVP (section 8), so the slash menu never offers an upload that has
// nowhere durable to go: the schema holds exactly canvas-doc.js's DOC_BLOCK_TYPES. Loaded with the first Document card (DocCard), never with the canvas.
// Math (owner 2026-11-16 00:10, DECISIONS J): a block formula and an inline formula, each a LaTeX string drawn by the installed KaTeX through the chat's MathText. Shown, not edited in place.
// ponytail: no math editor or slash-menu entry; a formula arrives from Markdown (markdownToDocBlocks) and can be deleted like any block.
const mathBlock = createReactBlockSpec({ type: 'math', propSchema: { latex: { default: '' } }, content: 'none' },
  { render: ({ block }) => <div data-doc-math="block" className="w-full"><MathText expression={block.props.latex} display /></div> })();
const inlineMath = createReactInlineContentSpec({ type: 'inlineMath', propSchema: { latex: { default: '' } }, content: 'none' },
  { render: ({ inlineContent }) => <span data-doc-math="inline"><MathText expression={inlineContent.props.latex} /></span> });
export const DOC_SCHEMA = BlockNoteSchema.create({
  blockSpecs: { ...Object.fromEntries(DOC_BLOCK_TYPES.filter(type => defaultBlockSpecs[type]).map(type => [type, defaultBlockSpecs[type]])), math: mathBlock },
  inlineContentSpecs: { ...defaultInlineContentSpecs, inlineMath },
});

// Markdown in, this schema's blocks out (the RunbookEditor tryParseMarkdownToBlocks pattern), for a Document card filled from data (learn-section-perform.js). One unmounted editor does the parsing;
// $$...$$ and $...$ become the math block and inline math (canvas-doc-math.js).
let parser = null;
export function markdownToDocBlocks(markdown) {
  parser ||= BlockNoteEditor.create({ schema: DOC_SCHEMA });
  const { parts, inline } = splitMath(markdown);
  return parts.flatMap(part => (part.latex !== undefined ? [{ type: 'math', props: { latex: part.latex } }] : withInlineMath(parser.tryParseMarkdownToBlocks(part.markdown), inline)));
}

function useDark() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const on = event => setDark(event.detail);
    window.addEventListener('small:theme', on);
    return () => window.removeEventListener('small:theme', on);
  }, []);
  return dark;
}

// blocks: the saved native document, read once when the editor is made (a later board, e.g. the server's copy, remounts
// the canvas). onChange gets the native document on every edit.
export default function CanvasDoc({ blocks, editable, onChange }) {
  const dark = useDark();
  const editor = useCreateBlockNote({ schema: DOC_SCHEMA, ...(blocks?.length ? { initialContent: blocks } : {}) }, []);
  // Ctrl/Cmd+End and Ctrl/Cmd+Home move the caret through the editor, not the browser: the native move raced ProseMirror,
  // which could put its old selection back.
  // ponytail: the end is the last block's last descendant even inside a closed toggle; Ctrl+Shift+End/Home stay native.
  const toEdge = event => {
    const edge = docEdgeKey(event);
    if (!edge) return;
    let block = edge === 'start' ? editor.document[0] : editor.document.at(-1);
    while (edge === 'end' && block?.children?.length) block = block.children.at(-1);
    if (!block) return;
    try { editor.setTextCursorPosition(block, edge); } catch { return; /* a block without text: the browser's own move */ }
    event.preventDefault();
  };
  return (
    <div className="contents"><BlockNoteView editor={editor} editable={editable} theme={dark ? 'dark' : 'light'} onKeyDownCapture={toEdge}
      onChange={() => onChange?.(editor.document)} /></div>
  );
}
