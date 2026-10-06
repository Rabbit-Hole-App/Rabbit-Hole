// M8 benchmark harness: the hard ceiling, the frozen plan, the metrics, and no case knowledge in the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorRequest } from './author.js';
import { PLAN_FROZEN, budgetLedger, freezeAtAuthor, frozenPlan, frozenStoryboardJob, runMetrics, worstCase } from './benchmark.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIX = join(HERE, 'fixtures');
const json = f => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const plan = json('m7b/plan-softmax.json');
const usage = (input, output) => new Response(JSON.stringify({ model: 'claude-opus-5-5', usage: { input_tokens: input, output_tokens: output } }), { status: 200, headers: { 'content-type': 'application/json' } });

test('worst case: the output ceiling at the output price plus the input, so an Author call can cost at most about $1.3', () => {
  const body = authorRequest(plan.brief, plan.storyboard, {});
  const w = worstCase(body, 'claude-opus-5-5');
  assert.ok(w > 64000 * 20 / 1e6 && w < 1.4, String(w));
  const images = { max_tokens: 16000, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', data: 'x'.repeat(200000) } }] }] };
  assert.ok(worstCase(images, 'claude-opus-5-5') < 0.34, 'an image counts as 1600 tokens, not its base64 length');
});

test('the ledger refuses a call that could pass the ceiling, counts calls in flight, settles to the real cost and survives a restart', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'm8-ledger-')), 'ledger.json');
  const ledger = budgetLedger(file, 1);
  let sent = 0;
  const call = ledger.guard(async () => { sent++; return usage(1000, 10000); }, { case: 'X', renderer: 'r' });
  const small = { max_tokens: 16000, messages: [] };
  // Four parallel calls, each with a $0.32 worst case: the fourth is refused while the first three are reserved.
  const statuses = (await Promise.all(Array.from({ length: 4 }, () => call({}, small, 'claude-opus-5-5')))).map(r => r.status);
  assert.deepEqual(statuses, [200, 200, 200, 429]);
  await ledger.idle();
  assert.equal(sent, 3);
  assert.equal(ledger.spent, +(3 * (1000 * 4 + 10000 * 20) / 1e6).toFixed(6), 'the real cost, from usage');
  const big = await call({}, { max_tokens: 64000, messages: [] }, 'claude-opus-5-5');
  assert.equal(big.status, 429, 'an Author-sized call cannot fit what is left');
  assert.match(await big.text(), /refused locally: the \$1 ceiling could be passed/);
  const again = budgetLedger(file, 1);
  assert.equal(again.spent, ledger.spent, 'the spend survives a restart');
  assert.throws(() => budgetLedger(file, 2), /opened with a \$1 ceiling/);
});

test('the plan stage stops at the Author with a validated brief and storyboard; anything else is no plan', async () => {
  const stop = await freezeAtAuthor();
  assert.equal(stop.error, PLAN_FROZEN);
  assert.deepEqual(frozenPlan({ status: 'failed', failure_reason: `author: ${PLAN_FROZEN}: x`, brief: plan.brief, storyboard: plan.storyboard }), { errors: [], brief: plan.brief, storyboard: plan.storyboard });
  assert.match(frozenPlan({ status: 'needs_clarification', clarification: { question: 'which one?' } }).errors[0], /no frozen plan: needs_clarification: which one\?/);
  const broken = { ...plan.storyboard, beats: plan.storyboard.beats.slice(0, 1) };
  assert.ok(frozenPlan({ status: 'failed', failure_reason: PLAN_FROZEN, brief: plan.brief, storyboard: broken }).errors.length);
});

test('the pair job is the production job with the storyboard revision unavailable', async () => {
  let got = null;
  await frozenStoryboardJob(async a => { got = a; })({ brief: 1, prior: { repairs: { storyboard: 0, author: 0 }, format_retries: ['f'] } });
  assert.deepEqual(got.prior, { repairs: { storyboard: 1, author: 0 }, format_retries: ['f'] });
});

test('metrics come from the job record: generation, findings by round, latency, tokens and the source', () => {
  const p = {
    status: 'ready', timings: { authoring: 100, review_and_render: 200, total: 301 },
    repairs: { author: 1 }, transport_retries: [], format_retries: [{ stage: 'author' }],
    job: { repairs: { storyboard: 1, author: 1 }, findings: [
      { round: 0, reviewer: 'visual', category: 'overlapping_text', beat_id: 'B2', description: 'a' },
      { round: 0, reviewer: 'pedagogical', category: 'unsupported_claim', description: 'b' },
      { round: 1, reviewer: 'visual', category: 'minor_spacing', description: 'c' },
    ] },
    passes: [{ round: 0, author: 'composition', preview: { timings: { total_s: 40 } } }, { round: 1, author: 'composition', preview: { timings: { total_s: 30 } } }],
    render: { timings: { total_s: 90 }, validation: { determinism: { ok: true }, final: { checks: [{ name: 'nonblank frames', ok: true }] } } },
    calls: [
      { stage: 'author', round: 0, latency_ms: 50000, usage: { input_tokens: 10, output_tokens: 100 }, cost_usd: 0.5 },
      { stage: 'visual_review', round: 0, latency_ms: 9000, usage: { input_tokens: 5, output_tokens: 5 }, cost_usd: 0.05 },
      { stage: 'pedagogical_review', round: 0, latency_ms: 7000, usage: { input_tokens: 5, output_tokens: 5 }, cost_usd: 0.05 },
      { stage: 'author', round: 1, latency_ms: 30000, usage: { input_tokens: 10, output_tokens: 50 }, cost_usd: 0.3 },
    ],
  };
  const m = runMetrics(p, { source: '<div data-object="a"></div>\n<span></span>', determinism: { identical: true } });
  assert.deepEqual(m.generation, { author_first_pass_contract: true, first_pass_status: 'composition', ready: true, author_repair: 1, transport_retries: 0, schema_reasks: 1 });
  assert.deepEqual([m.pedagogy.unsupported_claims, m.pedagogy.teaching_blocking, m.pedagogy.final_pedagogical_pass], [1, [1, 0], true]);
  assert.deepEqual([m.visual.visual_blocking, m.visual.overlap_clipping, m.visual.cosmetic], [[1, 0], 1, 1]);
  assert.deepEqual([m.latency.author_s, m.latency.review_s, m.latency.repair_s, m.latency.preview_render_s, m.latency.final_render_s, m.latency.author_to_ready_s], [50, [9, 0], 30, [40, 30], 90, 300]);
  assert.deepEqual([m.cost.api_usd, m.cost.output_tokens, m.cost.render_compute_s], [0.9, 160, 160]);
  assert.deepEqual([m.engineering.elements, m.engineering.object_elements, m.determinism.stills_two_contexts, m.determinism.final_rerender.identical], [2, 1, true, true]);
});

test('anti-hardcoding: the benchmark code holds no case: no request, label, path, object id or title from any plan or case', () => {
  const code = ['benchmark.mjs', '../scripts/motion-benchmark.mjs'].map(f => readFileSync(join(HERE, f), 'utf8')).join('\n');
  const cases = json('m8/cases.json');
  const values = new Set();
  for (const c of cases.cases) {
    for (const v of [c.request, c.shape, c.plan, c.repository_context?.label, c.repository_context?.range.path]) if (v) values.add(v);
    if (!c.plan) continue;
    const p = json(c.plan);
    values.add(p.request); values.add(p.brief.title);
    for (const b of p.storyboard.beats) for (const o of b.visible_objects) { values.add(o.id); if (o.label) values.add(o.label); }
  }
  const found = [...values].filter(v => v.length > 3 && code.includes(v));
  assert.deepEqual(found, []);
  assert.ok(!/softmax|multinomial|nanogpt|attention|\bmlp\b|shakespeare/i.test(code), 'no topic word');
});
