// /interact deterministic checks, actual-card capture planning, review and bounded repair (INT-05, docs/features/interact.md section 9).
// The pieces, in the order a candidate meets them:
//   validateBuildOutput (interact-build.js)  structural: contracts, sealing with the approved tuple, bindings, composition compiled BEFORE capture
//   buildPlanCaptureCases                    the plan's checkpoints, start, end and boundary states, within the review's image budget
//   ctx.captureCard                          the COMPLETE card (Title, description, support, main, transport, controls) at each case (a seam)
//   checkSceneAgainstPlan                    numerical and behavioural checks from runtime TRACES, never from the builder's prose
//   reviewCaptures (explain-review.js)       the independent reviewer reads the actual captures of THIS composition
//   checkRound / repairRound                 one step each; the runner (interact-runner.js) loops them under the shared three-round bound
// A candidate is ready only when every step passed on its own composition hash. A failed, exhausted, stale or partly captured candidate
// never becomes ready. A repair can fix the implementation; it has no field that could change the approved plan.
import { canonicalJson } from '../../web/src/explain-contract.js';
import { CAPTURE_BUDGET, evalScalar, ScalarExprError } from '../../web/src/interact-plan.js';
import { createSnapshotResolver, resolveSupportInputs, resolveTimeline, verifyComposition } from '../../web/src/interact-composition.js';
import { fitGuestLabels, frameOverlaps, traceFrame, traceObjects } from '../../web/src/explain-program/frame-overlap.js';
import { evaluateRequestFor } from '../../web/src/explain-program/program-card.js';
import { parseGuestResult, resolveInputs, sha256Hex } from '../../web/src/explain-program/contract.js';
import { REVIEW_LIMITS, ReviewError, reviewCaptures, reviewProblems } from './explain-review.js';
import { REVIEW_EVENTS, RenderError } from './explain-render.js';
import { programFacts } from './explain-program.js';
import { specFacts } from './explain-author.js';
import { INTERACT_LIMITS, InteractModelError, callInteractRole } from './interact-models.js';
import { INTERACT_REPAIR_SYSTEM, INTERACT_REPAIR_TOOL_NAME, interactRepairTool } from './agents/explain-repair.js';
import { approvedPlanOf, buildInput, callRecord, callWithCorrection, correctable, refusalProblems, schemaOptions, validateBuildOutput } from './interact-build.js';
import { REPAIR_FORWARD } from './explain-program-stage.js';
import { conventionProblems } from './interact-convention.js';

// correctionRounds: shared across validation, render and review failures (INT-05-C08). renderRetries: recapture attempts after a render
// outage, which spend no model call and no correction round (INT-05-C10). maxCases: the rendered reviewer's images per round (the profile's
// build_review.maxImages, 6), so one round is one review call.
// parseReview clamps a finding's message (400 characters) and object (64) itself. The strict adapter validator would instead refuse the WHOLE review for one long sentence
// (a live run lost its review to a 400-plus character message), so those two length limits are dropped from the VALIDATION schema only; the clamp still applies afterwards.
export function lenientFindingText(schema) {
  if (Array.isArray(schema)) return schema.map(lenientFindingText);
  if (!schema || typeof schema !== 'object') return schema;
  const out = Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, lenientFindingText(value)]));
  if (out.properties && typeof out.properties === 'object') for (const name of ['message', 'object']) if (out.properties[name]?.type === 'string' && out.properties[name].maxLength !== undefined) { const { maxLength: _drop, ...rest } = out.properties[name]; out.properties = { ...out.properties, [name]: rest }; }
  return out;
}

// The reviewer's trace block: 6 captures (cases and support panels) x (12 texts of 80 characters + 12 quantities + inputs) is about 10,500 bytes at the worst; the legacy single-scene 6,144 would call a
// normal card incomplete. The build_review input ceiling (80,000 bytes) has the room.
const TRACE_BYTES = 12288;
export const CHECK_LIMITS = Object.freeze({ correctionRounds: INTERACT_LIMITS.correctionRounds, reviewCalls: INTERACT_LIMITS.calls.build_review, renderRetries: 2, maxCases: CAPTURE_BUDGET, maxProbes: 8, tolerance: 1e-6, timeTolerance: 1e-9 });

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const clip = (text, n = REPAIR_FORWARD.text) => String(text ?? '').slice(0, n);
// The finest clock there is (performance.now: sub-millisecond; Date.now is whole milliseconds), for timing a CPU step in the body; the stage columns of the ledger are wall-clock slices, see interact-ledger.js.
export const clockMs = () => globalThis.performance?.now?.() ?? Date.now();
export const round1 = n => Math.round(n * 10) / 10;
const round6 = n => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(6)) : n);

// ---- planning --------------------------------------------------------------------------------------------------------------------
function evalAt(expr, composition, inputs) {
  const values = {}, domains = {};
  for (const c of composition.main.controls) if (c.type === 'number') { domains[c.binding.id] = [c.min, c.max]; values[c.binding.id] = Math.min(c.max, Math.max(c.min, Number.isFinite(inputs[c.binding.id]) ? inputs[c.binding.id] : composition.main.inputDefaults[c.binding.id])); }
  return evalScalar(expr, values, domains);
}

// buildPlanCaptureCases(plan, composition, artifacts, { limit }) -> { cases, coverage }
// One case = one complete-card capture. Required (never dropped): the initial state, every approved checkpoint (its time, input overrides and
// declared actions), and the endpoint of each. Optional, in priority order and only while the image budget allows: boundary values of every
// control (a number's min and max, other options, a switch's other state) at THAT state's own endpoint, and every declared action. What does
// not fit is named in coverage.omitted; trace-only probes (no image) isolate each input's own effect; if the REQUIRED cases do not fit, coverage.incomplete is true and the card cannot be accepted
// (INT-05-C13): coverage is never silently dropped and the image cap is never raised.
export function buildPlanCaptureCases(plan, composition, artifacts, { limit = CHECK_LIMITS.maxCases } = {}) {
  const defaults = composition.main.inputDefaults, timed = !!composition.main.timeline, seen = new Map();
  const required = [], optional = [], problems = [];
  const endOf = inputs => (timed ? resolveTimeline(composition, inputs).end : 0);
  const add = (list, c) => {
    const full = { ...c, aliases: [], supports: plan.supportingVisuals.map(s => ({ id: s.id, inputs: resolveSupportInputs(composition, s.id, c.inputs), time: 0 })) };
    const key = canonicalJson({ inputs: full.inputs, time: full.time, events: full.events });
    if (seen.has(key)) { seen.get(key).aliases.push(full.id); return; }
    seen.set(key, full); list.push(full);
  };
  const press = id => ({ type: 'action', action: id });
  add(required, { id: timed ? 'start' : 'default', kind: 'start', label: 'initial state', inputs: { ...defaults }, time: 0, events: [] });
  for (const cp of plan.scene.checkpoints) {
    const inputs = { ...defaults, ...cp.inputOverrides };
    let time = 0;
    try { time = cp.time ? evalAt(cp.time, composition, inputs) : 0; if (time > endOf(inputs) + CHECK_LIMITS.timeTolerance) problems.push({ path: `scene.checkpoints.${cp.id}`, code: 'checkpoint_after_end', message: `checkpoint "${cp.id}" at ${time} s is after the endpoint ${endOf(inputs)} s for its inputs` }); }
    catch (error) { if (!(error instanceof ScalarExprError)) throw error; problems.push({ path: `scene.checkpoints.${cp.id}`, code: 'checkpoint_unresolvable', message: error.message }); }
    add(required, { id: `cp-${cp.id}`, kind: 'checkpoint', checkpointId: cp.id, label: cp.label, inputs, time, events: cp.actions.slice(0, REVIEW_EVENTS).map(press) });
  }
  if (timed) add(required, { id: 'end', kind: 'end', label: 'endpoint', inputs: { ...defaults }, time: endOf(defaults), events: [] });
  // A boundary value of a control is captured at the INSTANT the plan already schedules for that control: the first checkpoint (in plan order) whose time expression references the
  // control's input, evaluated at the boundary inputs, so the card shows e.g. the maximum launch speed at its own top and not only at the end of the flight. Only a control no
  // checkpoint references falls back to the end of the flight. coverage.boundaries records the checkpoint chosen for each.
  const references = (expr, id) => !!expr && (expr.op === 'input' ? expr.id === id : expr.op !== 'literal' && (references(expr.left, id) || references(expr.right, id)));
  const boundaries = [];
  for (const c of plan.controls) {
    const name = c.binding.id, anchor = timed ? plan.scene.checkpoints.find(cp => references(cp.time, name)) ?? null : null;
    const bounded = (tag, value) => {
      const inputs = { ...defaults, ...(anchor?.inputOverrides ?? {}), [name]: value };
      let time = endOf(inputs), where = '';
      if (anchor) { try { time = evalAt(anchor.time, composition, inputs); where = `, at ${anchor.label}`; } catch (error) { if (!(error instanceof ScalarExprError)) throw error; } }
      boundaries.push({ control: c.id, bound: String(tag), checkpoint: where ? anchor.id : null });
      add(optional, { id: `bound-${c.id}-${tag}`, kind: 'boundary', label: `${c.label} at ${tag}${where}`, inputs, time, events: [] });
    };
    if (c.type === 'number') { bounded('min', c.min); bounded('max', c.max); }
    else if (c.type === 'select') for (const o of c.options.slice(0, 4)) if (o.value !== c.default) bounded(o.value, o.value);
    else if (c.type === 'boolean') bounded(c.default ? 'off' : 'on', !c.default);
    else if (c.type === 'index') { bounded('first', 0); bounded('last', c.items.length - 1); }
    if (c.type === 'action') add(optional, { id: `action-${c.binding.id}`, kind: 'action', label: `press ${c.label}`, inputs: { ...defaults }, time: 0, events: [press(c.binding.id)] });
    if (c.type === 'target') add(optional, { id: `target-${c.binding.id}`, kind: 'action', label: `select ${c.label}`, inputs: { ...defaults }, time: 0, events: [{ type: 'select', target: c.binding.id }] });
  }
  // Trace-only probes (no image to the reviewer): each adjustable input at two values with the SAME elapsed time, so a difference in the traces is
  // the input's own effect and not a different moment. At most PROBES in all; what does not fit is listed.
  const probes = [], mid = (a, b) => (timed ? 0.5 * Math.min(endOf(a), endOf(b)) : 0);
  const probe = (c, tag, inputs, time) => probes.push({ id: `probe-${c.id}-${tag}`, kind: 'probe', control: c.id, label: `${c.label} (${tag})`, inputs, time, events: [], aliases: [],
    supports: plan.supportingVisuals.map(s => ({ id: s.id, inputs: resolveSupportInputs(composition, s.id, inputs), time: 0 })) });
  for (const c of plan.controls) {
    const name = c.binding.id, withValue = value => ({ ...defaults, [name]: value });
    if (c.type === 'number') { const lo = withValue(c.min), hi = withValue(c.max), t = mid(lo, hi); probe(c, 'min', lo, t); probe(c, 'max', hi, t); }
    else if (c.type === 'select') { const alt = c.options.find(o => o.value !== c.default); if (alt) { const t = mid(defaults, withValue(alt.value)); probe(c, 'base', defaults, t); probe(c, 'alt', withValue(alt.value), t); } }
    else if (c.type === 'boolean') { const t = mid(defaults, withValue(!c.default)); probe(c, 'base', defaults, t); probe(c, 'alt', withValue(!c.default), t); }
    else if (c.type === 'index') { const alt = c.default === 0 ? c.items.length - 1 : 0, t = mid(defaults, withValue(alt)); probe(c, 'base', defaults, t); probe(c, 'alt', withValue(alt), t); }
  }
  const incomplete = required.length > limit, room = Math.max(0, limit - required.length);
  const cases = incomplete ? required.slice(0, limit) : [...required, ...optional.slice(0, room)];
  const omitted = [...(incomplete ? required.slice(limit) : []), ...optional.slice(room)].map(c => ({ id: c.id, label: c.label, reason: incomplete ? 'required coverage does not fit the image budget' : 'over the image budget' }));
  return { cases, probes: probes.slice(0, CHECK_LIMITS.maxProbes), coverage: { limit, required: required.length, sampled: cases.length, omitted, incomplete, problems, boundaries, probes: Math.min(probes.length, CHECK_LIMITS.maxProbes), probesOmitted: Math.max(0, probes.length - CHECK_LIMITS.maxProbes) } };
}

// ---- deterministic checks ---------------------------------------------------------------------------------------------------------
const valueOf = (capture, panel, name) => {
  const source = panel === 'main' ? capture.trace : capture.supports?.[panel]?.trace;
  return source ? (source.quantities?.[name] ?? source.readouts?.[name] ?? null) : undefined;
};
const differs = (a, b) => canonicalJson(a) !== canonicalJson(b);
const norm = value => String(value).toLowerCase().replace(/\s+/g, ' ').trim();

// Numbers in the card description that nothing in the approved plan supports (INT-05-C07). Not a failure by itself (a derived figure can be right):
// it is reported in the coverage and handed to the reviewer as an open check against the full Story.
export function descriptionNumbers(plan) {
  const literals = e => (e && typeof e === 'object' ? (e.op === 'literal' ? [e.value] : [e.left, e.right].flatMap(literals)) : []);
  const known = new Set(), add = text => { for (const m of String(text).matchAll(/\d+(?:\.\d+)?/g)) known.add(Number(m[0])); };
  [plan.story, ...plan.assumptions, ...plan.claims.flatMap(c => [c.text, c.check]), ...plan.scene.checkpoints.map(c => c.expected), ...plan.scene.observations.map(o => o.text),
    ...plan.scene.quantities.flatMap(q => [q.meaning, q.reference, q.relation ?? '']), ...plan.supportingVisuals.flatMap(s => [s.title, s.description, ...s.observations.map(o => o.text)])].forEach(add);
  for (const v of Object.values(plan.mode.fixedValues)) if (typeof v === 'number') known.add(Math.abs(v));
  for (const c of plan.controls) for (const v of [c.default, c.min, c.max, c.step]) if (typeof v === 'number') known.add(Math.abs(v));
  for (const e of [plan.mode.timeline?.end, plan.mode.timeline?.displayOffset, ...(plan.mode.timeline?.markers ?? []).map(m => m.time), ...plan.scene.checkpoints.map(c => c.time)]) literals(e).forEach(v => known.add(Math.abs(v)));
  return [...new Set([...plan.cardDescription.matchAll(/\d+(?:\.\d+)?/g)].map(m => Number(m[0])))].filter(n => !known.has(n));
}

// checkSceneAgainstPlan({ plan, composition, artifacts, captures, cases, oracle }) -> { problems, coverage }
//   captures: ctx.captureCard results (one per case): { caseId, compositionHash, completeCard, bundleHash?, trace: {inputs, time, quantities, readouts?, frameHash?,
//     error?}, supports: {id: {bundleHash?, trace}} }. quantities and readouts are name -> number as the program reported them.
//   oracle: trusted expected values { expect: [{case, panel, name, expected, tol|decimals}] } from a reviewed fixture or the benchmark corpus; absent,
//     the numerical comparison is not claimed (coverage.oracle says so) and the structural and behavioural checks still run. A generated claim
//     is data: it never defines an assertion.
export function checkSceneAgainstPlan({ plan, composition, captures, cases, probes = [], oracle = null, allowPartialCard = false }) {
  const problems = [], bad = (code, path, message, at) => problems.push({ code, path, message, ...(at ? { case: at } : {}) });
  const coverage = { cases: [], oracle: { checked: 0, skipped: [] }, effects: { tested: [], untested: [] }, proseOnly: [] };
  const byCase = new Map(captures.map(c => [c.caseId, c])), overlapSeen = new Set();
  const capOf = id => byCase.get(id) ?? byCase.get(cases.find(c => c.aliases?.includes(id))?.id);
  const reported = new Set(plan.scene.observations.flatMap(o => o.quantityIds));
  for (const name of Object.keys(plan.mode.fixedValues)) reported.delete(name);

  for (const c of cases) {
    const cap = byCase.get(c.id);
    if (!cap) { bad('capture_missing', c.id, `no capture of the complete card for "${c.label}"`, c.id); continue; }
    const where = `case ${c.id}`;
    // Strict by default; completeCard:false is accepted only when the caller says the render service cannot compose the card yet (see the ponytail above INTERACT_REVIEW_RULES).
    if (cap.completeCard !== true && !(allowPartialCard && cap.completeCard === false)) bad('capture_not_complete', where, `the capture for "${c.label}" is not the complete card`, c.id);
    if (cap.compositionHash !== composition.envelopeHash) { bad('stale_capture', where, `the capture for "${c.label}" is of a different composition than the one being checked`, c.id); continue; }
    const t = cap.trace;
    if (!t || t.error) { bad('program_error', where, `the program failed at "${c.label}"${t?.error?.code ? ` (${t.error.code})` : ''}${t?.error?.diagnostic ? `: ${String(t.error.diagnostic).slice(0, 300)}` : ''}`, c.id); continue; }
    if (cap.bundleHash && cap.bundleHash !== composition.main.artifact.hash) bad('stale_capture', where, `the main program that ran at "${c.label}" is not the sealed one`, c.id);
    if (!plain(t.quantities)) { bad('trace_missing', where, `no runtime trace for "${c.label}"`, c.id); continue; }
    for (const [name, v] of Object.entries(t.quantities)) if (typeof v !== 'number' || !Number.isFinite(v)) bad('quantity_not_finite', where, `quantity "${name}" is not a finite number at "${c.label}"`, c.id);
    // The clock the program ran at is the card's clock: a program that still clamps to an older duration answers an earlier time.
    if (composition.main.timeline && typeof t.time === 'number' && Math.abs(t.time - c.time) > CHECK_LIMITS.timeTolerance) {
      bad('wrong_timeline_endpoint', where, `asked for ${round6(c.time)} s at "${c.label}", the program ran at ${round6(t.time)} s (the endpoint for these inputs is ${round6(resolveTimeline(composition, c.inputs).end)} s)`, c.id);
    }
    for (const r of plan.scene.readoutIds) if (valueOf(cap, 'main', r) === null) bad('readout_not_emitted', where, `the approved readout "${r}" is not emitted at "${c.label}"`, c.id);
    for (const q of reported) if (!(q in t.quantities) && !(t.readouts && q in t.readouts)) bad('quantity_not_reported', where, `the plan's quantity "${q}" is not in the runtime trace at "${c.label}"`, c.id);
    // Drawn text (trace.texts, when the capture seam reports it): the Story and the description are shown by the card, never drawn into a scene.
    for (const text of [...(t.texts ?? []), ...plan.supportingVisuals.flatMap(s => cap.supports?.[s.id]?.trace?.texts ?? [])]) {
      if (norm(plan.story).includes(norm(text)) && norm(text).length >= 60 || norm(text).includes(norm(plan.cardDescription).slice(0, 80))) { bad('story_in_scene', where, `a scene draws the Story or the description as text ("${text.slice(0, 50)}")`, c.id); break; }
    }
    // Host-computed geometry: a label on a ball, box or arrowhead, an arrowhead on a ball, or two labels on each other (any intersection of the estimated boxes) is a problem the
    // repairer answers with the two object ids; it is not left to the reviewer. A pair is reported once, at the first state it appears in.
    for (const o of frameOverlaps({ objects: t.objects ?? [], ...(t.frame ?? {}) })) { // t.frame (width, height) lets the text-outside-the-frame rule run
      const key = [o.a, o.b].sort().join('|');
      if (overlapSeen.has(key)) continue;
      overlapSeen.add(key);
      bad('overlap', where, `"${o.a}" overlaps "${o.b}" (${o.kind}, ${o.gap != null ? `${o.gap} px apart` : `${o.width} x ${o.height} px`}) at "${c.label}"${o.hint ? ` - ${o.hint}` : ''}`, c.id);
    }
    for (const s of plan.supportingVisuals) {
      const st = cap.supports?.[s.id];
      if (!st?.trace) { bad('support_not_captured', where, `support panel "${s.id}" is missing from the capture at "${c.label}"`, c.id); continue; }
      if (st.trace.error) bad('program_error', where, `support panel "${s.id}" failed at "${c.label}"`, c.id);
      if (st.bundleHash && st.bundleHash !== composition.supporting.find(x => x.id === s.id).artifact.hash) bad('stale_capture', where, `support panel "${s.id}" that ran is not the sealed one`, c.id);
      for (const r of s.readoutIds) if (valueOf(cap, s.id, r) === null) bad('readout_not_emitted', where, `support panel "${s.id}" does not emit its approved readout "${r}"`, c.id);
    }
    coverage.cases.push(c.id);
  }
  // Convention (interact-convention.js): a frame id the plan names, drawn without the SDK helper the renderer's look reads. One precise line per id, at no case in particular.
  for (const p of conventionProblems(plan, captures.flatMap(c => c.trace?.objects ?? []))) bad('convention', p.id, p.message);

  // Numbers from the trusted oracle, against the runtime's own quantities (never the builder's prose).
  for (const e of oracle?.expect ?? []) {
    const cap = capOf(e.case);
    if (!cap) { coverage.oracle.skipped.push(`${e.case}:${e.panel}.${e.name}`); continue; }
    const actual = valueOf(cap, e.panel, e.name);
    if (actual === undefined || actual === null) { bad('quantity_missing', `${e.case}.${e.panel}.${e.name}`, `the trace has no "${e.name}" to compare at ${e.case}`, e.case); continue; }
    const tol = e.tol ?? (e.decimals !== undefined ? 0.5 * 10 ** -e.decimals : CHECK_LIMITS.tolerance);
    coverage.oracle.checked += 1;
    if (!(Math.abs(actual - e.expected) <= tol)) bad('numeric_mismatch', `${e.case}.${e.panel}.${e.name}`, `${e.name} at ${e.case} is ${round6(actual)}, expected ${round6(e.expected)} (tolerance ${tol})`, e.case);
  }
  // Arrow directions from the trusted physics (oracle.arrows: {case, id, dir}): the drawn from -> to of an arrow object, y growing downward. dir is up, down or none (absent or under a pixel long),
  // or up-or-none / down-or-none (the arrow may be missing, as when a body has no velocity yet or the arrow is under its minimum length). A name and a direction the repairer can act on.
  for (const e of oracle?.arrows ?? []) {
    const cap = capOf(e.case);
    if (!cap?.trace?.objects) { coverage.oracle.skipped.push(`${e.case}:${e.id}`); continue; }
    const o = cap.trace.objects.find(x => x.id === e.id && x.kind === 'arrow'), dy = o ? o.to.y - o.from.y : 0, drawn = o && Math.hypot(o.to.x - o.from.x, dy) >= 1;
    const got = !drawn ? 'none' : dy > 0 ? 'down' : 'up', allowed = e.dir.replace('-or-none', ''), optional = e.dir.endsWith('-or-none');
    coverage.oracle.checked += 1;
    if (got === allowed || (optional && got === 'none')) continue;
    bad('arrow_direction', `${e.case}.${e.id}`, `the arrow "${e.id}" ${drawn ? `points ${got}` : 'is not drawn'} at ${e.case}, expected ${optional ? `${allowed} or no arrow` : allowed === 'none' ? 'no arrow (the quantity is zero)' : `${allowed}`} - ${e.why}`, e.case);
  }
  if (!oracle) coverage.oracle.note = 'no trusted expected values were supplied: numbers are checked structurally, not against an oracle';

  // Behavioural: every adjustable input visibly does something. Tested from the boundary captures that were sampled; what was not sampled is said.
  for (const c of plan.controls) {
    if (c.binding.kind !== 'input' || !c.affects.length) continue;
    // The probes hold elapsed time fixed and move only this input, so a difference is its own effect.
    const [a, b] = (c.type === 'number' ? ['min', 'max'] : ['base', 'alt']).map(tag => byCase.get(`probe-${c.id}-${tag}`));
    if (!a?.trace || !b?.trace) { coverage.effects.untested.push(c.id); continue; }
    const readouts = c.affects.filter(x => x.scope === 'main' && x.kind === 'readout').map(x => x.id);
    const moved = (readouts.length ? readouts.some(r => differs(valueOf(a, 'main', r), valueOf(b, 'main', r))) : differs([a.trace.quantities, a.trace.frameHash ?? null], [b.trace.quantities, b.trace.frameHash ?? null]))
      || c.affects.some(x => x.scope !== 'main' && differs(valueOf(a, x.scope, x.id), valueOf(b, x.scope, x.id)));
    coverage.effects.tested.push(c.id);
    if (!moved) bad('control_no_effect', `controls.${c.id}`, `moving "${c.label}" changed nothing the plan says it affects`);
  }
  for (const s of composition.supporting) {
    for (const b of s.parameterBindings) {
      const control = plan.controls.find(x => x.binding.id === b.fromInputId && x.type === 'number');
      const a = control && byCase.get(`probe-${control.id}-min`), z = control && byCase.get(`probe-${control.id}-max`);
      if (a?.supports?.[s.id]?.trace && z?.supports?.[s.id]?.trace && !differs(a.supports[s.id].trace.quantities, z.supports[s.id].trace.quantities)) bad('binding_no_effect', `supportingVisuals.${s.id}.parameterBindings`, `support panel "${s.id}" does not change when "${b.fromInputId}" moves`);
    }
  }
  coverage.fitted = [...new Set(captures.flatMap(c => c.trace?.fitted ?? []))].sort(); // the fits that were applied to the frames (frame-fit.js, frame-overlap.js fitGuestLabels): notes, never problems
  coverage.descriptionNumbers = { unsupported: descriptionNumbers(plan) };
  coverage.proseOnly = plan.scene.checkpoints.filter(cp => !(oracle?.expect ?? []).some(e => e.case === `cp-${cp.id}`)).map(cp => cp.id); // expected text only: the reviewer judges these
  return { problems, coverage };
}

// ---- the review ----------------------------------------------------------------------------------------------------------------
// ponytail: complete-card capture is NOT built (INT-05-C05 stays open). The render service draws one program frame at a time (explain-render.js renderStates)
// and cannot compose Title, description, supporting panels, main scene, transport and controls into one image. While ctx.completeCardUnavailable === true
// the capture seam returns each panel's real pixels with completeCard:false, checkRound accepts that and nothing else, and the reviewer gets the trusted
// layout as text (compositionLayoutText) plus INTERACT_REVIEW_RULES_PARTIAL, which says what it did not see. With the flag unset, completeCard must be true.
export const INTERACT_REVIEW_RULES = `This is the COMPLETE learner card built from an approved scene plan, not a bare scene: each capture shows the Title, the description, any supporting panel, the main scene, its playback and time readout and its controls, at the state named. The approved plan is in the request. Judge what the pixels and the execution traces show; do not approve from the plan's narrative.
- For every required observation and every approved checkpoint, find the capture that shows it and say whether it does; a checkpoint's expected text is the claim to verify, and the traces give the exact numbers.
- Check the order Title, description, supporting panels, scene, transport, controls; that the scene sits directly above its transport; and that NO explanatory text, caption, note or takeaway appears below any scene or below the controls. Fail a card that has one.
- Check the displayed time against the plan's timeline (its origin and range), that signs, units and directions match the plan's quantities, and that the drawing and its readouts agree with the traced quantities.
- Check the description against the Story for meaning and any scientific qualification, and flag a number in the description that the plan does not support.
- A required observation or control effect you cannot judge from what you were shown is a finding, not a pass. A readout or label that contradicts the card's own claim (for example 'a = 0' on a card whose claim is that the acceleration is -9.8 m/s^2 at v = 0) is a major finding unless the scene says why.`;

export const INTERACT_REVIEW_RULES_PARTIAL = `This is NOT the composed card. The render service cannot yet draw the whole card in one image, so each capture is ONE panel (the main scene at the state named, or a supporting panel's read-only snapshot) and the card's order and text are given as trusted text. You did not see the Title, the description, the transport or the controls as pixels: do not claim you did, and judge their order from the layout text only.
- For every required observation and every approved checkpoint, find the capture that shows it and say whether it does; a checkpoint's expected text is the claim to verify, and the traces give the exact numbers.
- Check that each panel's drawing and readouts agree with its traced quantities, that signs, units and directions match the plan's quantities, and that no scene draws the Story or the description as text.
- Check the displayed time range in the layout text against the plan's timeline, and the description against the Story for meaning and any scientific qualification; flag a number in the description that the plan does not support.
- A required observation or control effect you cannot judge from what you were shown is a finding, not a pass. A readout or label that contradicts the card's own claim (for example 'a = 0' on a card whose claim is that the acceleration is -9.8 m/s^2 at v = 0) is a major finding unless the scene says why.`;

// The trusted composed layout as text, for the reviewer of a partial capture: what the learner sees top to bottom, from the composition (never from a model).
// A timeline whose end, offset or markers are expressions of an input is recomputed by the card for every input state (resolveTimeline); say so, with the range at each bound, so the
// review judges a capture's scrubber and its Top marker against that capture's own inputs (a live run was refused because the layout text gave only the default range).
function followsInputs(composition, span) {
  const moved = composition.main.controls.filter(c => c.type === 'number' && c.binding?.kind === 'input').flatMap(c => [c.min, c.max].map(v => ({ name: c.label, v, s: resolveTimeline(composition, { ...composition.main.inputDefaults, [c.binding.id]: v }) })))
    .filter(x => x.s.displayStart !== span.displayStart || x.s.displayEnd !== span.displayEnd);
  return moved.length ? `. The scrubber range, its offset and its markers are recomputed from the inputs, so judge each capture against its own inputs: ${moved.map(x => `${x.name} ${x.v} reads ${round6(x.s.displayStart)} to ${round6(x.s.displayEnd)} s`).join('; ')}` : '';
}
export function compositionLayoutText(plan, composition) {
  const t = composition.main.timeline, span = t && resolveTimeline(composition, composition.main.inputDefaults);
  const rows = composition.order.map(row => {
    if (row === 'title') return `Title: ${composition.title}`;
    if (row === 'description') return `Description (once, above every scene): ${composition.cardDescription}`;
    if (row === 'supporting') return `Supporting panels, read-only, no controls: ${composition.supporting.map(s => `"${s.title}"`).join(', ')}`;
    if (row === 'main') return 'Main scene (the live animation)';
    if (row === 'transport') return `Playback directly under the scene: Play/Pause/Replay and a scrubber labelled "${t.label}", reading ${round6(span.displayStart)} to ${round6(span.displayEnd)} s at the default inputs (${t.playbackRate} physics s per wall s)${followsInputs(composition, span)}`;
    return `Controls: ${composition.main.controls.filter(c => c.row === 'controls').map(c => c.label).join(', ')}`;
  });
  return `Trusted card layout, top to bottom (nothing follows the last row):\n${rows.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
}

// What each scheduled capture shows, so the reviewer judges these images and never asks for one the plan did not schedule.
export const captureListText = cases => `Scheduled captures (the ONLY images that exist; never ask for one that is not listed, and judge an observation only against the captures that show its state): ${cases.map(c => `${c.id} = ${c.label} (t = ${round6(c.time)} s${c.inputs && Object.keys(c.inputs).length ? `, inputs ${JSON.stringify(c.inputs)}` : ''})`).join('; ')}.`;
const quantityList = (plan) => plan.scene.quantities.map(q => ({ id: q.id, label: q.label, unit: q.unit, meaning: q.meaning, reference: q.reference, ...(q.relation ? { relation: q.relation } : {}) }));
export function reviewRequest(plan, composition) {
  const loose = descriptionNumbers(plan);
  return `${loose.length ? `Open check: the card description states ${loose.join(', ')}, which nothing else in the plan states; verify each against the Story and the physics.\n\n` : ''}Approved scene plan (authoritative; the card must show exactly this):\n${JSON.stringify({
    title: plan.title, cardDescription: plan.cardDescription, story: plan.story, learningGoal: plan.learningGoal, depth: plan.depth, assumptions: plan.assumptions,
    mode: { kind: plan.mode.kind, initialState: plan.mode.initialState, fixedValues: plan.mode.fixedValues, timeline: composition.main.timeline && { label: plan.mode.timeline.label, onInputChange: plan.mode.onInputChange } },
    supportingPanels: plan.supportingVisuals.map(s => ({ id: s.id, title: s.title, description: s.description, observations: s.observations })),
    scene: { description: plan.scene.description, entities: plan.scene.entities.map(e => ({ id: e.id, label: e.label })), quantities: quantityList(plan), observations: plan.scene.observations, checkpoints: plan.scene.checkpoints.map(c => ({ id: c.id, label: c.label, expected: c.expected })) },
    controls: plan.controls.map(c => ({ id: c.id, label: c.label, type: c.type, affects: c.affects })), claims: plan.claims.map(c => ({ id: c.id, text: c.text, check: c.check })),
  })}`;
}
const factsOf = (plan, artifacts) => [...new Set([plan.title, plan.cardDescription, ...plan.supportingVisuals.map(s => s.title), ...plan.controls.map(c => c.label), plan.mode.timeline?.label,
  ...[artifacts.main, ...artifacts.supporting.map(s => s.artifact)].flatMap(a => (a.kind === 'program' ? programFacts(a.program.manifest) : specFacts(a.spec)))].filter(Boolean))];

// The traces the reviewer reads: bounded numbers per capture, rounded; the plan's own quantities and readouts first.
function reviewTraces(captures, cases, plan) {
  const keep = new Set([...plan.scene.readoutIds, ...plan.scene.observations.flatMap(o => o.quantityIds)]);
  const pick = (q = {}) => Object.fromEntries(Object.entries(q).sort(([a], [b]) => (keep.has(b) - keep.has(a)) || a.localeCompare(b)).slice(0, 12).map(([k, v]) => [k, round6(v)]));
  return captures.map(c => ({ capture: c.caseId, label: cases.find(x => x.id === c.caseId)?.label, time: round6(c.trace.time), inputs: c.trace.inputs, quantities: pick(c.trace.quantities),
    ...(c.trace.texts?.length ? { texts: c.trace.texts.slice(0, 12).map(text => String(text).slice(0, 80)) } : {}), // the real page reports up to 24 texts of 160 characters; the pixels show the rest
    ...(c.supports && Object.keys(c.supports).length ? { supports: Object.fromEntries(Object.entries(c.supports).map(([id, s]) => [id, pick(s.trace?.quantities)])) } : {}) }));
}

// ---- failure kinds (INT-05-R04) ---------------------------------------------------------------------------------------------------
// build: a candidate the checks refuse (repairable); gap: the runtime cannot build the plan (a design correction, never a repair);
// provider: a model call failed or was refused (retried only through the job's own rules); unknown_outcome: a call ended without a known
// result (never resent here); render_outage: the capture service was unavailable (recapture, no model call, no correction round).
export function classifyFailure(error) {
  if (error instanceof RenderError) return ['render_unavailable', 'render_timeout', 'capture_timeout', 'fonts_missing'].includes(error.code) ? { kind: 'render_outage', retryable: true, code: error.code } : { kind: error.program ? 'build' : 'render', retryable: false, code: error.code };
  if (error instanceof InteractModelError) return error.code === 'unknown_outcome' ? { kind: 'unknown_outcome', retryable: false, code: error.code } : { kind: 'provider', retryable: false, code: error.code, sent: error.sent };
  if (error instanceof ReviewError) return { kind: error.code === 'payload_too_large' || error.code === 'split_required' ? 'incomplete' : 'provider', retryable: false, code: error.code };
  return { kind: 'unknown', retryable: false, code: error?.code ?? 'error' };
}
const cancelled = ctx => ctx.signal?.aborted === true;
const base64 = bytes => (typeof bytes === 'string' ? bytes : typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : btoa(String.fromCharCode(...bytes)));
const toImage = png => ({ media_type: 'image/png', data: base64(png) });

// checkRound(job, ctx) -> { status, ... } for ONE candidate that has validated artifacts and a composition.
//   job: { id, plan, planHash, capabilities, artifacts, composition, evidence?, oracle? }   ctx: callInteractRole's ctx plus captureCard.
//   ctx.captureCard({ jobId, composition, artifacts, cases }) -> [capture]   the seam to the trusted render entry that draws the complete card.
//   status: 'ready' (captured, checked and independently reviewed) | 'failed' (failure: { stage, problems, findings }) | 'render_unavailable' |
//   'incomplete' (required coverage does not fit; or the review cannot be sent whole) | 'cancelled'. Never 'ready' on anything partial.
//   ctx.completeCardUnavailable === true: the documented flag for a render service that cannot compose the card (see the ponytail above INTERACT_REVIEW_RULES).
// checkRound is captureAndCheck (capture, then the deterministic checks) followed by reviewCandidate (the independent review); a durable job runs the two as its
// rendering and reviewing stages, with its own persistence between them.
export async function checkRound(job, ctx) {
  const a = await captureAndCheck(job, ctx);
  return a.status === 'captured' ? reviewCandidate(job, ctx, a) : a;
}

// -> { status:'captured', cases, probes, captures, coverage, det, summary, pngs } | the early statuses of checkRound ('failed' with the deterministic problems, 'incomplete',
// 'render_unavailable', 'cancelled').
export async function captureAndCheck(job, ctx) {
  const { plan } = await approvedPlanOf(job);
  const { artifacts, composition } = job;
  if (cancelled(ctx)) return { status: 'cancelled' };
  // The candidate is what its composition says it is: a stale or swapped panel never reaches capture.
  const intact = await verifyComposition(composition, artifacts);
  if (intact.length) return { status: 'failed', failure: { stage: 'validate', problems: intact.map(p => `${p.path}: ${p.message}`), findings: [] } };
  const reviewRole = ctx.profile?.roles?.build_review, whole = Math.min(CHECK_LIMITS.maxCases, reviewRole?.maxImages ?? CHECK_LIMITS.maxCases);
  // A partial capture shows each supporting panel as one more image of the same review, so the main cases leave room for them.
  const limit = whole - (ctx.completeCardUnavailable === true ? plan.supportingVisuals.length : 0);
  const { cases, probes, coverage } = buildPlanCaptureCases(plan, composition, artifacts, { limit });
  if (coverage.problems.length) return { status: 'failed', failure: { stage: 'validate', problems: coverage.problems.map(p => `${p.path}: ${p.message}`), findings: [] } };
  if (coverage.incomplete) return { status: 'incomplete', reason: `the approved plan needs ${coverage.required} captures to be checked and one review takes ${limit}; revise the design with fewer checkpoints (nothing was dropped silently)`, coverage };
  if (typeof ctx.captureCard !== 'function') return { status: 'render_unavailable', reason: 'no capture service is wired; a card that was not captured cannot be accepted', coverage };

  let captures;
  const ranAt = clockMs();
  try { captures = await ctx.captureCard({ jobId: job.id, composition, artifacts, cases: [...cases, ...probes] }); }
  catch (error) {
    const kind = classifyFailure(error);
    if (kind.kind === 'render_outage') return { status: 'render_unavailable', reason: error.message, kind, coverage };
    if (kind.kind === 'build') return { status: 'failed', failure: { stage: 'render', problems: [`the program failed while rendering: ${clip(error.program?.diagnostic ?? error.message)}`], findings: [] }, kind, coverage };
    throw error;
  }
  if (cancelled(ctx)) return { status: 'cancelled' };
  const checkAt = clockMs();
  const det = checkSceneAgainstPlan({ plan, composition, artifacts, captures, cases, probes, oracle: job.oracle ?? null, allowPartialCard: ctx.completeCardUnavailable === true });
  const ms = { run: round1(checkAt - ranAt), check: round1(clockMs() - checkAt) }; // the ledger's msCheck (and the capture time kept beside it)
  const summary = captures.map(c => ({ caseId: c.caseId, sha256: c.sha256 ?? null, compositionHash: c.compositionHash, synthetic: c.synthetic === true }));
  const pngs = captures.map(c => ({ caseId: c.caseId, sha256: c.sha256 ?? null, bytes: c.png })); // the caller stores pixels by hash; the state keeps hashes only
  if (det.problems.length) return { status: 'failed', failure: { stage: 'check', problems: det.problems.map(p => `[${p.code}] ${p.message}`), findings: [], details: det.problems }, captures: summary, pngs, check: det.coverage, coverage, ms };
  return { status: 'captured', cases, probes, captures, coverage, det, summary, pngs, ms };
}

// reviewCandidate(job, ctx, captured) -> { status:'ready' | 'failed' | 'incomplete', ... } the independent review of captures that passed the deterministic checks.
export async function reviewCandidate(job, ctx, { cases, captures, coverage, det, summary, pngs }) {
  const { plan } = await approvedPlanOf(job);
  const { artifacts, composition } = job;
  const reviewRole = ctx.profile?.roles?.build_review, partial = ctx.completeCardUnavailable === true;
  const shown = captures.filter(c => cases.some(k => k.id === c.caseId)); // probes are trace-only: the reviewer is shown the planned cases
  // Partial capture: each supporting panel's real snapshot (its first captured state) is one more image, and the trusted layout is given as text.
  const panels = !partial ? [] : plan.supportingVisuals.flatMap(s => { const at = shown.find(c => c.supports?.[s.id]?.png); const got = at?.supports[s.id]; return got ? [{ id: s.id, title: s.title, got, time: 0, inputs: cases.find(k => k.id === at.caseId).supports.find(x => x.id === s.id).inputs, compositionHash: at.compositionHash }] : []; });
  // The independent reviewer sees only captures of THIS composition: reviewCaptures refuses any other compiledHash.
  const calls = [], shownIds = [...shown.map(c => ({ id: c.caseId })), ...panels.map(p => ({ id: `panel-${p.id}` }))];
  // A report the schema refuses (an invented category) or that skips a capture is asked for once more, naming the problem, instead of voiding the review (callWithCorrection).
  const callRole = async (_role, { system, tool, content }) => {
    const done = await callWithCorrection(ctx, 'build_review', { system, schema: lenientFindingText(tool.input_schema), input: content.filter(b => b.type === 'text').map(b => b.text).join('\n\n'),
      images: content.filter(b => b.type === 'image').map(b => ({ media_type: b.source.media_type, data: b.source.data })), name: tool.name, description: tool.description },
    { instruction: 'Your previous report was refused by the validator. Report again: one entry for EVERY capture shown, both verdicts, and only the allowed values.', check: output => reviewProblems(output, shownIds), onDone: d => calls.push(callRecord('build_review', d)) });
    return { input: done.output, identity: done.requested, usage: done.usage };
  };
  const main = artifacts.main.kind === 'program' ? artifacts.main.program : null;
  let review;
  try {
    review = await reviewCaptures({
      request: reviewRequest(plan, composition) + `

${captureListText(shown.flatMap(c => cases.filter(k => k.id === c.caseId)))}` + (partial ? `

${compositionLayoutText(plan, composition)}` : ''), compiledHash: composition.envelopeHash, facts: factsOf(plan, artifacts), evidence: job.evidence || [],
      captures: [...shown.map(c => { const k = cases.find(x => x.id === c.caseId); return { id: c.caseId, compiledHash: c.compositionHash, theme: 'light', time: k.time, inputs: k.inputs, events: k.events, step: k.label, png: c.png, ...(c.data ? { data: c.data } : {}) }; }),
        ...panels.map(p => ({ id: `panel-${p.id}`, compiledHash: p.compositionHash, theme: 'light', time: p.time, inputs: p.inputs, step: `supporting panel "${p.title}", a read-only snapshot`, png: p.got.png }))],
      ...(main ? { program: { manifest: main.manifest, source: main.source, traces: [...reviewTraces(shown, cases, plan), ...panels.map(p => ({ capture: `panel-${p.id}`, label: p.title, time: 0, inputs: p.inputs, quantities: Object.fromEntries(Object.entries(p.got.trace?.quantities ?? {}).slice(0, 12).map(([k, v]) => [k, round6(v)])) }))],
        coverage: { sampled: [...cases.map(c => c.id), ...panels.map(p => `panel-${p.id}`)], omitted: coverage.omitted.map(o => o.id) } } } : {}),
    }, { callRole, extraSystem: partial ? INTERACT_REVIEW_RULES_PARTIAL : INTERACT_REVIEW_RULES, limits: { ...REVIEW_LIMITS, maxImages: reviewRole?.maxImages ?? REVIEW_LIMITS.maxImages, traceBytes: TRACE_BYTES } });
  } catch (error) {
    const kind = classifyFailure(error);
    if (kind.kind === 'incomplete') return { status: 'incomplete', reason: error.message, kind, captures: summary, coverage, calls };
    throw Object.assign(error, { calls });
  }
  const all = review.captures.flatMap(c => c.findings);
  let findings = all.filter(f => f.severity !== 'minor');
  // A rejection must leave the repairer something to act on: a live run was refused (accepted false) with only minor findings or none, so the repair returned "none" (no_progress).
  if (!review.accepted && !findings.length) findings = all.length ? all : review.captures.filter(c => c.semantic !== 'pass' || c.visual !== 'pass').map(c => ({ category: 'spec', severity: 'major', target: { capture: c.captureId }, message: `The review marked this capture ${c.semantic !== 'pass' ? 'semantic' : 'visual'}: fail without naming a finding; check its layout and numbers and fix what is wrong.` }));
  if (!review.accepted) return { status: 'failed', failure: { stage: 'review', problems: [], findings: findings.map(({ category, severity, target, message }) => ({ category, severity, target, message: clip(message) })) }, review: { accepted: false, captures: review.captures }, captures: summary, pngs, check: det.coverage, coverage, calls };
  return { status: 'ready', review: { accepted: true, captures: review.captures }, captures: summary, pngs, check: det.coverage, coverage, calls };
}

// repairRound(job, ctx) -> one build_repair call and the same trusted validation a first build gets.
//   job: checkRound's plus { draft, failure: { stage, problems, findings }, round, captures? ([{ caseId, png|data }], the failing ones) }.
//   status: 'repaired' (new validated artifacts + composition: recapture and re-review them) | 'repaired_invalid' (the reply failed validation;
//   its problems are the next failure) | 'no_progress' (none, or nothing changed: terminal) | 'gap' | 'exhausted' (no rounds left; no call made) | 'cancelled'.
export async function repairRound(job, ctx) {
  const { plan, hash } = await approvedPlanOf(job);
  const round = job.round ?? 0;
  if (cancelled(ctx)) return { status: 'cancelled' };
  if (round >= CHECK_LIMITS.correctionRounds) return { status: 'exhausted', reason: `${CHECK_LIMITS.correctionRounds} correction rounds were used` };
  const failure = job.failure ?? { problems: [], findings: [] };
  const named = new Set((failure.findings || []).map(f => f.target?.capture).filter(Boolean));
  const roleCaps = ctx.profile?.roles?.build_repair, imageLimit = roleCaps?.maxImages ?? 2;
  // Pixels go to the repair only when there are some and the role reads images: INTERACT_RUN=headless has none (the traces and frames in the failure text are what it sends), and a text-only
  // fast role (maxImages 0) drops them with one logged line instead of refusing the call.
  const pixelCaptures = ctx.env?.INTERACT_RUN === 'headless' ? [] : (job.captures || []).filter(c => named.has(c.caseId) && (c.png || c.data));
  if (pixelCaptures.length && imageLimit === 0) console.log(JSON.stringify({ event: 'repair_images_dropped', job: job.id, role: 'build_repair', dropped: pixelCaptures.length, reason: 'the role is text-only' }));
  const images = pixelCaptures.slice(0, imageLimit).map(c => toImage(c.data ?? c.png));
  const rank = f => (f.severity === 'blocker' ? 0 : f.severity === 'major' ? 1 : 2);
  const input = {
    ...buildInput(job, plan, hash), failure: { stage: failure.stage, problems: (failure.problems || []).slice(0, REPAIR_FORWARD.problems).map(p => clip(p)),
      findings: [...(failure.findings || [])].sort((a, b) => rank(a) - rank(b)).slice(0, REPAIR_FORWARD.findings).map(f => ({ category: f.category, severity: f.severity, target: f.target, message: clip(f.message) })) },
    currentArtifacts: draftView(job.draft), roundsLeft: CHECK_LIMITS.correctionRounds - round,
  };
  let done;
  try { done = await callWithCorrection(ctx, 'build_repair', { system: INTERACT_REPAIR_SYSTEM, schema: interactRepairTool(schemaOptions(plan)).input_schema, input, images, name: INTERACT_REPAIR_TOOL_NAME, description: 'Correct the failed card.' },
    { instruction: 'Your previous repair reply was refused by the validator. Return the WHOLE corrected reply (operation and every panel) and change only what these problems name. Respect every limit in the instructions.' }); }
  catch (error) {
    if (!correctable(error)) throw error;
    // Refused even after the correction: this round is spent, but the job is not lost. The failure the repair has to answer is kept, with the refusal added, and the candidate stays what it was.
    const refusal = `the previous repair reply was refused by the validator, even after one correction (${refusalProblems(error).slice(0, 3).join('; ')}); return the whole corrected artifacts`;
    return { status: 'repaired_invalid', draft: job.draft, failure: { stage: failure.stage ?? 'validate', problems: [refusal, ...(failure.problems || [])], findings: failure.findings || [] }, round: round + 1 };
  }
  const call = callRecord('build_repair', done), out = done.output;
  if (out.operation !== 'artifacts' || !plain(out.main) || !Array.isArray(out.supporting)) return { status: 'no_progress', reason: clip(out.reason ?? 'the repair returned no artifacts'), call, round: round + 1 };
  const draft = { main: out.main, supporting: out.supporting };
  if (canonicalJson(normalize(draft)) === canonicalJson(normalize(job.draft))) return { status: 'no_progress', reason: 'the repair changed nothing', call, round: round + 1 };
  const result = await validateBuildOutput(job, draft, ctx);
  if (result.gap) return { status: 'gap', gap: result.gap, draft, call, round: round + 1 };
  if (result.problems) return { status: 'repaired_invalid', draft, failure: { stage: 'validate', problems: result.problems, findings: [], details: result.details }, call, round: round + 1 };
  return { status: 'repaired', draft, artifacts: result.artifacts, composition: result.composition, call, round: round + 1 };
}
// A reply that left out a part (the schema only requires kind) is a draft with a hole; the repair step reads the hole as nothing and the validator names it.
const panelsOf = draft => (Array.isArray(draft?.supporting) ? draft.supporting : []);
const normalize = draft => ({ main: draft?.main, supporting: [...panelsOf(draft)].sort((a, b) => String(a?.id).localeCompare(String(b?.id))) });
// What the repair role reads of the current candidate: manifests and sources (untrusted text) or specs, never hashes it could copy.
const draftView = draft => ({ main: viewOf(draft?.main), supporting: panelsOf(draft).map(s => ({ id: s?.id, artifact: viewOf(s?.artifact) })) });
const viewOf = a => (a?.kind === 'program' ? { kind: 'program', manifest: a.program.manifest, source: a.program.source } : a);

// ---- the headless run: the capture seam without a browser (INTERACT_RUN=headless; interact-job.js picks it) --------------------------------------------------------------
// headlessCaptureCard(env, { limits }) -> the same seam as captureCardFor(env): ({ composition, artifacts, cases }) -> one capture per case, { caseId, compositionHash, completeCard, bundleHash, trace, supports }.
// The sealed programs run in the pinned QuickJS engine in this process (runtime.js, the engine the card and the review browser use): the main program at each case's elapsed
// time and inputs through the card's own request builder, each supporting panel's read-only snapshot through the player's snapshot resolver. The trace is what the checks read
// (quantities, readouts, drawn texts, the objects the overlap check measures, a hash of the frame). There are NO pixels: synthetic: true, no png, no key, sha256 null, and
// completeCard false (nothing composed the card), so a review that needs pixels cannot run on these captures. env is not read yet (captureCardFor takes it for the render bindings).
// A Worker cannot fetch the engine's .wasm by URL: dev-worker.js (which app-worker.js re-exports) imports it by relative path
// (./node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm, a compiled WebAssembly.Module under wrangler's default rules; the package-export form '/wasm' does not
// bundle) and hands it over here once with provideEngineWasm. Node (the tests, the scripts) loads the engine itself and needs nothing.
let engine = null, engineWasm;
export const provideEngineWasm = wasmModule => { engineWasm = wasmModule; };
export function headlessCaptureCard(_env, { limits } = {}) {
  return async ({ composition, artifacts, cases }) => {
    const [{ loadEngine, runProgram }, { LIMITS }] = await Promise.all([import('../../web/src/explain-program/runtime.js'), import('../../web/src/explain-program/limits.js')]);
    engine ??= await loadEngine(undefined, engineWasm);
    const run = async (artifact, inputs, time) => {
      const program = artifact.program, request = { requestId: '1', inputs, time, seed: 0, state: null };
      const out = runProgram(engine, { source: program.source, request, sdkVersion: program.sdkVersion }, limits ?? LIMITS);
      if (!out.ok) return { error: { code: out.code, diagnostic: out.detail } };
      const parsed = fitGuestLabels(parseGuestResult(out.value, program.manifest, program.sdkVersion), program.sdkVersion);
      if (!parsed.ok) return { error: { code: parsed.error.code, diagnostic: parsed.issue } };
      const { frame, quantities } = parsed.value;
      return { quantities, readouts: Object.fromEntries(frame.readouts.map(r => [r.id, r.value])), texts: frame.objects.filter(o => o.kind === 'text' && o.text).map(o => o.text), objects: traceObjects(frame.objects), frame: traceFrame(frame), frameHash: await sha256Hex(canonicalJson(frame.objects)), ...(parsed.fitted?.length ? { fitted: parsed.fitted } : {}), inputs, time };
    };
    const supportOf = id => artifacts.supporting.find(s => s.id === id).artifact;
    const resolver = createSnapshotResolver({ evaluate: ({ panelId, inputs, time }) => run(supportOf(panelId), resolveInputs(supportOf(panelId).program.manifest, inputs), time) });
    const captures = [];
    for (const c of cases) {
      const request = evaluateRequestFor(artifacts.main.program.manifest, { inputs: c.inputs }, c.time, 1, null, composition);
      const trace = await run(artifacts.main, request.inputs, request.time);
      const snapshots = await resolver.resolve(composition, c.inputs);
      const supports = Object.fromEntries(snapshots.snapshots.map(s => [s.id, { bundleHash: supportOf(s.id).program.bundleHash, trace: s.frame, synthetic: true }]));
      captures.push({ caseId: c.id, sha256: null, compositionHash: composition.envelopeHash, completeCard: false, synthetic: true, bundleHash: artifacts.main.program.bundleHash, trace: trace.error ? { error: trace.error } : trace, supports });
    }
    return captures;
  };
}
