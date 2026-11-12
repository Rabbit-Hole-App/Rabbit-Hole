const start = 0;
const step = 15;
const count = 25;
const end = start + (count - 1) * step;
const divisor = 1000;
// Canonicalize signed zero so object and compact JSON specs agree.
const round = value => Math.round(value) || 0;
const targets = Array.from({ length: count }, (_, i) => round(Math.sin((start + i * step) * Math.PI / 180) * divisor));
const sum = (start, end) => targets.slice(start, end).reduce((total, value) => total + value, 0);

function bestCut(leaves, maxDepth) {
  let best;
  for (const [index, { start, end, depth }] of leaves.entries()) {
    if (depth === maxDepth) continue;
    const total = sum(start, end);
    // Reserve one sample for each leaf in both remaining subtrees.
    const minimumChildSize = 2 ** (maxDepth - depth - 1);
    const firstCut = start + minimumChildSize;
    let left = sum(start, firstCut - 1);
    for (let cut = firstCut; cut <= end - minimumChildSize; cut++) {
      left += targets[cut - 1];
      const leftCount = cut - start;
      const rightCount = end - cut;
      // Squared-error reduction equals nL*nR/n times the squared difference of means.
      const numerator = (left * rightCount - (total - left) * leftCount) ** 2;
      const denominator = (end - start) * leftCount * rightCount;
      if (!best || numerator * best.denominator > best.numerator * denominator) {
        best = { index, cut, numerator, denominator };
      }
    }
  }
  return best;
}

function fittedSteps(maxDepth, maxLeaves) {
  const leaves = [{ start: 0, end: count, depth: 0 }];
  while (leaves.length < maxLeaves) {
    const split = bestCut(leaves, maxDepth);
    if (!split) break;
    const { index, cut } = split;
    const leaf = leaves[index];
    const depth = leaf.depth + 1;
    leaves.splice(index, 1, { start: leaf.start, end: cut, depth }, { start: cut, end: leaf.end, depth });
  }
  const x = leaves.map(leaf => leaf.start === 0 ? start : start + (leaf.start - 0.5) * step);
  const y = leaves.map(leaf => round(sum(leaf.start, leaf.end) / (leaf.end - leaf.start)));
  // Midpoints fall at half degrees. Store their integer numerators for compact JSON.
  return { x: { values: [...x, end].map(value => 2 * value), divisor: 2 }, y: [...y, y.at(-1)], divisor };
}

const shallow = fittedSteps(2, 4);
const deep = fittedSteps(4, 16);
const comparison = `${shallow.y.length - 1} leaves versus ${deep.y.length - 1}`;

export const lessonDecisionTreesRegressionDemo = {
  name: 'regression-step-fit',
  prompt: 'how does a regression tree fit y = sin(x) with a step function at depth 2 versus depth 4?',
  paraphrase: 'Why does a deeper regression tree approximate a sine wave with more steps?',
  additionalPrompts: ['how does a regression tree fit y = sin(x) with a step function at depth 2 versus depth 5?'],
  keywords: ['regression tree', 'step function', 'variance reduction'],
  useWhen: 'Compare regression tree depth on a sine target. Each leaf predicts the mean of its own samples.',
  diagramAt(depth) {
    return {
      kind: 'coordinate-plot', title: 'Sine fits',
      x: { label: 'Angle (degrees)', min: start, max: end },
      y: { label: 'Target', min: -1, max: 1 },
      series: [
        { label: 'Sine', kind: 'line', samples: { x: { start, step }, y: targets, divisor } },
        { label: 'Depth 2', kind: 'step', samples: { ...shallow, ...(depth === 'deep' ? { showValues: true } : {}) } },
        { label: 'Depth 4', kind: 'step', samples: deep },
      ],
      caption: `Worked example. ${comparison}${depth === 'standard' ? '. Same samples.' : ''}`,
    };
  },
};
