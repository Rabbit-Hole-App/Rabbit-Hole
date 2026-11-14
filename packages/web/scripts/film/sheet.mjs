// 1 fps contact sheet of a video with output-second labels. Usage: node sheet.mjs <video.mp4> <out.png> [cols=8] [fromSec=0] [toSec=999]
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSharp, FFMPEG } from './tools.mjs';
const sharp = loadSharp();
const [video, out, cols = '8', from = '0', to = '999'] = process.argv.slice(2);
const W = 320, H = 180, C = Number(cols);
const dir = mkdtempSync(join(tmpdir(), 'sheet-'));
const r = spawnSync(FFMPEG, ['-v', 'error', '-i', video, '-vf', `scale=${W}:${H}`, '-r', '1', join(dir, 'f%04d.png')], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
const files = readdirSync(dir).sort().map((f, i) => ({ f, s: i })).filter(x => x.s >= Number(from) && x.s <= Number(to));
const rows = Math.ceil(files.length / C);
const layers = [];
for (let i = 0; i < files.length; i++) {
  const x = (i % C) * W, y = Math.floor(i / C) * H;
  layers.push({ input: join(dir, files[i].f), left: x, top: y });
  layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="46" height="20"><rect width="46" height="20" fill="#000" opacity="0.7"/><text x="4" y="15" font-family="Arial" font-size="14" fill="#fff">${files[i].s}s</text></svg>`), left: x, top: y });
}
await sharp({ create: { width: W * C, height: H * rows, channels: 3, background: '#888' } }).composite(layers).png().toFile(out);
rmSync(dir, { recursive: true, force: true });
console.log(`${out} ${files.length} frames, ${W * C}x${H * rows}`);
