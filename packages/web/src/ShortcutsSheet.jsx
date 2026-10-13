import { useEffect } from 'react';
import { X } from 'lucide-react';

// Every canvas shortcut in one place, opened with ? or View > Keyboard
// shortcuts. Each row names a key the canvas or the page actually handles -
// AdaptiveCanvas's key handler and LearnPage's / and ? - so keep them in step.
const GROUPS = [
  ['Canvas', [
    ['Search', ['/']],
    ['Keyboard shortcuts', ['?']],
    ['Back to the pointer, clear the selection', ['Esc']],
    ['Select an area', ['drag empty canvas']],
    ['Add to or take out of the selection', ['Shift', 'click']],
    ['Pick one object inside a group', ['Ctrl', 'click']],
    ['Card actions', ['Right-click']],
    ['Comment on the selection (a card, a shape or a group)', ['C']],
  ]],
  ['Tools', [
    ['Select', ['V']],
    ['Hand (pan)', ['H']],
    ['Rectangle', ['R']],
    ['Ellipse', ['O']],
    ['Arrow', ['A']],
    ['Line', ['L']],
    ['Pen', ['P']],
    ['Text', ['T']],
    ['Eraser', ['E']],
    ['Sticky note', ['N']],
  ]],
  ['Edit', [
    ['Undo', ['Ctrl', 'Z']],
    ['Redo', ['Ctrl', 'Y']],
    ['Cut', ['Ctrl', 'X']],
    ['Copy', ['Ctrl', 'C']],
    ['Paste', ['Ctrl', 'V']],
    ['Duplicate', ['Ctrl', 'D']],
    ['Duplicate by dragging', ['Alt', 'drag']],
    ['Copy style', ['Ctrl', 'Alt', 'C']],
    ['Paste style', ['Ctrl', 'Alt', 'V']],
    ['Group', ['Ctrl', 'G']],
    ['Ungroup', ['Ctrl', 'Shift', 'G']],
    ['Lock or unlock', ['Ctrl', 'Shift', 'L']],
    ['Nudge (Shift: 10)', ['Arrows']],
    ['Bring forward / to front', ['Ctrl', '(Shift)', ']']],
    ['Send backward / to back', ['Ctrl', '(Shift)', '[']],
    ['Select all', ['Ctrl', 'A']],
    ['Delete selection', ['Del']],
  ]],
  ['Drawing', [
    ['Square, circle; lines at 45°', ['Shift', 'drag']],
    ['Draw or resize from the centre', ['Alt', 'drag']],
    ['Cancel the shape being drawn', ['Esc']],
  ]],
  ['Text', [
    ['Edit the selected text', ['Enter']],
    ['New line', ['Enter']],
    ['Finish editing', ['Esc']],
    ['Finish editing', ['Ctrl', 'Enter']],
    ['Bold / italic / underline', ['Ctrl', 'B / I / U']],
  ]],
  ['View', [
    ['Zoom in', ['Ctrl', '+']],
    ['Zoom out', ['Ctrl', '-']],
    ['Zoom to 100%', ['Shift', '0']],
    ['Zoom to fit', ['Shift', '1']],
    ['Zoom at the pointer', ['Ctrl', 'scroll']],
    ['Pan', ['scroll']],
    ['Pan while held', ['Space', 'drag']],
  ]],
  ['Presenting', [
    ['Next', ['→']],
    ['Previous', ['←']],
    ['Stop', ['Esc']],
  ]],
];

export default function ShortcutsSheet({ onClose }) {
  useEffect(() => {
    const key = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ background: 'color-mix(in srgb, var(--color-ink) 18%, transparent)' }}>
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="max-h-[80vh] w-[48rem] max-w-[92vw] overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-pop">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Keyboard shortcuts</h2>
          <button type="button" aria-label="Close shortcuts" title="Close (Esc)" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink"><X size={15} /></button>
        </div>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {GROUPS.map(([title, rows]) => (
            <section key={title} aria-label={title}>
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{title}</h3>
              <ul>
                {rows.map(([label, keys]) => (
                  <li key={`${label}-${keys.join()}`} className="flex items-center justify-between gap-3 py-1 text-sm text-ink">
                    <span>{label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {keys.map(key => <kbd key={key} className="rounded border border-line bg-hover px-1.5 py-0.5 font-sans text-[11px] text-ink-2">{key}</kbd>)}
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
