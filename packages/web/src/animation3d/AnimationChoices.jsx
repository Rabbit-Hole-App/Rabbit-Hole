// The changes the server offers when a plan looks too large or a request is unsupported (FX-AN-031), under its Chat message: exactly what each
// one changes and what it costs. Nothing happens until the learner presses one, nothing is built until Generate, and the answer stays on the
// message after a reload (meta.animationChoice.chosen).
import { useRef, useState } from 'react';
import { Button } from '../ui.jsx';
import { choiceAction } from './client.js';

export default function AnimationChoices({ choice, ops }) {
  const [busy, setBusy] = useState(null), [picked, setPicked] = useState(null), [error, setError] = useState(null);
  const once = useRef(false); // two clicks in one frame are one press
  const chosen = choice.chosen ?? picked;
  const press = async id => {
    if (once.current || chosen) return;
    once.current = true; setBusy(id); setError(null);
    try { await ops.chooseAnimation(choice, id); setPicked(id); } catch (failure) { setError(failure?.data?.error || failure?.message || 'This choice could not be made.'); } finally { once.current = false; setBusy(null); }
  };
  return (
    <div data-animation-choice={choice.kind} className="mt-2 flex w-full max-w-xl min-w-0 flex-col gap-2">
      {choice.alternatives.map(a => {
        const action = choiceAction(a);
        return (
          <section key={a.id} data-animation-alternative={a.id} aria-label={a.title} className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-3">
            <h3 className="text-sm font-semibold text-ink">{a.title}</h3>
            <ul className="list-disc pl-4 text-xs text-ink">{a.changes.map((line, i) => <li key={i}>{line}</li>)}</ul>
            <p data-animation-alternative-cost className="text-xs text-ink-2">{action.cost}</p>
            {ops?.chooseAnimation && (
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" data-animation-choose={a.id} disabled={!!chosen || !!busy} onClick={() => press(a.id)}>{action.label}</Button>
                {chosen === a.id && <span data-animation-chosen className="text-xs text-ink-2">Chosen</span>}
              </div>
            )}
          </section>
        );
      })}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
