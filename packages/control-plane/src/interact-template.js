// The template build (brief 7 section 4): for an approved plan that names a template, the program is generated from the plan by trusted code and the build makes ZERO model calls.
// INTERACT_BUILD_KIND=template turns it on (unset = today's build_author path, nothing else changes). The generated program then takes the same trusted path as a model's (validateBuildOutput:
// the frozen contract, the approved SDK tuple, the envelope against the plan, the composition), and the job continues unchanged (headless run, oracle, layout rules, seal, compose, shadow judge).
// There is no repair loop: a problem in a generated program is our bug, so the job stops with stopReason `template_error` and the problem text (explain-job.js failWith).
import { TEMPLATE_ROLES } from '../../web/src/interact-formula.js';
import { generateProgram } from '../../web/src/interact-templates/generate.js';
import { planHash } from '../../web/src/interact-plan.js';
import { approvedPlanOf, buildInput, validateBuildOutput } from './interact-build.js';
import { captureAndCheck, headlessCaptureCard } from './interact-checks.js';
import { interactOracle } from './interact-oracle.js';

export const BUILD_KIND_SETTING = 'INTERACT_BUILD_KIND';

// -> null (the model build: the setting is unset, or the plan names no template) | { ok: false, reason } (the model build, with the reason to log) | { ok: true, template }.
// shortcut: any value of the setting but `template` logs a reason and takes the model build rather than failing the job; upgrade when a second kind exists.
export function templateGate(env, plan) {
  const setting = env?.[BUILD_KIND_SETTING];
  if (setting === undefined || setting === '') return null;
  if (setting !== 'template') return { ok: false, reason: `${BUILD_KIND_SETTING} is "${String(setting).slice(0, 40)}", not "template"` };
  const main = plan?.scene;
  if (!main?.template) return null;
  const spec = TEMPLATE_ROLES[main.template];
  if (!spec) return { ok: false, reason: `unknown template "${String(main.template).slice(0, 40)}"` };
  if (main.runtime?.renderer !== 'program') return { ok: false, reason: 'a template builds a program panel only' };
  if (plan.supportingVisuals?.length) return { ok: false, reason: 'a template draws the main frame only; this plan has supporting panels' };
  const withFormula = new Set((main.quantities ?? []).filter(q => q.formula !== undefined).map(q => q.id));
  const maps = spec.lanes ? Object.entries(main.slots ?? {}) : [['', main.slots ?? {}]];
  if (spec.lanes && maps.length !== spec.lanes) return { ok: false, reason: `${main.template} maps exactly ${spec.lanes} lanes, the plan maps ${maps.length}` };
  for (const [lane, slots] of maps) {
    for (const role of spec.roles) {
      const name = lane ? `${lane}.${role}` : role;
      if (typeof slots?.[role] !== 'string') return { ok: false, reason: `slot "${name}" is missing` };
      if (!withFormula.has(slots[role])) return { ok: false, reason: `slot "${name}" names "${slots[role]}", which has no formula` };
    }
  }
  return { ok: true, template: main.template };
}

// buildScene's result shape without a call: { artifacts, composition, planHash } | { gap } | { problems, details, category, repairable, planHash }. A generator that throws is a problem, never an exception.
export async function buildTemplate(job, ctx) {
  const { plan, hash } = await approvedPlanOf(job);
  let program;
  try { program = await (ctx.generate ?? generateProgram)(plan, buildInput(job, plan, hash, null)); } // ctx.generate: a test seam (deps.generateProgram in explain-job.js buildRoleCtx)
  catch (error) {
    const message = String(error?.message ?? error).slice(0, 300);
    return { problems: [`template: ${message}`], details: [{ path: 'template', code: 'generate_failed', message }], category: 'spec', repairable: false, planHash: hash };
  }
  const result = await validateBuildOutput(job, { kind: 'scene', main: { kind: 'program', program }, supporting: [] }, ctx);
  return { ...result, planHash: hash };
}

// The build's own checks (generate, seal, headless run, oracle, layout rules) run on a plan at DESIGN time, so a brief the template cannot draw (one the oracle refuses at some checkpoint) is a fill problem the
// correction sees, not a failure at Generate. [] when the build is not a template build or the plan passes; else the problem lines. Zero model calls.
export async function templatePrecheck(plan, ctx) {
  if (!templateGate(ctx.env, plan)?.ok) return [];
  const job = { id: 'precheck', plan, planHash: await planHash(plan), capabilities: ctx.capabilities, evidence: [], oracle: interactOracle(plan) };
  const built = await buildTemplate(job, ctx);
  if (!built.artifacts) return (built.problems ?? ['the template build refused the plan']).map(p => `template build: ${p}`.slice(0, 300));
  const checked = await captureAndCheck({ ...job, artifacts: built.artifacts, composition: built.composition }, { ...ctx, completeCardUnavailable: true, captureCard: headlessCaptureCard(ctx.env) });
  return checked.status === 'failed' ? checked.failure.problems.map(p => `template build: ${p}`.slice(0, 300)) : [];
}
