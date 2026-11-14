import { fileURLToPath } from 'node:url';
import { writeSubject } from './grid-reference-kit.mjs';

export function buildScene(depth) {
  // Each list contains the predictions for the actual class at that row.
  // Counts, denominators, false cells and metrics are computed from these cases.
  const data = { classes: ['Cat', 'Dog', 'Bird'], predictionsByActual: [[0, 0, 0, 0, 0, 0, 0, 1, 1, 2], [0, 1, 1, 1, 1, 2], [1, 1, 2, 2, 2, 2, 2, 2]] };
  return {
    subject: 'confusion-matrix', depth, data, height: 360, readoutY: 300,
    prompt: 'Confusion matrix', title: 'Read mistakes by row and column.',
    concept: depth === 'brief' ? 'Rows are actual classes; columns are predictions. The diagonal is correct.' : depth === 'balanced' ? 'Compare counts with each actual class’s share to reveal different error rates.' : 'A class’s row gives recall; its column gives precision.',
    instructions: depth === 'brief' ? 'Move Cell through the matrix and follow the blue selection.' : depth === 'balanced' ? 'Choose a cell, then switch between Counts and Row %.' : 'Choose a cell. Read precision and recall for its actual class.',
    heading: 'Toy classification results', indexLabel: 'Cell',
    parameter: depth === 'brief' ? null : { label: 'Display', default: 'counts', options: [{ id: 'counts', label: 'Counts' }, { id: 'row-rate', label: 'Row %' }] },
  };
}

export function createModel(scene) {
  const { data, depth } = scene, n = data.classes.length, length = n * n;
  const counts = data.classes.map(() => data.classes.map(() => 0));
  data.predictionsByActual.forEach((predictions, actual) => predictions.forEach(predicted => { counts[actual][predicted]++; }));
  const rowTotals = counts.map(row => row.reduce((sum, value) => sum + value, 0));
  const columnTotals = data.classes.map((unused, j) => counts.reduce((sum, row) => sum + row[j], 0));
  const total = rowTotals.reduce((sum, value) => sum + value, 0), correct = counts.reduce((sum, row, i) => sum + row[i], 0);
  const defaults = () => ({ index: 0, option: 'counts' });
  const coerce = (input = {}) => {
    const value = Number(input.index);
    return { index: Number.isFinite(value) ? Math.max(0, Math.min(length - 1, Math.round(value))) : 0,
      option: depth !== 'brief' && input.option === 'row-rate' ? 'row-rate' : 'counts' };
  };
  const percent = value => `${(value * 100).toFixed(1)}%`;
  const metrics = index => ({ tp: counts[index][index], fn: rowTotals[index] - counts[index][index], fp: columnTotals[index] - counts[index][index], recall: counts[index][index] / rowTotals[index], precision: counts[index][index] / columnTotals[index] });
  const frame = input => {
    const inputs = coerce(input), row = Math.floor(inputs.index / n), column = inputs.index % n, m = metrics(row);
    const label = `${data.classes[row]} → ${data.classes[column]}`, display = inputs.option === 'row-rate' ? counts.map((values, i) => values.map(value => percent(value / rowTotals[i]))) : counts.map(values => values.map(String));
    return { inputs, row, column, count: counts[row][column], display, metrics: m,
      state: label, selectionLabel: `Actual ${data.classes[row]}, predicted ${data.classes[column]}`,
      callout: { title: label, sentence: row === column ? 'On the diagonal: the predicted class matches the actual class.' : 'Off the diagonal: the actual class was predicted as a different class.' },
      readouts: depth === 'detailed' ? [{ id: 'class-counts', label: `FN / FP · ${data.classes[row]}`, value: `${m.fn} / ${m.fp}` }, { id: 'recall', label: `Recall · ${data.classes[row]}`, value: percent(m.recall) }, { id: 'precision', label: `Precision · ${data.classes[row]}`, value: percent(m.precision) }]
        : [{ id: 'correct', label: 'All correct / all cases', value: `${correct} / ${total}` }, { id: 'accuracy', label: 'Overall accuracy', value: percent(correct / total) }],
      description: `Actual classes are rows and predicted classes are columns, in order ${data.classes.join(', ')}. Selected cell ${label} contains ${counts[row][column]} cases out of ${rowTotals[row]} actual ${data.classes[row]} cases. The full toy set contains ${total} cases, ${correct} correct. ${depth === 'detailed' ? `For ${data.classes[row]}, true positives ${m.tp}, false negatives ${m.fn}, false positives ${m.fp}, recall ${percent(m.recall)}, precision ${percent(m.precision)}.` : ''}`,
    };
  };
  return { depth, n, length, data, counts, rowTotals, columnTotals, total, correct, defaults, coerce, metrics, frame, percent };
}

export function drawPicture(frame, model, scene, R) {
  const x = 118, y = 57, width = 78, height = 50, gap = 8;
  let svg = R.text('predicted.heading', x, 19, 'Predicted →', { size: 13, color: R.C.muted })
    + R.text('actual.heading', 20, 43, 'Actual ↓', { size: 13, color: R.C.muted });
  model.data.classes.forEach((name, j) => { svg += R.text(`predicted.${j}.label`, x + j * (width + gap) + width / 2, 43, name, { anchor: 'middle', weight: 600 }); });
  model.counts.forEach((values, row) => {
    svg += R.text(`actual.${row}.label`, 100, y + row * (height + gap) + 31, model.data.classes[row], { anchor: 'end', weight: 600 });
    values.forEach((value, column) => {
      const selected = frame.row === row && frame.column === column;
      const falseForClass = row !== column && (row === frame.row || column === frame.row);
      const role = row === column ? 'outcome' : scene.depth === 'detailed' && falseForClass ? 'decision' : 'plain';
      svg += R.cell(`count.${row}.${column}`, x + column * (width + gap), y + row * (height + gap), width, height, frame.display[row][column], { value: frame.inputs.option === 'row-rate' ? value / model.rowTotals[row] : value, row, column, selected, role, size: frame.inputs.option === 'row-rate' ? 16 : 20 });
    });
  });
  if (scene.depth === 'detailed') {
    svg += R.text('recall.formula', 20, 253, 'Recall = TP / (TP + FN)', { size: 14 });
    svg += R.text('precision.formula', 20, 279, 'Precision = TP / (TP + FP)', { size: 14 });
    svg += R.text('false-cells.legend', 360, 279, 'Warm: class errors', { size: 13, color: R.C.warm });
  } else {
    const note = frame.inputs.option === 'row-rate' ? 'Each row is divided by its actual-class total.' : 'Green diagonal: correct predictions.';
    svg += R.text('display.note', 20, 260, note, { size: 14, color: R.C.muted });
  }
  const anchor = [x + frame.column * (width + gap) + width / 2, y + frame.row * (height + gap) + height];
  const spine = x + model.n * (width + gap) - gap + 12;
  return { svg, anchor, calloutPath: [anchor, [anchor[0], anchor[1] + 4], [spine, anchor[1] + 4], [spine, y + 20], [444, y + 20]], callout: { x: 444, y, width: 176, chars: 21 } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeSubject(buildScene, createModel, drawPicture);
