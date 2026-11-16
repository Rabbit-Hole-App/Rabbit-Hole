import { useState } from 'react';
import { MoreHorizontal, Play, Save, Square } from 'lucide-react';
import { Button, Input, Menu, MenuItem, useMenuButton } from './ui.jsx';
import { CMD_PRE, Chip, KnobFields, OutputPane, Progress, SourceLink } from './RunParts.jsx';
import RunOutputs from './RunOutputs.jsx';
import { presetCommands } from './run-card-history.js';
import { NAME_MAX, knobFields, stepCells, stepIdOf } from './run-card-knobs.js';
import { paneText, progressOf } from './run-card-view.js';
import { RUN_CARD_COPY as COPY, knobLabel, stepState } from './run-card-copy.js';

// The Custom run tab (run-card-ux-spec.md section 1, tab 2): what can I change first. The settings of the route's last step lead (the one the plan names), then the others by step, each a
// form field with a readable label, the default as its placeholder and a link to where it is declared; then which steps to run as pills (all on, one off is skipped); a name, Run and Save;
// then the saved runs as compact rows (name, the settings that differ as chips, Run, and a menu) with no command block unless asked. The composed command is still what the controller runs.
// Reused: ui.jsx Button, Input, Menu, useMenuButton; RunParts.jsx for the form fields, the chip, the progress bar and the output pane.
const chipsOfPreset = preset => Object.values(preset.knobs || {}).flatMap(flags => Object.entries(flags || {}).map(([flag, value]) => `${String(flag).replace(/^-+/, '')} ${value}`));

function PresetRow({ preset, cells, added, off, readOnly, onRun, onRename, onDelete, onOpen }) {
  const menu = useMenuButton(), [renaming, setRenaming] = useState(null), [commands, setCommands] = useState(false), chips = chipsOfPreset(preset);
  const commit = () => { const name = String(renaming || '').trim().slice(0, NAME_MAX); if (name && name !== preset.name) onRename(preset, name); setRenaming(null); };
  return (
    <div data-run-preset={preset.name} className="flex flex-col gap-1.5 rounded-lg border border-line px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {renaming === null
          ? <p className="min-w-0 truncate text-sm font-medium text-ink">{preset.name}</p>
          : <Input autoFocus aria-label={COPY.custom.rename} value={renaming} maxLength={NAME_MAX} onChange={event => setRenaming(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') setRenaming(null); }} className="max-w-56" />}
        {chips.map(chip => <span key={chip} className="rounded-md bg-hover px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{chip}</span>)}
        <span className="flex-1" />
        <Button type="button" variant="secondary" size="sm" data-run-preset-run disabled={off} onClick={() => onRun(preset)}><Play size={12} aria-hidden="true" />{COPY.custom.run}</Button>
        <button type="button" data-run-preset-menu aria-label={`${preset.name} menu`} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink" {...menu.buttonProps}><MoreHorizontal size={14} /></button>
        <Menu portal anchor={menu.button.current} open={menu.open} onClose={menu.onClose} style={menu.style} className="w-48">
          <div data-menu-button-open role="menu">
            <MenuItem role="menuitem" disabled={readOnly} onClick={() => { menu.close(false); setRenaming(preset.name); }}>{COPY.custom.rename}</MenuItem>
            <MenuItem role="menuitem" onClick={() => { menu.close(false); setCommands(v => !v); }}>{COPY.custom.showCommands}</MenuItem>
            <MenuItem role="menuitem" data-run-preset-delete disabled={readOnly} onClick={() => { menu.close(false); onDelete(preset); }}>{COPY.custom.delete}</MenuItem>
          </div>
        </Menu>
      </div>
      {commands && presetCommands(preset, cells, added).map(c => (
        <div key={c.step} className="flex flex-col gap-1">
          <pre data-run-preset-cmd className={CMD_PRE}>{c.cmd}</pre>
          {c.flags.some(f => f.source) && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">{c.flags.filter(f => f.source).map(f => <span key={f.flag} className="flex items-center gap-1"><span>{knobLabel(f.flag)}</span><SourceLink source={f.source} onOpen={onOpen} /></span>)}</div>}
        </div>
      ))}
    </div>
  );
}

export default function RunCustom({ cells, added, draft, setDraft, ready, active, readOnly, run, full, presets, onRun, onStop, onSave, onRunPreset, onRename, onDelete, onOpen, onLog, load }) {
  const steps = stepCells(cells), busy = !!active, off = readOnly || !ready || busy;
  const picked = steps.filter(cell => draft.steps.includes(stepIdOf(cell)));
  // The last step's settings first, then the others in route order.
  const ordered = [...steps.slice(-1), ...steps.slice(0, -1)];
  const toggle = id => setDraft(d => ({ ...d, steps: d.steps.includes(id) ? d.steps.filter(s => s !== id) : [...d.steps, id] }));
  const type = (id, flag, value) => setDraft(d => ({ ...d, values: { ...d.values, [id]: { ...d.values[id], [flag]: value } } }));
  const reset = id => setDraft(d => ({ ...d, values: { ...d.values, [id]: {} } }));
  const progress = progressOf(run), last = picked.at(-1), state = run ? stepState(run, {}) : null;
  if (!steps.length) return <p className="px-4 py-3 text-sm text-ink-2">{COPY.custom.startFirst}</p>;
  return (
    <div data-run-custom className="flex flex-col gap-4 px-4 py-3">
      <section aria-label={COPY.custom.settings} className="flex flex-col gap-3">
        {ordered.map(cell => {
          const id = stepIdOf(cell), own = knobFields(cell, { overrides: draft.values[id], added, cells });
          // A card saved before every step listed all its settings keeps them on its old settings cell (the last step's): until a session brings the new cells, show those.
          const old = cells.find(c => c.kind === 'knobs'), fields = !own.length && old && cell === steps.at(-1) ? knobFields(old, { overrides: draft.values[id], added, cells }) : own;
          return fields.length ? <KnobFields key={id} label={cell.title} fields={fields} disabled={readOnly || busy} onChange={(flag, value) => type(id, flag, value)} onReset={() => reset(id)} onOpen={onOpen} /> : null;
        })}
      </section>
      <section aria-label={COPY.custom.steps} role="group" className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-ink-2">{COPY.custom.steps}</p>
        <div className="flex flex-wrap gap-1.5">
          {steps.map(cell => {
            const id = stepIdOf(cell), on = draft.steps.includes(id);
            // The app's own toggle button (as the History filters): filled when the step runs, plain when it is skipped. No pill shape.
            return <Button key={id} type="button" size="sm" variant={on ? 'secondary' : 'ghost'} data-run-step={id} aria-pressed={on} disabled={readOnly || busy} onClick={() => toggle(id)}>{cell.title}</Button>;
          })}
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <Input data-run-custom-name aria-label={COPY.custom.name} placeholder={COPY.custom.namePlaceholder} maxLength={NAME_MAX} value={draft.name} disabled={readOnly} onChange={event => setDraft(d => ({ ...d, name: event.target.value }))} className="max-w-64" />
        <Button type="button" variant="primary" size="sm" data-run-custom-run disabled={off || !picked.length} onClick={onRun}><Play size={12} aria-hidden="true" />{COPY.custom.run}</Button>
        {busy && <Button type="button" variant="danger" size="sm" data-run-custom-stop disabled={readOnly} onClick={onStop}><Square size={12} aria-hidden="true" />{COPY.custom.stop}</Button>}
        <Button type="button" variant="secondary" size="sm" data-run-custom-save disabled={readOnly || !picked.length} onClick={onSave}><Save size={12} aria-hidden="true" />{COPY.custom.save}</Button>
      </div>
      {run && (
        <div data-run-custom-output className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2"><Chip tone={state.tone}>{state.label}</Chip>{state.line && <span className={`text-xs ${state.tone === 'danger' ? 'text-fail' : 'text-ink-2'}`}>{state.line}</span>}</div>
          {progress && <Progress progress={progress} />}
          <OutputPane running={!run.complete} text={(full !== undefined ? full : paneText(run)) || (run.complete ? COPY.step.noOutput : COPY.step.waiting)} />
          {run.runId && <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={onLog}>{full !== undefined ? 'Show the latest lines' : 'Show the full log'}</Button>}
          <RunOutputs status={run} cell={last} load={path => load(run.runId, path)} />
        </div>
      )}
      <section aria-label={COPY.custom.saved} data-run-presets className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-xs font-medium text-ink-2">{COPY.custom.saved}</p>
        {presets.length === 0 && <p className="text-xs text-ink-2">{COPY.custom.savedEmpty}</p>}
        {presets.map(preset => <PresetRow key={`${preset.name}-${preset.createdAt}`} preset={preset} cells={cells} added={added} off={off} readOnly={readOnly} onRun={onRunPreset} onRename={onRename} onDelete={onDelete} onOpen={onOpen} />)}
      </section>
    </div>
  );
}
