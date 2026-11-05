// The whiteboard composition's pure parts (no React, no Remotion): a gated manifest {plan, scenes, timing} becomes scene windows with their
// stroke schedule, beat audio placements and caption cues. Strokes are src/lecture/WhiteboardScene.jsx's shape ({type, ...geometry, color,
// width}); `equation` is a Virgil text stroke and `graph` is two axis arrows plus the sampled polyline. Manifest strings are only ever copied
// into text strokes and captions, which React renders as text: nothing here or in the components evaluates them.
export const FPS = 30;
export const CAPTION_CHARS = 90; // one caption line at 34 px Inter across the board

// The job's MP3 for timing beat i, under the job's public dir (the service writes it, the composition plays it).
export const audioName = i => `audio/b${String(i).padStart(2, '0')}.mp3`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// One manifest primitive -> the lecture strokes that draw it.
export function strokesFor(p) {
  const base = { color: p.color, width: p.width };
  switch (p.kind) {
    case 'rect': case 'cross': return [{ ...base, type: p.kind, x: p.x, y: p.y, w: p.w, h: p.h }];
    case 'ellipse': return [{ ...base, type: 'ellipse', cx: p.cx, cy: p.cy, rx: p.rx, ry: p.ry }];
    case 'line': case 'arrow': return [{ ...base, type: p.kind, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 }];
    case 'path': return [{ ...base, type: 'path', points: p.points.map(([x, y]) => [x, y]) }];
    case 'text': case 'equation': return [{ ...base, type: 'text', x: p.x, y: p.y, size: p.size, text: p.text }];
    case 'graph': {
      const [d0, d1] = p.domain, [r0, r1] = p.range, bottom = p.y + p.h;
      const point = ([vx, vy]) => [clamp(p.x + ((vx - d0) / (d1 - d0 || 1)) * p.w, p.x, p.x + p.w), clamp(bottom - ((vy - r0) / (r1 - r0 || 1)) * p.h, p.y, bottom)];
      return [
        { ...base, type: 'arrow', x1: p.x, y1: bottom, x2: p.x + p.w, y2: bottom },
        { ...base, type: 'arrow', x1: p.x, y1: bottom, x2: p.x, y2: p.y },
        { ...base, type: 'path', points: p.points.map(point) },
      ];
    }
    default: throw new Error(`no stroke for primitive kind ${p.kind}`); // the gate admits none
  }
}

// Narration -> caption lines of at most CAPTION_CHARS, split at spaces (a longer word is cut), timed over the beat's audio by length.
export function captionCues(text, from, frames) {
  const lines = [];
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    for (let w = word; w; w = w.slice(CAPTION_CHARS)) {
      const piece = w.slice(0, CAPTION_CHARS), last = lines.at(-1);
      if (last !== undefined && last.length + 1 + piece.length <= CAPTION_CHARS) lines[lines.length - 1] = `${last} ${piece}`;
      else lines.push(piece);
    }
  }
  if (!lines.length || frames < 1) return [];
  const total = lines.reduce((n, l) => n + l.length, 0);
  let before = 0;
  const starts = lines.map(l => { const s = Math.floor((before / total) * frames); before += l.length; return s; });
  return lines.map((text, i) => ({ from: from + starts[i], durationInFrames: Math.max(1, (starts[i + 1] ?? frames) - starts[i]), text }))
    .filter((c, i, all) => i === 0 || c.from > all[i - 1].from); // two lines sharing a frame: keep the first
}

// The whole video. A beat draws its reveals one after another over its narration plus pause (or, when both are 0, until the next beat or the
// scene's end); a primitive no beat reveals is never drawn; each scene is its own board (cleared at the scene's start).
export function schedule({ plan, scenes, timing }) {
  const windows = plan.scenes;
  const beats = timing.beats.map((t, i) => ({ ...t, index: i }));
  const out = { totalFrames: timing.totalFrames, scenes: [], audio: [], cues: [] };
  scenes.forEach((scene, si) => {
    const w = windows[si], byId = new Map(scene.primitives.map((p, pi) => [p.id, { p, pi }]));
    const mine = beats.filter(t => t.sceneId === scene.sceneId), strokes = [];
    scene.beats.forEach((beat, bi) => {
      const t = mine[bi], next = mine[bi + 1]?.startFrame ?? w.endFrame, span = Math.max(1, next - t.startFrame);
      const drawF = Math.max(1, Math.min(span, t.audioFrames + beat.pauseFrames || span));
      beat.reveals.forEach((id, ri) => {
        const { p, pi } = byId.get(id), parts = strokesFor(p);
        const from = t.startFrame - w.startFrame + Math.floor((ri * drawF) / beat.reveals.length), slot = Math.max(1, Math.floor(drawF / beat.reveals.length));
        parts.forEach((stroke, k) => strokes.push({
          stroke, seed: si * 7919 + pi * 31 + k * 7 + 3,
          startF: from + Math.floor((k * slot) / parts.length), durF: Math.max(1, Math.floor(slot / parts.length)),
        }));
      });
      if (t.audioFrames > 0) {
        out.audio.push({ from: t.startFrame, durationInFrames: t.audioFrames, src: audioName(t.index) });
        out.cues.push(...captionCues(beat.narration, t.startFrame, t.audioFrames));
      }
    });
    out.scenes.push({ id: scene.sceneId, from: w.startFrame, durationInFrames: w.endFrame - w.startFrame, strokes });
  });
  return out;
}

// What the board shows at `frame` (relative to its scene): every started stroke with its progress, for WhiteboardScene's `items`.
export const itemsAt = (strokes, frame) => strokes.filter(s => frame >= s.startF).map(s => ({ stroke: s.stroke, seed: s.seed, p: Math.min(1, (frame - s.startF) / s.durF) }));
