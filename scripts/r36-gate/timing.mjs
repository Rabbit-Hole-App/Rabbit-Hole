// scripts/r36-gate/timing.mjs
// Measures one gate run attempt from the GitHub job records and, when given, its artifacts' per-process receipts.
// Queue time (created -> started) is reported apart from runner time. A step that only waits (the verify wait) is
// runner time too: the runner is held while it waits.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
const t = s => Date.parse(s), min = ms => Math.round(ms / 600) / 100;
const IDLE = /^Wait for /;
export function summarizeRun(run, jobs) {
  const ran = jobs.filter(j => j.started_at && j.completed_at);
  if (!ran.length) return { runId: run.id, attempt: run.run_attempt, queueMin: null, wallMin: null, runnerMin: 0, jobs: [] };
  const rows = ran.map(j => {
    const steps = (j.steps || []).filter(s => s.started_at && s.completed_at).map(s => ({ name: s.name, min: min(t(s.completed_at) - t(s.started_at)) }));
    return { name: j.name, queueMin: min(t(j.started_at) - t(j.created_at)), runMin: min(t(j.completed_at) - t(j.started_at)),
      idleMin: steps.filter(s => IDLE.test(s.name)).reduce((a, s) => a + s.min, 0), steps };
  });
  const firstStart = Math.min(...ran.map(j => t(j.started_at))), lastEnd = Math.max(...ran.map(j => t(j.completed_at)));
  return { runId: run.id, attempt: run.run_attempt, queueMin: min(firstStart - t(run.created_at)), wallMin: min(lastEnd - t(run.created_at)),
    runnerMin: Math.round(rows.reduce((a, r) => a + r.runMin, 0) * 100) / 100, jobs: rows };
}
export function stageDurations(files) {
  const by = new Map();
  for (const { name, json } of files) {
    const m = name.match(/^process-(.+?)-\d{10,}-\d+\.(start|exit)\.json$/); if (!m) continue;
    const key = name.replace(/\.(start|exit)\.json$/, ''); const e = by.get(key) || { check: m[1] }; e[m[2]] = json.at; by.set(key, e);
  }
  return [...by.values()].filter(e => e.start && e.exit).sort((a, b) => t(a.start) - t(b.start))
    .map(e => ({ check: e.check, min: min(t(e.exit) - t(e.start)), started: e.start }));
}
export function parseArgs(argv) {
  const pos = [];
  let artifacts;
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === '--artifacts') artifacts = argv[++k];
    else if (!argv[k].startsWith('--')) pos.push(argv[k]);
  }
  const [id, attempt = '1'] = pos;
  return { id, attempt, artifacts };
}
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
if (process.argv[1] && basename(process.argv[1]) === 'timing.mjs') {
  const { id, attempt, artifacts } = parseArgs(process.argv.slice(2));
  const gh = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
  const repo = 'repos/Rabbit-Hole-App/Rabbit-Hole/actions/runs/' + id;
  const run = gh(`${repo}/attempts/${attempt}`), jobs = gh(`${repo}/attempts/${attempt}/jobs?per_page=100`).jobs;
  const out = summarizeRun(run, jobs);
  if (artifacts) out.stages = stageDurations(walk(artifacts).filter(p => /\.(start|exit)\.json$/.test(p)).map(p => ({ name: basename(p), json: JSON.parse(readFileSync(p, 'utf8')) })));
  console.log(JSON.stringify(out, null, 2));
}
