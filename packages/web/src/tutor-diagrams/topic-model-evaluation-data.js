// C02 records illustrative predictions, not the output of an optimizer simulation.
export const trainingRows = Object.freeze([
  { id: 'T1', x: [-2], target: 0 }, { id: 'T2', x: [-1], target: 0 },
  { id: 'T3', x: [1], target: 1 }, { id: 'T4', x: [2], target: 1 },
]);
export const heldoutRows = Object.freeze([
  { id: 'H1', x: [-1.5], target: 0 }, { id: 'H2', x: [-.5], target: 0 },
  { id: 'H3', x: [.5], target: 1 }, { id: 'H4', x: [1.5], target: 1 },
]);
export const parameters = Object.freeze({ threshold: .5, learningRate: .1, precision: 3 });
// Each entry gives p(class one), in observation order, at one recorded epoch.
export const predictionHistories = Object.freeze({
  dropout: {
    training: [[.4, .6, .4, .6], [.3, .45, .6, .7], [.25, .35, .65, .75], [.2, .3, .7, .8]],
    heldout: [[.4, .6, .4, .6], [.3, .55, .6, .7], [.25, .4, .6, .75], [.22, .32, .68, .78]],
  },
  fixedRate: {
    training: [[.4, .6, .4, .6], [.35, .55, .6, .65], [.25, .45, .7, .75], [.15, .3, .8, .85]],
    heldout: [[.4, .6, .4, .6], [.35, .55, .6, .65], [.3, .6, .65, .7], [.25, .65, .7, .75]],
  },
});

const sum = values => values.reduce((total, value) => total + value, 0);
const shown = value => Number(value.toFixed(parameters.precision));
const bce = (p, y) => -(y * Math.log(p) + (1 - y) * Math.log1p(-p));
const classify = p => Number(p >= parameters.threshold);
function metrics(probabilities, rows, epoch) {
  const losses = probabilities.map((p, i) => bce(p, rows[i].target));
  const correct = probabilities.filter((p, i) => classify(p) === rows[i].target).length;
  const loss = sum(losses) / rows.length;
  return { epoch, losses, loss, lossShown: shown(loss), correct, accuracy: correct / rows.length, percent: correct / rows.length * 100 };
}
function check(rows, history, selectedRow, epochs) {
  const { id, target } = rows[selectedRow];
  const probabilities = epochs.map(epoch => history[epoch - 1][selectedRow]);
  const classes = probabilities.map(classify);
  const losses = probabilities.map(p => bce(p, target));
  return { id, target, epochs, probabilities, classes, losses, lossesShown: losses.map(shown), correct: classes.map(value => Number(value === target)) };
}

export function derived() {
  const epochs = predictionHistories.dropout.training.map((_, i) => i + 1);
  const run = histories => {
    const training = histories.training.map((probabilities, i) => metrics(probabilities, trainingRows, epochs[i]));
    const heldout = histories.heldout.map((probabilities, i) => metrics(probabilities, heldoutRows, epochs[i]));
    return { training, heldout, accuracyGap: training.map((row, i) => row.percent - heldout[i].percent) };
  };
  const dropout = run(predictionHistories.dropout);
  dropout.check = check(heldoutRows, predictionHistories.dropout.heldout, 1, epochs.slice(-2));
  const fixedRate = run(predictionHistories.fixedRate);
  fixedRate.rates = epochs.map(() => parameters.learningRate);
  fixedRate.check = [check(trainingRows, predictionHistories.fixedRate.training, 1, epochs.slice(1, 3)), check(heldoutRows, predictionHistories.fixedRate.heldout, 1, epochs.slice(1, 3))];
  fixedRate.gapIncrease = fixedRate.accuracyGap[2] - fixedRate.accuracyGap[1];
  return { parameters, epochs, counts: { examples: trainingRows.length + heldoutRows.length, features: trainingRows[0].x.length, training: trainingRows.length, heldout: heldoutRows.length, epochs: epochs.length }, dropout, fixedRate };
}
