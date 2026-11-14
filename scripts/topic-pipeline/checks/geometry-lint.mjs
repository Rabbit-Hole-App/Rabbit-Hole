// The release suite's geometry lint (packages/web/src/tutor-diagrams/geometry-lint.js, run by geometry-lint.test.mjs over every reference, RD-3), applied before stage 05 so a NEW reference
// cannot ship with a flow whose layout breaks a geometry rule: (a) sibling branch labels at one height, (b) parallel wires 6 px apart, (c) no label on another wire, (d) text inside its node,
// (e) no two labels intersecting. Same shape as the content contract: one flag per violation, an error, in the linter's format. No dependencies of its own: it loads the worktree's web modules.
// Only reference ids in the committed baseline (geometry-lint-baseline.json, the renderer work queue) are tolerated, and only for the rules listed there; new content gets no baseline entry.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FIXES = {
  a: 'give the branches of that node labels that line up: fewer labelled branches from one node, or shorter labels',
  b: 'simplify the flow so its wires leave and enter nodes on separate ports: fewer edges at one node',
  c: 'shorten the edge label or reduce the wires crossing that tier',
  d: 'shorten the node text so it fits the shape',
  e: 'shorten or drop one of the two labels',
};

// One flag per violation not in the baseline.
export const geometryFlags = ({ lintSpec, baseline = {} }, { id, depth, field, spec }) => lintSpec(spec)
  .filter(({ rule }) => !baseline[id]?.includes(rule))
  .map(({ rule, where, detail }) => ({ id, depth, rule: `geometry-lint:${rule}`, severity: 'error', detail: `${field}: ${where}: ${detail}. Fix: ${FIXES[rule] ?? 'simplify the flow'}.` }));

// The checker and baseline of a worktree, or null when its revision has none (older trees): an absent lint is not a failure.
export async function geometryChecker(load, root) {
  let lintSpec;
  try { lintSpec = (await load('packages/web/src/tutor-diagrams/geometry-lint-references.js')).lintSpecGeometry; } catch { return null; }
  if (!lintSpec) return null;
  const baseline = await readFile(join(root, 'packages/web/src/tutor-diagrams/geometry-lint-baseline.json'), 'utf8').then(JSON.parse, () => ({}));
  return { lintSpec, baseline };
}
