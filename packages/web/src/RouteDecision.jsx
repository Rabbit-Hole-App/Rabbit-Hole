// CR-1's route decision above the composer (MOT-20b; chat-route-interface.md section 3): a clarification with its options, an
// unsupported request, or a router failure with Answer normally and Retry. The draft stays in the composer; nothing was sent.
// An option asks again with that capability named (zero router calls), so a Motion choice still goes to the proposal card.
import { CircleHelp, X } from 'lucide-react';
import { routeLabel } from './inline-ai-route.js';

const optionLabel = id => (id === 'answer' ? 'Answer in chat' : routeLabel(id));

export default function RouteDecision({ decision, onChoose, onAnswer, onRetry, onDismiss }) {
  if (!decision) return null;
  return (
    <div data-route-decision={decision.kind} role="status" className="mb-1.5 flex w-fit max-w-full items-start gap-2 rounded-lg border border-accent/30 bg-accent/[0.07] px-3 py-2 text-sm">
      <CircleHelp size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p data-route-message className="text-ink">{decision.message}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {decision.kind === 'clarify' && decision.options.map(id => (
            <button key={id} type="button" data-route-option={id} onClick={() => onChoose(id)} className="rounded-lg border border-line bg-surface px-2 py-0.5 text-xs text-ink hover:bg-hover">{optionLabel(id)}</button>
          ))}
          {decision.kind === 'fallback' && <>
            <button type="button" data-route-answer onClick={onAnswer} className="rounded-lg border border-line bg-surface px-2 py-0.5 text-xs text-ink hover:bg-hover">Answer normally</button>
            {decision.retryable && <button type="button" data-route-retry onClick={onRetry} className="rounded-lg border border-line bg-surface px-2 py-0.5 text-xs text-ink hover:bg-hover">Retry</button>}
          </>}
        </div>
      </div>
      <button type="button" aria-label="Dismiss" data-route-dismiss onClick={onDismiss} className="shrink-0 rounded p-0.5 text-ink-3 hover:bg-hover hover:text-ink"><X size={12} /></button>
    </div>
  );
}
