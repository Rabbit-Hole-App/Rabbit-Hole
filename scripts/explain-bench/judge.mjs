// Blind Sonnet judge for the /explain card benchmark (owner 2026-11-08). Model claude-sonnet-5-5, never Opus (owner rule). Two versioned rubrics:
// factual (one call per card) and faithful (one call per content-set diagram: the pre-written sketch against the diagram's own description).
// Items are shuffled and carry no set, prompt id, label or expected answer. Results are cached by (content hash, rubric version) in judge-cache.json.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const JUDGE_MODEL = 'claude-sonnet-5-5';
// claude-sonnet-5-5 list price, US$ per token (claude-api skill model table, cached 2026-10-06): $2 input / $10 output per million.
export const PRICE = { input: 2 / 1e6, output: 10 / 1e6 };
const WORST_CALL = 0.02; // a call is started only while this much of the judge cap is left (about 2x the largest expected call)
export const CREDENTIALS_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';

export const RUBRICS = {
  factual: { version: 'factual-v1 2026-11-08', text: 'You check one explanation card written for a learner, for FACTUAL ACCURACY only. Read the learner\'s question and the card (prose, diagram specs given as JSON, picture captions, key terms, follow-up questions). Score 1-5: 5 = no factual error; 4 = minor imprecision that would not mislead; 3 = one clear factual error; 2 = several errors, or one that misleads about the core idea; 1 = mostly wrong. List every factual error as the claim and why it is wrong. Do not judge style, length, layout or the choice of visual. Call record_review once.' },
  faithful: { version: 'faithful-v1 2026-11-08', text: 'You compare one diagram with a content sketch written in advance. Answer: does this diagram show what the sketch says, with no claim the card\'s prose does not make? yes = it shows the sketch\'s content and adds nothing the prose does not say; partly = some of the sketch, or a claim beyond the prose; no = it shows something else or contradicts the sketch. Give a one-line reason. Do not judge style or layout. Call record_review once.' },
  // Owner 2026-11-08: the picture-content check (no gate yet; ~1 in 10 "no" decides whether a picture-prompt content contract goes into the prompt change).
  picture: { version: 'picture-v1 2026-11-08', text: 'You check one picture planned for a learning card, from its description only: the prompt sent to the image model, its alt text and its caption. Read the question the learner asked and the card prose next to the picture. Answer: does the described picture show what the question asks, from a view that teaches it? yes = it shows the subject the question is about, from a view (angle, cut-away, scale, moment) that helps a learner see the answer; no = it shows something else, only decoration, or a view that cannot teach the answer. Give a one-line reason. Do not judge style or image quality. Call record_review once.' },
};
export const rubricHash = name => hashOf(RUBRICS[name].text).slice(0, 16);
const TOOLS = {
  factual: { name: 'record_review', description: 'Record the factual review of the card.', input_schema: { type: 'object', additionalProperties: false, required: ['score', 'errors'],
    properties: { score: { type: 'integer', enum: [1, 2, 3, 4, 5] }, errors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['claim', 'why'], properties: { claim: { type: 'string' }, why: { type: 'string' } } } } } } },
  faithful: { name: 'record_review', description: 'Record whether the diagram is faithful to the sketch.', input_schema: { type: 'object', additionalProperties: false, required: ['verdict', 'reason'],
    properties: { verdict: { type: 'string', enum: ['yes', 'partly', 'no'] }, reason: { type: 'string' } } } },
  picture: { name: 'record_review', description: 'Record whether the described picture shows what the question asks.', input_schema: { type: 'object', additionalProperties: false, required: ['verdict', 'reason'],
    properties: { verdict: { type: 'string', enum: ['yes', 'no'] }, reason: { type: 'string' } } } },
};
const valid = { factual: x => [1, 2, 3, 4, 5].includes(x?.score) && Array.isArray(x.errors), faithful: x => ['yes', 'partly', 'no'].includes(x?.verdict) && typeof x.reason === 'string', picture: x => ['yes', 'no'].includes(x?.verdict) && typeof x.reason === 'string' };
// A dry run's cost range: input from characters (about 3.5 a token, plus ~250 tokens of tool schema), output 150-600 tokens (tool call plus low-effort thinking). Estimate, not measured.
const estimate = (rubric, text) => { const input = Math.ceil((RUBRICS[rubric].text.length + text.length) / 3.5) + 250; return { input, low: input * PRICE.input + 150 * PRICE.output, high: input * PRICE.input + 600 * PRICE.output }; };
export const hashOf = s => createHash('sha256').update(s).digest('hex');

// The request body for one item: the rubric as the system text, the item text as the only user message. Nothing else.
export const requestBody = (rubric, text) => ({ model: JUDGE_MODEL, max_tokens: 4000, output_config: { effort: 'low' }, system: RUBRICS[rubric].text,
  tools: [TOOLS[rubric]], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: text }] });

// The key is read BY NAME at the first call, held in this closure, never printed (as scripts/animation/author-sample.mjs devKeyTransport).
export function keyTransport(file = CREDENTIALS_FILE) {
  let key = null;
  return async body => {
    if (!key) { const t = readFileSync(file, 'utf8'); key = (t.match(/^ANTHROPIC_API_KEY=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, ''); if (!key) throw new Error('no ANTHROPIC_API_KEY in the credentials file'); }
    return fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  };
}

const shuffle = (a, random) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

// items: [{ key, rubric: 'factual'|'faithful', text }]. judges: independent reviews per item, each judge in its own shuffled order.
// -> { model, rubrics, judges, calls, cached, spent, stopped, failed, results: { [key]: [review, ...] } }
// dryRun: no call is made; the result counts the items and estimates their cost.
export async function judgeItems(items, { judges = 1, cap = 1, call, random = Math.random, cacheFile = null, log = () => {}, dryRun = false }) {
  const cache = cacheFile && existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const out = { model: JUDGE_MODEL, rubrics: Object.fromEntries(Object.keys(RUBRICS).map(k => [k, { version: RUBRICS[k].version, hash: rubricHash(k) }])), judges, dryRun, items: 0, byRubric: {}, estimate: dryRun ? { inputTokens: 0, low: 0, high: 0 } : undefined, calls: 0, cached: 0, spent: 0, stopped: false, failed: 0, results: {} };
  for (let j = 1; j <= judges; j++) {
    for (const item of shuffle(items, random)) {
      const ck = `${RUBRICS[item.rubric].version}|j${j}|${hashOf(item.text)}`;
      out.items++; out.byRubric[item.rubric] = (out.byRubric[item.rubric] || 0) + 1;
      if (cache[ck]) { (out.results[item.key] ||= []).push(cache[ck]); out.cached++; continue; }
      if (dryRun) { const e = estimate(item.rubric, item.text); out.estimate.inputTokens += e.input; out.estimate.low += e.low; out.estimate.high += e.high; continue; }
      if (out.spent + WORST_CALL > cap) { out.stopped = true; continue; }
      let review = null;
      try {
        const res = await call(requestBody(item.rubric, item.text)), body = await res.json().catch(() => null);
        out.calls++;
        const u = body?.usage || {}; out.spent += (u.input_tokens || 0) * PRICE.input + (u.output_tokens || 0) * PRICE.output;
        if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
        if (body.stop_reason === 'refusal') throw new Error('judge refused');
        const input = (body.content || []).find(b => b.type === 'tool_use' && b.name === 'record_review')?.input;
        if (!valid[item.rubric](input)) throw new Error('no valid record_review call');
        review = item.rubric === 'factual' ? { score: input.score, errors: input.errors } : { verdict: input.verdict, reason: input.reason };
      } catch (e) { out.failed++; log(`judge ${item.rubric} failed: ${String(e.message).slice(0, 160)}`); continue; }
      cache[ck] = review; (out.results[item.key] ||= []).push(review);
      if (cacheFile) writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
    }
  }
  out.spent = +out.spent.toFixed(4);
  if (dryRun) out.estimate = { inputTokens: out.estimate.inputTokens, low: +out.estimate.low.toFixed(4), high: +out.estimate.high.toFixed(4) };
  return out;
}

// Several judges -> one review: factual = mean score and every flagged error; faithful and picture = the majority verdict (ties go to the lower verdict).
export function combine(rubric, reviews) {
  if (!reviews?.length) return null;
  if (rubric === 'factual') return { score: +(reviews.reduce((s, r) => s + r.score, 0) / reviews.length).toFixed(2), errors: reviews.flatMap(r => r.errors), judges: reviews.length };
  const order = ['no', 'partly', 'yes'], count = v => reviews.filter(r => r.verdict === v).length;
  const verdict = order.reduce((best, v) => (count(v) > count(best) ? v : best), 'no');
  return { verdict, reason: reviews.find(r => r.verdict === verdict).reason, judges: reviews.length };
}
