import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from './ui.jsx';
import { CommandMark } from './CommandTone.jsx';
import { filterSections } from './command-search.js';

// The command list both Slash commands sheets share: the canvas's (SlashCommandsSheet.jsx) and the Agent Bar's
// (agent/BarCommandsSheet.jsx). A search over the picker's own sections, focused when the sheet opens: it filters by
// name and description as you type (a leading / is ignored), Enter takes the first match, and Esc clears a typed search
// before it closes the sheet. `row` names the attribute each row carries; `capture` takes Esc before the page's own
// handlers (the Agent Bar has its own Esc).
export default function CommandList({ sections, current, onChoose, onClose, row, capture = false, className = '' }) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    const key = event => {
      if (event.key !== 'Escape') return;
      if (capture) event.stopPropagation();
      if (query) setQuery(''); else onClose();
    };
    window.addEventListener('keydown', key, capture);
    return () => window.removeEventListener('keydown', key, capture);
  }, [onClose, query, capture]);
  const shown = filterSections(sections, query);
  return (
    <div className={`flex shrink-0 flex-col ${className}`}>
      <label className="relative mb-2 block shrink-0">
        <Search size={14} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
        <Input type="search" autoFocus data-slash-search aria-label="Search commands" placeholder="Search commands" value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && shown.length) { event.preventDefault(); onChoose(shown[0].items[0].name); } }}
          className="pl-8" />
      </label>
      <nav aria-label="Commands" className="min-h-0 flex-1 overflow-y-auto pr-1">
        {shown.length ? shown.map(section => (
          <section key={section.title} aria-label={section.title} className="mb-3">
            <h3 className="mb-1 px-2 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{section.title}</h3>
            {section.items.map(item => (
              <button key={item.name} type="button" {...{ [row]: item.name }} aria-current={item.name === current} onClick={() => onChoose(item.name)}
                className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1 text-left text-sm ${item.name === current ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
                <CommandMark name={item.name} />
                <span className="truncate text-xs text-ink-3">{item.desc}</span>
              </button>
            ))}
          </section>
        )) : <p data-slash-none className="px-2 py-1 text-xs text-ink-3">No commands match</p>}
      </nav>
    </div>
  );
}
