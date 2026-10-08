// The main composer's / commands, opened from the / icon in its Auto picker (owner, 2026-10-04), as the
// canvas composer opens its Slash commands sheet. It lists exactly what the picker offers here (modesFor and
// shortcutsFor in bar.js) through the same searchable list as the canvas's sheet (CommandList.jsx), and shows the
// chosen command's demo: its example as typed and what that example does here (bar.js exampleFor, resultFor).
// These commands answer, find, open or start something; none makes a card, so the demo is the exchange, not a card.
import { useState } from 'react';
import { X } from 'lucide-react';
import CommandList from '../CommandList.jsx';
import { CommandMark } from '../CommandTone.jsx';
import { exampleFor, resultFor } from './bar.js';

const WHERE = { home: 'Home and Library', project: 'this project' };

export default function BarCommandsSheet({ modes, shortcuts, place, onClose }) {
  const sections = [
    { title: 'Modes', items: modes.map(([name, desc]) => ({ name, desc })) },
    { title: 'Shortcuts', items: shortcuts.map(([name, desc]) => ({ name, desc })) },
  ].filter((section) => section.items.length);
  const all = sections.flatMap((section) => section.items);
  const [name, setName] = useState(all[0]?.name);
  const command = all.find((item) => item.name === name);
  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/10 pt-[10vh]" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label="Slash commands" className="flex h-[70vh] w-[52rem] max-w-[94vw] flex-col rounded-2xl border border-line bg-white p-5 shadow-pop">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Slash commands</h2>
        <button type="button" aria-label="Close slash commands" title="Close (Esc)" onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink"><X size={15} /></button>
      </div>
      <p className="mb-3 text-xs text-ink-2">Type <kbd className="rounded border border-line bg-hover px-1.5 py-0.5 font-sans text-[11px]">/</kbd> in the bar, pick a command, then add what you want after it. Auto lets Rabbit Hole choose. Search or choose one here to see what it does.</p>
      <div className="flex min-h-0 flex-1 gap-4 max-md:flex-col">
        {/* Esc is taken before the bar's own Esc handling (capture), as before. */}
        <CommandList sections={sections} current={name} onChoose={setName} onClose={onClose} row="data-bar-command" capture className="w-56 max-md:max-h-56 max-md:w-full" />
        {command && <section aria-label={`/${name} preview`} data-bar-demo={name} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-xl border border-line bg-hover/40 p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <CommandMark name={name} className="text-base font-semibold text-ink" />
            <span className="text-sm text-ink-2">{command.desc}</span>
          </div>
          <code className="mt-1 block font-mono text-xs text-ink-3">e.g. {exampleFor(name, place)}</code>
          <div className="mt-3 w-[380px] max-w-full self-center rounded-xl border border-line bg-white shadow-sm">
            <p className="px-4 pt-3 text-[11px] text-ink-3">In: {WHERE[place]}</p>
            <div className="flex justify-end px-4 pt-2 pb-3"><span className="max-w-[85%] rounded-2xl bg-accent px-3 py-2 text-sm text-white">{exampleFor(name, place)}</span></div>
            <p className="border-t border-line px-4 py-3 text-sm text-ink">{resultFor(name, place)}</p>
            <p className="px-4 pb-3 text-[11px] text-ink-3">What this example does. What it finds or opens depends on your library.</p>
          </div>
        </section>}
      </div>
    </div>
  </div>;
}
