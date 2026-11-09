// Illustrative Lesson 17 examples for the written Explanation author.
export const references = [
  {
    id: 'ml-minority-accuracy-trap', lessons: ['17'],
    prompts: ['How can a classifier get 95% accuracy and still miss every minority case?'],
    keywords: ['accuracy trap', 'high accuracy', 'minority recall', 'missed minority class', 'miss every minority', 'majority-only classifier'],
    useWhen: 'Show a majority-only classifier on an imbalanced test set. Compute overall accuracy and minority recall from the same actual and predicted counts.',
    spec: { version: 1, diagram: {
      kind: 'comparison', variant: 'panels', title: '95% accuracy, 0% minority recall',
      panels: [
        { heading: 'Count the predictions', diagram: {
          kind: 'heatmap', title: 'All cases predicted majority', rowLabel: 'Actual', columnLabel: 'Predicted',
          columns: ['Majority', 'Minority'],
          rows: [{ label: 'Majority', cells: [95, 0] }, { label: 'Minority', cells: [5, 0] }],
          range: { min: 0, max: 100 }, highlights: [{ row: 1, column: 0 }],
          caption: 'The outline marks 5 minority misses.',
        } },
        { heading: 'Calculate each rate', diagram: {
          kind: 'matrix', layout: 'teaching', title: 'Rates from the same 100 cases',
          columns: ['Fraction', 'Percent'],
          rows: [
            { id: 'accuracy', heading: 'Accuracy', cells: ['95/100', '95%'] },
            { id: 'minority-recall', heading: 'Minority recall', cells: ['0/5', '0%'] },
          ],
          emphasis: { cells: [{ row: 'minority-recall', column: 1 }] },
          caption: 'Accuracy uses all 100 cases. Recall uses the 5 actual minority cases.',
        } },
      ],
    } },
  },
  {
    id: 'ml-majority-undersampling', lessons: ['17'],
    prompts: ['What does majority undersampling actually remove from the training set?'],
    keywords: ['undersampling', 'majority undersampling', 'dropping majority examples', 'drop majority examples', 'removing majority rows'],
    useWhen: 'Show undersampling on training rows. Keep every minority row and a subset of majority rows, and identify the exact rows dropped.',
    spec: { version: 1, diagram: {
      kind: 'sample-set', title: 'Before undersampling · 6 majority, 2 minority',
      samples: [
        { id: 'A1', class: 'Majority' }, { id: 'A2', class: 'Majority' }, { id: 'A3', class: 'Majority' },
        { id: 'A4', class: 'Majority' }, { id: 'A5', class: 'Majority' }, { id: 'A6', class: 'Majority' },
        { id: 'B1', class: 'Minority' }, { id: 'B2', class: 'Minority' },
      ],
      groups: [{
        id: 'retained', label: 'After · 2 majority, 2 minority',
        members: ['A2', 'A5', 'B1', 'B2'], omitted: ['A1', 'A3', 'A4', 'A6'],
      }],
      caption: 'Training keeps A2 and A5 (majority) plus both minority rows.',
    } },
  },
];
