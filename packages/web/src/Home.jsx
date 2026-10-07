import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Compass, GitFork, Link2 } from 'lucide-react';
import { navigate } from './api.js';
import { reviewTools } from './flags.js';
import { browserOnly, openHref, readContinue, readRecent, recentCard, recentItems } from './home/continue.js';
import LearningCard, { CARD_GRID, IN_THIS_BROWSER as HERE, ON_ANOTHER_DEVICE as AWAY, SortMenu, menuAt } from './home/LearningCard.jsx';
import { EXPLORE_SORTS } from './home/card-sort.js';
import { cardModel } from './home/provenance.js';
import { fixturesOn, useFixtures } from './home/review-fixtures.js';
import { isMine } from './library-filter.js';
import { loadProfile } from './session-display.js';
import Shell from './Shell.jsx';
import { Button, EmptyState, Menu, MenuItem, SkeletonRows, toast } from './ui.jsx';

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
        {ready && !apps.length && (
          <section>
            {startButton}
            <p className="pt-3 text-sm text-ink-2">Start from a repository, sources, a question, or a blank canvas.</p>
          </section>
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

// Continue (owner 2026-10-06 §13, §19): the canonical card - the card and its title open it, with a small Continue →
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
// Others' cards offer Start Rabbit Hole (blue) and Fork (neutral) through the published page's own resume flows
// (?rabbit=root, ?fork=1), signed out included; your own carry the Owned-by-you badge instead.
function Explore() {
  const [order, setOrder] = useState('newest');
  const [cards, setCards] = useState(null);
  const [me, setMe] = useState(null);
  const [menu, setMenu] = useState(null); // { card, top | bottom, left }
  useEffect(() => { let live = true; loadProfile().then((p) => { if (live) setMe(p?.handle || null); }); return () => { live = false; }; }, []);
  useEffect(() => {
    let live = true;
    fetch(`/api/learn/boards/published?sort=${order}`, { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : { canvases: [] }))
      .then(data => { if (live) setCards(data.canvases || []); }).catch(() => { if (live) setCards([]); });
    return () => { live = false; };
  }, [order]);
  // /e/<token> is its own page (main.jsx Root), so it loads in full rather than through navigate().
  const go = (url) => window.location.assign(url);
  const copy = async (card) => {
    setMenu(null);
    try { await navigator.clipboard.writeText(`${window.location.origin}${card.url}`); toast('Link copied'); } catch { toast('Could not copy the link', { tone: 'error' }); }
  };
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1150px] px-24 pb-12 pt-12 max-lg:px-8 max-md:px-4 max-md:pt-6">
        <h1 className="text-[40px] font-bold leading-[1.2] tracking-[-0.01em]">Explore</h1>
        <p className="pb-6 pt-1 text-sm text-ink-2">Discover rabbit holes, projects, and learning resources shared beyond your library.</p>
        {cards?.length !== 0 && <div className="flex justify-end pb-4"><SortMenu options={EXPLORE_SORTS} value={order} onChange={setOrder} /></div>}
        {cards === null && <SkeletonRows rows={3} />}
        {cards?.length === 0 && <div data-explore-empty><EmptyState icon={Compass}>Nothing has been published yet. Canvases people publish to Explore will appear here.</EmptyState></div>}
        {cards?.length > 0 && (
          <ul data-explore-list className={CARD_GRID}>
            {cards.map(card => {
              const mine = !!me && card.creator?.handle === me;
              const m = cardModel({ kind: 'canvas', name: card.url, title: card.title, description: card.description, fork_count: card.fork_count, updated_at: card.updated_at, owner_handle: card.creator?.handle, owner_name: card.creator?.name });
              return (
                <LearningCard key={card.url} kind="canvas" m={m} attrs={{ 'data-explore-card': '' }} href={card.url} onOpen={() => go(card.url)} mine={mine} access="public"
                  onMore={(e) => setMenu({ card, ...menuAt(e.currentTarget, 192, 60) })}
                  actions={mine ? null : (
                    <>
                      <Button size="sm" variant="primary" data-card-start-rabbit-hole onClick={stop(() => go(`${card.url}?rabbit=root`))}
                        title="Start your own private Rabbit Hole from this canvas. This canvas stays as it is."><ArrowDownToLine size={13} strokeWidth={1.8} />Start Rabbit Hole</Button>
                      <Button size="sm" variant="secondary" data-card-fork onClick={stop(() => go(`${card.url}?fork=1`))}
                        title="Fork: make your own editable copy in your Library"><GitFork size={13} strokeWidth={1.8} />Fork</Button>
                    </>
                  )} />
              );
            })}
          </ul>
        )}
        <Menu portal open={!!menu} onClose={() => setMenu(null)} style={{ top: menu?.top, bottom: menu?.bottom, left: menu?.left }} className="w-48">
          <MenuItem icon={Link2} data-menu-copy-link onClick={() => copy(menu.card)}>Copy link</MenuItem>
        </Menu>
      </div>
    </main>
  );
}
