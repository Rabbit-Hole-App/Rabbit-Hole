// Paid generation always asks first (primitive(id).needsConfirm in
// agent/slash.js), and the job endpoints refuse a start without it. No cost is
// shown until a real estimate exists.
export default function PaidConfirm({ onGenerate, onCancel, message = 'This uses paid generation.' }) {
  return (
    <div data-paid-confirm role="group" aria-label="Paid generation" className="flex flex-wrap items-center justify-center gap-2 text-xs text-ink-2" onPointerDown={event => event.stopPropagation()}>
      <span>{message}</span>
      <button type="button" data-paid-cancel onClick={onCancel} className="h-7 rounded-lg border border-line bg-white px-2.5 text-ink hover:bg-hover">Cancel</button>
      <button type="button" data-paid-generate onClick={onGenerate} className="h-7 rounded-lg bg-ink px-2.5 font-medium text-white">Generate</button>
    </div>
  );
}
