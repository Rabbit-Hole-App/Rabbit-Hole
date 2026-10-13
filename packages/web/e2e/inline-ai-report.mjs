import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarize } from '../../control-plane/src/learn-inline.js';

// The A3/A5 report, computed from the inline_ai_telemetry rows in a LOCAL D1 (never a shared one): median, p95 (from 20
// samples) and n per stage, grouped by the splits the spec asks for. Mocked rows (mocked = 1) and real rows are never
// mixed in one table.
// usage: node e2e/inline-ai-report.mjs --d1 <cp wrangler.jsonc> --persist <dir> [--run <run_id>] [--source benchmark]
const arg = (name, fallback = null) => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : fallback; };
const D1 = arg('d1'), PERSIST = arg('persist'), RUN = arg('run'), SOURCE = arg('source', 'benchmark');
const where = `source = '${SOURCE.replace(/'/g, '')}'${RUN ? ` AND run_id = '${RUN.replace(/'/g, '')}'` : ''}`;
const sql = join(mkdtempSync(join(tmpdir(), 'inline-report-')), 'q.sql');
writeFileSync(sql, `SELECT request_id, source, run_id, sha, fixture, mocked, streaming, route, capability, outcome, metrics_json FROM inline_ai_telemetry WHERE ${where} ORDER BY created_at;`);
const out = execSync(`npx wrangler d1 execute rabbit-hole-learn-dev --local -c "${D1}" --persist-to "${PERSIST}" --json --file "${sql}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const rows = JSON.parse(out)[0].results;
const STAGES = ['open', 'prep', 'refresh', 'routing', 'providerFirst', 'firstPreview', 'complete', 'accept', 'persist'];
const table = (title, grouped) => {
  console.log(`\n### ${title}\n`);
  console.log(`| group | n | failures | ${STAGES.join(' | ')} |`);
  console.log(`|---|---|---|${STAGES.map(() => '---').join('|')}|`);
  for (const [group, summary] of Object.entries(grouped)) {
    const cell = stage => { const s = summary.stages[stage]; return s ? `${s.median}${s.p95 != null ? ` / ${s.p95}` : ''} (${s.n})` : '-'; };
    console.log(`| ${group} | ${summary.n} | ${summary.failures} | ${STAGES.map(cell).join(' | ')} |`);
  }
};
for (const mocked of [1, 0]) {
  const set = rows.filter(row => Number(row.mocked) === mocked);
  if (!set.length) continue;
  const label = mocked ? 'MOCKED provider (stage times are this code plus scripted latencies; never model latency)' : 'REAL provider (local stack, real JEV and model)';
  console.log(`\n## ${label}: ${set.length} rows, runs ${[...new Set(set.map(row => row.run_id))].join(', ')}\ncells: median / p95 (n) in ms; p95 only from 20 or more samples`);
  table('by fixture', summarize(set, row => row.fixture || row.capability || 'none'));
  table('cold vs repeat open', summarize(set, row => row.metrics.open || 'none'));
  table('context cache at submit', summarize(set, row => row.metrics.prepCache || 'none'));
  table('routing: direct vs JEV vs bypassed', summarize(set, row => row.route));
  table('board size', summarize(set, row => row.metrics.board || 'none'));
  table('selection', summarize(set, row => row.metrics.selection || 'none'));
  table('output', summarize(set, row => row.metrics.output || 'none'));
  const counts = {};
  for (const row of set) {
    const key = row.fixture || row.capability;
    const c = JSON.parse(row.metrics_json).counts || {};
    const into = counts[key] ||= { n: 0, modelCalls: 0, routeCalls: 0, chunks: 0, flushes: 0, cancels: 0, stale: 0, duplicates: 0, timeouts: 0, errors: 0, objects: 0, omitted: 0, streamed: 0, inputTokens: 0, outputTokens: 0, frames: [], longTasks: 0, outcomes: {} };
    if (c.frameP95 != null) into.frames.push(c.frameP95);
    into.longTasks += c.longTasks || 0; into.inputTokens += c.inputTokens || 0; into.outputTokens += c.outputTokens || 0;
    into.n += 1; into.streamed += Number(row.streaming);
    for (const name of ['modelCalls', 'routeCalls', 'chunks', 'flushes', 'cancels', 'stale', 'duplicates', 'timeouts', 'errors', 'objects', 'omitted']) into[name] += c[name] || 0;
    into.outcomes[row.outcome] = (into.outcomes[row.outcome] || 0) + 1;
  }
  console.log('\n### counters (totals per fixture)\n');
  console.log('| fixture | n | model calls | route calls | chunks | renders (flushes) | streamed | objects | omitted | tokens in/out | frame p95 while streaming (median of runs) | long tasks | cancels | stale | dupes | timeouts | errors | outcomes |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [key, c] of Object.entries(counts)) { const f = c.frames.slice().sort((a, b) => a - b); console.log(`| ${key} | ${c.n} | ${c.modelCalls} | ${c.routeCalls} | ${c.chunks} | ${c.flushes} | ${c.streamed} | ${c.objects} | ${c.omitted} | ${c.inputTokens}/${c.outputTokens} | ${f.length ? `${f[Math.floor(f.length / 2)]} ms (${f.length})` : '-'} | ${c.longTasks} | ${c.cancels} | ${c.stale} | ${c.duplicates} | ${c.timeouts} | ${c.errors} | ${Object.entries(c.outcomes).map(([o, n]) => `${o} ${n}`).join(', ')} |`); }
}
