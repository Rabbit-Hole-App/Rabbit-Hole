// CHARACTERISATION of the Motion admission and spend-bound policy as DEPLOYED (orchestrator image at ceiling US$3.50, main 8244c327):
// these tests state what the code does today, not what it should do. They change no policy. Cases marked POLICY GAP show a place where
// the admission arithmetic and the work a job may be asked to do disagree; a later owner decision may change them, and then the
// test that pins the old behaviour is rewritten with that decision cited.
//
// Everything is deterministic and offline: the REAL pipeline (resolver, grounding, Director, storyboard, Author, review job, reviewers,
// storyboard revision, Author repair) runs against a scripted provider fixture (no network, no key, no money), with only the render
// service doubled. Costs come from the usage each scripted reply reports, priced by the orchestrator's own costOf.
//
// OBSERVED (production job 3c46c4d2c7414f141a3c33fd34cebb00, 2026-10-26, orchestrator log): ceiling 3.50, grant 8.96, five calls sent
// for US$1.540278 in total, one preview render, then call 6 (a motion_storyboard REVISION during job:reviewing) refused. The per-call
// split of the 1.540278 was not logged: the split below is INVENTED to sum to the observed total; everything else (the order of the
// calls, the refusal's need, left and least-ahead, the ceiling and the grant) is the observed value.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestSpendBound } from '../../control-plane/src/learn-spend.js';
import { AUTHOR_REPAIR_CAP } from './author.js';
import { fixtureSource } from './fixture-source.js';
import { PRODUCTION_POLICY, RECOVERY_POLICY, costOf, motionOrchestrator, nextStage, preflight, requestSize, signGrant } from './orchestrator.mjs';
import { runMotionRequest } from './pipeline.mjs';
import { beatAt } from './renderer-common.mjs';
import { contactFrames } from './render-coverage.js';
import { runMotionJob } from './review-job.mjs';
import { AHEAD, MANDATORY_PATH, jobWorstCase, modelsFor, pathBound, pathFloor } from './spend-bound.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIX = join(HERE, 'fixtures');
const read = f => readFileSync(join(FIX, f), 'utf8');
const BRIEF = JSON.parse(read('m2/softmax-15s-attention.brief.json'));
const STORYBOARD = JSON.parse(read('m3/softmax-15s-attention.real.storyboard.json'));
const SOURCE = read('m5/softmax-15s-attention.real.composition.jsx');
const COMPOSITION_ID = 'softmax-attention-weights';
const MODEL = 'claude-opus-5-5';
const TOKEN = 'o'.repeat(40);
const GRANT = 8_960_000; // MOTION_JOB_RESERVATION_USD "8.96" (the observed "grant $8.96")
const CEILING = 3_500_000; // MOTION_JOB_CEILING_USD "3.50" (fly.orchestrator.toml)
const OBSERVED_TOTAL = 1_540_278; // job 3c46c4d2: calls 1 to 5
const OBSERVED_NEED = 449_860; // the refused revision's own bound, from the refusal log: need $0.44986
const OBSERVED_AHEAD = 1_920_000; // the refusal's "least-ahead $1.92" = 64000 x $20/M (Author) + 2 x 16000 x $20/M (reviewers)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 1000; i++) { if (await fn()) return; await sleep(5); } assert.fail(`timed out waiting for ${what}`); };
const usd = m => +(m / 1e6).toFixed(6);

// ---- the scripted provider -------------------------------------------------------------------------------------------------------
// A reply that reports `usage`; costOf prices it at Opus 5.5 ($4 in, $20 out, $5 cache write, $0.20 cache read per million tokens).
// usageFor(micros) chooses tokens that cost exactly that many micro-USD (9/10 of it as output tokens, the rest as input / cache-read).
const toMicros = c => Math.ceil(Number((c * 1e6).toFixed(6)));
export function usageFor(micros) {
  const output = Math.floor((micros * 0.9) / 20), rest = micros - output * 20, input = Math.floor(rest / 4), left = rest - input * 4;
  const usage = { input_tokens: input, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: left * 5 };
  assert.equal(toMicros(costOf(usage, MODEL)), micros, 'usageFor prices exactly');
  return usage;
}
const reply = (tool, input, usage, extra = {}) => new Response(JSON.stringify({ model: MODEL, stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: `toolu_${tool}`, name: tool, input }], ...extra }), { status: 200, headers: { 'content-type': 'application/json' } });

// The Director's answer: the recorded real brief's own fields (director.js assembleBrief maps claims to claim_registry).
const DIRECTOR_INPUT = (({ title, objective, audience_context, scope_note, teaching_mode, claim_registry, must_show, must_not_claim, visual_direction, narration_policy }) =>
  ({ title, objective, audience_context, scope_note, teaching_mode, claims: claim_registry, must_show, must_not_claim, visual_direction, narration_policy }))(BRIEF);
const STORYBOARD_INPUT = { beats: STORYBOARD.beats };
const AUTHOR_INPUT = { status: 'composition', composition_id: COMPOSITION_ID, source: SOURCE, notes: 'fixture' };
// A finding the pedagogical reviewer reports (STORYBOARD_LEVEL: it sends the job to a Director revision) and one the visual reviewer reports
// (Author-level: it goes to the Author alone). `pad` lengthens the description, which is how the revision request reaches a chosen size.
const PED_FINDING = (pad = 0) => ({ category: 'unsupported_claim', beat_id: 'B2', description: `The video states something the claims do not support.${'.'.repeat(pad)}` });
const VIS_FINDING = { category: 'clipped_text', beat_id: 'B3', description: 'A label is cut off by the frame edge.' };

// A step is { tool, input, micros | usage, throws, hold, status }. The provider answers each tool kind's steps in order; a kind with no
// step left is a test failure (a call nobody scripted). `trace` records, at the moment each call reaches the provider (so it was admitted),
// what the guard saw: the call's bound, what was already committed (finished calls at cost, in-flight calls at their bound).
export function provider(script, orch) {
  const queues = Object.fromEntries(Object.entries(script).map(([tool, steps]) => [tool, [...steps]]));
  const trace = [];
  let reviews = 0;
  const call = async (_env, body, model) => {
    const tool = body.tools[0].name, step = queues[tool]?.shift();
    const job = orch().active ?? [...orch().jobs.values()].at(-1);
    const sent = job.calls.filter(c => c.state !== 'refused'), self = sent.at(-1);
    const { bytes, images } = requestSize(body);
    trace.push({ n: sent.length, tool, model, max_tokens: body.max_tokens, bytes, images, bound: self.bound_micros,
      committed_before: sent.slice(0, -1).reduce((s, c) => s + (c.cost_micros ?? c.bound_micros), 0), in_flight_before: sent.slice(0, -1).filter(c => c.state === 'running').length, request: body });
    if (!step) assert.fail(`the provider fixture has no scripted ${tool} reply (call ${sent.length})`);
    // The two reviewers of a pass run together in production (review-job.mjs Promise.all): the first reviewer's answer waits until the
    // second has been through the guard (admitted or refused), so the second always sees the first IN FLIGHT at its bound.
    if (tool === 'motion_review' && (reviews++ % 2 === 0)) { const at = job.calls.length; for (let n = 0; n < 400 && job.calls.length < at + 1; n++) await sleep(5); }
    if (step.hold) await step.hold;
    if (step.throws) throw new Error(step.throws);
    if (step.raw) return step.raw;
    return reply(tool, step.input, step.unreadable ? undefined : step.usage ?? usageFor(step.micros), step.extra); // unreadable: a valid answer whose usage is missing (the cost is unknown)
  };
  return { call, trace, left: () => Object.entries(queues).filter(([, q]) => q.length).map(([t, q]) => `${t}: ${q.length}`) };
}

// The render service is doubled: a preview always renders; the reviewers get one tiny PNG per contact frame the real code would sample.
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
export function renderDoubles() {
  const log = [];
  const preview = async ({ brief, storyboard, dir, service }) => {
    await service.submit({ stage: 'preview' }); // one render the orchestrator counts (the log says "renders 1")
    mkdirSync(join(dir, 'frames'), { recursive: true });
    const frames = contactFrames(brief, storyboard).map(frame => {
      const file = `frames/frame-${String(frame).padStart(4, '0')}.png`;
      writeFileSync(join(dir, file), Buffer.concat([PNG, Buffer.from(`pass-${log.length}`)])); // each pass's frames differ, as real renders do (an identical review request is refused as a resend)
      return { frame, time: frame / 30, beat: beatAt(storyboard, frame).id, file };
    });
    log.push(['preview', frames.length]);
    return { submitted: true, result: { status: 'ready', frames, nonblank: { ok: true }, coverage: null } };
  };
  const final = async () => { log.push(['final']); return { submitted: true, result: { status: 'ready', render_id: 'a'.repeat(32), validation: { ok: true } } }; };
  return { preview, final, log };
}

// One orchestrator with the production policy, the real pipeline and the scripted provider. -> { o, job(), run(): the finished view }
let keys = 0;
export async function harness(t, script, { ceiling = CEILING, grant = GRANT, maxCalls = 9, policy = PRODUCTION_POLICY, env = {}, logs = [], jobRequest = {} } = {}) {
  const doubles = renderDoubles();
  let orchestrator;
  const fake = provider(script, () => orchestrator);
  const stages = { job: args => runMotionJob({ ...args, preview: doubles.preview, final: doubles.final }) };
  orchestrator = motionOrchestrator({ token: TOKEN, service: { health: async () => ({ ok: true, busy: false, sandbox: 'linux', version: 'motion-renderer-1-test' }), submit: async () => new Response(JSON.stringify({ render_id: 'a'.repeat(32) }), { status: 202 }) },
    call: fake.call, env, outDir: mkdtempSync(join(tmpdir(), 'motion-admission-')), log: line => logs.push(line), policy, maxCalls, ceilingMicros: ceiling,
    run: args => runMotionRequest({ ...args, stages }) });
  const server = createServer(orchestrator.handle);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); orchestrator.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (path, { method = 'GET', body } = {}) => fetch(base + path, { method, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const pinned = fixtureSource();
  const body = (key = `op-admission-${++keys}-key`, at = Math.floor(Date.now() / 1000)) => ({ request: '/motion 15s explain me softmax func', location: { concept: 'attention' }, repository: { repo: pinned.repository, commit: pinned.commit },
    idempotency_key: key, grant: { micros: grant, issued_at: at, boot: orchestrator.boot, sig: signGrant(TOKEN, key, grant, at, orchestrator.boot) }, ...jobRequest });
  const view = async id => (await req(`/jobs/${id}`)).json();
  const start = async (b = body()) => { const r = await req('/jobs', { method: 'POST', body: b }); return { status: r.status, answer: await r.json(), body: b }; };
  const run = async (b = body()) => {
    const { status, answer } = await start(b);
    assert.equal(status, 202, JSON.stringify(answer));
    await until(async () => (await view(answer.job_id)).status !== 'running', 'the job to end');
    return { id: answer.job_id, v: await view(answer.job_id), body: b };
  };
  return { o: orchestrator, req, view, start, run, body, fake, doubles, logs };
}

// The five calls of the observed job, with an INVENTED split of the observed total (1.540278): Director, storyboard, Author, then the two
// reviewers. The Author's share is the remainder. The later calls' costs are the analyst's ASSUMPTIONS (second-failure-analysis.md section 3:
// revision about 0.2, patch about 0.11, the Author after a revision about as dear as the first), not measurements.
export const OBSERVED_SPLIT = Object.freeze({ brief: 65_000, storyboard: 184_000, visual: 62_000, pedagogical: 76_500 });
export const AUTHOR_MICROS = OBSERVED_TOTAL - Object.values(OBSERVED_SPLIT).reduce((a, b) => a + b, 0);
const REVISION_MICROS = 200_000, PATCH_MICROS = 110_000;
const step = (input, micros) => ({ input, micros });
// A job's scripted replies, by tool kind, in the order the pipeline asks. pass1 / pass2: the findings of the visual and the pedagogical reviewer.
export function route({ pass1 = {}, revision = false, repair = null, pass2 = null, sb = STORYBOARD_INPUT, author = AUTHOR_MICROS } = {}) {
  const s = {
    motion_brief: [step(DIRECTOR_INPUT, OBSERVED_SPLIT.brief)], motion_storyboard: [step(sb, OBSERVED_SPLIT.storyboard)], motion_composition: [step(AUTHOR_INPUT, author)],
    motion_review: [step({ findings: pass1.visual ?? [] }, OBSERVED_SPLIT.visual), step({ findings: pass1.pedagogical ?? [] }, OBSERVED_SPLIT.pedagogical)],
  };
  if (revision) s.motion_storyboard.push(step(sb, REVISION_MICROS));
  if (repair) s.motion_composition.push(repair);
  if (pass2) s.motion_review.push(step({ findings: pass2.visual ?? [] }, OBSERVED_SPLIT.visual), step({ findings: pass2.pedagogical ?? [] }, OBSERVED_SPLIT.pedagogical));
  return s;
}
const WHOLE_AUTHOR = step(AUTHOR_INPUT, AUTHOR_MICROS); // the Author after a revision: a whole source (author.js patchable is false when repair.revision)
const FIND = SOURCE.split('\n').find(line => line.trim().length > 30 && SOURCE.split(line).length === 2);
const PATCH = step({ status: 'patch', edits: [{ find: FIND, replace: `${FIND} ` }] }, PATCH_MICROS); // a patch repair (cap 24000), applied to the first source

// The observed revision's size. The production request was smaller than this fixture's (the production brief was ungrounded): the fixture
// storyboard's free text is cut to 12 characters and the finding padded, so the revision request is exactly the observed 24972 bytes and
// its bound exactly the observed $0.44986. The padding is calibrated by a probe run (the bound is 5 micro-USD per byte).
const cut = x => (typeof x === 'string' && x.length > 12 ? `${x.slice(0, 11).replace(/\s+\S*$/, '')}.` : x);
const COMPACT = { beats: STORYBOARD.beats.map(b => ({ ...b, transition: cut(b.transition), framing: cut(b.framing), visible_objects: b.visible_objects.map(o => ({ ...o, description: cut(o.description), change: cut(o.change) })) })) };
const needOf = v => Math.round(v.failure.need_usd * 1e6);
// The observed job: calls 1 to 5 for 1,540,278, then call 6 (the storyboard revision) -> { h, id, v, pad }. `continuation` adds the replies of the
// rest of the route (used only when the ceiling lets call 6 through).
export async function observed(t, { ceiling = CEILING, continuation = {}, ...options } = {}) {
  const probe = await harness(t, route({ pass1: { pedagogical: [PED_FINDING(0)] }, sb: COMPACT }), { ceiling: CEILING });
  const need0 = needOf((await probe.run()).v);
  assert.ok(need0 <= OBSERVED_NEED && (OBSERVED_NEED - need0) % 5 === 0, `the compact revision request (${need0}) is below the observed ${OBSERVED_NEED}`);
  const pad = (OBSERVED_NEED - need0) / 5;
  const h = await harness(t, route({ pass1: { pedagogical: [PED_FINDING(pad)] }, sb: COMPACT, ...continuation }), { ceiling, ...options });
  return { h, ...(await h.run()), pad };
}

test('OBSERVED job 3c46c4d2: calls 1 to 5 cost 1.540278, then call 6 (a storyboard REVISION during job:reviewing) is refused with the logged need, least-ahead and left', async t => {
  const logs = [];
  const { h, id, v, pad } = await observed(t, { logs });
  assert.ok(pad > 0 && pad < 1000, `the finding is padded by ${pad} bytes to the observed request size`);
  // The five calls, in pipeline order, and nothing else was sent.
  assert.deepEqual(h.fake.trace.map(c => c.tool), ['motion_brief', 'motion_storyboard', 'motion_composition', 'motion_review', 'motion_review']);
  assert.deepEqual(h.fake.left(), [], 'every scripted reply was used; the refused revision was never sent');
  assert.equal(h.doubles.log.filter(([k]) => k === 'preview').length, 1, 'one preview render, no second pass');
  // The numbers the orchestrator reports for the job, equal to the observed ones.
  assert.deepEqual([v.status, v.cause, v.failure_code], ['failed', 'limit', 'job_ceiling_insufficient']);
  assert.equal(v.spend.cost_usd, usd(OBSERVED_TOTAL));
  assert.deepEqual([v.spend.bound_usd, v.spend.hold_usd, v.spend.ceiling_usd, v.spend.calls, v.spend.in_flight, v.renders], [1.540278, 8.96, 3.5, 5, 0, 1]);
  assert.equal(v.spend.provider_calls.reduce((s, c) => s + toMicros(c.cost_usd), 0), OBSERVED_TOTAL, 'the per-call costs add to the total (the SPLIT among them is invented)');
  assert.deepEqual(v.failure, { code: 'job_ceiling_insufficient', stage: 'job:reviewing', kind: 'motion_storyboard',
    reason: "this motion_storyboard call (up to $0.45) and the least the required steps after it can cost ($1.92) are more than the $1.96 left of this job's $3.50 ceiling",
    need_usd: 0.44986, left_usd: 1.959722, ahead_usd: 1.92, ceiling_usd: 3.5 });
  // The log lines, character for character (job id aside).
  assert.deepEqual(h.logs.map(l => l.replace(id, '<job>')), [
    'job <job>: started; preflight renderer unknown sandbox linux, contract version not checked',
    "job <job>: refused job_ceiling_insufficient during job:reviewing (motion_storyboard, call 6): this motion_storyboard call (up to $0.45) and the least the required steps after it can cost ($1.92) are more than the $1.96 left of this job's $3.50 ceiling; need $0.44986 + least-ahead $1.92, left $1.959722 of $3.5 (grant $8.96)",
    'job <job>: failed [job_ceiling_insufficient] (calls 5, cost 1.540278, bound 1.540278, renders 1)']);
  // The arithmetic of the refusal: least-ahead is pathFloor of what must follow a storyboard (the Author's 64000 cap and two reviewers' 16000 caps, output only).
  const ahead = pathFloor(AHEAD.motion_storyboard, PRODUCTION_POLICY, modelsFor({})).micros;
  assert.deepEqual([ahead, 64000 * 20 + 2 * 16000 * 20], [OBSERVED_AHEAD, OBSERVED_AHEAD]);
  const left = CEILING - OBSERVED_TOTAL;
  assert.deepEqual([left, OBSERVED_NEED <= left, OBSERVED_NEED + OBSERVED_AHEAD - left, OBSERVED_TOTAL + OBSERVED_NEED + OBSERVED_AHEAD], [1_959_722, true, 410_138, 3_910_138]);
});

test('POLICY GAP: the refusal is exact at US$3.910138 (admits call 6) but that figure is NOT enough for the route: the job then pays for the revision and a whole Author and is refused at the second review pair', async t => {
  const route6 = { revision: true, repair: WHOLE_AUTHOR, pass2: {} };
  // One micro-USD below: the same refusal as production, call 6 never sent.
  const below = await observed(t, { ceiling: 3_910_137, continuation: route6 });
  assert.equal(below.v.spend.calls, 5);
  assert.equal(needOf(below.v), OBSERVED_NEED);
  // At the figure: call 6 is admitted ("need + least-ahead" fits exactly) ...
  const at = await observed(t, { ceiling: 3_910_138, continuation: route6 });
  const tools = at.h.fake.trace.map(c => c.tool);
  assert.deepEqual(tools.slice(0, 8), ['motion_brief', 'motion_storyboard', 'motion_composition', 'motion_review', 'motion_review', 'motion_storyboard', 'motion_composition', 'motion_review']);
  assert.equal(at.h.fake.trace[5].bound, OBSERVED_NEED, 'the revision was admitted at its observed bound');
  // ... and the job still cannot finish: the second pair is refused, after US$1.5403 + the revision + the whole Author were spent.
  assert.equal(at.v.status, 'failed');
  assert.equal(at.v.failure_code, 'job_ceiling_insufficient');
  assert.deepEqual([at.v.spend.calls, at.v.spend.cost_usd, at.v.failure.kind, at.v.failure.stage], [8, 2.955056, 'motion_review', 'job:reviewing']);
  assert.deepEqual([at.v.failure.need_usd, at.v.failure.left_usd, at.v.failure.ahead_usd], [0.640495, 0.396582, 0], 'the second reviewer of the second pair needs 0.640495 and 0.396582 is left (the first is in flight at its bound)');
  assert.equal(at.v.spend.cost_usd, usd(OBSERVED_TOTAL + REVISION_MICROS + AUTHOR_MICROS + OBSERVED_SPLIT.visual), 'US$2.955056 paid for no video: the revision, the whole Author and one reviewer');
});

// ---- the guard's arithmetic, read off a run ---------------------------------------------------------------------------------------
// What the guard asked of each call it admitted: committed (finished calls at cost, in-flight at bound) + this call's bound + the least the
// required calls after it cost (orchestrator.mjs guarded). A call is admitted iff that sum is within the ceiling, so the SMALLEST ceiling a
// given sequence of calls can run under is the largest of these. (Reviewers: the first of a pair holds a place for the second.)
const FLOORS = k => pathFloor(k, PRODUCTION_POLICY, modelsFor({})).micros ?? 0;
export function peaks(trace) {
  let reviews = 0;
  return trace.map(c => {
    const ahead = FLOORS(c.tool === 'motion_review' ? (reviews++ % 2 === 0 ? [['motion_review', 1]] : []) : (AHEAD[c.tool] ?? []));
    return { n: c.n, tool: c.tool, bound: c.bound, committed: c.committed_before, ahead, peak: c.committed_before + c.bound + ahead };
  });
}
// Runs a route at the full hold to read its peak, then at exactly the peak (it completes) and one micro-USD below (it is refused at the peak's call).
async function exactFit(t, make) {
  const probe = await harness(t, make(), { ceiling: GRANT });
  const { v } = await probe.run();
  const rows = peaks(probe.fake.trace), top = rows.reduce((a, b) => (b.peak > a.peak ? b : a));
  const fit = await harness(t, make(), { ceiling: top.peak });
  const at = await fit.run();
  const short = await harness(t, make(), { ceiling: top.peak - 1 });
  const under = await short.run();
  return { probe: v, rows, top, at: at.v, under: under.v, shortTrace: short.fake.trace };
}
const FIRST_PASS = () => route();
const PATCH_ROUTE = () => route({ pass1: { visual: [VIS_FINDING] }, repair: PATCH, pass2: {} });
const REVISION_ROUTE = () => route({ pass1: { pedagogical: [PED_FINDING()] }, revision: true, repair: WHOLE_AUTHOR, pass2: {} });

test('repair path 1, Author patch: a visual finding sends the Author alone a PATCH (cap 24000), then two fresh reviewers; 8 of the 9 calls the policy allows', async t => {
  const h = await harness(t, PATCH_ROUTE(), { ceiling: GRANT });
  const { v } = await h.run();
  assert.equal(v.status, 'ready', JSON.stringify(v.failure ?? v.failure_reason));
  assert.deepEqual(h.fake.trace.map(c => c.tool), ['motion_brief', 'motion_storyboard', 'motion_composition', 'motion_review', 'motion_review', 'motion_composition', 'motion_review', 'motion_review']);
  const [first, repair] = h.fake.trace.filter(c => c.tool === 'motion_composition');
  assert.deepEqual([first.max_tokens, repair.max_tokens], [64000, AUTHOR_REPAIR_CAP], 'the patch is capped lower than the whole source');
  assert.ok(repair.bound < first.bound, 'and so is its bound');
  assert.deepEqual([v.repair_count, v.repairs], [1, { storyboard: 0, author: 1 }], 'one repair, the Author');
  assert.equal(v.spend.calls, 8);
  assert.equal(v.spend.cost_usd, usd(OBSERVED_TOTAL + PATCH_MICROS + OBSERVED_SPLIT.visual + OBSERVED_SPLIT.pedagogical));
  assert.deepEqual(h.doubles.log.map(([k]) => k), ['preview', 'preview', 'final'], 'two previews and one final render');
});

test('repair path 2, storyboard revision: a pedagogical storyboard-level finding sends the Director a REVISION and then the Author a WHOLE source (64000 cap), then two fresh reviewers; 9 of 9 calls, the full offered policy', async t => {
  const h = await harness(t, REVISION_ROUTE(), { ceiling: GRANT });
  const { v } = await h.run();
  assert.equal(v.status, 'ready', JSON.stringify(v.failure ?? v.failure_reason));
  assert.deepEqual(h.fake.trace.map(c => c.tool), ['motion_brief', 'motion_storyboard', 'motion_composition', 'motion_review', 'motion_review', 'motion_storyboard', 'motion_composition', 'motion_review', 'motion_review']);
  const [, , , , , revision, author2] = h.fake.trace;
  assert.deepEqual([revision.max_tokens, author2.max_tokens], [16000, 64000], 'after a revision the Author is not a patch');
  assert.equal(v.spend.calls, 9, 'every call the production policy allows is used');
  assert.deepEqual([v.repair_count, v.repairs], [2, { storyboard: 1, author: 1 }], 'both repairs: the storyboard first, then the Author');
});

test('the second pass still blocking ends the job as a content failure after ALL of its calls are paid: no further repair, no further call', async t => {
  const h = await harness(t, route({ pass1: { pedagogical: [PED_FINDING()] }, revision: true, repair: WHOLE_AUTHOR, pass2: { visual: [VIS_FINDING] } }), { ceiling: GRANT });
  const { v } = await h.run();
  assert.deepEqual([v.status, v.cause, v.failure_code], ['failed', 'content', 'content_rejected']);
  assert.match(v.failure_reason, /still blocking after the Author repair: clipped_text/);
  assert.equal(v.spend.calls, 9);
  assert.equal(v.spend.cost_usd, usd(OBSERVED_TOTAL + REVISION_MICROS + AUTHOR_MICROS + OBSERVED_SPLIT.visual + OBSERVED_SPLIT.pedagogical), 'charged as a model/content failure, not a limit');
});


test('ROUTE PEAKS and exact fits: each route runs under the largest of its guard sums and not one micro-USD under it; the post-review revision route needs more than the US$3.50 ceiling', async t => {
  const out = {};
  for (const [name, make] of [['first pass', FIRST_PASS], ['author patch', PATCH_ROUTE], ['revision', REVISION_ROUTE]]) {
    const r = await exactFit(t, make);
    assert.equal(r.at.status, 'ready', `${name}: runs at its peak`);
    assert.deepEqual([r.under.status, r.under.failure_code, r.under.failure.kind], ['failed', 'job_ceiling_insufficient', r.top.tool], `${name}: one micro-USD under, refused at the call that sets the peak`);
    out[name] = [r.top.peak, r.top.n, r.top.tool, toMicros(r.probe.spend.cost_usd), r.probe.spend.calls];
  }
  // [peak, call that sets it, its kind, actual spend of the route, calls]. The peak is the second reviewer of the last pass: the first reviewer is
  // still in flight at its bound while the second asks.
  assert.deepEqual(out, { 'first pass': [2_662_773, 5, 'motion_review', 1_540_278, 5], 'author patch': [2_911_273, 8, 'motion_review', 1_788_778, 8], revision: [4_154_051, 9, 'motion_review', 3_031_556, 9] });
  // Against the deployed numbers: the ceiling covers the first pass and the patch repair; the revision route needs more than the ceiling and
  // more than the figure (3.910138) that merely admits its revision call. The floor (2.56) is below even the first pass.
  const floor = pathFloor(MANDATORY_PATH, PRODUCTION_POLICY, modelsFor({})).micros;
  assert.deepEqual([floor, out['first pass'][0] > floor, out['first pass'][0] <= CEILING, out['author patch'][0] <= CEILING], [2_560_000, true, true, true]);
  assert.deepEqual([out.revision[0] > CEILING, out.revision[0] > OBSERVED_TOTAL + OBSERVED_NEED + OBSERVED_AHEAD], [true, true], 'POLICY GAP: the route the policy offers does not fit the ceiling it runs under');
});

test('ROUTE PEAKS by Author profile (the real guard on the scripted route, 11 contact frames): which routes the US$3.50 ceiling and the US$2.56 floor cover', async t => {
  const table = {};
  for (const [name, make] of [['first', a => route({ author: a })], ['patch', a => route({ author: a, pass1: { visual: [VIS_FINDING] }, repair: PATCH, pass2: {} })],
    ['revision', a => route({ author: a, pass1: { pedagogical: [PED_FINDING()] }, revision: true, repair: step(AUTHOR_INPUT, a), pass2: {} })]]) {
    table[name] = [];
    for (const a of [370_000, 600_000, AUTHOR_MICROS, 1_480_000]) {
      const probe = await harness(t, make(a), { ceiling: GRANT });
      const { v } = await probe.run();
      assert.equal(v.status, 'ready', `${name} ${a}`);
      table[name].push(Math.max(...peaks(probe.fake.trace).map(r => r.peak)));
    }
  }
  // Columns: Author 0.37 (a cheap one), 0.60 (typical), 1.152778 (this job's), 1.48 (at its 64000-token cap). The analyst's table, at 16 frames and dearer
  // reviews, gives the revision route 3.09 / 3.34 / 4.35 / 5.13: the same shape.
  assert.deepEqual(table, { first: [2_613_750, 2_613_750, 2_662_773, 2_989_995], patch: [2_613_750, 2_613_750, 2_911_273, 3_238_495], revision: [3_143_540, 3_373_540, 4_154_051, 4_808_495] });
  const covered = Object.fromEntries(Object.entries(table).map(([k, row]) => [k, row.map(p => p <= CEILING)]));
  assert.deepEqual(covered, { first: [true, true, true, true], patch: [true, true, true, true], revision: [true, true, false, false] }, 'the US$3.50 ceiling covers the revision route only for a cheap or typical Author');
  assert.ok(table.first[0] > pathFloor(MANDATORY_PATH, PRODUCTION_POLICY, modelsFor({})).micros, 'the cheapest first pass already needs more (the full Director bound + the floor of the rest) than the 2.56 floor');
});

test('insufficient preflight budget: a ceiling (or a grant) below the US$2.56 floor is refused at POST /jobs with nothing spent; the floor itself passes preflight', async t => {
  for (const [what, options] of [['ceiling', { ceiling: 2_559_999 }], ['grant', { grant: 2_000_000 }]]) {
    const h = await harness(t, {}, options);
    const { status, answer } = await h.start();
    assert.equal(status, 503, what);
    assert.deepEqual([answer.error, answer.code], ['not_configured', 'job_ceiling_insufficient']);
    assert.doesNotMatch(JSON.stringify(answer), /\$|\d\.\d\d/, 'no amount in what the Worker relays');
    assert.deepEqual([h.fake.trace.length, h.o.jobs.size, h.o.active], [0, 0, null], 'no model call, no job, no renderer work');
    assert.match(h.logs.at(-1), /refused job_ceiling_insufficient before starting: the least the 5 required calls can cost \(\$2\.5600\) is more than the \$[\d.]+ job ceiling; least needed \$2\.56,.* nothing was spent/);
  }
  assert.equal(preflight({ policy: PRODUCTION_POLICY, maxCalls: 9, ceilingMicros: 2_560_000 }).ok, true);
});

test('POLICY GAP: a ceiling at the floor (US$2.56) passes preflight but is refused at the FIRST call, because the call is checked at its full bound plus the floor of the rest', async t => {
  const ceiling = 2_560_000;
  const h = await harness(t, route(), { ceiling });
  const { v } = await h.run();
  assert.deepEqual([v.status, v.failure_code, v.failure.kind, v.spend.calls, v.spend.cost_usd], ['failed', 'job_ceiling_insufficient', 'motion_brief', 0, 0]);
  assert.deepEqual([toMicros(v.failure.need_usd), toMicros(v.failure.ahead_usd), toMicros(v.failure.left_usd)], [373_750, 2_240_000, ceiling]);
  assert.ok(373_750 + 2_240_000 > ceiling, 'the Director bound (0.37375) + the floor of storyboard, Author and two reviewers (2.24) is above 2.56');
  // Nothing was spent and nothing was sent: the refusal is early and cheap, but it is not the floor the preflight stated.
  assert.deepEqual(h.fake.left(), Object.keys(route()).map(k => `${k}: ${route()[k].length}`));
  // A ceiling that clears the first call but not the whole first pass is refused LATER, with money spent: one micro-USD under the first-pass peak.
  const late = await harness(t, route(), { ceiling: 2_662_772 });
  const l = (await late.run()).v;
  assert.deepEqual([l.failure.kind, l.spend.calls, l.spend.cost_usd], ['motion_review', 4, usd(OBSERVED_TOTAL - OBSERVED_SPLIT.pedagogical)], 'refused at the second reviewer after the Director, storyboard, Author and first reviewer were paid');
});

test('concurrent reviewers: the first reviewer is IN FLIGHT at its bound when the second asks, so the second is refused although the first will cost far less', async t => {
  // The committed total before the reviewers is the three finished calls at cost. The ceiling leaves room for the first reviewer's bound and the
  // floor of the second, but not for both bounds.
  const probe = await harness(t, route(), { ceiling: GRANT });
  await probe.run();
  const [, , , visual, pedagogical] = probe.fake.trace;
  const before = visual.committed_before;
  const ceiling = before + visual.bound + pedagogical.bound - 1;
  const h = await harness(t, route(), { ceiling });
  const { v } = await h.run();
  assert.deepEqual([pedagogical.in_flight_before, pedagogical.committed_before], [1, before + visual.bound], 'unrefused, the second reviewer sees the first at its bound, not at its cost');
  assert.deepEqual([v.status, v.failure_code, v.failure.kind], ['failed', 'job_ceiling_insufficient', 'motion_review']);
  assert.deepEqual([toMicros(v.failure.need_usd), toMicros(v.failure.left_usd), toMicros(v.failure.ahead_usd)], [pedagogical.bound, pedagogical.bound - 1, 0], 'left = ceiling - committed - the first reviewer\'s BOUND');
  assert.ok(visual.bound - OBSERVED_SPLIT.visual > 500_000, 'the first reviewer\'s bound is far above its cost of 62000');
  assert.equal(v.spend.calls, 4, 'brief, storyboard, Author and the first reviewer were sent; the second was refused');
  assert.equal(v.spend.in_flight, 0);
  assert.equal(v.spend.cost_usd, usd(before + OBSERVED_SPLIT.visual), 'once landed, the first reviewer counts at its real cost');
});

test('unknown outcomes: a valid answer whose usage is unreadable stays committed at its bound for the whole job, shifts the peak, and leaves the job total unknown', async t => {
  const unreadable = () => { const s = route(); s.motion_brief = [{ ...s.motion_brief[0], unreadable: true }]; return s; };
  const known = await harness(t, route(), { ceiling: GRANT });
  await known.run();
  const probe = await harness(t, unreadable(), { ceiling: GRANT });
  const { v } = await probe.run();
  assert.equal(v.status, 'ready', 'the job itself is fine');
  assert.equal(v.spend.cost_usd, null, 'the total is unknown while any call is');
  const brief = v.spend.provider_calls[0];
  assert.deepEqual([brief.kind, brief.cost_usd, brief.state], ['motion_brief', null, 'done']);
  assert.equal(toMicros(v.spend.bound_usd), OBSERVED_TOTAL - OBSERVED_SPLIT.brief + 373_750, 'the unknown call counts at its bound (0.37375), the others at cost');
  // The unreadable Director raises the guard sums of every later call by (bound - cost) = 308,750: a ceiling that fits the known job refuses this one.
  const rows = peaks(probe.fake.trace), top = rows.reduce((x, y) => (y.peak > x.peak ? y : x)), knownPeak = Math.max(...peaks(known.fake.trace).map(r => r.peak));
  assert.deepEqual([knownPeak, top.peak, top.n, top.tool], [2_662_773, 2_971_523, 5, 'motion_review']);
  assert.equal(top.peak - knownPeak, 373_750 - OBSERVED_SPLIT.brief);
  const fits = await harness(t, unreadable(), { ceiling: top.peak });
  assert.equal((await fits.run()).v.status, 'ready');
  const short = await harness(t, unreadable(), { ceiling: knownPeak });
  const s = (await short.run()).v;
  assert.deepEqual([s.status, s.failure_code, s.failure.kind, s.spend.calls, s.spend.cost_usd], ['failed', 'job_ceiling_insufficient', 'motion_storyboard', 1, null], 'refused already at the storyboard (the unknown Director bound is committed from the start); the job cost is unknown too');
});

test('unknown outcomes: a call that throws (a dropped connection) is held at its bound, never resent, and the job fails with its cost unknown', async t => {
  const script = route();
  script.motion_composition = [{ throws: 'socket hang up' }];
  const h = await harness(t, script, { ceiling: GRANT });
  const { v } = await h.run();
  assert.equal(v.status, 'failed');
  assert.equal(v.spend.cost_usd, null);
  const author = v.spend.provider_calls[2];
  assert.deepEqual([author.kind, author.cost_usd, author.state], ['motion_composition', null, 'done']);
  assert.equal(toMicros(v.spend.bound_usd), OBSERVED_SPLIT.brief + OBSERVED_SPLIT.storyboard + toMicros(author.bound_usd), 'finished calls at cost, the unknown one at its bound');
  assert.equal(h.fake.trace.filter(c => c.tool === 'motion_composition').length, 1, 'the identical resend is never sent');
  assert.deepEqual([v.cause, v.failure_code, v.spend.calls], ['limit', 'policy_rejected', 3], 'the Author retry is refused as a resend: a zero-credit limit failure, not a model failure');
  assert.match(v.failure_reason, /resending the same motion_composition call is outside the production policy/);
});

test('unknown cost bound: a role whose model has no price is refused before any call (preflight), and the same model cannot be priced for a request', () => {
  const env = { MOTION_AUTHOR_MODEL: 'no-such-model' };
  const refused = preflight({ policy: PRODUCTION_POLICY, maxCalls: 9, ceilingMicros: CEILING, env });
  assert.deepEqual([refused.ok, refused.code], [false, 'unknown_cost_bound']);
  assert.equal(pathBound(MANDATORY_PATH, PRODUCTION_POLICY, modelsFor(env)).micros, null);
  assert.equal(jobWorstCase(PRODUCTION_POLICY, modelsFor(env)).micros, null);
  assert.equal(requestSpendBound({ max_tokens: 1000, messages: [] }, 'no-such-model'), null);
});

test('exactly-once on the orchestrator: a replayed submission of the refused job answers the same job and calls nothing; its view is stable and the refused call is not counted', async t => {
  const first = await observed(t);
  const { h } = first;
  const before = JSON.stringify(first.v);
  const sent = h.fake.trace.length;
  const again = await h.start(first.body);
  assert.deepEqual([again.status, again.answer.job_id, again.answer.duplicate], [202, first.id, true]);
  await sleep(50);
  assert.equal(JSON.stringify(await h.view(first.id)), before, 'the view did not change');
  assert.equal(h.fake.trace.length, sent, 'no model call, no second job');
  assert.equal(h.o.jobs.size, 1);
  assert.equal((await h.view(first.id)).spend.calls, 5, 'the refused sixth call is not a sent call');
  // The artifacts the Worker reads next name the code and offer nothing it could not fund.
  const artifacts = await (await h.req(`/jobs/${first.id}/artifacts`)).json();
  assert.deepEqual([artifacts.failure_code, artifacts.cause], ['job_ceiling_insufficient', 'limit']);
  assert.deepEqual([artifacts.actions, artifacts.hold_usd, artifacts.next_need_usd, artifacts.blocking.map(b => b.category)], [['fix'], { fix: 7.9486, render: 0 }, 2.8918, ['unsupported_claim']], 'Continue fixing is offered: its next stage (Author + two reviewers) fits a fresh ceiling');
});

test('SIZED bounds of every call kind (this fixture: 15 s, 11 contact frames) against the policy-cap bounds and the output-only floors the guard uses', async t => {
  const h = await harness(t, REVISION_ROUTE(), { ceiling: GRANT });
  await h.run();
  const sized = h.fake.trace.map(c => [c.n, c.tool, c.max_tokens, c.images, c.bound]);
  assert.deepEqual(sized, [[1, 'motion_brief', 16000, 0, 373_750], [2, 'motion_storyboard', 16000, 0, 421_145], [3, 'motion_composition', 64000, 0, 1_392_925], [4, 'motion_review', 16000, 11, 620_500], [5, 'motion_review', 16000, 11, 640_495],
    [6, 'motion_storyboard', 16000, 0, 466_040], [7, 'motion_composition', 64000, 0, 1_507_565], [8, 'motion_review', 16000, 11, 620_500], [9, 'motion_review', 16000, 11, 640_495]]);
  const patch = await harness(t, PATCH_ROUTE(), { ceiling: GRANT });
  await patch.run();
  assert.deepEqual(patch.fake.trace[5].tool + patch.fake.trace[5].max_tokens + ':' + patch.fake.trace[5].bound, 'motion_composition24000:710070', 'the patch repair, capped at 24000');
  // Every sized bound is below the policy-cap bound of its kind and above its output-only floor (the guard uses both ends: the sized bound for the call
  // itself, the floor for the calls that must still follow it).
  const caps = Object.fromEntries(jobWorstCase(PRODUCTION_POLICY, MODEL).lines.map(l => [l.kind, l.per_call_micros]));
  const floors = Object.fromEntries(pathFloor(MANDATORY_PATH, PRODUCTION_POLICY, modelsFor({})).lines.map(l => [l.kind, l.per_call_micros]));
  assert.deepEqual([caps, floors], [{ motion_brief: 445_000, motion_storyboard: 565_000, motion_composition: 1_845_000, motion_review: 923_400 }, { motion_brief: 320_000, motion_storyboard: 320_000, motion_composition: 1_280_000, motion_review: 320_000 }]);
  for (const [, tool, , , bound] of sized) assert.ok(bound < caps[tool] && bound > floors[tool], tool);
  // The route totals the policy offers (pricing registry row claude-opus-5-5: input 4, output 20 US$/M; cache write x1.25 on all input): bound = (bytes + 1000 + 4784
  // per image) x 5 micro-USD + max_tokens x 20 micro-USD; floor = max_tokens x 20.
  const bound = (path, rules) => pathBound(path, PRODUCTION_POLICY, modelsFor({}), undefined, rules).micros;
  const patchRule = { motion_composition: { ...PRODUCTION_POLICY.motion_composition, max_tokens: AUTHOR_REPAIR_CAP } };
  const firstPass = bound(MANDATORY_PATH), patchBound = bound([['motion_composition', 1]], patchRule);
  assert.deepEqual([firstPass, patchBound], [4_701_800, 1_045_000]);
  assert.deepEqual({
    first_pass: [firstPass, FLOORS(MANDATORY_PATH)],
    author_repair: [firstPass + patchBound + 2 * 923_400, FLOORS(MANDATORY_PATH) + AUTHOR_REPAIR_CAP * 20 + 2 * 320_000],
    storyboard_revision: [firstPass + 565_000 + 1_845_000 + 2 * 923_400, FLOORS(MANDATORY_PATH) + 320_000 + 1_280_000 + 2 * 320_000],
    full_policy: [jobWorstCase(PRODUCTION_POLICY, MODEL).micros, FLOORS([['motion_brief', 1], ['motion_storyboard', 2], ['motion_composition', 2], ['motion_review', 4]])],
  }, { first_pass: [4_701_800, 2_560_000], author_repair: [7_593_600, 3_680_000], storyboard_revision: [8_958_600, 4_800_000], full_policy: [8_958_600, 4_800_000] },
  'worst case [policy-cap bound, floor] by route: the storyboard-revision route IS the whole 9-call policy, so its bound is the US$8.96 hold');
  // The ceiling and the floor against them: neither the 3.50 ceiling nor the 2.56 floor is a bound on anything but the first pass's lower end.
  assert.deepEqual([4_701_800 > CEILING, 3_680_000 > CEILING, 4_800_000 > CEILING, 2_560_000 <= CEILING], [true, true, true, true]);
  // A deliberately conservative sum for the revision route with SIZED bounds (every call spends its whole bound) -- the only provable ceiling for it.
  const sizedSum = sized.reduce((s, [, , , , b]) => s + b, 0);
  assert.equal(sizedSum, 6_683_415);
});

// "Continue fixing" from the refused job's checkpoint (recovery mode fix): a FRESH attempt with its own ceiling, no Director call.
async function continueFixing(t, artifacts, { ceiling = CEILING, grant = GRANT } = {}) {
  const h = await harness(t, { motion_storyboard: [step(COMPACT, REVISION_MICROS)], motion_composition: [WHOLE_AUTHOR], motion_review: [step({ findings: [] }, OBSERVED_SPLIT.visual), step({ findings: [] }, OBSERVED_SPLIT.pedagogical)] }, { ceiling, grant });
  const key = `op-continue-${++keys}-key`, at = Math.floor(Date.now() / 1000);
  const body = { idempotency_key: key, grant: { micros: grant, issued_at: at, boot: h.o.boot, sig: signGrant(TOKEN, key, grant, at, h.o.boot) }, mode: 'fix', checkpoint: artifacts.checkpoint, seal: artifacts.seal };
  const r = await h.req('/recover', { method: 'POST', body });
  const answer = await r.json();
  if (r.status !== 202) return { h, status: r.status, answer };
  await until(async () => (await h.view(answer.job_id)).status !== 'running', 'the recovery to end');
  return { h, status: r.status, v: await h.view(answer.job_id) };
}

test('CONTINUE FIXING from the refused job: offered, and a fresh US$3.50 attempt completes it (revision, whole Author, two reviewers) -- but the fit check priced the Author as a PATCH', async t => {
  const first = await observed(t);
  const artifacts = await (await first.h.req(`/jobs/${first.id}/artifacts`)).json();
  assert.deepEqual([artifacts.actions, artifacts.checkpoint.composition.state, artifacts.next_need_usd], [['fix'], 'blocking', 2.8918]);
  // What the offer was checked against: the blocking state is priced as an Author PATCH (cap 24000) and two reviewers, at the policy caps.
  const priced = nextStage(artifacts.checkpoint, { ceilingMicros: CEILING });
  assert.deepEqual([priced.path, priced.micros, priced.fits], [[['motion_composition', 1], ['motion_review', 2]], 2_891_800, true]);
  // What the attempt actually does with THIS checkpoint (its blocking finding is storyboard-level): a storyboard revision, a WHOLE Author, two reviewers.
  const r = await continueFixing(t, artifacts);
  assert.equal(r.v.status, 'ready', JSON.stringify(r.v.failure ?? r.v.failure_reason));
  assert.deepEqual(r.h.fake.trace.map(c => [c.tool, c.max_tokens]), [['motion_storyboard', 16000], ['motion_composition', 64000], ['motion_review', 16000], ['motion_review', 16000]]);
  const route = pathBound([['motion_storyboard', 1], ['motion_composition', 1], ['motion_review', 2]], RECOVERY_POLICY.fix, modelsFor({})).micros;
  assert.equal(route, 4_256_800);
  assert.ok(route > priced.micros, 'POLICY GAP: the route that runs costs 1,365,000 more at the caps than the route the offer was checked against');
  // The guard's sums for the attempt (revision gate, Author gate, first reviewer, second reviewer): the highest is far under the fresh US$3.50.
  assert.deepEqual(peaks(r.h.fake.trace).map(p => p.peak), [2_369_860, 2_331_385, 2_293_278, 2_613_773]);
  assert.equal(r.v.spend.cost_usd, usd(REVISION_MICROS + AUTHOR_MICROS + OBSERVED_SPLIT.visual + OBSERVED_SPLIT.pedagogical));
});

test('repair path 3, pre-Author storyboard revision: a storyboard that fails its own checks is revised BEFORE the Author; a later Author patch is still available; 9 of 9 calls', async t => {
  const BAD = { beats: STORYBOARD.beats.map((b, i) => (i === 0 ? { ...b, start_time: 0.05 } : b)) }; // off the 0.1 s grid: storyboard_invalid
  const make = (author = AUTHOR_MICROS) => { const s = route({ author, pass1: { visual: [VIS_FINDING] }, revision: true, repair: PATCH, pass2: {} }); s.motion_storyboard = [step(BAD, OBSERVED_SPLIT.storyboard), step(STORYBOARD_INPUT, REVISION_MICROS)]; return s; };
  const h = await harness(t, make(), { ceiling: GRANT });
  const { v } = await h.run();
  assert.equal(v.status, 'ready', JSON.stringify(v.failure ?? v.failure_reason));
  assert.deepEqual(h.fake.trace.map(c => c.tool), ['motion_brief', 'motion_storyboard', 'motion_storyboard', 'motion_composition', 'motion_review', 'motion_review', 'motion_composition', 'motion_review', 'motion_review']);
  assert.deepEqual([v.repair_count, v.repairs, v.spend.calls], [2, { storyboard: 1, author: 1 }, 9]);
  assert.equal(h.fake.trace[6].max_tokens, AUTHOR_REPAIR_CAP, 'the Author repair after a PRE-Author revision is a patch');
  // Its guard peaks by Author profile (0.37, 0.60, 1.152778, 1.48).
  const row = [];
  for (const a of [370_000, 600_000, AUTHOR_MICROS, 1_480_000]) { const p = await harness(t, make(a), { ceiling: GRANT }); await p.run(); row.push(Math.max(...peaks(p.fake.trace).map(r => r.peak))); }
  assert.deepEqual(row, [2_635_035, 2_635_035, 3_111_273, 3_438_495]);
  assert.ok(row.every(p => p <= CEILING), 'the US$3.50 ceiling covers this route at every profile, the Author at its cap included');
});
