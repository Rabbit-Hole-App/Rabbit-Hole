import { useState } from 'react';
import { AppWindow, Archive, ArrowRight, ArrowUpRight, Check, FolderGit2, ListFilter, Loader2, Play, Shapes, UserRound, X } from 'lucide-react';
import { titleOf } from './agent/catalog.js';
import { ago, navigate } from './api.js';
import { browserOnly, onAnotherDevice, readRecent } from './home/continue.js';
import { cardModel } from './home/provenance.js';
import LearningCard, { CARD_GRID, IN_THIS_BROWSER, ON_ANOTHER_DEVICE } from './home/LearningCard.jsx';
import { useCardMenu } from './home/CardMenu.jsx';
import { sortCards } from './home/card-sort.js';
import { chipHref, isMine, libraryHref, librarySections, ofType, SCOPES, SECTION_LIMIT, TYPES } from './library-filter.js';
import { Button, KindIcon, Menu, MenuItem, Pill, toast } from './ui.jsx';

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
  // The card ⋮ (home/CardMenu.jsx), the same menu Home's Recent cards open (owner, 2026-10-08); its Archive asks in App.jsx.
  const cardMenu = useCardMenu({ org: data?.org, email: data?.email, apps: data?.apps || [], onArchive, onChanged: onForked });
  const ctx = { org: data?.org, email: data?.email, storage: localStorage };
  const card = (a) => <LibraryCard key={a.name} a={a} ctx={ctx} onMore={cardMenu.onMore(a)} />;
  const recent = readRecent(localStorage);
  const sections = librarySections(apps, recent).map((s) => (s.key === 'apps' ? s : { ...s, items: sortCards(ofType(apps, s.key), sort).slice(0, SECTION_LIMIT) }));
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
      {cardMenu.element}
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
  const note = a.fixture ? null
    : a.kind === 'canvas' ? (away ? ON_ANOTHER_DEVICE : browserOnly(a, ctx.email, ctx.storage) ? IN_THIS_BROWSER : null)
    : a.status !== 'ready' ? `Map ${a.status}` : null;
  return (
    <LearningCard kind={a.kind} m={cardModel(a)} attrs={{ 'data-library-card': a.kind === 'repository' ? 'project' : 'canvas' }}
      href={a.fixture ? null : `/apps/${a.name}`} onOpen={() => open(a)} mine={!a.fixture && isMine(a, ctx.email)}
      access={a.kind === 'canvas' && !a.fixture ? a.access : null} onMore={onMore} note={note}
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
