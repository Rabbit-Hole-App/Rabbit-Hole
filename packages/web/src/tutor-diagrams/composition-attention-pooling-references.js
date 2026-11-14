import { derived } from './topic-attention-pooling-data.js';
import manifest from './topic-attention-sources.json' with { type: 'json' };
const d = derived(), p = d.parameters;
const spec = diagram => ({ version: 1, diagram });
const grid = (id, overview = false) => {
  const c = d.controls.find(row => row.id === id), indices = overview ? [0] : p.queries.map((_, i) => i);
  return { kind: 'heatmap', title: `${id[0].toUpperCase() + id.slice(1)} kernel weights`, rowLabel: 'Source key', columnLabel: 'Query',
    columns: indices.map(i => d.queryLabels[i]), rows: p.keys.map((_, j) => ({ label: d.keyLabels[j], cells: indices.map(i => c.display[i][j]) })), range: { min: 0, max: 1 },
    caption: id === 'uniform' ? `Uniform control: each of ${d.counts.keys} keys gets $1/${d.counts.keys}$. Each query column sums to one; not a finite broad Gaussian.`
      : `Toy Gaussian width $h=${c.width}$. Each query column normalizes over the same keys. Rounded nonuniform shares sum to one.` };
};
const entry = manifest.references.find(row => row.queueId === 'ml-attention-pooling-kernel-weight-concentration');
const paraphrases = ['Compare kernel control grids without changing key coordinates.', 'How do bandwidth concentration rows differ from a uniform control?', 'Show local and uniform kernel control grids on the same keys.', 'Keep query normalization fixed in bandwidth concentration rows.', 'Compare narrow and broad kernel control grids without an infinite-bandwidth claim.'];
const depths = { overview: { spec: spec(grid('local', true)) }, standard: { spec: spec(grid('local')), detailSpec: spec(grid('uniform')) }, deep: { spec: spec(grid('narrow')), detailSpec: spec(grid('broad')) } };
export const references = Object.freeze([{ id: entry.referenceId, topic: entry.topic, lessons: entry.lessons,
  sources: [entry.source, ...entry.alsoCovers].map(source => ({ kind: 'figure-brief', path: source.brief, revision: manifest.sourceRevision })),
  prompts: [...new Set([entry.source, ...entry.alsoCovers].map(source => source.summary)), ...paraphrases], paraphrases, keywords: ['kernel control grids', 'bandwidth concentration rows'],
  useWhen: 'Compare local, uniform, narrow and broad kernel control grids on fixed positions; not learned value mixing, a finite Gaussian exactly equal to uniform, or changing key order.',
  ...depths.standard, depths,
}]);
export { derived };
