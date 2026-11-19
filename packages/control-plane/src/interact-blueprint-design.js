// Brief 39 (MVP 2): the interactive-blueprint design phase as a live job, INTERACT_DESIGN_KIND=blueprint. It is the seeded arm of MVP 1 (scripts/interact/bench-blueprint.mjs) on the job's own prompt and depth:
//   the quantities call (spec 7.8), dice over the control quantities the model named (spec 8) from seededRandom(job.flow.seed), the blueprint call with the settled relationship and quantities, the light checker
//   (form, names, the function in QuickJS, claims), and at most one correction call. The prompt files and the schema are MVP 1's, unchanged; nothing here knows the prompt.
// The job stops after this phase and never enters Build. -> { blueprint: record }; the record is the run record: every answer exactly as returned (the message text, not parsed), the dice, the checker outputs, per call seconds, tokens and cost.
// A call that fails before it can be answered is recorded with its reason and its problems; one that spent nothing (a refused admission) is the job's, as in the fast path.
import { providerSchema, quantitiesProviderSchema } from '../../web/src/interact-blueprint.js';
import { checkBlueprint } from '../../web/src/interact-blueprint-check.js';
import { seededRandom } from '../../web/src/tutor-diagrams/random.js';
import { withoutBounds } from './explanation-fast-chain.js';
import { InteractModelError } from './interact-model-adapters.js';
import { priceUsage } from './pricing-registry.js';
import { blueprintPrompt, correctionMessage, quantitiesMessage, quantitiesPrompt, seededMessage } from './agents/interactive-blueprint/index.js';

export const BLUEPRINT_RECORD_VERSION = 1;
const MODEL = 'gemini-4-hydrogen', EFFORT = 'high';

// Spec 7.9, the one re-expression MVP 1 used (bench-blueprint.mjs pairsAsLists): Google refuses a tuple (`items: [a, b]`), so a pair is written as a two-item list whose items may be either; the checker tests each position.
export function pairsAsLists(node) {
  if (Array.isArray(node)) return node.map(pairsAsLists);
  if (!node || typeof node !== 'object') return node;
  const out = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, pairsAsLists(v)]));
  if (Array.isArray(out.items)) { out.items = { anyOf: out.items }; delete out.additionalItems; }
  return out;
}
// What is sent: MVP 1's schemas (the adapter turns exclusive oneOf into anyOf itself). Bounds are dropped as MVP 1 dropped them; the checker holds them.
const blueprintSchema = () => withoutBounds(pairsAsLists(providerSchema())), quantitiesSchema = () => withoutBounds(quantitiesProviderSchema());

// Spec 8, as bench-blueprint.mjs rollDice for ONE seed (a live job has no earlier pick to repeat): k from 1 to min(3, n), then k of the n control quantities, both from seededRandom(seed). Replaying a stored seed gives the same pick.
export function rollDice(controlIds, seed) {
  const n = controlIds.length, random = seededRandom(seed), k = 1 + Math.floor(random() * Math.min(3, n)), pool = [...controlIds];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const ids = controlIds.filter(id => pool.slice(0, k).includes(id));
  return { controlQuantities: controlIds, n, k: ids.length, ids };
}
export const settle = (given, ids) => ({ relationship: given.relationship, quantities: given.quantities.map(entry => (entry.role === 'control' && !ids.includes(entry.id) ? { ...entry, role: 'fixed' } : entry)) });

// Hydrogen bills thinking as output and reports it beside completion_tokens, so output is the larger of completion_tokens and total - prompt (as /explain's chain and MVP 1 count it).
export function tokensOf(raw) {
  if (!raw || !Number.isSafeInteger(raw.prompt_tokens)) return null;
  const input = raw.prompt_tokens, completion = raw.completion_tokens ?? 0, billed = Math.max(completion, (raw.total_tokens ?? 0) - input), thinking = raw.completion_tokens_details?.reasoning_tokens ?? Math.max(0, billed - completion);
  return { input, thinking, output: billed - thinking, billed };
}
const costOf = tokens => { const priced = tokens && priceUsage({ provider: 'google', model: MODEL, tier: 'standard', quantities: { input: tokens.input, output: tokens.billed, cache_read: 0 } }); return priced ? priced.micros / 1e6 : null; };

// One model call through the job's admitted adapter (ctx.interact). -> { output, raw (the message text exactly as returned, when the provider answered), error, call (the row of the record) }.
async function callOnce(ctx, role, kind, args) {
  const began = Date.now(); let done = null, error = null;
  try { done = await ctx.interact(role, args); } catch (e) { if (!(e instanceof InteractModelError) || e.code === 'spend_refused') throw e; error = e; }
  const answer = done ?? error, tokens = tokensOf(answer?.usage?.raw ?? null);
  return { output: done?.output ?? null, raw: answer?.raw ?? null, error,
    call: { kind, role, ok: !error, seconds: (Date.now() - began) / 1000, finish: done?.stopReason ?? error?.stopRaw ?? null, served: answer?.served?.model ?? null, tokens, costUsd: error?.code === 'unknown_outcome' ? null : costOf(tokens),
      ...(error ? { error: `${error.code}: ${String(error.message).slice(0, 400)}`, ...(error.problems ? { adapterProblems: error.problems.slice(0, 12) } : {}) } : {}) } };
}
const refused = (error, what) => ({ ok: false, failed: 1, problems: [{ check: 1, path: '', message: `${what} was not usable: ${error?.message ?? 'no answer'}` }], measured: null });
async function checked(answer, settled) {
  try { return await checkBlueprint(answer, { seeded: settled, light: true }); } catch (e) { return { ok: false, failed: 0, problems: [{ check: 0, path: '', message: `the checker could not run: ${String(e?.message ?? e).slice(0, 300)}` }], measured: null, checkerError: true }; }
}

export async function blueprintDesign(job, ctx) {
  const depth = job.depth, seed = job.flow.seed, began = Date.now(), calls = [];
  const record = { kind: 'blueprint', version: BLUEPRINT_RECORD_VERSION, jobId: job.id, prompt: job.prompt, depth, seed, model: MODEL, effort: EFFORT, quantities: null, dice: null, settled: null, blueprint: { first: null, corrected: null, final: null }, checks: { first: null, corrected: null }, passed: false, problems: [], calls, seconds: 0, costUsd: 0 };
  const end = problems => { record.problems = problems; record.seconds = Math.round(Date.now() - began) / 1000; record.costUsd = calls.reduce((t, c) => t + (c.costUsd ?? 0), 0); return { blueprint: record }; };

  const q = await callOnce(ctx, 'blueprint_quantities', 'quantities', { system: quantitiesPrompt(depth), schema: quantitiesSchema(), input: quantitiesMessage(job.prompt, depth) });
  calls.push(q.call); record.quantities = { raw: q.raw };
  if (!q.output || !Array.isArray(q.output.quantities) || !q.output.relationship) return end([`the quantities answer was not usable: ${q.error?.message ?? 'it has no relationship or no quantities'}`]);
  const ids = q.output.quantities.filter(entry => entry.role === 'control').map(entry => entry.id);
  if (!ids.length) { record.dice = { controlQuantities: ids, n: 0, skipped: 'the model marked no quantity as a control' }; return end(['the model marked no quantity as a control, so there is nothing to roll']); }
  record.dice = rollDice(ids, seed); record.settled = settle(q.output, record.dice.ids);

  const first = seededMessage(job.prompt, depth, record.settled), ask = input => callOnce(ctx, 'blueprint_design', 'blueprint', { system: blueprintPrompt(depth), schema: blueprintSchema(), input });
  const b1 = await ask(first); calls.push(b1.call); record.blueprint.first = { raw: b1.raw };
  record.checks.first = b1.output ? await checked(b1.output, record.settled) : refused(b1.error, 'The answer');
  if (record.checks.first.ok) { record.passed = true; record.blueprint.final = 'first'; return end([]); }

  // one correction, only when the provider answered (a call that failed without an answer says the same again)
  if (b1.raw === null) return end(record.checks.first.problems.map(problem => problem.message));
  const b2 = await ask(correctionMessage(first, b1.raw, record.checks.first.problems.map(problem => problem.message))); calls.push(b2.call); record.blueprint.corrected = { raw: b2.raw };
  record.checks.corrected = b2.output ? await checked(b2.output, record.settled) : refused(b2.error, 'The corrected answer');
  if (record.checks.corrected.ok) { record.passed = true; record.blueprint.final = 'corrected'; return end([]); }
  return end(record.checks.corrected.problems.map(problem => problem.message));
}
