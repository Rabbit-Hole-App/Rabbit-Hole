// Motion development harness (spec §26 M2-M4): a learner request through the shared Learner
// Intent Resolver, source grounding against the pinned nanoGPT fixture and the Motion Director to
// a validated MotionBrief, then (--storyboard) the separate storyboard call to a validated
// storyboard, then (--author) the Motion Author to a Remotion composition, and (--proof) a local
// compile plus a probed frame sample. Not a product command: no /motion route, no UI, no review.
//   node scripts/motion-brief.mjs "15s explain me softmax func" --concept attention [--select model.py:62-71] [--storyboard] [--author] [--proof] [--call]
//   node scripts/motion-brief.mjs --brief <brief.json> [--storyboard | --storyboard-file <storyboard.json>] [--author | --source-file <composition.jsx>] [--proof] [--call] [--max-calls N]
// The request may be written with or without "/motion"; a Git Bash path rewrite of "/motion" is undone.
// Without --call it stops before the first model call (the request is built and sized, nothing is
// sent). With --call each stage makes ONE paid call (plus at most one schema-only re-ask), and each
// call record (stage, role, model, latency, tokens, cost, retries; never the prompt) is appended to
// out/motion/director-calls.jsonl. Credentials: ANTHROPIC_API_KEY / ANTHROPIC_WORKSPACE_ID from the
// environment, else from MOTION_ENV_FILE or <repo>/.env; values are never printed.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anthropic } from '../../control-plane/src/ask.js';
import { resolveLearnerTurn } from '../../control-plane/src/learner-intent.js';
import { groundTarget } from '../../control-plane/src/source-grounding.js';
import { validateBrief } from '../motion/contracts.js';
import { directorContext, directorRequest, runDirector } from '../motion/director.js';
import { durationDecision } from '../motion/duration.js';
import { fixtureSource } from '../motion/fixture-source.js';
import { resolveRole } from '../motion/model-config.js';
import { runStoryboard, storyboardRequest } from '../motion/storyboard.js';
import { checkStoryboard } from '../motion/storyboard-check.js';
import { authorRequest, checkAuthorOutput, runAuthor } from '../motion/author.js';
import { proveAuthor } from '../motion/author-proof.mjs';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = resolve(PKG, '..', '..');
const OUT = join(PKG, 'out', 'motion');
const argv = process.argv.slice(2);
const flag = name => { const i = argv.indexOf(name); return i < 0 ? null : argv.splice(i, 2)[1]; };
const switchOn = name => { const i = argv.indexOf(name); return i >= 0 && !!argv.splice(i, 1); };
const concept = flag('--concept');
const select = flag('--select');
const briefFile = flag('--brief');
const effort = flag('--effort') || 'high';
const call = switchOn('--call');
const withStoryboard = switchOn('--storyboard');
const storyboardFile = flag('--storyboard-file');
const sourceFile = flag('--source-file');
const withAuthor = switchOn('--author');
const withProof = switchOn('--proof');
const maxCalls = Number(flag('--max-calls')) || Infinity; // a hard cap on paid calls, the schema-only re-ask included
const typed = argv.join(' ').trim();
if (!typed && !briefFile) { console.error('usage: node scripts/motion-brief.mjs "15s explain me softmax func" [--concept attention] [--select model.py:62-71] [--storyboard] [--call]\n       node scripts/motion-brief.mjs --brief <brief.json> --storyboard [--call]'); process.exit(2); }

// Git Bash rewrites a leading "/motion" into a Windows path (C:/Program Files/Git/motion ...).
// Undo that, and accept the request without the slash at all.
function normalizeRequest(text) {
  const mangled = /^[A-Za-z]:[\\/].*?[\\/]motion(?=\s|$)/.exec(text);
  if (mangled) return { request: `/motion${text.slice(mangled[0].length)}`, note: '✓ request: restored "/motion" from a Git Bash path rewrite' };
  if (/^\/motion(?=\s|$)/.test(text)) return { request: text, note: null };
  return { request: `/motion ${text.replace(/^motion\s+/, '')}`, note: '✓ request: read as a /motion request' };
}

// Only the two Anthropic names are read from an env file, and their values are never printed.
function credentials() {
  const env = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID: process.env.ANTHROPIC_WORKSPACE_ID, MOTION_DIRECTOR_MODEL: process.env.MOTION_DIRECTOR_MODEL, MOTION_AUTHOR_MODEL: process.env.MOTION_AUTHOR_MODEL };
  const file = process.env.MOTION_ENV_FILE || join(ROOT, '.env');
  if (!env.ANTHROPIC_API_KEY && existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^(ANTHROPIC_API_KEY|ANTHROPIC_WORKSPACE_ID)=(.*)$/.exec(line.trim());
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return env;
}

const env = credentials();
const model = resolveRole('MOTION_DIRECTOR_MODEL', env);
const section = (n, title, body) => console.log(`\n${n}. ${title}\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`);
const record = entry => { mkdirSync(OUT, { recursive: true }); appendFileSync(join(OUT, 'director-calls.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`); };
const needKey = () => { if (!env.ANTHROPIC_API_KEY) { console.error(`\n✗ no ANTHROPIC_API_KEY in the environment or ${process.env.MOTION_ENV_FILE || join(ROOT, '.env')}`); process.exit(1); } };

let brief = null;
if (briefFile) {
  brief = JSON.parse(readFileSync(resolve(process.cwd(), briefFile), 'utf8'));
  const invalid = validateBrief(brief);
  section(1, 'MotionBrief (from file)', invalid.length ? `✗ invalid brief:\n  ${invalid.join('\n  ')}` : `✓ ${brief.id}: ${brief.title} (${brief.teaching_mode}, ${brief.duration.seconds}s, ${brief.claim_registry.length} claims, ${brief.must_show.length} must_show)`);
  if (invalid.length) process.exit(1);
} else {
  const { request, note } = normalizeRequest(typed);
  if (note) console.log(note);
  const source = fixtureSource();
  let repository_context = null;
  if (select) {
    const m = /^(.+):(\d+)-(\d+)$/.exec(select);
    if (!m) { console.error('--select is path:start-end, e.g. model.py:62-71'); process.exit(2); }
    repository_context = { commit: source.commit, label: select, range: { path: m[1], start: +m[2], end: +m[3] } };
  }
  const turn = resolveLearnerTurn({ message: request, location: concept ? { concept } : {}, repository_context });
  const grounding = groundTarget(turn, source);
  const decision = durationDecision(turn.structured_interpretation.request_text);
  section(1, 'Resolved intent', { raw_user_message: turn.raw_user_message, ...turn.structured_interpretation, current_location: turn.current_location, repository_context: turn.repository_context });
  section(2, 'Source refs', grounding.status === 'grounded'
    ? [`✓ target: ${grounding.resolved_target.label} (${grounding.resolution})`, ...grounding.resolved_target.candidates_considered.map(c => `  set aside: ${c.label} - ${c.reason}`), ...grounding.source_refs.map(r => `  ${r.id} ${r.role.padEnd(10)} ${r.path}:${r.start_line}-${r.end_line}${r.condition_ids.length ? ` [${r.condition_ids.join(',')}]` : ''}`), ...grounding.implementation_conditions.map(k => `  ${k.id} ${k.condition}: ${k.branches.map(b => `${b.when} -> ${b.runs}`).join(' | ')}`)].join('\n')
    : `✗ ${grounding.status}: ${grounding.clarification.question}`);
  section(3, 'Normalized duration', decision.line);
  if (!call) {
    const body = grounding.status === 'grounded' ? directorRequest(directorContext(turn, grounding, decision), { effort }) : null;
    section(4, 'Director result', body ? `dry run: would call MOTION_DIRECTOR_MODEL -> ${model}, effort ${effort}, ${JSON.stringify(body).length} request bytes. Add --call to send it.` : 'no Director call: the turn needs a clarification, not a brief.');
    section(5, 'Validated MotionBrief', 'none (dry run)');
    process.exit(0);
  }
  if (grounding.status === 'grounded') needKey();
  const result = await runDirector({ turn, grounding, call: anthropic, env, effort });
  section(4, 'Director result', {
    status: result.status, ...(result.error ? { error: result.error, detail: result.detail, errors: result.errors } : {}),
    ...(result.clarification ? { clarification: result.clarification } : {}),
    calls: result.calls, format_retries: result.format_retries,
  });
  section(5, 'Validated MotionBrief', result.brief && result.status === 'brief' ? result.brief : 'none');
  mkdirSync(OUT, { recursive: true });
  if (result.brief) writeFileSync(join(OUT, `${result.brief.id}.json`), JSON.stringify(result.brief, null, 2));
  if (result.calls.length) record({ stage: 'brief', request, concept, select, status: result.status, error: result.error ?? null, brief_id: result.brief?.id ?? null, calls: result.calls, format_retries: result.format_retries.length });
  if (result.status !== 'brief') { process.exitCode = result.status === 'failed' ? 1 : 0; }
  else brief = result.brief;
}

let storyboard = null;
if (storyboardFile && brief) {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), storyboardFile), 'utf8'));
  storyboard = raw.storyboard ?? raw; // a saved storyboard result or a bare storyboard
  const errors = checkStoryboard(storyboard, brief).errors;
  section(6, 'Storyboard (from file)', errors.length ? `✗ invalid storyboard:\n  ${errors.join('\n  ')}` : `✓ ${storyboard.id}: ${storyboard.beats.length} beats, ${storyboard.beats.at(-1).end_time}s`);
  if (errors.length) process.exit(1);
} else if (withStoryboard && brief) {
  if (!call) {
    section(6, 'Storyboard result', `dry run: would call MOTION_DIRECTOR_MODEL -> ${model} for the storyboard, effort ${effort}, ${JSON.stringify(storyboardRequest(brief, { effort })).length} request bytes. Add --call to send it.`);
  } else {
    needKey();
    const r = await runStoryboard({ brief, call: anthropic, env, effort });
    section(6, 'Storyboard result', { status: r.status, ...(r.error ? { error: r.error, detail: r.detail, errors: r.errors } : {}), ...(r.check?.errors.length ? { errors: r.check.errors } : {}), calls: r.calls, format_retries: r.format_retries });
    if (r.check) {
      section(7, 'Beat timeline (0.1 s grid, 30 fps; * = object changes in the beat)', r.check.timeline.map(t => `  ${t.id} ${String(t.start).padStart(4)}-${String(t.end).padEnd(4)}s  frames ${t.frames.join('-').padEnd(8)} ${t.role.padEnd(14)} claims ${t.claims.join(',')}${t.conditions.length ? ` [${t.conditions.join(',')}]` : ''}\n       objects: ${t.objects.join(', ')}${t.on_screen_text ? `\n       text: ${t.on_screen_text}` : ''}${t.narration_line ? `\n       narration (planned): ${t.narration_line}` : ''}`).join('\n'));
      section(8, 'must_show coverage (verified)', r.check.coverage.must_show.map(m => `  ${m.beats.length ? '✓' : '✗'} ${m.item}\n      -> ${m.beats.join(', ') || 'none'}${m.declared.join() !== m.beats.join() ? ` (declared: ${m.declared.join(', ') || 'none'})` : ''}`).join('\n'));
      section(9, 'Claim mapping', r.check.coverage.claims.map(c => `  ${c.beats.length || !c.required ? '✓' : '✗'} ${c.id}${c.required ? ' (required)' : ''}${c.condition_ids.length ? ` [${c.condition_ids.join(',')}]` : ''} -> ${c.beats.join(', ') || 'none'}`).join('\n'));
      section(10, 'Object continuity', r.check.coverage.objects.map(o => `  ${o.id}: ${o.beats.join(' -> ')}`).join('\n'));
      section(11, 'Storyboard JSON', r.storyboard);
      writeFileSync(join(OUT, `${r.storyboard.id}.json`), JSON.stringify({ storyboard: r.storyboard, status: r.status, errors: r.check.errors }, null, 2));
      console.log(`\nsaved out/motion/${r.storyboard.id}.json`);
    }
    if (r.calls.length) record({ stage: 'storyboard', brief_id: brief.id, status: r.status, error: r.error ?? null, semantic_errors: r.check?.errors.length ?? null, storyboard_id: r.storyboard?.id ?? null, calls: r.calls, format_retries: r.format_retries.length });
    process.exitCode = r.status === 'storyboard' ? 0 : 1; // not process.exit(): Node on Windows aborts while fetch's handles close
    if (r.status === 'storyboard') storyboard = r.storyboard;
  }
}

let composition = null;
if (sourceFile && brief && storyboard) {
  const output = { status: 'composition', composition_id: 'from-file', source: readFileSync(resolve(process.cwd(), sourceFile), 'utf8') };
  const check = checkAuthorOutput(output, brief, storyboard);
  section(12, 'Composition (from file)', check.errors.length ? `✗ author_invalid:\n  ${check.errors.join('\n  ')}` : `✓ static safety and the Author contract pass (${Object.keys(check.mapping.objects).length} objects mapped)`);
  if (!check.errors.length) composition = { output, mapping: check.mapping };
} else if (withAuthor && brief && storyboard) {
  const authorModel = resolveRole('MOTION_AUTHOR_MODEL', env);
  if (!call) {
    section(12, 'Author result', `dry run: would call MOTION_AUTHOR_MODEL -> ${authorModel}, effort ${effort}, streaming, ${JSON.stringify(authorRequest(brief, storyboard, { effort })).length} request bytes. Add --call to send it.`);
  } else {
    needKey();
    let spent = 0;
    const capped = (...args) => (++spent > maxCalls ? Promise.resolve(new Response(`refused locally: the --max-calls ${maxCalls} budget is spent`, { status: 429 })) : anthropic(...args));
    const r = await runAuthor({ brief, storyboard, call: capped, env, effort });
    section(12, 'Author result', { status: r.status, ...(r.error ? { error: r.error, detail: r.detail, errors: r.errors } : {}), ...(r.check?.errors.length ? { errors: r.check.errors } : {}), ...(r.output?.status === 'needs_revision' ? { needs_revision: r.output } : {}), calls: r.calls, format_retries: r.format_retries });
    if (r.output?.status === 'composition') {
      const file = join(OUT, `${r.output.composition_id}-${r.calls.at(-1).latency_ms}.jsx`);
      writeFileSync(file, r.output.source);
      section(13, 'Storyboard object -> renderer element', r.check.mapping ? Object.entries(r.check.mapping.objects).map(([id, el]) => `  ${id} -> ${el}`).join('\n') : 'none');
      console.log(`\nsaved ${relative(PKG, file)} (${r.output.source.length} bytes)${r.output.notes ? `\nnotes: ${r.output.notes}` : ''}`);
    }
    if (r.calls.length) record({ stage: 'author', brief_id: brief.id, storyboard_id: storyboard.id, status: r.status, error: r.error ?? null, contract_errors: r.check?.errors.length ?? null, calls: r.calls, format_retries: r.format_retries.length });
    process.exitCode = r.status === 'composition' || r.status === 'needs_revision' ? 0 : 1;
    if (r.status === 'composition') composition = { output: r.output, mapping: r.check.mapping };
  }
}

if (withProof && composition) {
  const dir = join(OUT, `proof-${storyboard.id}`);
  const p = await proveAuthor({ brief, storyboard, source: composition.output.source, TEXT: composition.mapping.text, dir });
  section(14, 'Compile + probed frames (local)', { compiled: p.compiled, errors: p.errors, frames: p.frames.map(x => `#${x.frame} ${relative(PKG, x.file)}`), timings_s: p.timings });
  if (!p.compiled || p.errors.length) process.exitCode = 1;
}
