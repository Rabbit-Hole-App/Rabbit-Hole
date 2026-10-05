// Author proof (M4): compile a validated composition through the M1 Remotion path and render a
// small frame sample with the harness probe on, then check what a viewer would actually see
// against the storyboard. No review, no final render; local/dev only.
//   proveAuthor({brief, storyboard, source, dir}) -> { compiled, errors, frames, timings }
// Frames 0 and last must not be blank. At each beat's middle frame:
//   - every storyboard object of the beat is on stage and visible (opacity > 0.05);
//   - its label, and the source lines a code object shows, are in that object's text;
//   - the beat's on_screen_text is visible;
//   - a beat under a condition shows the condition (its flag or a branch word);
//   - all visible text uses a bundled font, and code objects use JetBrains Mono;
//   - every visible word comes from TEXT, so no text appeared that the contract did not see;
//   - exactly one element carries each storyboard object id.
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { STAGE } from './contracts.js';
import { RemotionRenderer, lumaStddev } from './remotion-renderer.mjs';
import { PROBE_PREFIX, midFrame, probeErrors } from './render-coverage.js';

export { probeErrors };
export const probeFrames = storyboard => storyboard.beats.map(b => ({ beat: b.id, frame: midFrame(b) }));

export async function proveAuthor({ brief, storyboard, source, TEXT, dir, scale = 0.25 }) {
  const probes = new Map();
  const r = new RemotionRenderer({ fresh: true, inputProps: { probe: true }, log: l => { if (l.text?.startsWith(PROBE_PREFIX)) { const p = JSON.parse(l.text.slice(PROBE_PREFIX.length)); probes.set(p.frame, p); } } });
  const job = { id: 'author-proof', dir, brief, storyboard, source };
  try {
    try { await r.prepare(job); }
    catch (error) { return { compiled: false, errors: [`compile: ${String(error.message || error).split('\n')[0].slice(0, 400)}`], frames: [], timings: r.timings }; }
    // The first and last frames too: the renderer refuses a blank one (M1 nonblank check, found in M5).
    const edges = [0, brief.duration.seconds * STAGE.fps - 1];
    const stills = await r.renderStills(job, [...new Set([...edges, ...probeFrames(storyboard).map(x => x.frame)])].sort((a, b) => a - b), { scale, dir: join(dir, 'probe') });
    const blank = stills.filter(s => edges.includes(s.frame) && !(lumaStddev(PNG.sync.read(readFileSync(s.file))) > 2)).map(s => `#${s.frame}: blank (the renderer refuses a blank first or last frame)`);
    return { compiled: true, errors: [...blank, ...probeErrors(probes, brief, storyboard, TEXT)], frames: stills.map(s => ({ frame: s.frame, file: s.file, pixels_sha256: s.pixels_sha256 })), timings: r.timings };
  } finally { await r.close(); }
}
