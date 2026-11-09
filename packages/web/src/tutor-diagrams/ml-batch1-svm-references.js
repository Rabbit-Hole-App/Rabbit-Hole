// Fixed teaching data for lesson 05. These examples reuse semantic plots and
// compositions; the shared renderer owns geometry, symbols and teaching colors.
const axis = (label, min, max) => ({ label, min, max, scale: 'linear' });
const series = (label, points) => ({ label, kind: 'scatter',
  points: points.map(([id, x, y = 0]) => ({ id, x, y })) });
const line = (axis, value, label) => ({ kind: 'reference-line', axis, value, label });

const svmPlot = (title, margin, caption) => ({
  kind: 'coordinate-plot', title,
  x: axis('Feature $x$', -5, 5), y: axis('Display only (all 0)', -1, 1),
  series: [
    series('Class −1: −2, −1, 0.5', [['neg2', -2], ['neg1', -1], ['flippedNeg', 0.5]]),
    series('Class +1: −0.5, 1, 2', [['flippedPos', -0.5], ['pos1', 1], ['pos2', 2]]),
  ],
  annotations: [
    line('x', 0, 'Decision: $wx + b = 0$'),
    line('x', -margin, 'Margin: $wx + b = -1$'),
    line('x', margin, 'Margin: $wx + b = +1$'),
  ],
  caption,
});
const mappedPlot = (title, mapped) => ({
  kind: 'coordinate-plot', title,
  x: axis('Feature $x$', -2.5, 2.5),
  y: mapped ? axis('Feature $x^2$', 0, 5) : axis('Display only (all 0)', -1, 1),
  series: [
    series('Class A: −2, 2', [['outerLeft', -2, mapped ? 4 : 0], ['outerRight', 2, mapped ? 4 : 0]]),
    series('Class B: −1, 1', [['innerLeft', -1, mapped ? 1 : 0], ['innerRight', 1, mapped ? 1 : 0]]),
  ],
  ...(mapped ? { annotations: [line('y', 2.5, 'Linear separator')], caption: 'Class A has height 4; class B has height 1.' } : {}),
});

export const references = [
  {
    id: 'ml-svm-c-tradeoff', lessons: ['05'],
    prompts: ['What changes when I increase C in an SVM?'],
    keywords: ['svm c', 'increase c', 'c parameter', 'c penalty', 'regularization parameter c', 'soft margin', 'margin tradeoff', 'hinge loss'],
    useWhen: 'Compare exact soft-margin SVM optima on the same six samples. C weights the sum of hinge losses; classification need not improve.',
    spec: { version: 1, diagram: {
      kind: 'comparison', variant: 'panels', title: 'C trades margin width for hinge loss',
      sharedAxes: ['x', 'y'],
      panels: [
        { heading: '$C = 0.05$', diagram: svmPlot('$C = 0.05$', 4,
          '$w = 0.25$; $b = 0$; hinge sum = 4.75; objective = 0.26875.') },
        { heading: '$C = 2$', diagram: svmPlot('$C = 2$', 1,
          '$w = 1$; $b = 0$; hinge sum = 3; objective = 6.5.') },
      ],
      caption: 'Toy objective: $0.5w^2+C\\sum_i\\max(0,1-y_iwx_i)$. Larger C reduces hinge loss here; both fits misclassify 2 of 6.',
    } },
  },
  {
    id: 'ml-svm-feature-map', lessons: ['05'],
    prompts: ['Why can a nonlinear feature map help an SVM separate classes?'],
    keywords: ['svm feature map', 'nonlinear feature map', 'quadratic feature map', 'kernel transform', 'higher dimensional space', 'feature space', 'linear separability', 'kernel intuition'],
    useWhen: 'Show an explicit quadratic feature map that makes four samples linearly separable while preserving sample identities and classes.',
    spec: { version: 1, diagram: {
      kind: 'transformation', variant: 'visual', title: 'A new feature makes separation possible',
      operation: '$\\phi(x) = (x, x^2)$',
      before: { label: 'Original feature', diagram: mappedPlot('Original feature', false) },
      after: { label: 'Mapped features', diagram: mappedPlot('Mapped features', true) },
      identity: { mode: 'preserved', note: 'The same four IDs and class labels remain. $x$ stays fixed; $x^2$ becomes the second feature.' },
      caption: 'No single threshold separates A–B–B–A in $x$. After this explicit map, $x^2 = 2.5$ separates the classes.',
    } },
  },
];
