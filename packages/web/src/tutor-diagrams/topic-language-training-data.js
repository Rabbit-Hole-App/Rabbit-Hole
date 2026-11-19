// Independent toy output vocabulary. The start marker belongs only to input prefixes.
export const vocabulary = Object.freeze(['clouds', 'bring', 'rain', '<eos>']);
export const languageParameters = Object.freeze({ bos: '<bos>', eos: '<eos>', observed: ['clouds', 'bring', 'rain'], selectedTarget: 'bring', precision: 3,
  cases: [{ id: 'a', label: 'Illustrative A', logits: [0, 1, 0, -1] }, { id: 'b', label: 'Illustrative B', logits: [0, 2, 0, -1] }],
  replacement: { index: 2, token: 'clouds' } });
const oneHot = token => vocabulary.map(word => +(word === token));
const rounded = value => +value.toFixed(languageParameters.precision);
function prefixRows(tokens) {
  const sequence = [languageParameters.bos, ...tokens, languageParameters.eos];
  return sequence.slice(1).map((target, i) => ({ id: 't' + (i + 1), label: 'T' + (i + 1), position: i + 1,
    prefixTokens: sequence.slice(0, i + 1), prefix: sequence.slice(0, i + 1).map(token => token === languageParameters.bos ? '“' + token + '”' : token).join(' '), target, targetSlot: vocabulary.indexOf(target) }));
}
export function derived() {
  const p = languageParameters, dictionary = vocabulary.map((token, slot) => ({ token, slot }));
  const targets = [p.selectedTarget, p.eos].map(token => ({ token, slot: vocabulary.indexOf(token), values: oneHot(token) }));
  const targetSlot = vocabulary.indexOf(p.selectedTarget);
  const cases = p.cases.map(row => {
    const max = Math.max(...row.logits), exp = row.logits.map(z => Math.exp(z - max)), denominator = exp.reduce((sum, n) => sum + n, 0);
    const probabilities = exp.map(n => n / denominator), targetProbability = probabilities[targetSlot], loss = -Math.log(targetProbability);
    return { ...row, probabilities, targetProbability, loss, displayProbabilities: probabilities.map(rounded), displayTargetProbability: rounded(targetProbability), displayLoss: rounded(loss) };
  });
  const prefixes = prefixRows(p.observed), changed = [...p.observed]; changed[p.replacement.index] = p.replacement.token;
  const probe = prefixRows(changed), inputPositions = prefixes.map((_, i) => i);
  const unchanged = prefixes.filter((row, i) => row.prefix === probe[i].prefix && row.target === probe[i].target).map(row => row.label);
  const changedTargets = prefixes.filter((row, i) => row.target !== probe[i].target).map(row => row.label);
  const changedPrefixes = prefixes.filter((row, i) => row.prefix !== probe[i].prefix).map(row => row.label);
  const lossDelta = cases[1].loss - cases[0].loss;
  return { parameters: p, dictionary, targets, selectedEntries: dictionary.filter(row => targets.some(target => target.token === row.token)),
    cases, lossDelta, displayLossDelta: rounded(lossDelta), prefixes, probe, inputPositions,
    causalMask: prefixes.map(row => inputPositions.map(position => +(position < row.position))),
    probeChanges: { unchanged, changedTargets, changedPrefixes, oldToken: p.observed[p.replacement.index], newToken: p.replacement.token },
    counts: { vocabulary: vocabulary.length, examples: prefixes.length, cases: cases.length, targetFlags: targets[0].values.reduce((n, v) => n + v, 0) } };
}
