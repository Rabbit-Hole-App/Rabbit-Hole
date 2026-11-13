// DEV-ONLY seam (owner 2026-11-13): INTERACT_BUILD_PROFILE=scripted runs the build half of a new-flow job with no model call. build_author is answered by the three scripted toss programs
// (packages/web/src/interact-toss-programs.js, read at call time) and build_review / build_repair by the fixture script; everything else is the real path: admission and the call fences,
// the schema checks, validate, the headless run, the oracle (interactOracle by the plan), sealing, delivery, the ledger row (profile `scripted`). It needs the design pinned
// (INTERACT_DESIGN_FIXTURE=toss, interact-design-pin.js) so the plan is the one the programs are written for; with any other plan the real validators refuse the programs.
// The gate is the environment, not the request: allowed only where the design pin is (SMALL_ENV dev/test or EXPLAIN_DIAGNOSTICS "true") and never when ENVIRONMENT is "production".
import { depthOf } from './chat-depth.js';
import { designPinOf } from './interact-design-pin.js';
import { fixtureScript, scriptedAdapter } from './interact-fixtures.js';
import { tossDraft } from '../../web/src/interact-toss-programs.js';

export const SCRIPTED_PROFILE = 'scripted';
const PROGRAM_OF = Object.freeze({ brief: 'tossOverview', balanced: 'tossStandard', detailed: 'tossDeep' });

export const scriptedBuildAllowed = env => env?.ENVIRONMENT !== 'production' && designPinOf(env ?? {}) !== null;

// The adapter standing in for Anthropic in a scripted job's role context. The bench judge is not scripted: a scripted job is never scored (explain-job.js benchStep skips it).
export function scriptedBuildAdapter(job) {
  const program = PROGRAM_OF[depthOf(job.depth)];
  if (!program) throw new Error(`no scripted program for depth ${String(job.depth).slice(0, 40)}`);
  return scriptedAdapter({ ...fixtureScript('standard'), build_author: () => ({ kind: 'scene', ...tossDraft(program) }) });
}
