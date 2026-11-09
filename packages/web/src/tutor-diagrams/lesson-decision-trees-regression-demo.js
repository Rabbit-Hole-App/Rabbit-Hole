const start = 0;
const step = 2;
const count = 25;
const end = start + (count - 1) * step;
const divisor = 1000;
// Canonicalize signed zero so object and compact JSON specs agree.
const round = value => Math.round(value) || 0;
const targets = Array.from({ length: count }, (_, i) => round(Math.sin((start + i * step) * Math.PI / 24) * divisor));
const sum = (start, end) => targets.slice(start, end).reduce((total, value) => total + value, 0);

function bestCut(leaves, maxDepth) {
  let best;
  for (const [index, { start, end, depth }] of leaves.entries()) {
    if (depth === maxDepth) continue;
    const total = sum(start, end);
    let left = 0;
    for (let cut = start + 1; cut < end; cut++) {
      left += targets[cut - 1];
      const leftCount = cut - start;
      const rightCount = end - cut;
      // Squared-error reduction equals nL*nR/n times the squared difference of means.
      const numerator = (left * rightCount - (total - left) * leftCount) ** 2;
      const denominator = (end - start) * leftCount * rightCount;
      if (numerator > 0 && (!best || numerator * best.denominator > best.numerator * denominator)) {
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
  return { x: [...x, end], y: [...y, y.at(-1)], divisor };
}

const shallow = fittedSteps(2, 4);
const deep = fittedSteps(5, 16);

export const lessonDecisionTreesRegressionDemo = {
  name: 'regression-step-fit',
  prompt: 'how does a regression tree fit y = sin(x) with a step function at depth 2 versus depth 5?',
  paraphrase: 'Why does a deeper regression tree approximate a sine wave with more steps?',
  keywords: ['regression tree', 'step function', 'variance reduction'],
  useWhen: 'Compare regression tree depth on a sine target. Each leaf predicts the mean of its own samples.',
  diagramAt(depth) {
    return {
      kind: 'coordinate-plot', title: 'Sine step fits',
      x: { label: 'Angle (7.5° units)', min: start, max: end },
      y: { label: 'Target', min: -1, max: 1 },
      series: [
        { label: 'Sine samples', kind: 'line', samples: { x: { start, step }, y: targets, divisor } },
        { label: 'Depth 2', kind: 'step', samples: { ...shallow, ...(depth === 'deep' ? { showValues: true } : {}) } },
        { label: 'Depth 5', kind: 'step', samples: deep },
      ],
      caption: depth === 'deep' ? 'Worked example. Labels show rounded depth 2 means.' :
        depth === 'overview' ? 'Worked example. Each step predicts one leaf mean.' :
          `Worked example. ${shallow.x.length - 1} leaves versus ${deep.x.length - 1}.`,
    };
  },
};
