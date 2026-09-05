// b2
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core';
import { createReactBlockSpec, getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import '@excalidraw/excalidraw/index.css';
import { PenTool } from 'lucide-react';
import { api, isDark } from './api.js';

const Excalidraw = lazy(() => import('@excalidraw/excalidraw').then((m) => ({ default: m.Excalidraw })));

// Follow the Settings → Appearance toggle live (applyTheme fires small:theme).
function useDark() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const on = (e) => setDark(e.detail);
    window.addEventListener('small:theme', on);
    return () => window.removeEventListener('small:theme', on);
  }, []);
  return dark;
}

// Excalidraw canvas as a BlockNote block. The scene (elements only) lives in the
// block's props, so it rides the normal runbook JSON autosave — no extra storage.
function ExcalidrawEmbed({ block, editor }) {
  const editable = editor.isEditable;
  const dark = useDark();
  const timer = useRef();
  const last = useRef(block.props.data);
  const initial = useMemo(() => {
    try {
      return block.props.data ? { ...JSON.parse(block.props.data), scrollToContent: true } : null;
    } catch {
      return null;
    }
  }, []);

  const onChange = (elements) => {
    if (!editable) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const data = JSON.stringify({ elements: elements.filter((e) => !e.isDeleted) });
      if (data !== last.current) {
        last.current = data;
        editor.updateBlock(block, { props: { data } }); // fires the editor's autosave
      }
    }, 800);
  };

  return (
    <div
      className="my-1 h-[380px] w-full rounded-sm border border-line"
      contentEditable={false}
      // ProseMirror listens at the editor root; without these it hijacks canvas pointer/key gestures
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Suspense fallback={<div className="p-3 text-xs text-ink-2">loading canvas…</div>}>
        <Excalidraw initialData={initial} onChange={onChange} viewModeEnabled={!editable} theme={dark ? 'dark' : 'light'} />
      </Suspense>
    </div>
  );
}

// createReactBlockSpec returns a factory in 0.54 — call it to get the spec
const excalidrawBlock = createReactBlockSpec(
  { type: 'excalidraw', propSchema: { data: { default: '' } }, content: 'none' },
  { render: (props) => <ExcalidrawEmbed block={props.block} editor={props.editor} /> },
)();

const schema = BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, excalidraw: excalidrawBlock } });

const insertExcalidraw = (editor) => ({
  title: 'Drawing',
  subtext: 'Excalidraw canvas',
  aliases: ['excalidraw', 'drawing', 'sketch', 'diagram'],
  group: 'Media',
  icon: <PenTool size={18} />,
  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'excalidraw' }),
});

// Runbooks store BlockNote's own block JSON — saving markdown was lossy, so the
// saved page never matched what was edited. Legacy rows are markdown: sniff & convert.
function loadContent(editor, raw) {
  if (!raw) return;
  try {
    let blocks;
    try {
      blocks = JSON.parse(raw);
    } catch {
      blocks = editor.tryParseMarkdownToBlocks(raw);
    }
    if (Array.isArray(blocks) && blocks.length) editor.replaceBlocks(editor.document, blocks);
  } catch {
    /* unreadable content — leave the editor empty rather than crash the panel */
  }
}

// Notion behavior: no Save button — edits autosave (debounced), Ctrl+Z is
// BlockNote's own history. Read-only render for viewers without edit rights.
export default function Runbook({ app, canEdit, onSaved }) {
  const editor = useCreateBlockNote({ schema });
  const dark = useDark();
  const [status, setStatus] = useState('');
  const timer = useRef();
  const ready = useRef(false); // loading the initial content fires onChange too — don't autosave that

  useEffect(() => {
    loadContent(editor, app.runbook);
    ready.current = true;
  }, []);

  const save = async () => {
    timer.current = undefined;
    const text = JSON.stringify(editor.document);
    setStatus('saving…');
    try {
      // PUT: POST /api/runbook is the CLI's generate-from-bundle route (merged from main)
      await api('/api/runbook', { method: 'PUT', body: JSON.stringify({ app: app.name, runbook: text }) });
      onSaved(app.name, text);
      setStatus('saved');
    } catch (e) {
      setStatus(`✗ ${e.message}`);
    }
  };

  const onChange = () => {
    if (!ready.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 800);
  };
  useEffect(() => () => {
    // flush a pending save when the panel closes so the last keystrokes aren't lost
    if (timer.current) {
      clearTimeout(timer.current);
      save();
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="-mx-[34px] min-h-0 flex-1 overflow-y-auto">{/* cancels bn-editor's 54px gutter down to the panel's 20px */}
        <BlockNoteView editor={editor} editable={canEdit} theme={dark ? 'dark' : 'light'} onChange={canEdit ? onChange : undefined} slashMenu={false}>
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), insertExcalidraw(editor)], query)}
          />
        </BlockNoteView>
      </div>
      {canEdit && <div className="h-4 text-right text-xs text-ink-2">{status}</div>}
    </div>
  );
}
