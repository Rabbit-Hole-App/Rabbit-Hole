import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { feedbackStoreFor, feedbackSummary, isFeedbackCard } from './card-feedback.js';
import { toast } from './ui.jsx';

// Card feedback (Explain-on-Canvas roadmap R1): the learner's private thumbs on a generated card, and Progress's read-out of them.
// The page provides the scope ({ app, board, persist }) around the owner's canvas; with none (a shared view, a review fixture)
// no control is drawn. The value is kept beside the board on the server (card-feedback-routes.js), never in the card.
export const CardFeedbackScope = createContext(null);

const BUTTON = 'flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-line bg-white text-ink-3 shadow-sm hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-select aria-pressed:border-accent aria-pressed:text-accent hover:aria-pressed:text-accent';
// The wording of the two thumbs (checklist R1.05); both are the learner's own report, and neither is a grade.
const LABEL = { up: 'Understood', down: 'Still unclear' };

function Thumbs({ block, scope }) {
  const store = feedbackStoreFor(scope);
  const value = useSyncExternalStore(store.subscribe, () => store.value(block.id), () => store.value(block.id));
  useEffect(() => { if (!store.loaded) store.refresh(); }, [store]);
  const press = async clicked => {
    const failed = await store.set(block.id, value === clicked ? null : clicked, block.title);
    if (failed) toast('Your feedback was not saved. Try again.', { tone: 'error' });
  };
  // Under the card, out of the way until the pointer is on the card or keyboard focus is on the pair itself: a selected or focused
  // card, or a thumb just clicked, does not hold it open. The buttons stay in the Tab order while hidden; focus-visible reveals the pair and rings the button.
  // Enter and Space belong to the button, not to the card's own keys.
  const keys = event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); };
  const item = (which, Icon) => (
    <button type="button" data-card-thumb={which} aria-label={LABEL[which]} title={LABEL[which]} aria-pressed={value === which} className={BUTTON}
      onPointerDown={event => event.stopPropagation()} onKeyDown={keys} onClick={() => press(which)}>
      <Icon size={13} aria-hidden="true" {...(value === which ? { fill: 'currentColor' } : {})} />
    </button>
  );
  return (
    <div role="group" aria-label="Rate this card" data-card-thumbs data-thumbnail-hide
      className="absolute top-full right-3 z-10 flex gap-1.5 pt-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 has-[:focus-visible]:opacity-100 pointer-coarse:opacity-100">
      {item('up', ThumbsUp)}
      {item('down', ThumbsDown)}
    </div>
  );
}

// The pair under a generated card; nothing for any other card, or off the owner's canvas.
export function CardFeedback({ block }) {
  const scope = useContext(CardFeedbackScope);
  return scope && isFeedbackCard(block) ? <Thumbs block={block} scope={scope} /> : null;
}

const ROW = 'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-hover';
// Progress's section, with or without a goal: what the learner said about this canvas's cards, apart from what was assessed. It reads
// its own list (never the goal's progress), so a failure here has its own message and leaves the assessed panel as it was.
// ops: the Chat's canvasOps (hasBlock, locate); a rated card no longer on the canvas has no row and so no target to open.
export function CardFeedbackSummary({ scope, ops = null }) {
  const store = feedbackStoreFor(scope);
  useSyncExternalStore(store.subscribe, () => store.version, () => store.version);
  useEffect(() => { store.refresh(); }, [store]);
  const { up, down, total } = feedbackSummary(store.items(), id => ops?.hasBlock?.(id) ?? true);
  if (!store.loaded && !store.error) return null;
  const list = (items, which, Icon) => items.length > 0 && (
    <div data-card-feedback-list={which} className="mt-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-2"><Icon size={13} aria-hidden="true" />{LABEL[which]} ({items.length})</p>
      <ul>{items.map(item => <li key={item.cardId}>
        <button type="button" data-card-feedback-card={item.cardId} className={ROW} onClick={() => ops?.locate?.(item.cardId)}><span className="min-w-0 flex-1 truncate">{item.title || 'Untitled card'}</span></button>
      </li>)}</ul>
    </div>
  );
  return (
    <section data-card-feedback-summary aria-labelledby="card-feedback-title" className="mt-6 border-t border-line pt-4">
      <h3 id="card-feedback-title" className="text-sm font-semibold text-ink">Your feedback</h3>
      <p className="mt-0.5 text-xs text-ink-3">Private to you. What you said about a card, not an assessment of what you know.</p>
      {store.error && <p role="alert" data-card-feedback-error className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fail">Your feedback could not be loaded.
        <button type="button" onClick={() => store.refresh()} className="cursor-pointer font-medium text-ink underline-offset-2 hover:underline">Retry</button></p>}
      {!total && !store.error && <p data-card-feedback-empty className="mt-2 text-sm text-ink-2">Nothing rated yet.</p>}
      {list(up, 'up', ThumbsUp)}
      {list(down, 'down', ThumbsDown)}
    </section>
  );
}
