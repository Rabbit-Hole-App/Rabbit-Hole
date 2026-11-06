// Tutor decision evaluation CLI (docs/features/tutor-decision-eval.md).
//   node tests/evals/tutor-session/run.mjs aggregate <dir>          session bundles in <dir> -> aggregate.json, steps.csv, table
//   node tests/evals/tutor-session/run.mjs events <file.jsonl>       any event stream (real or simulated) -> grouped metrics JSON
//   node tests/evals/tutor-session/run.mjs paid <dir> <env file> <topic id>   PAID: one real-model session per profile, then aggregate
// The paid run (owner approval 2026-10-08, "Tutor's paid real-model evaluation run", on the dev Anthropic workspace; JEV
// "where needed"): one topic fixture, each session under SESSION_USD with the reviewer's holdback, all of them under RUN_USD
// (Anthropic; JEV is logged apart). Only the provider keys in KEYS are read from <env file>, and none is printed. The product
// calls the real planners and the real JEV through runTurn (never a copy).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEARN_TASKS } from '../../../packages/control-plane/src/learn-models.js';
import { JEV_TRANSPORTS } from '../../../packages/control-plane/src/learn-grade-jev.js';
import { foldSessions } from './events.mjs';
import { REVIEW_STEP_BYTES, createLedger, learnerRequest, loadProfiles, loadRoles, loadTaxonomy, loadTopic, modelLearner, readSessions, reviewerRequest, runSession, simulatedIds, writeSession } from './harness.mjs';
import { aggregate, aggregateEvents, evidenceReport, nextStepsReport, stepsCsv, terminalTable } from './metrics.mjs';
import { HOOK_DEBOUNCE_MS, anthropicTransport, productWorld, providerBoundary, realAnswers } from './product.mjs';

export const RUN_USD = 4, SESSION_USD = 1.3;
const taxonomy = loadTaxonomy(), roles = loadRoles();

function aggregateDir(target) {
  const bundles = readSessions(target);
  // bundle.cost: the ledger summary - Anthropic spend under the ceiling, external providers (JEV) apart.
  const cost = bundles.some(bundle => bundle.cost) ? {
    sessions: Object.fromEntries(bundles.map(bundle => [bundle.simulator.profile, bundle.cost ?? null])),
    anthropic_total_usd: Math.round(bundles.reduce((n, bundle) => n + (bundle.cost?.anthropic?.total_usd || 0), 0) * 1e4) / 1e4,
  } : null;
  const agg = { ...aggregate(bundles, taxonomy, { cost, roles }), next_steps: nextStepsReport(bundles), evidence: evidenceReport(bundles) };
  writeFileSync(join(target, 'aggregate.json'), `${JSON.stringify(agg, null, 2)}\n`);
  writeFileSync(join(target, 'steps.csv'), stepsCsv(foldSessions(bundles.flatMap(bundle => bundle.events))));
  console.log(terminalTable(agg));
  if (agg.taxonomy.provisional) console.log('\ntaxonomy: PROVISIONAL (fixtures/taxonomy.provisional.json)');
  return agg;
}

const KEYS = ['ANTHROPIC_API_KEY', 'TYPESAFE_API_KEY', 'VERCEL_TYPESAFE_API_KEY'];
async function paidRun(dir, envFile, topicId) {
  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/);
  const keys = Object.fromEntries(KEYS.map(name => [name, lines.find(entry => entry.startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^(["'])(.*)\1$/, '$2')]).filter(([, value]) => value));
  const key = keys.ANTHROPIC_API_KEY;
  if (!key) throw Error(`no ANTHROPIC_API_KEY in ${envFile}`);
  console.log(`keys: ${Object.keys(keys).join(', ')}`);
  const topic = loadTopic(topicId), profiles = loadProfiles(), runId = `paid-${new Date().toISOString().slice(0, 10)}`;
  // run.json: what was tested - the exact commit and tree (and whether the checkout had local changes), the limits, and every
  // model setting the run used (the product's LEARN_TASKS, the simulator's and reviewer's requests, JEV's transports).
  const git = (...args) => execFileSync('git', args, { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8' }).trim();
  const settings = request => ({ model: request.model, max_tokens: request.max_tokens, effort: request.output_config?.effort ?? null });
  const manifest = {
    run_id: runId, started_at: new Date().toISOString(), sha: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), dirty: git('status', '--porcelain').length > 0,
    topic: topic.id, profiles: profiles.map(profile => profile.id), keys: Object.keys(keys),
    limits: { run_usd: RUN_USD, session_usd: SESSION_USD, review_step_bytes: REVIEW_STEP_BYTES, max_decisions: topic.max_decisions, budget_seconds: topic.session_budget_seconds },
    models: { product: LEARN_TASKS, simulator: settings(learnerRequest({ system: '', user: '' })), reviewer: settings(reviewerRequest({ system: '', user: '' })), jev: JEV_TRANSPORTS },
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'run.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`tested ${manifest.sha}${manifest.dirty ? ' (with local changes)' : ''}, tree ${manifest.tree}`);
  const boundary = providerBoundary(realAnswers(globalThis.fetch));
  const transport = anthropicTransport({ key, send: boundary.realFetch });
  const run = createLedger(RUN_USD);
  try {
    for (const profile of profiles) {
      const world = await productWorld({ topic, ids: simulatedIds({ runId, topic, profile }), boundary, keys });
      try {
        const bundle = await runSession({
          topic, profile, profiles, tutor: world.tutor, hooks: world.hooks, hookStart: world.hookStart, hookDelayMs: HOOK_DEBOUNCE_MS, materialize: world.materialize,
          learner: modelLearner({ topic, profile, profiles, transport }), reviewer: transport, ledger: createLedger(SESSION_USD, { parent: run }), coverage: world.coverage, runId,
        });
        bundle.next_steps_rows = await world.plannerRows();
        writeSession(dir, bundle);
        const { anthropic } = bundle.cost;
        console.log(`${profile.id}: ${bundle.simulator.stop_reason}${bundle.simulator.error ? ` (${bundle.simulator.error.message})` : ''}, ${bundle.events.at(-1).decisions} decisions, $${anthropic.total_usd} spent + $${anthropic.held_usd} held, review ${bundle.review?.status ?? 'none'}`);
      } finally { world.close(); }
    }
  } finally { boundary.restore(); }
  const total = run.summary().anthropic;
  writeFileSync(join(dir, 'run.json'), `${JSON.stringify({ ...manifest, finished_at: new Date().toISOString(), anthropic: { total_usd: total.total_usd, held_usd: total.held_usd, calls: total.calls, refused: total.refused }, outbound_blocked: boundary.blocked.length, meter_errors: boundary.errors.length }, null, 2)}\n`);
  console.log(`run: $${total.total_usd} spent + $${total.held_usd} held of $${RUN_USD}; ${total.calls} Anthropic calls, ${total.refused} refused; outbound blocked ${boundary.blocked.length} [${[...new Set(boundary.blocked)].join(', ')}], meter errors ${boundary.errors.length}`);
  aggregateDir(dir);
}

const [command, target, extra, topicId] = process.argv.slice(2);
if (command === 'aggregate' && target) aggregateDir(target);
else if (command === 'events' && target) {
  const events = readFileSync(target, 'utf8').split(/\r?\n/).filter(entry => entry.trim()).map(entry => JSON.parse(entry));
  console.log(JSON.stringify(aggregateEvents(events, taxonomy, { roles }), null, 2));
} else if (command === 'paid' && target && extra && topicId) await paidRun(target, extra, topicId);
else {
  console.error('usage: run.mjs aggregate <dir> | run.mjs events <file.jsonl> | run.mjs paid <dir> <env file> <topic id>');
  process.exit(2);
}
