import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, FolderGit2, Link2, X } from 'lucide-react';
import { navigate } from '../api.js';
import ForkButton from '../ForkButton.jsx';
import RabbitHoleChoice from '../RabbitHoleChoice.jsx';
import { startHref } from '../shared-rabbit-hole.js';
import LearningCard, { CARD_ROWS, menuAt } from './LearningCard.jsx';
import { publishedThumbnail } from '../card-thumbnail.js';
import { cardModel, forkNumber, profileUrl } from './provenance.js';
import { findQuery, readFind, scheduleFind } from './explore-find.js';
import { Avatar, Button, Menu, MenuItem, toast } from '../ui.jsx';

// Public explainers on the canonical card (docs/features/card-redesign.md), the same for Explore and the creator profile
// (docs/features/creator-profile.md; owner: reuse the SAME card, never a creator-specific one). The card and its title
// open /e/<token>; the @handle opens /@handle. Others' cards offer Start Rabbit Hole (blue), which asks From this canvas or
// Blank here and starts on the published page (?rabbit=root or ?rabbit=blank, through sign-in too), and [Fork | N] (neutral), whose dialog opens here and, signed out, resumes on the page
// (?fork=1); the count lives in that button alone. Your own carry the Owned-by-you badge instead, and the footer's read-only
// N forks once someone forked it (owner, 2026-10-08). The order is the server's: this list never reorders.
const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };
// /e/<token> and /@handle are their own pages (main.jsx Root), so they load in full rather than through navigate().
const go = (url) => window.location.assign(url);

export default function PublicCards({ cards, me, attr }) {
  const [menu, setMenu] = useState(null); // { card, top | bottom, left }
  const [starting, setStarting] = useState(null); // the card whose Start Rabbit Hole is asking
  const copy = async (card) => {
    setMenu(null);
    try { await navigator.clipboard.writeText(`${window.location.origin}${card.url}`); toast('Link copied'); } catch { toast('Could not copy the link', { tone: 'error' }); }
  };
  return (
    <>
      <ul data-public-cards className={CARD_ROWS}>
        {cards.map(card => {
          const mine = !!me && card.creator?.handle === me;
          // One card per published canvas, its own fork count (FORK_COUNT counts forks of this canvas only) and, when it is
          // in a project with a public repository, that project's label (project-canvases.md).
          const m = cardModel({ kind: 'canvas', name: card.url, title: card.title, description: card.description, fork_count: mine ? card.fork_count : null, updated_at: card.updated_at, owner_handle: card.creator?.handle, owner_name: card.creator?.name, project_label: card.project });
          return (
            <LearningCard key={card.url} kind="canvas" m={m} attrs={{ [attr]: '' }} href={card.url} onOpen={() => go(card.url)} mine={mine} access="public" thumbnail={publishedThumbnail(card.url)}
              creatorHref={card.creator?.handle ? `/@${card.creator.handle}` : null}
              onMore={(e) => setMenu({ card, anchor: e.currentTarget, ...menuAt(e.currentTarget, 192, 60) })}
              actions={mine ? null : (
                <>
                  <Button size="sm" variant="primary" data-card-start-rabbit-hole onClick={stop(() => setStarting(card))}
                    title="Start your own private Rabbit Hole from this canvas, or a blank canvas. This canvas stays as it is."><ArrowDownToLine size={13} strokeWidth={1.8} />Start Rabbit Hole</Button>
                  {/* The soft accent fill: more visible on the card than a white button, still below the primary (owner, 2026-10-08). */}
                  <ForkButton size="sm" variant="soft" source={{ token: card.url.split('/').pop() }} title={card.title} resume={card.url} count={card.fork_count} onForked={(fork) => go(fork.url)} />
                </>
              )} />
          );
        })}
      </ul>
      {starting && <RabbitHoleChoice title={starting.title} onCancel={() => setStarting(null)} onPick={(origin) => { setStarting(null); go(startHref(starting.url, origin)); }} />}
      <Menu portal anchor={menu?.anchor} open={!!menu} onClose={() => setMenu(null)} style={{ top: menu?.top, bottom: menu?.bottom, left: menu?.left }} className="w-48">
        <MenuItem icon={Link2} data-menu-copy-link onClick={() => copy(menu.card)}>Copy link</MenuItem>
      </Menu>
    </>
  );
}

// Explore's AI find (explore-find.js; explore-publish.md "AI find"): for a signed-in viewer's sentence-length search, the
// published canvases and creators the small model picked, once per pause in typing. null: nothing to show; 'loading'.
export function useExploreFind(term, signedIn) {
  const [found, setFound] = useState(null);
  useEffect(() => {
    const q = signedIn ? findQuery(term) : null;
    if (!q) { setFound(null); return undefined; }
    let live = true;
    setFound('loading');
    const cancel = scheduleFind(q, query => fetch('/api/learn/boards/published/find', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: query }) })
      .then(readFind).then(result => { if (live) setFound(result); }, () => { if (live) setFound(null); }));
    return () => { live = false; cancel(); };
  }, [term, signedIn]);
  return found;
}

// "Recommended", above the active tab's keyword results: the picked canvases on the Explainers tab, the picked creators
// on the Creators tab (`kind`), on the same card and chip; else one line - nothing fits, or recommendations are not
// available (not configured, over the cap). One find serves both tabs.
export function Recommended({ found, me, kind }) {
  if (!found) return null;
  const picks = found === 'loading' ? [] : found[kind];
  return (
    <section data-explore-recommended={kind} aria-label="Recommended" className="pb-8">
      <h2 className="pb-2 text-xs text-ink-2">Recommended</h2>
      {found === 'loading' ? <p data-recommended-loading className="text-sm text-ink-3">Finding the best matches</p>
        : !picks.length ? <p data-recommended-note className="text-sm text-ink-3">{found.note || (kind === 'creators' ? 'No creator fits that yet.' : 'Nothing published fits that yet.')}</p>
        : kind === 'creators' ? <CreatorCards creators={picks} />
        : <PublicCards cards={picks} me={me} attr="data-recommended-card" />}
    </section>
  );
}

// Explore's Projects filter (?type=projects; learn-boards.js exploreProjects): one card per public project with published
// learning boards - the project's name, its repository and "N learning boards" - on the canonical card. It opens Explore's
// project filter below, which lists that project's boards.
export function ProjectCards({ projects }) {
  return (
    <ul data-explore-projects className={CARD_ROWS}>
      {projects.map(p => {
        const m = { ...cardModel({ kind: 'repository', repo: p.repo, name: p.label, updated_at: p.updated_at }), title: p.label.split('/').pop(), canvases: count(p.boards, 'learning board', 'learning boards') };
        return <LearningCard key={p.label} kind="repository" m={m} attrs={{ 'data-explore-project': p.label }} href={p.url} onOpen={() => navigate(p.url)} />;
      })}
    </ul>
  );
}

// Explore's project filter (?project=owner/repo, opened from a card's project label; project-canvases.md): one chip naming
// it, whose × drops only that filter, and a line when the project has no published canvas (gone, private or none yet).
export function ProjectFilter({ project, empty }) {
  const clear = () => { const url = new URL(window.location.href); url.searchParams.delete('project'); navigate(`${url.pathname}${url.search}`); };
  return (
    <div data-project-filter className="flex flex-wrap items-center gap-2 pb-4">
      <span className="inline-flex h-6 min-w-0 items-center gap-1 rounded-md bg-active pl-2 pr-1 text-xs text-ink">
        <FolderGit2 size={12} strokeWidth={1.75} className="shrink-0" /><span className="truncate">From {project}</span>
        <button type="button" aria-label={`Remove filter From ${project}`} onClick={clear} className="cursor-pointer rounded-sm p-0.5 text-ink-2 hover:bg-hover hover:text-ink"><X size={11} /></button>
      </span>
      {empty && <span data-project-empty className="text-sm text-ink-3">No published canvases from {project}.</span>}
    </div>
  );
}

// A creator's picture: their canonical profile avatar by its own URL (never copied onto a card), else the initials
// treatment every avatar uses - from the display name, else the @handle.
export const CreatorAvatar = ({ c, className }) => <Avatar email={c.name || c.handle} src={c.avatar} className={className} />;

// Copy profile link (owner, 2026-10-08: "Cretors card and in Creator profile should have a copy profile url button"): the
// creator's absolute /@handle (provenance.js profileUrl), never an email or an id. The button itself says it was copied,
// then reverts - no corner toast. It sits on the profile beside the name; the Creators rows have none (owner brief
// 2026-10-23: no chain-link icon on a row).
export function CopyProfileLink({ handle, className = '' }) {
  const [copied, setCopied] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (event) => {
    event.preventDefault(); event.stopPropagation();
    try { await navigator.clipboard.writeText(profileUrl(window.location.origin, handle)); setCopied('Profile link copied'); }
    catch { setCopied("Couldn't copy the link"); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1600);
  };
  const Icon = copied ? Check : Link2;
  const label = copied || 'Copy profile link';
  return (
    <Button type="button" size="sm" variant="secondary" data-copy-profile={handle} aria-label={label} title={label}
      onClick={copy} className={`shrink-0 ${className}`}>
      <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
      <span aria-live="polite">{label}</span>
    </Button>
  );
}

// One creator in Explore's Creators tab, its Recommended creators and creator search (owner brief 2026-10-23): a compact
// row - the picture (64px, 48px on a phone; the initial without one), the saved display name, the blue @handle link, the
// profile description in two lines at most (omitted when there is none), then the public project and canvas counts
// (creators.js COUNTS: only what a signed-out visitor can see; a zero count is hidden), and View profile at the right,
// under the text on a phone. The @handle and View profile are two separate links to the same /@handle; the row itself is
// not a link. No follower, badge or other statistic.
const count = (n, one, many) => `${forkNumber(n)} ${n === 1 ? one : many}`;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
function CreatorRow({ c }) {
  const counts = [c.project_count && count(c.project_count, 'project', 'projects'), c.explainer_count && count(c.explainer_count, 'canvas', 'canvases')].filter(Boolean);
  return (
    <li data-creator-card={c.handle} className="flex min-w-0 items-center gap-5 rounded-lg border border-line bg-white p-6 max-sm:flex-col max-sm:items-stretch max-sm:gap-4 max-sm:p-4">
      <div className="flex min-w-0 flex-1 items-start gap-4 sm:gap-5">
        <CreatorAvatar c={c} className="h-12 w-12 text-lg! sm:h-16 sm:w-16 sm:text-2xl!" />
        <div className="min-w-0 flex-1">
          {c.name && <p data-creator-name className="truncate text-base font-semibold leading-6 text-ink">{c.name}</p>}
          <a data-creator-handle href={c.url} className={`inline-block max-w-full truncate rounded-sm align-top text-sm leading-5 text-accent hover:underline ${FOCUS}`}>@{c.handle}</a>
          {c.description && <p data-creator-description className="line-clamp-2 break-words pt-1.5 text-sm leading-5 text-ink-2">{c.description}</p>}
          {counts.length > 0 && <p data-creator-counts className="pt-2 text-xs text-ink-3">{counts.join(' · ')}</p>}
        </div>
      </div>
      <a data-creator-view href={c.url} className={`inline-flex h-8 shrink-0 items-center gap-1.5 self-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium whitespace-nowrap text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)] hover:bg-hover active:bg-active max-sm:self-start ${FOCUS}`}>
        View profile<ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" />
      </a>
    </li>
  );
}

// The creator rows, in the server's order, one per line at every width.
export function CreatorCards({ creators }) {
  return <ul data-creator-cards className="flex flex-col gap-3 sm:gap-4">{creators.map(c => <CreatorRow key={c.handle} c={c} />)}</ul>;
}
