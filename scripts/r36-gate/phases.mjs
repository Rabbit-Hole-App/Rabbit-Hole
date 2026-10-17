// The sign-in probe's stack serves only the Dive that follows it inside 'all'. Every other phase stops it and proves
// the gate ports free before the next preflight (focused.sh opens with one; run 38332224730 found them occupied).
export const keepsProbeStack = phase => phase === 'all';

export function prerequisite(phase, receipt, identity) {
  const shard=/^shard-\d+$/.test(phase);
  if (!shard&&!['all','preflight','dive','gate','focused','units'].includes(phase)) return `Unknown gate phase: ${phase}`;
  if (shard||phase==='all'||phase==='preflight'||phase==='focused'||phase==='units') return null;
  const prior=phase==='dive'?'preflight':'dive';
  if (!receipt) return `Required ${prior} receipt missing`;
  if (receipt.phase!==prior) return `Required ${prior} phase not completed`;
  if (!receipt.pass||!receipt.ended||receipt.cleanupFailure) return `Required ${prior} receipt did not pass with cleanup`;
  for (const key of ['applicationSha','applicationTree','harnessSha','grant']) if(receipt[key]!==identity[key]) return `Prerequisite identity mismatch: ${key}`;
  return null;
}

// The gate phase's receipts beyond gateVerdict, for run.mjs and collect.mjs alike: answer-routing's last run passed at least 15
// checks; project-menu's last run passed every check it declares, by its own printed total ("N/M checks passed" with N === M > 0),
// so the check governs its step count rather than a number here (owner, 2026-10-16: no padding to 12 steps); both recorded zero
// provider-tripwire hits. stageCount is the candidate's dev-deploy.mjs counter.
export function extraReceipts(record, stageCount) {
  const last = name => [...record.matchAll(new RegExp(`^${name} exit (\\d+)\\b(.*)$`, 'gm'))].at(-1);
  const routing = last('answer-routing'), project = last('project-menu');
  const own = project?.[2].match(/\b(\d+)\/(\d+) checks passed/);
  return routing?.[1] === '0' && stageCount(routing[2]) >= 15
    && project?.[1] === '0' && !!own && own[1] === own[2] && Number(own[2]) > 0 && stageCount(project[2]) === Number(own[2])
    && /^answer-routing provider-tripwire hits: 0\r?$/m.test(record) && /^project-menu provider-tripwire hits: 0\r?$/m.test(record);
}
