import { Play, Save, Square, Trash2 } from 'lucide-react';
import { Button, Chk, Input } from './ui.jsx';
import { KnobFields, Mark, OutputPane, PRE, Progress, SourceLink, TONE } from './RunParts.jsx';
import RunOutputs from './RunOutputs.jsx';
import { presetCommands } from './run-card-history.js';
import { NAME_MAX, knobFields, stepCells, stepIdOf } from './run-card-knobs.js';
import { paneText, progressOf, runLabel, runTone, seconds } from './run-card-view.js';

// The Custom run tab (Run card v1.1 Part 3b): a run composed from the route's own steps and parameters, never a free command. Pick one step or several (always in route order),
// edit the full knob list of each (the record's and the Tutor's), name it, Run, or Save it as a preset. A preset is (steps, knob values); its command is shown read-only under its name,
// composed for display (run-card-history.js presetCommands: the controller composes the real one from the record).
// Reused: ui.jsx Button, Chk, Input; RunParts.jsx for the parameter fields, the progress bar and the output pane.
export default function RunCustom({ cells, added, draft, setDraft, ready, active, readOnly, run, full, presets, onRun, onStop, onSave, onRunPreset, onDelete, onOpen, onLog, load }) {
  const steps = stepCells(cells), busy = !!active, off = readOnly || !ready || busy;
  const picked = steps.filter(cell => draft.steps.includes(stepIdOf(cell)));
  const toggle = id => setDraft(d => ({ ...d, steps: d.steps.includes(id) ? d.steps.filter(s => s !== id) : [...d.steps, id] }));
  const type = (id, flag, value) => setDraft(d => ({ ...d, values: { ...d.values, [id]: { ...d.values[id], [flag]: value } } }));
  const reset = id => setDraft(d => ({ ...d, values: { ...d.values, [id]: {} } }));
  const tone = runTone(run), progress = progressOf(run), last = picked.at(-1);
  if (!steps.length) return <p className="px-4 py-3 text-sm text-ink-2">Start a session to see the steps of this route and compose a run from them.</p>;
  return (
    <div data-run-custom className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-col gap-1.5" role="group" aria-label="Steps">
        <p className="text-xs font-medium text-ink-2">Steps, in route order</p>
        {steps.map(cell => {
          const id = stepIdOf(cell), on = draft.steps.includes(id);
          return (
            <div key={id} className="flex items-center gap-2 text-sm text-ink">
              <Chk on={on} aria-label={`Include ${cell.title}`} data-run-step={id} disabled={readOnly || busy} onClick={() => toggle(id)} />
              <span>{cell.title}</span><span className="font-mono text-xs text-ink-2">{id}</span>
            </div>
          );
        })}
      </div>
      {picked.map(cell => {
        const id = stepIdOf(cell), fields = knobFields(cell, { overrides: draft.values[id], added, cells });
        return <KnobFields key={id} label={`${cell.title} parameters`} fields={fields} disabled={readOnly || busy} onChange={(flag, value) => type(id, flag, value)} onReset={() => reset(id)} onOpen={onOpen} />;
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Input data-run-custom-name aria-label="Name" placeholder="Name this run, for example ROMEO at 0.3" maxLength={NAME_MAX} value={draft.name} disabled={readOnly} onChange={event => setDraft(d => ({ ...d, name: event.target.value }))} className="max-w-72" />
        <Button type="button" variant="secondary" size="sm" data-run-custom-run disabled={off || !picked.length} onClick={onRun}><Play size={12} aria-hidden="true" />Run</Button>
        <Button type="button" variant={busy ? 'danger' : 'ghost'} size="sm" data-run-custom-stop disabled={readOnly || !busy} onClick={onStop}><Square size={12} aria-hidden="true" />Stop</Button>
        <Button type="button" variant="ghost" size="sm" data-run-custom-save disabled={readOnly || !picked.length} onClick={onSave}><Save size={12} aria-hidden="true" />Save as a preset</Button>
      </div>
      {run && (
        <div data-run-custom-output className="flex flex-col gap-1.5">
          <p className={`flex items-center gap-1 text-xs font-medium ${TONE[tone] || 'text-ink-2'}`}><Mark tone={tone} />{[runLabel(run), seconds(run.sec)].filter(Boolean).join(' · ')}</p>
          {progress && <Progress progress={progress} />}
          <OutputPane running={!run.complete} text={(full !== undefined ? full : paneText(run)) || (run.complete ? 'No output' : 'Waiting for output')} />
          {run.runId && <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={onLog}>{full !== undefined ? 'Show the latest lines' : 'Show the full log'}</Button>}
          <RunOutputs status={run} cell={last} load={path => load(run.runId, path)} />
        </div>
      )}
      <section aria-label="Presets" data-run-presets className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-xs font-medium text-ink-2">Presets</p>
        {presets.length === 0 && <p className="text-xs text-ink-2">Saved custom runs appear here.</p>}
        {presets.map(preset => (
          <div key={`${preset.name}-${preset.createdAt}`} data-run-preset={preset.name} className="flex flex-col gap-1.5 rounded-lg border border-line p-3">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{preset.name}</p>
              <Button type="button" variant="secondary" size="sm" data-run-preset-run disabled={off} onClick={() => onRunPreset(preset)}><Play size={12} aria-hidden="true" />Run</Button>
              <Button type="button" variant="ghost" size="sm" data-run-preset-delete aria-label={`Delete ${preset.name}`} disabled={readOnly} onClick={() => onDelete(preset)}><Trash2 size={12} aria-hidden="true" />Delete</Button>
            </div>
            {presetCommands(preset, cells, added).map(c => (
              <div key={c.step} className="flex flex-col gap-1">
                <pre data-run-preset-cmd className={PRE}>{c.cmd}</pre>
                {c.flags.some(f => f.source) && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">{c.flags.filter(f => f.source).map(f => <span key={f.flag} className="flex items-center gap-1"><span className="font-mono">{f.flag}</span><SourceLink source={f.source} onOpen={onOpen} /></span>)}</div>}
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
