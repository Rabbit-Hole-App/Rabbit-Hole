import { useEffect, useState } from 'react';
import { AlignLeft, AppWindow, Archive, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Check, ChevronRight, CopyPlus, Eye, FolderGit2, Link2, Trash2, ListFilter, Loader2, Network, PenLine, Pin, PinOff, Play, Shapes, UserRound, X } from 'lucide-react';
import { titleOf } from './agent/catalog.js';
import { ago, api, navigate } from './api.js';
import { browserOnly, onAnotherDevice, readRecent } from './home/continue.js';
import { canvasKeys, localBoard } from './home/canvas-local.js';
import { postFork } from './canvas-fork.js';
import SharePanel from './SharePanel.jsx';
import { readPinned, togglePin } from './home/pinned.js';
import { cardModel } from './home/provenance.js';
import LearningCard, { CARD_GRID, IN_THIS_BROWSER, ON_ANOTHER_DEVICE, menuAt } from './home/LearningCard.jsx';
import { sortCards } from './home/card-sort.js';
import { chipHref, isMine, libraryHref, librarySections, ofType, SCOPES, SECTION_LIMIT, TYPES } from './library-filter.js';
import { Button, ConfirmDialog, Input, KindIcon, Menu, MenuItem, Pill, toast } from './ui.jsx';
import { ACCESS, PRIVATE_CONFIRM, confirmsPrivate, setAccess } from './canvas-visibility.js';
import { ExplainerAnalytics } from './CreatorAnalytics.jsx';
import SharedWithYou from './comments/SharedWithYou.jsx';
import { newComments, useCommentUnread } from './comments/unread.js';

// The preview Library (T02 §4, user correction 2026-09-28): what you can return to, learn from
// or build from. Projects and Canvases are cards; Apps are compact operational rows here and the
// table in their own view (App.jsx). Running is a job's capability, never the organizing principle.
const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };
// Review fixtures (home/review-fixtures.js) have no page and are never sent to an API.
const fixtureNote = () => toast('Review fixture: there is nothing behind this card.');
const guard = (a, fn) => () => (a.fixture ? fixtureNote() : fn());
const open = (a) => guard(a, () => navigate(`/apps/${a.name}`))();

// `sort`: the Library sort, chosen beside Filters (App.jsx) over the owner's whole list; Apps keep their own order.
export default function LibraryViews({ apps, type, data, sort, onType, onArchive, onRun, runningOf, onForked }) {
  const [menu, setMenu] = useState(null); // { a, top | bottom, left }
  const [accessOpen, setAccessOpen] = useState(false); // the Visibility submenu, inside the same menu
  const [dialog, setDialog] = useState(null); // { kind: rename | describe | private | trash | analytics | share, a, value?, to?, state? }
  // Comment news (docs/features/canvas-comments.md): a line on your canvases' cards, and the canvases shared with you.
  const unread = useCommentUnread();
  const ctx = { org: data?.org, email: data?.email, storage: localStorage, catalog: data?.apps || [], onForked, unread: unread.owned };
  const more = (a) => stop((e) => { setAccessOpen(false); setMenu({ a, ...menuAt(e.currentTarget, 224) }); });
  const card = (a) => <LibraryCard key={a.name} a={a} ctx={ctx} onMore={more(a)} />;
  const recent = readRecent(localStorage);
  const sections = librarySections(apps, recent).map((s) => (s.key === 'apps' ? s : { ...s, items: sortCards(ofType(apps, s.key), sort).slice(0, SECTION_LIMIT) }));
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
  // The owned-card menu (docs/features/visibility-menu.md). Every change reloads the Library from the server.
  const local = (a) => localBoard(ctx.storage, canvasKeys({ org: a.org || ctx.org, email: a.email || ctx.email, slug: a.name }));
  const act = async (work, done) => {
    try { await work(); if (done) toast(done); ctx.onForked?.(); } catch (error) { toast(error.message, { tone: 'error' }); }
  };
  const changeAccess = (a, to) => act(() => setAccess(api, a, to, local(a)), `${a.title} is now ${ACCESS.find((x) => x.id === to).label.toLowerCase()}`);
  const chooseAccess = (to) => pick((a) => (confirmsPrivate(a.access, to) ? setDialog({ kind: 'private', a, to }) : changeAccess(a, to)));
  const patch = (a, body, done) => act(() => api(`/api/apps/${a.name}`, { method: 'PATCH', body: JSON.stringify(body) }), done);
  const moveToTrash = (a) => act(() => api(`/api/apps/${a.name}/trash`, { method: 'POST', body: '{}' }), `Moved "${titleOf(a)}" to Trash`);
  const kindWord = (a) => (a.kind === 'repository' ? 'project' : 'canvas');
  // A typed title is kept exactly (canvas-naming.md); a repeat only earns a quiet note.
  const sameTitle = dialog?.kind === 'rename' && apps.some((x) => x.kind === 'canvas' && x.name !== dialog.a.name && x.title === dialog.value.trim());
  // The sidebar has no Apps tree in the preview, so projects and canvases are pinned from here.
  const pinnedNow = menu && ctx.email && readPinned(localStorage, ctx.org, ctx.email).includes(menu.a.name);
  return (
    <>
      {type ? <ul className={CARD_GRID}>{sortCards(ofType(apps, type), sort).map(card)}</ul> : (
        <div className="space-y-10">
          {sections.filter((s) => s.items.length).map((s) => (
            <section key={s.key} aria-label={s.label}>
              <div className="flex h-8 items-center justify-between pb-1">
                <h2 className="text-sm font-medium">{s.label} <span className="font-normal text-ink-3">{s.items.length + s.more}</span></h2>
                <Button size="sm" variant="ghost" onClick={() => onType(s.key)}>View all {s.items.length + s.more} <ArrowRight size={13} /></Button>
              </div>
              {s.key === 'apps'
                ? <ul>{s.items.map((a) => <AppRow key={a.name} a={a} running={runningOf(a)} onRun={(x) => guard(x, () => onRun(x))()} />)}</ul>
                : <ul className={CARD_GRID}>{s.items.map(card)}</ul>}
            </section>
          ))}
        </div>
      )}
      {!type && <SharedWithYou unread={unread.shared} />}
      <Menu portal open={!!menu} onClose={() => setMenu(null)} style={{ top: menu?.top, bottom: menu?.bottom, left: menu?.left }} className="w-56">
        {menu?.a.kind === 'repository' ? (
          <>
            {ctx.email && <MenuItem icon={pinnedNow ? PinOff : Pin} onClick={() => pick((a) => togglePin(localStorage, ctx.org, ctx.email, a.name))}>{pinnedNow ? 'Unpin' : 'Pin'}</MenuItem>}
            <MenuItem icon={BookOpen} onClick={() => pick((a) => navigate(`/apps/${a.name}?tab=learn`))}>Learn</MenuItem>
            <MenuItem icon={Network} onClick={() => pick((a) => navigate(`/apps/${a.name}?tab=map`))}>Map</MenuItem>
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
          {/* Private analytics (creator-analytics-contract.md): the owner's public canvases only, never anyone else. */}
          {menu.a.access === 'public' && <MenuItem icon={BarChart3} data-menu-analytics onClick={() => pick((a) => setDialog({ kind: 'analytics', a }))}>Analytics</MenuItem>}
          <div className="my-1 border-t border-line" />
          <MenuItem icon={Archive} onClick={() => pick(onArchive)}>Archive</MenuItem>
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
      {dialog?.kind === 'trash' && (
        <ConfirmDialog title={`Move this ${kindWord(dialog.a)} to Trash?`} confirmLabel="Move to Trash"
          body="It will disappear from your Library and public/shared access will stop. Existing forks will not be deleted. You can restore it from Trash."
          onCancel={() => setDialog(null)} onConfirm={() => { const { a } = dialog; setDialog(null); moveToTrash(a); }} />
      )}
    </>
  );
}

// One Filters control instead of permanent tabs (user, 2026-09-28): Type and Ownership in a popover.
// It, View all and the Agent Bar's filter_library all set the same URL state (library-filter.js).
const setFilter = (key, value) => navigate(chipHref(window.location.search, key, value));
// Each filter row carries an icon: a type's matches its cards (repository, canvas pencil, app).
const FILTER_ICONS = { projects: FolderGit2, canvases: Shapes, apps: AppWindow };
export function LibraryFilters({ type, section, archived }) {
  const [open, setOpen] = useState(false);
  const count = [type, section].filter(Boolean).length;
  const item = (label, on, pick, icon) => (
    <MenuItem key={label} icon={icon} onClick={() => { pick(); setOpen(false); }}>
      <span className="flex w-full items-center justify-between">{label}{on && <Check size={14} strokeWidth={2} />}</span>
    </MenuItem>
  );
  const heading = (text) => <div className="px-2 pb-1 pt-2 text-xs text-ink-3">{text}</div>;
  return (
    <div className="relative">
      <Button variant="secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><ListFilter size={14} /> Filters{count > 0 && ` · ${count}`}</Button>
      <Menu open={open} onClose={() => setOpen(false)} className="top-10 right-0 w-56">
        {heading('Type')}
        {Object.entries(TYPES).map(([k, t]) => item(t.label, type === k && !archived, () => setFilter('type', type === k && !archived ? null : k), FILTER_ICONS[k]))}
        {item('Archived canvas', archived, () => { const q = new URLSearchParams(window.location.search); navigate(libraryHref({ f: q.get('f'), s: q.get('s'), ...(archived ? {} : { type: 'canvases', archived: '1' }) })); }, Archive)}
        {heading('Ownership')}
        {Object.entries(SCOPES).map(([k, label]) => item(label, section === k, () => setFilter('s', section === k ? null : k), UserRound))}
        {count > 0 && <><div className="my-1 border-t border-line" /><MenuItem icon={X} className="text-ink-2" onClick={() => { navigate('/library'); setOpen(false); }}>Clear filters</MenuItem></>}
      </Menu>
    </div>
  );
}

export function ActiveFilters({ type, section, archived }) {
  const pills = [
    type && [archived ? 'Archived canvas' : TYPES[type].label, () => setFilter('type', null)],
    section && [SCOPES[section], () => setFilter('s', null)],
  ].filter(Boolean);
  if (!pills.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-4">
      {pills.map(([label, clear]) => (
        <span key={label} className="inline-flex h-6 items-center gap-1 rounded-md bg-active pl-2 pr-1 text-xs text-ink">
          {label}
          <button type="button" aria-label={`Remove filter ${label}`} onClick={clear} className="cursor-pointer rounded-sm p-0.5 text-ink-2 hover:bg-hover hover:text-ink"><X size={11} /></button>
        </span>
      ))}
    </div>
  );
}

// The Library's card (docs/features/card-redesign.md): the canonical LearningCard with the owner's ⋮, and this browser's
// truthful content state only for a canvas whose board is not on the server (canvas-persistence.md, step 8).
// Its title and its hover Open open it; its own canvases carry the blue Owned-by-you badge beside the @handle. No Fork
// on your own canvas (owner, 2026-10-08): Duplicate in the ⋮ copies it; the footer reads N forks once others forked it.
function LibraryCard({ a, ctx, onMore }) {
  const away = a.kind === 'canvas' && !a.fixture && onAnotherDevice(a, ctx.email, ctx.storage);
  // No 'Map ready' label (owner, 2026-10-04): only a Map still indexing or failed says so.
  const state = a.fixture ? null
    : a.kind === 'canvas' ? (away ? ON_ANOTHER_DEVICE : browserOnly(a, ctx.email, ctx.storage) ? IN_THIS_BROWSER : null)
    : a.status !== 'ready' ? `Map ${a.status}` : null;
  const news = a.kind === 'canvas' && !a.fixture ? newComments(ctx.unread?.[a.name]) : null;
  const note = state || news ? <>{state}{news && <span data-comment-news className="font-medium text-accent">{news}</span>}</> : null;
  return (
    <LearningCard kind={a.kind} m={cardModel(a)} attrs={{ 'data-library-card': a.kind === 'repository' ? 'project' : 'canvas' }}
      href={a.fixture ? null : `/apps/${a.name}`} onOpen={() => open(a)} mine={!a.fixture && isMine(a, ctx.email)}
      access={a.kind === 'canvas' && !a.fixture ? a.access : null} onMore={onMore} note={note}
      onForkedFromOpen={(id) => open({ name: id, fixture: a.fixture })} />
  );
}

// Share / Manage link from the ⋮ (owner, 2026-10-08): the canvas page's own Share panel as a popup over the Library, on
// the same routes; closing it leaves the Library as it was. `state` is this browser's copy, sent with a first share or
// publish as Visibility's is. Every change reloads the Library, so the card's visibility follows.
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

// Apps in All: one dense row each - what it is and its state; Open always, Run only on a job and
// only on hover (always on phones and touch screens, which have no hover).
function AppRow({ a, running, onRun }) {
  const status = a.kind !== 'job' ? `Deployed ${ago(a.deployed_at || a.created_at)}`
    : running ? null
    : a.lastRun ? `${a.lastRun.status === 'finished' ? '✓' : '✗'} ran ${ago(a.lastRun.startedAt)}` : 'Never run';
  return (
    <li data-library-app-row onClick={() => open(a)} className="group flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-hover">
      <KindIcon kind={a.kind} schedule={a.schedule} />
      <span className="min-w-0 max-w-[40%] shrink-0 truncate font-medium">{titleOf(a)}</span>
      <Pill kind={a.kind}>{a.kind}</Pill>
      <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{status ?? <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> running</span>}</span>
      {a.kind === 'job' && !running && (
        <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100" onClick={stop(() => onRun(a))}><Play size={12} /> Run</Button>
      )}
      {a.kind !== 'job' && a.url && (
        <a href={a.url} target="_blank" rel="noreferrer" title="Open the app" onClick={(e) => e.stopPropagation()} className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-ink-2 hover:bg-white hover:text-ink"><ArrowUpRight size={14} /></a>
      )}
    </li>
  );
}
