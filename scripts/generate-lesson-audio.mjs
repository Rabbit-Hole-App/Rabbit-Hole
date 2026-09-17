// Generate narration audio for the nanoGPT Lesson 1 fixture (Pages 1-2) with
// Fish Audio TTS. Run by hand when the plan's narration text changes:
//   node scripts/generate-lesson-audio.mjs
// Reads FISH_AUDIO_API_KEY from the repo .env; writes packages/web/public/audio/.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';

const key = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8')).FISH_AUDIO_API_KEY;
if (!key) throw new Error('Missing FISH_AUDIO_API_KEY in .env');

const plan = readFileSync(new URL('../docs/courses/nanogpt/lesson-01-plan.md', import.meta.url), 'utf8');
const sections = plan.split(/^## /m).filter(section => /^Page [12] —/.test(section));
const narrations = sections.map(section => {
  const parts = Object.fromEntries(section.split(/^### /m).slice(1).map(part => {
    const [heading, ...body] = part.split('\n');
    return [heading.trim(), body.join('\n').trim()];
  }));
  return parts['Spoken or written explanation'].replace(/^[“”]|[“”]$/g, '');
});

mkdirSync(new URL('../packages/web/public/audio/', import.meta.url), { recursive: true });
const BITRATE = 128;
for (const [i, text] of narrations.entries()) {
  const response = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: 's1' },
    body: JSON.stringify({ text, format: 'mp3', mp3_bitrate: BITRATE, normalize: true, latency: 'normal' }),
  });
  if (!response.ok) throw new Error(`Fish Audio ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(new URL(`../packages/web/public/audio/nanogpt-l1-p${i + 1}.mp3`, import.meta.url), bytes);
  // CBR estimate; good to ~1%. Feed the printed ms into durationMs in nanogpt-lesson.js.
  console.log(`page ${i + 1}: ${bytes.length} bytes ≈ ${Math.round(bytes.length * 8 / BITRATE)} ms, ${text.length} chars`);
}
