export function makeSet({ topic, prompts, estUsdPerCard }) {
  if (!Number.isFinite(estUsdPerCard) || estUsdPerCard < 0) throw new Error('Configure bench.estUsdPerCard for bench spend admission');
  return { name: `demo-${topic}`, version: { prompts: 'Topic prompts', labels: 'Intended reference ids and kinds' },
    estUsdPerCard, defaultRuns: 1, defaultDepths: ['standard'], pass: {}, prompts: prompts.map(row => {
    if (!row.referenceId) throw new Error(`Prompt ${row.id} requires an intended reference id`);
    return { id: row.referenceId, n: String(row.id).padStart(2, '0'), group: `demo-${topic}`,
      prompt: row.prompt, referenceId: row.referenceId, referenceKind: row.kind,
      askDepths: ['standard'], needsPicture: false, noPicture: true, badKinds: [], best: [], acceptable: [] };
  }) };
}
