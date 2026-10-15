import { useState } from 'react';
import { createPortal } from 'react-dom';
import { pageRange } from './pdf-source.js';
import { ConfirmDialog, cn } from './ui.jsx';

// "Add to canvas" for a PDF (docs/features/pdf-to-canvas.md), from an upload or drop or from Sources: its name and page count,
// then one PDF card or separate pages - all, or an inclusive From/To range of 1-based PDF page positions. Cancel or Escape adds
// nothing. `total` is null while the PDF is read; `busy` shows `progress` and takes no second press; `error` keeps it open.
const choice = (on, set, id, label) => (
  <button type="button" role="radio" aria-checked={on === id} data-pdf-choice={id} onClick={() => set(id)}
    className={cn('h-8 rounded-lg border px-3 text-sm', on === id ? 'border-ink bg-hover font-medium text-ink' : 'border-line text-ink-2 hover:bg-hover hover:text-ink')}>{label}</button>
);
const PAGE_INPUT = 'h-8 w-16 rounded-lg border border-line px-2 text-sm text-ink outline-none focus:border-ink disabled:opacity-50';

export default function PdfAddDialog({ name, total, busy, progress, error, onCancel, onConfirm }) {
  const [mode, setMode] = useState('pdf');
  const [span, setSpan] = useState('all');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState(String(total || 1));
  const ready = total != null;
  const range = !ready ? null : mode === 'pdf' ? { from: 1, to: total } : span === 'all' ? pageRange(1, total, total) : pageRange(from, to, total);
  const label = busy ? progress || 'Adding…' : !ready ? 'Reading…' : mode === 'pdf' ? 'Add PDF card'
    : range.error ? 'Add pages' : `Add ${range.count} page${range.count === 1 ? '' : 's'}`;
  return createPortal(
    <div data-pdf-add-dialog>
      <ConfirmDialog title="Add to canvas" confirmLabel={label} confirmVariant="primary" onCancel={onCancel}
        confirmDisabled={busy || !ready || !!range?.error}
        onConfirm={() => { if (!busy && ready && !range.error) onConfirm({ mode, from: range.from, to: range.to }); }}
        body={<span className="block">
          <span data-pdf-file className="block truncate font-mono text-[13px] text-ink" title={name}>{name}</span>
          <span data-pdf-total className="block pb-3 text-xs text-ink-3">{ready ? `${total} page${total === 1 ? '' : 's'}` : 'Counting pages…'}</span>
          <span role="radiogroup" aria-label="Add as" className="flex flex-wrap gap-2">
            {choice(mode, setMode, 'pdf', 'PDF card')}{choice(mode, setMode, 'pages', 'Separate pages')}
          </span>
          {mode === 'pages' && <span className="block pt-3">
            <span role="radiogroup" aria-label="Pages" className="flex flex-wrap gap-2">
              {choice(span, setSpan, 'all', 'All pages')}{choice(span, setSpan, 'range', 'Page range')}
            </span>
            {span === 'range' && <span data-pdf-range className="flex items-center gap-2 pt-3 text-sm text-ink-2">
              From <input type="number" inputMode="numeric" min={1} max={total || undefined} value={from} aria-label="From page" data-pdf-from disabled={busy} onChange={event => setFrom(event.target.value)} className={PAGE_INPUT} />
              to <input type="number" inputMode="numeric" min={1} max={total || undefined} value={to} aria-label="To page" data-pdf-to disabled={busy} onChange={event => setTo(event.target.value)} className={PAGE_INPUT} />
            </span>}
            {span === 'range' && range?.error && <span role="alert" data-pdf-range-error className="block pt-2 text-xs text-danger">{range.error}</span>}
          </span>}
          {error && <span role="alert" data-pdf-error className="block pt-3 text-xs text-danger">{error}</span>}
        </span>} />
    </div>,
    document.body,
  );
}
