import { useEffect, useRef, useState } from 'react';
import { AlignLeft, Archive, BarChart3, BookOpen, Check, ChevronRight, CopyPlus, Eye, Link, Link2, Network, PenLine, Pin, PinOff, Trash2 } from 'lucide-react';
import { titleOf } from '../agent/catalog.js';
import { api, navigate } from '../api.js';
import { canvasKeys, localBoard } from './canvas-local.js';
import { postFork } from '../canvas-fork.js';
import SharePanel from '../SharePanel.jsx';
import { readPinned, togglePin } from './pinned.js';
import { menuAt } from './LearningCard.jsx';
import { ConfirmDialog, Input, Menu, MenuItem, toast } from '../ui.jsx';
import { ACCESS, PRIVATE_CONFIRM, confirmsPrivate, copyLinkFor, setAccess } from '../canvas-visibility.js';
import { ExplainerAnalytics } from '../CreatorAnalytics.jsx';

// Review fixtures (home/review-fixtures.js) have no page and are never sent to an API.
const fixtureNote = () => toast('Review fixture: there is nothing behind this card.');
const guard = (a, fn) => () => (a.fixture ? fixtureNote() : fn());

// The ⋮ of a canvas or project card, one menu wherever the card is (owner, 2026-10-08): the Library and Home's Recent.
// docs/features/visibility-menu.md. `onMore(a)` is the card's ⋮ handler, or null when the Library shows no menu for it (a
// canvas you do not own). `onArchive(a)`: the page's own Archive confirm (the Library's lives in App.jsx); without one,
// the menu asks itself, in the same words. `onChanged` reloads the list after every change.
export const hasCardMenu = (a) => a.kind === 'repository' || (a.kind === 'canvas' && !!a.canEdit);
export function useCardMenu({ org, email, apps = [], onArchive = null, onChanged }) {
  const [menu, setMenu] = useState(null); // { a, top | bottom, left }
  const [accessOpen, setAccessOpen] = useState(false); // the Visibility submenu, inside the same menu
  const [dialog, setDialog] = useState(null); // { kind: rename | describe | private | trash | analytics | share | archive, a, value?, to?, state? }
  const [copied, setCopied] = useState(null); // the Copy link row's own confirmation
  const ctx = { org, email, storage: localStorage, catalog: apps, onForked: onChanged };
  const onMore = (a) => (hasCardMenu(a) ? (e) => { e.stopPropagation(); setAccessOpen(false); setCopied(null); setMenu({ a, ...menuAt(e.currentTarget, 224) }); } : null);
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
  const changeAccess = (a, to) => act(() => setAccess(api, a, to, local(a)), `${a.title} is now ${ACCESS.find((x) => x.id === to).label.toLowerCase()}`);
  const chooseAccess = (to) => pick((a) => (confirmsPrivate(a.access, to) ? setDialog({ kind: 'private', a, to }) : changeAccess(a, to)));
  const patch = (a, body, done) => act(() => api(`/api/apps/${a.name}`, { method: 'PATCH', body: JSON.stringify(body) }), done);
  const moveToTrash = (a) => act(() => api(`/api/apps/${a.name}/trash`, { method: 'POST', body: '{}' }), `Moved "${titleOf(a)}" to Trash`);
  const archive = (a) => (onArchive ? onArchive(a) : setDialog({ kind: 'archive', a }));
  // Copy link (owner, 2026-10-08): the link that matches what the card is (canvas-visibility.js copyLinkFor); an unlisted
  // canvas's share link is read from its board. The row says what was copied, then the menu closes - no corner toast.
  const closing = useRef(null);
  useEffect(() => () => clearTimeout(closing.current), []);
  const copyLink = async () => {
    const a = menu.a;
    if (a.fixture) { setMenu(null); return fixtureNote(); }
    const link = async () => copyLinkFor(a, { origin: window.location.origin, view: a.kind === 'canvas' && a.access === 'unlisted' ? (await api(`/api/learn/boards/${a.name}/main`).catch(() => null))?.sharing?.view : null });
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
  const copyRow = <MenuItem icon={copied ? Check : Link} data-menu-copy-link onClick={copyLink}>{copied || 'Copy link'}</MenuItem>;
  const element = <>
    <Menu portal open={!!menu} onClose={() => setMenu(null)} style={{ top: menu?.top, bottom: menu?.bottom, left: menu?.left }} className="w-56">
      {menu?.a.kind === 'repository' ? (
        <>
          {ctx.email && <MenuItem icon={pinnedNow ? PinOff : Pin} onClick={() => pick((a) => togglePin(localStorage, ctx.org, ctx.email, a.name))}>{pinnedNow ? 'Unpin' : 'Pin'}</MenuItem>}
          <MenuItem icon={BookOpen} onClick={() => pick((a) => navigate(`/apps/${a.name}?tab=learn`))}>Learn</MenuItem>
          <MenuItem icon={Network} onClick={() => pick((a) => navigate(`/apps/${a.name}?tab=map`))}>Map</MenuItem>
          {menu.a.canEdit && copyRow}
          {menu.a.canEdit && <><div className="my-1 border-t border-line" />
            <MenuItem icon={Trash2} data-menu-trash onClick={() => pick((a) => setDialog({ kind: 'trash', a }))}>Move to Trash</MenuItem></>}
        </>
      ) : menu?.a.canEdit ? <>
        <MenuItem icon={PenLine} data-menu-rename onClick={() => pick((a) => setDialog({ kind: 'rename', a, value: a.title || '' }))}>Rename</MenuItem>
        <MenuItem icon={AlignLeft} data-menu-describe onClick={() => pick((a) => setDialog({ kind: 'describe', a, value: a.description || '' }))}>Edit description</MenuItem>
        <MenuItem icon={CopyPlus} onClick={() => pick(duplicate)}>Duplicate</MenuItem>
        <div className="my-1 border-t border-line" />
        {/* Plain buttons, not MenuItem: MenuItem truncates its children into one line, and these carry a chevron or a hint. */}
        <button type="button" data-menu-visibility aria-expanded={accessOpen} onClick={() => setAccessOpen((on) => !on)}
          className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-ink hover:bg-hover">
          <Eye size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />
          <span className="min-w-0 flex-1">Visibility</span>
          <ChevronRight size={14} strokeWidth={1.5} className={`shrink-0 text-ink-3 transition-transform ${accessOpen ? 'rotate-90' : ''}`} />
        </button>
        {accessOpen && ACCESS.map(({ id, label, hint }) => (
          <button key={id} type="button" role="menuitemradio" aria-checked={menu.a.access === id} data-access={id} onClick={() => chooseAccess(id)}
            className="flex w-full items-start gap-2 rounded-sm py-1 pr-2 pl-2 text-left text-sm text-ink hover:bg-hover">
            <span className="flex h-5 w-4 shrink-0 items-center justify-center">{menu.a.access === id && <Check size={14} strokeWidth={2} />}</span>
            <span className="flex min-w-0 flex-col"><span>{label}</span><span className="text-xs text-ink-3">{hint}</span></span>
          </button>
        ))}
        <MenuItem icon={Link2} data-menu-share onClick={() => pick((a) => setDialog({ kind: 'share', a, state: local(a) }))}>Share / Manage link</MenuItem>
        {copyRow}
        {/* Private analytics (creator-analytics-contract.md): the owner's public canvases only, never anyone else. */}
        {menu.a.access === 'public' && <MenuItem icon={BarChart3} data-menu-analytics onClick={() => pick((a) => setDialog({ kind: 'analytics', a }))}>Analytics</MenuItem>}
        <div className="my-1 border-t border-line" />
        <MenuItem icon={Archive} onClick={() => pick(archive)}>Archive</MenuItem>
        <MenuItem icon={Trash2} data-menu-trash onClick={() => pick((a) => setDialog({ kind: 'trash', a }))}>Move to Trash</MenuItem>
      </> : null}
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
    {dialog?.kind === 'private' && (
      <ConfirmDialog title={PRIVATE_CONFIRM.title} body={PRIVATE_CONFIRM.body} confirmLabel={PRIVATE_CONFIRM.action} confirmVariant="primary"
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
        onPublish={run(async (publish) => {
          // Publishing needs the board on the server; its first copy is this browser's (canvas-visibility.js setAccess).
          if (publish && state && (await api(base)).exists === false) await api(base, { method: 'PUT', body: JSON.stringify({ state }) });
          await post(`/api/apps/${a.name}/${publish ? 'publish' : 'unpublish'}`);
        })} />
    </div>
  );
}
