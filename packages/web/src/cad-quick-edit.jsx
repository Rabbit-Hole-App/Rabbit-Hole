// Quick edit (cad-controls brief sections 1-2), in the CAD card's slot directly below the viewport (data-cad-quick-edit-slot).
// Controls come only from the model's validated definitions (cad-quick-edit-model.js): nothing here knows a parameter by id or
// label. Three kinds of value stay apart everywhere: an input (Requested, or Assumed when the brief chose it), a value
// Calculated by the saved source, and a dimension Measured on this revision's geometry. Typing changes only a draft (kept in
// this browser, cad-draft-store.js); Preview change rebuilds the saved source with the new values (no model call); Accept
// or Discard settles it. The accepted model stays until Accept. The owner only: viewers get no controls.
import { useState } from 'react';
import { ChevronRight, CircleAlert, LoaderCircle, RotateCcw } from 'lucide-react';
import { Tip } from './ui.jsx';
import { draftInput } from './cad-draft-store.js';

const button = 'inline-flex h-8 items-center gap-1 rounded-md border border-line bg-white px-2 text-xs text-ink hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-50';
const primary = 'inline-flex h-8 items-center gap-1 rounded-md border border-ink bg-ink px-2 text-xs font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-50';
const field = 'h-8 rounded-md border border-line bg-white px-2 text-right text-xs text-ink tabular-nums focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60';
export const PROVENANCE = {
  requested: { label: 'Requested', info: 'An input: the value this revision was built from.' },
  assumed: { label: 'Assumed', info: 'An input the design brief chose; you did not state it. Check it.' },
  computed: { label: 'Calculated', info: "Calculated by the model's saved source from the inputs. Not a measurement of the geometry." },
  measured: { label: 'Measured', info: "Measured by trusted inspection of this revision's geometry." },
};
export const formatValue = (value, unit, precision) => {
  if (value === true) return 'On';
  if (value === false) return 'Off';
  if (typeof value !== 'number' || !Number.isFinite(value)) return value == null || value === '' ? '—' : String(value);
  const text = precision !== undefined ? value.toFixed(precision) : String(Number(value.toFixed(6)));
  return unit ? `${text} ${unit}` : text;
};
const unitText = unit => (unit === 'mm3' ? 'mm³' : unit === 'count' ? '' : unit);
// What the trusted check measured, so a value is never read as this parameter's own (a radius checked by its rim diameter).
const measuredWhat = m => ({ bounds_mm: m.axis ? `${m.axis.toUpperCase()} size` : 'size', circular_diameter_mm: 'diameter', volume_mm3: 'volume', solid_count: 'solid count' }[m.kind] || '');

function Chip({ kind }) {
  const { label, info } = PROVENANCE[kind];
  const tone = kind === 'assumed' ? 'border-warn/40 bg-warn/10 text-warn' : kind === 'computed' ? 'border-line bg-hover text-ink-2' : kind === 'measured' ? 'border-pass/30 text-pass' : 'border-line text-ink-2';
  return <Tip label={label} info={info}><span tabIndex={0} data-provenance-chip={kind} className={`inline-flex h-5 shrink-0 items-center rounded border px-1 text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-accent ${tone}`}>{label}</span></Tip>;
}
function Measured({ p }) {
  const m = p.measured;
  if (m.status === 'not_measured') return <span data-cad-measured="none" className="text-ink-3">Not measured</span>;
  return <span data-cad-measured={m.status} className={m.status === 'failed' ? 'text-fail' : 'text-ink-2'}>Measured {measuredWhat(m)} {formatValue(m.value, unitText(m.unit), p.precision)}{m.status === 'failed' ? `, expected ${formatValue(m.expected, unitText(m.unit), p.precision)}` : ''}</span>;
}
function Control({ p, disabled, onDraft, onFocus, onBlur }) {
  const id = `cad-param-${p.id}`, shown = Object.hasOwn(p, 'draft') ? p.draft : p.value;
  const set = raw => onDraft(p.id, draftInput(p.type, raw), p.value);
  const common = { id, disabled, onFocus, onBlur, 'data-cad-input': p.id, 'aria-invalid': p.problem ? true : undefined, 'aria-describedby': `${id}-note` };
  if (p.control === 'readonly') return <span data-cad-readonly={p.id} className="text-xs text-ink tabular-nums">{p.value == null ? 'Not reported' : formatValue(p.value, p.unit, p.precision)}</span>;
  if (p.control === 'select') return <select {...common} value={String(shown)} onChange={event => set(event.target.value)} className={`${field} text-left`}>{p.choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>;
  if (p.control === 'toggle') return <input {...common} type="checkbox" role="switch" checked={shown === true} onChange={event => set(event.target.checked)} className="h-4 w-4 accent-ink" />;
  const draft = Object.hasOwn(p, 'draft');
  return <span className="inline-flex items-center gap-1.5">
    {p.control === 'slider' && <input type="range" aria-label={`${p.label} slider`} disabled={disabled} min={p.min} max={p.max} step={p.step ?? 'any'} value={typeof shown === 'number' ? shown : p.value} onFocus={onFocus} onChange={event => set(event.target.value)} className="w-24 accent-ink" />}
    <input {...common} type="number" inputMode={p.control === 'integer' ? 'numeric' : 'decimal'} min={p.min} max={p.max} step={p.control === 'integer' ? p.step ?? 1 : p.step ?? 'any'}
      value={shown ?? ''} onChange={event => set(event.target.value)} className={`${field} w-20 ${p.problem ? 'border-fail' : draft ? 'border-accent' : ''}`} />
    {p.unit && <span className="w-6 text-xs text-ink-2">{p.unit}</span>}
  </span>;
}
function Row({ p, disabled, onDraft, onHighlight }) {
  const draft = Object.hasOwn(p, 'draft');
  const note = p.problem ? <span role="alert" className="text-fail">{p.label} {p.problem}.</span>
    : p.control === 'readonly' && p.reason ? <span className="text-ink-3">{p.reason}</span>
    : draft ? <span className="text-accent">Draft, not built yet. Was {formatValue(p.value, p.unit, p.precision)}. <Measured p={p} /> on the displayed model.</span>
    : p.role === 'computed' && p.dependsOn?.length ? <span className="text-ink-3">From the model source; <Measured p={p} /></span> : <Measured p={p} />;
  return <div data-cad-param={p.id} data-cad-control={p.control} data-provenance={p.provenance} data-draft={draft || undefined} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 border-t border-line py-1.5 first:border-t-0">
    <label htmlFor={`cad-param-${p.id}`} className="flex min-w-0 items-center gap-1.5 text-xs text-ink"><span className="truncate">{p.label}</span><Chip kind={p.provenance} /></label>
    <Control p={p} disabled={disabled} onDraft={onDraft} onFocus={() => onHighlight?.(p.id)} onBlur={() => onHighlight?.(null)} />
    <p id={`cad-param-${p.id}-note`} className="col-span-2 text-[11px] leading-4">{note}</p>
  </div>;
}

// model: quickEditModel(displayed manifest, { draft }). phase: idle | building | review | failed (this card's rebuild job).
// changes: the rebuild's inputs that differ from the accepted model. problem: the last refused Preview { message, code,
// problems }. actions: { draft(id, value, accepted), reset, preview, accept, discard(keepDraft), retry, togglePreview, edit,
// reload, highlight }.
export function CadQuickEdit({ model, phase = 'idle', changes = [], previewing = false, problem = null, busy = false, error = '', actions }) {
  const [more, setMore] = useState(false);
  if (!model.available) {
    // Decision 5: no pretend controls for imported, legacy or unbound models; the existing AI edit stays the way to change them.
    const why = model.reason === 'no_bindings' ? "This model's parameters are not bound to its saved source, so they cannot be rebuilt exactly." : 'This model has no editable parameters.';
    return <p data-cad-quick-edit="unavailable" className="text-xs text-ink-2">{why}{actions.edit ? ' Edit it with AI (Ctrl+K).' : ''}</p>;
  }
  const locked = busy || phase !== 'idle';
  // The server checks with the same rules (cad-parameters.js), so its refusal is shown once, in the footer.
  const rows = list => list.map(p => <Row key={p.id} p={p} disabled={locked} onDraft={actions.draft} onHighlight={actions.highlight} />);
  const { draft } = model, open = more || model.more.some(p => Object.hasOwn(p, 'draft') || p.problem);
  const why = draft.problems.find(x => !x.id || !model.parameters.some(p => p.id === x.id && p.problem));
  const change = changes.map(c => `${c.label} ${formatValue(c.from, c.unit)} → ${formatValue(c.to, c.unit)}`).join(', ');
  return <section data-cad-quick-edit={phase} aria-label="Quick edit" className="rounded-lg border border-line px-2.5 py-1.5" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <header className="flex flex-wrap items-baseline justify-between gap-x-2 pb-0.5">
      <h3 className="text-xs font-semibold text-ink">Quick edit</h3>
      <p data-cad-values-of={model.revisionId} className="text-[11px] text-ink-3">{previewing ? 'Values of the preview (not accepted)' : 'Current values of the accepted model'}</p>
    </header>
    {rows(model.primary)}
    {model.more.length > 0 && <>
      <button type="button" data-cad-more aria-expanded={open} onClick={() => setMore(!open)} className="mt-0.5 inline-flex h-8 items-center gap-1 rounded-md px-1 text-xs text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
        <ChevronRight size={13} aria-hidden className={open ? 'rotate-90' : ''} />More parameters ({model.more.length})</button>
      {open && <div data-cad-more-list>{rows(model.more)}</div>}
    </>}
    <footer className="flex flex-col gap-1 border-t border-line pt-1.5">
      {phase === 'idle' && draft.changed.length > 0 && <>
        {why && <p role="alert" data-cad-draft-problem className="text-xs text-fail">{why.message}</p>}
        <p className="text-[11px] text-ink-2">Draft: {draft.changed.length} change{draft.changed.length === 1 ? '' : 's'}, not built. Measurements and dimensions are of the displayed model until you preview.</p>
        <div className="flex flex-wrap gap-1">
          <Tip label="Preview change" info="Rebuild the saved model source with these values. No AI call; the accepted model stays until you accept."><button type="button" data-cad-preview disabled={!draft.canPreview || busy} onClick={() => actions.preview(model.request)} className={primary}>{busy ? <LoaderCircle size={13} aria-hidden className="animate-spin" /> : null}Preview change</button></Tip>
          <Tip label="Reset" info="Drop the draft and show the accepted values."><button type="button" data-cad-reset onClick={actions.reset} className={button}><RotateCcw size={13} aria-hidden />Reset</button></Tip>
        </div>
      </>}
      {phase === 'idle' && problem && <div role="alert" data-cad-rebuild-problem={problem.code || problem.status || 'refused'} className="flex flex-wrap items-center gap-1 text-xs text-fail">
        <CircleAlert size={13} aria-hidden /><span className="min-w-0 flex-1">{problem.message}</span>
        {['not_deterministic', 'executor_unsupported'].includes(problem.code) && actions.edit && <button type="button" data-cad-ai-edit onClick={actions.edit} className={button}>Edit with AI (Ctrl+K)</button>}
        {problem.status === 409 && !problem.code && <button type="button" data-cad-reload onClick={actions.reload} className={button}>Reload model</button>}
      </div>}
      {phase === 'building' && <p role="status" data-cad-rebuild="building" className="flex items-center gap-1.5 text-xs text-ink-2"><LoaderCircle size={13} aria-hidden className="animate-spin motion-reduce:animate-none" />Building the change ({change}). The accepted model stays until you accept.</p>}
      {phase === 'review' && <>
        <p role="status" data-cad-rebuild="review" className="text-xs text-ink">Preview ready: {change}. Accept replaces the accepted model; Discard keeps it.</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" data-cad-preview-toggle aria-pressed={previewing} onClick={actions.togglePreview} className={button}>{previewing ? 'Show accepted model' : 'Show preview'}</button>
          <button type="button" data-cad-accept-change disabled={busy} onClick={actions.accept} className={primary}>Accept</button>
          <button type="button" data-cad-discard disabled={busy} onClick={() => actions.discard(false)} className={button}>Discard</button>
        </div>
      </>}
      {phase === 'failed' && <>
        <p role="alert" data-cad-rebuild="failed" className="text-xs text-fail">{error || 'The change could not be built.'}</p>
        <p className="text-[11px] text-ink-2">The accepted model is unchanged.</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" data-cad-edit-values disabled={busy} onClick={() => actions.discard(true)} className={primary}>Edit values</button>
          <button type="button" data-cad-retry-change disabled={busy} onClick={actions.retry} className={button}>Retry</button>
          <button type="button" data-cad-discard disabled={busy} onClick={() => actions.discard(false)} className={button}>Discard</button>
        </div>
      </>}
    </footer>
  </section>;
}
