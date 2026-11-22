// Brief 48: the Build half of the live blueprint path. After the design phase has passed (interact-blueprint-design.js), the blueprint goes to the Build model (Gemini 4 Hydrogen at high, the prompts and the measurements of
// build-mvp1: agents/interactive-blueprint/build/index.js), the answer is the build-schema, the Program writer writes the Program from it and the frames are tested against the frame rules (web/src/interact-build-frames.js: validate,
// headless run, frame rules; motion decoration is tolerated inside the Program). If that fails on something that is not motion decoration, the Build model is called ONCE more with its own build-schema and the sentences, the card is
// rebuilt and tested again; a second failure ends the job with the sentence recorded. A pass becomes the card's plan (planFromBlueprint) and the job's normal path follows. -> { plan, stop?, fast, record }; `record` goes into the design record.
import { buildInputs } from './agents/interactive-blueprint/build/index.js';
import { checkBuilt } from '../../web/src/interact-build-frames.js';
import { planFromBlueprint } from '../../web/src/interact-blueprint-plan.js';
import { callOnce, pairsAsLists } from './interact-blueprint-design.js';
import { schemaProblems } from './interact-model-adapters.js';
import { withoutBounds } from './explanation-fast-chain.js';
import BUILD_SCHEMA from '../../../docs/features/interact/interactive-build-schema.schema.json' with { type: 'json' };
import { parseScenePlan } from '../../web/src/interact-plan.js';

// the schema sent: the reference schema with the one re-expression of Design (a no-op here) and the bounds the provider need not hold dropped; the answer is tested against the full schema below
const sentSchema = () => withoutBounds(pairsAsLists(BUILD_SCHEMA));
const repairMessage = (user, previous, sentences) => `${user}\n\nYour previous build-schema:\n${previous}\n\nThe program wrote the card from it and ran it. It found these problems:\n${sentences.slice(0, 8).map((sentence, k) => `${k + 1}. ${sentence}`).join('\n')}\n\nReturn the whole corrected build-schema. Change only what these problems name.`;
const compact = checked => (checked ? { written: checked.written, bytes: checked.bytes ?? null, validate: checked.validate, frames: { ok: checked.frames.ok, firstSentence: checked.frames.firstSentence, passed: checked.frames.list.filter(entry => entry.ok).length, total: checked.frames.list.length }, dropped: checked.dropped, error: checked.error ?? null } : null);

// one Build call (or its repair): the answer, its schema check and the frame check -> { raw, output, checked, problems }
async function attempt(ctx, blueprint, inputs, input, kind, calls) {
  const answer = await callOnce(ctx, 'blueprint_build', kind, { system: inputs.system, schema: sentSchema(), input });
  calls.push(answer.call);
  if (!answer.output) return { raw: answer.raw, problems: [`the build-schema was not usable: ${answer.error?.message ?? 'no answer'}`] };
  const bounds = schemaProblems(BUILD_SCHEMA, answer.output);
  if (bounds.length) return { raw: answer.raw, output: answer.output, problems: [`the build-schema does not match its schema: ${bounds.slice(0, 5).join('; ')}`] };
  const checked = await checkBuilt({ blueprint, buildSchema: answer.output });
  const sentences = [...new Set(checked.error ? [checked.error] : [...checked.validate.problems, ...checked.frames.list.filter(entry => !entry.ok && entry.sentence).map(entry => entry.sentence)])];
  return { raw: answer.raw, output: answer.output, checked, problems: checked.written && checked.validate.ok && checked.frames.ok ? [] : sentences };
}

export async function buildCard(job, ctx, blueprint, designRecord) {
  const began = Date.now(), calls = [], build = { calls, repair: 'none', first: null, repairAttempt: null, final: null, seconds: 0, costUsd: 0, problems: [] };
  const done = () => { build.seconds = Math.round(Date.now() - began) / 1000; build.costUsd = calls.reduce((total, call) => total + (call.costUsd ?? 0), 0); designRecord.build = build; };
  let inputs;
  try { inputs = await buildInputs(blueprint); } catch (error) { build.problems = [`the Build inputs could not be made: ${String(error.message).slice(0, 300)}`]; done(); return { stop: build.problems[0], record: build }; }
  build.measurements = inputs.measurements;
  const first = await attempt(ctx, blueprint, inputs, inputs.user, 'build', calls);
  build.first = { raw: first.raw, problems: first.problems, checks: compact(first.checked) };
  let final = first;
  if (first.problems.length && first.raw !== null) { // the one repair, only when the provider answered
    const again = await attempt(ctx, blueprint, inputs, repairMessage(inputs.user, first.raw, first.problems), 'repair', calls);
    build.repairAttempt = { raw: again.raw, problems: again.problems, checks: compact(again.checked) };
    build.repair = again.problems.length ? 'failed' : 'fixed'; final = again;
  }
  build.problems = final.problems;
  if (final.problems.length) { done(); return { stop: `the card could not be placed: ${final.problems[0]}`, record: build }; }
  build.final = final.output; build.checks = compact(final.checked);
  const plan = planFromBlueprint(blueprint, final.output, job.depth);
  plan.scene.runtime.catalogueHash = ctx.capabilities.catalogueHash;
  if (final.checked.yRange) plan.scene.data.yRange = final.checked.yRange;
  const parsed = parseScenePlan(plan, ctx.capabilities);
  if (!parsed.ok) { build.problems = parsed.problems.slice(0, 3).map(problem => `${problem.path ?? 'plan'}: ${problem.message}`); done(); return { stop: `the card's plan was refused: ${build.problems[0]}`, record: build }; }
  done();
  return { plan: parsed.value, record: build };
}
