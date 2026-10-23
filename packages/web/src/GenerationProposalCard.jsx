// UI-15 / MOT-20 / UI-15.1: THE generation confirmation: one layout for every command, drawn from the canonical schema
// (generation-confirmation-schema.js) and a signed proposal (control-plane generation-proposal.js) or a ready-made view (a CAD
// brief, through its adapter). Title; the proposed description with its clickable reference pills; the settings the command declares
// (none declared, none drawn); references, requirements, assumptions, missing information and limitations when present; validation
// errors; the server's credit estimate; Edit details, Save, Discard, Generate and, where the command supports it, Cancel.
//
// Settings are deterministic and save as they change (a new revision, no model call). Text details are edited in a form whose draft stays
// apart from the accepted revision: Generate is for the saved, current, valid revision only, so unsaved edits, validation errors and
// missing information disable it. The original request is shown unchanged and is never part of an edit. Reference pills point to the
// ORIGINAL card (onOpenReference); a click never submits and never generates. Units come from the schema, never from the card.
//
// props: proposal (the envelope) or view (a logical proposal, schema proposalView); active, made, busy; onGenerate(proposal|view);
// onSave(edit) -> Promise (settings: { settings }, details: { title, description, ... }); onSettingsChange(settings) (older callers);
// onCancel; onOpenReference(reference); states (server reference states); problem ({ message, errors }); groups ({ key: [defs] }) and
// groupProblem(key, values) for parameter groups; Editor (the pill editor lane's component for the description).
import { useId, useRef, useState } from 'react';
import { ChartColumnIncreasing, CircleAlert, FileCode2, FileText, Film, Globe, Group, Image as ImageIcon, Shapes, StickyNote } from 'lucide-react';
import AspectRatioSelect from './AspectRatioSelect.jsx';
import CommandPill from './CommandPill.jsx';
import { SECTIONS, changedKeys, commandDefinition, fieldsFor, isEditable, proposalView, visibleSections } from './generation-confirmation-schema.js';
import { escapeText, isReviewProposal, promptSegments, removeReference } from './generation-review.js';
import { Button, Tip, cn } from './ui.jsx';

const ICONS = { doc: FileText, card: StickyNote, group: Group, code: FileCode2, image: ImageIcon, media: Film, web: Globe, progress: ChartColumnIncreasing, canvas: Shapes, file: FileText, excerpt: FileText, graph: ChartColumnIncreasing };
const fmt = n => Number(n).toLocaleString('en-US');
// Server-provided credits only (owner messages 30-33: never dollars). The reservation stays internal: the line is the estimate
// alone (owner, 2026-10-21: "About 100 credits"). -> '' without an estimate.
export function usageLine(usage) {
  const e = usage?.estimate_credits;
  return e != null ? `About ${fmt(e)} credits` : '';
}
// A price the server cannot quote is said, never shown as zero (the command blocks Generate until it can).
export const UNKNOWN_PRICE = 'Price not available yet';
// A select field's choices from the schema, plus the proposal's own value when it is not one of them (a proposal made before the
// schema keeps what it was made with), labelled with the field's unit.
export function selectOptions(f, current, settings = {}) {
  const options = (f.by_model ? f.by_model[settings.model] : f.options) ?? [];
  return current !== undefined && current !== null && !options.some(o => o.value === current) ? [...options, { value: current, label: f.unit ? `${current} ${f.unit}` : String(current) }].sort((a, b) => (typeof a.value === 'number' ? a.value - b.value : 0)) : options;
}

const control = 'h-7 rounded-md border border-line bg-surface px-2 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';
const area = 'w-full rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';
const segment = 'h-7 px-2.5 text-[13px] focus-visible:outline-2 focus-visible:outline-accent';
const lines = text => text.split('\n').map(line => line.trim()).filter(Boolean);

function SelectField({ f, value, settings, disabled, onChange }) {
  const options = selectOptions(f, value, settings);
  return (
    <label data-proposal-field={f.key} title={f.available === false ? f.unavailable_reason : undefined} className="flex items-center gap-2 text-[13px] text-ink-2">
      {f.label}
      <select {...(f.key === 'duration_seconds' ? { 'data-proposal-duration': true } : {})} disabled={disabled} data-proposal-select={f.key} value={value ?? ''}
        onChange={event => onChange(options.find(o => String(o.value) === event.target.value)?.value)} className={control}>
        {(value === undefined || value === null) && <option value="">Default</option>}
        {options.map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// An aspect ratio field (control: 'aspect_ratio') is the shared dropdown over the ratios THIS command or model declares, so Motion's nine
// and an image model's own list never leak into each other. A proposal saved without one reads the field's default.
function RatioField({ f, value, disabled, onChange }) {
  return <div data-proposal-field={f.key} title={f.available === false ? f.unavailable_reason : undefined}><AspectRatioSelect label={f.label} options={f.options.map(o => o.value)} value={value ?? f.default} disabled={disabled} onChange={onChange} data-proposal-select={f.key} data-proposal-aspect-ratio /></div>;
}

function NumberField({ f, value, disabled, onChange }) {
  return (
    <label data-proposal-field={f.key} className="flex items-center gap-2 text-[13px] text-ink-2">
      {f.label}
      <input data-proposal-number={f.key} type="number" min={f.min} max={f.max} step={f.step ?? (f.type === 'integer' ? 1 : 'any')} value={value ?? ''} disabled={disabled}
        onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))} className={cn(control, 'w-24 text-right')} />
      {f.unit && <span className="text-ink-3">{f.unit}</span>}
    </label>
  );
}

function TextField({ f, value, disabled, onChange }) {
  const Tag = f.type === 'textarea' ? 'textarea' : 'input';
  return (
    <label data-proposal-field={f.key} className="flex flex-col gap-1 text-[13px] text-ink-2">
      {f.label}
      <Tag data-proposal-text={f.key} value={value ?? ''} maxLength={f.max_length} disabled={disabled} onChange={event => onChange(event.target.value)} className={f.type === 'textarea' ? area : cn(control, 'w-full')} {...(f.type === 'textarea' ? { rows: 3 } : {})} />
    </label>
  );
}

function ListField({ f, value, disabled, onChange }) {
  return (
    <label data-proposal-field={f.key} className="flex flex-col gap-1 text-[13px] text-ink-2">
      {f.label} (one per line)
      <textarea data-proposal-list={f.key} rows={Math.min(5, Math.max(2, (value || []).length))} value={(value || []).join('\n')} disabled={disabled} onChange={event => onChange(lines(event.target.value))} className={area} />
    </label>
  );
}

function ToggleField({ f, value, disabled, onChange }) {
  const labelId = useId(); // unique per card: earlier versions stay in the chat history
  const on = value === true;
  const reason = f.unavailable_reason || 'Not available yet';
  const button = (state, label, extra = {}) => (
    <button type="button" {...{ [`data-proposal-${f.key}`]: state }} aria-pressed={on === (state === 'on') ? 'true' : 'false'} {...extra} onClick={() => onChange(state === 'on')}
      className={cn(segment, on === (state === 'on') ? 'bg-active text-ink disabled:opacity-50' : 'text-ink-3 disabled:cursor-default', state === 'on' && 'border-l border-line')}>{label}</button>
  );
  return (
    <div className="flex items-center gap-2 text-[13px] text-ink-2" data-proposal-field={f.key}>
      <span id={labelId}>{f.label}</span>
      <div role="group" aria-labelledby={labelId} className="inline-flex overflow-hidden rounded-md border border-line">
        {button('off', 'Off', { disabled })}
        {f.available === false
          ? <Tip label={reason} align="end">{button('on', 'On', { disabled: true, title: reason })}</Tip>
          : button('on', 'On', { disabled })}
      </div>
    </div>
  );
}

// A group of parameters the owning capability defines (CAD): each parameter carries its own type, unit, limits and choices; the
// capability judges the values (groupProblem), the card draws them.
function GroupField({ f, defs = [], value = {}, disabled, onChange, problem }) {
  return (
    <fieldset data-proposal-field={f.key} className="flex flex-col gap-1">
      <legend className="text-[13px] text-ink-2">{f.label}</legend>
      {defs.map(p => {
        const id = `${f.key}-${p.id}`, why = problem?.(p.id, value[p.id]);
        const set = next => onChange({ ...value, [p.id]: next });
        return (
          <div key={p.id} className="flex flex-wrap items-center gap-2 text-xs" data-proposal-param={p.id}>
            <label htmlFor={id} className="min-w-0 flex-1 truncate text-ink">{p.label}</label>
            {p.type === 'choice'
              ? <select id={id} data-proposal-param-value={p.id} value={value[p.id]} disabled={disabled} onChange={event => set(p.choices.find(c => String(c.value) === event.target.value)?.value)} className={cn(control, 'h-6 text-xs')}>{p.choices.map(c => <option key={String(c.value)} value={c.value}>{c.label}</option>)}</select>
              : p.type === 'boolean'
                ? <input id={id} data-proposal-param-value={p.id} type="checkbox" role="switch" checked={value[p.id] === true} disabled={disabled} onChange={event => set(event.target.checked)} />
                : <input id={id} data-proposal-param-value={p.id} type="number" step={p.type === 'count' ? 1 : p.step ?? 'any'} min={p.min} max={p.max} value={value[p.id] ?? ''} disabled={disabled} aria-invalid={why ? true : undefined}
                    onChange={event => set(event.target.value === '' ? undefined : Number(event.target.value))} className={cn(control, 'h-6 w-24 text-right text-xs', why && 'border-fail')} />}
            <span className="w-8 text-ink-2">{p.unit || ''}</span>
            {why && <span role="alert" className="w-full text-fail">{p.label} {why}.</span>}
          </div>
        );
      })}
    </fieldset>
  );
}

const FIELDS = { select: SelectField, integer: NumberField, number: NumberField, boolean: ToggleField, text: TextField, textarea: TextField, string_list: ListField };

function Settings({ command, settings, disabled, onChange, groups, groupProblem }) {
  const fields = fieldsFor(command, settings);
  if (!fields.length) return null; // a command with no settings draws no Settings section
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-proposal-settings={command}>
      {fields.map(f => {
        // An unavailable field is drawn disabled by its own control (Audio keeps Off selectable, On disabled with its reason); any other
        // field is live only where the command lets the person change it.
        const locked = disabled || (f.available !== false && !(f.editable && isEditable(command, f.key))), set = value => onChange({ ...settings, [f.key]: value });
        if (f.type === 'parameter_group') return <GroupField key={f.key} f={f} defs={groups?.[f.key]} value={settings?.[f.key]} disabled={locked} onChange={set} problem={(id, v) => groupProblem?.(f.key, id, v)} />;
        const Field = f.control === 'aspect_ratio' ? RatioField : FIELDS[f.type];
        return Field ? <Field key={f.key} f={f} value={settings?.[f.key]} settings={settings} disabled={f.type === 'boolean' ? locked : locked || f.available === false} onChange={set} /> : null;
      })}
    </div>
  );
}

// One reference as a pill: type icon and label, a button that opens the ORIGINAL card (never generates, never submits).
function RefPill({ reference, state, onOpen }) {
  const Icon = ICONS[reference.kind] || FileText;
  const bad = state && state.state !== 'ok';
  return (
    <button type="button" data-proposal-pill={reference.id} data-proposal-pill-source={reference.sourceId} data-proposal-pill-state={state?.state ?? 'ok'} onClick={() => onOpen?.(reference)}
      aria-label={`${reference.label}${bad ? `, ${state.state}` : ''}`}
      className={cn('mx-0.5 inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md border bg-surface px-1.5 align-middle text-xs text-ink hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent', bad ? 'border-fail' : 'border-line')}>
      <Icon size={13} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3" /><span className="truncate">{reference.label}</span>
    </button>
  );
}

function Description({ text, tokenized, references, states, onOpen }) {
  const segments = tokenized ? promptSegments(text, references) : null;
  if (!segments) return <p data-proposal-description className="text-sm leading-relaxed break-words text-ink">{text}</p>;
  return (
    <p data-proposal-description className="text-sm leading-relaxed break-words text-ink">
      {segments.map((s, i) => (s.type === 'text' ? s.text : s.reference ? <RefPill key={i} reference={s.reference} state={states?.find(x => x.id === s.id)} onOpen={onOpen} /> : null))}
    </p>
  );
}

const SECTION_TITLES = { requirements: 'Requirements', assumptions: 'Assumptions', missing_information: 'Missing information', limitations: 'Not supported or not verified' };
const TONES = { assumptions: 'text-warn', missing_information: 'text-fail' };
// The default description editor: the text with its reference codes. The pill editor lane supplies a pill-aware Editor.
function DefaultEditor({ value, references, onChange, disabled }) {
  return (
    <div className="flex flex-col gap-1">
      <textarea data-proposal-editor aria-label="Description" rows={5} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className={area} />
      {references.length > 0 && <p className="text-xs text-ink-2">Each reference sits in the text as its code, like {`{{ref:${references[0].id}}}`}. Keep it where the card is used.</p>}
    </div>
  );
}

const DETAIL_LISTS = ['requirements', 'assumptions', 'missing_information', 'limitations'];
const startDraft = view => ({ title: view.title, description: view.description, references: view.references, ...Object.fromEntries(DETAIL_LISTS.map(k => [k, view[k]])) });
// The edit a Save sends: only the keys that changed. A description of a proposal made before the review envelope is plain text, so it is escaped
// into the prompt grammar (generation-review.js); a v3 proposal's description already is the prompt.
export function buildEdit(view, draft, tokenized) {
  const edit = {};
  for (const k of changedKeys(view, draft)) edit[k] = k === 'description' && !tokenized ? escapeText(draft[k]) : draft[k];
  return edit;
}

// made: this proposal already added its card (inactive, but not superseded).
export default function GenerationProposalCard({ proposal = null, view: given = null, defaultEditing = false, active = true, onGenerate, onSave, onSettingsChange, onCancel, onOpenReference, busy = false, made = false, states = null, problem = null, groups = null, groupProblem = null, Editor = DefaultEditor }) {
  const view = given ?? proposalView(proposal, states ? { validation_errors: states.filter(s => s.state !== 'ok').map(s => ({ path: `references.${s.id}`, message: s.message })) } : {});
  const def = commandDefinition(view.command);
  const tokenized = proposal ? isReviewProposal(proposal) : false;
  const key = `${view.proposal_id}:${view.revision}`;
  // One press, one job (owner message 37): the ref stops a double-click before React re-renders; state shows it disabled.
  const sent = useRef(null);
  const [sentKey, setSentKey] = useState(null);
  const [editing, setEditing] = useState(defaultEditing), [draft, setDraft] = useState(() => (defaultEditing ? startDraft(view) : null)), [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(null);
  const usage = usageLine(view.usage);
  const working = busy || saving;
  const detailKeys = ['title', 'description', 'references', ...DETAIL_LISTS].filter(k => isEditable(view.command, k));
  const dirty = !!draft && changedKeys(view, draft).length > 0;
  // Generate is for the saved, current, valid revision: not while the details form is open or holds unsaved edits.
  const canGenerate = view.allowed_actions.includes('generate') && !editing && !dirty && !(view.validation_errors?.length);
  const generate = () => {
    if (!active || working || !canGenerate || sent.current === key) return;
    sent.current = key;
    setSentKey(key);
    onGenerate?.(proposal ?? view);
  };
  const change = settings => (onSave ? onSave({ settings }) : onSettingsChange?.(settings));
  const open = () => { setDraft(startDraft(view)); setSaveError(null); setEditing(true); };
  const close = () => { setEditing(false); setDraft(null); setSaveError(null); };
  const save = async () => {
    const edit = buildEdit(view, draft, tokenized);
    if (!Object.keys(edit).length) { close(); return; }
    setSaving(true); setSaveError(null);
    try { await onSave?.(edit); close(); } catch (error) { setSaveError(error?.message || 'Not saved.'); } finally { setSaving(false); }
  };
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const dropReference = id => setDraft(d => { const next = removeReference({ prompt: d.description, references: d.references }, id); return { ...d, description: next.prompt, references: next.references }; });
  const shown = editing && draft ? { ...view, ...draft } : view;
  const sections = SECTIONS.filter(s => (editing && DETAIL_LISTS.includes(s) && isEditable(view.command, s)) || visibleSections(shown).includes(s));
  // A reference's own words sit beside its pill when the references are drawn; the list below carries the rest.
  const errors = (view.validation_errors || []).filter(e => !(e.path.startsWith('references.') && sections.includes('references')));
  const note = problem?.message || saveError;
  return (
    <section data-generation-proposal={view.command} data-proposal-version={view.revision} data-proposal-active={active ? 'true' : 'false'} data-proposal-status={view.status}
      aria-label={view.title} className={cn('flex w-full max-w-xl min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4', !active && 'opacity-70')}>
      {editing && isEditable(view.command, 'title')
        ? <input data-proposal-title aria-label="Title" value={draft.title} onChange={event => set('title', event.target.value)} className={cn(control, 'w-full text-[15px] font-semibold')} />
        : <h3 className="text-[15px] leading-snug font-semibold break-words text-ink">{view.title}</h3>}
      {view.original_request && (
        <p data-proposal-request className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
          <CommandPill name={view.command} ariaLabel={`${view.command} command`} className="h-5 rounded-md px-1.5 text-xs" />
          <span className="min-w-0 break-words">{view.original_request.replace(/^\/[a-z0-9-]+\s*/i, '')}</span>
        </p>
      )}
      <Settings command={view.command} settings={view.settings} disabled={!active || working} onChange={change} groups={groups} groupProblem={groupProblem} />
      {editing && isEditable(view.command, 'description')
        ? <Editor value={draft.description} references={draft.references} onChange={value => set('description', value)} disabled={working} />
        : <Description text={view.description} tokenized={tokenized} references={view.references} states={states} onOpen={onOpenReference} />}
      {sections.map(s => {
        if (s === 'usage') return null;
        if (s === 'references') {
          return (
            <ul key={s} data-proposal-section="references" className="flex flex-col gap-1">
              {shown.references.map(r => {
                const state = states?.find(x => x.id === r.id);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <RefPill reference={r} state={state} onOpen={onOpenReference} />
                    {state?.message && <span role="alert" data-proposal-reference-state={state.state} className="text-fail">{state.message}</span>}
                    {editing && isEditable(view.command, 'references') && <button type="button" data-proposal-remove-reference={r.id} disabled={working} onClick={() => dropReference(r.id)} className="rounded border border-line px-1.5 py-0.5 text-ink-2 hover:bg-hover">Remove</button>}
                  </li>
                );
              })}
            </ul>
          );
        }
        if (editing && isEditable(view.command, s)) return <ListField key={s} f={{ key: s, label: SECTION_TITLES[s] }} value={draft[s]} disabled={working} onChange={value => set(s, value)} />;
        return (
          <div key={s} data-proposal-section={s}>
            <p className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{SECTION_TITLES[s]}</p>
            <ul className={cn('list-disc pl-4 text-xs text-ink', TONES[s])}>{shown[s].map((item, i) => <li key={i}>{item}</li>)}</ul>
          </div>
        );
      })}
      {view.notices?.length > 0 && <ul data-proposal-notices className="flex flex-col gap-0.5 text-xs text-ink-2">{view.notices.map((n, i) => <li key={i} data-proposal-notice={n.path}>{n.message}</li>)}</ul>}
      {errors.length > 0 && (
        <ul data-proposal-errors role="alert" className="flex flex-col gap-0.5 text-xs text-fail">
          {errors.map((e, i) => <li key={i} data-proposal-error-path={e.path} className="flex items-start gap-1"><CircleAlert size={13} aria-hidden className="mt-0.5 shrink-0" />{e.message}</li>)}
        </ul>
      )}
      {view.missing_information?.length > 0 && <p data-proposal-blocked className="text-xs text-fail">Answer or remove the missing information before generating.</p>}
      {usage ? <p data-proposal-usage className="text-xs text-ink-2">{usage}</p>
        : view.usage?.unknown && <p data-proposal-usage data-proposal-usage-unknown className="text-xs text-ink-2">{UNKNOWN_PRICE}</p>}
      {note && <p role="alert" data-proposal-problem className="text-xs text-fail">{note}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {editing
          ? <>
            <Button type="button" variant="secondary" size="sm" data-proposal-discard disabled={saving} onClick={close}>Discard</Button>
            <Button type="button" variant="secondary" size="sm" data-proposal-save disabled={saving || !dirty} onClick={save}>Save</Button>
          </>
          : detailKeys.length > 0 && active && view.allowed_actions.includes('edit') && <Button type="button" variant="secondary" size="sm" data-proposal-edit disabled={working} onClick={open}>Edit details</Button>}
        <Button type="button" variant="action" data-proposal-generate disabled={!active || working || !canGenerate || sentKey === key} onClick={generate}>Generate</Button>
        {def?.cancel && onCancel && active && view.allowed_actions.includes('cancel') && <Button type="button" variant="secondary" size="sm" data-proposal-cancel disabled={working} onClick={() => onCancel(proposal ?? view)}>Cancel</Button>}
        {made ? <span data-proposal-made className="text-xs text-ink-2">Added to the canvas</span>
          : !active && <span data-proposal-superseded className="text-xs text-ink-2">Updated below</span>}
      </div>
    </section>
  );
}
