export const rotatedPair = [1, 0];
export const unchangedPair = [0.2, 0.4];
const turn = Math.PI / 2;
const cos = Math.cos(turn);
const sin = Math.sin(turn);
export const turnedPair = [rotatedPair[0] * cos - rotatedPair[1] * sin, rotatedPair[0] * sin + rotatedPair[1] * cos]
  .map(value => Math.round(value * 1000) / 1000);

export const draft = ['sat', 'on', 'mat'];
const verified = ['sat', 'on', 'the'];
export const firstMismatch = draft.findIndex((token, index) => token !== verified[index]);
export const accepted = draft.slice(0, firstMismatch);
export const replacement = verified[firstMismatch];
