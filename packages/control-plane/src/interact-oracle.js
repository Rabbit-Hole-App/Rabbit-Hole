// Trusted expected values for the /interact numerical checks (INT-05, docs/features/interact.md section 7 "Canonical toss-and-drop acceptance").
// Computed here from the equations, never from a model and never from the builder's prose:
//   y = u t - g t^2 / 2, v = u - g t, a = -g, apex at u / g, return at 2 u / g.
// An oracle exists only for a plan that IS the canonical Standard toss-and-drop (launch speed 3.0 m/s and g 9.8 m/s^2 fixed, timed, program renderer, no
// adjustable input): for any other plan this returns null and the checks say so (coverage.oracle.note); a plan is never matched by guessing.
// Only the names the checks already REQUIRE the program to report are expected (observation quantities that are not fixed values, and the scene's readouts),
// at the instants of the plan's own checkpoints, its start and its endpoint. Absolute tolerance 1e-6, as the fixture oracle (interact-build-fixtures.js).
// shortcut: two canonical cases (Standard and Deep). The benchmark corpus (INT-08) is a later item; add a case here with its equations, not a lookup of answers.
import { evalScalar } from '../../web/src/interact-plan.js';
import { canonicalJson } from '../../web/src/explain-contract.js';
import { FAMILY, expandBrief, extractBrief, referenceValue } from '../../web/src/interact-plan-brief.js';
import { curveLogisticOracle } from './interact-curve-oracle.js';

const G = 9.8, U = 3, TOL = 1e-6;
const SUPPORT_MOMENTS = { velocityBefore: -0.1, velocityTop: 0, velocityAfter: 0.1 }; // seconds from the apex

export function standardTossDropOracle(plan) {
  if (plan?.depth !== 'balanced' || plan.mode.kind !== 'time' || plan.scene.runtime.renderer !== 'program' || !plan.mode.timeline) return null;
  const fixed = plan.mode.fixedValues;
  if (fixed.launchSpeed !== U || fixed.gravity !== G || plan.mode.adjustableIds.length || plan.controls.some(c => c.binding.kind === 'input')) return null;
  let end;
  try { end = evalScalar(plan.mode.timeline.end, {}, {}); } catch { return null; }
  if (Math.abs(end - 2 * U / G) > 1e-9) return null; // the canonical flight: launch to return
  const at = t => ({ velocity: U - G * t, acceleration: -G });
  const byName = t => { const a = at(t); return { velocity: a.velocity, tossedVelocity: a.velocity, acceleration: a.acceleration, tossedAcceleration: a.acceleration }; };
  const required = new Set([...plan.scene.observations.flatMap(o => o.quantityIds).filter(q => !(q in fixed)), ...plan.scene.readoutIds]);
  const cases = { start: 0, end, ...Object.fromEntries(plan.scene.checkpoints.map(cp => [`cp-${cp.id}`, cp.time ? evalScalar(cp.time, {}, {}) : 0])) };
  const expect = [];
  for (const [id, t] of Object.entries(cases)) for (const [name, expected] of Object.entries(byName(t))) if (required.has(name)) expect.push({ case: id, panel: 'main', name, expected, tol: TOL });
  for (const s of plan.supportingVisuals) {
    for (const [name, offset] of Object.entries(SUPPORT_MOMENTS)) if (s.readoutIds.includes(name)) expect.push({ case: 'start', panel: s.id, name, expected: at(U / G + offset).velocity, tol: TOL });
  }
  return expect.length ? { id: 'toss-drop-standard', expect } : null;
}

// ---- Deep / Experiment (section 7): launch speed u in 3.0..5.0 m/s (default 5.0, step 0.1), the reference throw fixed at 3.0 m/s ----------------------
// Return time 2u/g, apex time u/g, peak height u^2/(2g). The main scene reports flightTime/trialTime = 2u/g and peakHeight/trialPeak = u^2/(2g) at every
// instant; the apex-relative support comparison shows each ball g * 0.1^2 / 2 = 0.049 m below its own top 0.10 s from it (the 0.20 s window), at any u.
// Like the Standard oracle it exists only for a plan that IS the canonical Deep (a timed program, one adjustable launchSpeed number input 3.0..5.0,
// the fixed reference speed and gravity, an endpoint of 2u/g over the whole range and no displayed offset), never by guessing, and covers only the names
// the plan requires. Case ids and their input states are the ones buildPlanCaptureCases makes: start, cp-<id>, end, bound-/probe-<control>-min|max.
const REFERENCE_U = 3, WINDOW = 0.1;

export function deepTossDropOracle(plan) {
  if (plan?.depth !== 'detailed' || plan.mode.kind !== 'experiment' || plan.scene.runtime.renderer !== 'program' || !plan.mode.timeline) return null;
  const fixed = plan.mode.fixedValues, speed = plan.controls.find(c => c.type === 'number' && c.binding.kind === 'input' && c.binding.id === 'launchSpeed');
  if (!speed || speed.min !== 3 || speed.max !== 5 || fixed.gravity !== G || fixed.referenceLaunchSpeed !== REFERENCE_U || plan.mode.adjustableIds.join() !== 'launchSpeed') return null;
  const domains = { launchSpeed: [speed.min, speed.max] }, at = (expr, u) => evalScalar(expr, { launchSpeed: u }, domains);
  try {
    for (const u of [3, 3.7, 5]) if (Math.abs(at(plan.mode.timeline.end, u) - 2 * u / G) > 1e-9 || Math.abs(at(plan.mode.timeline.displayOffset, u)) > 1e-12) return null; // 2u/g, Time since launch
  } catch { return null; }
  const main = u => ({ flightTime: 2 * u / G, trialTime: 2 * u / G, peakHeight: u * u / (2 * G), trialPeak: u * u / (2 * G), launchSpeed: u });
  const offset = G * WINDOW ** 2 / 2, compare = u => ({ referenceOffset: offset, trialOffset: offset, referencePeak: REFERENCE_U ** 2 / (2 * G), trialPeak: u * u / (2 * G) });
  const required = new Set([...plan.scene.observations.flatMap(o => o.quantityIds).filter(q => !(q in fixed)), ...plan.scene.readoutIds]);
  const inputsOf = { start: speed.default, end: speed.default, [`bound-${speed.id}-min`]: speed.min, [`bound-${speed.id}-max`]: speed.max, [`probe-${speed.id}-min`]: speed.min, [`probe-${speed.id}-max`]: speed.max };
  for (const cp of plan.scene.checkpoints) inputsOf[`cp-${cp.id}`] = cp.inputOverrides.launchSpeed ?? speed.default;
  const expect = [];
  for (const [id, u] of Object.entries(inputsOf)) {
    for (const [name, expected] of Object.entries(main(u))) if (required.has(name)) expect.push({ case: id, panel: 'main', name, expected, tol: TOL });
    for (const s of plan.supportingVisuals) {
      const bound = s.parameterBindings.some(b => b.fromInputId === 'launchSpeed');
      if (bound) for (const [name, expected] of Object.entries(compare(u))) if (s.readoutIds.includes(name)) expect.push({ case: id, panel: s.id, name, expected, tol: TOL });
    }
  }
  return expect.length ? { id: 'toss-drop-deep', expect } : null;
}

// ---- Overview / Static (section 7): a tossed ball at its top and a ball just released, both at one height with zero velocity --------------------------------
// After 0.10 s each has moved g * 0.1^2 / 2 = 0.049 m down. A static scene is one state (case id 'default'; the plan's checkpoints have no time, so they are aliases of it).
// Exists only for the plan that IS this Overview (a program scene, static, no controls, gravity fixed at 9.8).
export function overviewDropOracle(plan) {
  if (plan?.depth !== 'brief' || plan.mode.kind !== 'static' || plan.scene.runtime.renderer !== 'program' || plan.mode.timeline || plan.controls.length || plan.mode.adjustableIds.length) return null;
  if (plan.mode.fixedValues.gravity !== G || !plan.scene.quantities.some(q => q.id === 'drop')) return null;
  const drop = G * WINDOW ** 2 / 2, values = { drop, dropReadout: drop };
  const required = new Set([...plan.scene.observations.flatMap(o => o.quantityIds).filter(q => !(q in plan.mode.fixedValues)), ...plan.scene.readoutIds]);
  const expect = Object.entries(values).filter(([name]) => required.has(name)).map(([name, expected]) => ({ case: 'default', panel: 'main', name, expected, tol: TOL }));
  return expect.length ? { id: 'toss-drop-overview', expect } : null;
}

// ---- A different subject: the period of a simple pendulum (small swings), T = 2 pi sqrt(L / g) ------------------------------------------------------------------
// An untimed Experiment with one adjustable input, 'length' in metres, and gravity fixed at 9.8. Case ids as buildPlanCaptureCases makes them for an untimed scene:
// default, cp-<id>, bound-/probe-<control>-min|max. Exists only for a plan that IS this pendulum, never by guessing.
export function pendulumPeriodOracle(plan) {
  const length = plan?.controls.find(c => c.type === 'number' && c.binding.kind === 'input' && c.binding.id === 'length');
  if (!length || plan.mode.kind !== 'experiment' || plan.mode.timeline || plan.scene.runtime.renderer !== 'program' || plan.mode.fixedValues.gravity !== G || plan.mode.adjustableIds.join() !== 'length') return null;
  if (!plan.scene.quantities.some(q => q.id === 'period')) return null;
  const period = L => 2 * Math.PI * Math.sqrt(L / G), required = new Set([...plan.scene.observations.flatMap(o => o.quantityIds).filter(q => !(q in plan.mode.fixedValues)), ...plan.scene.readoutIds]);
  const lengths = { default: length.default, [`bound-${length.id}-min`]: length.min, [`bound-${length.id}-max`]: length.max, [`probe-${length.id}-min`]: length.min, [`probe-${length.id}-max`]: length.max };
  for (const cp of plan.scene.checkpoints) lengths[`cp-${cp.id}`] = cp.inputOverrides.length ?? length.default;
  const expect = Object.entries(lengths).flatMap(([id, L]) => Object.entries({ period: period(L), periodReadout: period(L) }).filter(([name]) => required.has(name)).map(([name, expected]) => ({ case: id, panel: 'main', name, expected, tol: TOL })));
  return expect.length ? { id: 'pendulum-period', expect } : null;
}

// ---- The three reference toss-and-drop cards (owner 2026-11-13): toss-overview, toss-standard, toss-deep -------------------------------------------------------
// Interact cards with one program frame and launch speed u (2.0-5.0, default 4.0), plus gravity g (6.0-12.0, default 9.8; fixed 9.8 on the Overview) and mass m (0.2-3.0,
// default 1.0, Deep). t is elapsed time from launch: y = u t - g t^2 / 2, v = u - g t, a = -g, top at u / g, return at 2 u / g, F = m g.
// Standard: the second ball is held at the top height until the top (tau = t - u / g), then equals the tossed ball: v = -g tau, a = -g. Its acceleration AT tau = 0 is
// left out (a builder may switch the gate at tau = 0 or just after); every other instant is exact. State readouts (Moving up, Held in place, ...) are text, judged by the
// rendered review, never here. Case ids and their input states mirror buildPlanCaptureCases: start, cp-<id>, end, bound-<control>-min|max (a boundary is captured at the first
// checkpoint whose time references that input, else at the end). An oracle exists only for a plan that IS the reference card: its controls, ranges, timeline arithmetic and
// pause markers are checked against the equations first, and any difference returns null (never matched by guessing).
const REF = { speed: [2, 5, 4], gravity: [6, 12, 9.8], mass: [0.2, 3, 1] };
const NEAR = 1e-9;

// loose (brief 11, the design bench): any ranges and the plan's own fixed gravity instead of the reference card's; the structural arithmetic (end at 2 top, display offset, pauses, 0.2x) is still checked.
function tossReference(plan, depth, { gravity, mass, offset }, loose = false) {
  if (plan?.depth !== depth || plan.mode.kind !== 'experiment' || plan.scene.runtime.renderer !== 'program' || !plan.mode.timeline || plan.supportingVisuals.length) return null;
  const numbers = plan.controls.filter(c => c.type === 'number' && c.binding.kind === 'input'), tl = plan.mode.timeline;
  const control = (name, [min, max, def]) => numbers.find(c => c.binding.id === name && (loose ? c.step > 0 : c.min === min && c.max === max && c.default === def && Math.abs(c.step - 0.1) < 1e-9));
  const speed = control('launchSpeed', REF.speed), g = gravity && control('gravity', REF.gravity), m = mass && control('mass', REF.mass);
  if (!speed || (gravity && !g) || (mass && !m) || numbers.length !== 1 + !!gravity + !!mass) return null;
  const fixedG = loose ? plan.mode.fixedValues.gravity : G;
  if (!gravity && !(fixedG > 0 && fixedG === plan.mode.fixedValues.gravity)) return null;
  const inputControls = [speed, g, m].filter(Boolean), defaults = Object.fromEntries(inputControls.map(c => [c.binding.id, c.default])), domains = Object.fromEntries(inputControls.map(c => [c.binding.id, [c.min, c.max]]));
  const at = (expr, inputs) => evalScalar(expr, inputs, domains), gOf = inputs => (gravity ? inputs.gravity : fixedG);
  try {
    const [sMin, sMax] = loose ? [speed.min, speed.max] : [2, 5], [gLow, gHigh] = loose && g ? [g.min, g.max] : [6, 12];
    for (const inputs of [defaults, { ...defaults, launchSpeed: sMax, ...(gravity ? { gravity: gLow } : {}) }, { ...defaults, launchSpeed: sMin, ...(gravity ? { gravity: gHigh } : {}) }]) {
      const u = inputs.launchSpeed, top = u / gOf(inputs);
      if (Math.abs(at(tl.end, inputs) - 2 * top) > NEAR || Math.abs(at(tl.displayOffset, inputs) - offset * top) > NEAR || Math.abs(tl.playbackRate - 0.2) > NEAR) return null;
      const pauses = tl.markers.filter(k => k.pause).map(k => at(k.time, inputs)).sort((a, b) => a - b), want = depth === 'brief' ? [top] : [top - 0.1, top, top + 0.1];
      if (pauses.length !== want.length || pauses.some((t, i) => Math.abs(t - want[i]) > NEAR)) return null;
    }
  } catch { return null; }
  return { inputControls, defaults, at, gOf, tl };
}

// The plan's case ids with their inputs and elapsed time, as buildPlanCaptureCases keys them.
function tossCases(plan, { inputControls, defaults, at, tl }) {
  const refs = (e, id) => !!e && (e.op === 'input' ? e.id === id : e.op !== 'literal' && (refs(e.left, id) || refs(e.right, id)));
  const cases = { start: [defaults, 0], end: [defaults, at(tl.end, defaults)] };
  for (const cp of plan.scene.checkpoints) { const inputs = { ...defaults, ...cp.inputOverrides }; cases[`cp-${cp.id}`] = [inputs, cp.time ? at(cp.time, inputs) : 0]; }
  for (const c of inputControls) {
    const anchor = plan.scene.checkpoints.find(cp => refs(cp.time, c.binding.id));
    for (const [tag, v] of [['min', c.min], ['max', c.max]]) { const inputs = { ...defaults, ...(anchor?.inputOverrides ?? {}), [c.binding.id]: v }; cases[`bound-${c.id}-${tag}`] = [inputs, anchor ? at(anchor.time, inputs) : at(tl.end, inputs)]; }
  }
  return cases;
}

// The toss plan's cases as { caseId: [inputs, elapsedSeconds] } (the ones its oracle's rows are keyed by), or null when the plan is not one of the three toss plans. bench-expressions.mjs evaluates a model's expressions at them.
export function tossCasesOf(plan) {
  const options = { brief: { gravity: false, mass: false, offset: 0 }, balanced: { gravity: true, mass: false, offset: -1 }, detailed: { gravity: true, mass: true, offset: 0 } }[plan?.depth];
  const ref = (options && tossReference(plan, plan.depth, options)) || ledgeReference(plan) || familyReference(plan);
  return ref ? { cases: tossCases(plan, ref), domains: Object.fromEntries(ref.inputControls.map(c => [c.binding.id, [c.min, c.max]])) } : null;
}

// Arrow directions (y grows downward on the screen; sdk.vector's `direction` names the POSITIVE axis and `value` is signed along it, so a negative acceleration drawn with direction "up" points down).
// The acceleration and the force always point down. The velocity arrow points up before the top, is absent at it, and points down after; within 0.1 m/s of zero it may be missing (the card hides an arrow
// under its minimum length).
const WHY = { v: 'velocity points up before the top, is zero at the top and points down after it', a: 'the acceleration is -g, so its arrow always points down (direction names the positive axis, value is signed along it)', F: 'the force is m g downward, so its arrow always points down' };
const velocityDir = v => Math.abs(v) < NEAR ? 'none' : Math.abs(v) < 0.1 ? `${v > 0 ? 'up' : 'down'}-or-none` : v > 0 ? 'up' : 'down';

function tossOracle(plan, id, ref, values, arrows = () => []) {
  const required = new Set([...plan.scene.observations.flatMap(o => o.quantityIds).filter(q => !(q in plan.mode.fixedValues)), ...plan.scene.readoutIds]);
  const expect = [], directions = [];
  for (const [caseId, [inputs, t]] of Object.entries(tossCases(plan, ref))) {
    const g = ref.gOf(inputs), u = inputs.launchSpeed, top = u / g, tau = t - top;
    for (const [objectId, dir, quantity] of arrows({ velocity: u - g * t, tau, g })) directions.push({ case: caseId, id: objectId, dir, why: WHY[quantity] });
    for (const [name, expected] of Object.entries(values({ u, g, m: inputs.mass ?? 1, t, tau, top, peak: u * u / (2 * g), height: Math.max(0, u * t - g * t * t / 2), velocity: u - g * t }))) if (required.has(name) && expected !== undefined) expect.push({ case: caseId, panel: 'main', name, expected, tol: TOL });
  }
  return expect.length || directions.length ? { id, expect, arrows: directions } : null;
}

// The arrow rule of each depth (the rows the three reference oracles carry), shared with the family oracle below.
const ARROWS = {
  brief: v => [['vec.v', velocityDir(v.velocity), 'v'], ['vec.a', 'down', 'a']],
  balanced: v => [['vec.v.toss', velocityDir(v.velocity), 'v'], ['vec.a.toss', 'down', 'a'], ['vec.v.drop', velocityDir(v.tau > 0 ? -v.g * v.tau : 0), 'v'], ['vec.a.drop', 'down-or-none', 'a']],
  detailed: v => [['vec.v', velocityDir(v.velocity), 'v'], ['vec.a', 'down', 'a'], ['vec.F', 'down-or-none', 'F']],
};
const LOOSE_OPTIONS = { brief: { gravity: false, mass: false, offset: 0 }, balanced: { gravity: true, mass: false, offset: -1 }, detailed: { gravity: true, mass: true, offset: 0 } };

// brief 11 (the design bench): the arrow-direction rule for ANY plan of the vertical-throw family at its depth (own ranges, own fixed gravity); no numeric rows (the formula check owns the physics). null off the family.
export function verticalThrowArrowOracle(plan) {
  const options = LOOSE_OPTIONS[plan?.depth], ref = options && tossReference(plan, plan.depth, options, true);
  return ref && tossOracle(plan, `vertical-throw-${plan.depth}`, ref, () => ({}), ARROWS[plan.depth]);
}

export function tossOverviewOracle(plan) {
  const ref = tossReference(plan, 'brief', { gravity: false, mass: false, offset: 0 });
  return ref && tossOracle(plan, 'toss-overview', ref, v => ({ velocity: v.velocity, height: v.height, apexTime: v.top, apexHeight: v.peak, launchSpeed: v.u }), v => [['vec.v', velocityDir(v.velocity), 'v'], ['vec.a', 'down', 'a']]);
}

export function tossStandardOracle(plan) {
  const ref = tossReference(plan, 'balanced', { gravity: true, mass: false, offset: -1 });
  const released = v => v.tau >= -NEAR;
  return ref && tossOracle(plan, 'toss-standard', ref, v => ({
    tossedVelocity: v.velocity, tossedAcceleration: -v.g, tossedHeight: v.height, apexTime: v.top, apexHeight: v.peak, launchSpeed: v.u, gravity: v.g,
    dropVelocity: released(v) ? -v.g * Math.max(0, v.tau) : 0, dropHeight: released(v) ? v.height : v.peak,
    dropAcceleration: Math.abs(v.tau) < NEAR ? undefined : v.tau > 0 ? -v.g : 0,
  }), v => [['vec.v.toss', velocityDir(v.velocity), 'v'], ['vec.a.toss', 'down', 'a'], ['vec.v.drop', velocityDir(v.tau > 0 ? -v.g * v.tau : 0), 'v'], ['vec.a.drop', 'down-or-none', 'a']]);
}

export function tossDeepOracle(plan) {
  const ref = tossReference(plan, 'detailed', { gravity: true, mass: true, offset: 0 });
  return ref && tossOracle(plan, 'toss-deep', ref, v => ({ height: v.height, velocity: v.velocity, acceleration: -v.g, force: v.m * v.g, apexTime: v.top, apexHeight: v.peak, launchSpeed: v.u, gravity: v.g, mass: v.m }), v => [['vec.v', velocityDir(v.velocity), 'v'], ['vec.a', 'down', 'a'], ['vec.F', 'down-or-none', 'F']]);
}

// ---- The fourth plan, ledge-toss-moon (brief 7 section 5): a ball thrown up from a 1.0 m ledge on the Moon -------------------------------------------------------------------------
// Height is measured from the ground, so the ledge is at 1.0 m: y = 1 + u t - g t^2 / 2, v = u - g t, a = -g with g = 1.62 fixed, launch speed u in 1.0..3.0 (default 2.0, step 0.1), the top at
// u / g and the flight ends back at ledge height at 2 u / g; one pause marker, at the top. Like the toss references it exists only for a plan that IS this one (never by guessing).
const MOON = 1.62, LEDGE = 1;

function ledgeReference(plan) {
  if (plan?.depth !== 'brief' || plan.mode.kind !== 'experiment' || plan.scene.runtime.renderer !== 'program' || !plan.mode.timeline || plan.supportingVisuals.length) return null;
  const numbers = plan.controls.filter(c => c.type === 'number' && c.binding.kind === 'input'), tl = plan.mode.timeline;
  const speed = numbers.find(c => c.binding.id === 'launchSpeed' && c.min === 1 && c.max === 3 && c.default === 2 && Math.abs(c.step - 0.1) < 1e-9);
  if (!speed || numbers.length !== 1 || plan.mode.fixedValues.gravity !== MOON) return null;
  const defaults = { launchSpeed: speed.default }, domains = { launchSpeed: [speed.min, speed.max] }, at = (expr, inputs) => evalScalar(expr, inputs, domains);
  try {
    for (const u of [2, 1, 3]) {
      const inputs = { launchSpeed: u }, top = u / MOON, pauses = tl.markers.filter(k => k.pause).map(k => at(k.time, inputs));
      if (Math.abs(at(tl.end, inputs) - 2 * top) > NEAR || Math.abs(at(tl.displayOffset, inputs)) > NEAR || pauses.length !== 1 || Math.abs(pauses[0] - top) > NEAR) return null;
    }
  } catch { return null; }
  return { inputControls: [speed], defaults, at, gOf: () => MOON, tl };
}

export function ledgeMoonOracle(plan) {
  const ref = ledgeReference(plan);
  return ref && tossOracle(plan, 'ledge-toss-moon', ref, v => ({ velocity: v.velocity, height: LEDGE + v.u * v.t - v.g * v.t * v.t / 2, acceleration: -v.g, apexTime: v.top, apexHeight: LEDGE + v.peak, launchSpeed: v.u, gravity: v.g }), v => [['vec.v', velocityDir(v.velocity), 'v'], ['vec.a', 'down', 'a']]);
}

// ---- The vertical-throw family (brief 11, the design MVP): a plan a model wrote as a plan brief and the code expanded (interact-plan-brief.js) -----------------------------------------------------
// Its oracle is the reference physics at the plan's OWN ranges (height = h0 + u t - g t^2 / 2, v = u - g t, a = -g, force = m g, the apex pair, the second ball held then falling from the top), plus the arrow rule the
// toss oracles apply. It exists only for a plan that IS a family expansion: the plan's brief, expanded again, must give the same controls, quantities, slots, words, checkpoints and timeline (the playback rate
// aside), never matched by guessing. The oracle id is toss-mvp-<depth>, so the ledger names the card.
const familyShape = plan => canonicalJson({
  depth: plan.depth, template: plan.scene.template, slots: plan.scene.slots, words: plan.scene.words, readoutIds: plan.scene.readoutIds, fixed: plan.mode.fixedValues, controls: plan.controls,
  checkpoints: plan.scene.checkpoints.map(c => [c.id, c.time, c.inputOverrides]), timeline: { ...plan.mode.timeline, playbackRate: 0 },
  quantities: plan.scene.quantities.map(q => [q.id, q.formula ?? (['launchSpeed', 'gravity', 'mass'].includes(q.id) ? q.id : undefined), q.switchAt, q.formulaAfter, q.unit]), // no labels: wording is not physics (the first picked plans carry an older gravity label)
});

function familyReference(plan) {
  const family = FAMILY.depths[plan?.depth];
  if (!family || plan.mode?.kind !== 'experiment' || plan.scene?.template !== family.template || plan.scene.runtime?.renderer !== 'program' || !plan.mode.timeline || plan.supportingVisuals?.length) return null;
  let brief;
  try { brief = extractBrief(plan); if (familyShape(expandBrief(brief, plan.depth, { catalogueHash: plan.scene.runtime.catalogueHash })) !== familyShape(plan)) return null; } catch { return null; }
  const numbers = plan.controls.filter(c => c.type === 'number' && c.binding.kind === 'input'), tl = plan.mode.timeline, fixedGravity = plan.mode.fixedValues?.gravity;
  const defaults = Object.fromEntries(numbers.map(c => [c.binding.id, c.default])), domains = Object.fromEntries(numbers.map(c => [c.binding.id, [c.min, c.max]]));
  return { inputControls: numbers, defaults, at: (expr, inputs) => evalScalar(expr, inputs, domains), gOf: inputs => fixedGravity ?? inputs.gravity, tl, brief };
}

export function verticalThrowOracle(plan) {
  const ref = familyReference(plan);
  if (!ref) return null;
  const roles = FAMILY.depths[plan.depth].roles, h0 = ref.brief.launchHeight;
  return tossOracle(plan, `toss-mvp-${plan.depth}`, ref, v => ({
    ...Object.fromEntries(roles.map(role => [role, role === 'dropAcceleration' && Math.abs(v.tau) < NEAR ? undefined : referenceValue(role, v.t, { v: v.u, g: v.g, m: v.m, h0 })])), launchSpeed: v.u, gravity: v.g, mass: v.m,
  }), ARROWS[plan.depth]);
}

// The trusted expected values for this plan, or null when no oracle exists for it (the checks then say so).
export const interactOracle = plan => standardTossDropOracle(plan) ?? deepTossDropOracle(plan) ?? overviewDropOracle(plan) ?? pendulumPeriodOracle(plan) ?? tossOverviewOracle(plan) ?? tossStandardOracle(plan) ?? tossDeepOracle(plan) ?? ledgeMoonOracle(plan) ?? verticalThrowOracle(plan) ?? curveLogisticOracle(plan);
