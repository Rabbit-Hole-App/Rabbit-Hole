// The sign-in probe's stack serves only the Dive that follows it inside 'all'. Every other phase stops it and proves
// the gate ports free before the next preflight (focused.sh opens with one; run 38332224730 found them occupied).
export const keepsProbeStack = phase => phase === 'all';

export function prerequisite(phase, receipt, identity) {
  if (!['all','preflight','dive','gate','focused','units'].includes(phase)) return `Unknown gate phase: ${phase}`;
  if (phase==='all'||phase==='preflight'||phase==='focused'||phase==='units') return null;
  const prior=phase==='dive'?'preflight':'dive';
  if (!receipt) return `Required ${prior} receipt missing`;
  if (receipt.phase!==prior) return `Required ${prior} phase not completed`;
  if (!receipt.pass||!receipt.ended||receipt.cleanupFailure) return `Required ${prior} receipt did not pass with cleanup`;
  for (const key of ['applicationSha','applicationTree','harnessSha','grant']) if(receipt[key]!==identity[key]) return `Prerequisite identity mismatch: ${key}`;
  return null;
}
