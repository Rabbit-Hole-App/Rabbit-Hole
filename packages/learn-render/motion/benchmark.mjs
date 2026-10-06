// M8 (owner, 2026-10-06): Remotion vs HyperFrames on the same frozen brief and storyboard per case.
// Only the renderer-specific Author and the renderer differ inside a pair. Nothing here knows a topic,
// a case, an object id or a label: cases are declared data (fixtures/m8/cases.json), and every metric
// is read from the job record the production pipeline writes.
//
//   plan:  request -> grounding -> Director -> storyboard (its one production revision) -> frozen
//   pair:  per renderer, the frozen plan -> Author -> preview -> fresh reviews -> one Author repair if
//          blocking -> fresh reviews -> final. The storyboard stays frozen: a storyboard-level finding
//          goes to the Author repair, the production path once the storyboard repair is unavailable.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PRICES } from './director.js';
import { BLOCKING_CATEGORIES, validateBrief, validateStoryboard } from './contracts.js';
import { responseCost } from './orchestrator.mjs';
import { runMotionJob } from './review-job.mjs';

// The most a call can cost: its output ceiling at the output price, plus its input (text at about
// three characters a token, each image at most 1600 tokens) at the cache-write price. A call is
// refused when it could pass the ceiling, so the ceiling is hard.
export function worstCase(body, model) {
  const price = PRICES[model] || Object.values(PRICES)[0];
  let images = 0;
  const text = JSON.stringify(body, (k, v) => (k === 'data' && typeof v === 'string' && v.length > 1000 ? (images++, '') : v)).length;
  const input = text / 3 + images * 1600;
  return +(((body?.max_tokens || 0) * price.output + input * price.cache_write) / 1e6).toFixed(4);
}

// One ledger for every paid call in M8, kept on disk so the ceiling holds across invocations. A call
// reserves its worst case before it is sent and settles to its real cost when its response is read.
export function budgetLedger(file, limitUsd) {
  const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { limit_usd: limitUsd, spent_usd: 0, calls: [] };
  if (state.limit_usd !== limitUsd) throw new Error(`the ledger ${file} was opened with a $${state.limit_usd} ceiling, not $${limitUsd}`);
  let reserved = 0;
  const save = () => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(state, null, 2)); };
  return {
    state,
    get spent() { return state.spent_usd; },
    get reserved() { return reserved; },
    remaining: () => +(state.limit_usd - state.spent_usd - reserved).toFixed(4),
    // A call wrapped so it is refused locally (HTTP 429, like the orchestrator) when it could pass the ceiling.
    guard(call, tag) {
      return (env, body, model) => {
        const worst = worstCase(body, model);
        if (state.spent_usd + reserved + worst > state.limit_usd) {
          state.calls.push({ at: new Date().toISOString(), ...tag, model, refused: true, worst_case_usd: worst, spent_usd: state.spent_usd });
          save();
          return Promise.resolve(new Response(`refused locally: the $${state.limit_usd} ceiling could be passed ($${state.spent_usd.toFixed(4)} spent, $${reserved.toFixed(4)} in flight, this call may cost $${worst})`, { status: 429 }));
        }
        reserved += worst;
        const settle = cost => {
          reserved -= worst;
          state.spent_usd = +(state.spent_usd + cost).toFixed(6);
          state.calls.push({ at: new Date().toISOString(), ...tag, model, worst_case_usd: worst, cost_usd: cost });
          save();
        };
        return Promise.resolve(call(env, body, model)).then(response => {
          if (response?.ok && typeof response.clone === 'function') responseCost(response.clone(), model).then(cost => settle(cost ?? worst), () => settle(worst));
          else settle(response?.ok ? worst : 0);
          return response;
        }, error => { settle(0); throw error; });
      };
    },
    // Resolves once every reserved call has settled (a response read in the background).
    async idle() { while (reserved > 1e-9) await new Promise(done => setTimeout(done, 50)); },
  };
}

// The plan stage stops where the Author would start: the pipeline has grounded the request, run the
// Director and the storyboard (with its one revision), and validated both.
export const PLAN_FROZEN = 'plan_frozen';
export const freezeAtAuthor = async () => ({ status: 'failed', error: PLAN_FROZEN, detail: 'M8 freezes the brief and storyboard here', calls: [], format_retries: [], transport_retries: [] });
export function frozenPlan(out) {
  if (!out.brief || !out.storyboard || !String(out.failure_reason || '').includes(PLAN_FROZEN)) return { errors: [`no frozen plan: ${out.status}${out.failure_reason ? `: ${out.failure_reason}` : ''}${out.clarification ? `: ${out.clarification.question}` : ''}`] };
  const errors = [...validateBrief(out.brief), ...validateStoryboard(out.storyboard, out.brief)];
  return errors.length ? { errors } : { errors: [], brief: out.brief, storyboard: out.storyboard };
}

// The pair's review job: the same production job, with the frozen storyboard's revision unavailable.
export const frozenStoryboardJob = (job = runMotionJob) => args => job({ ...args, prior: { ...args.prior, repairs: { ...(args.prior?.repairs || {}), storyboard: 1 } } });

const sum = (xs, f) => xs.reduce((s, x) => s + (f(x) || 0), 0);
const round = (n, d = 1) => +Number(n).toFixed(d);
const VISUAL_CLASSES = { overlap_clipping: ['overlapping_text', 'clipped_text'], blank: ['blank_frame'], continuity: ['storyboard_fidelity'] };

// Every metric of one renderer's attempt, from its pipeline.json and its final composition source.
export function runMetrics(p, { source = '', determinism = null } = {}) {
  const findings = p.job?.findings || [];
  const byRound = r => findings.filter(f => f.round === r);
  const blocking = fs => fs.filter(f => BLOCKING_CATEGORIES.includes(f.category));
  const of = (fs, reviewer) => fs.filter(f => f.reviewer === reviewer);
  const calls = p.calls || [];
  const authorCalls = calls.filter(c => c.stage === 'author');
  const reviewRound = r => calls.filter(c => /_review$/.test(c.stage) && c.round === r);
  const passes = p.passes || [];
  const service = pass => pass?.preview?.timings?.total_s ?? null;
  const last = passes.at(-1);
  const lastFindings = last ? byRound(last.round) : [];
  return {
    status: p.status, failure_reason: p.failure_reason ?? null,
    generation: {
      author_first_pass_contract: passes[0]?.author === 'composition',
      first_pass_status: passes[0]?.author ?? null,
      ready: p.status === 'ready',
      author_repair: p.job?.repairs?.author ?? 0,
      transport_retries: (p.transport_retries || []).length,
      schema_reasks: (p.format_retries || []).length,
    },
    pedagogy: {
      missing_must_show: findings.filter(f => f.category === 'missing_must_show').length,
      unsupported_claims: findings.filter(f => f.category === 'unsupported_claim').length,
      teaching_blocking: [0, 1].map(r => blocking(of(byRound(r), 'pedagogical')).length).slice(0, passes.length),
      final_pedagogical_pass: p.status === 'ready' && !blocking(of(lastFindings, 'pedagogical')).length,
    },
    visual: {
      visual_blocking: [0, 1].map(r => blocking(of(byRound(r), 'visual')).length).slice(0, passes.length),
      harness_blocking: [0, 1].map(r => blocking(of(byRound(r), 'harness')).length).slice(0, passes.length),
      overlap_clipping: findings.filter(f => VISUAL_CLASSES.overlap_clipping.includes(f.category)).length,
      blank_frames: findings.filter(f => VISUAL_CLASSES.blank.includes(f.category)).length + (p.render?.validation?.final?.checks?.some(c => c.name === 'nonblank frames' && !c.ok) ? 1 : 0),
      continuity: findings.filter(f => VISUAL_CLASSES.continuity.includes(f.category)).length,
      cosmetic: findings.filter(f => !BLOCKING_CATEGORIES.includes(f.category)).length,
      findings: findings.map(f => ({ round: f.round, reviewer: f.reviewer, category: f.category, beat_id: f.beat_id ?? null, description: f.description })),
    },
    determinism: {
      // The final job's stills in two fresh contexts (separate bundle/server and browser), then a second
      // full final render of the same source compared frame by frame (final_rerender, measured after).
      stills_two_contexts: p.render?.validation?.determinism?.ok ?? null,
      final_rerender: determinism,
    },
    latency: {
      author_s: round(sum(authorCalls.filter(c => c.round === 0), c => c.latency_ms) / 1000),
      preview_render_s: passes.map(x => (service(x) === null ? null : round(service(x)))),
      review_s: passes.map(x => round(Math.max(0, ...reviewRound(x.round).map(c => c.latency_ms || 0)) / 1000)),
      repair_s: round(sum(authorCalls.filter(c => c.round === 1), c => c.latency_ms) / 1000),
      final_render_s: p.render?.timings?.total_s != null ? round(p.render.timings.total_s) : null,
      author_to_ready_s: p.status === 'ready' ? round((p.timings?.authoring || 0) + (p.timings?.review_and_render || 0)) : null,
      total_s: p.timings?.total ?? null,
    },
    cost: {
      input_tokens: sum(calls, c => c.usage?.input_tokens), output_tokens: sum(calls, c => c.usage?.output_tokens),
      cache_write_tokens: sum(calls, c => c.usage?.cache_creation_input_tokens), cache_read_tokens: sum(calls, c => c.usage?.cache_read_input_tokens),
      api_usd: round(sum(calls, c => c.cost_usd), 4),
      render_compute_s: round(sum(passes, x => service(x)) + (p.render?.timings?.total_s || 0)),
      calls: calls.map(c => ({ stage: c.stage, round: c.round ?? null, role: c.role, model: c.served_model, end: c.end ?? c.stop_reason, input: c.usage?.input_tokens, output: c.usage?.output_tokens, cache_write: c.usage?.cache_creation_input_tokens, cache_read: c.usage?.cache_read_input_tokens, cost_usd: c.cost_usd, latency_s: round((c.latency_ms || 0) / 1000) })),
    },
    engineering: {
      source_bytes: Buffer.byteLength(source),
      source_lines: source ? source.split('\n').length : 0,
      elements: (source.match(/<[A-Za-z][\w.-]*[\s/>]/g) || []).length,
      object_elements: (source.match(/data-object=/g) || []).length,
      gate_errors_first_pass: passes[0]?.author === 'author_invalid' ? (findings.find(f => f.round === 0 && f.reviewer === 'harness')?.description || '').split('; ').length : 0,
    },
  };
}
