import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Search } from 'lucide-react';
import { navigate } from './api.js';
import { reviewTools } from './flags.js';
import { browserOnly, openHref, readContinue, readRecent, recentCard, recentItems } from './home/continue.js';
import LearningCard, { CARD_GRID, IN_THIS_BROWSER as HERE, ON_ANOTHER_DEVICE as AWAY, SortMenu } from './home/LearningCard.jsx';
import PublicCards, { CreatorChip, ProjectFilter } from './home/PublicCards.jsx';
import { EXPLORE_SORTS } from './home/card-sort.js';
import { cardModel } from './home/provenance.js';
import { fixturesOn, useFixtures } from './home/review-fixtures.js';
import { isMine } from './library-filter.js';
import { loadProfile } from './session-display.js';
import Shell from './Shell.jsx';
import { Button, Input, SkeletonRows, toast } from './ui.jsx';

// Home (T02 §3, preview build only): Continue, Recent, Start - three blocks, no others.
// Composition follows Gate B (Figma F1): Continue as a callout, Recent as a gallery of compact
// resource cards. Styling (6px radius, 1px line border, no shadow, 12px labels) is design/notion.md.
// ponytail: the Authored path card (§3.1.3) is left out - learn_courses keeps no learner
// step pointer, so 'Step 3 of 7' has no source yet; add it once that source is decided.
// The cards are the canonical LearningCard (docs/features/card-redesign.md), the same as the Library's and Explore's.
const HEADING = 'pb-2 text-xs text-ink-2';
const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };
const fixtureNote = () => toast('Review fixture: there is nothing behind this card.');
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
        {/* Start sits top right, the page's one header action (owner, 2026-10-08), as in the Library. */}
        {ready && (
          <div className="flex items-center justify-between gap-4">
            {!cont && !items.length ? <p className="text-sm text-ink-2">Start from a repository or a blank canvas.</p> : <span />}
            {startButton}
          </div>
        )}
        {fixtures && <div role="note" className="rounded-md bg-code px-3 py-2 text-xs text-ink-2">Review fixtures are on: made-up cards, mixed in for design review. They open nothing and are stored nowhere. <a className="text-accent hover:underline" href="?fixtures=0">Turn off</a></div>}
        {ready && apps.length > 0 && (
          <>
            {cont && <Continue item={cont} app={apps.find((a) => a.name === cont.slug)} email={data.email} />}
            {items.length > 0 && (
              <section aria-label="Recent">
                <h2 className={HEADING}>Recent</h2>
                <ul className={CARD_GRID}>{items.map((a) => <RecentCard key={`${a.org}/${a.name}`} app={a} card={recentCard(a, cardCtx)} email={data.email} />)}</ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

// Continue (owner 2026-10-06 §13, §19): the canonical card - its title and a small Continue → open it (never the body)
// and no big blue button - and where this browser left off. "Continue learning" (§19) since the cross-device proof
// (canvas-persistence.md, step 8); the item is still small.recent's (continue.js), not learner activity.
function Continue({ item, app, email }) {
  const go = () => navigate(openHref(item));
  const a = app || { kind: item.kind, name: item.slug, title: item.title };
  return (
    <section aria-label="Continue">
      <h2 className={HEADING}>Continue learning</h2>
      <ul className={CARD_GRID}>
        <LearningCard kind={a.kind} schedule={a.schedule} m={cardModel(a)} attrs={{ 'data-continue-card': '' }} href={openHref(item)} onOpen={go}
          mine={isMine(a, email)} access={a.kind === 'canvas' ? a.access : null}
          note={(
            <>
              <span className="truncate">{item.lastExplored ? <>Last explored: <span className="text-ink-2">{item.lastExplored}</span></> : 'Pick up where you left off'}</span>
              {item.next && <span className="truncate">Next: <span className="text-ink-2">{item.next}</span></span>}
              {item.canvas && browserOnly(a, email, localStorage) && HERE}
            </>
          )}
          cta={<button type="button" data-continue-link onClick={stop(go)} className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-sm text-[13px] font-medium text-accent hover:underline">Continue <ArrowRight size={13} className="nudge-arrow" /></button>} />
      </ul>
    </section>
  );
}

// Recent: the same card for what was opened in this browser. A canvas says where its content is (continue.js
// recentCard: no action means another browser holds it, and then it does not open from here; a board on the server
// says nothing). Jobs and servers keep their own line and action.
function RecentCard({ app, card, email }) {
  const { action, meta } = card;
  const go = (to) => (app.fixture ? fixtureNote() : navigate(to));
  const learning = app.kind === 'canvas' || app.kind === 'repository';
  const note = app.fixture ? null
    : app.kind === 'canvas' ? (!action ? AWAY : browserOnly(app, email, localStorage) ? HERE : null)
    : app.kind === 'repository' ? (app.status !== 'ready' ? `Map ${app.status}` : null)
    : meta.join(' · ');
  const link = 'inline-flex items-center gap-1 rounded-sm text-[13px] font-medium text-accent hover:underline';
  return (
    <LearningCard kind={app.kind} schedule={app.schedule} m={cardModel(app)} attrs={{ 'data-recent-card': '' }}
      href={action?.to && !app.fixture ? action.to : null} onOpen={action?.to ? () => go(action.to) : null}
      mine={!app.fixture && isMine(app, email)} access={app.kind === 'canvas' && !app.fixture ? app.access : null} note={note}
      onForkedFromOpen={(id) => go(`/apps/${id}`)}
      actions={learning ? null : action?.to ? <button type="button" className={`${link} cursor-pointer`} onClick={stop(() => go(action.to))}>{action.label} <ArrowRight size={12} className="nudge-arrow" /></button>
        : action?.href ? <a href={action.href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={link}>{action.label} <ArrowUpRight size={12} /></a> : null} />
  );
}

// Explore preview (T02 §11): demo data behind a banner; Save stays in this browser.
export function ExplorePreview() {
  return <Shell>{() => <Explore />}</Shell>;
}

// Explore (docs/features/explore-publish.md): only canvases their owners published, on the canonical card (title,
// @handle - display name first when set - description, the canonical direct-fork count, updated). The order is the
// server's for the chosen sort (§17: Newest by default, Recently updated, Most forked); the page never reorders.
// Others' cards offer Start Rabbit Hole (blue) and [Fork | N] (neutral, its confirm-and-rename dialog in place), signed
// out resuming on the published page (?rabbit=root, ?fork=1); your own carry the Owned-by-you badge instead (PublicCards.jsx).
// Card-first (creator profile brief §8): a small "Creators to explore" row sits above the feed, never in it. Search
// (§9) answers Creators and Explainers from the server: @handle, display name, title, description.
function Explore() {
  const [order, setOrder] = useState('newest');
  const [cards, setCards] = useState(null);
  const [creators, setCreators] = useState(null);
  const [me, setMe] = useState(null);
  const [typed, setTyped] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(typed.trim()), 250); return () => clearTimeout(t); }, [typed]);
  const q = term ? `q=${encodeURIComponent(term)}` : '';
  // ?project=owner/repo: a card's project label opened Explore on that project's published canvases (PublicCards ProjectFilter).
  const project = new URLSearchParams(window.location.search).get('project');
  useEffect(() => { let live = true; loadProfile().then((p) => { if (live) setMe(p?.handle || null); }); return () => { live = false; }; }, []);
  useEffect(() => {
    let live = true;
    fetch(`/api/learn/boards/published?sort=${order}${q && `&${q}`}${project ? `&project=${encodeURIComponent(project)}` : ''}`, { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : { canvases: [] }))
      .then(data => { if (live) setCards(data.canvases || []); }).catch(() => { if (live) setCards([]); });
    return () => { live = false; };
  }, [order, q, project]);
  useEffect(() => {
    let live = true;
    fetch(`/api/learn/creators${q && `?${q}`}`, { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : { creators: [] }))
      .then(data => { if (live) setCreators(data.creators || []); }).catch(() => { if (live) setCreators([]); });
    return () => { live = false; };
  }, [q]);
  const label = 'pb-2 text-xs text-ink-2';
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1150px] px-24 pb-12 pt-12 max-lg:px-8 max-md:px-4 max-md:pt-6">
        <h1 className="text-[40px] font-bold leading-[1.2] tracking-[-0.01em]">Explore</h1>
        <p className="pb-6 pt-1 text-sm text-ink-2">Discover rabbit holes, projects, and learning resources shared beyond your library.</p>
        <label className="relative mb-6 block">
          <Search size={15} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input type="search" data-explore-search aria-label="Search creators and explainers" placeholder="Search creators and explainers" value={typed} onChange={(e) => setTyped(e.target.value)} className="h-9 w-full pl-9" />
        </label>
        {term ? (
          <section data-search-creators aria-label="Creators" className="pb-8">
            <h2 className={label}>Creators</h2>
            {creators?.length ? <div className="flex flex-wrap gap-2">{creators.map(c => <CreatorChip key={c.handle} c={c} />)}</div>
              : creators && <p className="text-sm text-ink-3">No creators match &ldquo;{term}&rdquo;.</p>}
          </section>
        ) : creators?.length > 0 && (
          <section data-creator-row aria-label="Creators to explore" className="pb-8">
            <h2 className={label}>Creators to explore</h2>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{creators.map(c => <CreatorChip key={c.handle} c={c} />)}</div>
          </section>
        )}
        <div className="flex items-end justify-between gap-3 pb-4">
          {term ? <h2 className={`${label} pb-0`}>Explainers</h2> : <span />}
          {cards?.length !== 0 && <SortMenu options={EXPLORE_SORTS} value={order} onChange={setOrder} />}
        </div>
        {project && <ProjectFilter project={project} empty={cards?.length === 0 && !term} />}
        {cards === null && <SkeletonRows rows={3} />}
        {cards?.length === 0 && term && <p data-search-empty className="text-sm text-ink-3">No explainers match &ldquo;{term}&rdquo;.</p>}
        {cards?.length > 0 && <div data-explore-list><PublicCards cards={cards} me={me} attr="data-explore-card" /></div>}
      </div>
    </main>
  );
}
