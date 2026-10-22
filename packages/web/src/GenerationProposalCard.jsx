// UI-15 / MOT-20 (owner messages 39 and 40): the shared generation-proposal card. Trusted UI draws a signed proposal from
// control-plane generation-proposal.js: { proposal_id, version, command, title, description, settings, usage }. Title as the
// heading, the description as plain sentences with no labels, the command's settings, one usage line in credits from the
// server, and one Generate. No Cancel: an unanswered proposal starts nothing. A superseded version ("Updated below") is inert.
import { useId, useRef, useState } from 'react';
import { DURATION } from '../../learn-render/motion/duration.js';
import { Button, Tip, cn } from './ui.jsx';

// The Motion selector's choices: 5 to 30 s in steps of 5, plus the proposal's own value when the model chose another second.
const STEPS = [];
for (let s = DURATION.min; s <= DURATION.max; s += 5) STEPS.push(s);
export const durationOptions = current => [...new Set([...STEPS, ...(Number.isInteger(current) ? [current] : [])])].sort((a, b) => a - b);

const fmt = n => Number(n).toLocaleString('en-US');
// Server-provided credits only (owner messages 30-33: never dollars). -> '' when the server sent neither number.
export function usageLine(usage) {
  const e = usage?.estimate_credits, r = usage?.reserve_credits;
  if (e != null && r != null) return `About ${fmt(e)} credits · ${fmt(r)} reserved while generating`;
  if (e != null) return `About ${fmt(e)} credits`;
  if (r != null) return `${fmt(r)} credits reserved while generating`;
  return '';
}

const field = 'h-7 rounded-md border border-line bg-surface px-2 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';
const segment = 'h-7 px-2.5 text-[13px] focus-visible:outline-2 focus-visible:outline-accent';

function MotionSettings({ settings, disabled, onChange }) {
  const seconds = settings?.duration_seconds;
  const audioLabel = useId(); // unique per card: earlier versions stay in the chat history
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-proposal-settings="motion">
      <label className="flex items-center gap-2 text-[13px] text-ink-2">
        Duration
        <select data-proposal-duration value={seconds ?? ''} disabled={disabled} onChange={event => onChange({ ...settings, duration_seconds: Number(event.target.value), audio: false })} className={field}>
          {durationOptions(seconds).map(s => <option key={s} value={s}>{s} seconds</option>)}
        </select>
      </label>
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        <span id={audioLabel}>Audio</span>
        <div role="group" aria-labelledby={audioLabel} className="inline-flex overflow-hidden rounded-md border border-line">
          <button type="button" data-proposal-audio="off" aria-pressed="true" disabled={disabled} className={cn(segment, 'bg-active text-ink disabled:opacity-50')}>Off</button>
          <Tip label="Narration coming soon" align="end">
            <button type="button" data-proposal-audio="on" aria-pressed="false" disabled title="Narration coming soon" className={cn(segment, 'border-l border-line text-ink-3 disabled:cursor-default')}>On</button>
          </Tip>
        </div>
      </div>
    </div>
  );
}

const SETTINGS = { motion: MotionSettings };

// made: this proposal already added its card (inactive, but not superseded).
export default function GenerationProposalCard({ proposal, active = true, onGenerate, onSettingsChange, busy = false, made = false }) {
  const key = `${proposal.proposal_id}:${proposal.version}`;
  // One press, one job (owner message 37): the ref stops a double-click before React re-renders; state shows it disabled.
  const sent = useRef(null);
  const [sentKey, setSentKey] = useState(null);
  const Settings = SETTINGS[proposal.command];
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
      {Settings && <Settings settings={proposal.settings} disabled={!active || busy} onChange={settings => onSettingsChange?.(settings)} />}
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
