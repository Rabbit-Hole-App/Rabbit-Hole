const higherIntercept = 6 + Math.log(3);

export const references = [
  {
    id: 'ml-logistic-decision-boundary',
    lessons: ['03'],
    prompts: ['Why does logistic regression draw a straight line between the classes?'],
    keywords: ['logistic regression boundary', 'logistic regression decision boundary', 'logistic decision boundary', 'cutoff in logistic regression'],
    useWhen: 'The increasing sigmoid turns each probability cutoff into one linear score level, which traces a straight line in this feature space. The 50% cutoff fixes the score at 0. The 75% cutoff fixes it at ln(3). Keep the same probe to show how raising the cutoff changes its predicted class.',
    spec: {
      version: 1,
      diagram: {
        kind: 'coordinate-plot', title: 'Logistic cutoffs in feature space',
        x: { label: 'Hours studied', min: 0, max: 8 },
        y: { label: 'Practice quizzes', min: 0, max: 8 },
        series: [
          { kind: 'line', label: '50% cutoff · $x+y=6$', points: [{ x: 0, y: 6 }, { x: 6, y: 0 }] },
          {
            kind: 'line', label: String.raw`75% cutoff · $x+y=6+\ln 3$`,
            points: [{ x: 0, y: higherIntercept }, { x: higherIntercept, y: 0 }],
          },
          {
            kind: 'scatter', label: 'Other feature pairs',
            points: [{ x: 1.5, y: 1 }, { x: 3.5, y: 1.5 }, { x: 2.5, y: 5.5 }, { x: 6, y: 4 }, { x: 7, y: 6.5 }],
          },
        ],
        annotations: [
          { kind: 'point', x: 3.5, y: 3, label: String.raw`$p\approx62.2\%$ · Pass at 50% · Not pass at 75%` },
        ],
        caption: 'The sigmoid maps $s=x+y-6$ to $p$. Predict Pass on or above each line. A higher cutoff shifts the line up and right.',
      },
    },
  },
];
