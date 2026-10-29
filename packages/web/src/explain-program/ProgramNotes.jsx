import { ChevronDown } from 'lucide-react';
import { Md } from '../Md.jsx';

// An Explanation card's notes: the drawn frame's readouts under "Values" (label and value with its unit, as frame.js
// normalizeFrame formats them, so they follow the view as it changes) and the program's manifest.assumptions. One collapsible
// row under the controls, collapsed by default and absent when there are neither (owner, 2026-10-28: the readouts moved here
// from a strip under the drawing, which repeated numbers the drawing already shows). Each note is its own item, drawn by the
// shared safe renderer (Md: math through KaTeX with trust off, no HTML). It opens inline: the card grows by it (the rows report
// their height), long notes scroll inside a bounded region, and the drawing keeps its size. Open state is the viewer's own and
// is never saved.
export default function ProgramNotes({ id, notes, values, open, onToggle }) {
  if (!notes?.length && !values?.length) return null;
  const body = `${id}-notes`;
  const heading = 'text-xs font-semibold tracking-wide text-ink-2 uppercase';
  return (
    <div data-program-notes className="rounded-lg border border-line">
      <button type="button" data-program-notes-toggle aria-expanded={open} aria-controls={body} onClick={onToggle}
        className="flex min-h-10 w-full items-center gap-1.5 rounded-lg px-3 text-left text-sm font-medium text-ink hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-ink-2 transition-transform ${open ? '' : '-rotate-90'}`} />Notes
      </button>
      {/* The body stays a ul, one item per section: ProgramScene's Focus measure finds it as [data-program-notes] > ul. */}
      <ul id={body} hidden={!open} data-scroll className="max-h-60 space-y-2.5 overflow-y-auto px-3 pb-2.5 text-sm leading-relaxed text-ink-2">
        {values?.length > 0 && (
          <li data-program-values>
            <p className={heading}>Values</p>
            <ul className="mt-1 space-y-0.5">
              {values.map(value => <li key={value.id} data-program-value={value.id}>{value.label}: <span className="text-ink tabular-nums">{value.text}</span></li>)}
            </ul>
          </li>
        )}
        {notes?.length > 0 && (
          <li data-program-assumptions>
            {values?.length > 0 && <p className={heading}>Assumptions</p>}
            <ul className="list-disc space-y-1.5 pl-5">
              {notes.map((note, index) => <li key={index}><Md text={note} /></li>)}
            </ul>
          </li>
        )}
      </ul>
    </div>
  );
}
