// Tutor decision evaluation CLI (docs/features/tutor-decision-eval.md).
//   node tests/evals/tutor-session/run.mjs aggregate <dir>          session bundles in <dir> -> aggregate.json, steps.csv, table
//   node tests/evals/tutor-session/run.mjs events <file.jsonl>       any event stream (real or simulated) -> grouped metrics JSON
//   node tests/evals/tutor-session/run.mjs paid <dir> <env file> <topic id>   PAID: one real-model session per profile, then aggregate
// The paid run (owner approval 2026-10-08, "Tutor's paid real-model evaluation run", on the dev Anthropic workspace): one
// topic fixture, each session under SESSION_USD with the reviewer's holdback, all of them under RUN_USD. Only
// ANTHROPIC_API_KEY is read from <env file>, and it is never printed. The product calls the real planners through runTurn
// (never a copy); JEV gets no key (Anthropic only).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { foldSessions } from './events.mjs';
import { createLedger, loadProfiles, loadRoles, loadTaxonomy, loadTopic, modelLearner, readSessions, runSession, simulatedIds, writeSession } from './harness.mjs';
import { aggregate, aggregateEvents, nextStepsReport, stepsCsv, terminalTable } from './metrics.mjs';
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
  const agg = { ...aggregate(bundles, taxonomy, { cost, roles }), next_steps: nextStepsReport(bundles) };
  writeFileSync(join(target, 'aggregate.json'), `${JSON.stringify(agg, null, 2)}\n`);
  writeFileSync(join(target, 'steps.csv'), stepsCsv(foldSessions(bundles.flatMap(bundle => bundle.events))));
  console.log(terminalTable(agg));
  if (agg.taxonomy.provisional) console.log('\ntaxonomy: PROVISIONAL (fixtures/taxonomy.provisional.json)');
  return agg;
}

async function paidRun(dir, envFile, topicId) {
  const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find(entry => entry.startsWith('ANTHROPIC_API_KEY='));
  const key = line?.slice('ANTHROPIC_API_KEY='.length).trim().replace(/^(["'])(.*)\1$/, '$2');
  if (!key) throw Error(`no ANTHROPIC_API_KEY in ${envFile}`);
  const topic = loadTopic(topicId), profiles = loadProfiles(), runId = `paid-${new Date().toISOString().slice(0, 10)}`;
  const boundary = providerBoundary(realAnswers(globalThis.fetch));
  const transport = anthropicTransport({ key, send: boundary.realFetch });
  const run = createLedger(RUN_USD);
  try {
    for (const profile of profiles) {
      const world = await productWorld({ topic, ids: simulatedIds({ runId, topic, profile }), boundary, keys: { ANTHROPIC_API_KEY: key } });
      try {
        const bundle = await runSession({
          topic, profile, profiles, tutor: world.tutor, hooks: world.hooks, hookStart: world.hookStart, hookDelayMs: HOOK_DEBOUNCE_MS, materialize: world.materialize,
          learner: modelLearner({ topic, profile, profiles, transport }), reviewer: transport, ledger: createLedger(SESSION_USD, { parent: run }), coverage: world.coverage, runId,
        });
        writeSession(dir, bundle);
        const { anthropic } = bundle.cost;
        console.log(`${profile.id}: ${bundle.simulator.stop_reason}${bundle.simulator.error ? ` (${bundle.simulator.error.message})` : ''}, ${bundle.events.at(-1).decisions} decisions, $${anthropic.total_usd} spent + $${anthropic.held_usd} held, review ${bundle.review?.status ?? 'none'}`);
      } finally { world.close(); }
    }
  } finally { boundary.restore(); }
  const total = run.summary().anthropic;
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
