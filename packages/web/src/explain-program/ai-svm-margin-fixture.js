import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const svmMarginFixture = {
  id: 'fixture-ai-svm-margin',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'SVM Margin Explorer',
    summary: 'A soft-margin support vector machine trades a wider margin against penalties for points inside the margin or on the wrong side.',
    description: 'Eight fixed class labels surround a vertical decision boundary at x = 0. The shaded margin band changes width with C, and rings mark the points that violate their class margin.',
    cardDescription: 'C sets how much the SVM penalizes margin violations. A larger C can narrow the margin and leave fewer violations. The two wrong-side labels in this example still count as violations.',
    instructions: 'Compare C = 0.05 with C = 5. Watch the shaded band narrow and the rings disappear from correctly classified points.',
    assumptions: [
      'The classifier uses only the horizontal feature x. Vertical positions separate the points visually. Opposite (x, class) pairs admit a zero intercept by symmetry.',
      'The fit minimizes ½w² plus C times total hinge loss. Each point contributes max(0, 1 − class × w × x).',
    ],
    capabilities: ['select_inputs'],
    inputs: [{ id: 'c', label: 'Violation penalty C', type: 'select', default: '0.05', options: [
      { value: '0.05', label: '0.05' }, { value: '0.3', label: '0.3' },
      { value: '1', label: '1' }, { value: '5', label: '5' },
    ] }],
    readouts: [
      { id: 'marginWidth', label: 'Margin width', decimals: 2 },
      { id: 'violations', label: 'Margin violations', decimals: 0 },
      { id: 'misclassified', label: 'Misclassified', decimals: 0 },
    ],
  },
  source: `
const points = [2, 1, 0.5, -0.25].flatMap((x, row) => [
  { id: row + '-positive', x, label: 1, row },
  { id: row + '-negative', x: -x, label: -1, row },
]);

function fitWeight(c, signedXs) {
  // Minimize 0.5*w² + C*sum(max(0, 1 - w*y*x)). The paired data make
  // the loss even and convex in the intercept, so b=0 is optimal.
  const kinks = [...new Set(signedXs.map(z => 1 / z))].sort((a, b) => a - b);
  const bounds = [-Infinity, ...kinks, Infinity];
  const candidates = [...kinks];
  // Between consecutive hinge kinks the active points are fixed, so
  // the only possible interior minimizer is w = C*sum(active y*x).
  for (let i = 1; i < bounds.length; i++) {
    const lo = bounds[i - 1], hi = bounds[i];
    const probe = lo === -Infinity ? hi - 1 : hi === Infinity ? lo + 1 : (lo + hi) / 2;
    const w = c * signedXs.reduce((sum, z) => sum + (probe * z < 1 ? z : 0), 0);
    if (w > lo && w < hi) candidates.push(w);
  }
  const objective = w => 0.5 * w * w + c * signedXs.reduce((loss, z) => loss + Math.max(0, 1 - w * z), 0);
  return candidates.reduce((best, w) => objective(w) < objective(best) ? w : best);
}

export function evaluate({ inputs }) {
  const signedXs = points.map(point => point.x * point.label);
  const w = fitWeight(Number(inputs.c), signedXs);
  const signedScores = signedXs.map(z => w * z);
  const halfWidth = 1 / Math.abs(w);
  const width = 2 * halfWidth;
  const violations = signedScores.filter(score => score < 1).length;
  const misclassified = signedScores.filter(score => score < 0).length;
  const sx = sdk.linear([-4, 4], [28, 476]);
  const left = sx(-halfWidth), right = sx(halfWidth);
  const top = 46, bottom = 230;
  const center = { align: 'middle' };
  const margin = { role: 'prediction' };
  const band = { ...margin, opacity: 0.32 };

  const objects = [
    sdk.box('margin-band', left, top, right - left, bottom - top, band),
    sdk.line('margin-negative', left, top, left, bottom, margin),
    sdk.line('margin-positive', right, top, right, bottom, margin),
    sdk.line('decision-boundary', sx(0), top, sx(0), bottom),
    sdk.text('boundary-label', sx(0), 32, 'Decision boundary', center),
    sdk.line('feature-axis', sx(-4), bottom, sx(4), bottom),
    ...[-4, -2, 0, 2, 4].flatMap(x => [
      sdk.line('tick-' + x, sx(x), bottom, sx(x), bottom + 5),
      sdk.text('tick-label-' + x, sx(x), bottom + 22, String(x), center),
    ]),
    sdk.text('feature-label', sx(0), 278, 'Feature x', center),
    ...points.flatMap(({ id, x, label, row }, index) => {
      const px = sx(x), py = 72 + 43 * row;
      return [
        ...(signedScores[index] < 1 ? [sdk.circle('violation-' + id, px, py, 26, { role: 'warning' })] : []),
        sdk.circle('point-' + id, px, py, 20, { role: label === 1 ? 'learner' : 'observed', text: label === 1 ? '+' : '−' }),
      ];
    }),
    ...sdk.readout('marginWidth', { x: 500, y: 46, w: 200, h: 38, label: 'Margin width', value: width, role: 'prediction' }),
    ...sdk.readout('violations', { x: 500, y: 94, w: 200, h: 38, label: 'Margin violations', value: violations, decimals: 0, role: 'warning' }),
    ...sdk.readout('misclassified', { x: 500, y: 142, w: 200, h: 38, label: 'Misclassified', value: misclassified, decimals: 0 }),
    sdk.circle('violation-key-ring', 512, 205, 19, { role: 'warning' }),
    sdk.circle('violation-key-dot', 512, 205, 12, { role: 'observed' }),
    sdk.text('violation-key', 529, 210, 'Margin violation'),
    sdk.box('margin-key-swatch', 503, 226, 18, 14, band),
    sdk.text('margin-key', 529, 238, 'Margin band'),
  ];
  const readouts = [{ id: 'marginWidth', value: width }, { id: 'violations', value: violations }, { id: 'misclassified', value: misclassified }];
  return { frame: sdk.frame(objects, { width: 720, height: 292, readouts }) };
}`,
};
