import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, CircleAlert, ExternalLink, List, Loader2, MoreHorizontal, Paperclip, RotateCw, SquarePlus, Unlink, Upload, X } from 'lucide-react';
import { Menu, MenuItem } from './ui.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';
import { externalUrl, paneSections, rangeLabel } from './chat-context.js';
import { CONTEXT_ACCEPT } from './context-docs.js';
import { RefIcon } from './ContextChips.jsx';
import SourceReader from './SourceReader.jsx';
import { pdfKeyOfRef } from './pdf-source.js';
// Remove from canvas context (materials-remove.md), on a line of its own so the header's imports stay as they are.
import { Trash2 } from 'lucide-react';
import { ConfirmDialog } from './ui.jsx';

// Sub-lane A4a owns this file: the Sources pane left of Chat (brief section 6). A1 mounts it, unpadded, as the
// Sources ResizableSidePanel's child. A compact header (the active source's icon and title, Back, All sources, an
// overflow menu, Close), then the canvas's one context collection (chat-context.js items) as collapsible sections. Only
// the expanded section mounts its reader (A4b's SourceReader). Viewing never attaches; each row has its own
// Attach / Detach, and Close never detaches (contract A5).
const ICON_BUTTON = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';

export default function SourcesPane() {
  const chat = useChatWorkspace();
  const active = chat?.sources.active ?? null;
  // The active source folded away (All sources, or its own header); a newly opened source unfolds again.
  const [folded, setFolded] = useState(null);
  useEffect(() => setFolded(null), [active]);
  const [menu, setMenu] = useState(false);
  const picker = useRef(null), body = useRef(null);
  // Remove from canvas context: the row waiting on its confirmation, and per row (sourceId) true while removing or the error.
  const [removing, setRemoving] = useState(null);
  const [removal, setRemoval] = useState({});
  if (!chat) return null;
  const { context, sources, panels } = chat;
  const sections = paneSections(context.items, active);
  const url = active && externalUrl(active);
  const allSources = () => { setFolded(active); body.current?.scrollTo({ top: 0 }); };
  // Add to canvas (docs/features/pdf-to-canvas.md): an uploaded PDF open here - a PDF context document or an uploaded paper.
  // LearnPage owns the canvas and the dialog; the PDF's own bytes are read there, never uploaded again.
  const activeDoc = active && sections.find(section => section.active)?.item.doc;
  const canAdd = !!active && !!pdfKeyOfRef(active) && (active.kind !== 'doc' || activeDoc?.kind === 'pdf');
  const addToCanvas = () => window.dispatchEvent(new CustomEvent('small:pdf-to-canvas', { detail: { sourceId: active.sourceId, kind: active.kind, name: active.name } }));
  const remove = async item => {
    const key = item.ref.sourceId;
    setRemoving(null);
    setRemoval(state => ({ ...state, [key]: true }));
    try { await context.remove(item.doc); setRemoval(({ [key]: _, ...rest }) => rest); }
    catch (error) { setRemoval(state => ({ ...state, [key]: `Could not remove ${item.ref.name}: ${error.message}` })); }
  };
  return (
    <div data-sources-pane className="flex min-h-0 flex-1 flex-col">
      <div data-sources-header className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
        {sources.canBack && <button type="button" onClick={sources.back} aria-label="Back" title="Back" className={ICON_BUTTON}><ArrowLeft size={16} aria-hidden /></button>}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
          {active ? <RefIcon kind={active.kind} size={16} className="shrink-0 text-ink-2" /> : null}
          <h2 className="min-w-0 truncate text-sm font-medium text-ink" title={active?.name}>{active ? active.name : 'Sources'}</h2>
          {active && rangeLabel(active.range) && <span className="shrink-0 text-xs text-ink-3">{rangeLabel(active.range)}</span>}
        </div>
        {canAdd && <button type="button" data-source-add-canvas onClick={addToCanvas} title="Add to canvas"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink"><SquarePlus size={14} aria-hidden /> Add to canvas</button>}
        {active && <button type="button" onClick={allSources} aria-label="All sources" title="All sources" className={ICON_BUTTON}><List size={16} aria-hidden /></button>}
        {active && (
          <span className="relative">
            <button type="button" onClick={() => setMenu(open => !open)} aria-label="Source actions" title="Source actions" aria-haspopup="menu" aria-expanded={menu} className={ICON_BUTTON}><MoreHorizontal size={16} aria-hidden /></button>
            <Menu open={menu} onClose={() => setMenu(false)} className="top-9 right-0 w-52">
              {url && <MenuItem icon={ExternalLink} onClick={() => { setMenu(false); window.open(url, '_blank', 'noopener'); }}>Open externally</MenuItem>}
              {context.isAttached(active)
                ? <MenuItem icon={Unlink} onClick={() => { setMenu(false); context.detach(active); }}>Detach from this chat</MenuItem>
                : <MenuItem icon={Paperclip} onClick={() => { setMenu(false); context.attach(active); }}>Attach to this chat</MenuItem>}
            </Menu>
          </span>
        )}
        <button type="button" data-sources-close onClick={panels.closeSources} aria-label="Close sources" title="Close sources" className={ICON_BUTTON}><X size={16} aria-hidden /></button>
      </div>
      <div ref={body} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
        <div className="flex shrink-0 items-center justify-between gap-2 px-1 pb-1">
          <span className="text-[11px] font-semibold tracking-wider text-ink-3 uppercase">Materials</span>
          <input ref={picker} type="file" accept={CONTEXT_ACCEPT} className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; context.upload(file); }} />
          <button type="button" onClick={() => picker.current?.click()} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink">
            <Upload size={14} aria-hidden /> Upload
          </button>
        </div>
        {!sections.length && <p className="px-1 py-2 text-xs text-ink-3">No sources yet. Upload a PDF, .txt or .md file, or add cards from the canvas to the chat.</p>}
        {sections.map(({ key, item, ref, active: isActive }) => {
          const open = isActive && folded !== active, ready = item.state === 'ready', busy = !ready && item.state !== 'failed';
          const toggle = () => { if (isActive) setFolded(open ? active : null); else chat.openSource(ref); };
          return (
            <section key={key} data-source-section={isActive ? 'active' : ''} className={open ? 'flex min-h-80 flex-1 flex-col' : 'shrink-0'}>
              <div className="flex items-center gap-1 rounded-md hover:bg-hover">
                <button type="button" aria-expanded={open} disabled={!ready} onClick={toggle} title={item.error || ref.name}
                  className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left text-sm text-ink disabled:cursor-default">
                  <ChevronRight size={14} aria-hidden className={`shrink-0 text-ink-3 transition-transform ${open ? 'rotate-90' : ''} ${ready ? '' : 'invisible'}`} />
                  {busy ? <Loader2 size={14} aria-hidden className="shrink-0 animate-spin text-ink-3" /> : item.state === 'failed' ? <CircleAlert size={14} aria-hidden className="shrink-0 text-red-700" /> : <RefIcon kind={ref.kind} />}
                  <span className={`min-w-0 truncate ${isActive ? 'font-medium' : ''}`}>{ref.name}</span>
                  {rangeLabel(ref.range) && <span className="shrink-0 text-xs text-ink-3">{rangeLabel(ref.range)}</span>}
                  {busy && <span className="shrink-0 text-xs text-ink-3">{item.state === 'processing' ? 'Processing' : 'Uploading'}</span>}
                </button>
                {ready && (item.attached
                  ? <button type="button" onClick={() => context.detach(item.ref)} aria-label={`Detach ${item.ref.name} from this chat`} title="Detach from this chat"
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:bg-white"><Paperclip size={13} aria-hidden /> Detach</button>
                  : <button type="button" onClick={() => context.attach(item.ref)} aria-label={`Attach ${item.ref.name} to this chat`} title="Attach to this chat"
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-2 hover:bg-white hover:text-ink"><Paperclip size={13} aria-hidden /> Attach</button>)}
                {ready && item.doc && <button type="button" data-source-remove onClick={() => setRemoving(item)} disabled={removal[ref.sourceId] === true}
                  aria-label="Remove from canvas context" title="Remove from canvas context"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-white hover:text-ink disabled:opacity-40">
                  {removal[ref.sourceId] === true ? <Loader2 size={14} aria-hidden className="animate-spin" /> : <Trash2 size={14} aria-hidden />}</button>}
                {item.state === 'failed' && <>
                  <button type="button" onClick={item.retry} aria-label={`Retry uploading ${ref.name}`} title="Retry" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-white hover:text-ink"><RotateCw size={14} aria-hidden /></button>
                  <button type="button" onClick={item.dismiss} aria-label={`Dismiss ${ref.name}`} title="Dismiss" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-white hover:text-ink"><X size={14} aria-hidden /></button>
                </>}
              </div>
              {item.state === 'failed' && <p role="alert" className="px-7 pb-1 text-xs text-red-700">{item.error}</p>}
              {typeof removal[ref.sourceId] === 'string' && <p role="alert" data-source-remove-error className="px-7 pb-1 text-xs text-red-700">{removal[ref.sourceId]}</p>}
              {open && (
                <div data-source-reader className="flex min-h-0 flex-1 flex-col pt-1">
                  <SourceReader key={ref.sourceId} sourceRef={ref} position={sources.position(ref.sourceId)} onPosition={position => sources.savePosition(ref.sourceId, position)} />
                </div>
              )}
            </section>
          );
        })}
      </div>
      {removing && <ConfirmDialog title="Remove from canvas context?" confirmLabel="Remove"
        body={`${removing.ref.name} leaves this canvas's Materials and future AI requests. Cards and pages made from it stay on the canvas, and earlier messages are unchanged.`}
        onConfirm={() => remove(removing)} onCancel={() => setRemoving(null)} />}
    </div>
  );
}
