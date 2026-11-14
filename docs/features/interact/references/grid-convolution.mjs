import { fileURLToPath } from 'node:url';
import { writeSubject } from './grid-reference-kit.mjs';

export function buildScene(depth) {
  const data = {
    image: [[0, 0, 1, 1, 1], [0, 1, 2, 2, 1], [1, 2, 4, 2, 1], [1, 2, 2, 1, 0], [1, 1, 1, 0, 0]],
    kernels: [
      { id: 'mean', label: 'Mean', coefficients: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], divisor: 9 },
      { id: 'edge', label: 'Edge', coefficients: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], divisor: 1 },
    ], stride: 1, padding: 0,
  };
  const kernelSize = data.kernels[0].coefficients.length;
  return {
    subject: 'convolution', depth, data, height: 370, readoutY: 310,
    prompt: `${kernelSize}×${kernelSize} convolution on a small image`,
    title: 'One patch becomes one output.',
    concept: depth === 'brief' ? 'Multiply a patch by the kernel, then add its products.' : depth === 'balanced' ? 'The same patch can smooth an image or respond to an edge.' : 'Cross-correlation keeps the kernel’s orientation as it slides.',
    instructions: depth === 'brief' ? 'Move Patch and follow the blue image patch to its output.' : 'Move Patch, then compare the Mean and Edge kernels.',
    heading: 'Toy image cross-correlation', indexLabel: 'Patch',
    parameter: depth === 'brief' ? null : { label: 'Kernel', default: data.kernels[0].id, options: data.kernels.map(k => ({ id: k.id, label: k.label })) },
  };
}

export function createModel(scene) {
  const { data, depth } = scene, size = data.kernels[0].coefficients.length;
  const outputRows = Math.floor((data.image.length + 2 * data.padding - size) / data.stride) + 1;
  const outputColumns = Math.floor((data.image[0].length + 2 * data.padding - size) / data.stride) + 1;
  const length = outputRows * outputColumns, allowed = depth === 'brief' ? data.kernels.slice(0, 1) : data.kernels;
  const defaults = () => ({ index: 0, option: allowed[0].id });
  const coerce = (input = {}) => {
    const value = Number(input.index);
    return { index: Number.isFinite(value) ? Math.max(0, Math.min(length - 1, Math.round(value))) : 0,
      option: allowed.some(k => k.id === input.option) ? input.option : allowed[0].id };
  };
  const fixed = (value, places = 3) => (Math.abs(value) < 0.5 * 10 ** -places ? 0 : value).toFixed(places).replace('-', '−');
  const at = (index, kernel) => {
    const row = Math.floor(index / outputColumns), column = index % outputColumns;
    const patch = kernel.coefficients.map((values, i) => values.map((unused, j) => data.image[row * data.stride + i][column * data.stride + j]));
    // CNN convention: cross-correlation. The kernel is deliberately NOT reversed.
    const numerators = patch.map((values, i) => values.map((value, j) => value * kernel.coefficients[i][j]));
    const products = numerators.map(values => values.map(value => value / kernel.divisor));
    const rowNumerators = numerators.map(values => values.reduce((sum, value) => sum + value, 0));
    const numerator = rowNumerators.reduce((sum, value) => sum + value, 0), value = numerator / kernel.divisor;
    return { row, column, patch, numerators, products, rowNumerators, numerator, value };
  };
  const output = kernel => Array.from({ length: outputRows }, (unused, row) => Array.from({ length: outputColumns }, (unused, column) => at(row * outputColumns + column, kernel).value));
  const frame = input => {
    const inputs = coerce(input), kernel = allowed.find(k => k.id === inputs.option), selected = at(inputs.index, kernel);
    const otherKernel = data.kernels.find(k => k.id !== kernel.id), other = at(inputs.index, otherKernel), outputs = output(kernel);
    const row = selected.row + 1, column = selected.column + 1;
    const productLabels = selected.numerators.map(values => values.map(value => kernel.divisor === 1 ? String(value).replace('-', '−') : `${value}/${kernel.divisor}`));
    const formula = kernel.divisor === 1 ? `y = ${selected.rowNumerators.join(' + ').replaceAll('+ -', '− ')}` : `y = (${selected.rowNumerators.join(' + ')}) / ${kernel.divisor}`;
    const kernelWeight = kernel.coefficients.flat().reduce((sum, value) => sum + value, 0) / kernel.divisor;
    return { inputs, kernel, kernelWeight, ...selected, outputs, other, otherKernel, productLabels, formula,
      state: `Output (${row}, ${column})`, selectionLabel: `Output row ${row}, column ${column}`,
      callout: { title: `Patch (${row}, ${column})`, sentence: 'The blue image patch feeds the blue output cell.' },
      readouts: [{ id: 'kernel-weight', label: 'Kernel total weight', value: fixed(kernelWeight) }, ...(depth === 'brief' ? [{ id: 'pixels', label: 'Patch pixels sum', value: String(selected.patch.flat().reduce((sum, value) => sum + value, 0)) }] : [{ id: 'comparison', label: `${otherKernel.label} · same patch`, value: fixed(other.value), compare: true }])],
      description: `The ${data.image.length} by ${data.image[0].length} toy image uses a ${size} by ${size} ${kernel.label} kernel. Valid cross-correlation, stride ${data.stride}, padding ${data.padding}, no bias and no kernel reversal produce a ${outputRows} by ${outputColumns} output. Selected output row ${row}, column ${column} uses patch ${selected.patch.flat().join(', ')}, products ${selected.products.flat().map(v => fixed(v)).join(', ')}, and sum ${fixed(selected.value)}.`,
    };
  };
  return { depth, data, size, outputRows, outputColumns, length, defaults, coerce, at, output, frame, fixed };
}

export function drawPicture(frame, model, scene, R) {
  const size = 34, outputGap = 4, imageX = 20, top = 48, kernelX = 228, outputX = 370, productsY = 190;
  let svg = R.text('image.heading', imageX, 23, `Image ${model.data.image.length}×${model.data.image[0].length}`, { weight: 600 })
    + R.text('kernel.heading', kernelX, 23, `${frame.kernel.label} ${model.size}×${model.size}`, { weight: 600 })
    + R.text('output.heading', outputX, 23, `Output ${model.outputRows}×${model.outputColumns}`, { weight: 600 });
  model.data.image.forEach((values, row) => values.forEach((value, column) => {
    const selected = row >= frame.row && row < frame.row + model.size && column >= frame.column && column < frame.column + model.size;
    svg += R.cell(`image.${row}.${column}`, imageX + column * size, top + row * size, size, size, value, { value, row, column, role: selected ? 'process' : 'plain', size: 14 });
  }));
  svg += `<rect id="patch.selected" x="${imageX + frame.column * size}" y="${top + frame.row * size}" width="${model.size * size}" height="${model.size * size}" rx="9" fill="none" stroke="${R.C.blue}" stroke-width="2.5"/>`;
  frame.kernel.coefficients.forEach((values, row) => values.forEach((value, column) => {
    const label = frame.kernel.divisor === 1 ? String(value).replace('-', '−') : `${value}/${frame.kernel.divisor}`;
    svg += R.cell(`kernel.${row}.${column}`, kernelX + column * size, top + row * size, size, size, label, { value: value / frame.kernel.divisor, row, column, size: 13 });
  }));
  svg += R.text('multiply', 210, 109, '×', { size: 19, anchor: 'middle', color: R.C.muted });
  svg += R.line('output.arrow', [[342, 98], [356, 98]], true);
  svg += R.text('output.arrowhead', 356, 104, '›', { size: 22, color: R.C.blue });
  frame.outputs.forEach((values, row) => values.forEach((value, column) => {
    const selected = row === frame.row && column === frame.column;
    // Every numerical output belongs only to its grid cell. The host readouts
    // own the kernel total weight and the other kernel's distinct output.
    const label = Number.isInteger(value) ? String(value).replace('-', '−') : model.fixed(value, 2);
    svg += R.cell(`output.${row}.${column}`, outputX + column * (size + outputGap), top + row * (size + outputGap), size, size, label, { value, row, column, selected, size: 13 });
  }));
  svg += R.text('products.heading', kernelX, 176, 'Products', { weight: 600 });
  frame.products.forEach((values, row) => values.forEach((value, column) => { svg += R.cell(`product.${row}.${column}`, kernelX + column * size, productsY + row * size, size, size, frame.productLabels[row][column], { value, row, column, size: 13, role: 'process' }); }));
  svg += R.text('convention', 20, 247, 'Valid · no kernel flip', { size: 13, color: R.C.muted });
  svg += R.text('stride', 20, 270, `Stride ${model.data.stride} · padding ${model.data.padding}`, { size: 13, color: R.C.muted });
  if (scene.depth === 'detailed') {
    svg += R.text('formula.label', outputX, 218, `Add ${model.size * model.size} products`, { size: 14, weight: 600 });
    svg += R.text('formula.sum', outputX, 243, frame.formula, { size: 14 });
    svg += R.text('formula.symbolic', outputX, 272, 'y[r,c] = Σᵢⱼ x[r+i,c+j] k[i,j]', { size: 13, color: R.C.muted });
  } else {
    svg += R.paragraph('sum.note', outputX, 218, 'Multiply in place. Add the products for one output.', 24, { size: 14, color: R.C.muted });
  }
  const anchor = [outputX + frame.column * (size + outputGap) + size / 2, top + frame.row * (size + outputGap) + size];
  const spine = outputX + model.outputColumns * (size + outputGap) - outputGap + 6;
  return { svg, anchor, calloutPath: [anchor, [anchor[0], anchor[1] + outputGap / 2], [spine, anchor[1] + outputGap / 2], [spine, top + 20], [492, top + 20]], callout: { x: 492, y: top, width: 128, chars: 15 } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeSubject(buildScene, createModel, drawPicture);
