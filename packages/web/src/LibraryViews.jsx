import { useState } from 'react';
import { AlignLeft, AppWindow, Archive, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, CopyPlus, Eye, FolderGit2, Link2, Trash2, GitFork, ListFilter, Loader2, MoreHorizontal, Network, PenLine, Pin, PinOff, Play, UserRound, X } from 'lucide-react';
import { titleOf } from './agent/catalog.js';
import { ago, api, navigate } from './api.js';
import { learnProgress, onAnotherDevice, readRecent } from './home/continue.js';
import { canvasKeys, localBoard } from './home/canvas-local.js';
import ForkButton from './ForkButton.jsx';
import { postFork } from './canvas-fork.js';
import { readPinned, togglePin } from './home/pinned.js';
import { Creator, ForkedFrom, Forks, SourceLink } from './home/Provenance.jsx';
import { cardModel } from './home/provenance.js';
import { byRecent, chipHref, libraryHref, librarySections, ofType, SCOPES, TYPES } from './library-filter.js';
import { Button, ConfirmDialog, IconBtn, Input, KindIcon, Menu, MenuItem, Pill, toast } from './ui.jsx';
import { ACCESS, PRIVATE_CONFIRM, confirmsPrivate, setAccess } from './canvas-visibility.js';

// The preview Library (T02 §4, user correction 2026-09-28): what you can return to, learn from
// or build from. Projects and Canvases are cards; Apps are compact operational rows here and the
// table in their own view (App.jsx). Running is a job's capability, never the organizing principle.
const CARD = 'rounded-lg border border-line bg-white';
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3';
const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };
// Review fixtures (home/review-fixtures.js) have no page and are never sent to an API.
const fixtureNote = () => toast('Review fixture: there is nothing behind this card.');
const guard = (a, fn) => () => (a.fixture ? fixtureNote() : fn());
const open = (a) => guard(a, () => navigate(`/apps/${a.name}`))();

export default function LibraryViews({ apps, type, data, onType, onArchive, onRun, runningOf, onForked }) {
  const [menu, setMenu] = useState(null); // { a, top, left }
  const [accessOpen, setAccessOpen] = useState(false); // the Visibility submenu, inside the same menu
  const [dialog, setDialog] = useState(null); // { kind: rename | describe | private | trash, a, value?, to? }
  const ctx = { org: data?.org, email: data?.email, storage: localStorage, catalog: data?.apps || [], onForked };
  const more = (a) => stop((e) => { const r = e.currentTarget.getBoundingClientRect(); setAccessOpen(false); setMenu({ a, top: r.bottom + 4, left: r.right - 224 }); });
  const card = (a) => (a.kind === 'repository' ? <ProjectCard key={a.name} a={a} ctx={ctx} onMore={more(a)} /> : <CanvasCard key={a.name} a={a} ctx={ctx} onMore={more(a)} />);
  const recent = readRecent(localStorage);
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
      {type ? <ul className={GRID}>{byRecent(ofType(apps, type), recent).map(card)}</ul> : (
        <div className="space-y-10">
          {librarySections(apps, recent).filter((s) => s.items.length).map((s) => (
            <section key={s.key} aria-label={s.label}>
              <div className="flex h-8 items-center justify-between pb-1">
                <h2 className="text-sm font-medium">{s.label} <span className="font-normal text-ink-3">{s.items.length + s.more}</span></h2>
                <Button size="sm" variant="ghost" onClick={() => onType(s.key)}>View all {s.items.length + s.more} <ArrowRight size={13} /></Button>
              </div>
              {s.key === 'apps'
                ? <ul>{s.items.map((a) => <AppRow key={a.name} a={a} running={runningOf(a)} onRun={(x) => guard(x, () => onRun(x))()} />)}</ul>
                : <ul className={GRID}>{s.items.map(card)}</ul>}
            </section>
          ))}
        </div>
      )}
      <Menu portal open={!!menu} onClose={() => setMenu(null)} style={{ top: menu?.top, left: menu?.left }} className="w-56">
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

// Card hierarchy (user, 2026-09-28): title; creator and the source-owner check; source and a
// short context; provenance when forked; then light metadata, the fork count and one action (canvases add Fork).
// Title and footer are the card's controls; a click anywhere else on it opens it too.
function Card({ kind, a, m, badge, action, fork = null, onMore, source, context, meta }) {
  return (
    <li data-library-card={kind} onClick={() => open(a)} className={`${CARD} lift-card group flex min-h-[156px] min-w-0 cursor-pointer flex-col gap-1 p-4`}>
      <div className="flex min-w-0 items-start gap-2">
        <span className="pt-0.5"><KindIcon kind={a.kind} /></span>
        <button type="button" data-card-title onClick={stop(() => open(a))} className="line-clamp-2 min-w-0 flex-1 cursor-pointer text-left text-[15px] font-semibold leading-snug">{m.title}</button>
        {badge}
      </div>
      <Creator m={m} />
      {source}
      <ForkedFrom m={m} onOpen={(id) => open({ name: id, fixture: a.fixture })} />
      {context}
      {meta}
      <div className="mt-auto flex items-center gap-2 pt-3">
        <Button size="sm" variant="secondary" onClick={stop(() => open(a))}>{action} <ArrowRight size={13} className="nudge-arrow" /></Button>
        {fork}
        <span className="flex-1" />
        <Forks m={m} />
        <IconBtn title="More" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100" onClick={onMore}><MoreHorizontal size={16} strokeWidth={1.5} /></IconBtn>
      </div>
    </li>
  );
}

// The strongest object: the repository's short name, where it comes from, and where the learner
// left off in this browser (Learn's own chat and outline, never an inference).
function ProjectCard({ a, ctx, onMore }) {
  const m = cardModel(a);
  const p = !a.fixture && learnProgress(a, ctx);
  const canvases = ctx.catalog.filter((c) => c.kind === 'canvas' && c.project === a.name).length;
  // No 'Map ready' label (owner, 2026-10-04): only a Map still indexing or failed says so.
  const source = [a.commit_sha?.slice(0, 7), a.status !== 'ready' && `Map ${a.status}`, canvases && `${canvases} canvas${canvases > 1 ? 'es' : ''}`].filter(Boolean).join(' · ');
  return (
    <Card kind="project" a={a} m={m} onMore={onMore} action={p?.lastExplored || p?.next ? 'Continue' : 'Open'} badge={<Pill kind="repository">Project</Pill>}
      source={<SourceLink m={m} suffix={a.branch && a.branch !== 'main' && a.branch !== 'master' ? ` · ${a.branch}` : ''} />}
      context={(
        <>
          {m.summary && <p className="line-clamp-2 pt-1 text-xs text-ink">{m.summary}</p>}
          {!a.fixture && (
            <div className="space-y-0.5 pt-1 text-xs">
              {p?.lastExplored && <p className="truncate text-ink-2">Last explored: <span className="text-ink">{p.lastExplored}</span></p>}
              {p?.next && <p className="truncate text-ink-2">Continue: <span className="text-ink">{p.next}</span></p>}
              {!p?.lastExplored && !p?.next && <p className="text-ink-3">Not explored in this browser yet</p>}
            </div>
          )}
        </>
      )}
      meta={<span className="truncate pt-1 text-xs text-ink-3">{source}</span>} />
  );
}

function CanvasCard({ a, ctx, onMore }) {
  const m = cardModel(a);
  const project = ctx.catalog.find((p) => p.name === a.project);
  const away = !a.fixture && onAnotherDevice(a, ctx.email, ctx.storage);
  const last = !a.fixture && !away && learnProgress(a, ctx)?.lastExplored;
  // ponytail: canvases record created_at only (content lives in the browser), so no 'last edited' yet.
  // [Open] [Fork] (docs/features/canvas-forking.md): your own canvas forks from what this browser holds,
  // else its server copy; the new canvas joins this Library at once.
  const fork = a.fixture
    ? <Button size="sm" variant="secondary" onClick={stop(fixtureNote)}><GitFork size={13} strokeWidth={1.8} />Fork</Button>
    : <ForkButton size="sm" source={{ canvas: a.name }} snapshot={() => localBoard(ctx.storage, canvasKeys({ org: a.org || ctx.org, email: a.email || ctx.email, slug: a.name }))} onForked={() => ctx.onForked?.()} />;
  return (
    <Card kind="canvas" a={a} m={m} onMore={onMore} action={last ? 'Continue' : 'Open'} fork={fork} badge={<Pill kind="canvas">Canvas</Pill>} meta={(
      <span className="flex min-w-0 items-center gap-1.5 pt-1 text-xs text-ink-3">
        <span className="truncate">Created {ago(a.created_at)}</span>
        {!a.fixture && (away ? <Pill>On another device</Pill> : <span className="truncate">· Content in this browser</span>)}
      </span>
    )}
      source={m.source ? <SourceLink m={m} /> : !m.forkedFrom && <span className="truncate text-xs text-ink-2">{project ? `In ${titleOf(project)}` : 'Standalone'}</span>}
      context={(
        <>
          {m.summary && <p className="line-clamp-2 pt-1 text-xs text-ink">{m.summary}</p>}
          {last && <p className="truncate pt-1 text-xs text-ink-2">Last explored: <span className="text-ink">{last}</span></p>}
        </>
      )} />
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
