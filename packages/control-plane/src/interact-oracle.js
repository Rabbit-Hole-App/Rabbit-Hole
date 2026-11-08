// Trusted expected values for the /interact numerical checks (INT-05, docs/features/interact.md section 7 "Canonical toss-and-drop acceptance").
// Computed here from the equations, never from a model and never from the builder's prose:
//   y = u t - g t^2 / 2, v = u - g t, a = -g, apex at u / g, return at 2 u / g.
// An oracle exists only for a plan that IS the canonical Standard toss-and-drop (launch speed 3.0 m/s and g 9.8 m/s^2 fixed, timed, program renderer, no
// adjustable input): for any other plan this returns null and the checks say so (coverage.oracle.note); a plan is never matched by guessing.
// Only the names the checks already REQUIRE the program to report are expected (observation quantities that are not fixed values, and the scene's readouts),
// at the instants of the plan's own checkpoints, its start and its endpoint. Absolute tolerance 1e-6, as the fixture oracle (interact-build-fixtures.js).
// shortcut: two canonical cases (Standard and Deep). The benchmark corpus (INT-08) is a later item; add a case here with its equations, not a lookup of answers.
import { evalScalar } from '../../web/src/interact-plan.js';

const G = 9.8, U = 3, TOL = 1e-6;
const SUPPORT_MOMENTS = { velocityBefore: -0.1, velocityTop: 0, velocityAfter: 0.1 }; // seconds from the apex

export function standardTossDropOracle(plan) {
  if (plan?.depth !== 'standard' || plan.mode.kind !== 'time' || plan.scene.runtime.renderer !== 'program' || !plan.mode.timeline) return null;
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
  if (plan?.depth !== 'deep' || plan.mode.kind !== 'experiment' || plan.scene.runtime.renderer !== 'program' || !plan.mode.timeline) return null;
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
  if (plan?.depth !== 'overview' || plan.mode.kind !== 'static' || plan.scene.runtime.renderer !== 'program' || plan.mode.timeline || plan.controls.length || plan.mode.adjustableIds.length) return null;
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

// The trusted expected values for this plan, or null when no oracle exists for it (the checks then say so).
export const interactOracle = plan => standardTossDropOracle(plan) ?? deepTossDropOracle(plan) ?? overviewDropOracle(plan) ?? pendulumPeriodOracle(plan);
