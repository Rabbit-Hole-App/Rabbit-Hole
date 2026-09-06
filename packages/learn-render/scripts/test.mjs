// Acceptance for a rendered lecture:
//  - MP4 exists, duration within 10% of the sum of the beat clips
//  - every referenced font is a real woff2 (the render itself cancels if a FontFace fails)
//  - a frame at beat 5 contains an #EB5757 pixel (the suppressed box)
//  - a second render hits the audio cache (no 'fetch' beats) and takes under 60s
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from 'music-metadata';
import { PNG } from 'pngjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const id = process.argv[2] || 'nms';
const mp4 = join(root, 'out', `${id}.mp4`);

// 1. second render: must reuse the audio cache and finish under 60s
const t0 = Date.now();
const rerun = spawnSync(process.execPath, [join(root, 'scripts', 'render.mjs'), id], { cwd: root, encoding: 'utf8' });
const rerunSecs = (Date.now() - t0) / 1000;
process.stdout.write(rerun.stdout || '');
process.stderr.write(rerun.stderr || '');
assert.equal(rerun.status, 0, 'second render failed');
const timing = JSON.parse(readFileSync(join(root, 'lectures', id, 'timing.json'), 'utf8'));
if (timing.voiced) {
  assert.ok(!/beat \d+: fetch/.test(rerun.stdout), 'second render re-fetched audio - cache miss');
  console.log('✓ audio cache hit on every beat');
} else {
  console.log('⚠ silent render (no FISH_AUDIO_KEY) - audio-cache assert is vacuous');
}
assert.ok(rerunSecs < 60, `second render took ${rerunSecs.toFixed(1)}s (must be < 60s)`);
console.log(`✓ second render: ${rerunSecs.toFixed(1)}s`);

// 2. MP4 exists, duration within 10% of the clips
assert.ok(existsSync(mp4), `${mp4} missing`);
const dur = (await parseFile(mp4)).format.duration;
const drift = Math.abs(dur - timing.totalSec) / timing.totalSec;
assert.ok(drift < 0.1, `mp4 is ${dur.toFixed(1)}s, clips sum to ${timing.totalSec.toFixed(1)}s (${(drift * 100).toFixed(1)}% off)`);
console.log(`✓ duration: ${dur.toFixed(1)}s vs ${timing.totalSec.toFixed(1)}s expected (${(drift * 100).toFixed(1)}% drift)`);

// 3. fonts: real woff2 files; the render cancels on a failed FontFace, so a green
// render above already proves they loaded in the browser too.
const fonts = readdirSync(join(root, 'assets', 'fonts')).filter((f) => f.endsWith('.woff2'));
assert.ok(fonts.length >= 2, 'expected Virgil + Inter in assets/fonts');
for (const f of fonts) {
  assert.equal(readFileSync(join(root, 'assets', 'fonts', f)).subarray(0, 4).toString(), 'wOF2', `${f} is not woff2`);
}
console.log(`✓ fonts loaded: ${fonts.join(', ')}`);

// 4. beat 5 must show the suppressed box in #EB5757
let start = 0;
for (let i = 0; i < 4; i++) start += timing.beats[i].durSec;
const frame = Math.round((start + timing.beats[4].durSec * 0.92) * 30);
const still = join(root, 'out', `_beat5.png`);
const serveUrl = await bundle({ entryPoint: join(root, 'src', 'index.js'), publicDir: join(root, 'public') });
const composition = await selectComposition({ serveUrl, id });
await renderStill({ serveUrl, composition, frame, output: still });
const png = PNG.sync.read(readFileSync(still));
let red = 0;
for (let i = 0; i < png.data.length; i += 4) {
  if (Math.abs(png.data[i] - 0xeb) <= 8 && Math.abs(png.data[i + 1] - 0x57) <= 8 && Math.abs(png.data[i + 2] - 0x57) <= 8) red++;
}
assert.ok(red > 0, `no #EB5757 pixel at beat 5 (frame ${frame})`);
console.log(`✓ beat 5 (frame ${frame}): ${red} suppressed-box pixels of #EB5757`);

console.log('✓ all checks passed');
process.exit(0);
