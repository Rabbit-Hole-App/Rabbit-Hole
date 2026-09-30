// Calibration for Phase 1 of card composition: the mechanical boundary flags
// (card-plan.js) over the cards approved before Phase 1 - reported, never
// enforced on them. Shows what the flags catch on cards whose boundaries a
// reviewer already judged. Usage: node scripts/card-boundary-report.mjs
import { NANOGPT_FIRST_BATCH } from '../src/nanogpt/board.js';
import { DEPTH_LADDER } from '../src/nanogpt/depth/board.js';
import { FLAG_RUBRIC, boundaryFlags } from '../src/card-plan.js';
import { evaluateScene } from '../src/scene-evaluate.js';

const cards = [...NANOGPT_FIRST_BATCH, ...DEPTH_LADDER.flatMap(concept => concept.cards)];
for (const card of cards) {
  const scene = card.scene;
  const inputs = Object.fromEntries((scene.inputs || []).map(d => [d.name, d.default]));
  const { state } = evaluateScene(structuredClone(scene), scene.duration, inputs);
  const visibleText = state.objects.filter(o => o.visible && o.label).map(o => o.label);
  const flags = boundaryFlags({ scene, plan: card.plan, visibleText });
  console.log(`${scene.id.padEnd(34)} ${flags.length ? flags.map(f => `${f} (${FLAG_RUBRIC[f]})`).join('; ') : '-'}`);
}
