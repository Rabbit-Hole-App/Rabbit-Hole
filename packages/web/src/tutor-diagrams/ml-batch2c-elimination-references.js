export const references = [
  {
    id: 'ml-recursive-feature-elimination', lessons: ['18'],
    prompts: ['Why does recursive feature elimination refit after each drop?'],
    keywords: ['recursive feature elimination', 'rfe', 'refit after each drop', 'feature rankings change', 'weakest input', 'rerank remaining features'],
    useWhen: 'Show the feature ranking at each fit. Drop the lowest-scoring feature, refit the survivors and rank them again. Track feature identities and stop at the requested subset size.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'Recursive feature elimination',
      columns: ['Ranking', 'Decision'],
      rows: [
        { id: 'fit-4', heading: 'Fit 4', cells: ['A:0.80, B:0.60, C:0.30, D:0.10', 'Drop D'] },
        { id: 'refit-3', heading: 'Refit 3', cells: ['A:0.75, C:0.40, B:0.22', 'Drop B'] },
        { id: 'refit-2', heading: 'Refit 2', cells: ['A:0.77, C:0.45', 'Keep A, C'] },
      ],
      emphasis: { cells: [{ row: 'fit-4', column: 0 }, { row: 'refit-3', column: 0 }, { row: 'refit-2', column: 1 }] },
      caption: 'Illustrative linear model on scaled features. Rank by absolute coefficient. After dropping D, the refit puts C ahead of B. Stop at two.',
    } },
  },
];
