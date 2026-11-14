import manifest from './topic-transformer-sources.json' with { type: 'json' };
const keywords = {
  'ml-transformer-encoder-decoder-memory': ['translation memory handoff', 'source prefix streams'],
  'ml-transformer-positionwise-feedforward': ['cross position exchange', 'shared per-position network'],
  'ml-transformer-original-decoder-sublayers': ['decoder residual pattern', 'three sublayer joins'],
};
// Supported REUSE contract: only prompts and keywords; catalog lesson metadata is explicit at registration.
export const overlays = Object.freeze(Object.fromEntries(manifest.references.filter(entry => entry.mode === 'REUSE').map(entry => [entry.referenceId, {
  prompts: [...new Set([entry.source, ...entry.alsoCovers].map(source => source.summary))], keywords: keywords[entry.referenceId],
}])));
