// The gate's logical tests: one row per stage (ORDER) with its check file, its stack script and every part that runs it.
// A stage run by two parts on the same stack script and preceding section is a duplicate execution.
import { ORDER, UNIT_STAGES } from './shards.mjs';

// A script runs a stage with a `run <stack script> <stage> <check>` line, or prints the stage's own exit line (journeys).
const runs = (script, stage) => [`\nrun stack.sh ${stage} `, `\nrun stack-app.sh ${stage} `, `echo "${stage} exit `].some(p => script.includes(p));

export function inventory(int35, focused, shards) {
  const lines = new Map([...int35.matchAll(/^\s*run (stack(?:-app)?\.sh) (\S+) (\S+)$/gm)].map(m => [m[2], m]));
  const rows = new Map(ORDER.map(stage => [stage, { stage, check: lines.get(stage)?.[3] ?? null, stack: lines.get(stage)?.[1] ?? null, parts: [] }]));
  shards.forEach((stages, k) => stages.forEach(s => rows.get(s).parts.push(`shard-${k + 1}`)));
  // ponytail: the units part is inferred (it runs the unit stages whenever no shard does), not read from the workflow.
  if (!shards.flat().includes(UNIT_STAGES[0])) UNIT_STAGES.forEach(s => rows.get(s).parts.push('units'));
  if (focused) for (const row of rows.values()) if (runs(focused, row.stage)) row.parts.push('focused');
  return [...rows.values()];
}
