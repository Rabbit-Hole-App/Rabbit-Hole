import { useEffect, useRef, useState } from 'react';
import { AlignLeft, ArrowUpRight, BarChart3, Check, ChevronRight, CopyPlus, FolderInput, FolderMinus, FolderPlus, ImageUp, Link2, Network, PenLine, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { titleOf } from '../agent/catalog.js';
import { folderInk } from '../library-folders.js';
import { api, navigate } from '../api.js';
import { canvasKeys, deviceId, localBoard } from './canvas-local.js';
import { canvasHref, newCanvasTitle, projectCanvases } from '../project-canvases.js';
import { postFork } from '../canvas-fork.js';
import SharePanel from '../SharePanel.jsx';
import { readPinned, togglePin } from './pinned.js';
import { menuAt } from './LearningCard.jsx';
import { ConfirmDialog, Input, Menu, MenuItem, toast } from '../ui.jsx';
import { menuRows } from './card-menu-items.js';
import { cardModel } from './provenance.js';
import ProjectCanvases from './ProjectCanvases.jsx';
import { affected, applyToAll, loadRows } from './project-access.js';
import { ExplainerAnalytics } from '../CreatorAnalytics.jsx';
import { bumpThumbnail, coverBlob, coverProblem, ownThumbnail } from '../card-thumbnail.js';

// Review fixtures (home/review-fixtures.js) have no page and are never sent to an API.
const fixtureNote = () => toast('Review fixture: there is nothing behind this card.');
const guard = (a, fn) => () => (a.fixture ? fixtureNote() : fn());
// card-menu-items.js names each row's icon; these are they.
const ICONS = { AlignLeft, ArrowUpRight, BarChart3, CopyPlus, FolderInput, ImageUp, Link2, Network, PenLine, Pin, PinOff, Plus, Trash2 };
// The data attributes the checks already know these rows by.
const DATA = { rename: 'data-menu-rename', describe: 'data-menu-describe', share: 'data-menu-share', analytics: 'data-menu-analytics', thumbnail: 'data-menu-thumbnail', trash: 'data-menu-trash' };

// The Card options button (the three dots) of a canvas or project card, one menu wherever the card is (owner, 2026-10-08;
// simplified 2026-10-22): the Library and Home's Recent. docs/features/visibility-menu.md. `onMore(a)` is the card's button
// handler, or null when the Library shows no menu for it (a canvas you do not own). `onChanged` reloads the list after
// every change. `folders`: the Library's folders (LibraryFolders.jsx useLibraryFolders), passed by Home and Library alike,
// so Move to folder works from either; without them the row is not offered. `onVaries(a)`: the handler of a project's
// Varies by canvas badge, which opens its Share window.
export const hasCardMenu = (a) => a.kind === 'repository' || (a.kind === 'canvas' && !!a.canEdit);
export function useCardMenu({ org, email, apps = [], onChanged, folders = null }) {
  const [menu, setMenu] = useState(null); // { a, top | bottom, left }
  const [foldersOpen, setFoldersOpen] = useState(false); // the Move to folder submenu, inside the same menu
  const [dialog, setDialog] = useState(null); // { kind: rename | describe | new-canvas | cover | trash | analytics | share, a, value?, state? }
  const ctx = { org, email, storage: localStorage, catalog: apps, onForked: onChanged };
  const onMore = (a) => (hasCardMenu(a) ? (e) => { e.stopPropagation(); setFoldersOpen(false); setMenu({ a, anchor: e.currentTarget, ...menuAt(e.currentTarget, 224) }); readCover(a); } : null);
  const pick = (fn) => { const a = menu.a; setMenu(null); guard(a, () => fn(a))(); };
  // Duplicate (docs/features/canvas-naming.md): a private copy of your own canvas, titled "Title (2)", "(3)"... by the
  // server; never a fork, and the only copy of your own canvas (no Fork on it, owner 2026-10-08). This browser's copy of
  // the content travels until the server owns content; none (null) copies the server's.
  const duplicate = async (a) => {
    try {
      const made = await postFork({ source: { canvas: a.name }, state: localBoard(ctx.storage, canvasKeys({ org: a.org || ctx.org, email: a.email || ctx.email, slug: a.name })) }, '/api/learn/boards/duplicate');
      toast(`Duplicated as "${made.title}"`);
      ctx.onForked?.();
    } catch (error) { toast(error.message, { tone: 'error' }); }
  };
  // The owned-card menu (docs/features/visibility-menu.md). Every change reloads the list from the server.
  const local = (a) => localBoard(ctx.storage, canvasKeys({ org: a.org || ctx.org, email: a.email || ctx.email, slug: a.name }));
  const act = async (work, done) => {
    try { await work(); if (done) toast(done); ctx.onForked?.(); } catch (error) { toast(error.message, { tone: 'error' }); }
  };
  const patch = (a, body, done) => act(() => api(`/api/apps/${a.name}`, { method: 'PATCH', body: JSON.stringify(body) }), done);
  const moveToTrash = (a) => act(() => api(`/api/apps/${a.name}/trash`, { method: 'POST', body: '{}' }), `Moved "${titleOf(a)}" to Trash`);
  // The card's picture (card-thumbnails.md), the owner's only: Change cover opens the picker. Upload image takes a PNG, JPEG
  // or WebP, cropped to the card's 2:1 and redrawn at 800 x 400 here; Reset to canvas snapshot (only while a cover of theirs
  // is up) deletes that custom cover and nothing else - the snapshot stays the owner's own picture, and the public
  // endpoints serve only a custom cover (fix/thumb-containment), so a reset never makes a private snapshot public.
  // The card itself shows the change - no toast unless it fails.
  const [cover, setCover] = useState(null); // { name, source: custom | snapshot | null } of the open menu's card
  const coverInput = useRef(null), coverFor = useRef(null);
  const readCover = (a) => {
    setCover(null);
    if (!a.canEdit || a.fixture) return;
    fetch(ownThumbnail(a.name), { method: 'HEAD', credentials: 'same-origin' }).then((r) => setCover({ name: a.name, source: r.headers.get('x-thumbnail-source') }), () => {});
  };
  const coverDone = (a) => { bumpThumbnail(a.name); ctx.onForked?.(); };
  const chooseCover = (a) => { coverFor.current = a; coverInput.current.value = ''; coverInput.current.click(); };
  const uploadCover = async (file) => {
    const a = coverFor.current, problem = coverProblem(file);
    if (problem) return toast(problem, { tone: 'error' });
    try {
      const blob = await coverBlob(file);
      await api(`/api/learn/boards/${a.name}/main/thumbnail/custom`, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } });
      coverDone(a);
    } catch (error) { toast(error.message || 'That image could not be read.', { tone: 'error' }); }
  };
  const revertCover = (a) => act(async () => { await api(`/api/learn/boards/${a.name}/main/thumbnail/custom`, { method: 'DELETE' }); bumpThumbnail(a.name); });
  const kindWord = (a) => (a.kind === 'repository' ? 'project' : 'canvas');
  // A typed title is kept exactly (canvas-naming.md); a repeat only earns a quiet note.
  const sameTitle = dialog?.kind === 'rename' && apps.some((x) => x.kind === 'canvas' && x.name !== dialog.a.name && x.title === dialog.value.trim());
  // The sidebar has no Apps tree in the preview, so projects and canvases are pinned from here.
  const pinnedNow = menu && ctx.email && readPinned(localStorage, ctx.org, ctx.email).includes(menu.a.name);
  // Library folders (docs/features/library-folders.md), your own canvas or project in the Library only: Move to folder lists
  // the folders with their colour, the current one checked; New folder… makes one and files the card in the same step;
  // Remove from folder while it is in one. The folder list reloads itself; the Library reads it, so the card follows.
  const inFolder = folders && menu ? folders.items[menu.a.name] || null : null;
  const folderRows = folders && menu?.a.canEdit && <>
    <button type="button" data-menu-folder aria-expanded={foldersOpen} onClick={() => setFoldersOpen((on) => !on)}
      className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-ink hover:bg-hover pointer-coarse:h-10">
      <FolderInput size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />
      <span className="min-w-0 flex-1">Move to folder</span>
      <ChevronRight size={14} strokeWidth={1.5} className={`shrink-0 text-ink-3 transition-transform ${foldersOpen ? 'rotate-90' : ''}`} />
    </button>
    {foldersOpen && folders.folders.map((f) => (
      <button key={f.id} type="button" role="menuitemradio" aria-checked={inFolder === f.id} data-folder-option={f.id} onClick={() => pick((a) => folders.move(a.name, f.id))}
        className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-ink hover:bg-hover pointer-coarse:h-10">
        <span className="flex h-5 w-4 shrink-0 items-center justify-center">{inFolder === f.id && <Check size={14} strokeWidth={2} />}</span>
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: folderInk(f.color) }} />
        <span className="min-w-0 flex-1 truncate">{f.name}</span>
      </button>
    ))}
    {foldersOpen && <MenuItem icon={FolderPlus} data-menu-folder-new className="pl-8" onClick={() => pick((a) => folders.newFolder(a.name))}>New folder</MenuItem>}
    {inFolder && <MenuItem icon={FolderMinus} data-menu-folder-remove onClick={() => pick((a) => folders.unfile(a.name))}>Remove from folder</MenuItem>}
  </>;
  const run = {
    open: (a) => navigate(`/apps/${a.name}`),
    map: (a) => navigate(`/apps/${a.name}?tab=map`),
    pin: (a) => togglePin(localStorage, ctx.org, ctx.email, a.name),
    // A project renames its display name only; its repository stays its subtitle (repositories.js). Empty: the repository's name.
    rename: (a) => setDialog({ kind: 'rename', a, value: a.kind === 'repository' ? cardModel(a).title : a.title || '' }),
    describe: (a) => setDialog({ kind: 'describe', a, value: a.description || '' }),
    duplicate,
    // New canvas in project: the switcher's New canvas (RepositoryPage.jsx CanvasSwitcher), from the card; opened once made.
    new_canvas: (a) => setDialog({ kind: 'new-canvas', a, value: newCanvasTitle(projectCanvases(a.name, apps)) }),
    share: (a) => setDialog({ kind: 'share', a, state: local(a) }),
    thumbnail: (a) => setDialog({ kind: 'cover', a }),
    analytics: (a) => setDialog({ kind: 'analytics', a }),
    trash: (a) => setDialog({ kind: 'trash', a }),
  };
  // A row's own condition: Pin needs a signed-in person, Move to folder the page's folders, Analytics (creator-analytics-
  // contract.md) a public canvas - the owner's only, never anyone else.
  const rowShown = (a) => (id) => (id === 'pin' ? !!ctx.email : id === 'folder' ? !!folders : id === 'analytics' ? a.access === 'public' : true);
  // Menu keys: Arrow keys and Home/End move between rows, Escape returns focus to the button that opened it (the Menu itself
  // closes on Escape); a menu opens with focus on its first row, so the keyboard and a screen reader land inside it.
  const menuKeys = (e) => {
    if (e.key === 'Escape') { menu.anchor?.focus?.({ preventScroll: true }); return; }
    const rows = [...e.currentTarget.querySelectorAll('button:not([disabled])')], at = rows.indexOf(document.activeElement);
    const to = { ArrowDown: (at + 1) % rows.length, ArrowUp: (at - 1 + rows.length) % rows.length, Home: 0, End: rows.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault(); e.stopPropagation();
    rows[to]?.focus();
  };
  useEffect(() => {
    if (!menu) return undefined;
    const first = requestAnimationFrame(() => document.querySelector('[data-card-menu] button:not([disabled])')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(first);
  }, [menu]);
  const projectCanvasesOf = (a) => apps.filter((x) => x.kind === 'canvas' && x.project === a.name && !x.archived_at);
  const element = <>
    <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp" hidden data-thumbnail-input onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadCover(file); }} />
    <Menu portal anchor={menu?.anchor} open={!!menu} onClose={() => setMenu(null)} style={{ top: menu?.top, bottom: menu?.bottom, left: menu?.left }} className="w-56 max-w-[calc(100vw-1rem)]">
      {/* One menu for canvases and projects (card-menu-items.js): the same rows, labels and icons in the same order; a row
          for one type keeps its slot and is hidden on the other. */}
      <div data-card-menu role="menu" aria-label="Card options" onKeyDown={menuKeys}>
        {menu && menuRows(menu.a, rowShown(menu.a)).map((item, i) => {
          if (item.separator) return <div key={`separator-${i}`} role="separator" className="my-1 border-t border-line" />;
          if (item.id === 'folder') return <div key="folder" data-menu-item="folder">{folderRows}</div>;
          const on = item.id === 'pin' && pinnedNow, Icon = ICONS[on ? item.alt.icon : item.icon];
          return <MenuItem key={item.id} role="menuitem" icon={Icon} data-menu-item={item.id} {...(DATA[item.id] ? { [DATA[item.id]]: '' } : {})} className="pointer-coarse:h-10" onClick={() => pick(run[item.id])}>{on ? item.alt.label : item.label}</MenuItem>;
        })}
      </div>
    </Menu>
    {(dialog?.kind === 'rename' || dialog?.kind === 'describe') && (
      <ConfirmDialog title={dialog.kind === 'rename' ? 'Rename' : 'Edit description'} confirmLabel="Save" confirmVariant="primary"
        onCancel={() => setDialog(null)}
        onConfirm={() => { const { a, value, kind } = dialog; setDialog(null); patch(a, kind === 'rename' ? { title: value } : { description: value }); }}
        body={dialog.kind === 'rename' ? (
          <span className="block">
            <Input autoFocus aria-label="Title" maxLength={120} value={dialog.value} onChange={(e) => setDialog({ ...dialog, value: e.target.value })} />
            {sameTitle && <span data-same-title className="mt-1.5 block text-xs text-ink-3">You already have another canvas with this name.</span>}
          </span>
        ) : (
          <span className="block">
            <textarea autoFocus aria-label="Description" maxLength={500} rows={4} value={dialog.value} onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
              placeholder="What this canvas is about, in a sentence or two."
              className="w-full resize-none rounded-sm border border-transparent bg-code px-2 py-1.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-line-strong" />
            <span className="mt-1 block text-right text-xs text-ink-3">{dialog.value.length}/500</span>
          </span>
        )} />
    )}
    {dialog?.kind === 'new-canvas' && (
      <ConfirmDialog title="New canvas" confirmLabel="Create" confirmVariant="primary" confirmDisabled={!dialog.value.trim()} onCancel={() => setDialog(null)}
        onConfirm={() => { const { a, value } = dialog; setDialog(null); act(async () => { const made = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: value.trim(), project: a.name, device_id: deviceId(localStorage) }) }); navigate(canvasHref(a.name, made.name)); }); }}
        body={<Input autoFocus aria-label="Canvas name" maxLength={120} value={dialog.value} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setDialog({ ...dialog, value: e.target.value })} />} />
    )}
    {/* Change cover: upload an image, or go back to the automatic snapshot where a custom cover of yours is up. */}
    {dialog?.kind === 'cover' && (
      <ConfirmDialog title="Change cover" confirmLabel="Upload image" confirmVariant="primary" onCancel={() => setDialog(null)}
        onConfirm={() => { const { a } = dialog; setDialog(null); chooseCover(a); }}
        body={(
          <span data-cover-picker className="block">
            Upload a PNG, JPEG or WebP. It is cropped to the card's shape.
            {cover?.name === dialog.a.name && cover.source === 'custom' && (
              <span className="mt-3 block border-t border-line pt-3">
                <button type="button" data-menu-thumbnail-revert onClick={() => { const { a } = dialog; setDialog(null); revertCover(a); }}
                  className="h-8 rounded-md border border-line px-3 text-sm text-ink hover:bg-hover">Reset to canvas snapshot</button>
                <span className="mt-1.5 block text-xs text-ink-3">Removes your uploaded cover. The automatic snapshot is shown only to you; Explore and shared links show a cover only if you upload one.</span>
              </span>
            )}
          </span>
        )} />
    )}
    {dialog?.kind === 'analytics' && <ExplainerAnalytics a={dialog.a} onClose={() => setDialog(null)} />}
    {dialog?.kind === 'share' && (
      <ShareDialog a={dialog.a} state={dialog.state} canvases={dialog.a.kind === 'repository' ? projectCanvasesOf(dialog.a) : []} stateOf={(x) => local(x)}
        onClose={() => setDialog(null)} onChanged={() => ctx.onForked?.()} onManage={(x) => setDialog({ kind: 'share', a: x, state: local(x) })} />
    )}
    {dialog?.kind === 'trash' && (
      <ConfirmDialog title={`Move this ${kindWord(dialog.a)} to Trash?`} confirmLabel="Move to Trash"
        body="It will disappear from your Library and public/shared access will stop. Existing forks will not be deleted. You can restore it from Trash."
        onCancel={() => setDialog(null)} onConfirm={() => { const { a } = dialog; setDialog(null); moveToTrash(a); }} />
    )}
  </>;
  // A project whose canvases differ in access wears Varies by canvas; its badge opens this project's Share window (owner brief
  // 2026-10-22 item 4). Never a canvas, never a project you do not own.
  const onVaries = (a) => (a.kind === 'repository' && a.canEdit && a.access === 'mixed' ? () => guard(a, () => run.share(a))() : null);
  return { onMore, onVaries, element };
}

// Share from the Card options (owner, 2026-10-08; the Share / Explore / Embed dialog of 2026-10-22): the canvas page's own Share
// dialog as a popup over the list, on the same routes; closing it leaves the list as it was. `state` is this browser's copy,
// sent with a first share or publish. Every change reloads the list, so the card's access follows.
// A project's window is the same dialog with two tabs: Share (the project link, the Main canvas board's) and Canvases (the
// access of every canvas, with Apply to all canvases). Its changes touch the project link only, except that explicit action.
// ponytail: a choose-a-handle refusal on Publish shows as the panel's error here; the canvas page asks for one in place.
function ShareDialog({ a, state, canvases, stateOf, onClose, onChanged, onManage }) {
  const base = `/api/learn/boards/${a.name}/main`;
  const project = a.kind === 'repository';
  const [sharing, setSharing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const reload = () => loadRows(api, a, canvases).then(setRows);
  useEffect(() => { api(base).then((board) => setSharing(board.sharing), (e) => setError(e.message)); if (project) reload(); }, [base]);
  const post = (path, body = {}) => api(path, { method: 'POST', body: JSON.stringify(body) });
  const run = (work) => async (arg) => {
    setBusy(true); setError(null);
    try { await work(arg); setSharing((await api(base)).sharing); if (project) await reload(); onChanged(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  // Apply to all canvases: each canvas through its own share route, then every state read back from the server; a canvas that
  // failed keeps (and shows) its old access, and the failures are listed, never summed into "all changed".
  const apply = async (mode) => {
    setApplying(true); setError(null); setResult(null);
    const total = affected(rows, mode).length;
    try {
      const { failed } = await applyToAll(api, rows, mode, (name) => stateOf(canvases.find((x) => x.name === name)));
      await reload();
      setResult({ failed, total });
      onChanged();
    } finally { setApplying(false); }
  };
  return (
    <div data-share-dialog className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 animate-[fade-in_100ms_ease-out]">
      <SharePanel place="relative mt-[26vh] max-w-[90vw]" key={a.name} title={titleOf(a)} sharing={sharing} busy={busy || !sharing} error={error} onClose={onClose}
        onChange={run((next) => post(`${base}/share`, { ...next, ...(state ? { state } : {}) }))}
        privateUrl={`${window.location.origin}/apps/${a.name}`}
        project={project ? { publicBlocked: !a.repo_public, canvases: <ProjectCanvases rows={rows || []} loading={!rows} publicBlocked={!a.repo_public} result={result} pending={applying} onApply={apply} onManage={(row) => onManage(canvases.find((x) => x.name === row.name))} /> } : null}
        // A project itself is never in Explore (its canvases are, one by one: the Canvases tab); a canvas publishes from its own tab.
        onPublish={project ? null : run(async (publish) => {
          // Publishing needs the board on the server; its first copy is this browser's.
          if (publish && state && (await api(base)).exists === false) await api(base, { method: 'PUT', body: JSON.stringify({ state }) });
          await post(`/api/apps/${a.name}/${publish ? 'publish' : 'unpublish'}`);
        })} />
    </div>
  );
}
