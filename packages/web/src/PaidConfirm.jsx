import { Button } from './ui.jsx';

// Paid generation always asks first (primitive(id).needsConfirm in
// agent/slash.js), and the job endpoints refuse a start without it. No cost is
// shown until a real estimate exists. `prompt`: the exact line being approved, shown above the message.
// Colours are semantic tokens only (secondary / inverse Button variants); ui-colour-literals.test.mjs keeps hex out.
export default function PaidConfirm({ onGenerate, onCancel, message = 'This uses paid generation.', prompt }) {
  return (
    <div data-paid-confirm role="group" aria-label="Paid generation" className="flex flex-wrap items-center justify-center gap-2 text-xs text-ink-2" onPointerDown={event => event.stopPropagation()}>
      {prompt && <p data-paid-prompt className="max-h-16 w-full overflow-y-auto rounded-md border border-line bg-surface px-2 py-1 text-left whitespace-pre-wrap break-words text-ink">{prompt}</p>}
      <span>{message}</span>
      <Button type="button" variant="secondary" size="sm" data-paid-cancel onClick={onCancel}>Cancel</Button>
      <Button type="button" variant="inverse" size="sm" data-paid-generate onClick={onGenerate}>Generate</Button>
    </div>
  );
}
