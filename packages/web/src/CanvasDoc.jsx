import { useEffect, useState } from 'react';
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import { isDark } from './api.js';
import { DOC_BLOCK_TYPES, caretRect } from './canvas-doc.js';

// The canvas's one document (docs/features/blocknote-canvas.md): BlockNote's own editor, menus and features, text-first.
// Media, file and embed blocks are configured out of this MVP (section 8), so the slash menu never offers an upload that has
// nowhere durable to go: the schema holds exactly canvas-doc.js's DOC_BLOCK_TYPES. Loaded lazily (AdaptiveCanvas), so Canvas
// view never pays for the editor.
export const DOC_SCHEMA = BlockNoteSchema.create({ blockSpecs: Object.fromEntries(DOC_BLOCK_TYPES.map(type => [type, defaultBlockSpecs[type]])) });

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
// the canvas). onChange gets the native document on every edit; onCaret the caret's screen box after a move or an edit.
export default function CanvasDoc({ blocks, editable, onChange, onCaret, onReady }) {
  const dark = useDark();
  useEffect(() => { onReady?.(); return () => onReady?.(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const editor = useCreateBlockNote({ schema: DOC_SCHEMA, ...(blocks?.length ? { initialContent: blocks } : {}) }, []);
  const caret = () => {
    const range = window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0) : null;
    const box = caretRect(range);
    if (box) onCaret?.(box);
  };
  return (
    <BlockNoteView editor={editor} editable={editable} theme={dark ? 'dark' : 'light'}
      onChange={() => { onChange?.(editor.document); requestAnimationFrame(caret); }}
      onSelectionChange={() => requestAnimationFrame(caret)} />
  );
}
