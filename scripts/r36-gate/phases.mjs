export function prerequisite(phase, receipt, identity) {
  if (!['all','preflight','dive','gate','focused'].includes(phase)) return `Unknown gate phase: ${phase}`;
  if (phase==='all'||phase==='preflight'||phase==='focused') return null;
  const prior=phase==='dive'?'preflight':'dive';
  if (!receipt) return `Required ${prior} receipt missing`;
  if (receipt.phase!==prior) return `Required ${prior} phase not completed`;
  if (!receipt.pass||!receipt.ended||receipt.cleanupFailure) return `Required ${prior} receipt did not pass with cleanup`;
  for (const key of ['applicationSha','applicationTree','harnessSha','grant']) if(receipt[key]!==identity[key]) return `Prerequisite identity mismatch: ${key}`;
  return null;
}
