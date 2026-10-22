// STUB (lane A). Lane B (feature/webcard-screen) owns this file and replaces it whole at integration; the contract is
// C:/s/spec/day-1021/webcard-interface.md section 4. It fails closed: every capture stays hidden with Retry.
// tiles: [{ index, y, h, width, type: 'image/jpeg', bytes: Uint8Array }]; text: the runs' text joined with '\n'.
// -> { status: 'passed' | 'failed' | 'inconclusive' | 'error', reason, policy? }
export async function screenCapture(env, manifest, tiles, text) {
  return { status: 'error', reason: 'Screening is not set up yet.' };
}
