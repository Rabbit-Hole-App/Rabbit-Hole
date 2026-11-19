import manifest from './topic-attention-sources.json' with { type: 'json' };
export const overlays = Object.freeze(Object.fromEntries(manifest.references.filter(row => row.mode === 'REUSE').map(row => [row.referenceId, {
  prompts: [row.source.summary, ...row.alsoCovers.map(source => source.summary)], keywords: ['fixed chunk mean', 'uniform chunk pooling'],
}])));
