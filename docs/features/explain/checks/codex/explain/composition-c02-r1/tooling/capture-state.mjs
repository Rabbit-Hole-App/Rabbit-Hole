import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const [repoArg, output, mode = 'replay'] = process.argv.slice(2);
const repo = resolve(repoArg);
const moduleAt = path => import(pathToFileURL(resolve(repo, path)).href);
const { diagramReferences } = await moduleAt('packages/web/src/tutor-diagrams/reference-library.js');
const { singleDiagramReferences } = await moduleAt('packages/web/src/tutor-diagrams/reference-single-variants.js');
const state = {
  ref: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  references: diagramReferences,
  singles: singleDiagramReferences,
};
if (mode === 'replay') {
  const { selectForAuthor } = await moduleAt('packages/control-plane/src/explanation-references.js');
  const { planWithReferenceKind } = await moduleAt('packages/control-plane/src/learn-artifact.js');
  const originalLog = console.log;
  console.log = () => {};
  state.rows = [];
  for (const ref of diagramReferences) {
    const prompts = [...new Set([...(ref.prompts ?? []), ...(ref.paraphrases ?? [])])];
    for (const [promptIndex, prompt] of prompts.entries()) for (const depth of ['brief', 'balanced', 'detailed']) {
      const kind = ref.spec.diagram.kind;
      const input = planWithReferenceKind({ command: 'explain', args: prompt, depth, planned: true,
        plan: { planner: 'jev', kind, fixed: true, depthTreatment: 'mechanism', visuals: [{ type: 'diagram', kind }] } });
      const selection = selectForAuthor({ prompt, depth, planned: true, plan: input.plan });
      const references = selection.references.map(r => ({ id: r.id, sourceId: r.sourceId ?? null,
        partIndex: r.partIndex ?? null, kind: r.spec.diagram.kind }));
      const family = r => r.sourceId ?? singleDiagramReferences.find(s => s.id === r.id)?.panelReferenceId ?? r.id;
      state.rows.push({ sourceReferenceId: ref.id, promptIndex, prompt, sourceKind: kind, depth, references,
        plannedKinds: selection.plannedKinds, requiredKinds: selection.requiredKinds,
        resolvedPlanKind: input.plan.kind,
        collision: references.length > 0 && family(references[0]) !== ref.id });
    }
  }
  console.log = originalLog;
}
await writeFile(output, JSON.stringify(state, null, 2) + '\n');
console.log(JSON.stringify({ repo, ref: state.ref, references: state.references.length, singles: state.singles.length, rows: state.rows?.length, output }));
