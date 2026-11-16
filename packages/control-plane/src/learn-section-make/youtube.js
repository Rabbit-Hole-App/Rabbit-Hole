// Learn sections C §5: a video item. The Make turn calls find_video_moments; the window comes only from passages read this turn
// (ctx.turn), or there is none and the whole video is offered. validateShowVideo's 5 min bound is lifted for section items (C §5c).
// ponytail: C §5e (no confident video -> drop and re-run compose for the beat) is the dispatcher's (CORE); this validator checks one choice.
import { validateShowVideo } from '../learn-youtube.js';

const SLACK_S = 2; // passage edges are whole-second timestamps

export const fields = {
  videoId: { type: 'string', minLength: 11, maxLength: 200, description: 'A video from this turn\'s find_video_moments result.' },
  start: { type: 'integer', minimum: 0, description: 'Window start in seconds, from a passage you read. Omit start and end for the whole video.' },
  end: { type: 'integer', minimum: 1, description: 'Window end in seconds, from a passage you read.' },
  reason: { type: 'string', maxLength: 300 },
  confidence: { type: 'number', minimum: 0, maximum: 1 },
};
export const required = ['videoId', 'reason', 'confidence'];
export const tools = ['find_video_moments'];

// ctx.turn.videos: find_video_moments results ({ videos, passages }) or the videos themselves; passages may also sit on ctx.turn.passages.
function readThisTurn(turn) {
  const results = turn?.videos ?? [], found = new Map(), passages = [...(turn?.passages ?? [])];
  for (const r of results) {
    for (const video of r?.videos ?? [r]) if (video?.videoId) found.set(video.videoId, video);
    passages.push(...(r?.passages ?? []));
  }
  return { found, passages };
}

export async function validate(input, ctx) {
  const { found, passages } = readThisTurn(ctx.turn);
  let shown;
  try { shown = validateShowVideo(input, found, { madeBy: 'learn-section' }); } catch (error) { return { error: error.message }; }
  if (shown.end != null) {
    // Both ends of the window lie in passages of this video read this turn (a segment may span several passages).
    const read = passages.filter(p => p.videoId === shown.videoId);
    const inside = t => read.some(p => t >= p.start - SLACK_S && t <= p.end + SLACK_S);
    if (!inside(shown.start) || !inside(shown.end)) return { error: `The window ${shown.start}s to ${shown.end}s is not in the passages you read (${read.map(p => `${p.start}-${p.end}s`).join(', ') || 'none'}); take it from them, or offer the whole video` };
    // ponytail: "inside the video" is checked only when find_video_moments knew the duration (validateShowVideo); it is often null.
  }
  const video = found.get(shown.videoId);
  return {
    perform: { op: 'video', videoId: shown.videoId, title: shown.title, channel: video.channel ?? null, start: shown.start, end: shown.end },
    record: { confidence: shown.confidence, reason: shown.reason, ...(shown.end == null ? { whole: true } : {}), ...(shown.unverified ? { unverified: true } : {}) },
  };
}
