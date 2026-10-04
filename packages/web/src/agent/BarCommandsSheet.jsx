// The main composer's / commands, opened from the / icon in its Auto picker (owner, 2026-10-04), as the
// canvas composer opens its Slash commands sheet. It lists exactly what the picker offers here (modesFor and
// shortcutsFor in bar.js), each with an example a learner can copy.
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { exampleFor } from './bar.js';

export default function BarCommandsSheet({ modes, shortcuts, place, onClose }) {
  useEffect(() => {
    const key = event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  const section = (title, rows) => rows.length > 0 && <section aria-label={title} className="mb-4">
    <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{title}</h3>
    <ul className="flex flex-col">{rows.map(([name, desc]) => <li key={name} data-bar-command={name} className="flex items-baseline gap-3 rounded-lg px-2 py-1.5 hover:bg-hover">
      <span className="w-20 shrink-0 text-sm font-medium text-ink">/{name}</span>
      <span className="min-w-0 flex-1 text-sm text-ink-2">{desc}</span>
      <code className="shrink-0 rounded bg-code px-1.5 py-0.5 text-xs text-ink-2">{exampleFor(name, place)}</code>
    </li>)}</ul>
  </section>;
  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/10 pt-[10vh]" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label="Slash commands" className="flex max-h-[76vh] w-[44rem] max-w-[94vw] flex-col rounded-2xl border border-line bg-white p-5 shadow-pop">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Slash commands</h2>
        <button type="button" aria-label="Close slash commands" title="Close (Esc)" onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink"><X size={15} /></button>
      </div>
      <p className="mb-4 text-xs text-ink-2">Type <kbd className="rounded border border-line bg-hover px-1.5 py-0.5 font-sans text-[11px]">/</kbd> in the bar, pick a command, then add what you want after it. Auto lets Rabbit Hole choose.</p>
      <div className="min-h-0 overflow-y-auto">{section('Modes', modes)}{section('Shortcuts', shortcuts)}</div>
    </div>
  </div>;
}
