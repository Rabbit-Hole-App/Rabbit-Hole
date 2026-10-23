import CommandPill from './CommandPill.jsx';
import { Button } from './ui.jsx';

// Paid generation always asks first (primitive(id).needsConfirm in
// agent/slash.js), and the job endpoints refuse a start without it. No cost is
// shown until a real estimate exists. `prompt`: the exact line being approved, shown above the message.
// A /cad line shows as a read-only `cad` pill and the prompt (owner brief 2026-10-23: never the printed /cad); data-paid-command keeps
// the exact line, and the pill has no action, so showing it can never start generation. Other commands keep the raw line.
// Colours are semantic tokens only (secondary / inverse Button variants); ui-colour-literals.test.mjs keeps hex out.
const CAD_LINE = /^\/cad\s+([\s\S]+)$/i;

export default function PaidConfirm({ onGenerate, onCancel, message = 'This uses paid generation.', prompt }) {
  const cad = typeof prompt === 'string' ? prompt.match(CAD_LINE) : null;
  return (
    <div data-paid-confirm role="group" aria-label="Paid generation" className="flex flex-wrap items-center justify-center gap-2 text-xs text-ink-2" onPointerDown={event => event.stopPropagation()}>
      {prompt && <p data-paid-prompt data-paid-command={cad ? prompt : undefined} className="max-h-16 w-full overflow-y-auto rounded-md border border-line bg-surface px-2 py-1 text-left whitespace-pre-wrap break-words text-ink">
        {cad ? <><CommandPill name="cad" text="cad" ariaLabel="cad command" className="mr-1.5 h-5 rounded-md px-1.5 align-[-3px] text-xs" /><span data-paid-prompt-text>{cad[1]}</span></> : prompt}
      </p>}
      <span>{message}</span>
      <Button type="button" variant="secondary" size="sm" data-paid-cancel onClick={onCancel}>Cancel</Button>
      <Button type="button" variant="inverse" size="sm" data-paid-generate onClick={onGenerate}>Generate</Button>
    </div>
  );
}
