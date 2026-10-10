import { useEffect, useState } from 'react';
import { ChevronRight, Folder, FolderOpen, MoreHorizontal, Palette, PenLine, Trash2 } from 'lucide-react';
import { api, navigate } from './api.js';
import { chipHref, libraryHref } from './library-filter.js';
import { DRAG_TYPE, FOLDER_COLORS, NAME_MAX, cleanName, deleteCopy, folderCounts, folderInk, itemsLabel, nextColor } from './library-folders.js';
import { menuAt } from './home/LearningCard.jsx';
import { ConfirmDialog, EmptyState, IconBtn, Input, Menu, MenuItem, toast } from './ui.jsx';

// Library folders (docs/features/library-folders.md, owner 2026-10-09): flat folders in your own Library, for canvases and
// projects. The Library page only places what lives here: the tiles, the open folder's crumb and title, the folder ⋮
// (Rename, Colour, Delete), the New folder and Rename dialogs and the Delete confirm. The card's Move to folder rows are
// in home/CardMenu.jsx, fed by the same hook. Nothing here reaches Home, Explore, a share or a profile.
const EMPTY = { loaded: false, folders: [], items: {} };
// A plain click opens in place; a modified one (new tab) stays the browser's, as the card title's does.
const plain = (e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
// A card dragged over a target: only the Library's own drag (DRAG_TYPE), never a file or a link from elsewhere.
const dragOver = (set) => (e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; set(true); } };
const dropped = (set, fn) => (e) => { e.preventDefault(); set(false); const item = e.dataTransfer.getData(DRAG_TYPE); if (item) fn(item); };
const ROW = 'flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-ink hover:bg-hover';

// `enabled`: the Library with a signed-in viewer; `apps`: what the Library lists, for each folder's "N items" (a trashed
// or archived item keeps its row but is not counted). Every change reloads the list; a failure says why, nothing else.
export function useLibraryFolders(enabled, apps = []) {
  const [state, setState] = useState(EMPTY);
  const load = () => api('/api/library/folders').then((d) => setState({ loaded: true, ...d }), (e) => toast(e.message, { tone: 'error' }));
  useEffect(() => { if (enabled) load(); }, [enabled]);
  const act = async (work) => { try { await work(); await load(); } catch (e) { toast(e.message, { tone: 'error' }); } };
  const move = (item, id) => act(() => api(`/api/library/folders/${id}/items/${item}`, { method: 'PUT' }));
  const unfile = (item) => { const id = state.items[item]; if (id) act(() => api(`/api/library/folders/${id}/items/${item}`, { method: 'DELETE' })); };
  const [dialog, setDialog] = useState(null); // { kind: new | rename | delete, folder?, item?, value?, color? }
  const [menu, setMenu] = useState(null); // { folder, anchor, top | bottom, left }
  const [coloursOpen, setColoursOpen] = useState(false); // the Colour swatches, inside the same menu
  // New folder: from the header button, or from a card's "New folder…" (`item`), which files the card in the same step.
  const newFolder = (item = null) => setDialog({ kind: 'new', item, value: '', color: nextColor(state.folders) });
  const onMore = (folder) => (e) => { e.stopPropagation(); e.preventDefault(); setColoursOpen(false); setMenu({ folder, anchor: e.currentTarget, ...menuAt(e.currentTarget, 208) }); };
  const pick = (fn) => { const f = menu.folder; setMenu(null); setColoursOpen(false); fn(f); };
  const save = () => {
    const { kind, folder, item, value, color } = dialog, name = cleanName(value);
    if (!name) return;
    setDialog(null);
    if (kind === 'new') act(() => api('/api/library/folders', { method: 'POST', body: JSON.stringify({ name, color, ...(item ? { item } : {}) }) }));
    else act(() => api(`/api/library/folders/${folder.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }));
  };
  const recolour = (folder, color) => act(() => api(`/api/library/folders/${folder.id}`, { method: 'PATCH', body: JSON.stringify({ color }) }));
  // Deleting the open folder lands back on the Library, filters kept; its items are already there.
  const remove = async (folder) => {
    await act(() => api(`/api/library/folders/${folder.id}`, { method: 'DELETE' }));
    if (new URLSearchParams(window.location.search).get('d') === folder.id) navigate(chipHref(window.location.search, 'd', null));
  };
  const counts = folderCounts(apps, state.items);
  const element = <>
    <Menu portal anchor={menu?.anchor} open={!!menu} onClose={() => setMenu(null)} style={{ top: menu?.top, bottom: menu?.bottom, left: menu?.left }} className="w-52">
      <MenuItem icon={PenLine} data-folder-rename onClick={() => pick((f) => setDialog({ kind: 'rename', folder: f, value: f.name }))}>Rename</MenuItem>
      {/* A plain button, not MenuItem: it carries the current swatch and a chevron (the card menu's Visibility pattern). */}
      <button type="button" data-folder-colour aria-expanded={coloursOpen} onClick={() => setColoursOpen((on) => !on)} className={ROW}>
        <Palette size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />
        <span className="min-w-0 flex-1">Colour</span>
        <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: folderInk(menu?.folder.color) }} />
        <ChevronRight size={14} strokeWidth={1.5} className={`shrink-0 text-ink-3 transition-transform ${coloursOpen ? 'rotate-90' : ''}`} />
      </button>
      {/* `menu &&`: the children are built before Menu decides to render nothing, so a closed menu must not read it. */}
      {coloursOpen && menu && <Swatches value={menu.folder.color} onPick={(color) => pick((f) => recolour(f, color))} />}
      <div className="my-1 border-t border-line" />
      <MenuItem icon={Trash2} data-folder-delete onClick={() => pick((f) => setDialog({ kind: 'delete', folder: f }))}>Delete folder</MenuItem>
    </Menu>
    {(dialog?.kind === 'new' || dialog?.kind === 'rename') && (
      <ConfirmDialog title={dialog.kind === 'new' ? 'New folder' : 'Rename folder'} confirmLabel={dialog.kind === 'new' ? 'Create' : 'Save'} confirmVariant="primary"
        confirmDisabled={!cleanName(dialog.value)} onCancel={() => setDialog(null)} onConfirm={save}
        body={(
          <form data-folder-dialog className="block" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Input autoFocus aria-label="Folder name" placeholder="Folder name" maxLength={NAME_MAX} value={dialog.value} onChange={(e) => setDialog({ ...dialog, value: e.target.value })} />
            {dialog.kind === 'new' && <div className="pt-3"><Swatches value={dialog.color} onPick={(color) => setDialog({ ...dialog, color })} /></div>}
            {dialog.item && <span className="mt-2 block text-xs text-ink-3">The card moves into it.</span>}
          </form>
        )} />
    )}
    {dialog?.kind === 'delete' && (
      <ConfirmDialog {...deleteCopy(dialog.folder.name, counts[dialog.folder.id] || 0)} confirmLabel="Delete folder"
        onCancel={() => setDialog(null)} onConfirm={() => { const f = dialog.folder; setDialog(null); remove(f); }} />
    )}
  </>;
  return { ...state, counts, move, unfile, newFolder, onMore, element };
}

// The six swatches, the canvas's and the comment pins' palette; the picked one is ringed as the canvas's style panel does.
function Swatches({ value, onPick }) {
  return (
    <div role="radiogroup" aria-label="Colour" className="flex items-center gap-1 px-1.5 py-1">
      {FOLDER_COLORS.map(({ id, label }) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} aria-label={label} title={label} data-swatch={id} onClick={() => onPick(id)}
          className="grid h-7 w-7 place-items-center rounded-sm hover:bg-hover">
          <span style={{ background: folderInk(id) }} className={`h-3.5 w-3.5 rounded-full ${value === id ? 'ring-2 ring-[#2383e2] ring-offset-1' : ''}`} />
        </button>
      ))}
    </div>
  );
}

const Glyph = ({ color, size = 18 }) => <Folder size={size} strokeWidth={1.75} fill="currentColor" fillOpacity={0.2} style={{ color: folderInk(color) }} className="shrink-0" aria-hidden="true" />;

// The folder tiles above the cards in the Library's main view: one compact height, the colour on the icon and the left
// edge, "N items", a ⋮ beside each (a sibling of the link, never inside it). A card dragged onto a tile moves into it.
export function FolderTiles({ folders, counts, onMore, onDrop }) {
  const [over, setOver] = useState(null);
  if (!folders.length) return null;
  return (
    <section aria-label="Folders" className="pb-10">
      <div className="flex h-8 items-center pb-1"><h2 className="text-sm font-medium">Folders <span className="font-normal text-ink-3">{folders.length}</span></h2></div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3">
        {folders.map((f) => (
          <li key={f.id} className="group relative">
            <a href={libraryHref({ d: f.id })} data-folder-tile={f.id} data-drop-over={over === f.id || undefined} title={f.name}
              onClick={(e) => { if (plain(e)) { e.preventDefault(); navigate(chipHref(window.location.search, 'd', f.id)); } }}
              onDragOver={dragOver((on) => setOver(on ? f.id : null))} onDragLeave={() => setOver(null)} onDrop={dropped(() => setOver(null), (item) => onDrop(item, f.id))}
              className={`lift-card relative flex h-12 items-center gap-3 overflow-hidden rounded-lg border bg-white pr-9 pl-4 outline-none focus-visible:outline-2 focus-visible:outline-accent/35 ${over === f.id ? 'border-accent ring-2 ring-accent/25' : 'border-line'}`}>
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: folderInk(f.color) }} />
              <Glyph color={f.color} />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span data-folder-name className="truncate text-sm font-medium text-ink">{f.name}</span>
                <span data-folder-count className="text-xs text-ink-3">{itemsLabel(counts[f.id] || 0)}</span>
              </span>
            </a>
            <IconBtn title="Folder options" aria-label={`Options for ${f.name}`} data-folder-more onClick={onMore(f)}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100">
              <MoreHorizontal size={16} strokeWidth={1.5} />
            </IconBtn>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The open folder's breadcrumb above the title: Library › Folder name. Library is a link back (filters kept) and takes a
// dragged card out of the folder.
export function FolderCrumb({ folder, onDropOut }) {
  const [over, setOver] = useState(false);
  const back = chipHref(window.location.search, 'd', null);
  return (
    <nav aria-label="Breadcrumb" data-folder-crumb className="flex items-center gap-1 pb-2 text-sm text-ink-2">
      <a href={back} data-folder-crumb-library data-drop-over={over || undefined} onClick={(e) => { if (plain(e)) { e.preventDefault(); navigate(back); } }}
        onDragOver={dragOver(setOver)} onDragLeave={() => setOver(false)} onDrop={dropped(setOver, onDropOut)}
        className={`rounded-sm px-1 py-0.5 hover:bg-hover hover:text-ink ${over ? 'bg-accent/10 text-accent ring-2 ring-accent/25' : ''}`}>Library</a>
      <ChevronRight size={14} strokeWidth={1.5} className="text-ink-3" aria-hidden="true" />
      <span className="flex min-w-0 items-center gap-1.5 text-ink"><Glyph color={folder.color} size={14} /><span className="truncate">{folder.name}</span></span>
    </nav>
  );
}

// The open folder as the page title, with its colour.
export const FolderTitle = ({ folder }) => <span data-folder-title className="inline-flex min-w-0 items-center gap-3"><Glyph color={folder.color} size={32} /><span className="truncate">{folder.name}</span></span>;

// Inside a folder with nothing to show: empty, or the id is not one of yours (someone else's link, or a deleted folder).
export function FolderEmpty({ folder }) {
  return folder
    ? <EmptyState icon={FolderOpen}>This folder is empty. Move cards in from a card's ⋮ menu, or drag them onto its tile in the Library.</EmptyState>
    : <EmptyState icon={FolderOpen}>No such folder in your Library. <a className="text-accent hover:underline" href={libraryHref()} onClick={(e) => { if (plain(e)) { e.preventDefault(); navigate(libraryHref()); } }}>Back to Library</a></EmptyState>;
}
