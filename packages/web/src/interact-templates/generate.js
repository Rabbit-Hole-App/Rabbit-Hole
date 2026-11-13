// STUB: agent B (branch tpl-3) replaces this file with the real generator; at merge take B's version.
// generateProgram(plan, buildInput) -> { source, manifest }. The stub answers the three toss plans with the scripted program of their Depth (interact-toss-programs.js) so the build wiring
// (control-plane interact-template.js, interact-job.js, explain-job.js) is testable before the generator exists. It reads nothing physical from the plan.
import { TOSS_PROGRAMS } from '../interact-toss-programs.js';

const PROGRAM_OF = Object.freeze({ brief: 'tossOverview', balanced: 'tossStandard', detailed: 'tossDeep' });

export function generateProgram(plan) {
  const program = TOSS_PROGRAMS[PROGRAM_OF[plan.depth]];
  if (!program) throw new Error(`the stub generator has no program for depth ${String(plan.depth).slice(0, 40)}`);
  return structuredClone(program);
}
