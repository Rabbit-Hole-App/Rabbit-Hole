// UI-15 / MOT-20 (owner messages 39 and 40): the shared generation-proposal card. Trusted UI draws a signed proposal from
// control-plane generation-proposal.js: { proposal_id, version, command, title, description, settings, usage }. Title as the
// heading, the description as plain sentences with no labels, the command's settings, one usage line in credits from the
// server, and one Generate. No Cancel: an unanswered proposal starts nothing. A superseded version ("Updated below") is inert.
import { useId, useRef, useState } from 'react';
import { proposalFields } from '../../control-plane/src/proposal-rules.js';
import { Button, Tip, cn } from './ui.jsx';

// The card's fields come from the capability's declaration (proposal-rules.js proposalFields, MOT-20b): no capability has a
// settings component of its own, and one without a field shows none.
const MOTION_SECONDS = proposalFields('motion').find(f => f.type === 'integer');
// A seconds field's choices: min to max in steps, plus the proposal's own value when the model chose another second.
export function durationOptions(current, f = MOTION_SECONDS) {
  const steps = [];
  for (let s = f.min; s <= f.max; s += f.step || 1) steps.push(s);
  return [...new Set([...steps, ...(Number.isInteger(current) ? [current] : [])])].sort((a, b) => a - b);
}

const fmt = n => Number(n).toLocaleString('en-US');
// Server-provided credits only (owner messages 30-33: never dollars). The reservation stays internal: the line is the estimate
// alone (owner, 2026-10-21: "About 100 credits"). -> '' without an estimate.
export function usageLine(usage) {
  const e = usage?.estimate_credits;
  return e != null ? `About ${fmt(e)} credits` : '';
}

const control = 'h-7 rounded-md border border-line bg-surface px-2 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';
const segment = 'h-7 px-2.5 text-[13px] focus-visible:outline-2 focus-visible:outline-accent';

function SecondsField({ f, value, disabled, onChange }) {
  return (
    <label data-proposal-field={f.key} className="flex items-center gap-2 text-[13px] text-ink-2">
      {f.label}
      <select data-proposal-duration value={value ?? ''} disabled={disabled} onChange={event => onChange(Number(event.target.value))} className={control}>
        {durationOptions(value, f).map(s => <option key={s} value={s}>{s} seconds</option>)}
      </select>
    </label>
  );
}

function ToggleField({ f, value, disabled, onChange }) {
  const labelId = useId(); // unique per card: earlier versions stay in the chat history
  const on = value === true;
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
          ? <Tip label={f.unavailable || 'Not available yet'} align="end">{button('on', 'On', { disabled: true, title: f.unavailable || 'Not available yet' })}</Tip>
          : button('on', 'On', { disabled })}
      </div>
    </div>
  );
}

const FIELDS = { integer: SecondsField, boolean: ToggleField };
function Settings({ command, settings, disabled, onChange }) {
  const fields = proposalFields(command).filter(f => FIELDS[f.type]);
  if (!fields.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-proposal-settings={command}>
      {fields.map(f => { const Field = FIELDS[f.type]; return <Field key={f.key} f={f} value={settings?.[f.key]} disabled={disabled} onChange={value => onChange({ ...settings, [f.key]: value })} />; })}
    </div>
  );
}

// made: this proposal already added its card (inactive, but not superseded).
export default function GenerationProposalCard({ proposal, active = true, onGenerate, onSettingsChange, busy = false, made = false }) {
  const key = `${proposal.proposal_id}:${proposal.version}`;
  // One press, one job (owner message 37): the ref stops a double-click before React re-renders; state shows it disabled.
  const sent = useRef(null);
  const [sentKey, setSentKey] = useState(null);
  const usage = usageLine(proposal.usage);
  const generate = () => {
    if (!active || busy || sent.current === key) return;
    sent.current = key;
    setSentKey(key);
    onGenerate?.(proposal);
  };
  return (
    <section data-generation-proposal={proposal.command} data-proposal-version={proposal.version} data-proposal-active={active ? 'true' : 'false'}
      aria-label={proposal.title} className={cn('flex w-full max-w-xl min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4', !active && 'opacity-70')}>
      <h3 className="text-[15px] leading-snug font-semibold break-words text-ink">{proposal.title}</h3>
      <Settings command={proposal.command} settings={proposal.settings} disabled={!active || busy} onChange={settings => onSettingsChange?.(settings)} />
      <p className="text-sm leading-relaxed break-words text-ink">{proposal.description}</p>
      {usage && <p data-proposal-usage className="text-xs text-ink-2">{usage}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="action" data-proposal-generate disabled={!active || busy || sentKey === key} onClick={generate}>Generate</Button>
        {made ? <span data-proposal-made className="text-xs text-ink-2">Added to the canvas</span>
          : !active && <span data-proposal-superseded className="text-xs text-ink-2">Updated below</span>}
      </div>
    </section>
  );
}
