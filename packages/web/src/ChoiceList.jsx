import { CornerDownRight, Star } from 'lucide-react';

// The one clickable list of choices (owner 2026-11-15: options are always clicks, one template everywhere): the Tutor's catalogue ways, the route question, the reading goals
// and an answer's "Explore next" all draw their rows with this. Pure drawing: a click calls onPick(item), nothing is sent here.
//   items: [{ id, label, hint?, star?, disabled?, data? }]   data: { 'data-x': value } attributes for the row (checks and tests find rows by them)
//   heading: an optional small title above the rows; label: the group's accessible name.
export const CHOICE_ROW = 'flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-ink-2';

export default function ChoiceList({ items, onPick, heading, label, className = '' }) {
  if (!items?.length) return null;
  return (
    <section aria-label={label || heading || 'Choices'} data-choice-list className={`flex flex-col gap-0.5 ${className}`}>
      {heading && <h3 className="text-xs font-medium text-ink-3">{heading}</h3>}
      {items.map(item => (
        <button key={item.id} type="button" disabled={!!item.disabled} onClick={() => onPick(item)} className={CHOICE_ROW} {...(item.data || {})}>
          {item.star
            ? <Star size={14} aria-hidden="true" className="mt-0.5 shrink-0 fill-current text-claude" />
            : <CornerDownRight size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />}
          <span className="min-w-0">{item.label}{item.hint ? <span className="text-ink-3">{` · ${item.hint}`}</span> : null}</span>
        </button>
      ))}
    </section>
  );
}
