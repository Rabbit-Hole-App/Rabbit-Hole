import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import bench from '../test/fixtures/explanation-reference-batch3-cases.json' with { type: 'json' };

const [beforeRoot, afterRoot, reportPath] = process.argv.slice(2);
if (!beforeRoot || !afterRoot) {
  console.error('Usage: node explanation-reference-batch3-bench.mjs <before-tree> <after-tree> [report.json]');
  process.exit(2);
}

async function loadTree(root) {
  const url = path => pathToFileURL(resolve(root, path)).href;
  const [selector, registry] = await Promise.all([
    import(url('packages/control-plane/src/explanation-references.js')),
    import(url('packages/web/src/tutor-diagrams/reference-library.js')),
  ]);
  return { select: selector.selectDiagramReferences, records: registry.diagramReferences };
}

const [before, after] = await Promise.all([loadTree(beforeRoot), loadTree(afterRoot)]);
const picks = (tree, prompt) => tree.select({ prompt }).map(ref => ({ id: ref.id, kind: ref.spec.diagram.kind }));
const detail = bench.cases.map(({ id, prompt, kind, referenceId, paraphrase }) => ({
  id, prompt, expected: { id: referenceId, kind }, before: picks(before, prompt),
  after: picks(after, prompt), paraphrase, paraphrasePicks: picks(after, paraphrase),
}));
const requested = new Set(bench.cases.map(item => item.prompt.toLowerCase().trim()));
const controlPrompts = [...new Set([
  ...bench.protectedPrompts,
  ...before.records.flatMap(ref => ref.prompts),
])].filter(prompt => !requested.has(prompt.toLowerCase().trim()));
const changedControls = controlPrompts.flatMap(prompt => {
  const old = picks(before, prompt), next = picks(after, prompt);
  return JSON.stringify(old) === JSON.stringify(next) ? [] : [{ prompt, before: old, after: next }];
});
const passed = detail.filter(({ before, after, expected, paraphrasePicks }) =>
  !before.length && after[0]?.id === expected.id && after[0].kind === expected.kind &&
  paraphrasePicks[0]?.id === expected.id && paraphrasePicks[0].kind === expected.kind);
const report = {
  requestCommit: bench.requestCommit, beforeRecords: before.records.length, afterRecords: after.records.length,
  requested: detail.length, passed: passed.length, protectedPrompts: controlPrompts.length,
  changedControls, detail,
};
if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  ...report,
  detail: detail.filter(item => !passed.includes(item)),
}));
if (passed.length !== detail.length || changedControls.length) process.exitCode = 1;
