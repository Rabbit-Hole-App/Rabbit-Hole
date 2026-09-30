// Teaching-surface density of a board's cards: visible text and code on the
// scene at its end state with default inputs, and every file/line citation,
// fixture-generator or revision mention still printed inside the visual.
// Usage: node scripts/card-density.mjs <board> [out.json]
import { writeFileSync } from 'node:fs';
import { BOARDS } from '../src/demo-scenes.js';
import { evaluateScene } from '../src/scene-evaluate.js';

const [, , board, out] = process.argv;
if (!BOARDS[board]) throw new Error(`unknown board "${board}"`);
const CITATION = /[\w./-]+\.py\b|:\d+(?:-\d+)?\b|generate_fixtures|@[0-9a-f]{7}|\bsource\b(?! values?\b)/i; // "Source value" is a status label
const cards = BOARDS[board]().filter(block => block.scene).map(block => {
  const scene = block.scene;
  const inputs = Object.fromEntries((scene.inputs || []).map(d => [d.name, d.default]));
  const { state } = evaluateScene(structuredClone(scene), scene.duration, inputs);
  const shown = state.objects.filter(o => o.visible && ['text', 'code'].includes(o.type) && o.label);
  return {
    id: scene.id, height: scene.height,
    textObjects: shown.length, codeObjects: shown.filter(o => o.type === 'code').length,
    chars: shown.reduce((n, o) => n + o.label.length, 0),
    citations: shown.filter(o => o.type === 'code' || CITATION.test(o.label)).map(o => `${o.id}: ${o.label}`),
    sources: (block.sources || []).length,
  };
});
for (const c of cards) console.log(`${c.id.padEnd(30)} h=${c.height} text=${c.textObjects} code=${c.codeObjects} chars=${c.chars} citationLines=${c.citations.length} sources=${c.sources}`);
if (out) writeFileSync(out, JSON.stringify(cards, null, 2));
