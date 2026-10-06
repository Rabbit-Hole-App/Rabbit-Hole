// Anti-hardcoding (Rabbit Hole requirement, 2026-10-06): the renderer gates read every fact from the
// brief, storyboard and composition they are given, never from a topic, a fixture id or a label.
// Two topics per renderer pass the same gates with no code change. A consistent rename of every
// object id, a reorder of each beat's objects and a relabel give the same verdict as the original,
// and an inconsistent one is refused with errors naming the new values (derived, not remembered).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { storyboardObjects } from './author.js';
import { rendererGate } from './renderers.mjs';

const FIX = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const read = f => readFileSync(join(FIX, f), 'utf8');
const json = f => JSON.parse(read(f));
const INPUTS = json('m5/inputs.json');
const m5 = name => ({ brief: json(INPUTS[name].brief), storyboard: json(INPUTS[name].storyboard), source: read(INPUTS[name].composition), compositionId: INPUTS[name].composition_id });
const m7b = (plan, composition) => {
  const p = json(`m7b/${plan}`), source = read(`m7b/${composition}`);
  return { brief: p.brief, storyboard: p.storyboard, source, compositionId: source.match(/data-composition-id=(["'])([^"']+)\1/)[2] };
};
// Model-generated compositions on two topics per renderer, each with its own brief and storyboard.
const CASES = [
  { renderer: 'remotion', topic: 'softmax in attention', ...m5('softmax-m6') },
  { renderer: 'remotion', topic: 'GPT.generate', ...m5('generate-m6') },
  { renderer: 'hyperframes', topic: 'softmax in attention', ...m7b('plan-softmax.json', 'softmax-run-a.repaired.hyperframes.html') },
  { renderer: 'hyperframes', topic: 'multinomial sampling', ...m7b('plan-multinomial.json', 'multinomial-run-b2.hyperframes.html') },
];
const verdict = (c, source = c.source, storyboard = c.storyboard) => {
  const gate = rendererGate(c.renderer);
  return [...gate.staticErrors(source, { durationSeconds: c.brief.duration.seconds, compositionId: c.compositionId }), ...gate.contract(source, c.brief, storyboard).errors];
};

// Every object id to an opaque id, in reverse inventory order; every beat's objects reversed.
function rename(c) {
  const ids = storyboardObjects(c.storyboard);
  const to = new Map(ids.map((id, i) => [id, `item_${ids.length - i}`]));
  const storyboard = { ...c.storyboard, beats: c.storyboard.beats.map(b => ({ ...b, visible_objects: b.visible_objects.map(o => ({ ...o, id: to.get(o.id) })).reverse() })) };
  let source = c.source;
  // Every quoted literal of the id: data-object="x", or { id: 'x' } in a list the primitives map over.
  for (const [from, id] of to) source = source.replace(new RegExp(`(["'])${from}\\1`, 'g'), (m, q) => `${q}${id}${q}`);
  return { to, storyboard, source };
}
// One object label that the composition writes exactly once, as plain text.
function relabelable(c) {
  const labels = [...new Set(c.storyboard.beats.flatMap(b => b.visible_objects.map(o => o.label)).filter(l => l && /^[A-Za-z][A-Za-z0-9 ]{2,}$/.test(l)))];
  const others = c.storyboard.beats.flatMap(b => [b.on_screen_text, b.narration_line]).filter(Boolean).join('\n');
  return labels.find(l => c.source.split(l).length === 2 && !others.includes(l));
}
const relabel = (storyboard, from, to) => ({ ...storyboard, beats: storyboard.beats.map(b => ({ ...b, visible_objects: b.visible_objects.map(o => (o.label === from ? { ...o, label: to } : o)) })) });

for (const c of CASES) {
  test(`${c.renderer} / ${c.topic}: the same gate accepts it, renamed, reordered and relabelled, and refuses an inconsistent change by its new values`, () => {
    assert.deepEqual(verdict(c), [], 'the unedited model output passes');

    const r = rename(c);
    assert.deepEqual(storyboardObjects(r.storyboard).sort(), [...r.to.values()].sort(), 'the inventory is read from the storyboard');
    assert.deepEqual(verdict(c, r.source, r.storyboard), [], 'renamed ids and reordered objects: the same verdict');
    // Renamed in the storyboard only: refused, naming the new ids the storyboard asks for.
    const half = verdict(c, c.source, r.storyboard);
    for (const id of r.to.values()) assert.ok(half.some(e => e.includes(`"${id}"`)), `${id}: ${half.join('; ')}`);

    const label = relabelable(c);
    assert.ok(label, 'a label written once to relabel');
    const changed = `${label} now`;
    assert.deepEqual(verdict(c, r.source.replace(label, changed), relabel(r.storyboard, label, changed)), [], 'relabelled in both: the same verdict');
    const stale = verdict(c, r.source, relabel(r.storyboard, label, changed));
    assert.ok(stale.some(e => e.includes(`"${changed}"`)), `relabelled in the storyboard only: ${stale.join('; ')}`);
  });
}
