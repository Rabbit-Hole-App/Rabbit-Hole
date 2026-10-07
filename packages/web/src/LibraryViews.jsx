import { useState } from 'react';
import { AlignLeft, AppWindow, Archive, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Check, ChevronRight, CopyPlus, Eye, FolderGit2, GitFork, Link2, Trash2, ListFilter, Loader2, Network, PenLine, Pin, PinOff, Play, UserRound, X } from 'lucide-react';
import { titleOf } from './agent/catalog.js';
import { ago, api, navigate } from './api.js';
import { onAnotherDevice, readRecent } from './home/continue.js';
import { canvasKeys, localBoard } from './home/canvas-local.js';
import ForkButton from './ForkButton.jsx';
import { postFork } from './canvas-fork.js';
import { readPinned, togglePin } from './home/pinned.js';
import { cardModel } from './home/provenance.js';
import LearningCard, { CARD_GRID, IN_THIS_BROWSER, ON_ANOTHER_DEVICE, SortMenu, menuAt } from './home/LearningCard.jsx';
import { LIBRARY_SORTS, readLibrarySort, saveLibrarySort, sortCards } from './home/card-sort.js';
import { chipHref, isMine, libraryHref, librarySections, ofType, SCOPES, SECTION_LIMIT, TYPES } from './library-filter.js';
import { Button, ConfirmDialog, Input, KindIcon, Menu, MenuItem, Pill, toast } from './ui.jsx';
import { ACCESS, PRIVATE_CONFIRM, confirmsPrivate, setAccess } from './canvas-visibility.js';
import { ExplainerAnalytics } from './CreatorAnalytics.jsx';

// The preview Library (T02 §4, user correction 2026-09-28): what you can return to, learn from
// or build from. Projects and Canvases are cards; Apps are compact operational rows here and the
// table in their own view (App.jsx). Running is a job's capability, never the organizing principle.
const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };
// Review fixtures (home/review-fixtures.js) have no page and are never sent to an API.
const fixtureNote = () => toast('Review fixture: there is nothing behind this card.');
const guard = (a, fn) => () => (a.fixture ? fixtureNote() : fn());
const open = (a) => guard(a, () => navigate(`/apps/${a.name}`))();

export default function LibraryViews({ apps, type, data, onType, onArchive, onRun, runningOf, onForked }) {
  const [menu, setMenu] = useState(null); // { a, top | bottom, left }
  const [accessOpen, setAccessOpen] = useState(false); // the Visibility submenu, inside the same menu
  const [dialog, setDialog] = useState(null); // { kind: rename | describe | private | trash | analytics, a, value?, to? }
  const ctx = { org: data?.org, email: data?.email, storage: localStorage, catalog: data?.apps || [], onForked };
  const more = (a) => stop((e) => { setAccessOpen(false); setMenu({ a, ...menuAt(e.currentTarget, 224) }); });
  const card = (a) => <LibraryCard key={a.name} a={a} ctx={ctx} onMore={more(a)} />;
  const recent = readRecent(localStorage);
  // Library sort (owner 2026-10-06 §18): Last updated by default, over the owner's whole list; the choice is this
  // viewer's, kept in this browser. Apps keep their own order.
  const [sort, setSort] = useState(() => readLibrarySort(localStorage, ctx.org, ctx.email));
  const chooseSort = (id) => { setSort(id); saveLibrarySort(localStorage, ctx.org, ctx.email, id); };
  const sections = librarySections(apps, recent).map((s) => (s.key === 'apps' ? s : { ...s, items: sortCards(ofType(apps, s.key), sort).slice(0, SECTION_LIMIT) }));
  const pick = (fn) => { const a = menu.a; setMenu(null); guard(a, () => fn(a))(); };
  // Duplicate (docs/features/canvas-naming.md): a private copy of your own canvas, titled "Title (2)", "(3)"... by the
  // server; never a fork. This browser's copy of the content travels, as Fork's does, until the server owns content.
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
      <div className="flex justify-end pb-4"><SortMenu options={LIBRARY_SORTS} value={sort} onChange={chooseSort} /></div>
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
          <MenuItem icon={Link2} onClick={() => pick((a) => navigate(`/apps/${a.name}?share=1`))}>Share / Manage link</MenuItem>
          {/* Private analytics (creator-analytics-contract.md): the owner's public canvases only, never anyone else. */}
          {menu.a.access === 'public' && <MenuItem icon={BarChart3} data-menu-analytics onClick={() => pick((a) => setDialog({ kind: 'analytics', a }))}>Analytics</MenuItem>}
          <div className="my-1 border-t border-line" />
          <MenuItem icon={Archive} onClick={() => pick(onArchive)}>Archive…</MenuItem>
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
const FILTER_ICONS = { projects: FolderGit2, canvases: PenLine, apps: AppWindow };
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
// truthful content state until server persistence makes it cross-device (owner §5: never hidden before then).
// The whole card and its title open it (no Open button, §13); its own canvases carry the blue Owned-by-you badge beside
// the @handle. A canvas keeps Fork (docs/features/canvas-forking.md) as the neutral secondary action §13 names: your own
// canvas forks from what this browser holds, else its server copy, and the new canvas joins this Library at once.
function LibraryCard({ a, ctx, onMore }) {
  const away = a.kind === 'canvas' && !a.fixture && onAnotherDevice(a, ctx.email, ctx.storage);
  // No 'Map ready' label (owner, 2026-10-04): only a Map still indexing or failed says so.
  const note = a.fixture ? null
    : a.kind === 'canvas' ? (away ? ON_ANOTHER_DEVICE : IN_THIS_BROWSER)
    : a.status !== 'ready' ? `Map ${a.status}` : null;
  const fork = a.kind !== 'canvas' ? null
    : a.fixture ? <Button size="sm" variant="secondary" onClick={stop(fixtureNote)}><GitFork size={13} strokeWidth={1.8} />Fork</Button>
    : <ForkButton size="sm" source={{ canvas: a.name }} snapshot={() => localBoard(ctx.storage, canvasKeys({ org: a.org || ctx.org, email: a.email || ctx.email, slug: a.name }))} onForked={() => ctx.onForked?.()} />;
  return (
    <LearningCard kind={a.kind} m={cardModel(a)} attrs={{ 'data-library-card': a.kind === 'repository' ? 'project' : 'canvas' }}
      href={a.fixture ? null : `/apps/${a.name}`} onOpen={() => open(a)} mine={!a.fixture && isMine(a, ctx.email)}
      access={a.kind === 'canvas' && !a.fixture ? a.access : null} onMore={onMore} note={note} actions={fork}
      onForkedFromOpen={(id) => open({ name: id, fixture: a.fixture })} />
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
