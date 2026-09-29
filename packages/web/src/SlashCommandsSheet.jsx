import { useEffect } from 'react';
import { X } from 'lucide-react';
import { EXAMPLES, mayConfirmPaid, pickerSections } from './learn-slash.js';

// Every Learn / command in one place, opened from View > Slash commands. The
// sections are the picker's own (learn-slash.js), so the sheet and the picker
// never disagree about what exists; each row has an example to copy.
export default function SlashCommandsSheet({ onClose }) {
  useEffect(() => {
    const key = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const sections = pickerSections('/');
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ background: 'color-mix(in srgb, var(--color-ink) 18%, transparent)' }}>
      <div role="dialog" aria-modal="true" aria-label="Slash commands" className="flex max-h-[84vh] w-[44rem] max-w-[92vw] flex-col rounded-2xl border border-line bg-white p-5 shadow-pop">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Slash commands</h2>
          <button type="button" aria-label="Close slash commands" title="Close (Esc)" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink"><X size={15} /></button>
        </div>
        <p className="mb-3 text-xs text-ink-2">Type <kbd className="rounded border border-line bg-hover px-1.5 py-0.5 font-sans text-[11px]">/</kbd> in the Learn composer to pick one, then add what you want after it.</p>
        <div className="min-h-0 space-y-4 overflow-y-auto">
          {sections.map(section => (
            <section key={section.title} aria-label={section.title}>
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{section.title}</h3>
              <ul className="divide-y divide-line">
                {section.items.map(item => (
                  <li key={item.name} data-slash-help={item.name} className="grid grid-cols-[7.5rem_1fr] gap-x-3 py-1.5 text-sm max-sm:grid-cols-1">
                    <span className="font-medium text-ink">/{item.name}</span>
                    <span className="min-w-0">
                      <span className="text-ink-2">{item.desc}</span>
                      {mayConfirmPaid(item.name) && <span className="ml-2 rounded-full border border-line px-1.5 py-px text-[10px] text-ink-3">confirms paid</span>}
                      {EXAMPLES[item.name] && <code className="mt-0.5 block truncate font-mono text-xs text-ink-3">e.g. {EXAMPLES[item.name]}</code>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
