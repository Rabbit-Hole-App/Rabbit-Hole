// One Fish Audio call per beat, mp3, cached in .cache/ by hash of text + voice.
// Writes lectures/<id>/timing.json (beat durations = clip + 600ms) and copies
// audio into public/ for Remotion. Without FISH_AUDIO_KEY the lecture renders
// silent with estimated durations, and upgrades itself on the next run with a key.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from 'music-metadata';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cfg = JSON.parse(readFileSync(join(root, 'render.config.json'), 'utf8'));
const key = process.env.FISH_AUDIO_KEY;

if (process.argv.includes('--voices')) {
  if (!key) {
    console.error('set FISH_AUDIO_KEY first');
    process.exit(1);
  }
  const res = await fetch('https://api.fish.audio/model?page_size=15&sort_by=like_count', {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.error(`fish audio ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const j = await res.json();
  for (const m of j.items || []) console.log(`${m._id}  ${m.title} (${m.languages?.join(',') || '?'})`);
  process.exit(0);
}

const id = process.argv[2] || 'nms';
const script = JSON.parse(readFileSync(join(root, 'lectures', id, 'script.json'), 'utf8'));
mkdirSync(join(root, '.cache'), { recursive: true });
mkdirSync(join(root, 'public', 'audio'), { recursive: true });

const beats = [];
let totalSec = 0;
let lectureBytes = 0;
let fetchedBytes = 0;

for (let i = 0; i < script.beats.length; i++) {
  const b = script.beats[i];
  const bytes = Buffer.byteLength(b.voice, 'utf8');
  lectureBytes += bytes;
  const hash = createHash('sha1').update(`${b.voice}|${cfg.voice || 'default'}|${cfg.model}`).digest('hex').slice(0, 16);
  const file = join(root, '.cache', `${hash}.mp3`);
  let action = 'cache';
  if (!existsSync(file)) {
    if (key) {
      const res = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', model: cfg.model },
        body: JSON.stringify({ text: b.voice, format: 'mp3', mp3_bitrate: 128, ...(cfg.voice ? { reference_id: cfg.voice } : {}) }),
      });
      if (!res.ok) throw new Error(`fish audio ${res.status}: ${(await res.text()).slice(0, 300)}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      action = 'fetch';
      fetchedBytes += bytes;
    } else {
      action = 'silent';
    }
  }
  let clip;
  if (existsSync(file)) {
    clip = (await parseFile(file)).format.duration;
    if (!clip) throw new Error(`could not read duration of ${file}`);
    copyFileSync(file, join(root, 'public', 'audio', `${hash}.mp3`));
  } else {
    clip = Math.max(2.8, [...b.voice].length / 14.5);
  }
  const durSec = clip + 0.6;
  totalSec += durSec;
  beats.push({ screen: b.screen, durSec: Math.round(durSec * 1000) / 1000, audio: existsSync(file) ? `${hash}.mp3` : null, caption: b.caption });
  console.log(`✓ beat ${i + 1}: ${action} ${durSec.toFixed(1)}s`);
}

const usd = (fetchedBytes * cfg.usdPerMillionBytes) / 1e6;
const timing = {
  voiced: beats.every((b) => b.audio),
  totalSec: Math.round(totalSec * 1000) / 1000,
  lectureBytes,
  fetchedBytes,
  fetchedUsd: Math.round(usd * 10000) / 10000,
  beats,
};
writeFileSync(join(root, 'lectures', id, 'timing.json'), JSON.stringify(timing, null, 2) + '\n');
console.log(
  `✓ voice: ${timing.voiced ? 'fish audio' : 'SILENT (no FISH_AUDIO_KEY)'} - ${totalSec.toFixed(1)}s total, fetched ${fetchedBytes} bytes ($${timing.fetchedUsd})`
);
