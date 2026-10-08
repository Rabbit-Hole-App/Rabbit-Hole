import { useState } from 'react';
import { ArrowDownToLine, Link2 } from 'lucide-react';
import ForkButton from '../ForkButton.jsx';
import LearningCard, { CARD_GRID, menuAt } from './LearningCard.jsx';
import { cardModel } from './provenance.js';
import { Avatar, Button, Menu, MenuItem, toast } from '../ui.jsx';

// Public explainers on the canonical card (docs/features/card-redesign.md), the same for Explore and the creator profile
// (docs/features/creator-profile.md; owner: reuse the SAME card, never a creator-specific one). The card and its title
// open /e/<token>; the @handle opens /@handle. Others' cards offer Start Rabbit Hole (blue), through the published page's
// resume flow (?rabbit=root), and [Fork | N] (neutral), whose dialog opens here and, signed out, resumes on the page
// (?fork=1); the count lives in that button alone. Your own carry the Owned-by-you badge instead, and the footer's read-only
// N forks once someone forked it (owner, 2026-10-08). The order is the server's: this list never reorders.
const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };
// /e/<token> and /@handle are their own pages (main.jsx Root), so they load in full rather than through navigate().
const go = (url) => window.location.assign(url);

export default function PublicCards({ cards, me, attr }) {
  const [menu, setMenu] = useState(null); // { card, top | bottom, left }
  const copy = async (card) => {
    setMenu(null);
    try { await navigator.clipboard.writeText(`${window.location.origin}${card.url}`); toast('Link copied'); } catch { toast('Could not copy the link', { tone: 'error' }); }
  };
  return (
    <>
      <ul data-public-cards className={CARD_GRID}>
        {cards.map(card => {
          const mine = !!me && card.creator?.handle === me;
          const m = cardModel({ kind: 'canvas', name: card.url, title: card.title, description: card.description, fork_count: mine ? card.fork_count : null, updated_at: card.updated_at, owner_handle: card.creator?.handle, owner_name: card.creator?.name });
          return (
            <LearningCard key={card.url} kind="canvas" m={m} attrs={{ [attr]: '' }} href={card.url} onOpen={() => go(card.url)} mine={mine} access="public"
              creatorHref={card.creator?.handle ? `/@${card.creator.handle}` : null}
              onMore={(e) => setMenu({ card, ...menuAt(e.currentTarget, 192, 60) })}
              actions={mine ? null : (
                <>
                  <Button size="sm" variant="primary" data-card-start-rabbit-hole onClick={stop(() => go(`${card.url}?rabbit=root`))}
                    title="Start your own private Rabbit Hole from this canvas. This canvas stays as it is."><ArrowDownToLine size={13} strokeWidth={1.8} />Start Rabbit Hole</Button>
                  {/* The soft accent fill: more visible on the card than a white button, still below the primary (owner, 2026-10-08). */}
                  <ForkButton size="sm" variant="soft" source={{ token: card.url.split('/').pop() }} title={card.title} resume={card.url} count={card.fork_count} onForked={(fork) => go(fork.url)} />
                </>
              )} />
          );
        })}
      </ul>
      <Menu portal open={!!menu} onClose={() => setMenu(null)} style={{ top: menu?.top, bottom: menu?.bottom, left: menu?.left }} className="w-48">
        <MenuItem icon={Link2} data-menu-copy-link onClick={() => copy(menu.card)}>Copy link</MenuItem>
      </Menu>
    </>
  );
}

// A creator's picture: their canonical profile avatar by its own URL (never copied onto a card), else the initials
// treatment every avatar uses - from the display name, else the @handle.
export const CreatorAvatar = ({ c, className }) => <Avatar email={c.name || c.handle} src={c.avatar} className={className} />;

// One creator in Explore's "Creators to explore" row and in creator search: picture, name, @handle and their public
// explainer count, opening /@handle. No follower, verification or reputation signal (owner: no social features).
export function CreatorChip({ c }) {
  const n = c.explainer_count;
  return (
    <a data-creator-chip={c.handle} href={c.url} className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg border border-line bg-white py-2 pl-2.5 pr-3.5 hover:bg-hover">
      <CreatorAvatar c={c} className="h-8 w-8 text-xs!" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-ink">{c.name || `@${c.handle}`}</span>
        <span className="truncate text-xs text-ink-2">{c.name ? `@${c.handle} · ` : ''}{n} explainer{n === 1 ? '' : 's'}</span>
      </span>
    </a>
  );
}
