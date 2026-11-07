import { customTitleOf } from './card-rename.js';

// The name a learner gave a card by renaming it (card-rename.js), on a card that has no title line of its own: the same line the other
// cards draw for their title (drag zone, text-sm font-medium), so it moves the card like theirs. Nothing when the card was not renamed.
export default function CardCustomTitle({ block }) {
  const title = customTitleOf(block);
  if (!title) return null;
  return <p data-drag-zone data-card-custom-title title={title} className="cursor-grab truncate px-1 pb-1.5 text-sm font-medium text-ink active:cursor-grabbing">{title}</p>;
}
