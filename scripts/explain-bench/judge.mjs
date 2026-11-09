// Blind Sonnet judge for the /explain card benchmark (owner 2026-11-08). Model claude-sonnet-5-5, never Opus (owner rule). Versioned rubrics:
// factual (one call per card), faithful (the pre-written sketch's Core line against a diagram), beyond (a diagram against its card's prose) and picture.
// Items are shuffled and carry no set, prompt id, label or expected answer. Results are cached by (rubric version, content hash) in judge-cache.json.
// A rubric kind has one ACTIVE version (RUBRICS); older versions stay selectable for re-scoring (useRubrics, report.mjs --rubrics factual=factual-v1).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const JUDGE_MODEL = 'claude-sonnet-5-5';
// claude-sonnet-5-5 list price, US$ per token (claude-api skill model table, cached 2026-10-06): $2 input / $10 output per million.
export const PRICE = { input: 2 / 1e6, output: 10 / 1e6 };
const WORST_CALL = 0.02; // a call is started only while this much of the judge cap is left (about 2x the largest expected call)
export const CREDENTIALS_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';

const TOOL = (description, properties, required) => ({ name: 'record_review', description, input_schema: { type: 'object', additionalProperties: false, required, properties } });
const VERDICT = (...values) => ({ verdict: { type: 'string', enum: values }, reason: { type: 'string' } });
const verdictOk = values => x => values.includes(x?.verdict) && typeof x.reason === 'string';
const verdictReview = x => ({ verdict: x.verdict, reason: x.reason });

// The G3 factual gate's rubric, verbatim (C:/s/spec/benchmarks/explain-visual-choice-2026-11-08/judge.mjs, 2026-11-08): the strict fact-checker.
const G3_RUBRIC = `You are a strict fact-checker for short educational explanation cards. You get the card's title, its prose, the text of its diagrams and the captions of its pictures. Judge factual accuracy only: not style, length, layout or the choice of visuals.
Score 1-5: 5 = every claim is correct; 4 = correct, with at most a minor imprecision or simplification a teacher would accept; 3 = one clear factual error or one misleading claim; 2 = several factual errors; 1 = mostly wrong.
error = "yes" if any statement is false (a simplification is not an error), else "no".
Answer with JSON only, no other text: {"score": <1-5>, "error": "yes" | "no", "note": "<one line naming the error, or empty>"}`;

export const RUBRIC_VERSIONS = {
  // factual-v1: the bench's first factual rubric (tool call, sees the learner's question, the raw diagram JSON, key terms and follow-up questions; lists every imprecision).
  'factual-v1': { kind: 'factual', version: 'factual-v1 2026-11-08', text: 'You check one explanation card written for a learner, for FACTUAL ACCURACY only. Read the learner\'s question and the card (prose, diagram specs given as JSON, picture captions, key terms, follow-up questions). Score 1-5: 5 = no factual error; 4 = minor imprecision that would not mislead; 3 = one clear factual error; 2 = several errors, or one that misleads about the core idea; 1 = mostly wrong. List every factual error as the claim and why it is wrong. Do not judge style, length, layout or the choice of visual. Call record_review once.',
    tool: TOOL('Record the factual review of the card.', { score: { type: 'integer', enum: [1, 2, 3, 4, 5] }, errors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['claim', 'why'], properties: { claim: { type: 'string' }, why: { type: 'string' } } } } }, ['score', 'errors']),
    valid: x => [1, 2, 3, 4, 5].includes(x?.score) && Array.isArray(x.errors), review: x => ({ score: x.score, errors: x.errors }) },
  // factual-v2: the G3 setup (owner decision 2026-11-08): the strict fact-checker, error = a FALSE statement (a simplification is not an error), shown the title, the prose,
  // the diagrams' visible text and the picture captions, answering JSON text with no tool. Result shape as v1: errors holds the one noted error when error = "yes".
  'factual-v2': { kind: 'factual', version: 'factual-v2 2026-11-08 (G3 strict fact-checker)', text: G3_RUBRIC, json: true,
    valid: x => [1, 2, 3, 4, 5].includes(x?.score) && ['yes', 'no'].includes(x?.error), review: x => ({ score: x.score, errors: x.error === 'yes' ? [{ claim: String(x.note || ''), why: '' }] : [], note: String(x.note || '') }) },
  // faithful-v2 (owner 2026-11-08 closing pass): judged on the sketch's Core line only.
  'faithful-v2': { kind: 'faithful', version: 'faithful-v2 2026-11-08', text: 'You compare one diagram with a content sketch written in advance for a short card (about 450 characters of prose). The sketch has a Core line (what the diagram must show) and an Optional line (extras a short card may leave out). Judge the Core line only: fully = the diagram shows every Core element; partly = it shows some Core elements; not = it shows none of the Core, or contradicts it. Optional elements never lower the verdict. Give a one-line reason. Do not judge style or layout. Call record_review once.',
    tool: TOOL('Record whether the diagram is faithful to the sketch.', VERDICT('fully', 'partly', 'not'), ['verdict', 'reason']), valid: verdictOk(['fully', 'partly', 'not']), review: verdictReview },
  'beyond-v1': { kind: 'beyond', version: 'beyond-v1 2026-11-08', text: 'You compare one diagram with the prose of the card it sits in. Answer: does the diagram state any fact, number or name that the prose does not? yes = it states at least one (name it in the reason); no = everything it states is in the prose or follows directly from it. Labels that only repeat or shorten terms from the prose are not new claims. Give a one-line reason. Call record_review once.',
    tool: TOOL('Record whether the diagram states anything the prose does not.', VERDICT('yes', 'no'), ['verdict', 'reason']), valid: verdictOk(['yes', 'no']), review: verdictReview },
  // beyond-v2 (owner 2026-11-08): numbers are not claims; only NAMED facts the prose does not give count.
  'beyond-v2': { kind: 'beyond', version: 'beyond-v2 2026-11-08', text: 'You compare one diagram with the prose of the card it sits in. Answer: does the diagram state any NAMED fact that the prose does not give? Named facts are dates, heights and other measured quantities of real things, names of parts, historical particulars, and named entities (people, places, organisations, species, theorems, algorithms). yes = it states at least one named fact the prose does not give (name it in the reason); no = every named fact in the diagram is in the prose or follows directly from it. Do NOT count: plotted values, data points, axis ranges, tick values, example counts or made-up example numbers that illustrate a mechanism, any number computed from a formula the prose states, labels that only repeat or shorten terms from the prose, or generic structure such as steps and arrows. Give a one-line reason. Call record_review once.',
    tool: TOOL('Record whether the diagram states a named fact the prose does not give.', VERDICT('yes', 'no'), ['verdict', 'reason']), valid: verdictOk(['yes', 'no']), review: verdictReview },
  // Owner 2026-11-08: the picture-content check (no gate yet; ~1 in 10 "no" decides whether a picture-prompt content contract goes into the prompt change).
  'picture-v1': { kind: 'picture', version: 'picture-v1 2026-11-08', text: 'You check one picture planned for a learning card, from its description only: the prompt sent to the image model, its alt text and its caption. Read the question the learner asked and the card prose next to the picture. Answer: does the described picture show what the question asks, from a view that teaches it? yes = it shows the subject the question is about, from a view (angle, cut-away, scale, moment) that helps a learner see the answer; no = it shows something else, only decoration, or a view that cannot teach the answer. Give a one-line reason. Do not judge style or image quality. Call record_review once.',
    tool: TOOL('Record whether the described picture shows what the question asks.', VERDICT('yes', 'no'), ['verdict', 'reason']), valid: verdictOk(['yes', 'no']), review: verdictReview },
};
// The active version of each kind (a mutable registry: the CLI may switch it with useRubrics before judging).
export const RUBRICS = { factual: RUBRIC_VERSIONS['factual-v2'], faithful: RUBRIC_VERSIONS['faithful-v2'], beyond: RUBRIC_VERSIONS['beyond-v2'], picture: RUBRIC_VERSIONS['picture-v1'] };
// 'factual=factual-v1,beyond=beyond-v1' or 'factual-v1,beyond-v1' (the kind is in the version's name): makes those versions active. -> the previous active set.
export function useRubrics(spec) {
  const before = { ...RUBRICS };
  for (const part of String(spec || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const name = part.includes('=') ? part.split('=')[1] : part, def = RUBRIC_VERSIONS[name];
    if (!def || (part.includes('=') && part.split('=')[0] !== def.kind)) throw new Error(`unknown rubric ${part}; versions: ${Object.keys(RUBRIC_VERSIONS).join(', ')}`);
    RUBRICS[def.kind] = def;
  }
  return before;
}
export const hashOf = s => createHash('sha256').update(s).digest('hex');
export const rubricHash = name => hashOf(RUBRICS[name].text).slice(0, 16);
// A dry run's cost range: input from characters (about 3.5 a token, plus ~250 tokens of tool schema), output 150-600 tokens (tool call plus low-effort thinking). Estimate, not measured.
const estimate = (rubric, text) => { const input = Math.ceil((RUBRICS[rubric].text.length + text.length) / 3.5) + 250; return { input, low: input * PRICE.input + 150 * PRICE.output, high: input * PRICE.input + 600 * PRICE.output }; };

// The request body for one item: the rubric as the system text, the item text as the only user message. Nothing else.
// A tool rubric asks for record_review at low effort; a json rubric (factual-v2) is the G3 request exactly: no tool, no effort setting, 1,200 tokens.
export function requestBody(rubric, text) {
  const def = RUBRICS[rubric];
  return def.json ? { model: JUDGE_MODEL, max_tokens: 1200, system: def.text, messages: [{ role: 'user', content: text }] }
    : { model: JUDGE_MODEL, max_tokens: 4000, output_config: { effort: 'low' }, system: def.text, tools: [def.tool], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: text }] };
}
// The reply's answer: the record_review input, or (json) the object between the first { and the last } of the text, as the G3 judge parsed it.
function answerOf(def, body) {
  if (!def.json) return (body.content || []).find(b => b.type === 'tool_use' && b.name === 'record_review')?.input;
  const txt = (body.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  try { return JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); } catch { return null; }
}

// The key is read BY NAME at the first call, held in this closure, never printed (as scripts/animation/author-sample.mjs devKeyTransport).
export function keyTransport(file = CREDENTIALS_FILE) {
  let key = null;
  return async body => {
    if (!key) { const t = readFileSync(file, 'utf8'); key = (t.match(/^ANTHROPIC_API_KEY=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, ''); if (!key) throw new Error('no ANTHROPIC_API_KEY in the credentials file'); }
    return fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  };
}

const shuffle = (a, random) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

// items: [{ key, rubric: 'factual'|'faithful'|'beyond'|'picture', text }]. judges: independent reviews per item, each judge in its own shuffled order.
// -> { model, rubrics, judges, calls, cached, spent, stopped, failed, results: { [key]: [review, ...] } }
// dryRun: no call is made; the result counts the items and estimates their cost.
export async function judgeItems(items, { judges = 1, cap = 1, call, random = Math.random, cacheFile = null, log = () => {}, dryRun = false }) {
  const cache = cacheFile && existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const out = { model: JUDGE_MODEL, rubrics: Object.fromEntries(Object.keys(RUBRICS).map(k => [k, { version: RUBRICS[k].version, hash: rubricHash(k) }])), judges, dryRun, items: 0, byRubric: {}, estimate: dryRun ? { inputTokens: 0, low: 0, high: 0 } : undefined, calls: 0, cached: 0, spent: 0, stopped: false, failed: 0, results: {} };
  for (let j = 1; j <= judges; j++) {
    for (const item of shuffle(items, random)) {
      const def = RUBRICS[item.rubric], ck = `${def.version}|j${j}|${hashOf(item.text)}`;
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
        const input = answerOf(def, body);
        if (!def.valid(input)) throw new Error(def.json ? 'no valid JSON answer' : 'no valid record_review call');
        review = def.review(input);
      } catch (e) { out.failed++; log(`judge ${item.rubric} failed: ${String(e.message).slice(0, 160)}`); continue; }
      cache[ck] = review; (out.results[item.key] ||= []).push(review);
      if (cacheFile) writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
    }
  }
  out.spent = +out.spent.toFixed(4);
  if (dryRun) out.estimate = { inputTokens: out.estimate.inputTokens, low: +out.estimate.low.toFixed(4), high: +out.estimate.high.toFixed(4) };
  return out;
}

// Several judges -> one review: factual = mean score and every flagged error; faithful, beyond and picture = the majority verdict (ties go to the lower verdict).
export function combine(rubric, reviews) {
  if (!reviews?.length) return null;
  if (rubric === 'factual') return { score: +(reviews.reduce((s, r) => s + r.score, 0) / reviews.length).toFixed(2), errors: reviews.flatMap(r => r.errors), notes: reviews.map(r => r.note).filter(Boolean), judges: reviews.length };
  // Lowest verdict first, so a tie goes to it. beyond: "yes" (a claim beyond the prose) is the worse verdict.
  const order = rubric === 'faithful' ? ['not', 'partly', 'fully'] : rubric === 'beyond' ? ['yes', 'no'] : ['no', 'yes'], count = v => reviews.filter(r => r.verdict === v).length;
  const verdict = order.reduce((best, v) => (count(v) > count(best) ? v : best), order[0]);
  return { verdict, reason: reviews.find(r => r.verdict === verdict).reason, judges: reviews.length };
}
