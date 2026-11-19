import manifest from './topic-bert-sources.json' with { type: 'json' };
const keywords = {
  'ml-bert-pretraining-families': ['pretraining encoder lineage', 'architecture objective lineage'],
  'ml-bert-masked-token': ['missing token supervision', 'bidirectional recovery target'],
  'ml-bert-next-sentence': ['supplied passage adjacency', 'original pair objective'],
  'ml-bert-task-heads': ['encoder readout positions', 'summary token span'],
};
export const overlays = Object.freeze(Object.fromEntries(manifest.references.filter(entry => entry.mode === 'REUSE').map(entry => [entry.referenceId, {
  prompts: [...new Set([entry.source, ...entry.alsoCovers].map(source => source.summary))], keywords: keywords[entry.referenceId],
}])));
