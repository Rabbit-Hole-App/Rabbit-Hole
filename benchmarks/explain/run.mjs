// Trusted entry for the written /explain benchmark (docs/features/explain.md EXP-09 / EXP-11-C05). OFFLINE ONLY: `dry` prints the plan, `fixture` runs the frozen corpus
// through the real generateArtifact with scripted provider doubles, `live` is a refusal that performs nothing. It reads no credential and contacts no provider.
//   node benchmarks/explain/run.mjs --mode dry [--profile plan-default,...] [--config path] [--role repair=<profile>] [--trials N] [--out dir]
//   node benchmarks/explain/run.mjs --mode fixture [--config benchmarks/explain/fixture-config.json] [--resume <run-id>] [--out dir]
//   node benchmarks/explain/run.mjs --freeze-corpus        (deliberately re-hash benchmarks/explain/corpus/v1)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BenchmarkError, LIVE_REFUSAL, LiveRefusedError, makeRunId, redactorFor, registryFromConfig, renderPlanText, resolveMatrix, runBenchmark } from '../../packages/control-plane/src/explanation-benchmark.js';
import { createRunStore, freezeCorpus, loadCorpus } from '../../packages/control-plane/src/explanation-benchmark-io.js';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const root = resolve(repo, 'benchmarks/explain/results');
const FLAGS = new Set(['freeze-corpus']);
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const m = /^--([a-z-]+)$/.exec(process.argv[i]);
  if (!m) { console.error(`Unexpected argument ${process.argv[i].slice(0, 40)}.`); process.exit(2); }
  args[m[1]] = FLAGS.has(m[1]) ? true : process.argv[++i];
}
const git = (...a) => { try { return execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim(); } catch { return null; } };

try {
  const corpusDir = resolve(repo, args.corpus ?? 'benchmarks/explain/corpus/v1');
  if (args['freeze-corpus']) { const h = await freezeCorpus(corpusDir); console.log(`Froze ${Object.keys(h.files).length} files: corpus ${h.corpusHash.slice(0, 16)}, expected facts ${h.expectedFactsHash.slice(0, 16)}`); process.exit(0); }
  const mode = args.mode ?? 'dry';
  if (mode === 'live') throw new LiveRefusedError(args['cap-usd'] ? `${LIVE_REFUSAL} (a cap of ${args['cap-usd']} was given, but no live adapter exists in this harness version.)` : LIVE_REFUSAL);
  const configPath = args.config ?? (mode === 'fixture' ? 'benchmarks/explain/fixture-config.json' : null);
  const config = configPath ? JSON.parse(readFileSync(resolve(repo, configPath), 'utf8')) : {};
  const registry = registryFromConfig(config);
  const overrides = args.role ? Object.fromEntries(args.role.split(',').map(p => p.split('='))) : {};
  const matrix = await resolveMatrix({ profileIds: (args.profile ?? '').split(',').filter(Boolean).length ? args.profile.split(',') : config.defaultProfiles, overrides, registry });
  const corpus = await loadCorpus(corpusDir);
  const codeSha = git('rev-parse', '--short=7', 'HEAD') ?? '0000000';
  const runId = args.resume ?? makeRunId({ codeSha });
  const out = resolve(repo, args.out ?? `benchmarks/explain/results/${runId}`);
  console.log(`Run ${runId} (${mode})\nOutput: ${out}`);
  const store = createRunStore({ dir: out, root, type: mode, redact: redactorFor(process.env) });
  const result = await runBenchmark({ mode, runId, corpus, matrix, config, store, resume: !!args.resume, trials: Number(args.trials ?? 1), seed: args.seed ?? 'e7-1', codeSha, codeDirty: !!git('status', '--porcelain', '--untracked-files=no'), nodeVersion: process.version, platform: process.platform });
  console.log(renderPlanText(result.plan));
  if (mode === 'fixture') {
    const bad = result.rows.filter(r => r.kind === 'benchmark' && r.status !== 'success').length;
    console.log(`\nFIXTURE evidence only (scripted doubles, no provider contacted). Attempts: ${result.rows.length} (${result.counts.ran} run, ${result.counts.skipped} already scored, ${result.counts.reconciled} reconciled); benchmark attempts not delivered: ${bad}.`);
    console.log(`Seeded defects flagged: ${result.calibration.detected}/${result.calibration.seeded}; clean controls flagged: ${result.calibration.falsePositives.length}/${result.calibration.controls}.`);
  }
  console.log(`\nOutput: ${out}\nReport: ${resolve(out, 'report.md')}`);
} catch (error) {
  if (!(error instanceof BenchmarkError) && error?.name !== 'ExplanationProfileError') throw error;
  console.error(`${error.name} (${error.code}): ${error.message}`);
  process.exit(2);
}
