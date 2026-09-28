// /api/learn/grade* on the dev worker: the Jev side-by-side grader
// (docs/features/jev-grading.md). The learner still sees Opus; this only
// records what Jev would have said, one row per attempt.
import { authorizedBoardApp } from './learn-board.js';
import { GRADER_PROTOCOL_VERSION, JevError, askJev, jevRequest, parseJevAnswers, sha256Hex, stripFences, verdictFrom } from './learn-grade-jev.js';
import { pruneLearnGrades, reserveGrade, completeGrade, failGrade, setBaseline, reportRows } from './learn-grade-store.js';
import { reportFrom } from './learn-grade-report.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const ATTEMPT = /^[A-Za-z0-9:_-]{8,120}$/;
const BENCH_RUN = /^[A-Za-z0-9_-]{6,60}$/;
const BENCH_SETS = ['benchmark-v1', 'benchmark-v1-holdout'];
const INCOMPLETE = 'This attempt never finished. A new attempt needs a new attempt_id.';
const NO_KEY = 'Jev is not configured: set VERCEL_TYPESAFE_API_KEY on this worker.';
const SUBSCRIPTION_ONLY = 'Jev is off in subscription-only mode.';

export function validateGradeBody(body) {
  const { attempt_id: attemptId, mode, prompt, expects, answer } = body || {};
  if (typeof attemptId !== 'string' || !ATTEMPT.test(attemptId)) return { error: 'attempt_id must be 8-120 letters, digits, colon, dash or underscore' };
  if (mode !== 'challenge' && mode !== 'explain_back') return { error: 'mode must be challenge or explain_back' };
  if (typeof prompt !== 'string' || prompt.length > 4000) return { error: 'prompt must be a string of at most 4000 characters' };
  if (!Array.isArray(expects) || expects.length < 1 || expects.length > 8
    || expects.some(idea => typeof idea !== 'string' || idea.length < 1 || idea.length > 300 || !stripFences(idea))) {
    return { error: 'expects must be 1-8 ideas of 1-300 characters, each non-empty without code blocks' };
  }
  if (typeof answer !== 'string' || answer.length < 1 || answer.length > 4000) return { error: 'answer must be 1-4000 characters' };
  const optional = value => (typeof value === 'string' && value.length <= 200 ? value : null);
  return { value: { attempt_id: attemptId, mode, prompt, expects, answer, board: optional(body.board), block_id: optional(body.block_id) } };
}

// Constant time over the expected secret's length.
function sameSecret(given, expected) {
  const a = new TextEncoder().encode(String(given ?? ''));
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let index = 0; index < b.length; index += 1) diff |= (a[index] ?? 0) ^ b[index];
  return diff === 0;
}

const doneBody = (id, duplicate, texts, probabilities, extra) => ({
  grade_id: id,
  status: 'done',
  duplicate,
  jev: {
    ideas: texts.map((text, index) => ({ text, p: probabilities.ideas[index] })),
    misconception: probabilities.misconception,
    non_attempt: probabilities.non_attempt,
    verdict: verdictFrom(probabilities),
  },
  ...extra,
});

function duplicateResponse(existing, texts) {
  if (existing.status === 'done') {
    return json(doneBody(existing.id, true, texts, JSON.parse(existing.jev), {
      ms: existing.jev_ms, model: existing.jev_model, generation_id: existing.jev_generation_id, grader_protocol_version: existing.grader_protocol_version, cost: existing.jev_cost, input_tokens: existing.jev_tokens,
    }));
  }
  if (existing.status === 'failed') return json({ grade_id: existing.id, status: 'failed', duplicate: true, error: existing.jev_error }, 502);
  if (existing.status === 'pending') return json({ grade_id: existing.id, status: 'pending' }, 202);
  return json({ grade_id: existing.id, status: 'incomplete', error: INCOMPLETE }, 409);
}

const hashed = async text => `sha256:${await sha256Hex(text)}`;

// The bench secret authorizes this route; it must never reach CONTROL_PLANE,
// which repositoryIdentity forwards all request headers to for repo-* apps.
const withoutBenchSecret = req => {
  const headers = new Headers(req.headers);
  headers.delete('x-learn-bench-secret');
  return { url: req.url, headers };
};

// Order: authorize, validate (400), key and subscription checks (503, nothing
// written, no prune), prune, reserve, call Jev, update the row.
async function grade(req, env, bench) {
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const access = await authorizedBoardApp(bench ? withoutBenchSecret(req) : req, env, body?.app);
  if (access instanceof Response) return access;
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const input = validateGradeBody(body);
  if (input.error) return json({ error: input.error }, 400);
  const { value } = input;
  let set = null;
  let run = null;
  if (bench) {
    set = body.set;
    run = body.bench_run;
    if (!BENCH_SETS.includes(set)) return json({ error: `set must be one of ${BENCH_SETS.join(', ')}` }, 400);
    if (typeof run !== 'string' || !BENCH_RUN.test(run)) return json({ error: 'bench_run must be 6-60 letters, digits, dash or underscore' }, 400);
    if (!value.attempt_id.startsWith(`${run}:`)) return json({ error: 'attempt_id must start with bench_run followed by a colon' }, 400);
  }
  if (env.SUBSCRIPTION_ONLY === 'true') return json({ error: SUBSCRIPTION_ONLY }, 503);
  if (!env.VERCEL_TYPESAFE_API_KEY) return json({ error: NO_KEY }, 503);
  await pruneLearnGrades(env);

  const holdout = !!set?.endsWith('-holdout');
  const stored = holdout
    ? { prompt: await hashed(value.prompt), expects: JSON.stringify(await Promise.all(value.expects.map(hashed))), answer: await hashed(value.answer) }
    : { prompt: value.prompt, expects: JSON.stringify(value.expects), answer: value.answer };
  const reserved = await reserveGrade(env, {
    org: access.org, email: access.email, app: body.app, board: value.board, block_id: value.block_id, mode: value.mode,
    attempt_id: value.attempt_id, source: bench ? 'bench' : 'canvas', bench_run: run, bench_set: set,
    grader_protocol_version: GRADER_PROTOCOL_VERSION, ...stored,
  });
  if (reserved.duplicate) return duplicateResponse(reserved.existing, holdout ? value.expects : JSON.parse(reserved.existing.expects));

  const started = Date.now();
  try {
    const result = await askJev(env, jevRequest(value, value.answer));
    const probabilities = parseJevAnswers(result.body, value.expects.length);
    await completeGrade(env, reserved.id, { jev: { ...probabilities, verdict: verdictFrom(probabilities) }, ms: result.ms, inputTokens: result.inputTokens, cost: result.cost, model: result.model, generationId: result.generationId });
    return json(doneBody(reserved.id, false, value.expects, probabilities, { ms: result.ms, model: result.model, generation_id: result.generationId, grader_protocol_version: GRADER_PROTOCOL_VERSION, cost: result.cost, input_tokens: result.inputTokens }));
  } catch (error) {
    const message = error instanceof JevError ? error.message : `Jev grading failed: ${error.message}`;
    await failGrade(env, reserved.id, { error: message, ms: Date.now() - started });
    return json({ grade_id: reserved.id, status: 'failed', duplicate: false, error: message }, 502);
  }
}

// Canvas rows only: the body cannot choose `source`.
export const gradeWithJev = (req, env) => grade(req, env, false);

// The only way to write `source = 'bench'`: a session plus a secret the
// browser never holds.
export async function benchGrade(req, env) {
  if (!env.LEARN_BENCH_SECRET) return json({ error: 'Not found' }, 404);
  if (!sameSecret(req.headers.get('x-learn-bench-secret'), env.LEARN_BENCH_SECRET)) return json({ error: 'Bench secret required' }, 403);
  return grade(req, env, true);
}

// One-shot per row, for the learner who owns it. `ms` is the browser's wall
// time for the Opus grade: an integer from 0 to 600000.
export async function recordBaseline(req, env, rawId) {
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (!/^[0-9]+$/.test(rawId)) return json({ error: 'Grade id must be a number' }, 400);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const access = await authorizedBoardApp(req, env, body?.app);
  if (access instanceof Response) return access;
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  if (!('verdict' in body) || !['good', 'partial', null].includes(body.verdict)) return json({ error: 'verdict must be good, partial or null' }, 400);
  if (!Number.isInteger(body.ms) || body.ms < 0 || body.ms > 600000) return json({ error: 'ms must be an integer from 0 to 600000' }, 400);
  const changed = await setBaseline(env, { id: Number(rawId), org: access.org, email: access.email, app: body.app, verdict: body.verdict, ms: body.ms });
  return changed ? json({ ok: true }) : json({ error: 'No such grade for you, or its baseline is already recorded.' }, 404);
}

// A GET: the app comes from the query string. The caller's own canvas rows
// only, counts and rates only.
export async function gradeReport(req, env) {
  if (req.method !== 'GET') return json({ error: 'GET required' }, 405);
  const app = new URL(req.url).searchParams.get('app');
  const access = await authorizedBoardApp(req, env, app);
  if (access instanceof Response) return access;
  await pruneLearnGrades(env);
  const rows = await reportRows(env, { org: access.org, email: access.email, app });
  return json({ app, ...reportFrom(rows) });
}

export async function learnGradeRoute(path, req, env) {
  if (path === '/api/learn/grade') return gradeWithJev(req, env);
  if (path === '/api/learn/grade/bench') return benchGrade(req, env);
  if (path === '/api/learn/grade/report') return gradeReport(req, env);
  const baseline = path.match(/^\/api\/learn\/grade\/([^/]+)\/baseline$/);
  if (baseline) return recordBaseline(req, env, baseline[1]);
  return null;
}
