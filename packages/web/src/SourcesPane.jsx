import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, CircleAlert, ExternalLink, List, Loader2, MessageSquareCheck, MessageSquarePlus, MoreHorizontal, Paperclip, RotateCw, SquarePlus, Trash2, Upload, X } from 'lucide-react';
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
// Sources ResizableSidePanel's child. A compact header (the active source's icon and title, Back, All sources, Open
// externally, Close), then Materials: Upload, and the canvas's one context collection (chat-context.js items) as collapsible
// rows. Only the expanded row mounts its reader (A4b's SourceReader). Viewing never attaches, and Close never detaches
// (contract A5). Every document action sits on its own row and names that row's document (pdf-materials-refinement.md
// sections 1-5), never the one open in the reader: canvas context, Add to canvas, this chat, then Remove from Materials.
const ICON_BUTTON = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';
// A row action: a visible surface at rest (border and fill), stronger on hover; a pressed toggle is accent-filled and aria-pressed.
// The pressed fill is its own class string, never a variant on the resting one: in dark mode index.css re-pins --color-white to
// white inside any class naming bg-accent, which would turn the resting bg-white surface white.
const ROW_ACTION = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border focus-visible:outline-2 focus-visible:outline-accent/35 disabled:cursor-default disabled:opacity-40';
const rowAction = (pressed = false) => `${ROW_ACTION} ${pressed ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20' : 'border-line bg-white text-ink-2 hover:border-line-strong hover:bg-hover hover:text-ink'}`;

export default function SourcesPane() {
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
      <div data-sources-header className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
        {sources.canBack && <button type="button" onClick={sources.back} aria-label="Back" title="Back" className={ICON_BUTTON}><ArrowLeft size={16} aria-hidden /></button>}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
          {active ? <RefIcon kind={active.kind} size={16} className="shrink-0 text-ink-2" /> : null}
          <h2 className="min-w-0 truncate text-sm font-medium text-ink" title={active?.name}>{active ? active.name : 'Sources'}</h2>
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
      </div>
      <div ref={body} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
        <div className="flex shrink-0 items-center justify-between gap-2 px-1 pb-1">
          <span className="text-[11px] font-semibold tracking-wider text-ink-3 uppercase">Materials</span>
          <input ref={picker} type="file" accept={CONTEXT_ACCEPT} className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; context.upload(file); }} />
          {/* border-[1px]: the secondary variant's border loses to its base border-0 in the built CSS; a local width shows it. */}
          <Button variant="secondary" size="sm" data-materials-upload onClick={() => picker.current?.click()} className="border-[1px]">
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
            <section key={key} data-source-section={isActive ? 'active' : ''} className={open ? 'flex min-h-80 flex-1 flex-col' : 'shrink-0'}>
              {/* Narrower than 22rem, the actions take a second line of their own under the name, never a random wrap. */}
              <div data-material-row data-source-id={ref.sourceId} className="@container rounded-md hover:bg-hover">
                <div className="flex flex-col @[22rem]:flex-row @[22rem]:items-center @[22rem]:gap-1">
                  <button type="button" aria-expanded={open} disabled={!ready} onClick={toggle} title={item.error || name}
                    className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left text-sm text-ink disabled:cursor-default">
                    <ChevronRight size={14} aria-hidden className={`shrink-0 text-ink-3 transition-transform ${open ? 'rotate-90' : ''} ${ready ? '' : 'invisible'}`} />
                    {busy ? <Loader2 size={14} aria-hidden className="shrink-0 animate-spin text-ink-3" /> : item.state === 'failed' ? <CircleAlert size={14} aria-hidden className="shrink-0 text-red-700" /> : <RefIcon kind={ref.kind} />}
                    <span data-material-name title={name} className={`min-w-0 truncate ${isActive ? 'font-medium' : ''}`}>{name}</span>
                    {rangeLabel(ref.range) && <span className="shrink-0 text-xs text-ink-3">{rangeLabel(ref.range)}</span>}
                    {busy && <span className="shrink-0 text-xs text-ink-3">{item.state === 'processing' ? 'Processing' : 'Uploading'}</span>}
                  </button>
                  <div data-material-actions className="flex shrink-0 items-center gap-1 pb-1 pl-7 @[22rem]:pr-1 @[22rem]:pb-0 @[22rem]:pl-0">
                    {ready && doc && <button type="button" data-material-action="context" aria-pressed={onCanvas} disabled={!!row.busy}
                      onClick={act(() => run(item, 'context', () => context.canvasContext(doc, !onCanvas)))}
                      aria-label={`${onCanvas ? 'Detach' : 'Attach'} ${name} ${onCanvas ? 'from' : 'to'} canvas context`} title={`${onCanvas ? 'Detach' : 'Attach'} ${name} ${onCanvas ? 'from' : 'to'} canvas context`}
                      className={rowAction(onCanvas)}>{row.busy === 'context' ? <Loader2 size={14} aria-hidden className="animate-spin" /> : <Paperclip size={14} aria-hidden />}</button>}
                    {canAdd && <button type="button" data-material-action="canvas" onClick={act(() => addToCanvas(ref))}
                      aria-label={`Add ${name} to canvas`} title={`Add ${name} to canvas`} className={rowAction()}><SquarePlus size={14} aria-hidden /></button>}
                    {canAddFile && <button type="button" data-material-action="canvas" disabled={!!row.busy}
                      onClick={act(() => run(item, 'canvas', () => addFileToCanvas({ ref, app: chat.canvas, ops: chat.canvasOps, headers: wsHeaders() })))}
                      aria-label={`Add ${name} to canvas`} title={`Add ${name} to canvas`} className={rowAction()}>{row.busy === 'canvas' ? <Loader2 size={14} aria-hidden className="animate-spin" /> : <SquarePlus size={14} aria-hidden />}</button>}
                    {ready && <button type="button" data-material-action="chat" aria-pressed={!!item.attached}
                      onClick={act(() => (item.attached ? context.detach(item.ref) : context.attach(item.ref)))}
                      aria-label={item.attached ? `Remove ${name} from this chat` : `Attach ${name} to this chat`} title={item.attached ? `Remove ${name} from this chat` : `Attach ${name} to this chat`}
                      className={rowAction(!!item.attached)}>{item.attached ? <MessageSquareCheck size={14} aria-hidden /> : <MessageSquarePlus size={14} aria-hidden />}</button>}
                    {ready && doc && <>
                      <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-line" />
                      <button type="button" data-material-action="remove" onClick={act(() => setRemoving(item))} disabled={!!row.busy}
                        aria-label={`Remove ${name} from Materials`} title={`Remove ${name} from Materials`}
                        className={rowAction()}>{row.busy === 'remove' ? <Loader2 size={14} aria-hidden className="animate-spin" /> : <Trash2 size={14} aria-hidden />}</button>
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
      {/* The wrapper takes the dialog's own overlay box (fixed, full screen), so the confirmation is one visible element. */}
      {removing && <div data-material-remove-confirm className="fixed inset-0 z-50">
        <ConfirmDialog title="Remove from Materials?" confirmLabel="Remove from Materials"
          body={`${removing.ref.name} is removed from Materials and from future AI requests. Canvas cards and pages that use it keep working, earlier messages stay as they are, and the file is not deleted.`}
          onConfirm={() => remove(removing)} onCancel={() => setRemoving(null)} />
      </div>}
    </div>
  );
}
