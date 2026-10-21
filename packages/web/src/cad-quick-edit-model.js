// Quick edit data for one CAD revision: definitions (cad-params/1, published in manifest.controls) -> control
// descriptors. Pure, no React; the Quick edit section in data-cad-quick-edit-slot renders these. Generic: behaviour comes
// from each definition's type/role/bounds and from which inputs the trusted build actually read, never from ids or labels.
// Three value kinds stay apart: requested (validated input), computed (reported by the saved source), measured (trusted
// STEP inspection of this exact revision).
import { valueProblem, validateValues } from './cad-parameters.js';

const MEASURED_UNIT = { bounds_mm: 'mm', circular_diameter_mm: 'mm', volume_mm3: 'mm3', solid_count: 'count' };
const finite = v => typeof v === 'number' && Number.isFinite(v);

// manifest: the displayed (accepted, or previewed) revision. draft: { id: value } edits not yet previewed.
export function quickEditModel(manifest, { draft = {}, primaryCount = 4 } = {}) {
  const c = manifest?.controls, empty = { available: false, revisionId: manifest?.revisionId || null, parameters: [], primary: [], more: [], draft: { changed: [], problems: [], canPreview: false } };
  if (!c || c.schema !== 'cad-controls/1' || c.definitions?.schema !== 'cad-params/1') return { ...empty, reason: 'no_controls' };
  // Measurements belong to one geometry revision; anything else is stale and is not shown as measured.
  const current = c.revisionId === manifest.revisionId && manifest.validation?.baselinePassed === true;
  const checks = new Map((current ? manifest.validation.checks || [] : []).map(check => [check.id, check]));
  const bound = new Set(c.bindings || []), values = c.values || {};
  const defs = c.definitions.parameters.map((p, index) => ({ p, index })).sort((a, b) => (a.p.priority ?? 50) - (b.p.priority ?? 50) || a.index - b.index).map(x => x.p);
  const parameters = defs.map(p => {
    const check = p.check && checks.get(p.check);
    const measured = check && finite(check.actual)
      ? { status: check.status, value: check.actual, expected: finite(check.expected) ? check.expected : null, unit: MEASURED_UNIT[check.kind] || null, checkId: p.check, revisionId: manifest.revisionId }
      : { status: 'not_measured', label: 'Not measured.' };
    const base = { id: p.id, label: p.label, type: p.type, unit: p.unit || null, role: p.role, measured };
    if (p.role === 'computed') return { ...base, control: 'readonly', provenance: 'computed', value: finite(c.computed?.[p.id]) ? c.computed[p.id] : null, dependsOn: p.dependsOn || [], editable: false };
    const editable = bound.has(p.id), has = Object.hasOwn(draft, p.id);
    const control = !editable ? 'readonly' : p.type === 'choice' ? 'select' : p.type === 'boolean' ? 'toggle' : p.type === 'count' ? 'integer' : p.slider ? 'slider' : 'number';
    return { ...base, control, provenance: 'requested', editable, value: values[p.id], ...(has ? { draft: draft[p.id], problem: valueProblem(p, draft[p.id]) } : {}),
      ...(editable ? {} : { reason: 'Not bound to this model\'s source.' }),
      ...['min', 'max', 'step', 'precision', 'choices'].reduce((o, k) => (p[k] !== undefined ? { ...o, [k]: p[k] } : o), {}) };
  });
  const changed = Object.keys(draft).filter(id => draft[id] !== values[id]);
  const problems = changed.length ? validateValues(c.definitions, Object.fromEntries(changed.map(id => [id, draft[id]])), { bound: [...bound], current: values }).problems : [];
  const available = parameters.some(p => p.editable);
  return { available, ...(available ? {} : { reason: 'no_bindings' }), revisionId: manifest.revisionId, parameters,
    primary: parameters.slice(0, primaryCount), more: parameters.slice(primaryCount),
    draft: { changed, problems, canPreview: available && changed.length > 0 && !problems.length },
    // Exactly what POST /api/learn/cad/jobs/:id/rebuild takes, once canPreview.
    request: changed.length ? { expectedRevisionId: manifest.revisionId, values: Object.fromEntries(changed.map(id => [id, draft[id]])) } : null };
}
