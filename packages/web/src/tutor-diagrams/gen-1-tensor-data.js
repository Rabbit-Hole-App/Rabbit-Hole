function tensorFromRows(grid) {
  const rows = grid.length;
  const columns = grid[0].length;
  return { rows, columns, dimensions: `${rows} × ${columns}`, values: grid.flat() };
}

const sampleCodes = [[0, 3, -1, -2], [2, -2, 1, 0]];
const millivoltsPerCode = 10;
const samplesPerSecond = 8_000;
const sampleIntervalUs = 1_000_000 / samplesPerSecond;
const stereoTensor = tensorFromRows(sampleCodes.map(channel => channel.map(code => code * millivoltsPerCode)));
export const stereoFrame = {
  tensor: stereoTensor,
  sampleIntervalUs,
  frameSpanUs: (stereoTensor.columns - 1) * sampleIntervalUs,
};

const oatsGrams = 15;
const raisinsGrams = 8;
const scales = [1, 2, 3];
const ingredientWeights = scales.map(scale => [oatsGrams * scale, raisinsGrams * scale]);
export const granolaBatches = {
  tensor: tensorFromRows(ingredientWeights),
  scales,
  oatsGrams,
  raisinsGrams,
  largestBatchGrams: ingredientWeights.at(-1).reduce((sum, grams) => sum + grams, 0),
};

const sheetsByJob = [3, 5, 2, 4];
const pagesPerSheet = 2 * 2;
const totalSheets = sheetsByJob.reduce((sum, sheets) => sum + sheets, 0);
export const bookletJobs = {
  tensor: tensorFromRows(sheetsByJob.map(sheets => [sheets * pagesPerSheet])),
  pagesPerSheet,
  totalSheets,
  totalPages: totalSheets * pagesPerSheet,
};
