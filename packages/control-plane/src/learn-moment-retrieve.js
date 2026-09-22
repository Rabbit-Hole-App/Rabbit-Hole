// Retrieve before reasoning. Five transcripts can be five hour-long lectures;
// a model told to search all of it is searching a haystack. Cut every
// transcript into windows, score them against the question, and hand the
// model only the best passages - it still chooses the video and the window
// jointly, over a pre-filtered field.
//
// The scorer is lexical on purpose: phase 2 has no embedding binding, and the
// prototype's own retrieval keeps a BM25 leg beside its dense one. Phase 3
// swaps scoreWindows for bge-m3 similarity; nothing around it moves.

export const WINDOW_S = 60;
export const STRIDE_S = 30;

// Windows carry their line span, so a winning window can be widened with
// surrounding context without re-cutting anything.
export function cutWindows(lines, { window = WINDOW_S, stride = STRIDE_S } = {}) {
  const windows = [];
  if (!lines?.length) return windows;
  const endOf = line => line.start + (line.duration || 0);
  for (let at = 0; ; at += stride) {
    const from = lines.findIndex(line => endOf(line) > at);
    if (from === -1) break;
    let to = from;
    while (to + 1 < lines.length && lines[to + 1].start < at + window) to += 1;
    // A duplicate span is skipped, never a reason to stop: a single long cue
    // followed by silence stalls `to` for a stride or two, and breaking here
    // silently dropped the entire rest of a transcript once. The true tail is
    // the break below.
    if (windows.length && windows[windows.length - 1].from === from && windows[windows.length - 1].to === to) continue;
    const text = lines.slice(from, to + 1).map(line => line.text).join(' ');
    const start = Math.floor(lines[from].start);
    const end = Math.ceil(Math.max(endOf(lines[to]), lines[from].start + 1));
    windows.push({ start, end, from, to, text });
    if (to === lines.length - 1) break;
  }
  return windows;
}

const tokenize = text => String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];

// BM25-lite over the windows of all candidate videos together, so a video
// with many mediocre windows cannot outrank one with a single dense passage.
export function scoreWindows(question, windows) {
  const query = [...new Set(tokenize(question))];
  if (!query.length || !windows.length) return windows.map(() => 0);
  const documents = windows.map(entry => tokenize(entry.text));
  const averageLength = documents.reduce((sum, tokens) => sum + tokens.length, 0) / documents.length || 1;
  const containing = new Map(query.map(term => [term, documents.filter(tokens => tokens.includes(term)).length]));
  const k1 = 1.4, b = 0.6;
  return documents.map(tokens => {
    let score = 0;
    for (const term of query) {
      const frequency = tokens.filter(token => token === term).length;
      if (!frequency) continue;
      const idf = Math.log(1 + (documents.length - containing.get(term) + 0.5) / (containing.get(term) + 0.5));
      score += idf * (frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * tokens.length / averageLength));
    }
    return score;
  });
}

// The passages one model call will choose from: top windows across all
// videos, capped per video so one long lecture cannot crowd out the field,
// each widened with a little surrounding context for the window-tightening.
export function topPassages(question, videos, { top = 14, perVideo = 3, contextLines = 2 } = {}) {
  const candidates = [];
  for (const video of videos) {
    if (!video.lines?.length) continue;
    const windows = cutWindows(video.lines);
    const scores = scoreWindows(question, windows);
    windows.forEach((entry, index) => candidates.push({ video, window: entry, score: scores[index] }));
  }
  candidates.sort((a, b) => b.score - a.score);
  const taken = new Map();
  const passages = [];
  for (const candidate of candidates) {
    if (passages.length >= top) break;
    if (candidate.score <= 0) break;
    const count = taken.get(candidate.video.videoId) || 0;
    if (count >= perVideo) continue;
    // Overlapping strides produce near-duplicate neighbours; one per spot.
    if (passages.some(existing => existing.videoId === candidate.video.videoId && Math.abs(existing.start - candidate.window.start) < WINDOW_S / 2)) continue;
    taken.set(candidate.video.videoId, count + 1);
    const lines = candidate.video.lines;
    const from = Math.max(0, candidate.window.from - contextLines);
    const to = Math.min(lines.length - 1, candidate.window.to + contextLines);
    passages.push({
      videoId: candidate.video.videoId,
      title: candidate.video.title,
      start: candidate.window.start,
      end: candidate.window.end,
      // Per-line timestamps, so the model can return a window tighter than
      // ours: retrieved 4:00-5:00, answered 4:12-5:38.
      text: lines.slice(from, to + 1).map(line => `[${clock(line.start)}] ${line.text}`).join('\n'),
    });
  }
  return passages;
}

export const clock = value => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};
