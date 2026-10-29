// Node only, reads the preserved results of the first real-click run (verify-build/results/results.json, candidate e92ab817f,
// web code identical to c59bae962). Per run: the Play window stats and the card's measured height before Play, while playing,
// paused, and later. A ResizeObserver in ProgramScene.jsx (154-159) that fires while the failure branch is committed reports
// 0 for the rows under the drawing and is never re-attached, so the card stays short by the rows' height (+8) until a reload.
import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync('C:/s/spec/explain-sandbox/prod/verify-build/results/results.json', 'utf8'));
const out = { source: 'verify-build/results/results.json', at: j.at, candidate: j.candidate, runs: {} };
for (const [name, r] of Object.entries(j.runs)) {
  const h = p => p?.card?.[3];
  out.runs[name] = {
    playFrames: r.play.rafFrames, framesWithLabelAndDot: r.play.labelVsDrawn.samples, framesMissing: r.play.rafFrames - r.play.labelVsDrawn.samples,
    drawnTimeFrom: r.play.drawnTimeFrom, // -3.92 = (null - 100) / 510 * 20: a sample with no dot
    cardHeight: { open: h(r.start), playing: h(r.whilePlaying), paused: h(r.paused), pausedLater: h(r.pausedLater) },
    playStillRunningAfter: { label: r.whilePlaying.label, button: r.whilePlaying.playButton },
  };
}
fs.writeFileSync(new URL('./forensic.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.runs, null, 1));
