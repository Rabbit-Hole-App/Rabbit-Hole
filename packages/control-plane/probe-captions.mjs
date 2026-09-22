// The phase-2a go/no-go gate from docs/features/youtube-moment-recommendation.md:
// can captions actually be fetched, at what rate, from where this runs?
//
//   node packages/control-plane/probe-captions.mjs            # built-in list
//   node packages/control-plane/probe-captions.mjs id1 id2    # your own ids
//
// Run it locally for a residential-IP baseline and parser truth. The gate the
// spec cares about is the same script run FROM A DEPLOYED WORKER, where cloud
// IPs may be rate-limited - deploying that probe needs its own approval.

import { fetchCaptions } from './src/learn-captions.js';

// Representative educational videos: manual captions, auto-only lectures,
// short explainers, long courses, several channels.
const DEFAULT_IDS = [
  'Ilg3gGewQ5U', 'aircAruvnKk', 'IHZwWFHWa-w', 'tIeHLnjs5U8', // 3Blue1Brown
  'X0Jw4kgaFlg', 'rmVRLeJRkl4', // Stanford lectures (auto captions)
  'kCc8FmEb1nY', 'VMj-3S1tku0', // Karpathy
  'HXV3zeQKqGY', 'fNk_zzaMoSs', // more lectures
  'WUvTyaaNkzM', 'spUNpyF58BY', // essence of calculus / fourier
  'ErnWZxJovaM', 'bBC-nXj3Ng4', // MIT / crypto
  'zjkBMFhNj_g', 'wjZofJX0v4M', // Karpathy intro / 3b1b LLM
];

const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_IDS;
const results = [];
for (const id of ids) {
  const startedAt = Date.now();
  const result = await fetchCaptions(id);
  const took = Date.now() - startedAt;
  results.push({ id, took, ...result, lines: undefined, lineCount: result.lines?.length ?? 0 });
  console.log(
    id.padEnd(12),
    String(took).padStart(5) + 'ms',
    result.lines ? `${String(result.lines.length).padStart(4)} lines  ${result.kind.padEnd(6)}` : `FAIL ${result.reason}`,
    (result.title || '').slice(0, 48),
  );
  // The spec's concurrency discipline: this probe must not itself be the burst
  // that gets the IP flagged.
  await new Promise(resolve => setTimeout(resolve, 800));
}
const ok = results.filter(entry => entry.lineCount > 0);
const rate = Math.round((ok.length / results.length) * 100);
console.log(`\n${ok.length}/${results.length} fetched (${rate}%) | manual ${ok.filter(entry => entry.kind === 'manual').length}, auto ${ok.filter(entry => entry.kind === 'auto').length}`);
console.log(`median latency ${[...results].sort((a, b) => a.took - b.took)[Math.floor(results.length / 2)].took}ms`);
console.log('failures:', results.filter(entry => !entry.lineCount).map(entry => `${entry.id}:${entry.reason}`).join(' ') || 'none');
console.log(`\ngate: ${rate >= 80 ? 'GO' : rate >= 50 ? 'MARGINAL - review reasons above' : 'NO-GO - the architecture changes (see spec)'}`);
