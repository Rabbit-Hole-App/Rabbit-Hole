// Generate narration audio for the nanoGPT Lesson 1 fixture (Pages 1-2) with
// Fish Audio TTS. Run by hand when the plan's narration text changes:
//   node scripts/generate-lesson-audio.mjs
// Reads FISH_AUDIO_API_KEY from the repo .env. Writes one clip per aligned
// scene part to packages/web/public/audio/ plus the timing manifest
// packages/web/src/nanogpt-audio.json that nanogpt-lesson.js imports.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const key = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8')).FISH_AUDIO_API_KEY;
if (!key) throw new Error('Missing FISH_AUDIO_API_KEY in .env');

// One narrator for every clip. Fish picks a random voice without a reference.
const VOICE = '802e3bc2b27e49c2995d23ef70e6ac89'; // "Energetic Male"
const BITRATE = 128;

// Each part starts when its `at` scene object begins drawing; the player
// stretches that scene segment to the clip length so speech and drawing align.
const CHUNKS = [
  [
    { at: 'title', text: "Hi, and welcome to lesson one! Let's start with a tiny puzzle." },
    { at: 'prefix', text: 'Suppose you see H, e, l, l. What might come next?' },
    { at: 'prediction', text: 'You might suggest o — turning hell into hello, which is much friendlier. You used patterns you have seen before. We want a computer to learn patterns from examples too. Its task is to estimate the next token — one character in this example.' },
    { at: 'probabilities', text: 'It assigns probabilities to possible continuations; it does not know a guaranteed answer.' },
    { at: 'check', text: 'We can build longer text by choosing one character and repeating.' },
    { at: 'transition', text: "Nice — but computers don't read letters, they crunch numbers. So, next question: how do we give the computer this text as numbers?" },
  ],
  [
    { at: 'title', text: 'Welcome back! On the last page we predicted the next character. Now for the cliffhanger: how does Hello become numbers?' },
    { at: 'characters', text: 'Simple: we assign each character its own ID.' },
    { at: 'vocabulary', text: 'H becomes zero, e becomes one, and both l characters become two — identical twins, same ID.' },
    { at: 'encoding', text: 'This lookup is called encoding.' },
    { at: 'decode', text: "Reverse it and we recover Hello: that is decoding. And don't read too much into the numbers — a larger ID does not mean a more important character. We have changed the representation; the model has not learned anything yet." },
    { at: 'check', text: 'So, what prediction task can we build from this sequence of IDs? Your turn: try the encoding exercise below the canvas.' },
  ],
];

// The chunks must be exactly the plan's spoken text, split - fail loudly if
// someone edits the plan without updating this mapping (or the reverse).
const plan = readFileSync(new URL('../docs/courses/nanogpt/lesson-01-plan.md', import.meta.url), 'utf8');
const sections = plan.split(/^## /m).filter(section => /^Page [12] —/.test(section));
sections.forEach((section, i) => {
  const parts = Object.fromEntries(section.split(/^### /m).slice(1).map(part => {
    const [heading, ...body] = part.split('\n');
    return [heading.trim(), body.join('\n').trim()];
  }));
  const narration = parts['Spoken or written explanation'].replace(/^[“”]|[“”]$/g, '');
  const joined = CHUNKS[i].map(chunk => chunk.text).join(' ');
  if (joined !== narration) throw new Error(`Page ${i + 1} chunks do not match the plan narration.\nplan:   ${narration}\nchunks: ${joined}`);
});

const manifest = [];
for (const [i, chunks] of CHUNKS.entries()) {
  const page = [];
  for (const [j, chunk] of chunks.entries()) {
    const response = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: 's1' },
      body: JSON.stringify({ text: chunk.text, reference_id: VOICE, format: 'mp3', mp3_bitrate: BITRATE, normalize: true, latency: 'normal' }),
    });
    if (!response.ok) throw new Error(`Fish Audio ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const name = `nanogpt-l1-p${i + 1}-${j}.mp3`;
    writeFileSync(new URL(`../packages/web/public/audio/${name}`, import.meta.url), bytes);
    const ms = Math.round(bytes.length * 8 / BITRATE); // CBR estimate, good to ~1%
    page.push({ at: chunk.at, src: `/audio/${name}`, ms });
    console.log(`page ${i + 1} part ${j} (${chunk.at}): ${bytes.length} bytes ≈ ${ms} ms`);
  }
  manifest.push(page);
}
writeFileSync(new URL('../packages/web/src/nanogpt-audio.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote packages/web/src/nanogpt-audio.json');
