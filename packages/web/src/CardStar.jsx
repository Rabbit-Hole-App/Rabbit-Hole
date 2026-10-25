import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { navigate } from './api.js';
import StarButton from './StarButton.jsx';
import { Button } from './ui.jsx';
import { ownerStarApi, sharedStarApi, starredTokens, takeStarReturn } from './canvas-star.js';

// The Star control on a card (docs/features/stars.md, Task 6): the one StarButton with the card's own route, in the card's
// actions row, visible at rest. A card of the owner's own canvas stars by its name (Library, Home); a published canvas
// (Explore, a profile) stars by its publication token, whose starred state for this viewer comes from one batched read for
// the whole list. A press never reaches the card (StarButton stops it). A phone or touch screen gets a 44px target.
const TOUCH = 'pointer-coarse:min-h-11 pointer-coarse:min-w-11';

// Back from sign-in (?star=<token>): read once per page load, whichever list holds the card.
let returned;
const returnedToken = () => { if (returned === undefined) returned = takeStarReturn(); return returned; };

export const publicToken = card => card.url.split('/').pop();

// Which of a public list's cards I have starred: { asked(token), starred(token) }. One request per new set of tokens; a card
// already asked about keeps its answer, so typing in a search does not make every button flash.
export function useStarredCards(cards) {
  const [seen, setSeen] = useState({ asked: new Set(), starred: new Set() });
  const key = cards.map(publicToken).join(',');
  useEffect(() => {
    const fresh = key ? key.split(',').filter(token => !seen.asked.has(token)) : [];
    if (!fresh.length) return undefined;
    let live = true;
    starredTokens(fresh).then(starred => { if (live) setSeen(prev => ({ asked: new Set([...prev.asked, ...fresh]), starred: new Set([...prev.starred, ...starred]) })); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { asked: token => seen.asked.has(token), starred: token => seen.starred.has(token) };
}

// A published canvas's star: `known` is useStarredCards.
export function PublicCardStar({ card, known, surface = 'card_explore' }) {
  if (typeof card.star_count !== 'number') return null;
  const token = publicToken(card), ready = known.asked(token);
  return <StarButton key={`${token}:${ready}`} token={token} api={sharedStarApi(surface)} signInMark={token} auto={returnedToken() === token} pending={!ready}
    initial={{ starred: known.starred(token), count: card.star_count }} size="sm" className={TOUCH} />;
}

// The owner's own canvas, on a Library or Home card; the app is the canvas row, whose star_count and starred_by_me the server sent.
// null (no control) for a project, a review fixture or a row without a count.
export const ownerStar = (app, surface) => (app.kind !== 'canvas' || app.fixture || typeof app.star_count !== 'number' ? null
  : <StarButton key={app.name} token={app.name} api={ownerStarApi(app.name, surface)} initial={{ starred: !!app.starred_by_me, count: app.star_count }} size="sm" className={TOUCH} />);

// The one way to the personal Stars page (StarsPage.jsx), beside Start on Home and on the Library's header. The page is a Library
// view (/library?view=stars), so the sidebar keeps Library lit and no new route or nav row is needed.
export const STARS_HREF = '/library?view=stars';
export function StarsLink() {
  return (
    <Button variant="secondary" data-open-stars title="Canvases you starred" className={TOUCH} onClick={() => navigate(STARS_HREF)}>
      <Star size={14} strokeWidth={1.8} aria-hidden="true" />Stars
    </Button>
  );
}
