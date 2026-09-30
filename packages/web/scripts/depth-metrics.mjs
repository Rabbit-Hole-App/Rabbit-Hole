// Structural metrics for the depth ladder: for each concept, how its Overview,
// Guided and Deep dive cards differ in what they show and let the learner do -
// not just in how much they say. Read at each card's end state, default inputs.
// Usage: node scripts/depth-metrics.mjs [concept ...] [--json out.json]
//   concepts are directories under src/nanogpt/depth/ (default: all six)
import { writeFileSync } from 'node:fs';
import { evaluateScene } from '../src/scene-evaluate.js';

const DEPTHS = [['overview', 'Overview'], ['guided', 'Guided'], ['deep', 'Deep dive']];
const ALL = ['tokenization', 'architecture', 'attention', 'residual-layernorm', 'training-loss', 'generation'];
const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const out = jsonAt >= 0 ? args[jsonAt + 1] : null;
const concepts = jsonAt >= 0 ? args.filter((a, i) => i !== jsonAt && i !== jsonAt + 1) : args;
const SHAPE = /\(\s*[A-Za-z][\w·]*(?:\s*,\s*[\w·×/]+)+\s*\)/g;
const NUMBER = /\d+(?:\.\d+)?/g;
const configurations = scene => (scene.inputs || []).filter(d => !d.hidden).reduce((n, d) =>
  n * (d.type === 'bool' ? 2 : d.type === 'choice' ? d.options.length : d.type === 'index' ? (scene.exampleData?.[d.of] || []).length : 1), 1);

const rows = [];
for (const concept of concepts.length ? concepts : ALL) {
  for (const [file, depth] of DEPTHS) {
    const card = await import(new URL(`../src/nanogpt/depth/${concept}/${file}.js`, import.meta.url));
    const scene = card.scene;
    const inputs = Object.fromEntries((scene.inputs || []).map(d => [d.name, d.default]));
    const { state } = evaluateScene(structuredClone(scene), scene.duration, inputs);
    const shown = state.objects.filter(o => o.visible);
    const labels = shown.filter(o => o.label && ['text', 'code', 'equation'].includes(o.type)).map(o => o.label);
    const kinds = (card.sources || []).reduce((acc, s) => ({ ...acc, [s.kind]: (acc[s.kind] || 0) + 1 }), {});
    rows.push({
      concept, depth, id: scene.id, height: scene.height,
      chars: shown.filter(o => o.label && ['text', 'code'].includes(o.type)).reduce((n, o) => n + o.label.length, 0),
      textObjects: shown.filter(o => o.type === 'text' && o.label).length,
      equations: shown.filter(o => o.type === 'equation').length,
      shapes: new Set(labels.join(' ').match(SHAPE) || []).size,
      numbers: labels.join(' ').match(NUMBER)?.length || 0,
      visuals: [...new Set(shown.filter(o => !['text', 'code', 'equation'].includes(o.type)).map(o => o.type))].sort().join(','),
      controls: (scene.inputs || []).filter(d => !d.hidden).map(d => `${d.type}${d.presentation ? `:${d.presentation}` : ''}`).join(','),
      configurations: configurations(scene),
      derived: Object.keys(scene.derived || {}).length,
      sources: Object.entries(kinds).map(([k, n]) => `${k}:${n}`).join(','),
      prerequisites: labels.find(l => /^(Builds on|No prerequisites)/.test(l)) || '',
    });
  }
}
const cols = ['concept', 'depth', 'chars', 'textObjects', 'equations', 'shapes', 'numbers', 'visuals', 'controls', 'configurations', 'derived', 'sources', 'prerequisites'];
console.log(cols.join(' | '));
for (const row of rows) console.log(cols.map(c => row[c]).join(' | '));
if (out) writeFileSync(out, JSON.stringify(rows, null, 2));
