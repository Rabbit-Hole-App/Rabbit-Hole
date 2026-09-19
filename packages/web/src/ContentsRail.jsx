import { useState } from 'react';
import { PanelRightOpen } from 'lucide-react';

// What is left of the Learn panel once it is retracted: a column of ticks down
// the right edge, one per lesson, and a button to bring the panel back. Hovering
// the ticks opens the contents list, so the course stays navigable without
// giving the panel its width back.
export default function ContentsRail({ entries, onOpen, onExpand, expandLabel = 'Show Learn panel' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" title={expandLabel} aria-label={expandLabel} aria-expanded={false} onClick={onExpand}
        className="absolute top-3 right-3 z-30 flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-ink-2 shadow-sm hover:bg-hover hover:text-ink">
        <PanelRightOpen size={16} />
      </button>
      {!!entries.length && (
        <div onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)}
          className="absolute top-1/2 right-0 z-30 -translate-y-1/2 pr-2 pl-6 max-lg:hidden">
          {/* The ticks are decoration for a pointer; the list behind them is the
              accessible control, so screen readers get the list and not 40 marks. */}
          <div aria-hidden="true" className="flex flex-col items-end gap-1.5 py-2">
            {entries.map(entry => (
              <span key={entry.n} className={`h-0.5 rounded-full transition-all duration-150 ${entry.active ? 'w-6 bg-ink' : entry.available ? 'w-4 bg-ink-3' : 'w-4 bg-line'}`} />
            ))}
          </div>
          <nav aria-label="Table of contents" hidden={!open}
            className="absolute top-1/2 right-full max-h-[80vh] w-64 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-white p-4 shadow-md">
            <h2 className="mb-2 text-xs font-semibold tracking-wider text-ink-2 uppercase">Contents</h2>
            <ol className="space-y-1">
              {entries.map(entry => (
                <li key={entry.n}>
                  <button type="button" disabled={!entry.available} onClick={() => onOpen(entry)}
                    aria-current={entry.active ? 'page' : undefined}
                    className={`w-full rounded px-1 py-0.5 text-left text-sm hover:text-accent disabled:cursor-default disabled:text-ink-3 disabled:hover:text-ink-3 ${entry.active ? 'font-semibold text-accent' : entry.available ? 'text-ink' : ''}`}>
                    {entry.n}. {entry.label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      )}
    </>
  );
}
