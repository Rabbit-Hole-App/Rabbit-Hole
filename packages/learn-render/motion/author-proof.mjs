// Author proof (M4): compile a validated composition through the M1 Remotion path and render a
// small frame sample with the harness probe on, then check what a viewer would actually see
// against the storyboard. No review, no final render; local/dev only.
//   proveAuthor({brief, storyboard, source, dir}) -> { compiled, errors, frames, timings }
// At each beat's middle frame:
//   - every storyboard object of the beat is on stage and visible (opacity > 0.05);
//   - its label, and the source lines a code object shows, are in that object's text;
//   - the beat's on_screen_text is visible;
//   - a beat under a condition shows the condition (its flag or a branch word);
//   - all visible text uses a bundled font, and code objects use JetBrains Mono;
//   - every visible word comes from TEXT, so no text appeared that the contract did not see;
//   - exactly one element carries each storyboard object id.
import { join } from 'node:path';
import { RemotionRenderer } from './remotion-renderer.mjs';
import { FONT_FAMILIES } from './static-check.js';
import { CONDITION_CUE, briefFacts } from './storyboard-check.js';

const PREFIX = 'MOTION_PROBE ';
const squash = s => String(s).replace(/\s+/g, ' ').trim();
const firstFont = css => css.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
const letterWords = s => (String(s).toLowerCase().match(/[a-z]{2,}/g) || []);

export const probeFrames = storyboard => storyboard.beats.map(b => ({ beat: b.id, frame: Math.round(((b.start_time + b.end_time) / 2) * 30) }));

export function probeErrors(probes, brief, storyboard, TEXT) {
  const f = briefFacts(brief);
  const allowed = new Set(Object.values(TEXT).flatMap(letterWords));
  const e = [];
  for (const { beat: id, frame } of probeFrames(storyboard)) {
    const beat = storyboard.beats.find(b => b.id === id);
    const p = probes.get(frame);
    if (!p) { e.push(`${id} #${frame}: no probe line (the frame did not render)`); continue; }
    const visible = new Map(p.objects.filter(o => o.opacity > 0.05 && o.on_stage).map(o => [o.id, o]));
    // One live element per storyboard object: a primitive mapped twice would split its identity.
    for (const [oid, n] of Object.entries(p.objects.reduce((m, o) => ({ ...m, [o.id]: (m[o.id] || 0) + 1 }), {}))) if (n > 1) e.push(`#${frame}: ${n} elements carry data-object "${oid}"`);
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

export async function proveAuthor({ brief, storyboard, source, TEXT, dir, scale = 0.25 }) {
  const probes = new Map();
  const r = new RemotionRenderer({ fresh: true, inputProps: { probe: true }, log: l => { if (l.text?.startsWith(PREFIX)) { const p = JSON.parse(l.text.slice(PREFIX.length)); probes.set(p.frame, p); } } });
  const job = { id: 'author-proof', dir, brief, storyboard, source };
  try {
    try { await r.prepare(job); }
    catch (error) { return { compiled: false, errors: [`compile: ${String(error.message || error).split('\n')[0].slice(0, 400)}`], frames: [], timings: r.timings }; }
    const stills = await r.renderStills(job, probeFrames(storyboard).map(x => x.frame), { scale, dir: join(dir, 'probe') });
    return { compiled: true, errors: probeErrors(probes, brief, storyboard, TEXT), frames: stills.map(s => ({ frame: s.frame, file: s.file, pixels_sha256: s.pixels_sha256 })), timings: r.timings };
  } finally { await r.close(); }
}
