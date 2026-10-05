// Beat and transition coverage of a render (M5), and the frame-probe rules (M4). Pure, no I/O:
// the render child observes frames inside the sandbox with the harness probe (src/motion/probe.jsx)
// and reports them; the orchestrator (render-job.mjs) judges them against the storyboard and TEXT.
//
// Sampled frames, per beat [from, to): from, from + 1, the middle, to - 1. Between two beats that
// is boundary - 1, boundary, boundary + 1 (epsilon = one frame, always frame-aligned).
//   middle            the M4 rules: every object of the beat visible with its label and source
//                     lines, on_screen_text visible, the condition shown, bundled fonts, TEXT words
//   around a boundary objects in BOTH beats stay visible (an object leaving or arriving may fade)
//   every frame       it rendered, and one element per storyboard object id
// Blank frames are judged on the decoded preview (M6, before review) and the decoded final video
// (remotion-renderer.mjs validateFinal), at nonblankFrames.
import { STAGE } from './contracts.js';
import { FONT_FAMILIES } from './static-check.js';
import { CONDITION_CUE, briefFacts } from './storyboard-check.js';

export const PROBE_PREFIX = 'MOTION_PROBE ';
const VISIBLE = 0.05;
const squash = s => String(s).replace(/\s+/g, ' ').trim();
const firstFont = css => css.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
const letterWords = s => (String(s).toLowerCase().match(/[a-z]{2,}/g) || []);
const span = b => [Math.round(b.start_time * STAGE.fps), Math.round(b.end_time * STAGE.fps)];
export const midFrame = b => Math.round(((b.start_time + b.end_time) / 2) * STAGE.fps);

export function coverageFrames(storyboard) {
  const out = new Map();
  const add = (frame, beat, role) => { const s = out.get(frame) || { frame, beat, roles: [] }; s.roles.push(role); out.set(frame, s); };
  const last = storyboard.beats.length - 1;
  storyboard.beats.forEach((b, i) => {
    const [from, to] = span(b);
    add(from, b.id, i ? 'boundary' : 'first');
    add(from + 1, b.id, i ? 'after_boundary' : 'after_first');
    add(midFrame(b), b.id, 'mid');
    add(to - 1, b.id, i < last ? 'before_boundary' : 'last');
  });
  return [...out.values()].sort((a, b) => a.frame - b.frame);
}

// Two fresh contexts render these frames: the M1 policy (first, middle, last) at every contact-sheet
// timestamp (spec §8.3), so each beat's start and middle, the keyframes and the takeaway are compared.
export function determinismFrames(brief, storyboard) {
  const last = brief.duration.seconds * STAGE.fps - 1;
  return [...new Set([Math.floor(last / 2), ...contactFrames(brief, storyboard)])].sort((a, b) => a - b);
}

// Stills at the first frame, every beat start and middle, the last frame (the takeaway) and
// any brief keyframe_times (spec §11.2).
export function contactFrames(brief, storyboard) {
  const fps = STAGE.fps, last = brief.duration.seconds * fps - 1;
  const frames = [0, last, ...(brief.qa_requirements.keyframe_times || []).map(t => Math.round(t * fps))];
  for (const b of storyboard.beats) frames.push(Math.round(b.start_time * fps), midFrame(b));
  return [...new Set(frames.map(f => Math.min(last, Math.max(0, f))))].sort((a, b) => a - b);
}

// Where blank frames are looked for: every contact-sheet frame and every coverage frame, so the
// first two frames, each beat's start, start + 1, middle and end - 1, and the last frame.
export const nonblankFrames = (brief, storyboard) => [...new Set([...contactFrames(brief, storyboard), ...coverageFrames(storyboard).map(s => s.frame)])].sort((a, b) => a - b);

// What the child keeps of a probe line: text only at beat middles, where the text rules apply.
export const compactProbe = (p, mid) => ({
  frame: p.frame,
  objects: p.objects.map(({ id, opacity, on_stage, text }) => (mid ? { id, opacity, on_stage, text } : { id, opacity, on_stage })),
  ...(mid ? { text: p.text } : {}),
});

const visibleIds = p => new Map(p.objects.filter(o => o.opacity > VISIBLE && o.on_stage).map(o => [o.id, o]));
const duplicateErrors = (p, at) => Object.entries(p.objects.reduce((m, o) => ({ ...m, [o.id]: (m[o.id] || 0) + 1 }), {}))
  .filter(([, n]) => n > 1).map(([id, n]) => `${at}: ${n} elements carry data-object "${id}"`);

// The M4 rules at each beat's middle frame. probes: Map frame -> probe line.
export function probeErrors(probes, brief, storyboard, TEXT) {
  const f = briefFacts(brief);
  const allowed = new Set(Object.values(TEXT).flatMap(letterWords));
  const e = [];
  for (const beat of storyboard.beats) {
    const id = beat.id, frame = midFrame(beat);
    const p = probes.get(frame);
    if (!p) { e.push(`${id} #${frame}: no probe line (the frame did not render)`); continue; }
    // One live element per storyboard object: a primitive mapped twice would split its identity.
    e.push(...duplicateErrors(p, `#${frame}`));
    const visible = visibleIds(p);
    const screen = squash(p.text.map(t => t.value).join(' '));
    for (const o of beat.visible_objects) {
      const seen = visible.get(o.id);
      if (!seen) { e.push(`${id} #${frame}: object ${o.id} is not visible`); continue; }
      if (o.label && !squash(seen.text).includes(squash(o.label))) e.push(`${id} #${frame}: ${o.id} does not show its label "${o.label}"`);
      if (o.source) for (const line of f.lineText(o.source.source_ref_id, o.source.start_line, o.source.end_line).split('\n').map(l => l.trim()).filter(Boolean)) {
        if (!squash(seen.text).includes(squash(line))) e.push(`${id} #${frame}: ${o.id} does not show the source line "${line}"`);
      }
      if (o.source) for (const t of p.text.filter(t => t.object === o.id)) if (firstFont(t.font) !== 'JetBrains Mono') e.push(`${id} #${frame}: code in ${o.id} renders in "${firstFont(t.font)}", not JetBrains Mono`);
    }
    if (beat.on_screen_text?.trim() && !screen.includes(squash(beat.on_screen_text))) e.push(`${id} #${frame}: on_screen_text "${beat.on_screen_text}" is not visible`);
    for (const k of beat.condition_ids || []) {
      const flags = f.flags.get(k) || [];
      if (!flags.some(n => new RegExp(`\\b${n}\\b`, 'i').test(screen)) && !CONDITION_CUE.test(screen)) e.push(`${id} #${frame}: nothing visible says this beat runs under ${k}`);
    }
    for (const t of p.text) {
      if (!FONT_FAMILIES.includes(firstFont(t.font))) e.push(`${id} #${frame}: "${t.value.slice(0, 30)}" renders in "${firstFont(t.font)}", which is not a bundled font`);
      const stray = letterWords(t.value).filter(w => !allowed.has(w));
      if (stray.length) e.push(`${id} #${frame}: visible text "${t.value.slice(0, 40)}" has words not in TEXT (${[...new Set(stray)].join(', ')})`);
    }
  }
  return [...new Set(e)];
}

// The whole sample: observations are the child's compacted probe lines.
export function coverageErrors(observations, brief, storyboard, TEXT) {
  const probes = new Map(observations.map(p => [p.frame, p]));
  const e = [];
  const beats = storyboard.beats;
  for (const s of coverageFrames(storyboard)) {
    const p = probes.get(s.frame);
    if (!p) { e.push(`${s.beat} #${s.frame} (${s.roles.join(', ')}): no observation (the frame did not render)`); continue; }
    e.push(...duplicateErrors(p, `${s.beat} #${s.frame}`));
    // Around a boundary, the objects both beats show must not drop out.
    const i = beats.findIndex(b => b.id === s.beat);
    const across = s.roles.includes('before_boundary') ? [beats[i], beats[i + 1]] : s.roles.some(r => r === 'boundary' || r === 'after_boundary') ? [beats[i - 1], beats[i]] : null;
    if (!across) continue;
    const next = new Set(across[1].visible_objects.map(o => o.id));
    const visible = visibleIds(p);
    for (const o of across[0].visible_objects) if (next.has(o.id) && !visible.has(o.id)) e.push(`${s.beat} #${s.frame} (${s.roles.join(', ')}): ${o.id} is in ${across[0].id} and ${across[1].id} but not visible here`);
  }
  return [...new Set([...e, ...probeErrors(probes, brief, storyboard, TEXT)])];
}
