import test from 'node:test';
import assert from 'node:assert/strict';
import {softmaxValues} from './adaptive-softmax-math.js';
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-10, `${a} != ${b}`);

test('the reference example matches known Softmax probabilities', () => {
  const {probabilities} = softmaxValues([2,1,0,-1]);
  [0.6439142598879724,0.23688281808991013,0.08714431874203257,0.03205860328008499].forEach((p,i)=>close(probabilities[i],p));
});
test('equal inputs yield one quarter at every supported score', () => {
  for(let score=-2;score<=4;score+=.25) softmaxValues(Array(4).fill(score)).probabilities.forEach(p=>close(p,.25));
});
test('every slider changes its own share and every other share, including endpoints', () => {
  for(let index=0;index<4;index++) {
    let previous=null;
    for(let score=-2;score<=4;score+=.25) {
      const inputs=[2,1,0,-1];inputs[index]=score;
      const {probabilities:p}=softmaxValues(inputs);
      close(p.reduce((a,b)=>a+b,0),1);
      p.forEach(v=>assert.ok(v>0&&v<1));
      if(previous) p.forEach((v,i)=>assert.ok(i===index?v>previous[i]:v<previous[i]));
      previous=p;
    }
  }
});
test('adding a common offset preserves probabilities; permutations preserve identity', () => {
  const p=softmaxValues([2,1,0,-1]).probabilities;
  softmaxValues([3,2,1,0]).probabilities.forEach((v,i)=>close(v,p[i]));
  softmaxValues([-1,0,1,2]).probabilities.forEach((v,i)=>close(v,p[3-i]));
});
