import { derived } from './topic-transfer-learning-data.js';
import manifest from './topic-bert-sources.json' with { type: 'json' };
const d = derived();
const spec = diagram => ({ version: 1, diagram });
const overview = { kind: 'matrix', title: 'One feature-to-classifier pattern', columns: ['Feature extractor', 'Vector readout'],
  rows: d.modalities.map(row => ({ heading: row.name, cells: [row.extractor, row.head] })),
  caption: 'Text and images need different feature extractors. Each task head reads its own learned feature vector.' };
const comparison = { kind: 'matrix', title: 'Distinct inputs, same classifier recipe', columns: ['Input', 'Extractor', 'Feature vector', 'Classifier'],
  rows: d.modalities.map(row => ({ heading: row.name, cells: [row.input, row.extractor, row.name + ' vector', row.head] })),
  caption: 'Separate pipelines: each extractor builds its own feature vector for its own classifier. No shared decoder.' };
const path = row => ({ kind: 'block-stack', title: row.name + ' features feed their own classifier',
  blocks: [{ id: 'encoder', label: row.extractor },
    { id: 'features', label: row.name + ' vector', diagram: { kind: 'tensor', tensor: { rows: 1, columns: row.featureCount, dimensions: `${row.featureCount} features` } } },
    { id: 'head', label: row.head, role: 'output' }],
  caption: `Symbolic ${row.name.toLowerCase()} feature slots. Same recipe does not mean shared feature coordinates or classifier parameter sets.` });

const entry = manifest.references.find(row => row.queueId === 'ml-transfer-learning-modality-feature-classifier');
const paraphrases = ['Compare the modality classifier pattern for a note and an image.', 'Show a feature extractor analogy without merging the feature spaces.', 'How does the modality classifier pattern keep separate task heads?', 'Explain a feature extractor analogy with different feature widths.', 'Keep vision and text parameters separate in the modality classifier pattern.'];
const depths = { overview: { spec: spec(overview) }, standard: { spec: spec(comparison) }, deep: { spec: spec(path(d.modalities[0])), detailSpec: spec(path(d.modalities[1])) } };
export const references = Object.freeze([{
  id: entry.referenceId, topic: entry.topic, lessons: entry.lessons,
  sources: [{ kind: 'figure-brief', path: entry.source.brief, revision: manifest.sourceRevision }],
  prompts: [entry.source.summary, ...paraphrases], paraphrases, keywords: ['modality classifier pattern', 'feature extractor analogy'],
  useWhen: 'Compare text and image feature extractors feeding their own task classifiers; not multimodal fusion, a shared decoder, shared feature coordinates or equal task performance.',
  ...depths.standard, depths,
}]);
export { derived };
