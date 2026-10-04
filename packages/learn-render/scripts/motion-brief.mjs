// Motion M2 development harness (spec §26 M2): one learner request through the shared Learner
// Intent Resolver, source grounding against the pinned nanoGPT fixture and the Motion Director,
// to a validated MotionBrief. Not a product command: no /motion route, no UI, no storyboard.
//   node scripts/motion-brief.mjs "/motion 15s explain me softmax func" [--concept attention]
//        [--select model.py:62-71] [--call] [--effort high]
// Without --call it stops before the model (the request is built and sized, nothing is sent).
// With --call it makes ONE paid Director call (plus at most one schema-only re-ask) and appends
// the call record (role, model, latency, tokens, cost, retries; never the prompt) to
// out/motion/director-calls.jsonl. Credentials: ANTHROPIC_API_KEY / ANTHROPIC_WORKSPACE_ID from
// the environment, else from MOTION_ENV_FILE or <repo>/.env; values are never printed.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anthropic } from '../../control-plane/src/ask.js';
import { resolveLearnerTurn } from '../../control-plane/src/learner-intent.js';
import { groundTarget } from '../../control-plane/src/source-grounding.js';
import { directorContext, directorRequest, runDirector } from '../motion/director.js';
import { durationDecision } from '../motion/duration.js';
import { fixtureSource } from '../motion/fixture-source.js';
import { resolveRole } from '../motion/model-config.js';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = resolve(PKG, '..', '..');
const OUT = join(PKG, 'out', 'motion');
const argv = process.argv.slice(2);
const flag = name => { const i = argv.indexOf(name); return i < 0 ? null : argv.splice(i, 2)[1]; };
const concept = flag('--concept');
const select = flag('--select');
const effort = flag('--effort') || 'high';
const call = argv.includes('--call');
const message = argv.filter(a => a !== '--call').join(' ');
if (!message) { console.error('usage: node scripts/motion-brief.mjs "/motion 15s explain me softmax func" [--concept attention] [--select model.py:62-71] [--call]'); process.exit(2); }

// Only the two Anthropic names are read from an env file, and their values are never printed.
function credentials() {
  const env = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID: process.env.ANTHROPIC_WORKSPACE_ID, MOTION_DIRECTOR_MODEL: process.env.MOTION_DIRECTOR_MODEL };
  const file = process.env.MOTION_ENV_FILE || join(ROOT, '.env');
  if (!env.ANTHROPIC_API_KEY && existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^(ANTHROPIC_API_KEY|ANTHROPIC_WORKSPACE_ID)=(.*)$/.exec(line.trim());
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return env;
}

const source = fixtureSource();
let repository_context = null;
if (select) {
  const m = /^(.+):(\d+)-(\d+)$/.exec(select);
  if (!m) { console.error('--select is path:start-end, e.g. model.py:62-71'); process.exit(2); }
  repository_context = { commit: source.commit, label: select, range: { path: m[1], start: +m[2], end: +m[3] } };
}
const turn = resolveLearnerTurn({ message, location: concept ? { concept } : {}, repository_context });
const grounding = groundTarget(turn, source);
const decision = durationDecision(turn.structured_interpretation.request_text);
const env = credentials();
const section = (n, title, body) => console.log(`\n${n}. ${title}\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`);

section(1, 'Resolved intent', { raw_user_message: turn.raw_user_message, ...turn.structured_interpretation, current_location: turn.current_location, repository_context: turn.repository_context });
section(2, 'Source refs', grounding.status === 'grounded'
  ? [`✓ target: ${grounding.resolved_target.label} (${grounding.resolution})`, ...grounding.resolved_target.candidates_considered.map(c => `  set aside: ${c.label} - ${c.reason}`), ...grounding.source_refs.map(r => `  ${r.id} ${r.role.padEnd(10)} ${r.path}:${r.start_line}-${r.end_line}${r.condition_ids.length ? ` [${r.condition_ids.join(',')}]` : ''}`), ...grounding.implementation_conditions.map(k => `  ${k.id} ${k.condition}: ${k.branches.map(b => `${b.when} -> ${b.runs}`).join(' | ')}`)].join('\n')
  : `✗ ${grounding.status}: ${grounding.clarification.question}`);
section(3, 'Normalized duration', decision.line);

const model = resolveRole('MOTION_DIRECTOR_MODEL', env);
if (!call) {
  const body = grounding.status === 'grounded' ? directorRequest(directorContext(turn, grounding, decision), { effort }) : null;
  section(4, 'Director result', body ? `dry run: would call MOTION_DIRECTOR_MODEL -> ${model}, effort ${effort}, ${JSON.stringify(body).length} request bytes. Add --call to send it.` : 'no Director call: the turn needs a clarification, not a brief.');
  section(5, 'Validated MotionBrief', 'none (dry run)');
  process.exit(0);
}
if (grounding.status === 'grounded' && !env.ANTHROPIC_API_KEY) { console.error(`\n✗ no ANTHROPIC_API_KEY in the environment or ${process.env.MOTION_ENV_FILE || join(ROOT, '.env')}`); process.exit(1); }

const result = await runDirector({ turn, grounding, call: anthropic, env, effort });
section(4, 'Director result', {
  status: result.status, ...(result.error ? { error: result.error, detail: result.detail, errors: result.errors } : {}),
  ...(result.clarification ? { clarification: result.clarification } : {}),
  calls: result.calls, format_retries: result.format_retries,
});
section(5, 'Validated MotionBrief', result.brief && result.status === 'brief' ? result.brief : 'none');
mkdirSync(OUT, { recursive: true });
if (result.brief) writeFileSync(join(OUT, `${result.brief.id}.json`), JSON.stringify(result.brief, null, 2));
if (result.calls.length) appendFileSync(join(OUT, 'director-calls.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), request: message, concept, select, status: result.status, error: result.error ?? null, brief_id: result.brief?.id ?? null, calls: result.calls, format_retries: result.format_retries.length })}\n`);
process.exitCode = result.status === 'failed' ? 1 : 0; // not process.exit(): Node on Windows aborts while fetch's handles close
