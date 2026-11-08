// Trusted expected values for the /interact numerical checks (INT-05, docs/features/interact.md section 7 "Canonical toss-and-drop acceptance").
// Computed here from the equations, never from a model and never from the builder's prose:
//   y = u t - g t^2 / 2, v = u - g t, a = -g, apex at u / g, return at 2 u / g.
// An oracle exists only for a plan that IS the canonical Standard toss-and-drop (launch speed 3.0 m/s and g 9.8 m/s^2 fixed, timed, program renderer, no
// adjustable input): for any other plan this returns null and the checks say so (coverage.oracle.note); a plan is never matched by guessing.
// Only the names the checks already REQUIRE the program to report are expected (observation quantities that are not fixed values, and the scene's readouts),
// at the instants of the plan's own checkpoints, its start and its endpoint. Absolute tolerance 1e-6, as the fixture oracle (interact-build-fixtures.js).
// shortcut: one canonical case. The benchmark corpus (INT-08) and the Deep oracle are later items; add a case here with its equations, not a lookup of answers.
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
