import { useEffect, useRef, useState } from 'react';
import { AlignLeft, Archive, ArrowUpRight, BarChart3, BookOpen, Check, ChevronRight, CopyPlus, Eye, FolderInput, FolderMinus, FolderPlus, ImageUp, Link, Link2, Network, PenLine, Pin, PinOff, Plus, RotateCcw, Trash2 } from 'lucide-react';
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
import { ACCESS, PRIVATE_CONFIRM, PRIVATE_REPOSITORY, confirmsPrivate, copyLinkFor, projectConfirm, setAccess, setProjectAccess } from '../canvas-visibility.js';
import { menuRows } from './card-menu-items.js';
import { cardModel } from './provenance.js';
import { ExplainerAnalytics } from '../CreatorAnalytics.jsx';
import { bumpThumbnail, coverBlob, coverProblem, ownThumbnail } from '../card-thumbnail.js';

// Review fixtures (home/review-fixtures.js) have no page and are never sent to an API.
const fixtureNote = () => toast('Review fixture: there is nothing behind this card.');
const guard = (a, fn) => () => (a.fixture ? fixtureNote() : fn());
// card-menu-items.js names each row's icon; these are they.
const ICONS = { AlignLeft, Archive, ArrowUpRight, BarChart3, BookOpen, CopyPlus, Eye, ImageUp, Link, Link2, Network, PenLine, Pin, PinOff, Plus, RotateCcw, Trash2 };
// The data attributes the checks already know these rows by.
const DATA = { rename: 'data-menu-rename', describe: 'data-menu-describe', share: 'data-menu-share', analytics: 'data-menu-analytics', thumbnail: 'data-menu-thumbnail', snapshot: 'data-menu-thumbnail-revert', trash: 'data-menu-trash' };

// The ⋮ of a canvas or project card, one menu wherever the card is (owner, 2026-10-08): the Library and Home's Recent.
// docs/features/visibility-menu.md. `onMore(a)` is the card's ⋮ handler, or null when the Library shows no menu for it (a
// canvas you do not own). `onArchive(a)`: the page's own Archive confirm (the Library's lives in App.jsx); without one,
// the menu asks itself, in the same words. `onChanged` reloads the list after every change. `folders`: the Library's
// folders (LibraryFolders.jsx useLibraryFolders) - only the Library passes them, so only its ⋮ has Move to folder.
export const hasCardMenu = (a) => a.kind === 'repository' || (a.kind === 'canvas' && !!a.canEdit);
export function useCardMenu({ org, email, apps = [], onArchive = null, onChanged, folders = null }) {
  const [menu, setMenu] = useState(null); // { a, top | bottom, left }
  const [accessOpen, setAccessOpen] = useState(false); // the Visibility submenu, inside the same menu
  const [foldersOpen, setFoldersOpen] = useState(false); // the Move to folder submenu, inside the same menu
  const [dialog, setDialog] = useState(null); // { kind: rename | describe | private | trash | analytics | share | archive, a, value?, to?, state? }
  const [copied, setCopied] = useState(null); // the Copy link row's own confirmation
  const ctx = { org, email, storage: localStorage, catalog: apps, onForked: onChanged };
  const onMore = (a) => (hasCardMenu(a) ? (e) => { e.stopPropagation(); setAccessOpen(false); setFoldersOpen(false); setCopied(null); setMenu({ a, anchor: e.currentTarget, ...menuAt(e.currentTarget, 224) }); readCover(a); } : null);
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
  // A project's visibility is its live canvases' and its Main canvas's, set together (canvas-visibility.js setProjectAccess);
  // its confirm counts them as its card does. Make private keeps the canvas confirm's words.
  const projectCanvasesOf = (a) => apps.filter((x) => x.kind === 'canvas' && x.project === a.name && !x.archived_at);
  const countOf = (a) => projectCanvasesOf(a).length + 1;
  const changeAccess = (a, to) => act(() => (a.kind === 'repository' ? setProjectAccess(api, a, projectCanvasesOf(a), to, local) : setAccess(api, a, to, local(a))),
    `${titleOf(a)} is now ${ACCESS.find((x) => x.id === to).label.toLowerCase()}`);
  const chooseAccess = (to) => pick((a) => {
    if (a.kind !== 'repository') return confirmsPrivate(a.access, to) ? setDialog({ kind: 'private', a, to }) : changeAccess(a, to);
    if (to !== a.access) setDialog({ kind: to === 'private' ? 'private' : 'project', a, to });
  });
  const patch = (a, body, done) => act(() => api(`/api/apps/${a.name}`, { method: 'PATCH', body: JSON.stringify(body) }), done);
  const moveToTrash = (a) => act(() => api(`/api/apps/${a.name}/trash`, { method: 'POST', body: '{}' }), `Moved "${titleOf(a)}" to Trash`);
  const archive = (a) => (onArchive ? onArchive(a) : setDialog({ kind: 'archive', a }));
  // The card's picture (card-thumbnails.md), the owner's only: Change thumbnail takes a PNG, JPEG or WebP, cropped to the
  // card's 2:1 and redrawn at 800 x 400 here; Use canvas snapshot (only while a picture of theirs is up) goes back to the
  // automatic one. The card itself shows the change - no toast unless it fails.
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
  // Copy link (owner, 2026-10-08): the link that matches what the card is (canvas-visibility.js copyLinkFor); an unlisted
  // canvas's share link is read from its board. The row says what was copied, then the menu closes - no corner toast.
  const closing = useRef(null);
  useEffect(() => () => clearTimeout(closing.current), []);
  const copyLink = async () => {
    const a = menu.a;
    if (a.fixture) { setMenu(null); return fixtureNote(); }
    const linked = a.kind === 'canvas' ? a.access === 'unlisted' : !!a.access && a.access !== 'private';
    const link = async () => copyLinkFor(a, { origin: window.location.origin, view: linked ? (await api(`/api/learn/boards/${a.name}/main`).catch(() => null))?.sharing?.view : null });
    try {
      // A ClipboardItem takes the link as a promise, so the copy keeps the click's permission while the share link loads.
      const made = link();
      if (window.ClipboardItem && navigator.clipboard?.write) await navigator.clipboard.write([new window.ClipboardItem({ 'text/plain': made.then(({ url }) => new Blob([url], { type: 'text/plain' })) })]);
      else await navigator.clipboard.writeText((await made).url);
      setCopied((await made).copied);
    } catch { setCopied("Couldn't copy the link"); }
    clearTimeout(closing.current);
    closing.current = setTimeout(() => setMenu(null), 1400);
  };
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
      className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-ink hover:bg-hover">
      <FolderInput size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />
      <span className="min-w-0 flex-1">Move to folder</span>
      <ChevronRight size={14} strokeWidth={1.5} className={`shrink-0 text-ink-3 transition-transform ${foldersOpen ? 'rotate-90' : ''}`} />
    </button>
    {foldersOpen && folders.folders.map((f) => (
      <button key={f.id} type="button" role="menuitemradio" aria-checked={inFolder === f.id} data-folder-option={f.id} onClick={() => pick((a) => folders.move(a.name, f.id))}
        className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-ink hover:bg-hover">
        <span className="flex h-5 w-4 shrink-0 items-center justify-center">{inFolder === f.id && <Check size={14} strokeWidth={2} />}</span>
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: folderInk(f.color) }} />
        <span className="min-w-0 flex-1 truncate">{f.name}</span>
      </button>
    ))}
    {foldersOpen && <MenuItem icon={FolderPlus} data-menu-folder-new className="pl-8" onClick={() => pick((a) => folders.newFolder(a.name))}>New folder…</MenuItem>}
    {inFolder && <MenuItem icon={FolderMinus} data-menu-folder-remove onClick={() => pick((a) => folders.unfile(a.name))}>Remove from folder</MenuItem>}
  </>;
  const run = {
    open: (a) => navigate(`/apps/${a.name}`),
    learn: (a) => navigate(`/apps/${a.name}?tab=learn`),
    map: (a) => navigate(`/apps/${a.name}?tab=map`),
    pin: (a) => togglePin(localStorage, ctx.org, ctx.email, a.name),
    // A project renames its display name only; its repository stays its subtitle (repositories.js). Empty: the repository's name.
    rename: (a) => setDialog({ kind: 'rename', a, value: a.kind === 'repository' ? cardModel(a).title : a.title || '' }),
    describe: (a) => setDialog({ kind: 'describe', a, value: a.description || '' }),
    duplicate,
    // New canvas in project: the switcher's New canvas (RepositoryPage.jsx CanvasSwitcher), from the card; opened once made.
    new_canvas: (a) => setDialog({ kind: 'new-canvas', a, value: newCanvasTitle(projectCanvases(a.name, apps)) }),
    share: (a) => setDialog({ kind: 'share', a, state: local(a) }),
    thumbnail: chooseCover,
    snapshot: revertCover,
    analytics: (a) => setDialog({ kind: 'analytics', a }),
    archive,
    trash: (a) => setDialog({ kind: 'trash', a }),
  };
  // A row's own condition: Pin needs a signed-in person, Use canvas snapshot a picture of yours, Analytics (creator-analytics-
  // contract.md) a public canvas - the owner's only, never anyone else.
  const rowShown = (a) => (id) => (id === 'pin' ? !!ctx.email : id === 'snapshot' ? cover?.name === a.name && cover.source === 'custom' : id === 'analytics' ? a.access === 'public' : true);
  // Visibility, inside the same menu. Plain buttons, not MenuItem: MenuItem truncates its children into one line, and these
  // carry a chevron or a hint. A project whose parts differ reads Mixed, none checked; a private repository's is never Public.
  const visibilityRows = (a) => (
    <div key="visibility">
      <button type="button" data-menu-item="visibility" data-menu-visibility aria-expanded={accessOpen} onClick={() => setAccessOpen((on) => !on)}
        className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-ink hover:bg-hover">
        <Eye size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />
        <span className="min-w-0 flex-1">Visibility</span>
        {a.access === 'mixed' && <span data-access-mixed className="text-xs text-ink-3">Mixed</span>}
        <ChevronRight size={14} strokeWidth={1.5} className={`shrink-0 text-ink-3 transition-transform ${accessOpen ? 'rotate-90' : ''}`} />
      </button>
      {accessOpen && ACCESS.map(({ id, label, hint }) => {
        const blocked = a.kind === 'repository' && id === 'public' && !a.repo_public;
        return (
          <button key={id} type="button" role="menuitemradio" aria-checked={a.access === id} data-access={id} disabled={blocked} onClick={() => chooseAccess(id)}
            className="flex w-full items-start gap-2 rounded-sm py-1 pr-2 pl-2 text-left text-sm text-ink hover:bg-hover disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent">
            <span className="flex h-5 w-4 shrink-0 items-center justify-center">{a.access === id && <Check size={14} strokeWidth={2} />}</span>
            <span className="flex min-w-0 flex-col"><span>{label}</span><span className="text-xs text-ink-3">{blocked ? PRIVATE_REPOSITORY : hint}</span></span>
          </button>
        );
      })}
    </div>
  );
  const element = <>
    <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp" hidden data-thumbnail-input onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadCover(file); }} />
    <Menu portal anchor={menu?.anchor} open={!!menu} onClose={() => setMenu(null)} style={{ top: menu?.top, bottom: menu?.bottom, left: menu?.left }} className="w-56">
      {/* One menu for canvases and projects (card-menu-items.js): the same rows, labels and icons in the same order; a row
          for one type keeps its slot and is hidden on the other. */}
      {menu && menuRows(menu.a, rowShown(menu.a)).map((item, i) => {
        if (item.separator) return <div key={`separator-${i}`} className="my-1 border-t border-line" />;
        if (item.id === 'copy') return <MenuItem key="copy" icon={copied ? Check : Link} data-menu-item="copy" data-menu-copy-link onClick={copyLink}>{copied || item.label}</MenuItem>;
        if (item.id === 'visibility') return visibilityRows(menu.a);
        const on = item.id === 'pin' && pinnedNow, Icon = ICONS[on ? item.alt.icon : item.icon];
        return <MenuItem key={item.id} icon={Icon} data-menu-item={item.id} {...(DATA[item.id] ? { [DATA[item.id]]: '' } : {})} onClick={() => pick(run[item.id])}>{on ? item.alt.label : item.label}</MenuItem>;
      })}
      {folderRows && <><div className="my-1 border-t border-line" />{folderRows}</>}
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
    {dialog?.kind === 'private' && (
      <ConfirmDialog title={dialog.a.kind === 'repository' ? projectConfirm(countOf(dialog.a), 'private').title : PRIVATE_CONFIRM.title} body={PRIVATE_CONFIRM.body} confirmLabel={PRIVATE_CONFIRM.action} confirmVariant="primary"
        onCancel={() => setDialog(null)} onConfirm={() => { const { a, to } = dialog; setDialog(null); changeAccess(a, to); }} />
    )}
    {dialog?.kind === 'project' && (
      <ConfirmDialog title={projectConfirm(countOf(dialog.a), dialog.to).title} body={projectConfirm(countOf(dialog.a), dialog.to).body} confirmLabel={projectConfirm(countOf(dialog.a), dialog.to).action} confirmVariant="primary"
        onCancel={() => setDialog(null)} onConfirm={() => { const { a, to } = dialog; setDialog(null); changeAccess(a, to); }} />
    )}
    {dialog?.kind === 'analytics' && <ExplainerAnalytics a={dialog.a} onClose={() => setDialog(null)} />}
    {dialog?.kind === 'share' && <ShareDialog a={dialog.a} state={dialog.state} onClose={() => setDialog(null)} onChanged={() => ctx.onForked?.()} />}
    {/* The Library's own words (App.jsx), where no page confirms an Archive for the menu. */}
    {dialog?.kind === 'archive' && (
      <ConfirmDialog title={`Archive ${titleOf(dialog.a)}?`} body="It leaves the Library. Its content stays in this browser, and Restore brings it back." confirmLabel="Archive" confirmVariant="primary"
        onCancel={() => setDialog(null)} onConfirm={() => { const { a } = dialog; setDialog(null); act(() => api(`/api/apps/${a.name}/archive`, { method: 'POST' }), `Archived ${titleOf(a)}`); }} />
    )}
    {dialog?.kind === 'trash' && (
      <ConfirmDialog title={`Move this ${kindWord(dialog.a)} to Trash?`} confirmLabel="Move to Trash"
        body="It will disappear from your Library and public/shared access will stop. Existing forks will not be deleted. You can restore it from Trash."
        onCancel={() => setDialog(null)} onConfirm={() => { const { a } = dialog; setDialog(null); moveToTrash(a); }} />
    )}
  </>;
  return { onMore, element };
}

// Share / Manage link from the ⋮ (owner, 2026-10-08): the canvas page's own Share panel as a popup over the list, on
// the same routes; closing it leaves the list as it was. `state` is this browser's copy, sent with a first share or
// publish as Visibility's is. Every change reloads the list, so the card's visibility follows.
// ponytail: a choose-a-handle refusal on Publish shows as the panel's error here; the canvas page asks for one in place.
function ShareDialog({ a, state, onClose, onChanged }) {
  const base = `/api/learn/boards/${a.name}/main`;
  const [sharing, setSharing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { api(base).then((board) => setSharing(board.sharing), (e) => setError(e.message)); }, [base]);
  const post = (path, body = {}) => api(path, { method: 'POST', body: JSON.stringify(body) });
  const run = (work) => async (arg) => {
    setBusy(true); setError(null);
    try { await work(arg); setSharing((await api(base)).sharing); onChanged(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div data-share-dialog className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 animate-[fade-in_100ms_ease-out]">
      <SharePanel place="relative mt-[26vh] max-w-[90vw]" sharing={sharing} busy={busy || !sharing} error={error} onClose={onClose}
        onChange={run((next) => post(`${base}/share`, { ...next, ...(state ? { state } : {}) }))}
        onRepository={run((allow) => post(`${base}/share/repository`, { allow }))}
        // A project's link is its Main canvas board's; a project itself is never in Explore (its canvases are, by Visibility).
        onPublish={a.kind === 'repository' ? null : run(async (publish) => {
          // Publishing needs the board on the server; its first copy is this browser's (canvas-visibility.js setAccess).
          if (publish && state && (await api(base)).exists === false) await api(base, { method: 'PUT', body: JSON.stringify({ state }) });
          await post(`/api/apps/${a.name}/${publish ? 'publish' : 'unpublish'}`);
        })} />
    </div>
  );
}
