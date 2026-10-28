// Reprice of the program path (explain sandbox plan section 4, Task 6): the REAL author, review and repair requests, serialized
// with the program prompts, schema, SDK description and limits, measured with the policy's own estimator (checkExplainRequest ->
// requestSpendBound) against each role's unchanged ceiling. Nothing here calls a model. The ceilings are pinned: raising one
// (tokens, images, calls) must come with the reservation, quote and consent tests, so a change fails here first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { authorStage } from '../src/explain-author.js';
import { buildReviewContent, REVIEW_LIMITS, REVIEW_PROGRAM_RULES, REVIEW_SYSTEM, REVIEW_TOOL } from '../src/explain-review.js';
import { EXPLAIN_LIMITS, EXPLAIN_ROLES, checkExplainRequest, explainRequest, explainReservation, roleBoundMicros } from '../src/explain-policy.js';
import { programFitProblems, programRepairContent } from '../src/explain-program-stage.js';
import { EXPLAIN_REPAIR_PROGRAM_SYSTEM, REPAIR_PROGRAM_TOOL } from '../src/agents/explain-repair.js';
import { buildProgramArtifact, programFacts, PROGRAM_LIMITS } from '../src/explain-program.js';
import { requestSpendBound } from '../src/learn-spend.js';
import { MESSAGE_LIMIT } from '../src/learn-models.js';

const ENV = { EXPLAIN_PROGRAM_ENABLED: 'true' };
const PER_BYTE = 5; // micro-USD per request byte: 4 USD per MTok input x 1.25 cache-write factor (explain-policy.js CACHE_WRITE)
const bytes = text => new TextEncoder().encode(text).length;
const boundOf = body => Math.round(requestSpendBound(body, 'claude-opus-5-5') * 1e6);
// Bytes of text still free in a request, given the role's ceiling: the images it carries are charged at 4,784 tokens each and an
// unused image slot is text room (the policy bound is (maxInput + maxImages x 4784) x price).
const headroom = (role, body) => Math.floor((roleBoundMicros(role) - boundOf(body)) / PER_BYTE);

// Generic JavaScript at a typical density of quotes, newlines and operators (a hand-made stand-in for generated source: it
// contains no subject, and is filler for size, not an example of generation).
function typicalSource(size) {
  const unit = i => `  var v${i} = clamp(inputs.a${i % 3} * time + ${i}, 0, 100);\n  objects.push(sdk.line("l${i}", 40, ${i * 7 % 300}, 40 + v${i}, ${i * 11 % 300}, { role: "output" }));\n  objects.push(sdk.text("t${i}", 40, ${i * 7 % 300}, "v${i} = " + sdk.format(v${i}, 2)));\n`;
  let out = 'function evaluate({ inputs, time }) {\n  var objects = [];\n', i = 0;
  while (bytes(out) < size - 80) out += unit(i++);
  return `${out}  return { frame: sdk.frame(objects), quantities: {} };\n}\n`.slice(0, size);
}
const quotesOnly = size => `function evaluate(){ return "${'\\"'.repeat(Math.floor(size / 2) - 40)}"; }`;
const MANIFEST = { title: 'Generic', summary: 'A generic program.', assumptions: ['One idealisation.'], description: 'A generic picture.',
  inputs: [{ type: 'number', id: 'a0', label: 'First', default: 1, min: 0, max: 10 }, { type: 'select', id: 's', label: 'Mode', default: 'x', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] }], duration: 8,
  readouts: [{ id: 'r', label: 'Reading', decimals: 2 }], capabilities: ['time_playback', 'number_inputs', 'select_inputs'] };
const fat = (extra = '') => ({ ...MANIFEST, summary: 'S'.repeat(399) + extra, description: 'D'.repeat(599), assumptions: Array(8).fill('A'.repeat(299)) }); // the largest legal prose

test('the role ceilings the program path must live inside are unchanged (changing one needs the consent tests)', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(EXPLAIN_ROLES).map(([role, r]) => [role, [r.maxInputTokens, r.maxImages]])), { brief: [40000, 4], author: [60000, 4], review: [40000, 6], repair: [40000, 2] });
  assert.deepEqual(EXPLAIN_LIMITS.calls, { brief: 1, author: 1, review: 4, repair: 3 });
  assert.deepEqual([roleBoundMicros('author'), roleBoundMicros('review'), roleBoundMicros('repair'), roleBoundMicros('brief')], [595680, 403520, 367840, 375680]);
  assert.deepEqual(explainReservation(), { version: 1, preparationMicros: 375680, generationMicros: 3313280 });
  assert.deepEqual([PROGRAM_LIMITS.sourceBytes, PROGRAM_LIMITS.manifestBytes], [16384, 4096]);
});

test('the author request with the program route: fixed size, room left for context, and the admissible context', async t => {
  const seen = [];
  const run = async (job, trial = {}) => {
    let captured;
    try { await authorStage({ prompt: 'x'.repeat(MESSAGE_LIMIT), brief: null, context: null, evidence: [], examples: [], base: null, reference: null, ...job }, { env: { ...ENV, ...trial }, call: async (role, request) => { captured = request; throw new Error('stop'); } }); } catch { /* the stop */ }
    return captured;
  };
  const bare = await run({});
  const body = explainRequest(ENV, 'author', bare); // throws if the fixed part alone is over the ceiling
  const fixed = bytes(JSON.stringify(body));
  seen.push(`author fixed request ${fixed} bytes (system ${bytes(bare.system)}, tool ${bytes(JSON.stringify(bare.tool))}, content ${bytes(bare.content)}), room ${headroom('author', body)} bytes at 0 images`);
  // The attached context: the route accepts up to 60,000 characters and forwards at most 24,000 of reference text; find what fits.
  let lo = 0, hi = 60000;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const request = await run({ context: { text: 'c'.repeat(mid) } });
    let fits = true;
    try { checkExplainRequest(ENV, 'author', explainRequest(ENV, 'author', request)); } catch { fits = false; }
    if (fits) lo = mid; else hi = mid - 1;
  }
  seen.push(`largest ASCII context the author call admits: ${lo} characters (the route allows 60000)`);
  assert.ok(fixed < 40000, 'the fixed author request leaves most of its ceiling for context');
  assert.ok(lo >= 24000, 'the 24,000 characters of reference text the route forwards fit');
  for (const line of seen) t.diagnostic(line);
});

test('a typical 16 KiB program with the fullest manifest fits the real review and repair requests; room is stated', async t => {
  const source = typicalSource(PROGRAM_LIMITS.sourceBytes);
  assert.equal(bytes(source) <= 16384, true);
  const artifact = await buildProgramArtifact({ source, manifest: fat() });
  assert.ok(bytes(JSON.stringify(artifact.manifest)) <= PROGRAM_LIMITS.manifestBytes, 'the fullest legal manifest is within its limit');
  const job = { prompt: 'q'.repeat(MESSAGE_LIMIT), evidence: [], round: 0, artifact };
  assert.deepEqual(programFitProblems(ENV, artifact, job), []);
  // The review request at six images (the most it ever carries), traces at their cap.
  const captures = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, compiledHash: 'x', theme: 'light', time: 0, inputs: {}, data: 'AAAA', mediaType: 'image/png' }));
  const { content } = buildReviewContent({ request: job.prompt, compiledHash: 'x', facts: programFacts(artifact.manifest), evidence: [], captures, program: { source, manifest: artifact.manifest, traces: [{ pad: 'x'.repeat(REVIEW_LIMITS.traceBytes - 32) }] } });
  const review = explainRequest(ENV, 'review', { system: REVIEW_SYSTEM + REVIEW_PROGRAM_RULES, tool: REVIEW_TOOL, content });
  t.diagnostic(`review (6 images, ${bytes(source)} source bytes, ${bytes(JSON.stringify(artifact.manifest))} manifest bytes, traces ${REVIEW_LIMITS.traceBytes}): ${bytes(JSON.stringify(review))} request bytes, ${headroom('review', review)} bytes of room, bound ${boundOf(review)} of ${roleBoundMicros('review')} micro-USD`);
  const repair = explainRequest(ENV, 'repair', { system: EXPLAIN_REPAIR_PROGRAM_SYSTEM, tool: REPAIR_PROGRAM_TOOL, content: programRepairContent(job, { problems: ['p'.repeat(400)], findings: [] }, []) });
  t.diagnostic(`repair (no images, 1 problem): ${bytes(JSON.stringify(repair))} request bytes, ${headroom('repair', repair)} bytes of room`);
  assert.ok(headroom('review', review) >= 0 && headroom('repair', repair) >= 0);
});

test('a program the review cannot receive is refused with its size, never silently trimmed', async () => {
  const artifact = await buildProgramArtifact({ source: quotesOnly(PROGRAM_LIMITS.sourceBytes), manifest: fat() });
  const problems = programFitProblems(ENV, artifact, { prompt: 'q'.repeat(MESSAGE_LIMIT), evidence: [], round: 0, artifact });
  assert.ok(problems.length >= 1);
  assert.match(problems[0], /too large for the independent review request by about \d+ bytes: write a shorter program/);
});

test('worst-case spend of one genuine program run and of the validation batches, from the unchanged ceilings', () => {
  const generation = explainReservation().generationMicros, brief = explainReservation().preparationMicros;
  // author once, review on the first candidate and after each of three repairs, three repairs: the policy's own per-job bound.
  assert.equal(generation, roleBoundMicros('author') + 4 * roleBoundMicros('review') + 3 * roleBoundMicros('repair'));
  const usd = micros => micros / 1e6;
  assert.equal(usd(generation), 3.31328);
  assert.equal(usd(generation + brief), 3.68896);
});
