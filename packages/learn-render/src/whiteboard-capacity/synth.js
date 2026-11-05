// W1.0 (roadmap): a lecture script of a given length at the whiteboard's real drawing density, built from the lecture composition's own primitives
// so the renderer's cost per second of whiteboard video can be measured before a whiteboard composition exists. Temporary (ponytail: W1.0 only).
//
// The beats are lectures/nms/script.json's own, looped to fill the length (its `code` strokes are dropped: the whiteboard does not use Code.jsx).
// nms alone is ~10 primitives per 15 seconds, far under the policy's ~60 to 80 per scene, so each 15-second scene is topped up with deterministic
// extra strokes of every kind (handwritten text, rough rectangles and ellipses, lines, arrows, crosses, curves of 40 to 60 points) to
// TARGET_PRIMITIVES_PER_SCENE. A new scene starts a fresh board, as a scene change does. No audio (the silent track is muxed afterwards).
// The module is pure (the nms JSON is passed in), so the service and the webpack bundle can both import it.
export const FPS = 30;
export const SECONDS = Object.freeze([10, 30, 60, 120]);
export const SCENE_SECONDS = 15;
export const TARGET_PRIMITIVES_PER_SCENE = 70;

const INK = ['#37352F', '#2383E2', '#D44C47', '#0F7B6C', '#9065B0'];
const WORDS = ['input', 'update', 'result', 'step', 'error', 'x + 1', 'rate', 'loss', 'check units', 'next', 'because', 'so', 'half', 'sum', '0.25', 'ratio'];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function extra(r, k) {
  const pick = a => a[Math.floor(r() * a.length)], x = () => 80 + Math.round(r() * 1500), y = () => 120 + Math.round(r() * 820), color = pick(INK), width = 3 + Math.round(r() * 2);
  const kind = ['text', 'text', 'text', 'rect', 'rect', 'ellipse', 'line', 'arrow', 'arrow', 'path', 'path', 'cross'][k % 12];
  switch (kind) {
    case 'text': return { type: 'text', x: x(), y: y(), size: 32 + Math.round(r() * 20), color, text: pick(WORDS) };
    case 'rect': return { type: 'rect', x: x(), y: y(), w: 90 + Math.round(r() * 200), h: 60 + Math.round(r() * 120), color, width };
    case 'ellipse': return { type: 'ellipse', cx: x(), cy: y(), rx: 50 + Math.round(r() * 90), ry: 35 + Math.round(r() * 60), color, width };
    case 'line': { const x1 = x(), y1 = y(); return { type: 'line', x1, y1, x2: x1 + Math.round(r() * 300) - 150, y2: y1 + Math.round(r() * 200) - 100, color, width }; }
    case 'arrow': { const x1 = x(), y1 = y(); return { type: 'arrow', x1, y1, x2: x1 + 80 + Math.round(r() * 200), y2: y1 + Math.round(r() * 160) - 80, color, width }; }
    case 'cross': return { type: 'cross', x: x(), y: y(), w: 50 + Math.round(r() * 50), h: 50 + Math.round(r() * 50), color, width: 5 };
    default: { const n = 40 + Math.round(r() * 20), x0 = x(), y0 = y(), amp = 30 + r() * 60, f = 6 + r() * 6; return { type: 'path', color, width, points: Array.from({ length: n }, (_, i) => [x0 + i * 9, Math.round(y0 - amp * Math.sin(i / f))]) }; }
  }
}

const fit = (s, dur, at) => { const a = Math.min(at ?? s.at ?? 0, dur * 0.8); return { ...s, at: +a.toFixed(3), dur: +Math.min(s.dur ?? 0.6, Math.max(0.15, dur * 0.85 - a)).toFixed(3) }; };

// nms = { script, timing } (lectures/nms). -> { script, timing, frames, stats } for Lecture (src/lecture/Lecture.jsx).
export function synthLecture(seconds, nms) {
  const src = nms.script.beats, times = nms.timing.beats;
  const beats = [];
  for (let t = 0, i = 0; t < seconds - 1e-9; i++) {
    const dur = Math.min(times[i % src.length].durSec, +(seconds - t).toFixed(6));
    beats.push({ start: t, dur, from: src[i % src.length], scene: Math.floor(t / SCENE_SECONDS) });
    t += dur;
  }
  if (beats.length > 1 && beats.at(-1).dur < 1) { const last = beats.pop(); beats.at(-1).dur += last.dur; }
  const scenes = [...new Set(beats.map(b => b.scene))];
  const out = beats.map(b => ({ ...b, strokes: (b.from.strokes || []).filter(s => s.type !== 'code').map(s => fit(s, b.dur)) }));
  for (const scene of scenes) {
    const mine = out.filter(b => b.scene === scene), sceneSeconds = mine.reduce((a, b) => a + b.dur, 0);
    const have = mine.reduce((a, b) => a + b.strokes.length, 0), want = Math.round(TARGET_PRIMITIVES_PER_SCENE * Math.min(1, sceneSeconds / SCENE_SECONDS)), r = rng(1000 + scene);
    for (let k = 0; k < Math.max(0, want - have); k++) {
      const b = mine[k % mine.length];
      b.strokes.push(fit({ ...extra(r, k), dur: 0.3 + r() * 0.7 }, b.dur, 0.1 + r() * 0.7 * b.dur));
    }
  }
  const script = {
    id: 'capacity', title: 'capacity',
    screens: scenes.map((s, i) => ({ id: s + 1, kind: 'whiteboard', title: `scene ${s + 1}`, ...(i > 0 ? { clears: true } : {}) })),
    beats: out.map(b => ({ screen: b.scene + 1, voice: '', caption: b.from.caption || '', strokes: b.strokes })),
  };
  const stats = { scenes: scenes.map(s => { const mine = out.filter(b => b.scene === s); return { scene: s + 1, seconds: +mine.reduce((a, b) => a + b.dur, 0).toFixed(1), primitives: mine.reduce((a, b) => a + b.strokes.length, 0) }; }) };
  stats.primitives = stats.scenes.reduce((a, s) => a + s.primitives, 0);
  stats.max_per_scene = Math.max(...stats.scenes.map(s => s.primitives));
  stats.path_points = out.flatMap(b => b.strokes).reduce((a, s) => a + (s.points?.length || 0), 0);
  stats.kinds = out.flatMap(b => b.strokes).reduce((a, s) => ({ ...a, [s.type]: (a[s.type] || 0) + 1 }), {});
  return { script, timing: { totalSec: seconds, beats: out.map(b => ({ durSec: b.dur, audio: null })) }, frames: Math.round(seconds * FPS), stats };
}
