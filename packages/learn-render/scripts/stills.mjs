// One screenshot per screen (last beat of each screen at 92% progress) -> out/screenN.png
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const id = process.argv[2] || 'nms';
const script = JSON.parse(readFileSync(join(root, 'lectures', id, 'script.json'), 'utf8'));
const timing = JSON.parse(readFileSync(join(root, 'lectures', id, 'timing.json'), 'utf8'));

const FPS = 30;
let start = 0;
const beatFrames = timing.beats.map((b) => {
  const s = start;
  start += b.durSec;
  return { start: s, dur: b.durSec };
});
const lastBeatOfScreen = new Map();
script.beats.forEach((b, i) => lastBeatOfScreen.set(b.screen, i));

const serveUrl = await bundle({ entryPoint: join(root, 'src', 'index.js'), publicDir: join(root, 'public') });
const composition = await selectComposition({ serveUrl, id });
for (const screen of script.screens) {
  const bi = lastBeatOfScreen.get(screen.id);
  const f = Math.round((beatFrames[bi].start + beatFrames[bi].dur * 0.92) * FPS);
  const output = join(root, 'out', `screen${screen.id}.png`);
  await renderStill({ serveUrl, composition, frame: f, output });
  console.log(`✓ out/screen${screen.id}.png (beat ${bi + 1}, frame ${f})`);
}
process.exit(0);
