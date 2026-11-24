// Brief 39 (MVP 2): the interactive-blueprint design phase as a live job, INTERACT_DESIGN_KIND=blueprint. It is the seeded arm of MVP 1 (scripts/interact/bench-blueprint.mjs) on the job's own prompt and depth:
//   the quantities call (spec 7.8), dice over the control quantities the model named (spec 8) from seededRandom(job.flow.seed), the blueprint call with the settled relationship and quantities, the light checker
//   all ten checks of interact-blueprint-check.js (brief 43, for the owner's measurement: this reverses brief 42's split, which ran 1 to 9 and left check 10 to Build), and at most one correction call with the problems of whichever check failed. The prompt files and the schema are MVP 1's, unchanged; nothing here knows the prompt.
// The job stops after this phase and never enters Build. -> { blueprint: record, final }; `final` is the parsed blueprint that passed all ten checks (null when none did), saved by the job as its own JSON beside the record; the record is the run record: every answer exactly as returned (the message text, not parsed), the dice, the checker outputs, per call seconds, tokens and cost.
// A call that fails before it can be answered is recorded with its reason and its problems; one that spent nothing (a refused admission) is the job's, as in the fast path.
import { providerSchema, quantitiesProviderSchema, quantitiesSchema as quantitiesForm } from '../../web/src/interact-blueprint.js';
import { issuesToProblems } from '../../web/src/interact-blueprint-form.js';
import { checkBlueprint } from '../../web/src/interact-blueprint-check.js';
import { seededRandom } from '../../web/src/tutor-diagrams/random.js';
import { withoutBounds } from './explanation-fast-chain.js';
import { InteractModelError } from './interact-model-adapters.js';
import { priceUsage } from './pricing-registry.js';
import { blueprintPrompt, correctionMessage, quantitiesCorrectionMessage, quantitiesMessage, quantitiesPrompt, seededMessage } from './agents/interactive-blueprint/index.js';

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
export async function callOnce(ctx, role, kind, args) {
  const began = Date.now(); let done = null, error = null;
  try { done = await ctx.interact(role, args); } catch (e) { if (!(e instanceof InteractModelError) || e.code === 'spend_refused') throw e; error = e; }
  const answer = done ?? error, tokens = tokensOf(answer?.usage?.raw ?? null);
  // The adapter also checks the answer against the sent schema, including string lengths, which MVP 1 left to the checker (a sentence the correction can act on). An answer it refuses on its schema alone, that parses as one JSON object, goes to the checker as it was
  // returned; truncation, refusal, fenced or malformed text stay failed calls. The refusal is kept in the call's row.
  let output = done?.output ?? null, refusal = null;
  if (error?.code === 'schema_mismatch' && typeof answer.raw === 'string') {
    try { const parsed = JSON.parse(answer.raw); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) { output = parsed; refusal = `${error.code}: ${String(error.message).slice(0, 400)}`; error = null; } } catch { /* not JSON: the call stays failed */ }
  }
  return { output, raw: answer?.raw ?? null, error,
    call: { kind, role, ok: !error, ...(refusal ? { adapterRefusal: refusal } : {}), seconds: (Date.now() - began) / 1000, finish: answer?.stopReason ?? answer?.stopRaw ?? null, served: answer?.served?.model ?? null, tokens, costUsd: error?.code === 'unknown_outcome' ? null : costOf(tokens),
      ...(error ? { error: `${error.code}: ${String(error.message).slice(0, 400)}`, ...(error.problems ? { adapterProblems: error.problems.slice(0, 12) } : {}) } : {}) } };
}
const refused = (error, what) => ({ ok: false, failed: 1, problems: [{ check: 1, path: '', message: `${what} was not usable: ${error?.message ?? 'no answer'}` }], measured: null });
async function checked(answer, settled) {
  try { return await checkBlueprint(answer, { seeded: settled }); } catch (e) { return { ok: false, failed: 0, problems: [{ check: 0, path: '', message: `the checker could not run: ${String(e?.message ?? e).slice(0, 300)}` }], measured: null, checkerError: true }; }
}

// The first call's answer is the part of the blueprint the Design call must copy exactly (check 2), so a limit it breaks can never be fixed later: check 1 would want it shorter and check 2 unchanged (job ej_89e4480162a445d4b52446f4c55e2eea: a 41 character formula,
// limit 40; 137 s and $0.26 of Design for nothing). It is tested here against the same form and in the same sentences as check 1 (the adapter's own refusal is not relied on). -> { ok, problems }
// No rule on what a formula draws (owner, 2026-11-24: a formula is not limited by the card's boxes, the card makes room for it): its limit is the form's, 200 characters, the engine's own.
export function planCheck(output) {
  const parsed = quantitiesForm.safeParse(output);
  return parsed.success ? { ok: true, problems: [] } : { ok: false, problems: issuesToProblems(output, parsed.error.issues).map(problem => problem.message) };
}
// Every given string is trimmed before the check and before settle, so Design is given (and copies) the trimmed text. A formula with a trailing space is measured as plain text by textWidth (T = 2\pi\sqrt{L/g} is 99 px, with a trailing space 183 px), so Build would be told a wrong width.
// The record keeps the answer exactly as returned (quantities.raw); the settled relationship and quantities are the trimmed ones.
export const trimGiven = value => (typeof value === 'string' ? value.trim() : Array.isArray(value) ? value.map(trimGiven) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, trimGiven(entry)])) : value);

export async function blueprintDesign(job, ctx) {
  const depth = job.depth, seed = job.flow.seed, began = Date.now(), calls = [];
  const record = { kind: 'blueprint', version: BLUEPRINT_RECORD_VERSION, jobId: job.id, prompt: job.prompt, depth, seed, model: MODEL, effort: EFFORT, quantities: null, dice: null, settled: null, planChecks: null, blueprint: { first: null, corrected: null, final: null }, checks: { first: null, corrected: null }, passed: false, problems: [], calls, seconds: 0, costUsd: 0 };
  const end = (problems, final = null) => { record.problems = problems; record.seconds = Math.round(Date.now() - began) / 1000; record.costUsd = calls.reduce((t, c) => t + (c.costUsd ?? 0), 0); return { blueprint: record, final }; };

  // The first call, and its one correction when the answer breaks a limit of the form (only when the provider answered). quantities.raw is the answer that was used; first and corrected are kept as blueprint.first and blueprint.corrected are; planChecks as checks are.
  const firstPlan = quantitiesMessage(job.prompt, depth), askPlan = async input => { const answer = await callOnce(ctx, 'blueprint_quantities', 'quantities', { system: quantitiesPrompt(depth), schema: quantitiesSchema(), input }); if (answer.output) answer.output = trimGiven(answer.output); return answer; };
  const usable = answer => answer.output && Array.isArray(answer.output.quantities) && answer.output.relationship, unusable = (answer, which) => [`the ${which}quantities answer was not usable: ${answer.error?.message ?? 'it has no relationship or no quantities'}`];
  let q = await askPlan(firstPlan);
  calls.push(q.call); record.quantities = { raw: q.raw, first: { raw: q.raw }, corrected: null, final: 'first' }; record.planChecks = { first: null, corrected: null };
  if (!usable(q)) return end(unusable(q, ''));
  record.planChecks.first = planCheck(q.output);
  if (!record.planChecks.first.ok) {
    if (q.raw === null) return end(record.planChecks.first.problems);
    const fixed = await askPlan(quantitiesCorrectionMessage(firstPlan, q.raw, record.planChecks.first.problems)); calls.push(fixed.call);
    record.quantities.corrected = { raw: fixed.raw }; record.quantities.raw = fixed.raw;
    if (!usable(fixed)) return end(unusable(fixed, 'corrected '));
    record.planChecks.corrected = planCheck(fixed.output);
    if (!record.planChecks.corrected.ok) return end(record.planChecks.corrected.problems); // no Design call on an answer it cannot copy
    q = fixed; record.quantities.final = 'corrected';
  }
  const ids = q.output.quantities.filter(entry => entry.role === 'control').map(entry => entry.id);
  if (!ids.length) { record.dice = { controlQuantities: ids, n: 0, skipped: 'the model marked no quantity as a control' }; return end(['the model marked no quantity as a control, so there is nothing to roll']); }
  record.dice = rollDice(ids, seed); record.settled = settle(q.output, record.dice.ids);

  const first = seededMessage(job.prompt, depth, record.settled), ask = input => callOnce(ctx, 'blueprint_design', 'blueprint', { system: blueprintPrompt(depth), schema: blueprintSchema(), input });
  const b1 = await ask(first); calls.push(b1.call); record.blueprint.first = { raw: b1.raw };
  record.checks.first = b1.output ? await checked(b1.output, record.settled) : refused(b1.error, 'The answer');
  if (record.checks.first.ok) { record.passed = true; record.blueprint.final = 'first'; return end([], b1.output); }
  if (record.checks.first.checkerError) return end(record.checks.first.problems.map(problem => problem.message)); // the checker failing is not the model's fault: no correction

  // one correction, only when the provider answered (a call that failed without an answer says the same again)
  if (b1.raw === null) return end(record.checks.first.problems.map(problem => problem.message));
  const b2 = await ask(correctionMessage(first, b1.raw, record.checks.first.problems.map(problem => problem.message))); calls.push(b2.call); record.blueprint.corrected = { raw: b2.raw };
  record.checks.corrected = b2.output ? await checked(b2.output, record.settled) : refused(b2.error, 'The corrected answer');
  if (record.checks.corrected.ok) { record.passed = true; record.blueprint.final = 'corrected'; return end([], b2.output); }
  return end(record.checks.corrected.problems.map(problem => problem.message));
}
