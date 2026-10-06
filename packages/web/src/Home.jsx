import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Compass } from 'lucide-react';
import { navigate } from './api.js';
import { reviewTools } from './flags.js';
import { openHref, readContinue, readRecent, recentCard, recentItems } from './home/continue.js';
import { Creator, ForkedFrom, Forks, SourceLink } from './home/Provenance.jsx';
import { cardModel, creatorLabel, forkLabel } from './home/provenance.js';
import { fixturesOn, useFixtures } from './home/review-fixtures.js';
import Shell from './Shell.jsx';
import { Button, EmptyState, KindIcon, Pill, SkeletonRows, toast } from './ui.jsx';

// Home (T02 §3, preview build only): Continue, Recent, Start - three blocks, no others.
// Composition follows Gate B (Figma F1): Continue as a callout, Recent as a gallery of compact
// resource cards. Styling (6px radius, 1px line border, no shadow, 12px labels) is design/notion.md.
// ponytail: the Authored path card (§3.1.3) is left out - learn_courses keeps no learner
// step pointer, so 'Step 3 of 7' has no source yet; add it once that source is decided.
const KIND = { repository: 'Project', canvas: 'Canvas', job: 'Job', server: 'Server' };
const HEADING = 'pb-1 text-xs text-ink-2';
const CARD = 'rounded-lg border border-line bg-white';
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3';
// The Start dialog lives once in main.jsx Root (StartHost); pages only ask for it.
const start = () => window.dispatchEvent(new CustomEvent('small:start', { detail: { path: 'repository' } }));

export default function Home() {
  return <Shell>{(data, load) => <HomeContent data={data} load={load} />}</Shell>;
}

function HomeContent({ data, load }) {
  const ready = data && !data.error;
  const apps = ready ? data.apps : [];
  const recent = readRecent(localStorage);
  const cont = ready ? readContinue({ org: data.org, email: data.email, recent, catalog: apps, storage: localStorage }) : null;
  // Review fixtures (preview only, ?fixtures=1) lead Recent: an original, a fork, an original canvas.
  const fixtures = reviewTools && fixturesOn(localStorage, window.location.search, reviewTools);
  const fx = useFixtures(fixtures);
  const shown = fx ? fx.RECENT_FIXTURES.map((n) => ({ ...fx.FIXTURES.find((a) => a.name === n), org: data?.org })) : [];
  const items = [...shown, ...recentItems(recent, apps)].slice(0, 5);
  const cardCtx = { catalog: apps, email: data?.email, storage: localStorage };
  const startButton = <Button variant="primary" onClick={start}>Start a rabbit hole</Button>;
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1150px] space-y-8 px-24 pb-12 pt-12 max-lg:px-8 max-md:px-4 max-md:pt-6">
        {!data && [2, 3, 1].map((rows, i) => <SkeletonRows key={i} rows={rows} />)}
        {data?.error && (
          <div className="flex items-center gap-3 text-sm text-ink-2">✗ {data.error} <Button variant="secondary" size="sm" onClick={load}>Retry</Button></div>
        )}
        {ready && !apps.length && (
          <section>
            {startButton}
            <p className="pt-3 text-sm text-ink-2">Start from a repository, sources, a question, or a blank canvas.</p>
          </section>
        )}
        {fixtures && <div role="note" className="rounded-md bg-code px-3 py-2 text-xs text-ink-2">Review fixtures are on: made-up cards, mixed in for design review. They open nothing and are stored nowhere. <a className="text-accent hover:underline" href="?fixtures=0">Turn off</a></div>}
        {ready && apps.length > 0 && (
          <>
            {cont && <Continue item={cont} />}
            {items.length > 0 && (
              <section aria-label="Recent">
                <h2 className={HEADING}>Recent</h2>
                <ul className={GRID}>{items.map((a) => <RecentCard key={`${a.org}/${a.name}`} app={a} card={recentCard(a, cardCtx)} />)}</ul>
              </section>
            )}
            <section>
              {startButton}
              {!cont && !items.length && <p className="pt-3 text-sm text-ink-2">Start from a repository, sources, a question, or a blank canvas.</p>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

// Continue (user, 2026-09-30): its own kind of card, not a Recent card - a wide resume strip with an
// accent edge and tint, the item and where it left off, and one primary action. The whole card opens it.
function Continue({ item }) {
  const go = () => navigate(openHref(item));
  return (
    <section aria-label="Continue">
      <h2 className={HEADING}>Continue — on this device</h2>
      <div data-continue-card onClick={go} className="lift-card relative flex w-full max-w-[640px] cursor-pointer items-center gap-4 overflow-hidden rounded-xl border border-accent/25 bg-accent/5 py-4 pr-4 pl-5">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-accent" />
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white shadow-sm"><KindIcon kind={item.kind} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-semibold">{item.title}</span>
            <Pill kind={item.kind}>{KIND[item.kind] || item.kind}</Pill>
          </div>
          <p className="truncate pt-0.5 text-sm text-ink-2">{item.lastExplored ? <>Last explored: <span className="text-ink">{item.lastExplored}</span></> : 'Pick up where you left off'}</p>
          {item.next && <p className="truncate text-sm text-ink-2">Next: <span className="text-ink">{item.next}</span></p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {item.canvas && item.kind === 'repository' && <Button variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/apps/${item.slug}`); }}>Open project</Button>}
          <Button variant="primary" onClick={(e) => { e.stopPropagation(); go(); }}>{item.canvas ? 'Continue learning' : 'Continue'} <ArrowRight size={13} className="nudge-arrow" /></Button>
        </div>
      </div>
    </section>
  );
}

// Gate B Resource Card with provenance (user, 2026-09-28): title and kind; creator and the
// source-owner check; where it comes from and a short context; Forked from; then the next action
// as a text link that shows on hover (always on phones and touch screens) and the fork count.
function RecentCard({ app, card }) {
  const { action, meta } = card;
  const m = cardModel(app);
  const [lead, last] = meta.length > 1 ? [meta.slice(0, -1).join(' · '), meta.at(-1)] : [meta.join(' · '), ''];
  const lineA = m.source || (app.fixture ? (m.forkedFrom ? null : 'Standalone') : lead);
  const lineB = app.fixture ? m.summary : !action ? 'Its content is stored only in the browser that created it.' : m.source ? lead : last;
  const go = (fn) => () => (app.fixture ? toast('Review fixture: there is nothing behind this card.') : fn());
  const link = 'inline-flex items-center gap-1 self-start text-xs font-medium text-accent hover:underline opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100';
  return (
    <li data-recent-card onClick={action?.to ? go(() => navigate(action.to)) : undefined} className={`${CARD} group flex min-w-0 flex-col gap-1 p-3 ${action?.to ? 'lift-card cursor-pointer' : ''}`}>
      <div className="flex min-w-0 items-start gap-2">
        <span className="pt-0.5"><KindIcon kind={app.kind} schedule={app.schedule} /></span>
        <span className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-medium leading-snug">{m.title}</span>
        <Pill kind={app.kind}>{KIND[app.kind] || app.kind}</Pill>
      </div>
      <Creator m={m} />
      {m.source ? <SourceLink m={m} /> : lineA && <span className="truncate text-xs text-ink-2">{lineA}</span>}
      <ForkedFrom m={m} onOpen={(id) => go(() => navigate(`/apps/${id}`))()} />
      {lineB && <span className="line-clamp-2 text-xs text-ink-3">{lineB}</span>}
      <div className="mt-auto flex items-center gap-2 pt-1">
        {action?.to && <button type="button" className={link} onClick={(e) => { e.stopPropagation(); go(() => navigate(action.to))(); }}>{action.label} <ArrowRight size={12} className="nudge-arrow" /></button>}
        {action?.href && <a href={action.href} target="_blank" rel="noreferrer" className={link}>{action.label} <ArrowUpRight size={12} /></a>}
        <span className="flex-1" />
        <Forks m={m} />
      </div>
    </li>
  );
}

// Explore preview (T02 §11): demo data behind a banner; Save stays in this browser.
export function ExplorePreview() {
  return <Shell>{() => <Explore />}</Shell>;
}

// Explore (docs/features/explore-publish.md): only canvases their owners published, newest first - no ranking. A card is
// its title, the creator's @handle (display name first when set; never an email) and the canonical direct-fork count,
// the same Forks the Library cards show; it opens the read-only published canvas at /e/<token>.
function Explore() {
  const [cards, setCards] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/api/learn/boards/published', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : { canvases: [] }))
      .then(data => { if (live) setCards(data.canvases || []); }).catch(() => { if (live) setCards([]); });
    return () => { live = false; };
  }, []);
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-[900px] px-24 pb-12 pt-12 max-lg:px-8 max-md:px-4 max-md:pt-6">
        <h1 className="text-[40px] font-bold leading-[1.2] tracking-[-0.01em]">Explore</h1>
        <p className="pb-8 pt-1 text-sm text-ink-2">Discover rabbit holes, projects, and learning resources shared beyond your library.</p>
        {cards === null && <SkeletonRows rows={3} />}
        {cards?.length === 0 && <div data-explore-empty><EmptyState icon={Compass}>Nothing has been published yet. Canvases people publish to Explore will appear here.</EmptyState></div>}
        {cards?.length > 0 && (
          <div data-explore-list className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            {cards.map(card => (
              <a key={card.url} data-explore-card href={card.url} className="flex flex-col gap-1.5 rounded-md border border-line bg-white p-4 text-ink no-underline transition-colors hover:bg-hover">
                <span data-card-title className="line-clamp-2 text-sm font-semibold">{card.title}</span>
                <span data-creator className="truncate text-xs text-ink-2">{creatorLabel(card.creator)}</span>
                <Forks m={{ forks: forkLabel(card.fork_count) }} />
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
