import { computeTable } from '../../web/src/inline-compute.js';
import { cardEditSpec } from '../../web/src/inline-card-edit.js';
import { validInlineToolSnapshot } from '../../web/src/inline-tool-plan.js';
import { checkPolynomialDerivative } from '../../web/src/inline-polynomial-derivative.js';

export function derivativeAvailable(request) {
  const snapshot = request?.context?.toolSnapshot;
  return request?.kind === 'selection' && request.mode === 'explain' && !request.textRange
    && !request.context?.target?.range && !request.context?.target?.textRange
    && validInlineToolSnapshot(snapshot) && snapshot.intent === 'explain' && snapshot.ids.length === 2
    && JSON.stringify(snapshot.ids) === JSON.stringify(request.targetIds)
    && snapshot.ids.every(id => snapshot.lists[id] === 'items' && snapshot.objects[id].kind === 'equation'
      && !snapshot.objects[id].locked && typeof snapshot.objects[id].latex === 'string' && !!snapshot.objects[id].latex.trim());
}

export function computeAvailable(request) {
  const snapshot = request?.context?.toolSnapshot;
  if (request?.kind !== 'selection' || request.mode !== 'explain'
    || request.textRange || request.context?.target?.range || request.context?.target?.textRange
    || !validInlineToolSnapshot(snapshot) || (snapshot.intent || 'edit') !== request.mode
    || snapshot.ids.length !== 1 || !Array.isArray(request.targetIds)
    || JSON.stringify(request.targetIds) !== JSON.stringify(snapshot.ids)) return false;
  const id = snapshot.ids[0], table = snapshot.objects[id];
  return snapshot.lists[id] === 'blocks' && table.type === 'table' && cardEditSpec(table).ok
    && Array.isArray(table.columns) && table.columns.length > 0 && table.columns.length <= 200
    && Array.isArray(table.rows) && table.rows.length > 0 && table.rows.length <= 10000;
}

export function checkCompute(input, request, requestId) {
  if (input?.compute?.type === 'polynomial_derivative') return checkDerivative(input, request, requestId);
  if (!computeAvailable(request) || !input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['summary', 'compute'].includes(key))
    || typeof input.summary !== 'string' || !input.summary.trim() || input.summary.length > 300
    || typeof requestId !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(requestId)
    || input.compute?.targetId !== request.targetIds[0]) return { error: 'The calculation does not match the frozen table request.' };
  const table = request.context.toolSnapshot.objects[request.targetIds[0]];
  const checked = computeTable(table, input.compute);
  if (!checked.ok) return { error: checked.reason };
  // The server verifies actual cells, never a model answer. The client computes
  // the preview from this same frozen source and rechecks it before Accept.
  return { result: { kind: 'compute', requestId, targetIds: [...request.targetIds], summary: input.summary, operation: structuredClone(input.compute) } };
}

function checkDerivative(input, request, requestId) {
  const operation = input?.compute;
  if (!derivativeAvailable(request) || !input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['summary', 'compute'].includes(key))
    || typeof input.summary !== 'string' || !input.summary.trim() || input.summary.length > 300
    || typeof requestId !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(requestId)
    || !operation || Object.keys(operation).some(key => !['type', 'sourceId', 'claimId', 'variable'].includes(key))
    || operation.sourceId === operation.claimId || !request.targetIds.includes(operation.sourceId) || !request.targetIds.includes(operation.claimId))
    return { error: 'Select two unchanged native equations in Explain and identify the original and derivative claim.' };
  const objects = request.context.toolSnapshot.objects;
  const checked = checkPolynomialDerivative({ source: objects[operation.sourceId].latex, claim: objects[operation.claimId].latex, variable: operation.variable });
  if (!checked.ok) return { error: checked.reason };
  return { result: { kind: 'compute', requestId, targetIds: [...request.targetIds], summary: input.summary, operation: structuredClone(operation) } };
}

export const DERIVATIVE_SYSTEM = 'For exactly two selected native equations, an explicit derivative-check request can return only {summary:"short review description",compute:{type:"polynomial_derivative",sourceId:"selected original equation ID",claimId:"different selected derivative claim ID",variable:"one ASCII letter"}}. Never supply rewritten formulas, answers, sample points, tolerances or code. The application reads original LaTeX directly from the frozen equations, differentiates the supported univariate polynomial using exact rational arithmetic and checks the claim, then creates a separate result after Accept. This bounded parser accepts integer/decimal rational constants, + - * / (constant denominators only), implicit multiplication, parentheses/braces, nonnegative integer powers up to 32, and LaTeX frac/cdot/times. Equations containing equality relations, functions, additional variables or unsupported notation are refused, not rewritten or approximated. Ask for clear original/claim roles or variable if ambiguous. Preserve both original equations and selected mode; no general CAS, numerical sampling or model proof.';

export function derivativeTool(tool) {
  const result = structuredClone(tool), schema = result.input_schema;
  schema.properties.summary = { type: 'string', minLength: 1, maxLength: 300 };
  schema.properties.compute = { type: 'object', additionalProperties: false, required: ['type', 'sourceId', 'claimId', 'variable'], properties: {
    type: { type: 'string', enum: ['polynomial_derivative'] }, sourceId: { type: 'string', minLength: 1, maxLength: 160 }, claimId: { type: 'string', minLength: 1, maxLength: 160 }, variable: { type: 'string', pattern: '^[A-Za-z]$' },
  } };
  delete schema.required;
  return result;
}

export const COMPUTE_SYSTEM = 'For one explicitly supplied complete editable native table, an explicit numerical summary or plot request may return only {summary:"short description",compute:{type:"table_summary"|"table_plot",targetId:"exact selected table ID",columns:[zero-based numeric column indexes],units:[explicit unit label per column],xColumn?:zero-based-index,xUnit?:"explicit X unit"}}. This creates a separate derived preview, preserving the source table. Never return data, values, calculated answers, graph specifications, code, formulas or arbitrary expressions. The application calculates from the frozen source cells and checks them again at Accept. Summary provides count/sum/minimum/maximum/mean for up to eight columns. Plot uses up to 1000 rows, a distinct numeric X column and identical declared units for all Y columns, with no fit/interpolation. Summary allows up to 10000 rows subject to the supplied snapshot size. Use only explicitly known units; dimensionless is a declaration, not a guess. If units, columns or inputs are missing, explain the missing information instead of inventing them. No symbolic solving, unit conversion, execution or verified mathematical proof is available. Do not mix compute with text, ops, plan, action or any other result. Ordinary explanations retain their existing output.';

export function computeTool(tool) {
  const result = structuredClone(tool), schema = result.input_schema;
  schema.properties.summary = { type: 'string', minLength: 1, maxLength: 300 };
  schema.properties.compute = { type: 'object', additionalProperties: false, required: ['type', 'targetId', 'columns', 'units'], properties: {
    type: { type: 'string', enum: ['table_summary', 'table_plot'] }, targetId: { type: 'string', minLength: 1, maxLength: 200 },
    columns: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'integer', minimum: 0, maximum: 199 } },
    units: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 80 } },
    xColumn: { type: 'integer', minimum: 0, maximum: 199 }, xUnit: { type: 'string', minLength: 1, maxLength: 80 },
  } };
  delete schema.required;
  return result;
}
