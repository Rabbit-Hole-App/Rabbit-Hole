import { Loader2 } from 'lucide-react';
import { navigate } from '../api.js';
import { Button } from '../ui.jsx';
import { cardView } from './bar.js';

// T02 §7.3: the card always names the exact workspace, target, operation,
// parameters and effect. Nothing runs until Confirm; a D7-blocked card can't be
// confirmed. The Start dialog's connect_repository renders the same card.
export default function ConfirmCard({ card, onConfirm, onChange, onCancel }) {
  const { model } = card;
  const { state, note } = cardView(card, Date.now());
  const params = Object.entries(model.params || {}).map(([k, v]) => `${k} ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ');
  return (
    <div data-confirm-card={state} className="max-w-[520px] rounded-md border border-line p-3 text-sm">
      <div className="flex items-baseline gap-2 pb-2">
        <span className="min-w-0 flex-1 truncate font-medium">{model.title}</span>
        <span className="shrink-0 text-xs text-ink-2">{model.workspace}</span>
      </div>
      <dl className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-ink-2">Target</dt><dd className="min-w-0 break-words">{model.target}</dd>
        <dt className="text-ink-2">Operation</dt><dd className="min-w-0 break-words">{model.operation}{params && ` · ${params}`}</dd>
        <dt className="text-ink-2">Effect</dt><dd className="min-w-0 break-words">{model.effect}</dd>
      </dl>
      {state === 'blocked' && <p role="note" className="pt-2 text-xs text-warn">{card.reason}</p>}
      {state === 'failed' && <p role="alert" className="pt-2 text-xs text-danger">✗ {card.error?.message}</p>}
      {state === 'executing' && <p className="flex items-center gap-2 pt-2 text-xs text-ink-2"><Loader2 size={13} className="animate-spin" />Working…</p>}
      {state === 'done' && <p className="pt-2 text-xs text-ink-2">{card.message || 'Done.'}{card.href && <Button size="sm" variant="accent" className="ml-1" onClick={() => navigate(card.href)}>Open</Button>}</p>}
      {note && <p className="pt-2 text-xs text-ink-2">{note}</p>}
      {['pending', 'failed', 'blocked'].includes(state) && (
        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="primary" disabled={state === 'blocked' || !onConfirm} onClick={onConfirm}>Confirm</Button>
          <Button size="sm" onClick={onChange}>Change</Button>
          <Button size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      )}
    </div>
  );
}
