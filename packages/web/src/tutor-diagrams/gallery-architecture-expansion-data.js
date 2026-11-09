// Small original examples for distinguishing late-gallery mechanisms.
const normalize = weights => {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map(weight => weight / total);
};
const softmax = logits => normalize(logits.map(Math.exp));
const dot = (row, column) => row.reduce((sum, value, i) => sum + value * column[i], 0);
const positions = [1, 2, 3, 4, 5, 6];
const mask = visible => positions.map(position => visible.includes(position) ? 1 : null);
const inputStreams = [2, 6];
const readWeights = [0.25, 0.75];
const carry = [[0.75, 0.25], [0.25, 0.75]];
const writeWeights = [0.5, 0.25];
const read = dot(readWeights, inputStreams);
const change = read - 3;
const writes = writeWeights.map(weight => weight * change);
const prefix = [1, 0];
const initial = [0, 1];
const advance = state => state.map((value, i) => (value + prefix[i]) / 2);
const first = advance(initial);
const adapterInput = [2, 1];
const down = [1, -1];
const up = [0.5, -0.25];
const delta = up.map(weight => weight * dot(down, adapterInput));
const keys = [[1, 0], [0, 1]];
const queries = [[1, 0], [0, 1]];
const sinkScore = Math.log(2);
const offsets = [2, 1, 0];
const convKernel = [0.25, 0.75];
const smooth = signal => signal.slice(1).map((value, i) => dot(convKernel, [signal[i], value]));
const convolvedKeys = smooth([2, 0, 4, 2]);
const convolvedValues = smooth([0, 2, 4, 6]);
const relativeBias = [-1, -0.75, 0.75];

export const galleryToy = {
  masks: {
    positions, local: mask([4, 5, 6]), global: mask(positions), shortlist: mask([1, 3, 6]),
    partial: [mask([1, 2, 5]), mask([1, 2, 5, 6])],
  },
  schedule: {
    localThenGlobal: ['local', 'local', 'global'],
    convolutionThenAttention: ['conv', 'conv', 'global', 'conv', 'local', 'global'],
    expertDepth: { dense: 2, routed: 3, candidates: 5, active: 2 },
  },
  future: { prefix: 'Lights', next: 'dim', later: 'slowly' },
  streams: {
    input: inputStreams, readWeights, read, change, writes,
    identity: inputStreams.map((value, i) => value + writes[i]),
    mixed: carry.map((row, i) => dot(row, inputStreams) + writes[i]),
  },
  depth: { sources: ['Embedding', 'Block A summary', 'Block B summary'], weights: [[0.5, 0.25, 0.25], [0.2, 0.3, 0.5]] },
  latent: { hidden: 8, query: 2, kv: 3 },
  core: { prefix, passes: 2, states: [initial, first, advance(first)] },
  share: { positions: [1, 4], weights: queries.map(query => softmax(keys.map(key => dot(key, query)))) },
  sink: { base: [null, ...softmax([0, 0]), null], withScore: [null, ...softmax([0, 0, sinkScore])], sinkScore },
  relativeConvolution: {
    offsets, convKernel, convolvedKeys, convolvedValues, relativeBias,
    scores: convolvedKeys.map((key, i) => key + relativeBias[i]),
  },
  adapter: { input: adapterInput, down, up, delta, output: adapterInput.map((value, i) => value + delta[i]) },
};
