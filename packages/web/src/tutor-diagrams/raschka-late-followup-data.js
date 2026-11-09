export const contextLimits = [10_000, 30_000];
export const localLayersPerGlobal = 3;
export const localWindow = 384;
export const experts = { shared: 1, available: 6, selected: 2 };
export const macroblockLengths = [2, 5, 3];
export const routedLayers = 4;
export const residualGain = layer => 1 / Math.sqrt(layer);
export const scoreCap = 4;
export const cappedScores = [-12, -4, 0, 4, 12]
  .map(x => ({ x, y: Number((scoreCap * Math.tanh(x / scoreCap)).toFixed(2)) }));
