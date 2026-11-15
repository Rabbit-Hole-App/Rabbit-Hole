import { useLayoutEffect, useRef } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { Button, Toggle } from './ui.jsx';
import { boolOn, boolText, isModified } from './run-card-knobs.js';
import { CHIP_TONE, RUN_CARD_COPY, knobLabel } from './run-card-copy.js';

// The Run card's small shared pieces (RunCard.jsx, RunCustom.jsx, RunHistory.jsx). Reused as they were: the status mark, the progress bar, the auto-scrolling output pane
// (the code block of ask.jsx), the status text tokens (--color-pass, --color-fail). New here: the parameter fields (Part 1), built from ui.jsx's Toggle and the field styling the card already had.
export const CMD_PRE = 'rounded-sm bg-(--cmd-code-bg) p-2 font-mono text-[11px] leading-relaxed text-(--cmd-code-fg) whitespace-pre-wrap break-words';
export const PRE = 'rounded-sm bg-code p-3 font-mono text-xs leading-relaxed text-ink whitespace-pre-wrap break-words';
export const TONE = { running: 'text-pass', success: 'text-pass', error: 'text-fail', idle: '' }; // the app's own status text tokens (index.css --color-pass, --color-fail: contrast-safe in light and dark)

// One status chip (the app's tokens: idle, accent, success, danger, warn tints). It is a live region so a screen reader hears the state change.
export function Chip({ tone = 'idle', children, ...rest }) {
  return <span aria-live="polite" data-run-chip={tone} className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${CHIP_TONE[tone] || CHIP_TONE.idle}`} {...rest}>{children}</span>;
}

// The numbered badge of a step: accent while open, success once done.
export function StepBadge({ n, done }) {
  return <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${done ? 'bg-success/10 text-pass' : 'bg-accent/10 text-accent'}`}>{done ? <Check size={13} /> : n}</span>;
}

// A run's state mark: a spinner while it runs, a tick on success, a cross on an error, a timeout or a stop.
export function Mark({ tone }) {
  if (tone === 'running') return <Loader2 aria-hidden="true" size={14} className="shrink-0 motion-safe:animate-spin" />;
  if (tone === 'success') return <Check aria-hidden="true" size={14} className="shrink-0" />;
  if (tone === 'error') return <X aria-hidden="true" size={14} className="shrink-0" />;
  return null;
}

// The progress of a running cell: a filled bar when the output says how far it is (iter N of M), an animated bar when it cannot.
export function Progress({ progress }) {
  return (
    <div data-run-progress className="flex flex-col gap-1">
      <div role="progressbar" aria-label="Run progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.pct === null ? undefined : Math.round(progress.pct * 100)} className="h-1.5 w-full overflow-hidden rounded-full bg-hover">
        <div className={`h-full rounded-full bg-success ${progress.pct === null ? 'w-2/5 motion-safe:animate-pulse' : 'transition-[width] duration-200'}`} style={progress.pct === null ? undefined : { width: `${Math.round(progress.pct * 100)}%` }} />
      </div>
      {progress.text && <p className="text-xs text-ink-2">{progress.text}</p>}
    </div>
  );
}

// The output pane keeps the newest line in view: it scrolls to the bottom whenever the text grows, and once more when the run ends.
export function OutputPane({ text, running }) {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [text, running]);
  return <pre ref={ref} data-run-pane className={`${PRE} max-h-64 overflow-y-auto`}>{text}</pre>;
}

// A knob's file:line, opening the Files panel (RunCard.jsx openSource: the same small:open-code path the Runbook's citations take).
export function SourceLink({ source, onOpen }) {
  return source ? <button type="button" data-run-source={source} onClick={() => onOpen(source)} className="font-mono text-xs text-accent hover:underline">{source}</button> : null;
}

// One field of a step's parameters: int and float numeric text, a toggle for a bool, text for a string; the default as the placeholder, the rule when the typed value breaks it.
function KnobField({ field, disabled, onChange, onOpen }) {
  return (
    <div data-run-field={field.flag} data-run-modified={field.modified || undefined} className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex w-44 shrink-0 flex-col" title={field.flag}><span className="truncate text-sm text-ink">{knobLabel(field.flag, field.label)}</span><span className="truncate font-mono text-[11px] text-ink-3">{field.flag}</span></span>
        {field.type === 'bool'
          ? <Toggle on={boolOn(field)} aria-label={field.flag} data-run-flag={field.flag} disabled={disabled || !field.editable} onChange={on => onChange(field.flag, boolText(field, on))} />
          : <input data-run-flag={field.flag} aria-label={field.flag} aria-invalid={!!field.error || undefined} inputMode={field.type === 'int' || field.type === 'float' ? 'decimal' : undefined} readOnly={!field.editable || disabled}
            value={field.value} placeholder={field.default || ''} onChange={event => onChange(field.flag, event.target.value)}
            className="w-32 rounded-lg border border-line px-2 py-1 text-xs text-ink read-only:bg-code read-only:text-ink-2" />}
        <SourceLink source={field.source} onOpen={onOpen} />
        {field.addedBy === 'tutor' && <span className="text-xs text-ink-3">{RUN_CARD_COPY.custom.addedFromChat}</span>}
      </div>
      {field.error && <p data-run-field-error role="alert" className="text-xs text-fail">{field.error}</p>}
    </div>
  );
}

// A step's parameters: the first three, the rest under More parameters; Modified and Reset once any differs from the cell's own value.
export function KnobFields({ fields, disabled, onChange, onReset, onOpen, label = 'Parameters' }) {
  if (!fields.length) return null;
  const first = fields.filter(f => f.visible), rest = fields.filter(f => !f.visible), modified = isModified(fields);
  return (
    <div data-run-knobs className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-ink-2">{label}</p>
        {modified && <span data-run-modified-mark className="text-xs font-medium text-ink">{RUN_CARD_COPY.custom.modified}</span>}
        {modified && <Button type="button" variant="ghost" size="sm" data-run-reset disabled={disabled} onClick={onReset}>{RUN_CARD_COPY.custom.reset}</Button>}
      </div>
      {first.map(f => <KnobField key={f.flag} field={f} disabled={disabled} onChange={onChange} onOpen={onOpen} />)}
      {rest.length > 0 && (
        <details data-run-more className="flex flex-col gap-1.5">
          <summary className="cursor-pointer text-xs text-ink-2 select-none">{RUN_CARD_COPY.custom.more} ({rest.length})</summary>
          <div className="mt-1.5 flex flex-col gap-1.5">{rest.map(f => <KnobField key={f.flag} field={f} disabled={disabled} onChange={onChange} onOpen={onOpen} />)}</div>
        </details>
      )}
    </div>
  );
}
