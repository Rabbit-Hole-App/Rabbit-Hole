// The release suite's content contract (packages/web/src/tutor-diagrams/content-contract.js, enforced by reference-content-contract.test.mjs on every reference),
// applied before stage 05: the author's own round feedback names a flow label that does not start with a verb or two nodes with one label,
// instead of stage 05 failing on the shared suite (decision-trees dry run; reviewer 2026-11-13, item 5).

// One flag per contract issue: a contract rule is an error, exactly as in the release suite.
export const contractFlags = (lintDiagramContent, { id, depth, field, spec }) => lintDiagramContent(spec).map(issue => ({
  id, depth, rule: `content-contract:${issue.rule}`, severity: 'error',
  detail: `${field}: ${issue.path.join('.')}: ${issue.message}${issue.value === undefined ? '' : ` (${JSON.stringify(issue.value)})`}`,
}));

// The checker of a worktree, or null when its revision has none (older trees): an absent contract is not a failure.
export async function contractChecker(load) {
  try { return (await load('packages/web/src/tutor-diagrams/content-contract.js')).lintDiagramContent ?? null; } catch { return null; }
}
