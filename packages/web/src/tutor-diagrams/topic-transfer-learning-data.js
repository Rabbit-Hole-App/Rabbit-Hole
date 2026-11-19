// Modality-specific structural paths. Feature names show shape, not learned values.
export const modalities = Object.freeze([
  { id: 'text', name: 'Text', input: 'Short note', extractor: 'Text encoder', features: ['t1', 't2'], head: 'Text task head' },
  { id: 'image', name: 'Image', input: 'Small image', extractor: 'Visual backbone', features: ['v1', 'v2', 'v3'], head: 'Image task head' },
]);
export function derived() {
  return { modalities: modalities.map(row => ({ ...row, featureCount: row.features.length })),
    counts: { modalities: modalities.length, stages: ['Input', 'Encoder', 'Features', 'Head'].length } };
}
