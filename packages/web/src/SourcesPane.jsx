import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, CircleAlert, ExternalLink, List, Loader2, MessageSquarePlus, MoreHorizontal, Paperclip, RotateCw, SquarePlus, Trash2, Upload, X } from 'lucide-react';
import { Button, ConfirmDialog, Menu, MenuItem } from './ui.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';
import { externalUrl, paneSections, rangeLabel } from './chat-context.js';
import { CONTEXT_ACCEPT } from './context-docs.js';
import { RefIcon } from './ContextChips.jsx';
import SourceReader from './SourceReader.jsx';
import { pdfKeyOfRef } from './pdf-source.js';
import { addFileToCanvas, canvasFamilyOf } from './file-to-canvas.js';
import { wsHeaders } from './api.js';

// Sub-lane A4a owns this file: the Sources pane left of Chat (brief section 6). A1 mounts it, unpadded, as the
// Sources ResizableSidePanel's child. A compact header while a source is open (its icon and title, Back, All sources, Open
// externally), then the blue Upload and the canvas's one context collection (chat-context.js items) as collapsible rows with
// their kind, size and date - no Sources or Materials heading (owner brief 2026-10-16 item 4). Only the expanded row mounts its reader (A4b's SourceReader). Viewing never attaches, and Close never detaches
// (contract A5). Every document action sits on its own row and names that row's document (pdf-materials-refinement.md
// sections 1-5), never the one open in the reader: canvas context, Add to canvas, this chat, then Remove from Materials.
const ICON_BUTTON = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';
// A row action: a visible surface at rest (border and fill), stronger on hover; a pressed toggle is accent-filled and aria-pressed.
// The pressed fill is its own class string, never a variant on the resting one: in dark mode index.css re-pins --color-white to
// white inside any class naming bg-accent, which would turn the resting bg-white surface white.
const ROW_ACTION = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border focus-visible:outline-2 focus-visible:outline-accent/35 disabled:cursor-default disabled:opacity-40';
// Use in this chat: a labelled toggle, accent-filled while this chat uses the document (aria-pressed). Add to canvas is the
// shared inverse Button (ink fill: black in light, white in dark), the same in Context, Files and Graph (owner review UI-10).
const USE_TOGGLE = 'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-accent/35 disabled:opacity-40';
const USE_ON = 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20';
const USE_OFF = 'border-line bg-white text-ink-2 hover:border-line-strong hover:bg-hover hover:text-ink';
const ADD_CANVAS = 'shrink-0 gap-1 px-1.5 text-xs';
// The removal icon is red at rest and on hover (its own string: rowAction's text colours would override it).
const REMOVE = 'border-line bg-white text-danger hover:border-line-strong hover:bg-hover';
const rowAction = (pressed = false) => `${ROW_ACTION} ${pressed ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20' : 'border-line bg-white text-ink-2 hover:border-line-strong hover:bg-hover hover:text-ink'}`;

// A document row's metadata: its kind, size and upload day, from the context-documents list (learn-context-docs.js); other
// rows (canvas cards, a source opened from a citation) carry no document and show none.
const KINDS = { pdf: 'PDF', text: 'Text', markdown: 'Markdown', md: 'Markdown', txt: 'Text' };
const bytes = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);
export const docMeta = doc => {
  if (!doc) return '';
  const day = doc.created_at ? new Date(`${String(doc.created_at).replace(' ', 'T')}${/Z|[+-]\d\d:?\d\d$/.test(doc.created_at) ? '' : 'Z'}`) : null;
  return [KINDS[doc.kind] || (doc.kind ? String(doc.kind).toUpperCase() : ''), Number.isFinite(doc.size) && doc.size > 0 ? bytes(doc.size) : '', day && !Number.isNaN(day.getTime()) ? day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''].filter(Boolean).join(' · ');
};

// onSwitchOff(ref): Use in this chat switched off lets go of any selection holding the same ref (LearnPage), as a chip's x does.
export default function SourcesPane({ onSwitchOff = null }) {
  const chat = useChatWorkspace();
  const active = chat?.sources.active ?? null;
  // The active source folded away (All sources, or its own header); a newly opened source unfolds again.
  const [folded, setFolded] = useState(null);
  useEffect(() => setFolded(null), [active]);
  const [menu, setMenu] = useState(false);
  const picker = useRef(null), body = useRef(null);
  // Remove from Materials waiting on its confirmation; per row (sourceId) the action running ('context' | 'remove') or its error.
  const [removing, setRemoving] = useState(null);
  const [rows, setRows] = useState({});
  // The open row menu: { key, item, top, left, anchor } (portaled, so the list's scroll never clips it).
  const [rowMenu, setRowMenu] = useState(null);
  if (!chat) return null;
  const { context, sources } = chat;
  const sections = paneSections(context.items, active);
  const url = active && externalUrl(active);
  const allSources = () => { setFolded(active); body.current?.scrollTo({ top: 0 }); };
  // One row action at a time per row; a failure stays on that row (role=alert) and the row stays for a retry.
  const run = async (item, action, work) => {
    const key = item.ref.sourceId;
    setRows(state => ({ ...state, [key]: { busy: action } }));
    try { await work(); setRows(({ [key]: _, ...rest }) => rest); }
    catch (error) { setRows(state => ({ ...state, [key]: { error: `Could not ${action === 'remove' ? 'remove' : 'change'} ${item.ref.name}: ${error.message}` } })); }
  };
  const remove = item => {
    setRemoving(null);
    return run(item, 'remove', async () => {
      await context.remove(item.doc);
      // Open in the reader as a whole, it would stay listed as the active source: put the reader down.
      if (active?.sourceId === item.ref.sourceId && !active.range) sources.close();
    });
  };
  // Add to canvas (docs/features/pdf-to-canvas.md): this row's stored PDF - a PDF context document or an uploaded paper.
  // LearnPage owns the canvas and the dialog; the PDF's own bytes are read there, never uploaded again.
  const addToCanvas = ref => window.dispatchEvent(new CustomEvent('small:pdf-to-canvas', { detail: { sourceId: ref.sourceId, kind: ref.kind, name: ref.name } }));
  // A row action never also expands the row or switches the reader.
  const act = work => event => { event.stopPropagation(); work(); };
  return (
    <div data-sources-pane className="flex min-h-0 flex-1 flex-col">
      {(active || sources.canBack) && <div data-sources-header className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
        {sources.canBack && <button type="button" onClick={sources.back} aria-label="Back" title="Back" className={ICON_BUTTON}><ArrowLeft size={16} aria-hidden /></button>}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
          {active ? <RefIcon kind={active.kind} size={16} className="shrink-0 text-ink-2" /> : null}
          {active && <h2 className="min-w-0 truncate text-sm font-medium text-ink" title={active.name}>{active.name}</h2>}
          {active && rangeLabel(active.range) && <span className="shrink-0 text-xs text-ink-3">{rangeLabel(active.range)}</span>}
        </div>
        {active && <button type="button" onClick={allSources} aria-label="All sources" title="All sources" className={ICON_BUTTON}><List size={16} aria-hidden /></button>}
        {url && (
          <span className="relative">
            <button type="button" onClick={() => setMenu(open => !open)} aria-label="Source actions" title="Source actions" aria-haspopup="menu" aria-expanded={menu} className={ICON_BUTTON}><MoreHorizontal size={16} aria-hidden /></button>
            <Menu open={menu} onClose={() => setMenu(false)} className="top-9 right-0 w-52">
              <MenuItem icon={ExternalLink} onClick={() => { setMenu(false); window.open(url, '_blank', 'noopener'); }}>Open externally</MenuItem>
            </Menu>
          </span>
        )}
      </div>}
      <div ref={body} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
        <div className="flex shrink-0 items-center justify-end gap-2 px-1 pb-2">
          <input ref={picker} type="file" accept={CONTEXT_ACCEPT} className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; context.upload(file); }} />
          <Button variant="action" size="sm" data-materials-upload onClick={() => picker.current?.click()}>
            <Upload size={14} aria-hidden /> Upload
          </Button>
        </div>
        {!sections.length && <p className="px-1 py-2 text-xs text-ink-3">No sources yet. Upload a PDF, .txt or .md file, or add cards from the canvas to the chat.</p>}
        {sections.map(({ key, item, ref, active: isActive }) => {
          const open = isActive && folded !== active, ready = item.state === 'ready', busy = !ready && item.state !== 'failed';
          const toggle = () => { if (isActive) setFolded(open ? active : null); else chat.openSource(ref); };
          const name = ref.name, doc = item.doc, row = rows[ref.sourceId] || {};
          const canAdd = ready && !!pdfKeyOfRef(ref) && (ref.kind !== 'doc' || doc?.kind === 'pdf');
          // An imported file (file-to-canvas.js): its stored source becomes a card through the canvas's own insert, so the board
          // save records its reference; this row's chat and context state stay as they are.
          const canAddFile = ready && !canAdd && !!canvasFamilyOf(ref) && !!chat.canvasOps?.insertCard;
          const onCanvas = !!doc?.attached;
          return (
            <section key={key} data-source-section={isActive ? 'active' : ''} className={open ? 'flex max-h-[70vh] min-h-0 shrink-0 flex-col' : 'shrink-0'}>
              {/* Narrower than 34rem, the actions take a second line of their own under the name, never a random wrap. */}
              <div data-material-row data-source-id={ref.sourceId} className="@container rounded-md hover:bg-hover">
                <div className="flex flex-col @[34rem]:flex-row @[34rem]:items-center @[34rem]:gap-1">
                  <button type="button" aria-expanded={open} disabled={!ready} onClick={toggle} title={item.error || name}
                    className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left text-sm text-ink disabled:cursor-default">
                    <ChevronRight size={14} aria-hidden className={`shrink-0 text-ink-3 transition-transform ${open ? 'rotate-90' : ''} ${ready ? '' : 'invisible'}`} />
                    {busy ? <Loader2 size={14} aria-hidden className="shrink-0 animate-spin text-ink-3" /> : item.state === 'failed' ? <CircleAlert size={14} aria-hidden className="shrink-0 text-red-700" /> : <RefIcon kind={ref.kind} />}
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span data-material-name title={name} className={`min-w-0 truncate ${isActive ? 'font-medium' : ''}`}>{name}</span>
                      {docMeta(doc) && <span data-material-meta className="truncate text-[11px] text-ink-3">{docMeta(doc)}</span>}
                    </span>
                    {rangeLabel(ref.kind === 'excerpt' ? null : ref.range) && <span className="shrink-0 text-xs text-ink-3">{rangeLabel(ref.kind === 'excerpt' ? null : ref.range)}</span>}
                    {busy && <span className="shrink-0 text-xs text-ink-3">{item.state === 'processing' ? 'Processing' : 'Uploading'}</span>}
                    {/* A source open here but not used in this chat is a preview only (owner review UI-10): it says so. */}
                    {open && !item.attached && <span data-not-attached className="shrink-0 rounded border border-line px-1 text-[11px] text-ink-2">Not attached</span>}
                  </button>
                  <div data-material-actions className="flex shrink-0 flex-wrap items-center gap-1 pb-1 pl-1 @[34rem]:pr-1 @[34rem]:pb-0 @[34rem]:pl-0">
                    {/* Use in this chat (owner review UI-10, 2026-10-21): the one toggle, this conversation's attachment - the same state
                        as its composer chip and the refs the next message sends. */}
                    {ready && <button type="button" data-material-action="chat" aria-pressed={!!item.attached}
                      onClick={act(() => { if (!item.attached) return context.attach(item.ref); context.detach(item.ref); onSwitchOff?.(item.ref); })}
                      aria-label={`Use ${name} in this chat`} title={`Use ${name} in this chat`}
                      className={`${USE_TOGGLE} ${item.attached ? USE_ON : USE_OFF}`}>{item.attached ? <Check size={13} aria-hidden /> : <MessageSquarePlus size={13} aria-hidden />}Use in this chat</button>}
                    {canAdd && <Button variant="inverse" size="sm" data-material-action="canvas" onClick={act(() => addToCanvas(ref))}
                      aria-label={`Add ${name} to canvas`} title={`Add ${name} to canvas`} className={ADD_CANVAS}><SquarePlus size={13} aria-hidden className="@max-[22rem]:hidden" />Add to canvas</Button>}
                    {canAddFile && <Button variant="inverse" size="sm" data-material-action="canvas" disabled={!!row.busy}
                      onClick={act(() => run(item, 'canvas', () => addFileToCanvas({ ref, app: chat.canvas, ops: chat.canvasOps, headers: wsHeaders() })))}
                      aria-label={`Add ${name} to canvas`} title={`Add ${name} to canvas`} className={ADD_CANVAS}>{row.busy === 'canvas' ? <Loader2 size={13} aria-hidden className="animate-spin" /> : <SquarePlus size={13} aria-hidden className="@max-[22rem]:hidden" />}Add to canvas</Button>}
                    {/* The canvas default is its own scope, apart from this chat: it decides what NEW chats on this canvas start with. */}
                    {ready && doc && <button type="button" data-material-action="more" aria-haspopup="menu" aria-expanded={rowMenu?.key === key} disabled={!!row.busy}
                      onClick={event => { event.stopPropagation(); const box = event.currentTarget.getBoundingClientRect(); setRowMenu(open => (open?.key === key ? null : { key, item, top: box.bottom + 4, left: Math.max(8, box.right - 256), anchor: event.currentTarget })); }}
                      aria-label={`More actions for ${name}`} title={`More actions for ${name}`} className={rowAction()}>{row.busy === 'context' ? <Loader2 size={14} aria-hidden className="animate-spin" /> : <MoreHorizontal size={14} aria-hidden />}</button>}
                    {ready && doc && <>
                      <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-line @max-[22rem]:hidden" />
                      <button type="button" data-material-action="remove" onClick={act(() => setRemoving(item))} disabled={!!row.busy}
                        aria-label={`Remove ${name} from Materials`} title={`Remove ${name} from Materials`}
                        className={`${ROW_ACTION} ${REMOVE}`}>{row.busy === 'remove' ? <Loader2 size={14} aria-hidden className="animate-spin" /> : <Trash2 size={14} aria-hidden />}</button>
                    </>}
                    {item.state === 'failed' && <>
                      <button type="button" onClick={act(item.retry)} aria-label={`Retry uploading ${name}`} title="Retry" className={rowAction()}><RotateCw size={14} aria-hidden /></button>
                      <button type="button" onClick={act(item.dismiss)} aria-label={`Dismiss ${name}`} title="Dismiss" className={rowAction()}><X size={14} aria-hidden /></button>
                    </>}
                  </div>
                </div>
                {item.state === 'failed' && <p role="alert" className="px-7 pb-1 text-xs text-red-700">{item.error}</p>}
                {row.error && <p role="alert" data-material-error className="px-7 pb-1 text-xs text-red-700">{row.error}</p>}
              </div>
              {open && (
                <div data-source-reader className="flex min-h-0 flex-1 flex-col pt-1">
                  <SourceReader key={ref.sourceId} sourceRef={ref} position={sources.position(ref.sourceId)} onPosition={position => sources.savePosition(ref.sourceId, position)} />
                </div>
              )}
            </section>
          );
        })}
      </div>
      {rowMenu && (() => { const { item } = rowMenu, doc = item.doc, onCanvas = !!doc?.attached; return (
        <Menu portal anchor={rowMenu.anchor} open onClose={() => { rowMenu.anchor?.focus(); setRowMenu(null); }} style={{ top: rowMenu.top, left: rowMenu.left }} className="w-64">
          {/* Keyboard: the item takes the focus when the menu opens; Escape or a choice hands it back to More. */}
          <div data-material-menu>
            <MenuItem autoFocus role="menuitemcheckbox" aria-checked={onCanvas} data-material-action="context" icon={onCanvas ? Check : Paperclip} hint="Canvas default"
              onClick={() => { rowMenu.anchor?.focus(); setRowMenu(null); run(item, 'context', () => context.canvasContext(doc, !onCanvas)); }}
              aria-label={`Include ${item.ref.name} in new chats on this canvas`} title={`Include ${item.ref.name} in new chats on this canvas`} className="focus-visible:outline-2 focus-visible:outline-accent/35">Include in new chats</MenuItem>
            <p data-material-menu-note className="px-2 pt-0.5 pb-1.5 text-xs text-ink-3">New chats on this canvas start with it. This chat is unchanged.</p>
          </div>
        </Menu>); })()}
      {/* The wrapper takes the dialog's own overlay box (fixed, full screen), so the confirmation is one visible element. */}
      {removing && <div data-material-remove-confirm className="fixed inset-0 z-50">
        <ConfirmDialog title="Remove from Materials?" confirmLabel="Remove from Materials"
          body={`${removing.ref.name} is removed from Materials and from future AI requests. Canvas cards and pages that use it keep working, earlier messages stay as they are, and the file is not deleted.`}
          onConfirm={() => remove(removing)} onCancel={() => setRemoving(null)} />
      </div>}
    </div>
  );
}
