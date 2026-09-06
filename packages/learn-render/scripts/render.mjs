// npm run render <id>: tts (cached) -> remotion render -> out/<id>.mp4 + out/<id>.vtt
// The remotion pass is skipped when nothing that feeds the video changed since the
// last render (content hash of lecture + timing + src + fonts). --force overrides.
// ponytail: a CHANGED lecture still takes a full remotion render (~2min for 68s of
// video on a laptop); if that ever matters, render only the changed beats and stitch.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const id = process.argv[2] || 'nms';
const force = process.argv.includes('--force');

mkdirSync(join(root, 'public', 'fonts'), { recursive: true });
mkdirSync(join(root, 'out'), { recursive: true });
for (const f of readdirSync(join(root, 'assets', 'fonts'))) {
  copyFileSync(join(root, 'assets', 'fonts', f), join(root, 'public', 'fonts', f));
}

const tts = spawnSync(process.execPath, [join(root, 'scripts', 'tts.mjs'), id], { stdio: 'inherit', cwd: root });
if (tts.status !== 0) process.exit(tts.status ?? 1);

// content hash of everything the frames depend on
const h = createHash('sha1');
for (const dir of ['src', join('src', 'lecture')]) {
  for (const f of readdirSync(join(root, dir)).sort()) {
    try { h.update(f).update(readFileSync(join(root, dir, f))); } catch {}
  }
}
h.update(readFileSync(join(root, 'lectures', id, 'script.json')));
h.update(readFileSync(join(root, 'lectures', id, 'timing.json')));
for (const f of readdirSync(join(root, 'assets', 'fonts')).sort()) h.update(f).update(readFileSync(join(root, 'assets', 'fonts', f)));
const hash = h.digest('hex');
const hashFile = join(root, 'out', `${id}.hash`);

const t0 = Date.now();
let skipped = false;
if (!force && existsSync(join(root, 'out', `${id}.mp4`)) && existsSync(hashFile) && readFileSync(hashFile, 'utf8') === hash) {
  skipped = true;
  console.log(`✓ nothing changed since the last render - skipping the remotion pass (${hash.slice(0, 8)}); --force to override`);
} else {
  const render = spawnSync(
    'npx',
    [
      'remotion', 'render', 'src/index.js', id, `out/${id}.mp4`,
      '--codec=h264', '--image-format=jpeg',
      `--concurrency=${Math.max(1, cpus().length - 1)}`,
    ],
    { stdio: 'inherit', cwd: root, shell: true }
  );
  if (render.status !== 0) process.exit(render.status ?? 1);
  writeFileSync(hashFile, hash);
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const timing = JSON.parse(readFileSync(join(root, 'lectures', id, 'timing.json'), 'utf8'));
const ts = (s) => {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = (s % 60).toFixed(3).padStart(6, '0');
  return `${h}:${m}:${sec}`;
};
let cursor = 0;
const cues = timing.beats.map((b, i) => {
  const cue = `${i + 1}\n${ts(cursor)} --> ${ts(cursor + b.durSec)}\n${b.caption}\n`;
  cursor += b.durSec;
  return cue;
});
writeFileSync(join(root, 'out', `${id}.vtt`), `WEBVTT\n\n${cues.join('\n')}`);

console.log(`✓ out/${id}.mp4 ${skipped ? 'up to date' : `rendered in ${secs}s`} (${timing.totalSec.toFixed(1)}s video, ${timing.voiced ? 'voiced' : 'silent'})`);
console.log(`✓ out/${id}.vtt - ${timing.beats.length} cues`);
