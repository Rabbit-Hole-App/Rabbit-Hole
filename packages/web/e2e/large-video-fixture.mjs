// A real, playable WebM (VP8) between 25 and 50 MiB for the board-file checks (docs/features/canvas-file-imports.md section 7).
// Nothing this size is committed: the frames are noise JPEGs drawn by the check's own browser, and Playwright's bundled
// ffmpeg (libvpx, webm muxer; installed with Playwright's Chromium) encodes them with a seekable index (Cues).
// The file is cached in the temp directory by its parameters. FFMPEG=<path> overrides the lookup.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { join } from 'node:path';

const MiB = 1024 * 1024;

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || (platform() === 'win32' ? join(process.env.LOCALAPPDATA || '', 'ms-playwright')
    : platform() === 'darwin' ? join(homedir(), 'Library', 'Caches', 'ms-playwright') : join(homedir(), '.cache', 'ms-playwright'));
  const dir = existsSync(root) ? readdirSync(root).filter(name => /^ffmpeg-\d+$/.test(name)).sort().pop() : null;
  const exe = dir && readdirSync(join(root, dir)).find(name => /^ffmpeg(-[a-z0-9-]+)?(\.exe)?$/.test(name));
  if (!exe) throw Error(`No ffmpeg under ${root}: run npx playwright install ffmpeg, or set FFMPEG`);
  return join(root, dir, exe);
}

// browser: a launched Playwright browser (only used to draw the frames). Returns { path, size, sha256 }.
export async function largeVideo(browser, { seconds = 8, fps = 30, width = 960, height = 540, bitrate = '36M' } = {}) {
  const path = join(tmpdir(), `rh-large-video-${seconds}s-${fps}-${width}x${height}-${bitrate}.webm`);
  if (!existsSync(path)) {
    const page = await browser.newPage();
    const frames = await page.evaluate(([w, h, n]) => {
      const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const g = canvas.getContext('2d'), image = g.createImageData(w, h), out = [];
      for (let f = 0; f < n; f++) {
        for (let i = 0; i < image.data.length; i += 4) { const v = Math.random() * 255; image.data[i] = v; image.data[i + 1] = (v + f * 7) % 255; image.data[i + 2] = 255 - v; image.data[i + 3] = 255; }
        g.putImageData(image, 0, 0);
        g.fillStyle = '#fff'; g.font = '64px sans-serif'; g.fillText(`frame ${f}`, 40, 100);
        out.push(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
      }
      return out;
    }, [width, height, fps]);
    await page.close();
    const jpegs = frames.map(frame => Buffer.from(frame, 'base64'));
    // Playwright's ffmpeg has no pipe protocol: the JPEG stream goes through a file.
    const input = `${path}.mjpeg`;
    writeFileSync(input, Buffer.concat(Array.from({ length: seconds * fps }, (_, i) => jpegs[i % jpegs.length])));
    const run = spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', input,
      '-c:v', 'libvpx', '-b:v', bitrate, '-minrate', bitrate, '-maxrate', bitrate, '-bufsize', bitrate, '-deadline', 'realtime', '-cpu-used', '8', '-auto-alt-ref', '0', path],
    { maxBuffer: 1 << 26 });
    rmSync(input, { force: true });
    if (run.status !== 0) throw Error(`ffmpeg failed: ${String(run.stderr).slice(0, 500)}`);
  }
  const size = statSync(path).size;
  if (!(size > 25 * MiB && size <= 50 * MiB)) throw Error(`the large video fixture is ${size} bytes, not between 25 and 50 MiB: change its bitrate`);
  return { path, size, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
}
