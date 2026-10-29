import { ChevronDown } from 'lucide-react';
import { Md } from '../Md.jsx';

// An Explanation card's notes (a program's manifest.assumptions): one collapsible row under the controls, collapsed by default
// and absent when there are none. Each note is its own item, drawn by the shared safe renderer (Md: math through KaTeX with
// trust off, no HTML). It opens inline: the card grows by it (the rows report their height), long notes scroll inside a bounded
// region, and the drawing keeps its size. Open state is the viewer's own and is never saved.
export default function ProgramNotes({ id, notes, open, onToggle }) {
  if (!notes?.length) return null;
  const body = `${id}-notes`;
  return (
    <div data-program-notes className="rounded-lg border border-line">
      <button type="button" data-program-notes-toggle aria-expanded={open} aria-controls={body} onClick={onToggle}
        className="flex min-h-10 w-full items-center gap-1.5 rounded-lg px-3 text-left text-sm font-medium text-ink hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-ink-2 transition-transform ${open ? '' : '-rotate-90'}`} />Notes
      </button>
      <ul id={body} hidden={!open} data-scroll className="max-h-60 list-disc space-y-1.5 overflow-y-auto pr-3 pb-2.5 pl-8 text-sm leading-relaxed text-ink-2">
          {notes.map((note, index) => <li key={index}><Md text={note} /></li>)}
        </ul>
    </div>
  );
}
