import { useEffect, useState } from 'react';
import { Lightbulb, Pause, Play, RotateCcw, Scan } from 'lucide-react';
import { Tip } from '../ui.jsx';
import { decimals, formatValue, outcomeText, parameterInput, readoutText, sliderStep } from './card.js';

// The Animation card's local controls (plan section 4, AN-03): the toolbar under the viewport, the compact parameter rows,
// the scene's actions, the mini-game panel and the readouts. Each renders only what its card declares; nothing here runs the
// scene, it calls the session's handlers. Native buttons and inputs, so Tab, Enter, Space and the arrow keys work, and the
// global press feedback (index.css) applies. A disabled control keeps its name, greyed.

export const buttonClass = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs text-ink hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-default disabled:text-ink-3 disabled:hover:bg-white';
const label = 'text-xs font-medium text-ink-2';

// Play or pause, restart and speed for a loop; Reset view for any live 3D view. Only the declared ones are drawn.
export function Toolbar({ show, playing = false, speed = 1, speeds = [], live = false, disabled = false, onPlay, onPause, onRestart, onSpeed, onResetView }) {
  if (!show.transport && !show.resetView) return null;
  return (
    <div role="toolbar" aria-label="Scene playback" data-animation-toolbar className="flex flex-wrap items-center gap-1.5">
      {show.transport && <>
        <button type="button" data-animation-play aria-pressed={playing} disabled={disabled} onClick={playing ? onPause : onPlay} className={buttonClass}>
          {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}{playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" data-animation-restart disabled={disabled} onClick={onRestart} className={buttonClass}><RotateCcw size={14} aria-hidden />Restart</button>
        {show.speed && (
          <label className="inline-flex items-center gap-1.5">
            <span className={label}>Speed</span>
            <select data-animation-speed value={speed} disabled={disabled} onChange={event => onSpeed(Number(event.target.value))}
              className="h-8 rounded-lg border border-line bg-white px-1.5 text-xs text-ink disabled:text-ink-3">
              {speeds.map(value => <option key={value} value={value}>{value}x</option>)}
            </select>
          </label>
        )}
      </>}
      {show.resetView && (
        <Tip label="Reset view" info="Return the camera to the scene's starting view">
          <button type="button" data-animation-reset-view disabled={!live} onClick={onResetView} className={buttonClass}><Scan size={14} aria-hidden />Reset view</button>
        </Tip>
      )}
    </div>
  );
}

// A number parameter: the range slider, and a number field for typing an exact value (the keyboard alternative). A typed value
// outside the declared range is not sent; leaving the field puts the accepted value back.
function NumberRow({ parameter, value, disabled, onChange }) {
  const step = sliderStep(parameter), shown = Number(value).toFixed(decimals(step));
  const [draft, setDraft] = useState(shown);
  useEffect(() => { setDraft(shown); }, [shown]);
  const send = raw => { const next = parameterInput(parameter, raw); if (next !== null && next !== value) onChange(parameter.id, next); };
  return (
    <div role="group" aria-label={parameter.label} data-animation-parameter={parameter.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className={`${label} w-full sm:w-auto sm:min-w-24`}>{parameter.label}</span>
      <input type="range" min={parameter.min} max={parameter.max} step={step} value={value} disabled={disabled}
        aria-label={parameter.label} aria-valuetext={formatValue(parameter, value)}
        onChange={event => send(event.target.value)} className="h-8 min-w-24 flex-1 accent-accent disabled:opacity-50" />
      <span className="inline-flex items-center gap-1">
        <input type="number" inputMode="decimal" data-animation-number={parameter.id} min={parameter.min} max={parameter.max} step={step} value={draft} disabled={disabled}
          aria-label={`${parameter.label}${parameter.unit ? ` in ${parameter.unit}` : ''}`}
          onChange={event => { setDraft(event.target.value); send(event.target.value); }}
          onBlur={() => setDraft(shown)}
          onKeyDown={event => { if (event.key === 'Enter') { send(event.currentTarget.value); setDraft(shown); } }}
          className="h-8 w-20 rounded-lg border border-line bg-white px-2 text-right text-xs text-ink tabular-nums disabled:text-ink-3" />
        {parameter.unit && <span className="text-xs text-ink-2">{parameter.unit}</span>}
      </span>
    </div>
  );
}

export function ParameterRow({ parameter, value, disabled = false, onChange }) {
  if (parameter.type === 'number') return <NumberRow parameter={parameter} value={value} disabled={disabled} onChange={onChange} />;
  if (parameter.type === 'toggle') {
    return (
      <label data-animation-parameter={parameter.id} className="flex items-center gap-2">
        <input type="checkbox" checked={!!value} disabled={disabled} onChange={event => onChange(parameter.id, event.target.checked)} className="h-4 w-4 accent-accent" />
        <span className={label}>{parameter.label}</span>
      </label>
    );
  }
  return (
    <label data-animation-parameter={parameter.id} className="flex flex-wrap items-center gap-2">
      <span className={label}>{parameter.label}</span>
      <select value={String(value)} disabled={disabled} onChange={event => { const next = parameterInput(parameter, event.target.value); if (next !== null) onChange(parameter.id, next); }}
        className="h-8 rounded-lg border border-line bg-white px-1.5 text-xs text-ink disabled:text-ink-3">
        {parameter.options.map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function Parameters({ parameters, values, disabled = false, onChange }) {
  if (!parameters.length) return null;
  return (
    <div data-animation-parameters className="flex flex-col gap-1.5">
      {parameters.map(parameter => <ParameterRow key={parameter.id} parameter={parameter} value={values?.[parameter.id] ?? parameter.default} disabled={disabled} onChange={onChange} />)}
    </div>
  );
}

export function Actions({ actions, disabled = false, onAction }) {
  if (!actions.length) return null;
  return (
    <div role="group" aria-label="Actions" data-animation-actions className="flex flex-wrap items-center gap-1.5">
      {actions.map(action => <button key={action.id} type="button" data-animation-action={action.id} disabled={disabled} onClick={() => onAction(action.id)} className={buttonClass}>{action.label}</button>)}
    </div>
  );
}

// The mini-game: its goal and the outcome from the scene's own frame (its moves or attempts are the scene's readouts), and the
// hint on request. The scene's actions are its moves. The outcome is announced politely when it changes.
// ponytail: no Check/Submit control: the contract declares no check action (hand-back contract gap).
export function GamePanel({ goal, status, hintOpen = false, onHint }) {
  return (
    <div data-animation-game={status?.status ?? 'playing'} className="flex flex-col gap-1.5 rounded-lg border border-line px-3 py-2">
      {goal.objective && <p data-animation-goal className="text-xs text-ink"><span className="font-semibold">Goal: </span>{goal.objective}</p>}
      <p role="status" aria-live="polite" data-animation-outcome className={`text-xs ${status?.status === 'won' ? 'text-pass' : status?.status === 'lost' ? 'text-fail' : 'text-ink-2'}`}>
        {outcomeText(status)}
      </p>
      {goal.hint && <div><button type="button" data-animation-hint aria-expanded={hintOpen} onClick={onHint} className={buttonClass}><Lightbulb size={14} aria-hidden />{hintOpen ? 'Hide hint' : 'Hint'}</button></div>}
      {goal.hint && hintOpen && <p data-animation-hint-text className="text-xs text-ink-2">{goal.hint}</p>}
    </div>
  );
}

export function Readouts({ readouts }) {
  if (!readouts.length) return null;
  return (
    <dl data-animation-readouts aria-label="Readouts" className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {readouts.map(item => <div key={item.id} className="contents"><dt className="text-ink-2">{item.label}</dt><dd data-animation-readout={item.id} className="text-ink tabular-nums">{readoutText(item)}</dd></div>)}
    </dl>
  );
}
