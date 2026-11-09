export const references = [
  {
    id: 'ml-classification-vs-regression', lessons: ['01'],
    prompts: ["What's the difference between classification and regression?"],
    keywords: ['classification vs regression', 'classification versus regression', 'classification and regression', 'category instead of a number', 'category or number', 'category versus quantity'],
    useWhen: 'Use the same inputs to contrast a category with a numerical quantity. A classifier may estimate a probability before choosing a class.',
    spec: {
      version: 1,
      diagram: {
        kind: 'matrix', layout: 'teaching', title: 'Classification vs. regression',
        columns: ['Class label', 'Numeric value'],
        rows: [
          { id: 'question', heading: 'Question', cells: ['Will it rain?', 'How much rain?'] },
          { id: 'target', heading: 'Target', cells: ['Rain or no rain', 'Rainfall in mm'] },
          { id: 'prediction', heading: 'Output', cells: ['Rain', '12 mm'] },
        ],
        emphasis: { rows: ['prediction'] },
        caption: 'Both predict tomorrow from today’s 18 °C, 82% humidity and falling pressure.',
      },
    },
  },
];
