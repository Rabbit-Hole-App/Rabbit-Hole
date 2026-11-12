import { deriveVisualRequirements } from '../../packages/control-plane/src/explanation-visuals.js';
import { selectForAuthor } from '../../packages/control-plane/src/explanation-references.js';
import { planWithReferenceKind } from '../../packages/control-plane/src/learn-artifact.js';

export const depths = ['brief', 'balanced', 'detailed'];
export const isWorked = ref => !!ref && !/^(?:shape|general)-/.test(ref.id);

export async function selectAtDepth({ prompt, depth, planner, plan: suppliedPlan, fixture = false, topic = 'decision-trees', context = '' }) {
  const text = typeof prompt === 'string' ? prompt : prompt.prompt;
  const plan = suppliedPlan ?? await planner(text, depth);
  if (!plan) throw new Error('Planner returned no plan. Coverage cannot verify kind parity.');
  const excludeReferencePrefixes = fixture && topic === 'decision-trees' ? ['ml-trees-'] : [];
  const visualRequirements = deriveVisualRequirements(text);
  const input = planWithReferenceKind({ args: text, depth, plan, visualRequirements }, { excludeReferencePrefixes });
  const asked = (visualRequirements.items ?? []).filter(item => !item.implied);
  return { ...selectForAuthor({ prompt: text, context, depth, plan: input.plan, asked, planned: true, excludeReferencePrefixes }), plan: input.plan };
}

export async function evaluateCoverage(prompts, { planner, select, judge, fixture = false, topic = 'decision-trees', context = '' }) {
  const output = [];
  for (const row of prompts) {
    const selections = [];
    for (const depth of depths) {
      const selection = select
        ? await select({ prompt: row.prompt, depth, plan: await planner(row.prompt, depth), fixture, topic, context })
        : await selectAtDepth({ prompt: row.prompt, depth, planner, fixture, topic, context });
      const refs = selection.references;
      const first = refs[0];
      const worked = refs.filter(isWorked);
      const collision = worked.some((ref, i) => worked.slice(i + 1).some(other => other.spec.diagram.kind === ref.spec.diagram.kind));
      selections.push({ depth, firstHit: first?.sourceId ?? first?.id ?? null, isWorked: isWorked(first),
        kind: first?.spec.diagram.kind ?? null, collision, references: refs,
        plannedKinds: selection.plannedKinds ?? [], requiredKinds: selection.requiredKinds ?? [], steer: selection.steer ?? null, plan: selection.plan ?? null });
    }
    const first = selections[0];
    const candidate = selections.every(hit => hit.isWorked && hit.firstHit === first.firstHit && hit.kind === row.kind);
    const sameTeachingPoint = candidate ? await judge(row, first.references[0]) : false;
    if (typeof sameTeachingPoint !== 'boolean') throw new Error(`Coverage judge requires a boolean for prompt ${row.id}`);
    output.push({ id: row.id, firstHit: first.firstHit, isWorked: first.isWorked, kind: first.kind,
      collision: selections.some(hit => hit.collision), sameTeachingPoint,
      decision: candidate && sameTeachingPoint ? 'REUSE' : 'NEW', depths: selections });
  }
  return output;
}
