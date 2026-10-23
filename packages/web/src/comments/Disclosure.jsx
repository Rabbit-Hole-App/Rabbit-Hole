import { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';

// A compact expandable row of the Share dialog: collapsed first; the content stays mounted so a typed draft survives a collapse.
export default function Disclosure({ label, children, ...rest }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div {...rest} className="border-t border-line">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)} className="flex w-full items-center gap-2 py-2 text-left text-sm text-ink">
        <ChevronRight size={14} aria-hidden className={`shrink-0 text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1">{label}</span>
      </button>
      <div id={id} hidden={!open} className="pb-2">{children}</div>
    </div>
  );
}
