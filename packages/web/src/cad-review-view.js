// UI-15.1: the CAD design brief as a shared confirmation (docs/features/generation-review-contract.md). Pure: the job's brief becomes a
// logical proposal for the shared card (GenerationProposalCard), the card's edit becomes the brief edit the job's `brief` action takes, and
// the brief's own element names are kept as data attributes so the existing review checks keep their selectors. The job (cad-jobs.js) stays
// the stored state: its briefHash is the approval and the revision, the server revalidates every edit with no model call, and Generate
// approves the exact hash. Nothing here calls the server.
import { proposalView } from './generation-confirmation-schema.js';
import { valueProblem } from './cad-parameters.js';

// The card's schema keys against the brief's own (schema missing_information is the brief's `missing`, limitations its `unsupported`).
const BRIEF_KEY = { requirements: 'requirements', assumptions: 'assumptions', missing_information: 'missing', limitations: 'unsupported' };
export const EDITABLE = ['requirements', 'assumptions', 'missing', 'unsupported'];
export const NO_INTERPRETATION = 'No interpretation was returned.';
export const COST_NOTE = 'Preparing this brief used one model call. Generate starts paid work under this request\'s existing allowance: source generation, a visual review, at most one repair, and executor time. Editing details makes no call.';
const lines = text => text.split('\n').map(line => line.trim()).filter(Boolean);
export const inputsOf = brief => (brief?.controls?.parameters || []).filter(p => p.role === 'input');

// The brief edit the server takes (cad-jobs.js action 'brief'): changed fields only; a parameter whose value the person set is no longer
// the brief's assumption.
export function briefEdit(brief, form) {
  const edit = {};
  if (form.object !== (brief.object || '')) edit.object = form.object;
  for (const key of EDITABLE) { const next = lines(form[key]); if (JSON.stringify(next) !== JSON.stringify(brief[key] || [])) edit[key] = next; }
  const controls = brief.controls;
  if (controls?.parameters?.some(p => p.role === 'input' && form.values[p.id] !== p.value)) {
    edit.controls = { ...controls, parameters: controls.parameters.map(({ assumed, ...p }) => (p.role !== 'input' ? { ...p, ...(assumed ? { assumed } : {}) }
      : form.values[p.id] === p.value ? { ...p, ...(assumed ? { assumed } : {}) } : { ...p, value: form.values[p.id] })) };
  }
  return edit;
}
export const formOf = brief => ({ object: brief.object || '', ...Object.fromEntries(EDITABLE.map(key => [key, (brief[key] || []).join('\n')])),
  values: Object.fromEntries(inputsOf(brief).map(p => [p.id, p.value])) });

// The card's Save, as the brief edit: description is the interpreted object, the lists are the brief's, settings.parameters the values.
export function briefEditOf(brief, edit) {
  const form = formOf(brief);
  if (edit.description !== undefined && edit.description !== NO_INTERPRETATION) form.object = edit.description;
  for (const [schemaKey, key] of Object.entries(BRIEF_KEY)) if (edit[schemaKey] !== undefined) form[key] = edit[schemaKey].join('\n');
  if (edit.settings?.parameters) form.values = { ...form.values, ...edit.settings.parameters };
  return briefEdit(brief, form);
}

// job (cad-jobs.js response): { id, request, briefHash, brief }. format(value, unit, precision) shows a value as the Quick edit does and
// parse(def, text) reads typed text as a draft value (cad-draft-store.js draftInput): both come from the adapter, which may import them.
export function cadReviewView(job, { format = (value, unit) => (unit ? `${value} ${unit}` : String(value)), parse = (def, text) => text } = {}) {
  const brief = job.brief || {}, inputs = inputsOf(brief);
  const view = proposalView({
    proposal_id: job.id, version: job.briefHash, schema_version: 1, command: 'cad', title: brief.title || 'CAD model', description: brief.object || NO_INTERPRETATION,
    settings: { ...(brief.units ? { units: brief.units } : {}), parameters: Object.fromEntries(inputs.map(p => [p.id, p.value])) }, original_request: job.request ?? '',
    requirements: brief.requirements || [], assumptions: brief.assumptions || [], missing_information: brief.missing || [], limitations: brief.unsupported || [], references: [],
  }, { review: { required: true, reasons: ['brief'] } });
  // A request is read-only here; the interpreted object is the description.
  const groups = { parameters: { legend: `Parameters (${brief.units || 'units not set'})`, defs: inputs.map(p => ({ ...p, display: format(p.value, p.unit, p.precision), tag: p.assumed ? 'Assumed' : 'Requested' })),
    parse } };
  const problemOf = (key, id, value) => { const def = inputs.find(p => p.id === id); return def ? valueProblem(def, value) : ''; };
  return { view, groups, groupProblem: problemOf, extraSections: [{ key: 'contextUsed', title: 'Context used', items: brief.contextUsed || [] }] };
}

// The brief's own data attributes on the shared card's elements, so the review keeps its selectors.
export function cadAttrs(job) {
  const key = k => BRIEF_KEY[k] ?? k;
  return (slot, arg) => ({
    root: { 'data-cad-review': job.id, 'data-brief-hash': job.briefHash }, request: { 'data-cad-review-request': '' }, description: { 'data-cad-review-object': '' },
    field: { 'data-cad-review-field': arg === 'description' ? 'object' : key(arg) }, list: { 'data-cad-review-list': key(arg) }, param: { 'data-cad-review-param': arg }, value: { 'data-cad-review-value': arg },
    generate: { 'data-cad-review-generate': '' }, edit: { 'data-cad-review-edit': '' }, save: { 'data-cad-review-save': '' }, discard: { 'data-cad-review-discard-edit': '' },
    cancel: { 'data-cad-review-cancel': '' }, blocked: { 'data-cad-review-blocked': '' }, cost: { 'data-cad-review-cost': '' }, problem: { 'data-cad-review-problem': '' },
  }[slot] || {});
}
