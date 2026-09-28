import { useState } from 'react';
import { Archive, ArrowRight, ArrowUpRight, BookOpen, Loader2, MoreHorizontal, Network, Play } from 'lucide-react';
import { titleOf } from './agent/catalog.js';
import { ago, navigate } from './api.js';
import { learnProgress, onAnotherDevice, readRecent } from './home/continue.js';
import { Creator, ForkedFrom, Forks } from './home/Provenance.jsx';
import { cardModel } from './home/provenance.js';
import { byRecent, librarySections, ofType } from './library-filter.js';
import { Button, IconBtn, KindIcon, Menu, MenuItem, Pill, toast } from './ui.jsx';

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

export default function LibraryViews({ apps, type, data, onType, onArchive, onRun, runningOf }) {
  const [menu, setMenu] = useState(null); // { a, top, left }
  const ctx = { org: data?.org, email: data?.email, storage: localStorage, catalog: data?.apps || [] };
  const more = (a) => stop((e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ a, top: r.bottom + 4, left: r.right - 176 }); });
  const card = (a) => (a.kind === 'repository' ? <ProjectCard key={a.name} a={a} ctx={ctx} onMore={more(a)} /> : <CanvasCard key={a.name} a={a} ctx={ctx} onMore={more(a)} />);
  const recent = readRecent(localStorage);
  const pick = (fn) => { const a = menu.a; setMenu(null); guard(a, () => fn(a))(); };
  return (
    <>
      {type ? <ul className={GRID}>{byRecent(ofType(apps, type), recent).map(card)}</ul> : (
        <div className="space-y-10">
          {librarySections(apps, recent).filter((s) => s.items.length).map((s) => (
            <section key={s.key} aria-label={s.label}>
              <div className="flex h-8 items-center justify-between pb-1">
                <h2 className="text-sm font-medium">{s.label} <span className="font-normal text-ink-3">{s.items.length + s.more}</span></h2>
                {s.more > 0 && <Button size="sm" variant="ghost" onClick={() => onType(s.key)}>View all {s.items.length + s.more}</Button>}
              </div>
              {s.key === 'apps'
                ? <ul>{s.items.map((a) => <AppRow key={a.name} a={a} running={runningOf(a)} onRun={(x) => guard(x, () => onRun(x))()} />)}</ul>
                : <ul className={GRID}>{s.items.map(card)}</ul>}
            </section>
          ))}
        </div>
      )}
      <Menu portal open={!!menu} onClose={() => setMenu(null)} style={{ top: menu?.top, left: menu?.left }} className="w-44">
        {menu?.a.kind === 'repository' ? (
          <>
            <MenuItem icon={BookOpen} onClick={() => pick((a) => navigate(`/apps/${a.name}?tab=learn`))}>Learn</MenuItem>
            <MenuItem icon={Network} onClick={() => pick((a) => navigate(`/apps/${a.name}?tab=map`))}>Map</MenuItem>
          </>
        ) : <MenuItem icon={Archive} onClick={() => pick(onArchive)}>Archive…</MenuItem>}
      </Menu>
    </>
  );
}

// Card hierarchy (user, 2026-09-28): title; creator and the source-owner check; source and a
// short context; provenance when forked; then light metadata, the fork count and one action.
// Title and footer are the card's controls; a click anywhere else on it opens it too.
function Card({ kind, a, m, badge, action, onMore, children }) {
  return (
    <li data-library-card={kind} onClick={() => open(a)} className={`${CARD} group flex min-h-[156px] min-w-0 cursor-pointer flex-col gap-1 p-4 transition-colors duration-100 hover:border-line-strong`}>
      <div className="flex min-w-0 items-start gap-2">
        <span className="pt-0.5"><KindIcon kind={a.kind} /></span>
        <button type="button" data-card-title onClick={stop(() => open(a))} className="line-clamp-2 min-w-0 flex-1 cursor-pointer text-left text-[15px] font-semibold leading-snug">{m.title}</button>
        {badge}
      </div>
      <Creator m={m} />
      {children}
      <ForkedFrom m={m} />
      <div className="mt-auto flex items-center gap-2 pt-3">
        <Button size="sm" variant="secondary" onClick={stop(() => open(a))}>{action} <ArrowRight size={13} /></Button>
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
  const source = [a.commit_sha?.slice(0, 7), `Map ${a.status}`, canvases && `${canvases} canvas${canvases > 1 ? 'es' : ''}`].filter(Boolean).join(' · ');
  return (
    <Card kind="project" a={a} m={m} onMore={onMore} action={p?.lastExplored || p?.next ? 'Continue' : 'Open'} badge={<Pill kind="repository">Project</Pill>}>
      <span className="truncate text-xs text-ink-2">{m.source}{a.branch && a.branch !== 'main' && a.branch !== 'master' ? ` · ${a.branch}` : ''}</span>
      {m.summary && <p className="line-clamp-2 pt-1 text-xs text-ink">{m.summary}</p>}
      {!a.fixture && (
        <div className="space-y-0.5 pt-1 text-xs">
          {p?.lastExplored && <p className="truncate text-ink-2">Last explored: <span className="text-ink">{p.lastExplored}</span></p>}
          {p?.next && <p className="truncate text-ink-2">Continue: <span className="text-ink">{p.next}</span></p>}
          {!p?.lastExplored && !p?.next && <p className="text-ink-3">Not explored in this browser yet</p>}
        </div>
      )}
      <span className="truncate pt-1 text-xs text-ink-3">{source}</span>
    </Card>
  );
}

function CanvasCard({ a, ctx, onMore }) {
  const m = cardModel(a);
  const project = ctx.catalog.find((p) => p.name === a.project);
  const away = !a.fixture && onAnotherDevice(a, ctx.email, ctx.storage);
  const last = !a.fixture && !away && learnProgress(a, ctx)?.lastExplored;
  // ponytail: canvases record created_at only (content lives in the browser), so no 'last edited' yet.
  return (
    <Card kind="canvas" a={a} m={m} onMore={onMore} action={last ? 'Continue' : 'Open'} badge={<Pill kind="canvas">Canvas</Pill>}>
      <span className="truncate text-xs text-ink-2">{m.source || (project ? `In ${titleOf(project)}` : m.forkedFrom ? null : 'Standalone')}</span>
      {m.summary && <p className="line-clamp-2 pt-1 text-xs text-ink">{m.summary}</p>}
      {last && <p className="truncate pt-1 text-xs text-ink-2">Last explored: <span className="text-ink">{last}</span></p>}
      <span className="flex min-w-0 items-center gap-1.5 pt-1 text-xs text-ink-3">
        <span className="truncate">Created {ago(a.created_at)}</span>
        {!a.fixture && (away ? <Pill>On another device</Pill> : <span className="truncate">· Content in this browser</span>)}
      </span>
    </Card>
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
