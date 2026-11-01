import { useEffect, useId, useState } from 'react';
import { Check, Lightbulb, Pause, Play, RotateCcw, Rotate3d, Scan, Tag } from 'lucide-react';
import { Tip } from '../ui.jsx';
import { decimals, formatValue, outcomeText, parameterInput, readoutText, sliderStep } from './card.js';

// The Animation card's local controls (plan section 4, AN-03): the toolbar under the viewport (playback and its status, then the
// view's own controls: Reset view, Labels, Interact), the settings (the primary control, the rest under More settings, the state
// reset beside them), the scene's actions, the mini-game panel and the readouts (an optional primary one over the scene). Each
// renders only what its card declares; nothing here runs the scene, it calls the session's handlers. Native buttons and inputs, so
// Tab, Enter, Space and the arrow keys work, and the global press feedback (index.css) applies. A disabled control keeps its name, greyed.

export const buttonClass = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs text-ink hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-default disabled:text-ink-3 disabled:hover:bg-white';
// A toggle's on state (Interact while interacting, Labels shown): filled, so it reads as selected at a glance.
const pressedClass = 'aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white aria-pressed:hover:bg-ink';
const label = 'text-xs font-medium text-ink-2';
const leadLabel = 'text-sm font-medium text-ink';
const summary = 'w-fit cursor-pointer rounded text-xs font-medium text-ink-2 select-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent';

// What leads (owner, 2026-10-31), generic for any scene, from the reviewed plan's own order. Its first parameter is the primary
// control (the planner orders them so; an older artifact keeps its own first), the rest wait collapsed; a game's moves are its
// primary controls, so a game with actions shows every parameter under More settings. A prominent result only where the learner is
// after one: an experiment's first readout (the requested result), a game's first readout (its score or moves) if it has any; a
// watch or inspect scene has none, its readouts stay in the plain list.
//   -> { primary: parameter | null, secondary: parameter[], readout: the primary readout's id | null }
export function leadControls(model) {
  const primary = model.experience === 'game' && model.actions.length > 0 ? null : model.parameters[0] ?? null;
  const readout = model.experience === 'experiment' || model.experience === 'game' ? model.readouts[0]?.id ?? null : null;
  return { primary, secondary: model.parameters.filter(parameter => parameter !== primary), readout };
}

// The one toolbar under the viewport. Playback for a loop: Play or Pause, Restart (only where the scene can rewind: session.js seeks
// to 0 keeping the settings; a rule-based loop cannot, so it offers none rather than a hidden reset), Speed, and the status, which
// is the runtime's (status: shown only while the runtime is ready, never loading or failed). Then the view: Reset view (camera
// only), Labels (only when the scene has optional labels) and Interact, filled and named Done while the scene has the pointer.
export function Toolbar({ show, seekable = false, playing = false, status = false, speed = 1, speeds = [], disabled = false, live = false,
  interacting = false, optionalLabels = false, labels = true, onPlay, onPause, onRestart, onSpeed, onResetView, onInteract, onLabels }) {
  if (!show.transport && !show.resetView && !show.interact) return null;
  return (
    <div role="toolbar" aria-label="Scene controls" data-animation-toolbar className="flex flex-wrap items-center gap-1.5">
      {show.transport && <>
        <button type="button" data-animation3d-play aria-pressed={playing} disabled={disabled} onClick={playing ? onPause : onPlay} className={buttonClass}>
          {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}{playing ? 'Pause' : 'Play'}
        </button>
        {seekable && (
          <Tip label="Restart" info="Back to the start of the motion. Your settings stay.">
            <button type="button" data-animation-restart disabled={disabled} onClick={onRestart} className={buttonClass}><RotateCcw size={14} aria-hidden />Restart</button>
          </Tip>
        )}
        {show.speed && (
          <label className="inline-flex items-center gap-1.5">
            <span className={label}>Speed</span>
            <select data-animation-speed value={speed} disabled={disabled} onChange={event => onSpeed(Number(event.target.value))}
              className="h-8 rounded-lg border border-line bg-white px-1.5 text-xs text-ink disabled:text-ink-3">
              {speeds.map(value => <option key={value} value={value}>{value}x</option>)}
            </select>
          </label>
        )}
        {status && <span role="status" data-animation-playback-status className="text-xs text-ink-2">{playing ? 'Playing' : 'Paused'}</span>}
      </>}
      {/* The view's controls wrap together onto their own line on a narrow card. */}
      {(show.resetView || show.interact) && (
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {show.resetView && (
            <Tip label="Reset view" info="Return the camera to the scene's starting view. The scene itself is left as it is." align="end">
              <button type="button" data-animation-reset-view disabled={!live} onClick={onResetView} className={buttonClass}><Scan size={14} aria-hidden />Reset view</button>
            </Tip>
          )}
          {show.resetView && optionalLabels && (
            <Tip label="Labels" info="Show or hide object names and notes in the scene. Measurements and instructions stay." align="end">
              <button type="button" data-animation-labels aria-pressed={labels} disabled={!live} onClick={() => onLabels(!labels)} className={`${buttonClass} ${pressedClass}`}><Tag size={14} aria-hidden />Labels</button>
            </Tip>
          )}
          {show.interact && (
            <button type="button" data-animation-interact aria-pressed={interacting} disabled={!live} onClick={onInteract} className={`${buttonClass} ${pressedClass}`}>
              {interacting ? <Check size={14} aria-hidden /> : <Rotate3d size={14} aria-hidden />}{interacting ? 'Done' : 'Interact'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// The state reset, named by the experience (Reset experiment, Reset game, else Reset scene): the plan's starting settings and the
// simulation or game back to its start (runtime.js reset()); the camera stays. It sits beside the settings it affects, or with a
// game's moves when there are none. Its effect is its accessible description and its tooltip.
const RESETS = {
  experiment: ['Reset experiment', 'Puts every setting back to its starting value and the experiment back to its start. The camera stays.'],
  game: ['Reset game', 'Starts the game again from the beginning, with its starting settings. The camera stays.'],
};
export function ResetState({ experience, disabled = false, onReset }) {
  const id = useId();
  const [name, help] = RESETS[experience] ?? ['Reset scene', 'Puts the scene and its settings back to how they started. The camera stays.'];
  return (
    <Tip label={name} info={help} align="end">
      <button type="button" data-animation-reset aria-describedby={id} disabled={disabled} onClick={onReset} className={buttonClass}><RotateCcw size={14} aria-hidden />{name}</button>
      <span id={id} className="sr-only">{help}</span>
    </Tip>
  );
}

// A number parameter: the range slider, and a number field for typing an exact value (the keyboard alternative). A typed value
// outside the declared range is not sent; leaving the field puts the accepted value back.
function NumberRow({ parameter, value, primary, disabled, onChange }) {
  const step = sliderStep(parameter), shown = Number(value).toFixed(decimals(step));
  const [draft, setDraft] = useState(shown);
  useEffect(() => { setDraft(shown); }, [shown]);
  const send = raw => { const next = parameterInput(parameter, raw); if (next !== null && next !== value) onChange(parameter.id, next); };
  return (
    <div role="group" aria-label={parameter.label} data-animation-parameter={parameter.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className={`${primary ? leadLabel : label} w-full sm:w-auto sm:min-w-24`}>{parameter.label}</span>
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

// primary: the scene's lead control, its label read first. A toggle is a switch: a native checkbox with the switch role, so Space,
// the label and focus work as before.
export function ParameterRow({ parameter, value, primary = false, disabled = false, onChange }) {
  if (parameter.type === 'number') return <NumberRow parameter={parameter} value={value} primary={primary} disabled={disabled} onChange={onChange} />;
  if (parameter.type === 'toggle') {
    return (
      <label data-animation-parameter={parameter.id} className="flex w-fit cursor-pointer items-center gap-2">
        <input type="checkbox" role="switch" checked={!!value} disabled={disabled} onChange={event => onChange(parameter.id, event.target.checked)} className="peer sr-only" />
        <span aria-hidden className="relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
        <span className={`${primary ? leadLabel : label} peer-disabled:text-ink-3`}>{parameter.label}</span>
      </label>
    );
  }
  return (
    <label data-animation-parameter={parameter.id} className="flex flex-wrap items-center gap-2">
      <span className={primary ? leadLabel : label}>{parameter.label}</span>
      <select value={String(value)} disabled={disabled} onChange={event => { const next = parameterInput(parameter, event.target.value); if (next !== null) onChange(parameter.id, next); }}
        className="h-8 rounded-lg border border-line bg-white px-1.5 text-xs text-ink disabled:text-ink-3">
        {parameter.options.map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
      </select>
    </label>
  );
}

// The settings: the primary control in full, the others under More settings (collapsed until asked), and the state reset beside
// them (reset: a ResetState). No parameters, no section.
export function Settings({ primary, secondary, values, disabled = false, reset = null, onChange }) {
  if (!primary && !secondary.length) return null;
  const row = (parameter, lead = false) => <ParameterRow key={parameter.id} parameter={parameter} primary={lead} value={values?.[parameter.id] ?? parameter.default} disabled={disabled} onChange={onChange} />;
  return (
    <div role="group" aria-label="Settings" data-animation-parameters className="flex flex-col gap-1.5">
      {primary && row(primary, true)}
      {/* Open, More settings takes the whole row and the reset follows it. */}
      <div className="flex flex-wrap items-start gap-1.5">
        {secondary.length > 0 && (
          <details data-animation-more="settings" className="min-w-0 flex-1 open:basis-full">
            <summary className={summary}>More settings</summary>
            <div className="mt-1.5 flex flex-col gap-1.5">{secondary.map(parameter => row(parameter))}</div>
          </details>
        )}
        {reset && <span className="ml-auto">{reset}</span>}
      </div>
    </div>
  );
}

// reset: the state reset, after the moves when the scene has no settings to sit beside.
export function Actions({ actions, disabled = false, reset = null, onAction }) {
  if (!actions.length) return null;
  return (
    <div role="group" aria-label="Actions" data-animation-actions className="flex flex-wrap items-center gap-1.5">
      {actions.map(action => <button key={action.id} type="button" data-animation-action={action.id} disabled={disabled} onClick={() => onAction(action.id)} className={buttonClass}>{action.label}</button>)}
      {reset && <span className="ml-auto">{reset}</span>}
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

// The primary result, over the scene's top-left corner at a fixed interface size (never a scene label): the validated readout's
// own label, value at its declared decimals and unit. It never takes a press.
export function PrimaryReadout({ item }) {
  if (!item) return null;
  return (
    <dl data-animation-primary-readout className="pointer-events-none absolute top-2 left-2 max-w-[60%] rounded-md bg-white/90 px-2 py-1 shadow-sm">
      <dt className="text-[11px] font-medium text-ink-2">{item.label}</dt>
      <dd data-animation-readout={item.id} data-value={item.value} className="text-lg leading-tight font-semibold text-ink tabular-nums">{readoutText(item)}</dd>
    </dl>
  );
}

// The other readouts at the interface's small size: under More readouts (collapsed until asked) when a primary one leads, else the
// plain list (a watch or inspect scene).
export function Readouts({ readouts, collapsed = false }) {
  if (!readouts.length) return null;
  const list = (
    <dl data-animation-readouts aria-label="Readouts" className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs ${collapsed ? 'mt-1' : ''}`}>
      {readouts.map(item => <div key={item.id} className="contents"><dt className="text-ink-2">{item.label}</dt><dd data-animation-readout={item.id} data-value={item.value} className="text-ink tabular-nums">{readoutText(item)}</dd></div>)}
    </dl>
  );
  if (!collapsed) return list;
  return (
    <details data-animation-more="readouts">
      <summary className={summary}>More readouts</summary>
      {list}
    </details>
  );
}
