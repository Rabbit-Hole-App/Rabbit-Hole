import { useState } from 'react';
import { createPortal } from 'react-dom';
import { cacheAsset } from './learn-asset-cache.js';
import { startUpload } from './file-source-client.js';
import { DOC_CARD, checkDocFile, docBlocks, docKind, fileHead, slideRange } from './file-doc-import.js';
import { parse } from './file-parse.js';
import { ConfirmDialog, cn } from './ui.jsx';

// Tables, workbooks, Word documents and presentations dropped or uploaded onto a canvas (docs/features/canvas-file-imports.md,
// lane 2). A CSV, TSV or .docx becomes its card at once; a workbook with several sheets asks which sheets and whether as one
// workbook card or a card per sheet; a presentation asks for the whole deck or a slide range. The first bytes are checked
// before any parser runs, so a misnamed or binary file is refused with its reason. The original is cached under one asset key
// that every card made from it shares (saved with the board); nothing runs a macro, follows a link or asks a model.
export function useDocImport({ canvas, toast }) {
  const [pending, setPending] = useState(null); // { file, kind, format, assetKey, at, info, error }
  const place = async ({ file, kind, format, at }, choice, assetKey = `import:${crypto.randomUUID()}`) => {
    await cacheAsset(assetKey, file);
    const blocks = docBlocks({ name: file.name, size: file.size, assetKey, type: file.type, kind, format }, choice);
    // One upload for every card made from this file, started now from the file in hand; the cards show its progress.
    startUpload(assetKey, { family: blocks[0].fileRef.family, file });
    const surface = canvas();
    if (blocks.length === 1) return [surface?.insertImported({ ...blocks[0], w: DOC_CARD[kind].w, h: DOC_CARD[kind].h }, at)];
    // Several cards from one file: one group in free space, in the file's own order, one Undo step.
    return surface?.insertGroup?.(blocks.map(block => ({ ...block, w: DOC_CARD[kind].w, h: DOC_CARD[kind].h })), DOC_CARD[kind]) || [];
  };
  const take = async (file, at = null) => {
    const checked = checkDocFile(file, await fileHead(file));
    if (checked.error) { toast(checked.error, { tone: 'error' }); return; }
    const { kind, format } = checked;
    if (kind === 'document' && format === 'doc') {
      toast(`${file.name}: Word 97-2003 (.doc) previews need the document converter, which is not connected yet. Save it as .docx to preview it, or add it as a File attachment.`, { tone: 'error' });
      return;
    }
    if (kind === 'table' || kind === 'document') { await place({ file, kind, format, at }, {}); return; }
    try {
      const bytes = await file.arrayBuffer();
      // Only the names and counts are needed to ask: one row per sheet, the slides' titles.
      const info = kind === 'workbook' ? await parse('workbook', bytes, { name: file.name, maxRows: 1, maxCols: 1 }) : await parse('presentation', bytes, { name: file.name });
      if (kind === 'workbook' && info.sheets.length === 1) { await place({ file, kind, format, at }, { mode: 'workbook', sheets: [info.sheets[0].name] }); return; }
      setPending({ file, kind, format, at, info, error: null });
    } catch (error) { toast(error.message, { tone: 'error' }); }
  };
  const confirm = async choice => {
    try { await place(pending, choice); setPending(null); } catch (error) { setPending(current => current && { ...current, error: error.message }); }
  };
  const dialog = pending ? <DocImportDialog key={pending.file.name + pending.file.size} pending={pending} onCancel={() => setPending(null)} onConfirm={confirm} /> : null;
  return { claims: file => !!docKind(file?.name), take, dialog };
}

function DocImportDialog({ pending, onCancel, onConfirm }) {
  const { file, kind, info } = pending;
  const workbook = kind === 'workbook';
  const [mode, setMode] = useState(workbook ? 'workbook' : 'whole');
  const [sheets, setSheets] = useState(() => (workbook ? info.sheets.filter(sheet => !sheet.hidden).map(sheet => sheet.name) : []));
  const [from, setFrom] = useState('1'), [to, setTo] = useState(String(workbook ? 1 : info.count));
  const range = !workbook && mode === 'slides' ? slideRange(from, to, info.count) : null;
  const problem = workbook ? (!sheets.length ? 'Choose at least one sheet.' : null) : range?.error || null;
  const modes = workbook ? [['workbook', 'One workbook card'], ['sheets', 'A card per sheet']] : [['whole', 'Whole presentation'], ['slides', 'Selected slides']];
  const submit = () => {
    if (problem) return;
    if (workbook) onConfirm({ mode, sheets: info.sheets.map(sheet => sheet.name).filter(name => sheets.includes(name)) });
    else onConfirm(mode === 'slides' ? { mode, from: range.from, to: range.to } : { mode });
  };
  return createPortal(
    <div data-doc-import-dialog={kind}>
      <ConfirmDialog title="Add to canvas" confirmLabel="Add to canvas" confirmVariant="primary" confirmDisabled={!!problem} onCancel={onCancel} onConfirm={submit}
        body={<span className="block">
          <span data-import-file className="block truncate pb-3 font-mono text-[13px] text-ink" title={file.name}>{file.name}</span>
          <span role="radiogroup" aria-label="Add as" className="flex flex-wrap gap-2 pb-3">
            {modes.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={mode === id} data-import-choice={id} onClick={() => setMode(id)}
              className={cn('h-8 rounded-lg border px-3 text-sm', mode === id ? 'border-ink bg-hover font-medium text-ink' : 'border-line text-ink-2 hover:bg-hover hover:text-ink')}>{label}</button>)}
          </span>
          {workbook && <span className="block">
            <span className="block pb-1 text-xs">Sheets ({info.sheets.length})</span>
            <span className="block max-h-48 overflow-y-auto">
              {info.sheets.map(sheet => <label key={sheet.name} data-import-sheet={sheet.name} className="flex items-center gap-2 py-0.5 text-sm text-ink">
                <input type="checkbox" checked={sheets.includes(sheet.name)} onChange={event => setSheets(list => (event.target.checked ? [...list, sheet.name] : list.filter(name => name !== sheet.name)))} />
                <span className="truncate">{sheet.name}</span>{sheet.hidden && <span className="text-xs text-ink-3">hidden</span>}
                <span className="ml-auto text-xs text-ink-3">{sheet.totalRows ? `${sheet.totalRows.toLocaleString('en-US')} rows` : 'empty'}</span>
              </label>)}
            </span>
          </span>}
          {!workbook && <span className="block text-xs">
            <span className="block pb-1">{info.count} slide{info.count === 1 ? '' : 's'}{mode === 'slides' ? '. One card per slide, numbered as in the presentation.' : ''}</span>
            {mode === 'slides' && <span className="flex items-center gap-2">
              <label className="flex items-center gap-1">From <input data-import-from type="number" min="1" max={info.count} value={from} onChange={event => setFrom(event.target.value)} className="h-8 w-16 rounded-lg border border-line px-2 text-sm text-ink" /></label>
              <label className="flex items-center gap-1">To <input data-import-to type="number" min="1" max={info.count} value={to} onChange={event => setTo(event.target.value)} className="h-8 w-16 rounded-lg border border-line px-2 text-sm text-ink" /></label>
            </span>}
            <span className="block pt-2 text-ink-3">Slide text is read here; slide images need the presentation converter, which is not connected yet.</span>
          </span>}
          {(problem || pending.error) && <span role="alert" data-import-error className="block pt-3 text-xs text-danger">{pending.error || problem}</span>}
        </span>} />
    </div>,
    document.body,
  );
}
