import { useEffect, useMemo, useRef } from 'react';
import { codeRows } from './code-explain.js';

// The numbered lines of a code card (CodeCard.jsx, the Files reader's look: line numbers in the gutter, shiki colours, `bg-accent/10` on a highlighted line as RepositorySource.jsx
// draws one), and the code-explain card's code pane (CodeExplainCard.jsx). With `ranges` (code-explain-card-spec.md section 6) the highlighted lines keep their colour, the lines
// between are dimmed, a long gap shows as "N lines not shown", and `whole` (Show whole file) turns the dimming and the cut off. `lit`: the range a hovered sentence lights.
// onRange(id): a highlighted line was pressed (the primary's prose then scrolls to its sentence). `runs`: one array of coloured runs per entry of `lines` (lineRuns), or null while plain.
// The rest goes to the <pre> (the card's own marker attributes, its scroll class).
export const lineRuns = runs => {
  if (!runs) return null;
  const out = [[]];
  for (const run of runs) run.t === '\n' ? out.push([]) : out[out.length - 1].push(run);
  return out;
};

const stop = event => event.stopPropagation();

export default function CodeLines({ lines, runs = null, ranges = null, whole = false, lit = null, onRange = null, ...pre }) {
  const root = useRef(null);
  const rows = useMemo(() => codeRows(lines, ranges, { whole }), [lines, ranges, whole]);
  const runOf = useMemo(() => new Map((lines || []).flatMap((line, index) => (runs?.[index] ? [[line.n, runs[index]]] : []))), [lines, runs]);
  // A lit range off the pane's view is scrolled to by the pane itself (never scrollIntoView: a canvas scrolled natively puts its cards out of place).
  useEffect(() => {
    const box = root.current, row = lit && box?.querySelector(`[data-range-first~="${lit}"]`);
    if (!row) return;
    const a = box.getBoundingClientRect(), b = row.getBoundingClientRect(), scale = box.offsetHeight ? a.height / box.offsetHeight : 1;
    if (b.top < a.top) box.scrollTop += (b.top - a.top) / scale;
    else if (b.bottom > a.bottom) box.scrollTop += (b.bottom - a.bottom) / scale;
  }, [lit, rows]);
  const seen = new Set(); // a range's first line carries data-range-first (the scroll target)
  return (
    <pre ref={root} {...pre}>
      {rows.map((row, index) => {
        if (row.kind === 'gap') return <div key={`gap-${index}`} data-code-gap className="flex text-[11px] text-ink-3 select-none"><span aria-hidden className="w-10 shrink-0" />{row.hidden} lines not shown</div>;
        const hit = row.ids.length > 0, first = row.ids.filter(id => !seen.has(id)), on = hit && lit && row.ids.includes(lit);
        first.forEach(id => seen.add(id));
        const press = hit && onRange ? { role: 'button', tabIndex: 0, title: 'Show the sentence about these lines', onPointerDown: stop, onClick: () => onRange(row.ids[0]), onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onRange(row.ids[0]); } } } : {};
        return (
          <div key={row.n} data-code-line={row.n} {...(hit ? { 'data-range': row.ids[0], 'data-highlighted': 'true' } : {})} {...(first.length ? { 'data-range-first': first.join(' ') } : {})} {...(on ? { 'data-lit': 'true' } : {})} {...press}
            className={`flex ${hit ? (on ? 'bg-accent/25' : 'bg-accent/10') : ''} ${row.dim ? 'opacity-40' : ''}`}>
            <span aria-hidden className="w-10 shrink-0 pr-2 text-right text-ink-3 select-none">{row.n}</span>
            <span className="min-w-0 whitespace-pre">{runOf.get(row.n) ? runOf.get(row.n).map((run, j) => <span key={j} style={run.color ? { color: run.color, '--shiki-dark': run.dark || run.color } : undefined}>{run.t}</span>) : row.text}</span>
          </div>
        );
      })}
    </pre>
  );
}
