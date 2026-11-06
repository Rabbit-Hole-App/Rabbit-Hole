import { STRINGS } from './roadmap-strings.js';

// Retry, Replace and Omit for one failed card (D36): the same three buttons, the same calls, from Chat and from the ToC.
// item: recoveryOf's { resultId, stepId, message, actions }. Only the actions the server lists are drawn.
export default function RoadmapRecovery({ item, onAction, where }) {
  return (
    <div data-roadmap-recovery={where} className="flex flex-col gap-1.5 text-sm">
      <p className="break-words text-ink">{item.message}</p>
      <div className="flex flex-wrap gap-1.5">
        {item.actions.map(action => (
          <button key={action} type="button" data-roadmap-recover={action} onClick={() => onAction(item.stepId, action)}
            className="h-7 rounded-md border border-line px-2.5 text-xs font-medium text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/60">{STRINGS[action]}</button>
        ))}
      </div>
    </div>
  );
}
