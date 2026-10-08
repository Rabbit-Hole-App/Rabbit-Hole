// Tutor decision evaluation CLI (docs/features/tutor-decision-eval.md). Free commands only:
//   node tests/evals/tutor-session/run.mjs aggregate <dir>     session bundles in <dir> -> aggregate.json, steps.csv, table
//   node tests/evals/tutor-session/run.mjs events <file.jsonl>  any event stream (real or simulated) -> grouped metrics JSON
// The paid simulation is not wired: it waits for the Learning agent's HookSet / TutorDecisionTrace checkpoint and the
// owner's go, and then calls the real product planner through runTurn (never a copy of it).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { foldSessions } from './events.mjs';
import { loadRoles, loadTaxonomy, readSessions } from './harness.mjs';
import { aggregate, aggregateEvents, stepsCsv, terminalTable } from './metrics.mjs';

const [command, target] = process.argv.slice(2);
const taxonomy = loadTaxonomy(), roles = loadRoles();
if (command === 'aggregate' && target) {
  const bundles = readSessions(target);
  // bundle.cost: the ledger summary - Anthropic spend under the ceiling, external providers (JEV) apart.
  const cost = bundles.some(bundle => bundle.cost) ? {
    sessions: Object.fromEntries(bundles.map(bundle => [bundle.simulator.profile, bundle.cost ?? null])),
    anthropic_total_usd: Math.round(bundles.reduce((n, bundle) => n + (bundle.cost?.anthropic?.total_usd || 0), 0) * 1e4) / 1e4,
  } : null;
  const agg = aggregate(bundles, taxonomy, { cost, roles });
  writeFileSync(join(target, 'aggregate.json'), `${JSON.stringify(agg, null, 2)}\n`);
  writeFileSync(join(target, 'steps.csv'), stepsCsv(foldSessions(bundles.flatMap(bundle => bundle.events))));
  console.log(terminalTable(agg));
  if (agg.taxonomy.provisional) console.log('\ntaxonomy: PROVISIONAL (fixtures/taxonomy.provisional.json)');
} else if (command === 'events' && target) {
  const events = readFileSync(target, 'utf8').split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
  console.log(JSON.stringify(aggregateEvents(events, taxonomy, { roles }), null, 2));
} else {
  console.error('usage: run.mjs aggregate <dir> | run.mjs events <file.jsonl>');
  process.exit(2);
}
