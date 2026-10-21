// Dimension overlay data for one CAD revision (the data half of "Show dimensions"; the viewer draws it). Only trusted
// STEP measurements of this exact revision appear as measured. Coordinates are STEP millimetres, Z up.
// Overall extents always; a feature dimension only when a parameter's own check measured it and the inspected edges
// give its anchor. Everything else says "Not measured."
const finite = v => typeof v === 'number' && Number.isFinite(v);
const NOT_MEASURED = 'Not measured.';
export const CAD_DIMENSION_UNITS = 'mm';
// STEP millimetres (Z up) -> the executor's GLB metres (Y up), as cadgen 0.7.21 `glb build` writes it: measured on the
// local kernel 2026-10-20 (a box at STEP y=+10 lands at GLB z=-0.01; a 120 x 40 x 5 plate spans GLB 0.12 x 0.005 x 0.04).
export const glbPoint = ([x, y, z]) => [x / 1000, z / 1000, -y / 1000];

export function cadDimensions(manifest) {
  const validation = manifest?.validation, facts = validation?.facts, revisionId = manifest?.revisionId || null;
  if (!facts || validation.baselinePassed !== true || validation.geometry_units !== 'mm') return { revisionId, available: false, label: NOT_MEASURED, overall: [], features: [] };
  const min = facts.bounds_min_mm, max = facts.bounds_max_mm, anchored = [min, max].every(p => Array.isArray(p) && p.length === 3 && p.every(finite));
  const overall = ['x', 'y', 'z'].map((axis, i) => {
    const value = facts.bounds_mm?.[axis];
    if (!finite(value)) return { axis, status: 'not_measured', label: NOT_MEASURED };
    // Edge of the bounding box along this axis, from its minimum corner; absent on manifests made before anchors existed.
    const anchor = anchored ? { from: [...min], to: min.map((v, j) => (j === i ? max[i] : v)) } : null;
    return { axis, status: 'measured', value, unit: 'mm', anchor };
  });
  const checks = new Map((validation.checks || []).map(check => [check.id, check]));
  const controls = manifest.controls?.revisionId === revisionId ? manifest.controls : null;
  const features = (controls?.definitions?.parameters || []).flatMap(p => {
    const check = p.check && checks.get(p.check);
    // Validation reports name their kind since cad-controls; older reports never yield feature dimensions.
    if (check?.kind !== 'circular_diameter_mm' || !finite(check.actual) || !Array.isArray(facts.circular_edges)) return [];
    const edges = facts.circular_edges.filter(e => finite(e.diameter_mm) && Math.abs(e.diameter_mm - check.actual) < 1e-6 && Array.isArray(e.center_mm));
    return edges.map(e => ({ parameterId: p.id, kind: 'diameter', status: 'measured', value: check.actual, unit: 'mm', anchor: { center: e.center_mm } }));
  });
  return { revisionId, available: true, units: 'mm', overall, features };
}
