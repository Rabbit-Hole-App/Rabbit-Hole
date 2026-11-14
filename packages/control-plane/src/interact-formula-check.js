// The shared check for quantity formulas (owner brief 2026-11-13 15:35, template build, sections 2 and 6): do a plan's formula strings (interact-formula.js) give the oracle's values at every case of
// the plan's oracle (the same cases, expected values and tolerances the build's oracle checks, interact-oracle.js)? Used by the plan-fixture tests and by scripts/interact/bench-formulas.mjs.
// Piecewise quantities ({ formula, switchAt, formulaAfter }) are first-class here: there is no grammar gap to forgive.
import { ScalarExprError } from '../../web/src/interact-plan.js';
import { evalQuantity, formulaScope, parseQuantity } from '../../web/src/interact-formula.js';
import { interactOracle, tossCasesOf } from './interact-oracle.js';

const clip = (s, n = 160) => String(s).replace(/\s+/g, ' ').slice(0, n);

// -> { [quantityId]: { formula, switchAt?, formulaAfter? } } for every quantity of the plan that carries a formula.
export function planFormulas(plan) {
  const out = {};
  for (const q of plan.scene.quantities) if (q.formula !== undefined) out[q.id] = { formula: q.formula, ...(q.switchAt !== undefined ? { switchAt: q.switchAt, formulaAfter: q.formulaAfter } : {}) };
  return out;
}

// quantitiesById: { id: { formula, switchAt, formulaAfter } } (switchAt / formulaAfter may be null or absent). -> { ok, parseErrors: [{ id, message, case? }], missingIds, wrongIds: [{ id, case, got, expected }], checked }.
// Only the ids the oracle holds an expected value for are evaluated; every id of the plan's scene must be present.
export function checkQuantityFormulas(plan, quantitiesById) {
  const oracle = interactOracle(plan), toss = tossCasesOf(plan);
  if (!oracle || !toss) throw new Error('no oracle cases for this plan');
  const scope = formulaScope(plan), parseErrors = [], wrongIds = [], usable = {};
  const missingIds = plan.scene.quantities.map(q => q.id).filter(id => !quantitiesById?.[id]);
  for (const q of plan.scene.quantities) {
    const raw = quantitiesById?.[q.id];
    if (!raw) continue;
    const quantity = { id: q.id, formula: raw.formula, ...(raw.switchAt != null || raw.formulaAfter != null ? { switchAt: raw.switchAt ?? undefined, formulaAfter: raw.formulaAfter ?? undefined } : {}) };
    try { if (parseQuantity(quantity, scope) === null) throw new ScalarExprError('no_formula', `quantity "${q.id}" has no formula`); usable[q.id] = quantity; } catch (error) {
      if (!(error instanceof ScalarExprError)) throw error;
      parseErrors.push({ id: q.id, message: clip(error.message) });
    }
  }
  let checked = 0;
  for (const [caseId, [inputs, t]] of Object.entries(toss.cases)) {
    for (const row of oracle.expect.filter(r => r.case === caseId && r.panel === 'main' && usable[r.name])) {
      checked++;
      let got;
      try { got = evalQuantity(usable[row.name], inputs, t, toss.domains, scope.fixed); } catch (error) {
        if (!(error instanceof ScalarExprError)) throw error;
        parseErrors.push({ id: row.name, case: caseId, message: clip(error.message) });
        continue;
      }
      if (!(Math.abs(got - row.expected) <= (row.tol ?? 1e-6))) wrongIds.push({ id: row.name, case: caseId, got, expected: row.expected });
    }
  }
  return { ok: !parseErrors.length && !missingIds.length && !wrongIds.length, parseErrors, missingIds, wrongIds, checked };
}
