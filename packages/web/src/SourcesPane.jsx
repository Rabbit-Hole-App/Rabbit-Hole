import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, CircleAlert, CornerUpLeft, ExternalLink, Loader2, MoreHorizontal, Pin, RotateCw, SquarePlus, Trash2, Upload, X } from 'lucide-react';
import { Button, Menu, MenuItem, useMenuButton } from './ui.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';
import { externalUrl, paneSections, rangeLabel } from './chat-context.js';
import { CONTEXT_ACCEPT, retryContextDoc } from './context-docs.js';
import { useContextProcessing } from './context-doc-pages.js';
import { RefIcon } from './ContextChips.jsx';
import SourceReader from './SourceReader.jsx';
import { pdfKeyOfRef } from './pdf-source.js';
import { addFileToCanvas, canvasFamilyOf } from './file-to-canvas.js';
import { wsHeaders } from './api.js';
import { studyReaderPin } from './study-state.js';

// The Context panel (UI-26, owner brief 2026-10-22 sections 1-4): the companion column's Context view. Its header (PanelHeader
// CompanionHeader) holds "Context", the one blue Upload (ContextUpload below) and Close. The body is either the file list or
// one file's reader, never both: a filename opens its reader in place of the list, "Back to Files" returns. Each row: file icon,
// the name (the full name as tooltip and in File options), its metadata, then "Use in this chat" (this conversation's
// attachment) and File options (a popover: the full name, Include in new chats - the canvas default, a setting apart from this
// chat - Add to canvas, and Remove from context with a short confirmation). Viewing never attaches, and Close never detaches.
const ICON_BUTTON = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent/35';
const CHECK = 'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1 text-xs whitespace-nowrap text-ink-2 hover:text-ink has-[:disabled]:cursor-default has-[:disabled]:opacity-40';
const BOX = 'h-3.5 w-3.5 shrink-0 cursor-pointer accent-(--action-blue) disabled:cursor-default';
const OPTIONS = 'inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs whitespace-nowrap text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent/35 disabled:opacity-40 aria-expanded:bg-hover aria-expanded:text-ink';
const POPOVER_WIDTH = 288; // w-72

// A document row's metadata: its kind, pages, size and upload day, from the context-documents list (learn-context-docs.js);
// other rows (canvas cards, a source opened from a citation) carry no document and show none.
const KINDS = { pdf: 'PDF', text: 'Text', markdown: 'Markdown', md: 'Markdown', txt: 'Text' };
const bytes = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);
export const docMeta = doc => {
  if (!doc) return '';
  const day = doc.created_at ? new Date(`${String(doc.created_at).replace(' ', 'T')}${/Z|[+-]\d\d:?\d\d$/.test(doc.created_at) ? '' : 'Z'}`) : null;
  return [KINDS[doc.kind] || (doc.kind ? String(doc.kind).toUpperCase() : ''), Number.isInteger(doc.pages) && doc.pages > 0 ? `${doc.pages} page${doc.pages === 1 ? '' : 's'}` : '',
    Number.isFinite(doc.size) && doc.size > 0 ? bytes(doc.size) : '', day && !Number.isNaN(day.getTime()) ? day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''].filter(Boolean).join(' · ');
};
const fileCount = n => `${n} file${n === 1 ? '' : 's'}`;
// PDF-02 status (C:/s/spec/pdfctx/contract-pdf-status.md; a missing field is a legacy row, ready): how questions read a long
// PDF, its pages without text, or why it failed (the server's message, verbatim, naming the next step). A failed one's pages
// are not read yet, so it never claims questions read them.
export const docNote = doc => [doc?.reads === 'pages' && doc?.status !== 'failed' ? 'Questions read the relevant pages' : '', doc?.noText > 0 ? `${doc.noText} page${doc.noText === 1 ? '' : 's'} without text` : ''].filter(Boolean).join(' · ');
// Reading a PDF's pages in this tab (context-doc-pages.js): "Reading pages 120 of 312", or Uploading before the count is known.
const readingLabel = job => (job?.total ? `Reading pages ${job.done} of ${job.total}` : '');

// Upload, in the Context header beside Close (LearnPage passes it to CompanionHeader while Context shows).
export function ContextUpload() {
  const chat = useChatWorkspace(), picker = useRef(null);
  if (!chat) return null;
  return <>
    <input ref={picker} type="file" accept={CONTEXT_ACCEPT} className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; chat.context.upload(file); }} />
    <Button variant="action" size="sm" data-materials-upload onClick={() => picker.current?.click()}><Upload size={14} aria-hidden /> Upload</Button>
  </>;
}

// Use in this chat: this conversation's attachment, the same state as its composer chip and the refs the next message sends.
function UseInChat({ item, name, disabled, onChange }) {
  return <label className={CHECK}>
    <input type="checkbox" data-material-action="chat" checked={!!item.attached} disabled={disabled} onChange={onChange}
      aria-label={`Use ${name} in this chat`} className={BOX} />Use in this chat
  </label>;
}

// File options: a small popover beside its button (ui.jsx Menu: kept inside the window, closed by a press outside, by Escape -
// which hands focus back to the button - or when a scroll moves the button). It opens below the button, or above it when the
// window has no room below. Nothing is inserted into the list.
function FileOptions({ item, name, pending, canAdd, onAdd, onContext, onRemove }) {
  const m = useMenuButton(), panel = useRef(null), [confirming, setConfirming] = useState(false), [above, setAbove] = useState(null);
  const doc = item.doc, onCanvas = !!doc?.attached;
  useEffect(() => { if (!m.open) setConfirming(false); }, [m.open]);
  useLayoutEffect(() => {
    if (!m.open) { setAbove(null); return; }
    const box = panel.current?.parentElement, r = m.button.current?.getBoundingClientRect();
    if (!box || !r) return;
    const h = box.offsetHeight;
    setAbove(r.bottom + 4 + h > window.innerHeight - 8 && r.top - 4 - h >= 8 ? h : null);
  }, [m.open, confirming]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = m.open ? m.button.current?.getBoundingClientRect() : null;
  const style = r ? { top: above != null ? r.top - 4 - above : r.bottom + 4, left: Math.max(8, r.right - POPOVER_WIDTH) } : undefined;
  return <>
    <button type="button" {...m.buttonProps} aria-haspopup="dialog" data-material-action="more" disabled={pending}
      aria-label={`File options for ${name}`} title={`File options for ${name}`} className={OPTIONS}>
      {pending ? <Loader2 size={13} aria-hidden className="animate-spin" /> : <MoreHorizontal size={13} aria-hidden />}File options
    </button>
    {m.open && <Menu portal anchor={m.button.current} open onClose={m.onClose} style={style} className="w-72">
      <div ref={panel} role="dialog" aria-label={`File options for ${name}`} data-material-menu data-menu-button-open>
        <p data-material-menu-name className="px-2 pt-1.5 text-sm font-medium break-words text-ink">{name}</p>
        {docMeta(doc) && <p className="px-2 pb-1.5 text-xs text-ink-3">{docMeta(doc)}</p>}
        <div className="my-1 border-t border-line" />
        {/* The canvas default: what NEW chats on this canvas start with. The open chat's own attachment is Use in this chat. */}
        <label className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 hover:bg-hover">
          <input type="checkbox" autoFocus data-material-action="context" checked={onCanvas} disabled={pending} onChange={() => onContext(!onCanvas)} className={`${BOX} mt-0.5`} />
          <span className="min-w-0"><span className="block text-sm text-ink">Include in new chats</span>
            <span data-material-menu-note className="block text-xs text-ink-3">New chats on this canvas start with this file. Your current chat stays unchanged.</span></span>
        </label>
        {canAdd && <MenuItem icon={SquarePlus} data-material-action="canvas" onClick={() => { m.close(); onAdd(); }} className="focus-visible:outline-2 focus-visible:outline-accent/35">Add to canvas</MenuItem>}
        <div className="my-1 border-t border-line" />
        {confirming
          ? <div data-material-remove-confirm role="group" aria-label={`Remove ${name} from context`} className="px-2 py-1.5">
            <p className="pb-2 text-xs text-ink-2">Remove from context? New requests stop reading it. Canvas cards that use it keep working.</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" autoFocus disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button>
              <Button size="sm" variant="danger" data-material-remove-yes disabled={pending} onClick={onRemove}>
                {pending ? <><Loader2 size={13} aria-hidden className="animate-spin" />Removing</> : 'Remove'}</Button>
            </div>
          </div>
          : <MenuItem icon={Trash2} data-material-action="remove" disabled={pending} onClick={() => setConfirming(true)} className="text-danger! focus-visible:outline-2 focus-visible:outline-accent/35">Remove from context</MenuItem>}
      </div>
    </Menu>}
  </>;
}

// onSwitchOff(ref): Use in this chat switched off lets go of any selection holding the same ref (LearnPage), as a chip's x does.
export default function SourcesPane({ onSwitchOff = null }) {
  const chat = useChatWorkspace();
  const active = chat?.sources.active ?? null;
  // Back to Files puts the active source's reader down (the list shows); a newly opened source shows its reader again.
  const [folded, setFolded] = useState(null);
  useEffect(() => setFolded(null), [active]);
  const [menu, setMenu] = useState(false);
  const list = useRef(null), live = useRef(chat);
  live.current = chat;
  // Per row (sourceId): the action running ('context' | 'remove' | 'canvas') or its error.
  const [rows, setRows] = useState({});
  const jobs = useContextProcessing(chat?.canvas);
  if (!chat) return null;
  const { context, sources } = chat;
  const sections = paneSections(context.items, active);
  const url = active && externalUrl(active);
  // One row action at a time per row; a failure stays on that row (role=alert) and the row stays for a retry.
  const run = async (item, action, work) => {
    const key = item.ref.sourceId;
    if (rows[key]?.busy) return;
    setRows(state => ({ ...state, [key]: { busy: action } }));
    try { await work(); setRows(({ [key]: _, ...rest }) => rest); }
    catch (error) {
      setRows(state => ({ ...state, [key]: { error: action === 'remove' ? `Could not remove ${item.ref.name} from context: ${error.message}. Try again from File options.`
        : action === 'retry' ? `Could not read the pages of ${item.ref.name}: ${error.message}` : `Could not change ${item.ref.name}: ${error.message}` } }));
    }
  };
  // Remove from context: membership only - excerpt cards, pages and the file they read stay. On success (context.remove applies
  // the server's answer to every list at once) its reader, if open, goes back to Files, but only on the canvas that asked.
  const remove = item => run(item, 'remove', async () => {
    const canvas = chat.canvas;
    await context.remove(item.doc);
    const now = live.current;
    if (now?.canvas !== canvas) return;
    if (now.sources.active?.sourceId === item.ref.sourceId) now.sources.close();
    // The popover and its row are gone: the focus lands on the list, never on the page body.
    requestAnimationFrame(() => { if (document.activeElement === document.body) list.current?.focus({ preventScroll: true }); });
  });
  // Add to canvas (docs/features/pdf-to-canvas.md): this row's stored PDF - a PDF context document or an uploaded paper.
  // LearnPage owns the canvas and the dialog; the PDF's own bytes are read there, never uploaded again. An imported file
  // (file-to-canvas.js) becomes its family's card through the canvas's own insert.
  const addToCanvas = ref => window.dispatchEvent(new CustomEvent('small:pdf-to-canvas', { detail: { sourceId: ref.sourceId, kind: ref.kind, name: ref.name } }));
  const adder = (item, ref) => {
    const ready = item.state === 'ready', doc = item.doc;
    if (ready && !!pdfKeyOfRef(ref) && (ref.kind !== 'doc' || doc?.kind === 'pdf')) return () => addToCanvas(ref);
    if (ready && !!canvasFamilyOf(ref) && !!chat.canvasOps?.insertCard) return () => run(item, 'canvas', () => addFileToCanvas({ ref, app: chat.canvas, ops: chat.canvasOps, headers: wsHeaders() }));
    return null;
  };
  const toggleChat = item => { if (!item.attached) return context.attach(item.ref); context.detach(item.ref); onSwitchOff?.(item.ref); };
  const options = (item, name, add) => item.doc && <FileOptions item={item} name={name} pending={!!item.removing || rows[item.ref.sourceId]?.busy === 'remove'} canAdd={!!add} onAdd={add}
    onContext={on => run(item, 'context', () => context.canvasContext(item.doc, on))} onRemove={() => remove(item)} />;
  const errorOf = item => { const row = rows[item.ref.sourceId] || {}; return row.error && <p role="alert" data-material-error className="px-3 pb-1.5 text-xs text-danger">{row.error}</p>; };
  const reading = sections.find(section => section.active && folded !== active);

  if (reading) {
    const { item, ref } = reading, name = ref.name, add = adder(item, ref), ready = item.state === 'ready';
    // Pin for study (UI-27): the same pin as the PDF card's menu, offered only when exactly one card on this canvas is this PDF.
    const study = studyReaderPin(), pinTarget = study?.target(ref.sourceId) || null;
    return (
      <div data-sources-pane className="flex min-h-0 flex-1 flex-col">
        <div data-sources-header className="flex shrink-0 flex-col gap-1 border-b border-line px-2 py-1.5">
          <div className="flex items-center gap-1">
            <button type="button" data-back-to-files onClick={() => setFolded(active)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent/35">
              <ArrowLeft size={15} aria-hidden />Back to Files</button>
            <span className="flex-1" />
            {sources.canBack && <button type="button" onClick={sources.back} aria-label="Back to the previous source" title="Back to the previous source" className={ICON_BUTTON}><CornerUpLeft size={15} aria-hidden /></button>}
            {url && <span className="relative">
              <button type="button" onClick={() => setMenu(open => !open)} aria-label="Source actions" title="Source actions" aria-haspopup="menu" aria-expanded={menu} className={ICON_BUTTON}><MoreHorizontal size={16} aria-hidden /></button>
              <Menu open={menu} onClose={() => setMenu(false)} className="top-9 right-0 w-52">
                <MenuItem icon={ExternalLink} onClick={() => { setMenu(false); window.open(url, '_blank', 'noopener'); }}>Open externally</MenuItem>
              </Menu>
            </span>}
          </div>
          {/* The document's title, once: the reader below shows its pages, not the name again. */}
          <div className="flex min-w-0 items-center gap-1.5 px-1">
            <RefIcon kind={active.kind} size={16} className="shrink-0 text-ink-2" />
            <h2 data-context-title className="min-w-0 truncate text-sm font-medium text-ink" title={name}>{name}</h2>
            {rangeLabel(active.range) && <span className="shrink-0 text-xs text-ink-3">{rangeLabel(active.range)}</span>}
          </div>
          {ready && <div data-material-row data-source-id={ref.sourceId} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
            <UseInChat item={item} name={name} disabled={!!item.removing} onChange={() => toggleChat(item)} />
            {/* A source open here but not used in this chat is a preview only (owner review UI-10): it says so. */}
            {!item.attached && <span data-not-attached className="shrink-0 rounded border border-line px-1 text-[11px] text-ink-2">Not attached</span>}
            {add && <Button variant="secondary" size="sm" data-material-action="canvas" disabled={!!rows[ref.sourceId]?.busy} onClick={add}
              aria-label={`Add ${name} to canvas`} title={`Add ${name} to canvas`} className="gap-1 px-2 text-xs">{rows[ref.sourceId]?.busy === 'canvas' ? <Loader2 size={13} aria-hidden className="animate-spin" /> : <SquarePlus size={13} aria-hidden />}Add to canvas</Button>}
            {pinTarget && <Button variant="secondary" size="sm" data-reader-pin-study onClick={() => study.pin(pinTarget)} className="gap-1 px-2 text-xs"><Pin size={13} aria-hidden />Pin for study</Button>}
            <span className="flex-1" />
            {options(item, name, add)}
          </div>}
          {errorOf(item)}
        </div>
        <div ref={list} tabIndex={-1} data-source-reader className="flex min-h-0 flex-1 flex-col px-2 pt-1 outline-none">
          <SourceReader key={ref.sourceId} sourceRef={ref} position={sources.position(ref.sourceId)} onPosition={position => sources.savePosition(ref.sourceId, position)} />
        </div>
      </div>
    );
  }

  return (
    <div data-sources-pane className="flex min-h-0 flex-1 flex-col">
      <div ref={list} tabIndex={-1} data-context-files className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1 outline-none">
        {sections.length > 0 && <p data-context-count aria-live="polite" className="px-3 pt-1 pb-1.5 text-xs text-ink-3">{fileCount(sections.length)}</p>}
        {!sections.length && <p data-context-empty aria-live="polite" className="px-3 py-2 text-xs text-ink-3">No sources yet. Upload a PDF, .txt or .md file, or add cards from the canvas to the chat.</p>}
        <ul aria-label="Files" className="flex flex-col">
          {sections.map(({ key, item, ref, active: isActive }) => {
            const ready = item.state === 'ready', busy = item.state === 'uploading' || item.state === 'processing', failed = item.state === 'failed';
            const name = ref.name, add = adder(item, ref), pending = !!item.removing || rows[ref.sourceId]?.busy === 'remove';
            // A retry reads its pages on this row; an upload's reading shows on its upload row (same name, no id yet).
            const job = item.doc ? jobs.find(entry => entry.id === item.doc.id) : busy ? jobs.find(entry => !entry.id && entry.name === name) : null;
            const reading = !!(item.doc && job) || rows[ref.sourceId]?.busy === 'retry';
            const meta = busy ? readingLabel(job) || (item.state === 'processing' ? 'Processing' : 'Uploading') : pending ? 'Removing' : reading ? readingLabel(job) || 'Reading pages' : docMeta(item.doc);
            const range = rangeLabel(ref.kind === 'excerpt' ? null : ref.range);
            return (
              <li key={key} data-material-row data-source-id={ref.sourceId} data-source-section={isActive ? 'active' : ''} aria-busy={pending || busy || reading || undefined}
                className="@container border-b border-line/70 last:border-b-0">
                {/* Narrower than 30rem the two actions take their own line under the name; the name keeps the row's width. */}
                <div className="flex flex-col px-2 py-1 @[30rem]:flex-row @[30rem]:items-center @[30rem]:gap-2">
                  <button type="button" disabled={!ready} onClick={() => (isActive ? setFolded(null) : chat.openSource(ref))} title={item.error || name}
                    className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent/35 disabled:cursor-default disabled:hover:bg-transparent">
                    {busy || pending || reading ? <Loader2 size={15} aria-hidden className="shrink-0 animate-spin text-ink-3" /> : failed || item.doc?.status === 'failed' ? <CircleAlert size={15} aria-hidden className="shrink-0 text-danger" /> : <RefIcon kind={ref.kind} size={15} className="shrink-0 text-ink-2" />}
                    <span className={`flex min-w-0 flex-1 flex-col leading-tight ${pending ? 'opacity-60' : ''}`}>
                      <span data-material-name title={name} className={`min-w-0 truncate text-sm text-ink ${isActive ? 'font-medium' : ''}`}>{name}</span>
                      {(meta || range) && <span data-material-meta className="truncate text-xs text-ink-3">{[meta, range].filter(Boolean).join(' · ')}</span>}
                    </span>
                  </button>
                  <div data-material-actions className="flex shrink-0 items-center gap-1 pb-1 pl-7 @[30rem]:pb-0 @[30rem]:pl-0">
                    {ready && <UseInChat item={item} name={name} disabled={pending} onChange={() => toggleChat(item)} />}
                    {ready && item.doc?.status === 'failed' && <Button variant="secondary" size="sm" data-material-action="retry" disabled={reading || pending}
                      onClick={() => run(item, 'retry', () => retryContextDoc(chat.canvas, item.doc.id, name))} aria-label={`Retry reading the pages of ${name}`} className="gap-1 px-2 text-xs"><RotateCw size={13} aria-hidden />Retry</Button>}
                    {ready && options(item, name, add)}
                    {ready && !item.doc && add && <Button variant="secondary" size="sm" data-material-action="canvas" disabled={!!rows[ref.sourceId]?.busy} onClick={add}
                      aria-label={`Add ${name} to canvas`} title={`Add ${name} to canvas`} className="gap-1 px-2 text-xs">{rows[ref.sourceId]?.busy === 'canvas' ? <Loader2 size={13} aria-hidden className="animate-spin" /> : <SquarePlus size={13} aria-hidden />}Add to canvas</Button>}
                    {failed && <>
                      <button type="button" onClick={item.retry} aria-label={`Retry uploading ${name}`} title="Retry" className={ICON_BUTTON}><RotateCw size={14} aria-hidden /></button>
                      <button type="button" onClick={item.dismiss} aria-label={`Dismiss ${name}`} title="Dismiss" className={ICON_BUTTON}><X size={14} aria-hidden /></button>
                    </>}
                  </div>
                </div>
                {failed && <p role="alert" className="px-3 pb-1.5 text-xs text-danger">{item.error}</p>}
                {item.doc?.status === 'failed' && !reading && <p role="alert" data-material-doc-error className="px-3 pb-1.5 text-xs text-danger">{item.doc.error?.message || 'This file could not be read.'}</p>}
                {docNote(item.doc) && <p data-material-note className="px-3 pb-1.5 pl-10 text-xs text-ink-3">{docNote(item.doc)}</p>}
                {errorOf(item)}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
