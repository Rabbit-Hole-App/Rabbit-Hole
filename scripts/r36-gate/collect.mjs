// The sharded gate's collect job: the shard records and the units record (the two UNIT_STAGES lines) merged into the
// one gate.log (shards.mjs mergeShards), judged by the candidate's own gateVerdict plus run.mjs's routing/project-menu
// receipts, exactly as the unsharded gate phase judges its record; the passed Dive checkpoint stays its prerequisite.
// A part is judged by its newest attempt (attempts.mjs), so a failed-only rerun reads each passed part from the attempt it
// passed in. A part whose newest attempt did not succeed, a failed or missing shard or units record, a missing or
// duplicated stage, or a rejected record fails it. More than maxRetriesPerGate (transients.json) qualified retries
// (int35.sh's `<stage>: retried (<id>)` lines) in all the parts' records fail it as instability, and the retried stages are
// listed in gate-verdict.json and receipt.json.
//   node scripts/r36-gate/collect.mjs <downloaded artifacts dir>
// Env: APP_ROOT TESTED_SHA TESTED_TREE HARNESS_SHA GATE_GRANT_ID ARTIFACT_ROOT GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_REPOSITORY GH_TOKEN
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { SHARDS, UNIT_STAGES, PARTS, mergeShards, retriedStages } from './shards.mjs';
import { prerequisite } from './phases.mjs';
import { sha256 } from './prepare.mjs';
import { awaitVerify } from './verify-check.mjs';
import { pickAttempts, runJobs } from './attempts.mjs';

const APP_SHA = process.env.TESTED_SHA, APP_TREE = process.env.TESTED_TREE;
if (!/^[a-f0-9]{40}$/.test(APP_SHA || '') || !/^[a-f0-9]{40}$/.test(APP_TREE || '')) throw Error('Explicit exact TESTED_SHA and TESTED_TREE are required');
for (const name of ['APP_ROOT', 'HARNESS_SHA', 'GATE_GRANT_ID', 'ARTIFACT_ROOT', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) if (!process.env[name]) throw Error(`Missing ${name}`);
const app = resolve(process.env.APP_ROOT), out = resolve(process.env.ARTIFACT_ROOT), input = resolve(process.argv[2] || '');
const identity = { applicationSha: APP_SHA, applicationTree: APP_TREE, harnessSha: process.env.HARNESS_SHA, grant: process.env.GATE_GRANT_ID };
const started = new Date().toISOString();
mkdirSync(out, { recursive: true });
const inTree = p => { try { execFileSync('git', ['cat-file', '-e', `${APP_SHA}:${p}`], { cwd: app, stdio: 'ignore' }); return true; } catch { return false; } };
const json = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const failures = [];
// Each part's newest attempt decides it: a part not rerun is read from the attempt it ran in (a rerun lists it again
// under the new run_attempt, as a copy of that run; attempts.mjs), a rerun part from the newer one, and a newer failure
// is never replaced by an older pass.
// A jobs query that fails leaves no attempts and fails the gate.
let attempts = {};
try { const picked = pickAttempts(runJobs(), PARTS); attempts = picked.attempts; failures.push(...picked.errors); }
catch (error) { failures.push(`attempts: gh jobs query failed: ${error.message.split('\n')[0]}`); }
// The checkpoints job uploads its Dive receipt as 'dive'. A part with no known attempt falls back to this run's attempt
// (its missing job is already a failure). A receipt carries the grant of the attempt that wrote it, so each part is
// judged against its own attempt's grant, not collect's.
const attemptOf = part => attempts[part === 'dive' ? 'checkpoints' : part] ?? process.env.GITHUB_RUN_ATTEMPT;
const identityOf = part => ({ ...identity, grant: `r36-windows-${process.env.GITHUB_RUN_ID}-${attemptOf(part)}` });
const artifactOf = part => `r36-windows-${part}-${APP_SHA}-${attemptOf(part)}`;
const dir = part => join(input, artifactOf(part), 'r36', 'artifacts');
// Every failure of a part's evidence names the part and the attempt it was read from.
const of = part => `${part} (attempt ${attemptOf(part)})`;
// The same-sha canonical verify.yml must have succeeded for the harness and the application (each run job used to wait for it).
// A verify that is merely still running is polled for up to 10 min (awaitVerify; both shas at once); a missing, failed or
// unreadable one fails at once, and one still running at the deadline fails closed. The accepted runs go in receipt.json.
const verified = [];
const verifyShas = [...new Set([APP_SHA, process.env.HARNESS_SHA])];
const verifyResults = await Promise.all(verifyShas.map(sha => awaitVerify(sha).catch(error => ({ verdict: `gh run list failed for ${sha}: ${error.message.split('\n')[0]}` }))));
verifyResults.forEach((r, i) => r.verdict ? failures.push(`verify: ${r.verdict}`) : verified.push({ sha: verifyShas[i], databaseId: r.databaseId }));

// The Dive checkpoint (after its preflight) is the complete gate's prerequisite, as in run.mjs's gate phase.
const diveFile = join(dir('dive'), 'dive-receipt.json');
const diveError = prerequisite('gate', json(diveFile), identityOf('dive'));
if (diveError) failures.push(`checkpoint (attempt ${attemptOf('dive')}): ${diveError}${json(diveFile) ? '' : ` from ${artifactOf('dive')}`}`);

// A part's receipt must pass with its attempt's identity and its gate-shard.log must exist; the units part is read like a shard.
const read = part => {
  const d = dir(part), receiptFile = join(d, `${part}-receipt.json`), receipt = json(receiptFile);
  // No receipt in the newest attempt's artifact is "receipt missing" - never an older attempt's receipt, never a bare identity mismatch.
  const wanted = identityOf(part), wrong = receipt ? Object.keys(wanted).filter(key => receipt[key] !== wanted[key]) : [];
  if (!receipt) failures.push(`${of(part)}: receipt missing from ${artifactOf(part)}`);
  else if (!receipt.pass || !receipt.ended || receipt.cleanupFailure || wrong.length) failures.push(`${of(part)}: ${receipt.failure || receipt.cleanupFailure || (wrong.length ? `identity mismatch: ${wrong.join(', ')}` : 'receipt not passed')}`);
  const logFile = join(d, 'gate-shard.log'), log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : null;
  if (log === null) failures.push(`${of(part)}: gate-shard.log missing`);
  // The shard's record and receipts travel with the merged record; its diagnostics stay in its own artifact.
  mkdirSync(join(out, 'shards', part), { recursive: true });
  for (const f of ['gate-shard.log', 'shard-verdict.json', `${part}-receipt.json`, 'identity.json', 'identity-units.json']) if (existsSync(join(d, f))) copyFileSync(join(d, f), join(out, 'shards', part, f));
  return { part, pass: !!receipt?.pass, receiptSha256: receipt ? sha256(receiptFile) : null, logSha256: log === null ? null : sha256(logFile), log };
};
const units = read('units'), shards = SHARDS.map((_, k) => read(`shard-${k + 1}`));

// A pass after a retry is reported as one, and a gate that needed more than a couple of retries is unstable, not green.
// Counted over the parts' own records (every line of them is in the merged record), so it holds when the merge itself fails.
const retried = [units, ...shards].flatMap(s => (s.log === null ? [] : retriedStages(s.log)));
const maxRetriesPerGate = JSON.parse(readFileSync(new URL('./templates/transients.json', import.meta.url), 'utf8')).maxRetriesPerGate;
if (retried.length > maxRetriesPerGate) failures.push(`instability: ${retried.length} qualified retries across the gate (more than ${maxRetriesPerGate}): ${retried.map(r => `${r.stage} (${r.reason})`).join(', ')}`);

let verdict = 'not computed: shard records incomplete', extraPassed = false;
if ([units, ...shards].every(s => s.log !== null)) {
  try {
    // Each part's record must carry the grant of the attempt it ran in (a failed-only rerun mixes attempts of this run).
    const record = mergeShards(shards.map(s => s.log), inTree, units.log, Object.fromEntries(PARTS.map(p => [p, identityOf(p).grant])));
    writeFileSync(join(out, 'gate.log'), record);
    // Identical to run.mjs's gate phase verdict.
    const { gateVerdict, stageCount } = await import(pathToFileURL(join(app, 'scripts/dev-deploy.mjs')));
    verdict = gateVerdict(record, APP_TREE, inTree);
    const last = name => [...record.matchAll(new RegExp(`^${name} exit (\\d+)\\b(.*)$`, 'gm'))].at(-1);
    const routing = last('answer-routing'), project = last('project-menu');
    extraPassed = routing?.[1] === '0' && stageCount(routing[2]) >= 15 && project?.[1] === '0' && stageCount(project[2]) === 12 && /^answer-routing provider-tripwire hits: 0\r?$/m.test(record) && /^project-menu provider-tripwire hits: 0\r?$/m.test(record);
    if (verdict || !extraPassed) failures.push(`complete gate rejected: ${verdict || 'routing/project-menu receipts missing'}`);
  } catch (error) { verdict = `not computed: ${error.message}`; failures.push(`merge: ${error.message}`); }
}
const pass = failures.length === 0;
const sharded = { units: { part: 'units', stages: UNIT_STAGES, pass: units.pass }, shards: SHARDS.map((stages, k) => ({ part: `shard-${k + 1}`, stages, pass: shards[k].pass })), failures };
// attempts: the run attempt each part was judged from, so the gate note shows a rerun's mix of attempts.
writeFileSync(join(out, 'gate-verdict.json'), JSON.stringify({ ...identity, grant: undefined, gateVerdict: verdict, extraPassed, pass, attempts, retried, sharded }, null, 2));
writeFileSync(join(out, 'receipt.json'), JSON.stringify({ ...identity, phase: 'gate', sharded: true, started, ended: new Date().toISOString(), node: process.version, attempts, retried,
  prerequisite: diveError ? null : { phase: 'dive', sha256: sha256(diveFile) }, units: (({ log, ...u }) => u)(units), shards: shards.map(({ log, ...s }) => s), verify: verified, failures, pass }, null, 2));
console.log(JSON.stringify({ applicationSha: APP_SHA, harnessSha: identity.harnessSha, gateVerdict: verdict, extraPassed, pass, failures }));
if (!pass) process.exitCode = 1;
