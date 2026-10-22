// /explain v2 authoring and deterministic validation (EXP-T17). Stages of the ExplainJobs pipeline (explain-job.js): author
// (explain_author writes a VisualSpec from Lane A's registry) and validate (trusted compile plus the existing scene gates,
// evidence and example checks, and capability gaps). The independent image review is Lane D's explain-review.js. Every model call goes through ctx.call: the job's admitted, fenced,
// counted role call.
import { catalogue } from '../../web/src/visual-components/registry.js';
import { compileVisual } from '../../web/src/visual-components/compile.js';
import { EXAMPLES } from '../../web/src/visual-components/examples/index.js';
import { sceneProblem } from './learn-scene-gates.js';
import { authorTool, EXPLAIN_AUTHOR_SYSTEM, GAP_NEEDS } from './agents/explain-author.js';
import { ExplainPolicyError, callExplainRole } from './explain-policy.js';

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
// The spec and scene limits the author is told and the compiler enforces (explain-contract.js visualSpecSchema;
// animation-scene.js: 240 objects, 60 on screen per part).
export const SPEC_LIMITS = Object.freeze({ components: 40, connections: 80, parts: 4, objectsTotal: 240, objectsPerPart: 60 });
const MAX_EXAMPLES = 2;

// What the compiler can draw now, found by compiling the smallest spec that uses each feature: the author prompt and the gap
// check read the same answer, and it changes by itself when Lane A's compiler learns a feature (T04-M2, T26-M2).
const probe = extra => {
  const spec = { version: 1, id: 'probe', title: 'Probe', components: [{ id: 'a', component: 'module', version: 1, params: { label: 'A' } }, { id: 'b', component: 'module', version: 1, params: { label: 'B' } }], presentation: { mode: 'static' }, ...extra };
  try { compileVisual(spec); return true; } catch { return false; }
};
let support = null;
export function compilerSupport() {
  support ??= Object.freeze({
    static: probe({}),
    time: probe({ presentation: { mode: 'time', duration: 4 } }),
    math: probe({ components: [{ id: 'a', component: 'module', version: 1, params: { label: { runs: [{ kind: 'math', tex: 'x^2' }] } } }] }),
    steps: probe({ presentation: { mode: 'steps', steps: [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two' }] } }),
    experiment: probe({ presentation: { mode: 'static', experiments: [{ id: 'e', purpose: 'Compare.', input: 'n', domain: { values: [1, 2] }, affects: ['a'], contrasts: ['More.'] }] } }),
  });
  return support;
}

// The features a spec uses that the compiler cannot draw: a capability gap, never a repair and never a degraded card.
const hasMath = value => Array.isArray(value) ? value.some(hasMath) : plain(value) ? (Array.isArray(value.runs) && value.runs.some(run => run?.kind === 'math')) || Object.values(value).some(hasMath) : false;
export function capabilityGaps(spec) {
  const can = compilerSupport(), needs = [];
  if (!can.math && hasMath(spec)) needs.push('math');
  if (!can.steps && spec?.presentation?.mode === 'steps') needs.push('steps');
  if (!can.experiment && spec?.presentation?.experiments?.length) needs.push('experiment');
  return needs;
}
const NEEDS_WORDS = { math: 'typeset math', steps: 'named steps', experiment: 'an interactive experiment', component: 'a kind of diagram that is not available yet', evidence: 'a source that is not available' };
export function capabilityGap(needs, reason, source) {
  const known = [...new Set(needs.filter(need => GAP_NEEDS.includes(need)))];
  if (!known.length) known.push('other');
  const words = known.filter(need => NEEDS_WORDS[need]).map(need => NEEDS_WORDS[need]);
  const message = words.length ? `This explanation needs ${words.join(' and ')}, which is not supported yet. Ask for a simpler explanation or edit the request.` : 'This explanation needs something that is not supported yet. Edit the request.';
  return { capability: 'explain', needs: known, source, message, reason: typeof reason === 'string' ? reason.trim().slice(0, 400) : null };
}

// Explicit ExampleSelection: bundled example ids, at most two; empty works. Composition guidance only, never facts.
export function selectExamples(ids = []) {
  if (!Array.isArray(ids) || ids.length > MAX_EXAMPLES) throw new ExplainPolicyError('examples', `Choose at most ${MAX_EXAMPLES} examples.`);
  return ids.map(id => {
    if (typeof id !== 'string' || !Object.hasOwn(EXAMPLES, id)) throw new ExplainPolicyError('examples', `Unknown example ${String(id).slice(0, 40)}.`);
    return { id, spec: EXAMPLES[id] };
  });
}

// Text that the author saw: anything in the spec must come from here, not from an example.
const strings = (value, out = []) => { if (typeof value === 'string') out.push(value); else if (Array.isArray(value)) value.forEach(v => strings(v, out)); else if (plain(value)) Object.values(value).forEach(v => strings(v, out)); return out; };
const norm = text => text.toLowerCase().replace(/\s+/g, ' ').trim();
const LONG = 20; // a phrase this long matching an example verbatim is copied, not composed
export function exampleContamination(spec, examples, allowed) {
  const source = norm(strings(allowed).join(' \n '));
  const phrases = examples.flatMap(example => strings(example.spec).map(norm).filter(text => text.length >= LONG && !source.includes(text)));
  const copied = strings(spec).map(norm).find(text => phrases.some(phrase => text.includes(phrase)));
  return copied ? `The explanation copies wording from an example ("${copied.slice(0, 80)}"): examples show composition only; write it from the request and evidence` : null;
}
export function evidenceProblem(spec, evidence = []) {
  const known = new Set(evidence.map(record => record.id));
  const used = [...(spec?.components || []).flatMap(item => item?.evidence || []), ...(spec?.evidence || []).flatMap(binding => binding?.evidence || [])];
  const unknown = used.find(id => !known.has(id));
  return unknown === undefined ? null : `Evidence "${String(unknown).slice(0, 64)}" is not one of the records provided: bind claims only to the evidence ids given`;
}

// One author call. input: { prompt, brief, context, evidence, examples (ids) }; cat and limits default to the registry's.
async function authorCall(input, ctx, { cat = catalogue(), limits = SPEC_LIMITS } = {}) {
  const examples = selectExamples(input.examples || []);
  const content = JSON.stringify({
    request: input.prompt, brief: input.brief ?? null, context: input.context ?? null,
    evidence: (input.evidence || []).map(({ id, kind, location, excerpt, page, lines, limitations }) => ({ id, kind, location, excerpt, page, lines, limitations })),
    catalogue: cat, supported: compilerSupport(), limits,
    examples: examples.map(({ id, spec }) => ({ id, use: 'composition only, never facts', spec })),
  });
  const out = await ctx.call('author', { system: EXPLAIN_AUTHOR_SYSTEM, tool: authorTool(cat), content });
  const { input: reply } = out;
  if (reply.kind === 'capability_gap') {
    if (!Array.isArray(reply.gap?.needs) || !reply.gap.needs.length) throw new ExplainPolicyError('invalid_turn', 'The author reported a gap without saying what is needed.');
    return { gap: capabilityGap(reply.gap.needs, reply.gap.reason, 'author'), call: out };
  }
  if (reply.kind !== 'spec' || !plain(reply.spec)) throw new ExplainPolicyError('invalid_turn', 'The author returned no spec.');
  return { spec: reply.spec, call: out };
}
// The job's author stage (explain-job.js pipeline).
export async function authorStage(job, ctx) {
  // The card's presentation setting at Generate overrides the brief's.
  const brief = job.brief && job.settings?.presentation ? { ...job.brief, presentation: job.settings.presentation } : job.brief;
  const { spec, gap } = await authorCall({ prompt: job.prompt, brief, context: job.context, evidence: job.evidence, examples: job.examples }, ctx);
  return gap ? { gap } : { spec };
}

// Standalone, for dev tooling (Lane D's prompt -> spec -> render script; C:/s/spec/explain/e2e-demo.md) and the M3 harness:
// one author call, then the same trusted validation the job runs. callModel(env, body, model, org) is the caller's
// transport (no default: the caller owns admission and the spend record). ->
//   { kind: 'spec', spec, compiled, identity, usage } | { kind: 'gap', gap, identity, usage } | { kind: 'invalid', spec, problems, identity, usage }
export async function authorExplanation(prompt, { env = {}, callModel, catalogue: cat, limits, examples = [], evidence = [], context = null, brief = null } = {}) {
  const ctx = { env, call: (role, request) => callExplainRole(env, role, request, { callModel }) };
  const authored = await authorCall({ prompt, brief, context, evidence, examples }, ctx, { cat, limits });
  const meta = { identity: authored.call.identity, usage: authored.call.usage };
  if (authored.gap) return { kind: 'gap', gap: authored.gap, ...meta };
  const checked = validateStage({ spec: authored.spec, prompt, brief, context, evidence, examples });
  if (checked.gap) return { kind: 'gap', gap: checked.gap, ...meta };
  if (checked.problems) return { kind: 'invalid', spec: authored.spec, problems: checked.problems, ...meta };
  return { kind: 'spec', spec: authored.spec, compiled: checked.compiled, ...meta };
}

// Trusted checks, no model call: capability gaps first (nothing to repair), then evidence and example provenance, the
// compiler (registry, parameters, limits, anchors) and the scene gates every generated scene passes (sceneProblem).
export function validateStage(job) {
  const needs = capabilityGaps(job.spec);
  if (needs.length) return { gap: capabilityGap(needs, null, 'compiler') };
  const problems = [];
  const evidence = evidenceProblem(job.spec, job.evidence);
  if (evidence) problems.push(evidence);
  const copied = exampleContamination(job.spec, selectExamples(job.examples || []), [job.prompt, job.brief, job.context, (job.evidence || []).map(record => record.excerpt)]);
  if (copied) problems.push(copied);
  let compiled = null;
  try { compiled = compileVisual(job.spec); } catch (error) { problems.push(String(error.message).slice(0, 400)); }
  if (compiled) { const problem = sceneProblem(compiled.scene); if (problem) problems.push(problem); }
  return problems.length ? { problems, category: 'spec', repairable: true } : { compiled };
}

// The facts a spec states, as the reviewer reads them beside the images: every text value it carries.
export const specFacts = spec => [...new Set(strings({ title: spec?.title, components: (spec?.components || []).map(item => ({ params: item.params, label: item.label })), connections: (spec?.connections || []).map(link => link.label) }).map(text => text.trim()).filter(Boolean))];
