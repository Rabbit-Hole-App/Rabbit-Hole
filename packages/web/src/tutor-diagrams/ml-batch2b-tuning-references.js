// Illustrative Lesson 12 data. The shared teaching matrix owns the layout.
export const references = [
  {
    id: 'ml-bayesian-acquisition-choice', lessons: ['12'],
    prompts: ['How does Bayesian optimization decide which setting to try next?'],
    keywords: ['bayesian optimization', 'acquisition score', 'upper confidence bound', 'ucb', 'less certain', 'hyperparameter setting', 'surrogate mean'],
    useWhen: 'Compare identifiable hyperparameter candidates under one acquisition rule. Show the surrogate mean, uncertainty bonus and resulting score, then select the candidate with the highest score.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'How UCB picks the next trial',
      columns: [String.raw`$\mu,\sigma$`, 'UCB'],
      rows: [
        { id: 'a', heading: 'A · $d=2$', cells: ['$0.70,0.02$', '0.72'] },
        { id: 'b', heading: 'B · $d=4$', cells: ['$0.76,0.02$', '0.78'] },
        { id: 'c', heading: 'C · $d=6$', cells: ['$0.73,0.10$', '0.83'] },
        { id: 'd', heading: 'D · $d=8$', cells: ['$0.68,0.08$', '0.76'] },
      ],
      emphasis: { cells: [{ row: 'c', column: 1 }] },
      caption: String.raw`Toy tree depths $d$. The upper confidence bound adds one standard deviation $\sigma$ to predicted mean $\mu$. B has the best mean. Try C next.`,
    } },
  },
  {
    id: 'ml-successive-halving-rounds', lessons: ['12'],
    prompts: ['How does successive halving decide which trials get more training?'],
    keywords: ['successive halving', 'early trial scores', 'larger budget', 'cumulative budget', 'training budget', 'advance trials'],
    useWhen: 'Rank trials at each cumulative training budget using the same held-out metric. Show which trials advance or stop and count only additional training when resuming survivors.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'Successive halving keeps top trials',
      columns: ['Accuracy', 'Decision'],
      rows: [
        { id: 'a-1', heading: 'A · 1 ep', cells: ['0.72', 'Advance'] },
        { id: 'b-1', heading: 'B · 1 ep', cells: ['0.69', 'Stop'] },
        { id: 'c-1', heading: 'C · 1 ep', cells: ['0.75', 'Advance'] },
        { id: 'd-1', heading: 'D · 1 ep', cells: ['0.60', 'Stop'] },
        { id: 'a-2', heading: 'A · 2 ep', cells: ['0.80', 'Advance'] },
        { id: 'c-2', heading: 'C · 2 ep', cells: ['0.78', 'Stop'] },
        { id: 'a-4', heading: 'A · 4 ep', cells: ['0.85', 'Winner'] },
      ],
      emphasis: { cells: [
        { row: 'a-1', column: 1 }, { row: 'c-1', column: 1 }, { row: 'a-2', column: 1 }, { row: 'a-4', column: 1 },
      ] },
      caption: 'Toy held-out accuracy. Keep the top half. Epochs are cumulative. Total spend when resuming is $4 + 2 + 2 = 8$ trial-epochs.',
    } },
  },
];
