import { z } from 'zod';
import { canonicalJson } from './explain-contract.js';
import { CONTRACT_LIMITS, PROGRAM_KIND, verifyHashes } from './explain-program/contract.js';
import { PLAN_LIMITS, ScalarExprError, contentHash, evalScalar, planHash, scalarExprProblem, scalarInterval } from './interact-plan.js';

// CardComposition v1 (docs/features/interact.md section 5 "Runtime composition envelope", INT-04, INT-06 composition rules): the one
// server-built record that binds the approved plan to the validated artifacts, and the pure helpers the player, the capture planner and
// the checks share. Pure and server-safe: no DOM, no network, no model. Models never create a reference or a hash; every hash below is
// computed here over validated data.
//
// Artifact envelope (what the Scene Builder returns, after trusted sealing):
//   { main: {kind:'spec', spec} | {kind:'program', program}, supporting: [{id, artifact: {kind:'spec', spec} | {kind:'program', program}}] }
// program is the SEALED ProgramArtifact (host-computed hashes); spec is a VisualSpec the compiler accepted.
export const COMPOSITION_VERSION = 1;
// The card, top to bottom. Rows that the plan does not declare are omitted with their space; no row ever follows the controls.
export const CARD_ORDER = Object.freeze(['title', 'description', 'supporting', 'main', 'transport', 'controls']);
export const SNAPSHOT_TIME = 0; // a support panel is a read-only snapshot at time zero of the main input state; it has no clock

export class CompositionError extends Error {
  constructor(problems) { super(`the composition is refused: ${problems[0]?.path ?? ''} ${problems[0]?.message ?? ''}`.trim()); this.name = 'CompositionError'; this.problems = problems; }
}

const near = (a, b, eps = 1e-9) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const norm = value => String(value).toLowerCase().replace(/\s+/g, ' ').trim();
const dotted = path => path.map(String).join('.');

// ---- the mapping from semantic control IDs to native declarations (INT-01-C04) -----------------------------------------------
// One declaration per control: where it lives in the artifact and exactly what must be declared there. Nothing here is a model choice:
// the builder is told this table, and validateCompositionBindings() checks the built artifact against it.
const TRANSPORT = { playback: 'playback', scrubber: 'scrubber' };
export function nativeDeclaration(control, renderer) {
  const refuse = () => ({ ok: false, code: 'unsupported_control', message: `the ${renderer} renderer cannot implement a ${control.type} control` });
  const done = (where, declaration) => ({ ok: true, native: { in: where, declaration } });
  const id = control.binding?.id;
  if (control.type === 'reset') return done('card.reset', null);
  if (TRANSPORT[control.type]) return done('timeline', control.type === 'playback' ? { part: 'playback', labels: control.labels } : { part: 'scrubber', unit: control.unit, step: control.step });
  if (renderer === 'program') {
    if (control.type === 'number') return done('manifest.inputs', { type: 'number', id, label: control.label, ...(control.unit ? { unit: control.unit } : {}), default: control.default, min: control.min, max: control.max, step: control.step });
    if (control.type === 'select') return done('manifest.inputs', { type: 'select', id, label: control.label, default: control.default, options: control.options.map(({ value, label }) => ({ value, label })) });
    if (control.type === 'action') return done('manifest.actions', { id, label: control.label });
    if (control.type === 'target') return done('manifest.targets', { id, label: control.label, ...(control.interaction === 'drag' ? { drag: true } : {}) });
    return refuse();
  }
  if (renderer === 'spec') {
    // The declarative path keeps controls in presentation.experiments: one experiment per input, its id the plan's binding id.
    // ponytail: the experiment's component control name and label come from the component registry, which this table cannot see;
    // only the id and the admitted domain are checked.
    if (control.type === 'select') return done('presentation.experiments', { id, domain: { values: control.options.map(o => o.value) } });
    if (control.type === 'boolean') return done('presentation.experiments', { id, domain: { values: [0, 1] } });
    if (control.type === 'index' || control.type === 'multi_select') return done('presentation.experiments', { id, domain: { values: control.items.map((_, i) => i) } });
    return refuse();
  }
  return refuse();
}

const inputDefault = control => (['number', 'select', 'boolean', 'index', 'multi_select'].includes(control.type) ? control.default : undefined);
const inputControls = plan => plan.controls.filter(c => c.binding.kind === 'input');
const numberDomains = plan => Object.fromEntries(plan.controls.filter(c => c.type === 'number').map(c => [c.binding.id, [c.min, c.max]]));
const numberDefaults = plan => Object.fromEntries(plan.controls.filter(c => c.type === 'number').map(c => [c.binding.id, c.default]));

// The declarations the builder must produce, with the problems for any control the plan's renderer cannot implement.
export function controlDeclarations(plan) {
  const problems = [], declarations = [];
  plan.controls.forEach((control, index) => {
    const made = nativeDeclaration(control, plan.scene.runtime.renderer);
    if (made.ok) declarations.push({ controlId: control.id, nativeControlId: control.nativeControlId, type: control.type, binding: control.binding, ...made.native });
    else problems.push({ path: `controls.${index}`, code: made.code, message: made.message });
  });
  return { declarations, problems };
}

// ---- timeline -----------------------------------------------------------------------------------------------------------------
// Input values clamped into their declared domains, completed with the defaults: the same rule resolveInputs applies to a program.
function stateOf(composition, inputs = {}) {
  const out = { ...composition.main.inputDefaults };
  for (const control of composition.main.controls) {
    const name = control.binding?.id;
    if (control.binding?.kind !== 'input' || !(name in out)) continue;
    const given = inputs?.[name];
    if (control.type === 'number') out[name] = Number.isFinite(given) ? Math.min(control.max, Math.max(control.min, given)) : out[name];
    else if (control.type === 'select') out[name] = control.options.some(o => o.value === given) ? given : out[name];
    else if (given !== undefined) out[name] = given;
  }
  return out;
}
const numericState = (composition, inputs) => {
  const state = stateOf(composition, inputs), out = {}, domains = {};
  for (const control of composition.main.controls) if (control.type === 'number') { out[control.binding.id] = state[control.binding.id]; domains[control.binding.id] = [control.min, control.max]; }
  return { values: out, domains };
};

// resolveTimeline(composition, inputs) -> null (untimed) | { start, end, displayOffset, displayStart, displayEnd, markers: [{id,label,time}], step,
//   label, playbackRate, onInputChange }. Elapsed time runs from start (0) to end; the learner reads elapsed + displayOffset. end, offset
// and marker times are re-evaluated for the given input state (clamped into the declared domains), so a changed launch speed moves the
// endpoint, the scrubber maximum and the markers together. This is the ONE endpoint resolver: playback, scrubber, Replay, saved-time
// clamping, the accessible description and capture planning all call it.
export function resolveTimeline(composition, inputs = {}) {
  const timeline = composition?.main?.timeline;
  if (!timeline) return null;
  const { values, domains } = numericState(composition, inputs);
  const at = expr => evalScalar(expr, values, domains);
  const end = at(timeline.end), displayOffset = at(timeline.displayOffset);
  const markers = timeline.markers.map(m => ({ id: m.id, label: m.label, time: at(m.time) }));
  return { start: 0, end, displayOffset, displayStart: displayOffset, displayEnd: end + displayOffset, markers, step: timeline.step, label: timeline.label, playbackRate: timeline.playbackRate, onInputChange: composition.main.onInputChange };
}

// ---- support panels: read-only snapshots ----------------------------------------------------------------------------------------
// The input state a support panel is evaluated at: its own input ids, filled from the main state through parameterBindings. Never an
// independent control and never a clock: time is always SNAPSHOT_TIME.
export function resolveSupportInputs(composition, supportId, mainInputs = {}) {
  const panel = composition.supporting.find(s => s.id === supportId);
  if (!panel) throw new CompositionError([{ path: 'supporting', code: 'unknown_support', message: `no support panel "${supportId}"` }]);
  const state = stateOf(composition, mainInputs);
  return Object.fromEntries(panel.parameterBindings.filter(b => b.fromInputId in state).map(b => [b.toInputId, state[b.fromInputId]]));
}

// A snapshot resolver for the player and capture: evaluates support panels ONE AT A TIME (never more concurrent hosts than the page's
// two-Worker limit allows), caches by artifact hash and bound input state, and fences stale answers by generation. evaluate({ref, inputs,
// time}) is the host call; it is injected so this stays pure. A missing or stale snapshot is reported, never drawn as a finished card.
export function createSnapshotResolver({ evaluate, maxEntries = 16 }) {
  let generation = 0;
  const cache = new Map();
  return {
    // Input or artifact change: any answer still in flight belongs to an older state and is dropped. The cache is content-addressed, so
    // an entry for another state stays correct and is simply not asked for.
    invalidate() { generation += 1; },
    dispose() { generation += 1; cache.clear(); },
    async resolve(composition, mainInputs = {}) {
      const mine = ++generation, snapshots = [];
      for (const panel of composition.supporting) {
        const inputs = resolveSupportInputs(composition, panel.id, mainInputs);
        const key = `${panel.artifact.hash}|${canonicalJson(inputs)}`;
        let frame = cache.get(key), cached = frame !== undefined;
        if (!cached) {
          frame = await evaluate({ ref: panel.artifact, panelId: panel.id, inputs, time: SNAPSHOT_TIME });
          if (mine !== generation) return { stale: true, complete: false, snapshots };
          cache.set(key, frame);
          if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
        }
        snapshots.push({ id: panel.id, frame, cached });
      }
      return { stale: false, complete: snapshots.length === composition.supporting.length, snapshots, generation: mine };
    },
  };
}

// ---- validation of a built envelope against the approved plan ----------------------------------------------------------------
const tupleOf = a => ({ schemaVersion: a.schemaVersion, sdkVersion: a.sdkVersion, rendererVersion: a.rendererVersion, runtimeVersion: a.runtimeVersion,
  runtimePolicyVersion: a.runtimePolicyVersion, permissionProfileVersion: a.permissionProfileVersion, fingerprints: a.fingerprints });
const artifactKind = a => (a?.kind === 'spec' && a.spec && typeof a.spec === 'object' ? 'spec' : a?.kind === 'program' && a.program && typeof a.program === 'object' ? 'program' : null);
const panelsOf = (plan, artifacts) => [{ id: 'main', runtime: plan.scene.runtime, artifact: artifacts?.main }, ...plan.supportingVisuals.map(s => ({ id: s.id, runtime: s.runtime, artifact: artifacts?.supporting?.find(x => x?.id === s.id)?.artifact, support: s }))];

// One panel: the sealed kind and tuple must equal the approved runtime. A different renderer, SDK, tuple, helper or capability is refused,
// never switched silently (INT-12-C02).
function runtimeProblems(panel, bad) {
  const { runtime, artifact, id } = panel, at = [id === 'main' ? 'scene' : `supportingVisuals.${id}`, 'runtime'];
  const kind = artifactKind(artifact);
  if (!kind) return bad(at, 'artifact_missing', `panel "${id}" has no spec or program artifact`);
  if (kind !== runtime.renderer) return bad(at, 'renderer_mismatch', `panel "${id}" was approved as ${runtime.renderer} and was built as ${kind}`);
  if (kind === 'spec') {
    if (artifact.spec.version !== runtime.schemaVersion) bad(at, 'schema_mismatch', `panel "${id}" spec version ${artifact.spec.version} is not the approved ${runtime.schemaVersion}`);
    return undefined;
  }
  const program = artifact.program;
  if (program.kind !== PROGRAM_KIND || typeof program.bundleHash !== 'string' || !program.manifest) return bad(at, 'artifact_unsealed', `panel "${id}" program is not a sealed program artifact`);
  if (program.schemaVersion !== runtime.schemaVersion || program.sdkVersion !== runtime.sdkVersion) bad(at, 'tuple_mismatch', `panel "${id}" was sealed ${program.schemaVersion}/${program.sdkVersion}, approved ${runtime.schemaVersion}/${runtime.sdkVersion}`);
  else if (!same(tupleOf(program), runtime.programTuple)) bad(at, 'tuple_mismatch', `panel "${id}" was sealed with a different engine, renderer or policy tuple than the approved one`);
  const declared = new Set(program.manifest.capabilities || []);
  for (const need of runtime.requiredCapabilities) if (!declared.has(need)) bad(at, 'capability_missing', `panel "${id}" must declare the approved capability "${need}"`);
  for (const have of declared) if (!runtime.requiredCapabilities.includes(have)) bad(at, 'capability_not_approved', `panel "${id}" declares "${have}", which was not approved; a changed capability is a new plan revision`);
  for (const helper of runtime.requiredHelpers) if (!new RegExp(`\\bsdk\\.${helper}\\b`).test(program.source)) bad(at, 'helper_missing', `panel "${id}" was approved with sdk.${helper} and does not use it`);
  return undefined;
}

// Main controls against the plan: every approved control maps to the artifact's input/action/target/native transport, none is missing,
// none is extra, and labels, defaults, units and ranges are the plan's (INT-04-C05, C09, C10).
function mainBindingProblems(plan, artifact, bad) {
  const kind = artifactKind(artifact);
  if (kind !== plan.scene.runtime.renderer) return;
  const { declarations, problems } = controlDeclarations(plan);
  for (const p of problems) bad(p.path.split('.'), p.code, p.message);
  const timeline = plan.mode.timeline, domains = numberDomains(plan);
  const wantInputs = declarations.filter(d => d.in === 'manifest.inputs'), wantActions = declarations.filter(d => d.in === 'manifest.actions'), wantTargets = declarations.filter(d => d.in === 'manifest.targets');
  const c = (id, code, message) => bad(['controls', id], code, message);

  if (kind === 'program') {
    const m = artifact.program.manifest;
    const check = (wanted, have, noun, fields) => {
      for (const d of wanted) {
        const got = have.find(x => x.id === d.declaration.id);
        if (!got) { c(d.controlId, 'control_missing', `the approved ${noun} "${d.declaration.id}" (${d.controlId}) is not declared by the program`); continue; }
        for (const field of fields) {
          const want = d.declaration[field], found = got[field];
          const blank = v => (v === '' || v === false ? null : v ?? null); // an omitted unit and unit '' (or drag false) are the same declaration
          const equal = typeof want === 'number' ? near(want, found) : same(blank(want), blank(found));
          if (!equal) c(d.controlId, 'control_mismatch', `${noun} "${d.declaration.id}" ${field} is ${JSON.stringify(found ?? null)}, the approved plan says ${JSON.stringify(want ?? null)}`);
        }
      }
      for (const got of have) if (!wanted.some(d => d.declaration.id === got.id)) c(got.id, 'control_extra', `the program declares ${noun} "${got.id}", which is not an approved control`);
    };
    check(wantInputs, m.inputs || [], 'input', ['type', 'label', 'unit', 'default', 'min', 'max', 'step', 'options']);
    check(wantActions, m.actions || [], 'action', ['label']);
    check(wantTargets, m.targets || [], 'target', ['label', 'drag']);
    if ((wantActions.length || wantTargets.length) && artifact.program.schemaVersion !== 2) bad(['scene', 'runtime'], 'tuple_mismatch', 'actions and targets need the stateful program (schema 2)');
    // Mode mapping: Static is untimed; Over time and a timed Experiment declare duration and timeline.
    if (!timeline && (m.duration || m.timeline)) bad(['mode', 'timeline'], 'mode_mismatch', 'the plan is untimed, the program declares a duration or timeline');
    if (timeline) {
      if (!m.duration) bad(['mode', 'timeline'], 'timeline_missing', 'the plan is timed, the program declares no duration');
      else {
        const hi = scalarSafe(() => scalarInterval(timeline.end, domains)[1]);
        const corners = cornerEnds(timeline.end, domains);
        if (hi !== null && m.duration > hi + 1e-6) bad(['mode', 'timeline', 'end'], 'duration_mismatch', `manifest.duration ${m.duration} is longer than the longest approved endpoint ${hi}`);
        if (corners.length && m.duration < Math.max(...corners) - 1e-9) bad(['mode', 'timeline', 'end'], 'duration_mismatch', `manifest.duration ${m.duration} is shorter than the approved endpoint ${Math.max(...corners)} (it must be the maximum across the input range)`);
      }
      const t = m.timeline, defaults = numberDefaults(plan);
      if (!t) bad(['mode', 'timeline'], 'timeline_missing', 'the plan is timed, the program declares no timeline (label, displayOffset, playbackRate, markers)');
      else {
        if (t.label !== timeline.label) bad(['mode', 'timeline', 'label'], 'timeline_mismatch', `timeline label "${t.label}" is not the approved "${timeline.label}"`);
        if (!near(t.playbackRate ?? 1, timeline.playbackRate)) bad(['mode', 'timeline', 'playbackRate'], 'timeline_mismatch', `playbackRate ${t.playbackRate} is not the approved ${timeline.playbackRate}`);
        const offset = scalarSafe(() => evalScalar(timeline.displayOffset, defaults, domains));
        if (offset !== null && !near(t.displayOffset ?? 0, offset)) bad(['mode', 'timeline', 'displayOffset'], 'timeline_mismatch', `displayOffset ${t.displayOffset ?? 0} is not the approved ${offset}`);
        if (timeline.markers.length > 8) bad(['mode', 'timeline', 'markers'], 'marker_limit', 'a program timeline declares at most 8 markers');
        for (const marker of timeline.markers) {
          const want = scalarSafe(() => evalScalar(marker.time, defaults, domains)), got = (t.markers || []).find(x => x.id === marker.id);
          if (!got) bad(['mode', 'timeline', 'markers', marker.id], 'timeline_mismatch', `approved marker "${marker.id}" is not declared`);
          else if (got.label !== marker.label || (want !== null && !near(got.time, want))) bad(['mode', 'timeline', 'markers', marker.id], 'timeline_mismatch', `marker "${marker.id}" is ${JSON.stringify([got.label, got.time])}, approved ${JSON.stringify([marker.label, want])}`);
        }
        for (const got of t.markers || []) if (!timeline.markers.some(x => x.id === got.id)) bad(['mode', 'timeline', 'markers', got.id], 'timeline_mismatch', `marker "${got.id}" is not approved`);
      }
    }
    // Every approved readout is declared in manifest.readouts with a label and a unit ('' for a pure number): the card draws them in its own readouts row (interact-card-layout.js),
    // so a readout that is only reported, or only drawn as scene text, is a problem the repairer answers. The adjustable inputs are declared the same way.
    for (const r of plan.scene.readoutIds) {
      const got = (m.readouts || []).find(x => x.id === r);
      if (!got) bad(['scene', 'readoutIds', r], 'readout_missing', `the approved readout "${r}" is not declared in manifest.readouts`);
      else if (!String(got.label ?? '').trim() || got.unit == null) bad(['scene', 'readoutIds', r], 'readout_unlabelled', `the readout "${r}" needs a label and a unit (use '' for a pure number)`);
    }
    for (const id of plan.mode.adjustableIds) if (!(m.inputs || []).some(x => x.id === id)) bad(['mode', 'adjustableIds', id], 'input_missing', `the approved adjustable input "${id}" is not declared in manifest.inputs`);
    return;
  }
  // Declarative path.
  const spec = artifact.spec, presentation = spec.presentation || {}, experiments = presentation.experiments || [];
  const wantExperiments = declarations.filter(d => d.in === 'presentation.experiments');
  for (const d of wantExperiments) {
    const got = experiments.find(e => e.id === d.declaration.id);
    if (!got) c(d.controlId, 'control_missing', `the approved control "${d.controlId}" has no experiment "${d.declaration.id}"`);
    else if (!same(got.domain?.values ?? null, d.declaration.domain.values)) c(d.controlId, 'control_mismatch', `experiment "${got.id}" admits ${JSON.stringify(got.domain)}, the approved plan says ${JSON.stringify(d.declaration.domain)}`);
  }
  for (const e of experiments) if (!wantExperiments.some(d => d.declaration.id === e.id)) c(e.id, 'control_extra', `the spec declares experiment "${e.id}", which is not an approved control`);
  if (!timeline && presentation.mode === 'time') bad(['mode', 'timeline'], 'mode_mismatch', 'the plan is untimed, the spec plays over time');
  if (!timeline && presentation.mode === 'steps') bad(['mode', 'kind'], 'mode_mismatch', 'new plans use Static, Over time or Experiment; the spec uses steps');
  if (timeline) {
    if (presentation.mode !== 'time') bad(['mode', 'timeline'], 'timeline_missing', 'the plan is timed, the spec is not in time mode');
    else {
      const corners = cornerEnds(timeline.end, domains);
      if (corners.length && !(presentation.duration >= Math.max(...corners) - 1e-9)) bad(['mode', 'timeline', 'end'], 'duration_mismatch', `presentation.duration ${presentation.duration} is shorter than the approved endpoint ${Math.max(...corners)}`);
    }
    const offset = scalarSafe(() => scalarInterval(timeline.displayOffset, domains));
    if (offset && (offset[0] !== 0 || offset[1] !== 0)) bad(['mode', 'timeline', 'displayOffset'], 'spec_timeline_unsupported', 'the declarative renderer cannot show a displayed time origin; the plan needs the program renderer');
  }
}
function scalarSafe(fn) { try { return fn(); } catch (error) { if (error instanceof ScalarExprError) return null; throw error; } }
// The endpoint at every min/max corner of the number inputs the expression reads (monotone expressions reach their extreme at one).
function cornerEnds(expr, domains) {
  const names = Object.keys(domains).slice(0, 4), out = [];
  for (let mask = 0; mask < (1 << names.length); mask += 1) {
    const values = Object.fromEntries(names.map((n, i) => [n, domains[n][(mask >> i) & 1]]));
    const value = scalarSafe(() => evalScalar(expr, values, domains));
    if (value !== null) out.push(value);
  }
  return out;
}

// Support panels: control-free, read-only, untimed; every declared input is bound from a compatible main input (INT-04-C03).
function supportProblems(plan, panel, bad) {
  const { id, support, artifact } = panel;
  if (artifactKind(artifact) !== support.runtime.renderer) return;
  const at = key => [`supportingVisuals.${id}`, key];
  const mainControls = new Map(inputControls(plan).map(c => [c.binding.id, c]));
  support.parameterBindings.forEach(b => { if (!mainControls.has(b.fromInputId)) bad(at('parameterBindings'), 'binding_incompatible', `main input "${b.fromInputId}" is not declared`); });
  if (artifactKind(artifact) === 'program') {
    const m = artifact.program.manifest;
    if (m.duration || m.timeline) bad(at('timeline'), 'support_clock', `support panel "${id}" has its own clock; supporting views never play along a second timeline`);
    if ((m.actions || []).length || (m.targets || []).length || artifact.program.schemaVersion === 2) bad(at('controls'), 'support_controls', `support panel "${id}" declares actions or targets; supporting views are read-only`);
    for (const input of m.inputs || []) {
      const binding = support.parameterBindings.find(b => b.toInputId === input.id);
      if (!binding) { bad(at('inputs'), 'support_input_unbound', `support panel "${id}" declares input "${input.id}" with no parameterBinding; supporting views have no controls of their own`); continue; }
      const from = mainControls.get(binding.fromInputId);
      if (!from) continue;
      const ok = from.type === 'number' ? input.type === 'number' && input.min <= from.min + 1e-9 && input.max >= from.max - 1e-9
        : from.type === 'select' ? input.type === 'select' && from.options.every(o => input.options.some(x => x.value === o.value)) : false;
      if (!ok) bad(at('parameterBindings'), 'binding_incompatible', `main ${from.type} "${from.id}" does not fit support input "${input.id}" (${input.type} ${input.min ?? ''}${input.max !== undefined ? `..${input.max}` : ''})`);
    }
    for (const b of support.parameterBindings) if (!(m.inputs || []).some(i => i.id === b.toInputId)) bad(at('parameterBindings'), 'binding_incompatible', `support panel "${id}" declares no input "${b.toInputId}"`);
    for (const r of support.readoutIds) {
      const got = (m.readouts || []).find(x => x.id === r);
      if (!got) bad(at('readoutIds'), 'readout_missing', `the approved readout "${r}" of "${id}" is not declared in manifest.readouts`);
      else if (!String(got.label ?? '').trim() || got.unit == null) bad(at('readoutIds'), 'readout_unlabelled', `the readout "${r}" of "${id}" needs a label and a unit (use '' for a pure number)`);
    }
  } else {
    const p = artifact.spec.presentation || {};
    if (p.mode === 'time' || p.mode === 'steps' || (p.experiments || []).length) bad(at('controls'), 'support_controls', `support panel "${id}" is timed, stepped or has controls; supporting views are static and read-only`);
  }
}

// Visible copy: the card shows the approved Title and cardDescription once, from the composition. Neither the manifest nor the drawn
// text may repeat the Story or carry a second description (INT-04-C04).
function copyProblems(plan, panel, bad) {
  const kind = artifactKind(panel.artifact);
  if (kind !== 'program') return;
  const m = panel.artifact.program.manifest, story = norm(plan.story);
  if (m.cardDescription !== undefined) bad([panel.id, 'manifest', 'cardDescription'], 'copy_duplicated', `panel "${panel.id}" sets manifest.cardDescription; the composition renders the approved description once`);
  const strings = [m.summary, m.description, ...(m.assumptions || [])].filter(Boolean).map(norm);
  if (strings.some(s => s.length >= 60 && story.includes(s)) || strings.some(s => s.length >= 120 && s.includes(story.slice(0, 120)))) bad([panel.id, 'manifest'], 'story_in_card', `panel "${panel.id}" copies the Story into the manifest; the Story stays in the design record`);
}

// validateCompositionBindings(plan, artifacts) -> problems [{path, code, message}]. Synchronous and pure: structure, exact support IDs,
// per-panel runtime, control bindings, timeline, support rules and copy. Hash integrity is checked by compileCardComposition/verify.
export function validateCompositionBindings(plan, artifacts) {
  const out = [];
  const bad = (path, code, message) => out.push({ path: dotted([].concat(path)), code, message });
  if (!artifacts || typeof artifacts !== 'object' || !artifacts.main || !Array.isArray(artifacts.supporting)) {
    return [{ path: 'artifacts', code: 'artifacts_shape', message: 'artifacts is {main, supporting:[{id, artifact}]}' }];
  }
  for (const key of Object.keys(artifacts)) if (!['main', 'supporting'].includes(key)) bad('artifacts', 'artifacts_shape', `unknown field "${key}"`);
  // Support IDs match the plan exactly, at most two, none dropped, none invented, none twice.
  const wanted = plan.supportingVisuals.map(s => s.id), got = artifacts.supporting.map(s => s?.id);
  if (artifacts.supporting.length > PLAN_LIMITS.supports) bad('artifacts.supporting', 'support_limit', `at most ${PLAN_LIMITS.supports} supporting panels`);
  for (const id of wanted) if (!got.includes(id)) bad('artifacts.supporting', 'support_missing', `the approved panel "${id}" was dropped`);
  got.forEach((id, i) => { if (!wanted.includes(id)) bad(['artifacts', 'supporting', i], 'support_unknown', `panel "${id}" is not in the approved plan`); else if (got.indexOf(id) !== i) bad(['artifacts', 'supporting', i], 'support_duplicate', `panel "${id}" appears twice`); });
  for (const s of artifacts.supporting) for (const key of Object.keys(s || {})) if (!['id', 'artifact'].includes(key)) bad('artifacts.supporting', 'artifacts_shape', `unknown field "${key}"`);
  const panels = panelsOf(plan, artifacts);
  for (const panel of panels) { runtimeProblems(panel, bad); copyProblems(plan, panel, bad); if (panel.support) supportProblems(plan, panel, bad); }
  mainBindingProblems(plan, artifacts.main, bad);
  return out;
}

// ---- the composition record ----------------------------------------------------------------------------------------------------
const planText = (max = 1200) => z.string().min(1).max(max).refine(v => v.trim().length > 0 && !/<\/?[a-zA-Z][^>]*>/.test(v) && !/\b(?:https?|ftp):\/\/|\bjavascript:/i.test(v), 'plain text only: no HTML, script or URL');
const stable = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/);
const hex = z.string().regex(/^[0-9a-f]{64}$/);
const expr = z.unknown().superRefine((value, ctx) => { const p = scalarExprProblem(value); if (p) ctx.addIssue({ code: 'custom', message: p.message, path: p.path }); });
const runtime = z.object({ renderer: z.enum(['spec', 'program']), schemaVersion: z.number().int().min(1), sdkVersion: z.string().min(1).max(64).nullable(),
  programTuple: z.record(z.string(), z.unknown()).nullable(), requiredHelpers: z.array(z.string().max(64)).max(16), requiredCapabilities: z.array(z.string().max(64)).max(16), catalogueHash: hex }).strict();
const artifactRef = z.object({ kind: z.enum(['spec', 'program']), hash: hex }).strict();
const scalar = z.union([z.number().finite(), z.string().max(1200), z.boolean()]);
const control = z.object({
  id: stable, type: z.enum(['playback', 'scrubber', 'number', 'select', 'boolean', 'index', 'multi_select', 'action', 'target', 'reset']), label: planText(60),
  nativeControlId: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/), binding: z.object({ kind: z.enum(['input', 'timeline', 'action', 'target', 'reset']), id: stable.optional() }).strict(),
  row: z.enum(['transport', 'controls']), native: z.object({ in: z.enum(['manifest.inputs', 'manifest.actions', 'manifest.targets', 'presentation.experiments', 'timeline', 'card.reset']), declaration: z.unknown() }).strict(),
  affects: z.array(z.object({ scope: stable, kind: z.enum(['entity', 'quantity', 'readout']), id: stable }).strict()).max(16),
  unit: z.string().max(16).optional(), default: z.union([scalar, z.array(z.number().int())]).optional(), min: z.number().finite().optional(), max: z.number().finite().optional(), step: z.number().positive().finite().optional(),
  options: z.array(z.object({ value: z.string().max(32), label: planText(60) }).strict()).max(CONTRACT_LIMITS.options).optional(),
  items: z.array(z.object({ id: stable, label: planText(60) }).strict()).max(PLAN_LIMITS.items).optional(), presentation: z.string().max(32).optional(), dataRef: stable.optional(),
  labels: z.object({ paused: z.string(), playing: z.string(), ended: z.string() }).strict().optional(), interaction: z.enum(['select', 'drag']).optional(),
}).strict();
const timelineRecord = z.object({
  label: planText(60), unit: z.literal('s'), end: expr, displayOffset: expr, markers: z.array(z.object({ id: stable, label: planText(60), time: expr }).strict()).max(PLAN_LIMITS.markers),
  playbackRate: z.number().positive().finite().max(PLAN_LIMITS.playbackRate), initialTime: z.literal(0), initialPlayback: z.literal('paused'), step: z.number().positive().finite(),
}).strict();
export const CardCompositionSchema = z.object({
  version: z.literal(COMPOSITION_VERSION), planHash: hex, depth: z.enum(['brief', 'balanced', 'detailed', 'overview', 'standard', 'deep']), title: planText(PLAN_LIMITS.title), cardDescription: planText(PLAN_LIMITS.cardDescription),
  order: z.array(z.enum(CARD_ORDER)).max(CARD_ORDER.length),
  supporting: z.array(z.object({ id: stable, title: planText(PLAN_LIMITS.title), artifact: artifactRef, runtime, readoutIds: z.array(stable).max(16),
    parameterBindings: z.array(z.object({ fromInputId: stable, toInputId: stable }).strict()).max(8), readOnly: z.literal(true), snapshotTime: z.literal(SNAPSHOT_TIME) }).strict()).max(PLAN_LIMITS.supports),
  main: z.object({ artifact: artifactRef, runtime, mode: z.enum(['static', 'time', 'experiment']), readoutIds: z.array(stable).max(16), inputDefaults: z.record(stable, scalar.or(z.array(z.number().int()))),
    controls: z.array(control).max(PLAN_LIMITS.controls), timeline: timelineRecord.nullable(), onInputChange: z.enum(['recompute_still', 'reset_pause']) }).strict(),
  envelopeHash: hex,
}).strict();

// Reject an artifact the plan's controls cannot back before hashing: a corrupt envelope never gets a hash.
const artifactHash = async artifact => (artifact.kind === 'program' ? artifact.program.bundleHash : contentHash(artifact.spec));

// compileCardComposition(plan, artifacts) -> CardComposition (async: the plan hash and artifact hashes are SHA-256). Throws CompositionError
// with the problems when the envelope does not match the approved plan, or a sealed program's hashes do not match its content. The
// returned envelopeHash covers the composition AND every artifact's content hash, so no panel can be swapped independently.
export async function compileCardComposition(plan, artifacts) {
  const problems = validateCompositionBindings(plan, artifacts);
  if (problems.length) throw new CompositionError(problems);
  const ordered = [{ id: 'main', artifact: artifacts.main }, ...plan.supportingVisuals.map(s => ({ id: s.id, artifact: artifacts.supporting.find(x => x.id === s.id).artifact }))];
  const hashes = {};
  for (const { id, artifact } of ordered) {
    if (artifact.kind === 'program' && !(await verifyHashes(artifact.program))) throw new CompositionError([{ path: id, code: 'artifact_hash_mismatch', message: `panel "${id}" program does not match its own hashes` }]);
    hashes[id] = { kind: artifact.kind, hash: await artifactHash(artifact) };
  }
  const { declarations } = controlDeclarations(plan);
  const tl = plan.mode.timeline, scrubber = plan.controls.find(c => c.type === 'scrubber');
  const controls = plan.controls.map(c => {
    const d = declarations.find(x => x.controlId === c.id);
    const { purpose: _purpose, selectionReason: _reason, effect: _effect, ...visible } = c; // design metadata stays in the plan record, never on the card
    return { ...visible, row: c.type === 'playback' || c.type === 'scrubber' ? 'transport' : 'controls', native: { in: d.in, declaration: d.declaration } };
  });
  const body = {
    version: COMPOSITION_VERSION, planHash: await planHash(plan), depth: plan.depth, title: plan.title, cardDescription: plan.cardDescription,
    order: CARD_ORDER.filter(row => row === 'title' || row === 'description' || row === 'main' || (row === 'supporting' && plan.supportingVisuals.length) || (row === 'transport' && tl) || (row === 'controls' && controls.some(c => c.row === 'controls'))),
    supporting: plan.supportingVisuals.map(s => ({ id: s.id, title: s.title, artifact: hashes[s.id], runtime: s.runtime, readoutIds: s.readoutIds, parameterBindings: s.parameterBindings, readOnly: true, snapshotTime: SNAPSHOT_TIME })),
    main: { artifact: hashes.main, runtime: plan.scene.runtime, mode: plan.mode.kind, readoutIds: plan.scene.readoutIds,
      inputDefaults: Object.fromEntries(inputControls(plan).map(c => [c.binding.id, inputDefault(c)])), controls,
      timeline: tl ? { label: tl.label, unit: 's', end: tl.end, displayOffset: tl.displayOffset, markers: tl.markers, playbackRate: tl.playbackRate, initialTime: 0, initialPlayback: 'paused', step: scrubber.step } : null,
      onInputChange: plan.mode.onInputChange },
  };
  const composition = { ...body, envelopeHash: await contentHash({ composition: body, artifacts: hashes }) };
  const parsed = CardCompositionSchema.safeParse(composition);
  if (!parsed.success) throw new CompositionError(parsed.error.issues.slice(0, 8).map(i => ({ path: dotted(i.path), code: 'composition_invalid', message: i.message })));
  return parsed.data;
}

// A saved or returned composition against the artifacts it claims: schema, then every reference and the envelope hash recomputed from the
// actual content. -> problems []. A swapped or edited panel, or a hand-written hash, fails here.
export async function verifyComposition(composition, artifacts) {
  const parsed = CardCompositionSchema.safeParse(composition);
  if (!parsed.success) return parsed.error.issues.slice(0, 8).map(i => ({ path: dotted(i.path), code: 'composition_invalid', message: i.message }));
  const out = [], hashes = {};
  const entries = [['main', artifacts?.main, composition.main.artifact], ...composition.supporting.map(s => [s.id, artifacts?.supporting?.find(x => x.id === s.id)?.artifact, s.artifact])];
  for (const [id, artifact, ref] of entries) {
    if (!artifactKind(artifact)) { out.push({ path: id, code: 'artifact_missing', message: `panel "${id}" has no artifact` }); continue; }
    const hash = await artifactHash(artifact);
    hashes[id] = { kind: artifact.kind, hash };
    if (hash !== ref.hash || artifact.kind !== ref.kind) out.push({ path: id, code: 'composition_swapped', message: `panel "${id}" is not the artifact this composition was built from` });
    else if (artifact.kind === 'program' && !(await verifyHashes(artifact.program))) out.push({ path: id, code: 'artifact_hash_mismatch', message: `panel "${id}" program does not match its own hashes` });
  }
  if (!out.length) {
    const { envelopeHash, ...body } = composition;
    if (envelopeHash !== await contentHash({ composition: body, artifacts: hashes })) out.push({ path: 'envelopeHash', code: 'composition_swapped', message: 'the envelope hash does not match the composition and its artifacts' });
  }
  return out;
}

// What the Scene Builder is told about time, computed once from the approved plan (never by a model): the longest endpoint over the whole
// input range (the value manifest.duration must be), and the endpoint, origin and markers at the default inputs.
export function timelineBrief(plan) {
  const tl = plan.mode.timeline;
  if (!tl) return null;
  const domains = numberDomains(plan), defaults = numberDefaults(plan);
  const at = e => evalScalar(e, defaults, domains);
  return { label: tl.label, unit: 's', durationSeconds: Math.max(...cornerEnds(tl.end, domains)), playbackRate: tl.playbackRate,
    atDefaultInputs: { end: at(tl.end), displayOffset: at(tl.displayOffset), markers: tl.markers.map(m => ({ id: m.id, label: m.label, time: at(m.time) })) } };
}
