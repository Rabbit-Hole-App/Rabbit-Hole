// The our-pipeline eval the prototype's run_eval.py is for the Python one:
// question in -> findVideoMoments + one real model choice -> (videoId, window)
// out, scored against gold. Hand-run before phase promotions, never in CI:
//   node tests/evals/moment-eval.mjs [gold.jsonl] [--model claude-sonnet-5] [--limit N]
// Needs EXA_API_KEY and ANTHROPIC_API_KEY in the root .env (small-deploy).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findVideoMoments, SHOW_VIDEO_TOOL, VIDEO_SYSTEM, validateShowVideo } from '../../packages/control-plane/src/learn-youtube.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
const goldPath = args.find(entry => entry.endsWith('.jsonl')) || join(here, 'moment-gold.jsonl');
const model = flag('--model') || 'claude-sonnet-5';
const limit = Number(flag('--limit')) || Infinity;

const envFile = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const keyOf = name => envFile.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim();
const env = { EXA_API_KEY: keyOf('EXA_API_KEY') };
const anthropicKey = keyOf('ANTHROPIC_API_KEY');
if (!env.EXA_API_KEY || !anthropicKey) { console.error('EXA_API_KEY and ANTHROPIC_API_KEY required in the root .env'); process.exit(1); }

let goldRaw;
try { goldRaw = readFileSync(goldPath, 'utf8'); }
catch { console.error(`No gold file at ${goldPath} - run packages/control-plane/export-gold.mjs first, or pass a path.`); process.exit(1); }
const gold = goldRaw.split('\n').filter(Boolean).map(line => JSON.parse(line))
  .filter(entry => entry.video_id && entry.end > entry.start).slice(0, limit);
if (!gold.length) { console.error(`No usable gold lines in ${goldPath} - fill video_id/start/end first.`); process.exit(1); }

const iou = (a, b) => {
  const overlap = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const union = Math.max(a.end, b.end) - Math.min(a.start, b.start);
  return union > 0 ? overlap / union : 0;
};

// One forced show_video choice over the pipeline's passages - the same
// decision the tutor makes, minus the surrounding conversation.
async function choose(question, found) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 600, system: VIDEO_SYSTEM,
      tools: [SHOW_VIDEO_TOOL], tool_choice: { type: 'tool', name: 'show_video' },
      messages: [{ role: 'user', content: `Question: ${question}\n\nfind_video_moments result:\n${JSON.stringify({ videos: found.videos, passages: found.passages, ...(found.hot ? { hot: found.hot } : {}) }, null, 1)}\n\nChoose the one video and the tight window that answers, from the passages above.` }],
    }),
  });
  if (!response.ok) throw new Error(`anthropic ${response.status}`);
  const message = await response.json();
  const call = (message.content || []).find(block => block.type === 'tool_use');
  return call?.input || null;
}

let videoHits = 0, windowed = 0, iouSum = 0;
for (const entry of gold) {
  process.stdout.write(`- ${entry.question.slice(0, 60)} ... `);
  try {
    const found = await findVideoMoments(entry.question, env);
    const input = await choose(entry.question, found);
    const chosen = input && validateShowVideo(input, new Map(found.videos.map(video => [video.videoId, video])));
    const hit = chosen?.videoId === entry.video_id;
    videoHits += hit ? 1 : 0;
    if (hit && chosen.end != null) { windowed += 1; const score = iou(chosen, entry); iouSum += score; console.log(`video ${hit ? 'HIT' : 'miss'} IoU ${score.toFixed(2)}`); }
    else console.log(`video ${hit ? 'HIT (no window)' : `miss (${chosen?.videoId || 'refused'})`}`);
  } catch (error) { console.log(`error: ${error.message}`); }
}
console.log(`\nvideo hit rate: ${videoHits}/${gold.length}`);
if (windowed) console.log(`mean IoU on windowed hits: ${(iouSum / windowed).toFixed(3)} over ${windowed}`);
