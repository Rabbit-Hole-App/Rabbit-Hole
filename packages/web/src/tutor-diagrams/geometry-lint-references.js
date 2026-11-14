// Runs the geometry lint (geometry-lint.js, RD-3) over a diagram spec or a whole reference at the diagrams' natural width.
// Today only the flow renderer exposes a layout object (layoutFlow(...).geometry), so flows are what is linted: a top-level flow, and the flows inside panels,
// two-panel comparisons and visual transformations. Other kinds are not covered yet (see the first-run report for what each needs).
import { layoutFlow } from './flow.js';
import { lintGeometry } from './geometry-lint.js';

function* flowsIn(diagram, path = []) {
  if (!diagram || typeof diagram !== 'object') return;
  if (diagram.kind === 'flow') yield { diagram, path };
  for (const [index, panel] of (diagram.panels ?? []).entries()) yield* flowsIn(panel.diagram, [...path, `panel ${index + 1}`]);
  for (const side of ['before', 'after']) if (diagram[side]?.diagram) yield* flowsIn(diagram[side].diagram, [...path, side]);
}

// Violations of every flow in one spec { version, diagram }, each { rule, where, detail } (where is prefixed with the panel it is in).
export function lintSpecGeometry(spec) {
  const found = [];
  for (const { diagram, path } of flowsIn(spec?.diagram)) {
    const { geometry } = layoutFlow(diagram, 0); // width 0 asks for the natural width
    for (const { rule, where, detail } of lintGeometry(geometry)) found.push({ rule, where: path.length ? `${path.join(' / ')}: ${where}` : where, detail });
  }
  return found;
}

// Violations of one reference over every spec it carries (each depth's spec and detail figure; the top-level spec when it has no depths), each { id, rule, where, detail }.
export function lintReferenceGeometry(reference) {
  const specs = reference.depths ? Object.entries(reference.depths).flatMap(([depth, entry]) => [[depth, entry.spec], ...(entry.detailSpec ? [[`${depth} detail`, entry.detailSpec]] : [])]) : [['spec', reference.spec]];
  return specs.flatMap(([name, spec]) => lintSpecGeometry(spec).map(violation => ({ id: reference.id, ...violation, where: `${name}: ${violation.where}` })));
}
