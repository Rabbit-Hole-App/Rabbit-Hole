import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, CloudUpload, Download, FileSpreadsheet, FileText, Loader2, MessageSquarePlus, Presentation, RotateCw, Sheet, Table2 } from 'lucide-react';
import { useChatWorkspace } from './chat-workspace.jsx';
import { Md } from './Md.jsx';
import { parse } from './file-parse.js';
import { TEXT_ENCODINGS, decodeText, textChunks, textExcerpt } from './file-text.js';
import { DELIMITERS, DELIMITER_NAMES, columnName, tableExcerpt } from './file-table.js';
import { cellText, describeCell } from './file-workbook.js';
import { slidesExcerpt } from './file-office.js';
import { describeFileCard, setFileExcerpt } from './file-excerpts.js';
import { withView } from './file-doc-import.js';
import { canWrite, fileScope, loadSource, scopeQuery, startUpload, uploadState, watchUpload } from './file-source-client.js';
import { EXTRACTOR, documentUnits, extractionOptions, fitBytes, lineUnits, slideUnits, tableUnits, workbookUnits } from './file-text-units.js';
import { fileChatRef } from './file-chat-ref.js';
import { fetchDerivatives, isTerminal, stageLabel, submitFileJob, watchFileJobs } from './file-jobs-client.js';
import { jobRequest } from './file-job.js';
import { selectionRef } from './selection-ref.js';
import { wsHeaders } from './api.js';
import { useSearchContent } from './canvas-search-content.jsx';
import { searchSourceRecord } from './canvas-search-content.js';
import { currentFileDocUnits, readFileDocOriginal } from './file-doc-read.js';
import { cn } from './ui.jsx';

// The body of a lane 2 file card (docs/features/canvas-file-imports.md): a text, Markdown, table, workbook, Word document or
// presentation card inside the shared CanvasNode frame, so it selects, moves, resizes, saves and undoes like any card. A new
// card is a fileRef card: its original uploads to the account (file-source-client.js) and the card says so until the upload
// is stored, with Retry on failure; a local preview is never called saved. An older card reads its board file (assetKey) as
// before. The original is parsed in the file worker and drawn bounded, saying how much it shows; once stored, the owner's
// browser keeps the extracted text as the source's text derivative for chat. Nothing here runs a macro or script, opens a
// link, or calls a model. Controls and scrolling areas stop the press, so they never drag the card; the header drags it.
const stop = event => event.stopPropagation();
const BUTTON = 'pointer-events-auto inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50';
const ICON = { text: FileText, markdown: FileText, table: Table2, workbook: FileSpreadsheet, document: FileText, presentation: Presentation };
const KIND_LABEL = { text: 'Text', markdown: 'Markdown', table: 'Table', workbook: 'Workbook', document: 'Word document', presentation: 'Presentation' };
const size = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : `${Math.max(1, Math.round(n / 1024))} KiB`);
const count = n => Number(n || 0).toLocaleString('en-US');

// The original file: { status: 'loading' | 'ready' | 'missing', blob }.
function useOriginal(block) {
  const ref = block.fileRef;
  const key = `${scopeQuery()}|${ref ? `${ref.source?.id || ''}@${ref.source?.rev || ''}|${ref.local || ''}` : block.assetKey}`;
  const [state, setState] = useState({ status: 'loading', blob: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    setState(previous => ({ key, attempt, status: 'loading', blob: previous.key === key ? previous.blob : null }));
    return readFileDocOriginal(() => loadSource(block), next => setState({ key, attempt, ...next }));
  }, [key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = state.key === key && state.attempt === attempt;
  return { ...state, ...(current ? {} : { status: 'loading', blob: null }), current, attempt, retry };
}

// A parse of the original in the worker: { status: 'loading' | 'ready' | 'failed', result, error, code }.
function useParsed(blob, kind, options) {
  const [state, setState] = useState({ status: 'loading' });
  const key = JSON.stringify(options);
  useEffect(() => {
    if (!blob) return undefined;
    let active = true;
    setState({ status: 'loading' });
    const started = performance.now();
    blob.arrayBuffer().then(bytes => parse(kind, bytes, options)).then(
      result => { if (active) setState({ status: 'ready', result, ms: Math.round(performance.now() - started) }); },
      error => { if (active) setState({ status: 'failed', error: error.message, code: error.code || null }); },
    );
    return () => { active = false; };
  }, [blob, kind, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

// The upload of a fileRef card that is not stored yet: started here (shared per local key, so cards from one file share it,
// and a card mounted after a reload resumes from this browser's copy), its state watched, and the stored source written
// into the card, so the next board save names it (which writes the reference the server authorizes reads by).
function useUpload(block, update) {
  const ref = block.fileRef, key = ref && !ref.source?.id ? ref.local : null;
  const [state, setState] = useState(() => (key ? uploadState(key) : null));
  useEffect(() => {
    if (!key) { setState(null); return undefined; }
    const take = next => {
      setState(next);
      if (next?.stage === 'stored') update(current => (current.fileRef?.source?.id ? current : { ...current, fileRef: { ...current.fileRef, source: { id: next.source.id, rev: next.source.rev }, local: undefined } }));
    };
    const unwatch = watchUpload(key, take);
    if (canWrite()) startUpload(key, { family: ref.family, name: block.label });
    take(uploadState(key)); // an upload that finished before this card mounted
    return unwatch;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const retry = () => { if (key) startUpload(key, { family: ref.family, name: block.label }); };
  return { state, retry };
}

// Once stored, the owner's browser keeps the extracted text (file-text-units.js) as the source's text derivative, once per
// revision and extraction (cards made from one file share the one store); the card then says chat can read it
// (fileRef.status.context). A failed store is forgotten, so the next view of the card tries again.
const storing = new Map();
const storeText = (sourceId, extraction, body, options) => {
  const key = `${sourceId}|${extraction}`;
  if (!storing.has(key)) {
    storing.set(key, fetch(`/api/learn/files/${encodeURIComponent(sourceId)}/text`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...wsHeaders() }, body: JSON.stringify({ ...body, extractor: EXTRACTOR, options }) })
      .then(response => { if (!response.ok) throw Error(String(response.status)); return true; })
      .catch(() => { storing.delete(key); return false; }));
  }
  return storing.get(key);
};
function useTextDerivative(block, update, units) {
  const ref = block.fileRef, source = ref?.source;
  const extraction = JSON.stringify(extractionOptions(block));
  const done = ref?.status?.extraction === extraction; // a delimiter or encoding change is a new extraction
  useEffect(() => {
    if (!units || units.key !== extraction || !source?.id || done || !canWrite()) return; // units of this extraction only
    let active = true;
    const body = fitBytes(units.body);
    storeText(source.id, extraction, body, extractionOptions(block))
      .then(stored => {
        if (!active || !stored) return;
        update(current => ({ ...current, fileRef: { ...current.fileRef, status: { ...current.fileRef.status, extraction, context: body.complete ? 'extracted' : 'partial', ...(body.limited ? { limited: body.limited.slice(0, 120) } : {}) } } }));
      });
    return () => { active = false; };
  }, [units, source?.id, done, extraction]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function FileDocCard({ block, onChange }) {
  // Every change goes through the latest block, so a late upload or extraction never writes over a newer edit.
  const latest = useRef(block);
  latest.current = block;
  const change = next => onChange?.(withView(next, {}));
  const update = fn => { const next = fn(latest.current); if (next !== latest.current) change(next); };
  const original = useOriginal(block);
  const upload = useUpload(block, update);
  const [units, setUnits] = useState(null);
  const [parseStatus, setParseStatus] = useState('loading');
  const searchKey = JSON.stringify([scopeQuery(), block.fileRef?.source, block.fileRef?.local, block.assetKey, extractionOptions(block)]);
  const searchSource = useMemo(() => {
    const current = currentFileDocUnits(original, units, searchKey);
    const status = original.status === 'missing' ? 'unavailable' : original.status === 'failed' ? 'failed' : !original.current || original.status === 'loading' || (!current && parseStatus === 'ready') ? 'loading' : parseStatus;
    return searchSourceRecord({ sourceKey: searchKey, retry: original.retry, status: current ? (units.body.complete ? 'ready' : 'partial') : status, ...(current ? units.body : {}) });
  }, [searchKey, original.current, original.status, original.blob, original.retry, units, parseStatus]);
  useSearchContent(block.id, searchSource);
  useTextDerivative(block, update, currentFileDocUnits(original, units, searchKey) ? units : null);
  const chat = useChatWorkspace();
  const Icon = ICON[block.kind] || FileText;
  const [meta, setMeta] = useState('');
  const download = () => {
    if (!original.blob) return;
    const url = URL.createObjectURL(original.blob), a = document.createElement('a');
    a.href = url; a.download = block.label || 'file'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // Add to chat: a stored fileRef card is its file ref (file-chat-ref.js), the same one its selection gives, so selecting it
  // and pressing Add to chat is one attachment; an older card or one not stored yet is its card ref, as before.
  const addToChat = () => chat?.addToChat?.(fileChatRef(block) || selectionRef({ ids: [block.id], kind: 'card', name: block.label, content: block.label, text: () => describeFileCard(block)?.text ?? '' }));
  useEffect(() => () => setFileExcerpt(block.id, null), [block.id]);
  return (
    <div data-file-doc-card={block.kind} data-format={block.format} data-saved={block.fileRef ? (block.fileRef.source?.id ? 'stored' : 'pending') : 'board-file'} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header data-drag-zone className="flex min-w-0 shrink-0 cursor-grab items-center gap-2 px-3 pt-1 pb-2 active:cursor-grabbing">
        <Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-2" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span data-file-doc-title className="truncate text-sm font-semibold text-ink" title={block.label}>{block.label}</span>
          <span data-file-doc-meta className="truncate text-xs text-ink-3">{KIND_LABEL[block.kind]} · {String(block.format || '').toUpperCase()}{block.size ? ` · ${size(block.size)}` : ''}{meta ? ` · ${meta}` : ''}</span>
        </span>
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-y border-line px-2 py-0.5" onPointerDown={stop}>
        <button type="button" data-file-doc-download className={BUTTON} disabled={!original.blob} title="Download the original file" onClick={download}><Download size={13} aria-hidden />Download</button>
        <button type="button" data-file-doc-chat className={BUTTON} disabled={!chat?.addToChat} title="Keep this file with the chat" onClick={addToChat}><MessageSquarePlus size={13} aria-hidden />Add to chat</button>
      </div>
      {block.fileRef && !block.fileRef.source?.id && <SaveState state={upload.state} onRetry={upload.retry} />}
      {original.status === 'loading' && <Status>Opening the file</Status>}
      {original.status === 'failed' && <div data-file-doc-read-error role="alert" className="flex items-center gap-2 px-3 py-2 text-xs text-danger" onPointerDown={stop}>The file could not be read.<button type="button" onClick={original.retry} className={BUTTON}>Retry</button></div>}
      {original.status === 'missing' && <p data-file-doc-missing className="px-3 py-2 text-xs text-ink-2">{block.fileRef && !block.fileRef.source?.id ? 'This file was never saved to the account and is not in this browser. Drop it on the canvas again.' : 'This file is not in this browser or saved with the board yet.'}</p>}
      {original.blob && <Body key={`${searchKey}:${original.attempt}`} block={block} blob={original.blob} onChange={change} update={update} setMeta={setMeta} onStatus={setParseStatus} onUnits={body => setUnits({ key: JSON.stringify(extractionOptions(latest.current)), sourceKey: searchKey, blob: original.blob, body })} />}
    </div>
  );
}

// A fileRef card not stored yet: how far its upload is, or why it failed and Retry. Never "saved" before the server says so.
function SaveState({ state, onRetry }) {
  if (state?.stage === 'failed') return <div role="alert" data-file-doc-save="failed" className="flex shrink-0 items-start gap-1.5 border-b border-line px-3 py-1.5 text-xs text-danger" onPointerDown={stop}>
    <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden /><span className="min-w-0 flex-1">Not saved: {state.error}</span>
    {state.retryable && <button type="button" data-file-doc-retry className={BUTTON} onClick={onRetry}><RotateCw size={13} aria-hidden />Retry</button>}
  </div>;
  const percent = state?.total ? Math.floor((100 * (state.sent || 0)) / state.total) : 0;
  const line = !state ? (canWrite() ? 'Saving to your account' : 'Not saved yet: the upload from the browser that added this file has not finished.')
    : state.stage === 'uploading' ? `Saving to your account, ${percent}%` : state.stage === 'hashing' ? 'Preparing to save' : 'Saving to your account';
  return <p role="status" data-file-doc-save={state?.stage || 'waiting'} className="flex shrink-0 items-center gap-1.5 border-b border-line px-3 py-1 text-[11px] text-ink-2"><CloudUpload size={13} aria-hidden />{line}</p>;
}

const Status = ({ children }) => <p role="status" className="flex items-center gap-1.5 px-3 py-2 text-xs text-ink-2"><Loader2 size={13} className="animate-spin" aria-hidden />{children}</p>;
const Failed = ({ children }) => <p role="alert" data-file-doc-error className="flex items-start gap-1.5 px-3 py-2 text-xs text-danger"><AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />{children}</p>;
const Note = ({ children, ...props }) => <p {...props} className="shrink-0 border-t border-line px-3 py-1 text-[11px] text-ink-3">{children}</p>;

function Body(props) {
  const { block } = props;
  if (block.kind === 'text' || block.kind === 'markdown') return <TextBody {...props} />;
  if (block.kind === 'table') return <TableBody {...props} />;
  if (block.kind === 'workbook') return <WorkbookBody {...props} />;
  if (block.kind === 'document') return <DocumentBody {...props} />;
  if (block.kind === 'presentation') return <PresentationBody {...props} />;
  return null;
}

// The excerpt a chat question reads for this card (file-excerpts.js), refreshed as the view changes.
function useExcerpt(block, excerpt) {
  const text = excerpt?.text, where = excerpt?.where;
  useEffect(() => { setFileExcerpt(block.id, excerpt || null); }, [block.id, text, where]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ─── Text and Markdown: decoded with its encoding, drawn in chunks; Show more draws the next one. ───
function TextBody({ block, blob, onChange, setMeta, onUnits, onStatus }) {
  const [decoded, setDecoded] = useState({ status: 'loading' });
  const [shown, setShown] = useState(1);
  useEffect(() => {
    let active = true;
    blob.arrayBuffer().then(bytes => {
      try { const result = decodeText(bytes, { name: block.label, encoding: block.encoding || null }); if (active) setDecoded({ status: 'ready', ...result }); } catch (error) { if (active) setDecoded({ status: 'failed', error: error.message, code: error.code }); }
    });
    return () => { active = false; };
  }, [blob, block.encoding, block.label]);
  useEffect(() => { onStatus?.(decoded.status); }, [decoded.status, onStatus]);
  const view = useMemo(() => (decoded.status === 'ready' ? textChunks(decoded.text) : null), [decoded]);
  useExcerpt(block, decoded.status === 'ready' ? { ...textExcerpt(decoded.text), where: `${decoded.encoding.toUpperCase()}, ${count(decoded.text.length)} characters` } : null);
  useEffect(() => { if (decoded.status === 'ready') onUnits?.(lineUnits(decoded.text)); }, [decoded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (decoded.status === 'ready') setMeta(`${decoded.encoding.toUpperCase()}${decoded.newline !== 'none' && decoded.newline !== 'lf' ? ` · ${decoded.newline.toUpperCase()} line ends` : ''}`); }, [decoded]); // eslint-disable-line react-hooks/exhaustive-deps
  if (decoded.status === 'loading') return <Status>Reading the text</Status>;
  if (decoded.status === 'failed') return <div onPointerDown={stop}><Failed>{decoded.error}</Failed>{decoded.code === 'encoding' && <EncodingChoice value={block.encoding} onPick={encoding => onChange?.({ ...block, encoding })} />}</div>;
  const chunks = view.chunks.slice(0, shown), drawn = chunks.reduce((n, chunk) => n + chunk.length, 0);
  const more = shown < view.chunks.length;
  const images = block.kind === 'markdown' && /!\[[^\]]*\]\([^)]+\)/.test(decoded.text);
  return <>
    <div data-scroll data-file-doc-text className="pointer-events-auto min-h-0 flex-1 overflow-auto px-3 py-2" onPointerDown={stop}>
      {block.kind === 'markdown'
        ? <div className="text-sm text-ink"><Md text={chunks.join('')} doc /></div>
        : chunks.map((chunk, i) => <pre key={i} className="font-mono text-[12px] leading-5 break-words whitespace-pre-wrap text-ink">{chunk}</pre>)}
      {more && <button type="button" data-file-doc-more className={cn(BUTTON, 'mt-2')} onClick={() => setShown(n => n + 1)}>Show more</button>}
    </div>
    {(more || view.truncated) && <Note data-file-doc-bound>Showing {count(drawn)} of {count(view.total)} characters.{view.truncated && !more ? ' The rest is in the original file (Download).' : ''}</Note>}
    {images && <Note data-file-doc-images>Images this Markdown file links to are not shown: only the file itself was imported.</Note>}
  </>;
}

function EncodingChoice({ value, onPick }) {
  return <label className="flex items-center gap-2 px-3 pb-2 text-xs text-ink-2">Encoding
    <select data-file-doc-encoding aria-label="Text encoding" value={value || 'utf-8'} onChange={event => onPick(event.target.value)} className="h-7 rounded-md border border-line bg-white px-1.5 text-xs text-ink dark:bg-side">
      {TEXT_ENCODINGS.map(name => <option key={name} value={name}>{name.toUpperCase()}</option>)}
    </select></label>;
}

// ─── A virtualized grid: only the rows and columns in view are in the DOM; the header row and row numbers stay put. ───
const ROW_H = 26, NUM_W = 48;
function VirtualTable({ rows, header = null, letters = false, onCell, selected }) {
  const box = useRef(null);
  const [view, setView] = useState({ top: 0, left: 0, h: 300, w: 600 });
  const width = useMemo(() => {
    const cols = Math.max(header?.length || 0, ...rows.slice(0, 200).map(row => row.length), 1);
    return Array.from({ length: cols }, (_, c) => {
      let longest = String(header?.[c] ?? '').length;
      for (const row of rows.slice(0, 200)) longest = Math.max(longest, cellText(row[c]).length);
      return Math.max(64, Math.min(280, 16 + longest * 7));
    });
  }, [rows, header]);
  const starts = useMemo(() => width.reduce((out, w, i) => (out.push((out[i] || 0) + w), out), [0]), [width]);
  useEffect(() => {
    const node = box.current;
    if (!node) return undefined;
    const measure = () => setView({ top: node.scrollTop, left: node.scrollLeft, h: node.clientHeight, w: node.clientWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const headH = (letters ? ROW_H : 0) + (header ? ROW_H : 0);
  const first = Math.max(0, Math.floor((view.top) / ROW_H) - 8), last = Math.min(rows.length, Math.ceil((view.top + view.h) / ROW_H) + 8);
  let c0 = 0; while (c0 < width.length - 1 && starts[c0 + 1] < view.left - NUM_W) c0++;
  let c1 = c0; while (c1 < width.length && starts[c1] < view.left + view.w) c1++;
  const cols = []; for (let c = Math.max(0, c0 - 2); c < Math.min(width.length, c1 + 2); c++) cols.push(c);
  const total = NUM_W + starts[width.length];
  const cell = (c, content, extra = {}) => <div key={c} {...extra} style={{ position: 'absolute', left: NUM_W + starts[c], width: width[c], height: ROW_H, ...(extra.style || {}) }} className={cn('truncate border-r border-b border-line px-1.5 leading-[26px]', extra.className)}>{content}</div>;
  return (
    <div ref={box} data-scroll data-file-doc-table role="grid" aria-rowcount={rows.length + (header ? 1 : 0)} aria-colcount={width.length} tabIndex={0}
      className="pointer-events-auto relative min-h-0 flex-1 overflow-auto font-mono text-[12px] text-ink outline-none" onPointerDown={stop}
      onScroll={event => { const node = event.currentTarget; setView(v => ({ ...v, top: node.scrollTop, left: node.scrollLeft })); }}>
      <div style={{ height: headH + rows.length * ROW_H, width: total, position: 'relative' }}>
        <div className="sticky top-0 z-20 bg-white dark:bg-side" style={{ height: headH, width: total }}>
          {letters && <div style={{ position: 'absolute', top: 0, height: ROW_H, width: total }} className="text-ink-3">
            <div className="z-10 border-r border-b border-line bg-white dark:bg-side" style={{ position: 'absolute', left: view.left, width: NUM_W, height: ROW_H }} />
            {cols.map(c => cell(c, columnName(c), { role: 'columnheader', className: 'bg-hover/40 text-center text-ink-3' }))}
          </div>}
          {header && <div data-file-doc-header style={{ position: 'absolute', top: letters ? ROW_H : 0, height: ROW_H, width: total }}>
            <div className="border-r border-b border-line bg-white text-right text-ink-3 dark:bg-side" style={{ position: 'absolute', left: view.left, width: NUM_W, height: ROW_H }} />
            {cols.map(c => cell(c, String(header[c] ?? ''), { role: 'columnheader', className: 'bg-hover/40 font-semibold', title: String(header[c] ?? '') }))}
          </div>}
        </div>
        {rows.slice(first, last).map((row, i) => {
          const r = first + i;
          return <div key={r} role="row" style={{ position: 'absolute', top: headH + r * ROW_H, height: ROW_H, width: total }}>
            <div className="z-10 border-r border-b border-line bg-white pr-1.5 text-right leading-[26px] text-ink-3 dark:bg-side" style={{ position: 'absolute', left: view.left, width: NUM_W, height: ROW_H }}>{r + 1 + (header ? 1 : 0)}</div>
            {cols.map(c => {
              const value = row[c];
              const formula = typeof value === 'object' && value?.f;
              return cell(c, <>{formula && <span aria-label="formula" className="mr-1 text-ink-3">ƒ</span>}{cellText(value)}</>, {
                role: 'gridcell', 'data-cell': `${r}:${c}`, title: cellText(value),
                className: cn(onCell && 'cursor-cell', selected?.[0] === r && selected?.[1] === c && 'bg-hover outline outline-1 outline-ink', typeof value === 'object' && value?.t === 'n' && 'text-right'),
                onClick: onCell ? () => onCell(r, c) : undefined,
              });
            })}
          </div>;
        })}
      </div>
    </div>
  );
}

// ─── CSV / TSV: the first record is the header; delimiter and encoding can be corrected on the card. ───
function TableBody({ block, blob, onChange, setMeta, onUnits, onStatus }) {
  const parsed = useParsed(blob, 'table', { name: block.label, delimiter: block.delimiter || null, encoding: block.encoding || null });
  const t = parsed.result;
  useEffect(() => { onStatus?.(parsed.status); }, [parsed.status, onStatus]);
  useEffect(() => { if (t) onUnits?.(tableUnits(t)); }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  useExcerpt(block, t ? { ...tableExcerpt(t), where: `${count(t.totalRows)} rows × ${count(t.totalCols)} columns, ${DELIMITER_NAMES[t.delimiter] || 'custom'}-delimited` } : null);
  useEffect(() => { if (t) setMeta(`${count(Math.max(0, t.totalRows - 1))} rows × ${count(t.totalCols)} columns`); }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  if (parsed.status === 'loading') return <Status>Reading the table</Status>;
  if (parsed.status === 'failed') return <div onPointerDown={stop}><Failed>{parsed.error}</Failed>{parsed.code === 'encoding' && <EncodingChoice value={block.encoding} onPick={encoding => onChange?.({ ...block, encoding })} />}</div>;
  const [header = [], ...body] = t.rows;
  return <>
    <div className="flex shrink-0 items-center gap-2 px-3 py-1 text-xs text-ink-2" onPointerDown={stop}>
      <label className="flex items-center gap-1">Delimiter
        <select data-file-doc-delimiter aria-label="Delimiter" value={t.delimiter} onChange={event => onChange?.({ ...block, delimiter: event.target.value })} className="h-6 rounded-md border border-line bg-white px-1 text-xs text-ink dark:bg-side">
          {DELIMITERS.map(d => <option key={d} value={d}>{DELIMITER_NAMES[d]}</option>)}
        </select></label>
      <span className="text-ink-3">{t.encoding.toUpperCase()}</span>
    </div>
    {t.totalRows === 0 ? <p className="px-3 py-2 text-xs text-ink-2">This file has no rows.</p> : <VirtualTable rows={body} header={header} />}
    {(t.truncatedRows || t.truncatedCols) && <Note data-file-doc-bound>Showing {count(Math.max(0, t.rows.length - 1))} of {count(Math.max(0, t.totalRows - 1))} rows{t.truncatedCols ? ` and ${count(t.cols)} of ${count(t.totalCols)} columns` : ''}. The rest is in the original file (Download).</Note>}
  </>;
}

// ─── Workbooks: one sheet at a time (the selector lists the sheets this card holds), formulas marked and explained. ───
function WorkbookBody({ block, blob, onChange, setMeta, onUnits, onStatus }) {
  const parsed = useParsed(blob, 'workbook', { name: block.label });
  const [picked, setPicked] = useState(null);
  const book = parsed.result;
  useEffect(() => { onStatus?.(parsed.status); }, [parsed.status, onStatus]);
  const sheets = book ? book.sheets.filter(sheet => !block.sheets || block.sheets.includes(sheet.name)) : [];
  const sheet = sheets.find(entry => entry.name === block.sheet) || sheets[0] || null;
  useEffect(() => { setPicked(null); }, [sheet?.name]);
  useEffect(() => { if (book) onUnits?.(workbookUnits(book)); }, [book]); // eslint-disable-line react-hooks/exhaustive-deps
  useExcerpt(block, sheet ? { ...tableExcerpt({ rows: sheet.rows.map(row => row.map(cellText)), totalRows: sheet.totalRows, totalCols: sheet.totalCols }, { sheet: sheet.name }), where: `sheet ${sheet.name}, ${count(sheet.totalRows)} rows × ${count(sheet.totalCols)} columns; formula cells show the value cached in the file` } : null);
  useEffect(() => { if (book) setMeta(`${sheets.length} of ${book.sheets.length} sheet${book.sheets.length === 1 ? '' : 's'}`); }, [book, sheets.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (parsed.status === 'loading') return <Status>Reading the workbook</Status>;
  if (parsed.status === 'failed') return <Failed>{parsed.error}</Failed>;
  const detail = picked && sheet ? describeCell(sheet.rows[picked[0]]?.[picked[1]], picked[0], picked[1]) : null;
  return <>
    <div role="tablist" aria-label="Sheets" data-file-doc-sheets className="flex shrink-0 gap-1 overflow-x-auto px-2 py-1" onPointerDown={stop}>
      {sheets.map(entry => <button key={entry.name} type="button" role="tab" aria-selected={entry.name === sheet?.name} data-sheet={entry.name}
        onClick={() => onChange?.({ ...block, sheet: entry.name })}
        className={cn('flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs', entry.name === sheet?.name ? 'border-ink bg-hover font-medium text-ink' : 'border-line text-ink-2 hover:bg-hover')}>
        <Sheet size={12} aria-hidden />{entry.name}{entry.hidden && <span className="text-ink-3">(hidden)</span>}</button>)}
    </div>
    {sheet && <p data-file-doc-counts className="shrink-0 px-3 pb-1 text-[11px] text-ink-3">{count(sheet.totalRows)} rows × {count(sheet.totalCols)} columns{sheet.formulas ? ` · ${count(sheet.formulas)} formula cells (ƒ) show the value saved in the file; nothing is recalculated here` : ''}</p>}
    {!sheet || !sheet.totalRows ? <p data-file-doc-empty className="px-3 py-2 text-xs text-ink-2">This sheet is empty.</p>
      : <VirtualTable rows={sheet.rows} letters onCell={(r, c) => setPicked([r, c])} selected={picked} />}
    {detail && <Note data-file-doc-cell>
      <span className="font-mono">{quote(sheet.name)}!{detail.address}</span>{' · '}
      {detail.kind === 'formula' && <>Formula <span className="font-mono">{detail.formula}</span> · cached value <span className="font-mono">{detail.value}</span> (saved by the program that wrote the file)</>}
      {detail.kind === 'formula-no-cache' && <>Formula <span className="font-mono">{detail.formula}</span> · no cached value was saved, and this view does not calculate formulas</>}
      {detail.kind === 'number' && <>Number <span className="font-mono">{detail.value}</span>{detail.raw ? <> (stored as <span className="font-mono">{detail.raw}</span>)</> : null}</>}
      {['text', 'value', 'boolean', 'error', 'empty'].includes(detail.kind) && <>{detail.kind === 'empty' ? 'Empty cell' : <span className="font-mono">{detail.value}</span>}</>}
    </Note>}
    {sheet && (sheet.truncatedRows || sheet.truncatedCols) && <Note data-file-doc-bound>Showing {count(sheet.rows.length)} of {count(sheet.totalRows)} rows{sheet.truncatedCols ? ` and ${count(sheet.cols)} of ${count(sheet.totalCols)} columns` : ''}. The rest is in the original file (Download).</Note>}
  </>;
}
const quote = name => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`);

// ─── Word documents: mammoth's structure as React elements (never HTML), images from the original, conversion notes said. ───
const BLOCKS_PER_PAGE = 300;
function DocumentBody({ block, blob, setMeta, onUnits, onStatus }) {
  const legacy = block.format === 'doc';
  const parsed = useParsed(legacy ? null : blob, 'document', { name: block.label });
  const [pages, setPages] = useState(1);
  const urls = useMemo(() => new Map((parsed.result?.images || []).map(image => [image.id, URL.createObjectURL(new Blob([image.bytes], { type: image.type }))])), [parsed.result]);
  useEffect(() => () => { for (const url of urls.values()) URL.revokeObjectURL(url); }, [urls]);
  const doc = parsed.result;
  useEffect(() => { onStatus?.(parsed.status); }, [parsed.status, onStatus]);
  useEffect(() => { if (doc) onUnits?.(documentUnits(doc)); }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  useExcerpt(block, doc ? { ...textExcerpt(doc.text), where: 'text and structure read from the .docx; layout not reproduced' } : null);
  useEffect(() => { if (doc) setMeta(`${count(doc.text.length)} characters${doc.images.length ? ` · ${doc.images.length} image${doc.images.length === 1 ? '' : 's'}` : ''}`); }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  // ponytail: awaiting converter. A .doc (Word 97-2003) needs the office-pdf conversion job (file-job.js); until a card holds
  // its job, it is never imported as a document card (the import dialog offers File attachment only).
  if (legacy) return <p data-file-doc-awaiting className="px-3 py-2 text-xs text-ink-2">A Word 97-2003 (.doc) preview needs the document converter, which is not connected yet. The original is kept: Download it.</p>;
  if (parsed.status === 'loading') return <Status>Reading the document</Status>;
  if (parsed.status === 'failed') return <Failed>{parsed.error}</Failed>;
  const shown = doc.nodes.slice(0, pages * BLOCKS_PER_PAGE);
  return <>
    <div data-scroll data-file-doc-document className="pointer-events-auto min-h-0 flex-1 overflow-auto px-4 py-3 text-sm leading-6 text-ink [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-1.5 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_table]:my-2 [&_td]:border [&_td]:border-line [&_td]:px-2 [&_th]:border [&_th]:border-line [&_th]:px-2 [&_ul]:list-disc" onPointerDown={stop}>
      {!doc.text.trim() && !doc.images.length ? <p className="text-xs text-ink-2">No text or images could be read from this document.</p> : shown.map((node, i) => <DocNode key={i} node={node} urls={urls} />)}
      {doc.nodes.length > shown.length && <button type="button" className={cn(BUTTON, 'mt-2')} onClick={() => setPages(n => n + 1)}>Show more</button>}
    </div>
    <Note data-file-doc-losses>Structure and text preview: page layout, fonts, headers, footers and comments are not shown.{doc.skippedImages ? ` ${doc.skippedImages} image${doc.skippedImages === 1 ? ' was' : 's were'} not shown.` : ''}{doc.messages.length ? ` Not converted: ${doc.messages.map(m => m.replace(/^Not converted: /, '')).join('; ')}.` : ''}{doc.truncated ? ' The document is longer than the preview; the rest is in the original file.' : ''}</Note>
  </>;
}

const DOC_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'strong', 'em', 'u', 's', 'sub', 'sup', 'blockquote', 'pre', 'code', 'span']);
function DocNode({ node, urls }) {
  if (typeof node === 'string') return node;
  const children = node.c.map((child, i) => <DocNode key={i} node={child} urls={urls} />);
  if (node.t === 'br') return <br />;
  if (node.t === 'img') return node.a?.img && urls.get(node.a.img) ? <img src={urls.get(node.a.img)} alt={node.a.alt || ''} className="my-1 inline-block max-w-full" /> : <span className="text-xs text-ink-3">[{node.a?.missing || 'image not shown'}]</span>;
  if (node.t === 'a') return <a href={node.a.href} target="_blank" rel="noopener noreferrer nofollow" className="text-ink underline">{children}</a>;
  if (node.t === 'table') return <table className="border-collapse"><tbody>{node.c.flatMap(child => (typeof child === 'object' && (child.t === 'tbody' || child.t === 'thead') ? child.c : [child])).map((child, i) => <DocNode key={i} node={child} urls={urls} />)}</tbody></table>;
  if (node.t === 'td' || node.t === 'th') { const Tag = node.t; return <Tag colSpan={node.a?.colspan} rowSpan={node.a?.rowspan}>{children}</Tag>; }
  const Tag = DOC_TAGS.has(node.t) ? node.t : 'span';
  return <Tag>{children}</Tag>;
}

// ─── Presentations: a slide navigator over the deck's own slide numbers; text extracted here, slide images await the converter. ───
function PresentationBody({ block, onChange, update, blob, setMeta, onUnits, onStatus }) {
  const parsed = useParsed(blob, 'presentation', { name: block.label });
  const deck = parsed.result;
  useEffect(() => { onStatus?.(parsed.status); }, [parsed.status, onStatus]);
  const [from, to] = block.slides || [1, deck?.count || 1];
  const slides = deck ? deck.slides.filter(slide => slide.number >= from && slide.number <= to) : [];
  const current = slides.find(slide => slide.number === block.slide) || slides[0] || null;
  useEffect(() => { if (deck) onUnits?.(slideUnits(deck)); }, [deck]); // eslint-disable-line react-hooks/exhaustive-deps
  const images = useSlideImages(block, update, deck);
  useExcerpt(block, deck && slides.length ? { ...slidesExcerpt(block.slides ? slides : [current, ...slides.filter(s => s !== current)]), where: block.slides ? `slides ${from}-${to} of ${deck.count}` : `${deck.count} slides; text only, slide images not read` } : null);
  useEffect(() => { if (deck) setMeta(block.slides ? `slide${from === to ? '' : 's'} ${from}${from === to ? '' : `-${to}`} of ${deck.count}` : `${deck.count} slides`); }, [deck, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  if (parsed.status === 'loading') return <Status>Reading the presentation</Status>;
  if (parsed.status === 'failed') return <Failed>{parsed.error}</Failed>;
  if (!current) return <p className="px-3 py-2 text-xs text-ink-2">This presentation has no slides.</p>;
  const index = slides.indexOf(current);
  const go = step => { const next = slides[index + step]; if (next) onChange?.({ ...block, slide: next.number }); };
  const lines = current.text.split('\n').filter(line => line !== current.title);
  return <>
    <div className="flex shrink-0 items-center gap-1 px-2 py-1 text-xs text-ink-2" onPointerDown={stop}>
      <button type="button" aria-label="Previous slide" data-file-doc-prev className={BUTTON} disabled={index <= 0} onClick={() => go(-1)}><ChevronLeft size={14} aria-hidden /></button>
      <span data-file-doc-slide={current.number} className="tabular-nums">Slide {current.number} of {deck.count}{current.hidden ? ' (hidden)' : ''}</span>
      <button type="button" aria-label="Next slide" data-file-doc-next className={BUTTON} disabled={index >= slides.length - 1} onClick={() => go(1)}><ChevronRight size={14} aria-hidden /></button>
    </div>
    <div data-scroll className="pointer-events-auto min-h-0 flex-1 overflow-auto px-3 pb-2" onPointerDown={stop}>
      {images.urls.get(current.number)
        ? <img data-file-doc-slide-image src={images.urls.get(current.number)} alt={`Slide ${current.number}: ${current.title || 'untitled'}`} className="w-full rounded-md border border-line bg-white" style={{ aspectRatio: String(deck.size.ratio) }} />
        : <div data-file-doc-slide-frame className="relative w-full overflow-hidden rounded-md border border-line bg-white p-4 dark:bg-side" style={{ aspectRatio: String(deck.size.ratio) }}>
          <p className="text-base font-semibold text-ink">{current.title || <span className="text-ink-3">(no title)</span>}</p>
          {lines.map((line, i) => <p key={i} className="mt-1 text-sm text-ink-2">{line}</p>)}
        </div>}
      {current.notes && <div data-file-doc-notes className="mt-2 rounded-md bg-hover/50 px-2 py-1.5 text-xs text-ink-2"><span className="font-semibold">Speaker notes:</span> {current.notes}</div>}
    </div>
    {images.urls.size ? <Note data-file-doc-slide-images>Slide images from the presentation converter{images.job?.state === 'ready_with_limitations' ? ' (with limitations: animations and embedded media are not shown)' : ''}.</Note>
      : <Note data-file-doc-awaiting>{images.line || 'Slide text only. Slide images need the presentation converter, which is not connected yet; the original keeps every slide.'}</Note>}
  </>;
}

// Slide images through the converter's slides job (file-jobs-client.js; JOBS lane): the owner's canvas submits it once the
// original is stored (one key per card, converter and revision, so a reload or a second press never makes a second job) and
// keeps its id on the card; every page then reads the job's state and, once ready, the slide images of that revision.
// The images are named slide-NNN.png by the deck's own slide number (converter API 1.6). Text stays when there are none.
function useSlideImages(block, update, deck) {
  const ref = block.fileRef, source = ref?.source;
  const [state, setState] = useState({ job: null, urls: new Map(), line: '' });
  const request = jobRequest('pptx', block.slides ? { from: block.slides[0], to: block.slides[1] } : {});
  useEffect(() => {
    if (!source?.id || ref.job || !deck || !canWrite()) return;
    const at = fileScope();
    submitFileJob(globalThis.fetch, { sourceId: source.id, sourceRev: source.rev, cardId: block.id, converter: request.converter, options: request.options, app: at.app, board: at.board })
      .then(job => update(current => (current.fileRef?.job ? current : { ...current, fileRef: { ...current.fileRef, job: job.id } })),
        error => setState(previous => ({ ...previous, line: `Slide text only. Slide images: ${error.message}` })));
  }, [source?.id, ref?.job, !!deck]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!source?.id) return undefined;
    const at = fileScope();
    let live = true;
    const read = async () => {
      const list = await fetchDerivatives(globalThis.fetch, { sourceId: source.id, rev: source.rev, converter: request.converter, options: request.options, app: at?.app || null, board: at?.board || 'main', share: at?.share || null }).catch(() => null);
      if (!live || !list) return;
      const slide = list.filter(d => d.kind === 'slide' && d.name.startsWith('slide-') && d.name.endsWith('.png'));
      setState(previous => ({ ...previous, urls: new Map(slide.map(d => [Number(d.name.slice(6, -4)), `/api/learn/files/${source.id}/d/${d.id}${scopeQuery(at)}`])) }));
    };
    // A shared/forked card can keep the source revision without the original job.
    if (!ref?.job) { read(); return () => { live = false; }; }
    const watch = watchFileJobs({ blocks: [block], fetchImpl: (url, init) => globalThis.fetch(url, init), share: at?.share || null, onJob: async (_, job) => {
      if (!live) return;
      const failed = job.state === 'failed' || job.state === 'cancelled';
      setState(previous => ({ ...previous, job, line: failed ? `Slide text only. Slide images: ${stageLabel(job)}${job.error ? ` (${job.error})` : ''}` : isTerminal(job) ? previous.line : `Slide images: ${stageLabel(job)}` }));
      if (job.state !== 'ready' && job.state !== 'ready_with_limitations') return;
      await read();
    } });
    return () => { live = false; watch.stop(); };
  }, [ref?.job, source?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
