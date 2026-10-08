import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Check, FolderGit2, Link2, X } from 'lucide-react';
import { navigate } from '../api.js';
import ForkButton from '../ForkButton.jsx';
import RabbitHoleChoice from '../RabbitHoleChoice.jsx';
import { startHref } from '../shared-rabbit-hole.js';
import LearningCard, { CARD_GRID, menuAt } from './LearningCard.jsx';
import { cardModel, profileUrl } from './provenance.js';
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
      <ul data-public-cards className={CARD_GRID}>
        {cards.map(card => {
          const mine = !!me && card.creator?.handle === me;
          // One card per published canvas, its own fork count (FORK_COUNT counts forks of this canvas only) and, when it is
          // in a project with a public repository, that project's label (project-canvases.md).
          const m = cardModel({ kind: 'canvas', name: card.url, title: card.title, description: card.description, fork_count: mine ? card.fork_count : null, updated_at: card.updated_at, owner_handle: card.creator?.handle, owner_name: card.creator?.name, project_label: card.project });
          return (
            <LearningCard key={card.url} kind="canvas" m={m} attrs={{ [attr]: '' }} href={card.url} onOpen={() => go(card.url)} mine={mine} access="public"
              creatorHref={card.creator?.handle ? `/@${card.creator.handle}` : null}
              onMore={(e) => setMenu({ card, ...menuAt(e.currentTarget, 192, 60) })}
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
      <Menu portal open={!!menu} onClose={() => setMenu(null)} style={{ top: menu?.top, bottom: menu?.bottom, left: menu?.left }} className="w-48">
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
      {found === 'loading' ? <p data-recommended-loading className="text-sm text-ink-3">Finding the best matches…</p>
        : !picks.length ? <p data-recommended-note className="text-sm text-ink-3">{found.note || (kind === 'creators' ? 'No creator fits that yet.' : 'Nothing published fits that yet.')}</p>
        : kind === 'creators' ? <div className="flex flex-wrap gap-2">{picks.map(c => <CreatorChip key={c.handle} c={c} />)}</div>
        : <PublicCards cards={picks} me={me} attr="data-recommended-card" />}
    </section>
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
// then reverts - no corner toast. It never opens the card it sits on. `compact`: an icon until it has something to say.
export function CopyProfileLink({ handle, compact = false, className = '' }) {
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
  return (
    <Button type="button" size="sm" variant={compact ? 'ghost' : 'secondary'} data-copy-profile={handle} aria-label={copied || 'Copy profile link'} title="Copy profile link"
      onClick={copy} className={`shrink-0 ${compact && !copied ? 'w-7 justify-center px-0' : ''} ${className}`}>
      <Icon size={13} strokeWidth={1.8} aria-hidden="true" />{(copied || !compact) && <span aria-live="polite">{copied || 'Copy profile link'}</span>}
    </Button>
  );
}

// One creator in Explore's "Creators to explore" row and in creator search: picture, name, @handle and their public
// explainer count, opening /@handle, and Copy profile link beside it - outside the link, so copying never opens the
// profile. No follower, verification or reputation signal (owner: no social features).
export function CreatorChip({ c }) {
  const n = c.explainer_count;
  return (
    <div data-creator-card={c.handle} className="flex min-w-0 shrink-0 items-center rounded-lg border border-line bg-white pr-1.5 hover:bg-hover">
      <a data-creator-chip={c.handle} href={c.url} className="flex min-w-0 items-center gap-2.5 rounded-lg py-2 pl-2.5 pr-2">
        <CreatorAvatar c={c} className="h-8 w-8 text-xs!" />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-medium text-ink">{c.name || `@${c.handle}`}</span>
          <span className="truncate text-xs text-ink-2">{c.name ? `@${c.handle} · ` : ''}{n} explainer{n === 1 ? '' : 's'}</span>
        </span>
      </a>
      <CopyProfileLink handle={c.handle} compact />
    </div>
  );
}
