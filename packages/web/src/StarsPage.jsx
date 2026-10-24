import { useEffect, useState } from 'react';
import { Lock, Search, Star, Trash2 } from 'lucide-react';
import { cardModel } from './home/provenance.js';
import ForkButton from './ForkButton.jsx';
import StarButton from './StarButton.jsx';
import LearningCard, { CARD_ROWS } from './home/LearningCard.jsx';
import CardSize from './home/CardSize.jsx';
import { ownThumbnail, publishedThumbnail } from './card-thumbnail.js';
import { ownerStarApi, sharedStarApi, starsApi } from './canvas-star.js';
import Shell from './Shell.jsx';
import { Button, EmptyState, Input, SkeletonRows, toast } from './ui.jsx';

// My Stars (docs/features/stars.md, Task 7): every canvas I starred, newest star first, on the canonical card. It is a Library view
// (/library?view=stars; main.jsx), reached from the Stars button on Home and the Library. A star is a saved reference, so each
// opens only through a route that authorizes now (the server's `access`): my own canvas, the public page, or the share link I
// starred through while it is still live. Anything else is one generic "Canvas unavailable" row with Remove - no title,
// thumbnail, creator or link. Others' canvases carry no owner controls: no menu, rename, delete, publishing or folders.
const go = url => window.location.assign(url);
const TOUCH = 'pointer-coarse:min-h-11 pointer-coarse:min-w-11';

export default function StarsPreview() {
  return <Shell>{() => <Stars />}</Shell>;
}

function Stars() {
  const [typed, setTyped] = useState('');
  const [term, setTerm] = useState('');
  const [list, setList] = useState({ stars: null, next: null, total: 0, unavailable: 0, more: false, error: false, retry: null });
  useEffect(() => { const t = setTimeout(() => setTerm(typed.trim()), 250); return () => clearTimeout(t); }, [typed]);
  const load = (cursor = '') => {
    setList(prev => ({ ...prev, more: !!cursor, error: false, ...(cursor ? {} : { stars: null }) }));
    return starsApi.list({ q: term, cursor })
      .then(body => setList(prev => ({ stars: [...(cursor ? prev.stars : []), ...body.stars], next: body.next_cursor, total: body.total, unavailable: body.unavailable, more: false, error: false, retry: null })))
      .catch(() => setList(prev => ({ ...prev, more: false, error: true, retry: cursor })));
  };
  useEffect(() => { load(); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async entry => {
    try {
      await starsApi.remove(entry.id);
      setList(prev => ({ ...prev, stars: prev.stars.filter(s => s.id !== entry.id), total: prev.total - 1, unavailable: prev.unavailable - 1 }));
    } catch (error) { toast(error.message, { tone: 'error' }); }
  };
  const { stars, next, total, unavailable, more, error } = list;
  return (
    <main data-stars-page className="browse-page flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1150px] px-24 pb-12 pt-12 max-lg:px-8 max-md:px-4 max-md:pt-6">
        <h1 className="text-[40px] font-bold leading-[1.2] tracking-[-0.01em]">Stars</h1>
        <p className="pb-6 pt-1 text-sm text-ink-2">Canvases you starred. A star saves a reference, so you always open the latest version you can see.</p>
        <div className="flex items-center gap-3 pb-5 max-md:flex-wrap">
          <label className="relative block min-w-0 flex-1 max-md:basis-full">
            <Search size={15} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input type="search" data-stars-search aria-label="Search your stars" placeholder="Search your stars" value={typed} onChange={e => setTyped(e.target.value)} className="h-9 w-full pl-9" />
          </label>
          <CardSize />
        </div>
        {stars && total > 0 && <p data-stars-count className="pb-3 text-sm text-ink-2">{total} {total === 1 ? 'star' : 'stars'}{unavailable > 0 && <>, {unavailable} unavailable</>}</p>}
        {error && <div data-stars-error className="flex items-center gap-3 pb-4 text-sm text-ink-2">Your Stars could not load. <Button size="sm" variant="secondary" onClick={() => load(list.retry || '')}>Retry</Button></div>}
        {!stars && !error && <SkeletonRows rows={3} />}
        {stars?.length === 0 && (term
          ? <p data-stars-search-empty className="text-sm text-ink-3">No stars match &ldquo;{term}&rdquo;.</p>
          : <div data-stars-empty><EmptyState icon={Star}>No stars yet. Press Star on a canvas to keep it here.</EmptyState></div>)}
        {stars?.length > 0 && <ul data-stars-list className={CARD_ROWS}>{stars.map(entry => (entry.unavailable ? <Unavailable key={entry.id} entry={entry} onRemove={remove} /> : <StarCard key={entry.id} entry={entry} />))}</ul>}
        {next && <div className="flex justify-center pt-6"><Button variant="secondary" data-stars-more disabled={more} onClick={() => load(next)}>Show more</Button></div>}
      </div>
    </main>
  );
}

// An accessible star: /apps/<name> (mine), /e/<token> (public) or /b/<token> (the link I starred through), so the last path part is
// the name or the token its Star and Fork talk to.
function StarCard({ entry }) {
  const owner = entry.access === 'owner', key = entry.url.split('/').pop();
  const m = cardModel({ kind: 'canvas', name: entry.url, title: entry.title, description: entry.description, fork_count: owner ? entry.fork_count : null, updated_at: entry.updated_at, owner_handle: entry.creator?.handle, owner_name: entry.creator?.name });
  return (
    <LearningCard kind="canvas" m={m} attrs={{ 'data-star-card': entry.access }} href={entry.url} onOpen={() => go(entry.url)} mine={owner}
      thumbnail={owner ? ownThumbnail(key) : entry.access === 'public' ? publishedThumbnail(entry.url) : null}
      creatorHref={entry.creator?.handle ? `/@${entry.creator.handle}` : null}
      star={<StarButton token={key} api={owner ? ownerStarApi(key, 'personal_stars') : sharedStarApi('personal_stars')} initial={{ starred: true, count: entry.star_count }} size="sm" className={TOUCH} />}
      actions={owner ? null : <ForkButton size="sm" variant="soft" source={{ token: key }} title={entry.title} resume={entry.url} count={entry.fork_count} onForked={fork => go(fork.url)} />} />
  );
}

// A star whose canvas can no longer be opened by this person: nothing about it is known here but its time. Remove always works.
function Unavailable({ entry, onRemove }) {
  const [busy, setBusy] = useState(false);
  return (
    <li data-star-unavailable className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-white p-4 max-sm:flex-wrap">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-hover text-ink-2"><Lock size={18} strokeWidth={1.75} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold leading-snug text-ink">Canvas unavailable</p>
        <p className="text-[13px] leading-5 text-ink-2">You can no longer open this canvas. Remove the star to clear it from your list.</p>
      </div>
      <Button size="sm" variant="secondary" data-star-remove aria-label="Remove the star from this unavailable canvas" className={TOUCH} disabled={busy} onClick={async () => { setBusy(true); await onRemove(entry); setBusy(false); }}>
        <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />Remove
      </Button>
    </li>
  );
}
