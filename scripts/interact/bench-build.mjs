#!/usr/bin/env node
// scripts/interact/bench-build.mjs (Brief 45, Build MVP 1): the ten stored pendulum blueprints through the Build model, blueprint in, build-schema out, stop. Nothing is drawn: no Program, no card, no repair, no correction.
//   node scripts/interact/bench-build.mjs [--cap-usd 4] [--concurrency 3] [--only b43-pendulum-4]    the run; resumable (a finished answer is skipped); the first call is the probe
// The call is Hydrogen at high through a raw fetch (hydrogenCall of bench-blueprint.mjs: the openai-compatible request, strict json_schema, bounds dropped, oneOf as anyOf, thinking billed as output, $1.50 / $7.50 per million),
// so the answer is saved EXACTLY as returned and parsed afterwards: ajv (2020) against the full reference schema with every bound. The system text is build/index.js (build-general + card-facts + kinds-facts + build-schema-prompt),
// the user message the trimmed blueprint and the measurements (5.2, 5.3). The response schema is docs/features/interact/interactive-build-schema.schema.json with the same pairsAsLists re-expression as Design (a no-op here: no tuple).
// The first call is the probe: on an HTTP 400 the schema is re-expressed ONCE (empty `required` lists and zero minimums dropped, which accept the same objects) and sent again; a second 400 stops the run and says so.
import { parseArgs } from 'node:util';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { hydrogenCall, pairsAsLists } from './bench-blueprint.mjs';
import { buildInputs } from '../../packages/control-plane/src/agents/interactive-blueprint/build/index.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(REPO, 'docs/features/interact/benchmarks/build-mvp1'), MVP3 = join(REPO, 'docs/features/interact/benchmarks/blueprint-mvp3');
const SCHEMA_FILE = join(REPO, 'docs/features/interact/interactive-build-schema.schema.json'), LEVEL = 'high';
const Ajv = createRequire(join(REPO, 'packages/web/package.json'))('ajv/dist/2020');
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const rel = path => path.replace(`${REPO.replace(/\\/g, '/')}/`, '').replace(/\\/g, '/');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

// the ten: design-brief41 x5 (a label still has `at`; the model picks `near`) and design-brief43 x5 (labels have `near`)
export const BLUEPRINTS = ['b41', 'b43'].flatMap(prefix => [1, 2, 3, 4, 5].map(n => ({ name: `${prefix}-pendulum-${n}`, file: join(MVP3, prefix === 'b41' ? 'design-brief41' : 'design-brief43', `pendulum-${n}.json`) })));

// the one re-expression on a 400: the same objects accepted, written without constructs a provider may refuse (empty required lists, zero minimums)
export function reexpress(node) {
  if (Array.isArray(node)) return node.map(reexpress);
  if (!node || typeof node !== 'object') return node;
  const out = Object.fromEntries(Object.entries(node).filter(([k, v]) => !(k === 'required' && Array.isArray(v) && v.length === 0) && !((k === 'minLength' || k === 'minItems') && v === 0)).map(([k, v]) => [k, reexpress(v)]));
  return out;
}
const problemOf = errors => (errors?.length ? `${errors[0].instancePath || '(root)'} ${errors[0].message}${errors[0].params?.additionalProperty ? ` (${errors[0].params.additionalProperty})` : ''}` : 'does not match the schema');

async function main({ capUsd, concurrency, only }) {
  mkdirSync(join(OUT, 'prompts'), { recursive: true });
  const full = readJson(SCHEMA_FILE), validate = new Ajv({ strict: false, allErrors: true }).compile(full);
  let schema = pairsAsLists(full), reexpressed = false, spent = 0, stopped = false, probe = existsSync(join(OUT, 'probe.json')) ? readJson(join(OUT, 'probe.json')) : null;
  if (probe?.reexpressed) { schema = reexpress(schema); reexpressed = true; }
  const record = row => appendFileSync(join(OUT, 'rows.jsonl'), `${JSON.stringify({ ts: new Date().toISOString(), ...row })}\n`);
  const todo = BLUEPRINTS.filter(entry => !only || entry.name === only);

  async function one(entry, { isProbe = false } = {}) {
    const answerFile = join(OUT, 'build-schemas', `${entry.name}.json`);
    if (existsSync(answerFile)) return true;
    if (spent >= capUsd) { stopped = true; return false; }
    const blueprint = readJson(entry.file), inputs = await buildInputs(blueprint);
    write(join(OUT, 'measurements', `${entry.name}.json`), `${JSON.stringify(inputs.measurements, null, 2)}\n`);
    write(join(OUT, 'prompts', `system-${entry.name}.txt`), inputs.system); write(join(OUT, 'prompts', `user-${entry.name}.txt`), inputs.user);
    let result = await hydrogenCall({ system: inputs.system, user: inputs.user, schema, level: LEVEL });
    spent += result.costUsd ?? 0;
    if (isProbe) {
      const attempts = [{ schema: 'the reference schema as given (pairsAsLists applied)', status: result.status, ok: result.ok, error: result.ok ? null : String(result.error).slice(0, 600) }];
      if (result.status === 400) { // the one re-expression
        schema = reexpress(schema); reexpressed = true;
        result = await hydrogenCall({ system: inputs.system, user: inputs.user, schema, level: LEVEL }); spent += result.costUsd ?? 0;
        attempts.push({ schema: 're-expressed: empty required lists and zero minimums dropped', status: result.status, ok: result.ok, error: result.ok ? null : String(result.error).slice(0, 600) });
      }
      write(join(OUT, 'probe.json'), `${JSON.stringify({ accepted: result.ok, reexpressed, attempts }, null, 2)}\n`);
      if (!result.ok) { record({ id: entry.name, kind: 'probe', status: result.status, seconds: result.seconds, costUsd: result.costUsd ?? 0, error: String(result.error).slice(0, 300) }); console.log(`PROBE REFUSED (${result.status}) after the one re-expression: ${String(result.error).slice(0, 300)}`); stopped = true; return false; }
    }
    if (result.ok) write(answerFile, result.text); else write(answerFile.replace(/\.json$/, '.error.txt'), `HTTP ${result.status}\n${result.error ?? ''}\n`);
    let parsed = null, verdict = result.ok ? null : `HTTP ${result.status}`;
    if (result.ok) { try { parsed = JSON.parse(result.text); verdict = validate(parsed) ? 'accepted' : problemOf(validate.errors); } catch (error) { verdict = `not valid JSON (${error.message})`; } }
    record({ id: entry.name, kind: 'build', seconds: result.seconds, status: result.status, finish: result.finish ?? null, tokens: result.usage ? { input: result.usage.input, thinking: result.usage.thinking, output: result.usage.output } : null, costUsd: result.costUsd ?? 0, served: result.served ?? null, verdict, layout: parsed?.layout ?? null, file: rel(answerFile) });
    console.log(`${entry.name}: ${result.ok ? `${result.seconds}s $${(result.costUsd ?? 0).toFixed(3)} layout ${parsed?.layout ?? '?'} ${verdict}` : `FAILED ${result.status}`} (spent $${spent.toFixed(2)})`);
    return result.ok;
  }
  // the first call is the probe
  const [first, ...rest] = todo;
  if (first && !existsSync(join(OUT, 'build-schemas', `${first.name}.json`)) && !probe) { if (!await one(first, { isProbe: true })) return { spent, stopped: true }; }
  else if (first) await one(first);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, rest.length) }, async () => { while (next < rest.length && !stopped) await one(rest[next++]); }));
  return { spent, stopped };
}

// the table: one row per blueprint (copied from the answers, nothing judged)
export function table() {
  const rows = existsSync(join(OUT, 'rows.jsonl')) ? readFileSync(join(OUT, 'rows.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.kind === 'build') : [];
  const cell = text => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  let total = 0, accepted = 0; const lines = [];
  for (const entry of BLUEPRINTS) {
    const row = rows.findLast(r => r.id === entry.name), blueprint = existsSync(entry.file) ? readJson(entry.file) : null, hadAt = blueprint?.pictures?.main?.parts?.some(part => part.type === 'label' && part.at) ? 'yes' : 'no';
    if (!row) { lines.push(`| ${entry.name} | ${hadAt} | - | not run | - | - | - |`); continue; }
    total += row.costUsd ?? 0; if (row.verdict === 'accepted') accepted++;
    const answerFile = join(OUT, 'build-schemas', `${entry.name}.json`); let changes = '-';
    try { changes = (JSON.parse(readFileSync(answerFile, 'utf8')).changes ?? []).join(' ; ') || '(none)'; } catch { /* no usable answer */ }
    lines.push(`| ${entry.name} | ${hadAt} | ${row.layout ?? '-'} | ${cell(row.verdict)} | ${row.seconds} | $${(row.costUsd ?? 0).toFixed(4)} | ${cell(changes)} |`);
  }
  write(join(OUT, 'table.md'), [
    '# Build MVP 1: the ten pendulum blueprints through the Build model (brief 45)', '',
    'Made by `scripts/interact/bench-build.mjs`. Blueprint in, build-schema out, nothing drawn: Gemini 4 Hydrogen at high, the system text of `build/index.js` (prompts/), the trimmed blueprint and its measurements (prompts/user-*, measurements/), one call each, no correction. "Accepted" is ajv (2020) against `docs/features/interact/interactive-build-schema.schema.json` with every bound; otherwise the first problem. The brief-41 blueprints (`b41-`) had labels with `at` (a point), sent as stored: the model picked each label\'s `near` itself; the brief-43 ones (`b43-`) had `near`. The answers are in `build-schemas/` exactly as returned.', '',
    '| Blueprint | Labels had `at` | Layout chosen | Accepted by the schema, or the first problem | Seconds | Cost | The `changes` list |', '|---|---|---|---|---|---|---|', ...lines, '',
    `Accepted: ${accepted} of ${BLUEPRINTS.length}. Total cost: $${total.toFixed(4)}.`, '',
  ].join('\n'));
  return { accepted, total };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: a } = parseArgs({ options: { 'cap-usd': { type: 'string', default: '4' }, concurrency: { type: 'string', default: '3' }, only: { type: 'string' } } });
  const state = await main({ capUsd: Number(a['cap-usd']), concurrency: Number(a.concurrency), only: a.only });
  const t = table(); console.log(`done: spent $${state.spent.toFixed(2)} this run; ${t.accepted} accepted; table written${state.stopped ? '; STOPPED (probe refused or cap reached)' : ''}`);
  process.exitCode = state.stopped ? 3 : 0;
}
