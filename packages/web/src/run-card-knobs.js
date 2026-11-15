// packages/web/src/run-card-knobs.js
// The Run card's parameters (Run card v1.1 Part 1; rehearsal-runtime/schemas/cells.json, run-request.json, run-card-state.json): the typed fields of a step cell,
// the Tutor-added knobs, the request bodies, and the command line shown (for DISPLAY only: the controller composes the real command). Pure: no React, no network.
// The type rules mirror cells.json TYPE RULES; the replace rule mirrors runner.set_flag / cells.build_command.
import { repositoryUrl } from './card-sources.js';

export const VISIBLE_KNOBS = 3; // the first three of a step's knobs are shown, the rest sit under More parameters
export const ADDED_MAX = 24; // run-card-state.json addedKnobs maxItems
export const ADDED_PER_RUN = 8; // run-request.json addedKnobs maxItems
export const NAME_MAX = 60; // a custom run's name
export const PRESETS_MAX = 50; // run-card-state.json customRuns maxItems

const RULES = {
  float: [/^-?[0-9]+\.[0-9]+$/, 'A float needs a decimal point: write 0.5 or 1.0.'],
  int: [/^-?[0-9]+$/, 'An integer: digits only.'],
  bool: [/^(true|false|True|False)$/, 'true or false.'],
  string: [/^[A-Za-z0-9 :,.'_-]{0,80}$/, 'Letters, digits, spaces and : , . \' _ - only, up to 80 characters.'],
};
const FLAG = /^--[A-Za-z0-9_-]+$/, SOURCE = /^[^\s:]+:[0-9]+(-[0-9]+)?$/, TYPES = ['string', 'float', 'int', 'bool'];

// '' when the value passes its type rule (cells.json), else the sentence to show; nothing is sent while it is not ''.
export function checkValue(type, value) {
  const text = String(value ?? '');
  if (type === 'string' && text.includes('=')) return "A string must not contain '='.";
  const rule = RULES[type];
  return !rule || rule[0].test(text) ? '' : rule[1];
}

// The step a cell runs: the cell id (cells.json: install and knobs ids are suffixed _step when a step is called that).
export const stepIdOf = cell => (/^(install|knobs)_step$/.test(cell?.cellId || '') ? cell.cellId.slice(0, -5) : cell?.cellId);
// The cells that are route steps, in route order, and the id of the last one (the Make it yours cell's step).
export const stepCells = cells => (cells || []).filter(cell => cell.kind === 'step');
export const lastStepId = cells => stepIdOf(stepCells(cells).at(-1));
// The step a cell's added knobs belong to: a step cell its own, the knobs cell the final step's.
export const knobStepOf = (cell, cells) => (cell?.kind === 'knobs' ? lastStepId(cells) : cell?.kind === 'step' ? stepIdOf(cell) : null);

const isOn = text => /^true$/i.test(String(text ?? '').trim());
const same = (type, a, b, field) => (type === 'bool' ? (a === '' ? isOn(field.default) : isOn(a)) === (b === '' ? isOn(field.default) : isOn(b)) : String(a).trim() === String(b).trim());
export const boolOn = field => (field.value === '' ? isOn(field.default) : isOn(field.value));
// A toggled bool is written the way the repository writes it (Python: True / False).
export const boolText = (field, on) => (/^[A-Z]/.test(field.baseline || field.default || 'True') ? (on ? 'True' : 'False') : on ? 'true' : 'false');

// One cell's fields: the discovered flags in discovery's order, then the Tutor-added knobs of its step. overrides: { flag: typed value } (only what the learner typed);
// a field with no override shows the cell's own value (the rehearsal's). modified: the value differs from it. error: the type rule's sentence while the typed value breaks it.
export function knobFields(cell, { overrides = {}, added = [], cells = [] } = {}) {
  const step = knobStepOf(cell, cells), known = new Set((cell?.flags || []).map(f => f.flag));
  const base = [...(cell?.flags || []).map(f => ({ flag: f.flag, type: f.type, baseline: f.value ?? '', default: f.default ?? '', source: f.source || '', addedBy: f.addedBy || 'discovery', editable: !!f.editable })),
    ...(added || []).filter(k => step && k.step === step && !known.has(k.flag)).map(k => ({ flag: k.flag, type: k.type, baseline: '', default: k.default ?? '', source: k.source || '', addedBy: 'tutor', editable: true }))];
  return base.map((f, i) => {
    const typed = Object.prototype.hasOwnProperty.call(overrides || {}, f.flag), value = typed ? String(overrides[f.flag]) : f.baseline;
    const modified = f.editable && typed && value !== '' && !same(f.type, value, f.baseline, f);
    return { ...f, value, modified, error: f.editable && typed && value !== '' ? checkValue(f.type, value) : '', visible: i < VISIBLE_KNOBS };
  });
}

// The learner's cleared fields go back to the cell's own value (an empty value is never sent).
export const cleanOverrides = overrides => Object.fromEntries(Object.entries(overrides || {}).filter(([, v]) => String(v) !== ''));
export const isModified = fields => fields.some(f => f.modified);

// What a cell run sends: the flags that differ from the cell's own value, valid ones only. errors: the fields that break their rule (the card shows the rule and does not send).
export function changedFlags(fields) {
  const flags = {}, errors = [];
  for (const f of fields) {
    if (!f.modified) continue;
    if (f.error) errors.push({ flag: f.flag, message: f.error }); else flags[f.flag] = String(f.value).trim();
  }
  return { flags, errors };
}

// A Tutor-added knob as the wire carries it (run-request.json addedKnobs: no addedBy).
const wireKnob = k => ({ flag: k.flag, type: k.type, default: String(k.default ?? ''), source: k.source, ...(k.step ? { step: k.step } : {}) });
export const addedFor = (added, steps) => (added || []).filter(k => (steps || []).includes(k.step)).slice(0, ADDED_PER_RUN).map(wireKnob);

// POST /api/learn/run action 'run', cell form: { sessionId, cellId, flags, addedKnobs? }.
export function cellRunBody(cell, fields, { added = [], cells = [], sessionId }) {
  const { flags, errors } = changedFlags(fields), addedKnobs = addedFor(added, [knobStepOf(cell, cells)]);
  return { errors, body: { action: 'run', sessionId, cellId: cell.cellId, flags, ...(addedKnobs.length ? { addedKnobs } : {}) } };
}
// Custom form: { sessionId, custom: { steps, knobs: { step: { flag: value } }, name }, addedKnobs? }. steps in route order; draft.values: { step: overrides }.
export function customRunBody(draft, { cells = [], added = [], sessionId }) {
  const order = stepCells(cells).map(stepIdOf), steps = order.filter(id => (draft.steps || []).includes(id)), knobs = {}, errors = [];
  for (const id of steps) {
    const cell = stepCells(cells).find(c => stepIdOf(c) === id), fields = knobFields({ ...cell, kind: 'step' }, { overrides: draft.values?.[id], added, cells });
    const out = changedFlags(fields);
    knobs[id] = out.flags; errors.push(...out.errors.map(e => ({ ...e, step: id })));
  }
  const name = String(draft.name || '').trim();
  if (name.length > NAME_MAX) errors.push({ flag: '', message: `The name is at most ${NAME_MAX} characters.` });
  if (!steps.length) errors.push({ flag: '', message: 'Pick at least one step.' });
  const addedKnobs = addedFor(added, steps);
  return { errors, steps, body: { action: 'run', sessionId, custom: { steps, knobs, ...(name ? { name } : {}) }, ...(addedKnobs.length ? { addedKnobs } : {}) } };
}

// ---- the command line shown (display only) ------------------------------------------------------------------------------------

// Python's shlex.quote.
export const shQuote = text => (text === '' ? "''" : /^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, `'"'"'`)}'`);
const esc = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// runner.set_flag: replace the flag's occurrence (later duplicates dropped), append when absent.
export function setFlag(cmd, flag, value) {
  const token = shQuote(`${flag}=${value}`);
  let seen = 0;
  const out = cmd.replace(new RegExp(`(?<!\\S)${esc(flag)}(?:=\\S*)?(?=\\s|$)`, 'g'), () => (++seen === 1 ? token : ''));
  if (!seen) return `${cmd} ${token}`;
  return seen > 1 ? out.replace(/ {2,}/g, ' ').trim() : out;
}
// cells.build_command: a quoted earlier token becomes plain so it is replaced; then each flag is set.
export function composeDisplay(cmd, flags) {
  let out = String(cmd || '');
  for (const [flag, value] of Object.entries(flags || {})) {
    out = out.replace(new RegExp(`(?<!\\S)(['"])${esc(flag)}=.*?\\1(?=\\s|$)`, 'g'), `${flag}=X`);
    out = setFlag(out, flag, value);
  }
  return out;
}

// ---- Tutor-added knobs -------------------------------------------------------------------------------------------------------

export const ADD_KNOB_EVENT = 'small:run-card-add-knob'; // detail { app, repo, commit, routeId, knob }; cancelable: a card that took it calls preventDefault

// addKnob(run, knob): the card's saved state (block.run) with the knob added to addedKnobs. -> { run, status }, status 'added' | 'exists' (same flag and step, or the
// step's discovered flags already have it) | 'invalid' | 'full'. run is the same object unless added.
export function addKnob(run, knob) {
  const k = { flag: String(knob?.flag || ''), type: knob?.type, default: String(knob?.default ?? ''), source: String(knob?.source || ''), step: String(knob?.step || '') };
  if (!FLAG.test(k.flag) || !TYPES.includes(k.type) || !SOURCE.test(k.source) || !k.step || k.default.length > 80) return { run, status: 'invalid' };
  const list = run?.addedKnobs || [];
  if (list.some(x => x.flag === k.flag && x.step === k.step)) return { run, status: 'exists' };
  if ((run?.cells || []).some(cell => cell.kind === 'step' && stepIdOf(cell) === k.step && (cell.flags || []).some(f => f.flag === k.flag))) return { run, status: 'exists' };
  if (list.length >= ADDED_MAX) return { run, status: 'full' };
  return { run: { ...run, addedKnobs: [...list, { ...k, addedBy: 'tutor' }] }, status: 'added' };
}

// The step a source file belongs to: the first step cell whose command runs that file (sample.py -> the sample step). null when no cell does (or the cells are not known yet).
export function stepForSource(cells, source) {
  const file = String(source || '').split(':')[0].split('/').pop();
  if (!file) return null;
  const hit = stepCells(cells).find(cell => cell.cmd.split(/\s+/).some(token => token.split('/').pop() === file));
  return hit ? stepIdOf(hit) : null;
}

// One Run card takes the event or not. generated: the card's block.generated. -> { run, status, step } with status as addKnob's, or 'other' (not this card's repository, commit or route) / 'nostep'.
export function applyKnobEvent(run, generated, detail) {
  const knob = detail?.knob || {};
  if (generated?.kind !== 'rehearsal') return { run, status: 'other' };
  if ((detail.repo && generated.repo !== detail.repo) || (detail.commit && generated.commit !== detail.commit && !String(generated.commit || '').startsWith(detail.commit)) || (detail.routeId && (generated.routeId || null) !== detail.routeId)) return { run, status: 'other' };
  const step = knob.step || stepForSource(run?.cells, knob.source);
  if (!step) return { run, status: 'nostep' };
  return { ...addKnob(run, { ...knob, step }), step };
}

// ---- the file:line link ---------------------------------------------------------------------------------------------------------

// A knob's source (file:line) as the Files panel opens it, through the same small:open-code event as learn-runbook.js openRunbookLink: a repository canvas answers it (Files at the
// lines), else GitHub at the commit. -> false when the source is not a file:line.
export function openSourceLine(source, { app, repo, commit }, { dispatch = event => window.dispatchEvent(event), open = url => window.open(url, '_blank', 'noopener') } = {}) {
  const m = /^([^\s:]+):(\d+)(?:-(\d+))?$/.exec(String(source || ''));
  if (!m) return false;
  const start = Number(m[2]), end = Number(m[3] || m[2]), event = new CustomEvent('small:open-code', { detail: { app, repo, commit, sameRepo: true, path: m[1], start, end }, cancelable: true });
  if (dispatch(event) !== false && !event.defaultPrevented && repo && commit) open(repositoryUrl({ repo, commit, path: m[1], line: start, lineEnd: end }));
  return true;
}
