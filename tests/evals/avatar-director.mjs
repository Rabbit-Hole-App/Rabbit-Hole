// Avatar Teacher AV2 live validation (docs/features/rabbit-hole-avatar-teacher-v1-spec.md §5.1, §33): four
// canonical slots through the real Avatar Director and the fresh blind script reviewer, each resolved through
// LEARN_TASKS, plus two unsafe fixtures only the reviewer can catch. Owner GO 2026-10-04: development only, small
// spend. Hand-run, never in CI. No HeyGen call and no video.
//   node tests/evals/avatar-director.mjs [--only A,C] [--no-fixtures] [--out results.json]
// Needs ANTHROPIC_API_KEY (ANTHROPIC_WORKSPACE_ID when set) in the root .env (small-deploy); neither is printed.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anthropic } from '../../packages/control-plane/src/ask.js';
import { LEARN_TASKS, loggedModel } from '../../packages/control-plane/src/learn-models.js';
import { assembleBrief, briefSlotId, prepareScript, runReviewer, scriptProblems, validateBrief } from '../../packages/control-plane/src/learn-avatar-brief.js';
import { AVATAR_REGISTRY, canonicalInput, canonicalRequest, scriptSlotKey } from '../../packages/control-plane/src/learn-avatar-cache.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
const only = flag('--only')?.split(',') ?? null;
const out = flag('--out') || join(here, 'results', `avatar-director-${new Date().toISOString().slice(0, 10)}.json`);

const envFile = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const keyOf = name => envFile.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim() || null;
const env = { ANTHROPIC_API_KEY: keyOf('ANTHROPIC_API_KEY'), ANTHROPIC_WORKSPACE_ID: keyOf('ANTHROPIC_WORKSPACE_ID') ?? undefined };
if (!env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY required in the root .env'); process.exit(1); }

// The owner's four canonical briefs (A-D). "Causal attention" is the registry concept attention.
const CASES = [
  { id: 'A', moment: 'orientation', concept: 'attention', duration_seconds: 8 },
  { id: 'B', moment: 'transition', concept: 'causal-mask', to_concept: 'softmax', duration_seconds: 8 },
  { id: 'C', moment: 'rabbit_hole_return', concept: 'softmax', to_concept: 'attention', duration_seconds: 8 },
  { id: 'D', moment: 'human_explanation', concept: 'score-scaling', duration_seconds: 12 },
].filter(entry => !only || only.includes(entry.id));
// Unsafe scripts that pass the deterministic rules, so only the reviewer can block them.
const FIXTURES = args.includes('--no-fixtures') ? [] : [
  { id: 'F1', against: 'A', expect: 'unsupported_claim', text: 'Welcome to attention. It was invented at Google in 2017, and each character also reads the ones after it.' },
  { id: 'F2', against: 'B', expect: 'mastery_claim', text: 'Great work, you are now an expert on the causal mask. Next comes softmax.' },
];
// $ per million tokens (claude-api skill model table, cached 2026-09-25). Opus 5.5 always thinks: output_tokens includes it.
const PRICE = { 'claude-opus-5-5': { input: 4, output: 20, cache_read: 0.2, cache_write: 5 } };
const MAX_CALLS = 24; // the spend cap: every case at its worst (director + re-ask, review + re-ask, one repair) plus the fixtures
// Placeholder profiles, to show the provider-facing input only: AV1 picks the real look and voice.
const RENDER = { avatar_profile: 'rh-teacher-1', voice_profile: 'rh-voice-1', tone: 'warm', framing: 'head_shoulders', expressiveness: 'low', background_mode: 'solid', presentation: 'card', output: { alpha: false, aspect_ratio: '16:9', resolution: '720p' }, captions: true };

const calls = [];
const caller = (task, label) => async request => {
  if (calls.length >= MAX_CALLS) throw new Error(`call cap ${MAX_CALLS} reached`);
  const model = LEARN_TASKS[task].model, started = performance.now();
  const response = await loggedModel(task, anthropic)(env, request, model, null);
  const ms = Math.round(performance.now() - started);
  if (!response.ok) { calls.push({ label, task, ms, status: response.status }); throw new Error(`${task} HTTP ${response.status}`); }
  const message = await response.json();
  const usage = message.usage || {}, price = PRICE[message.model] || PRICE[model];
  const cost = ((usage.input_tokens || 0) * price.input + (usage.output_tokens || 0) * price.output
    + (usage.cache_read_input_tokens || 0) * price.cache_read + (usage.cache_creation_input_tokens || 0) * price.cache_write) / 1e6;
  calls.push({ label, task, ms, requested_model: model, served_model: message.model, stop_reason: message.stop_reason, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_usd: Math.round(cost * 1e5) / 1e5 });
  return message;
};
const sum = (list, key) => list.reduce((total, entry) => total + (entry[key] || 0), 0);
const sentences = text => text.trim().split(/(?<=[.!?])\s+/).filter(Boolean).length;

const results = [];
for (const entry of CASES) {
  const request = canonicalRequest(entry), input = canonicalInput(request);
  const before = calls.length, started = performance.now();
  const prepared = await prepareScript({ director: caller('avatar_director', entry.id), reviewer: caller('avatar_script_reviewer', entry.id) }, input);
  const own = calls.slice(before);
  const result = {
    id: entry.id, moment: entry.moment, concept: entry.concept, to_concept: entry.to_concept ?? null, slot: briefSlotId(request.slot),
    script_key: await scriptSlotKey(request.slot), limits: input.limits, status: prepared.status, trace: prepared.trace,
    ms: Math.round(performance.now() - started), calls: own, cost_usd: Math.round(sum(own, 'cost_usd') * 1e5) / 1e5,
  };
  if (prepared.status === 'ok') {
    const brief = assembleBrief(request.slot, prepared, { render: RENDER, resolved_model: own.find(call => call.task === 'avatar_director')?.served_model ?? LEARN_TASKS.avatar_director.model, created_at: new Date().toISOString() });
    let briefValid;
    try { validateBrief(brief, AVATAR_REGISTRY); briefValid = true; } catch (error) { briefValid = error.message; }
    const known = new Set(request.slot.source_refs.map(ref => ref.id));
    Object.assign(result, {
      script: prepared.script, teaching_goal: prepared.teaching_goal, cited: prepared.script.source_ref_ids.map(id => request.slot.source_refs.find(ref => ref.id === id)),
      checks: {
        brief_valid: briefValid, rule_problems: scriptProblems(prepared.script.text, input.limits.duration_seconds),
        words: `${prepared.script.words}/${input.limits.max_words}`, sentences: `${sentences(prepared.script.text)}/${input.limits.max_sentences}`,
        grounded: prepared.script.source_ref_ids.every(id => known.has(id)), reviewer_blocking: prepared.trace.filter(step => step.step === 'review').map(step => step.blocking),
        repaired: prepared.trace.some(step => step.step === 'repair'), format_retries: sum(prepared.trace, 'format_retries'),
      },
      // Exactly what the provider would receive besides the render settings: the final script text.
      provider_text: brief.script.text,
    });
  } else Object.assign(result, { stage: prepared.stage, errors: prepared.errors ?? null, blocking: prepared.blocking ?? null });
  results.push(result);
  console.log(`${entry.id} ${entry.moment} ${result.slot}: ${result.status}${result.script ? ` - "${result.script.text}" (${result.checks.words} words, ${result.checks.sentences} sentences)` : ` at ${result.stage}`} ${result.ms} ms $${result.cost_usd}`);
}

const fixtures = [];
for (const fixture of FIXTURES) {
  const base = CASES.find(entry => entry.id === fixture.against) || { moment: 'orientation', concept: 'attention' };
  const before = calls.length, started = performance.now();
  const review = await runReviewer(caller('avatar_script_reviewer', fixture.id), fixture.text, canonicalInput(canonicalRequest(base)));
  const own = calls.slice(before);
  const categories = review.blocking?.map(finding => finding.category) ?? null;
  fixtures.push({ ...fixture, rule_problems: scriptProblems(fixture.text, 8), status: review.status, blocking: review.blocking ?? null, caught: !!categories?.includes(fixture.expect), ms: Math.round(performance.now() - started), calls: own, cost_usd: Math.round(sum(own, 'cost_usd') * 1e5) / 1e5 });
  console.log(`${fixture.id} expect ${fixture.expect}: ${categories ? categories.join(', ') || 'passed (missed)' : review.status} ${fixtures.at(-1).ms} ms`);
}

const totals = {
  calls: calls.length, input_tokens: sum(calls, 'input_tokens'), output_tokens: sum(calls, 'output_tokens'), cost_usd: Math.round(sum(calls, 'cost_usd') * 1e4) / 1e4,
  director_ms: calls.filter(call => call.task === 'avatar_director').map(call => call.ms), reviewer_ms: calls.filter(call => call.task === 'avatar_script_reviewer').map(call => call.ms),
};
writeFileSync(out, `${JSON.stringify({ run_at: new Date().toISOString(), tasks: { avatar_director: LEARN_TASKS.avatar_director.model, avatar_script_reviewer: LEARN_TASKS.avatar_script_reviewer.model }, cases: results, fixtures, totals }, null, 2)}\n`);
console.log(`totals: ${totals.calls} calls, ${totals.input_tokens} in / ${totals.output_tokens} out tokens, $${totals.cost_usd} -> ${out}`);
