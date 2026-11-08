import { RASTER_CAPABILITY } from './stamps.js';

// A small, hand-authored single-head calculation. Token labels and vectors are
// synthetic teaching data, not embeddings or attention taken from a trained model.
export const attentionFixture = {
  id: 'fixture-ai-attention',
  manifest: {
    title: 'Build attention one query at a time',
    summary: 'Choose a query token. Each key receives a scaled dot-product score, softmax turns the allowed scores into weights, and the weighted values form the output. Causal masking blocks later tokens.',
    description: 'Three synthetic tokens A, B and C have two-dimensional queries, keys and values. A table links each token to its key, score, weight, value and weighted contribution.',
    assumptions: ['Synthetic vectors, not actual model attention.', 'One attention head with key dimension 2; no learned projections or output projection are modeled.'],
    inputs: [
      { id: 'query', label: 'Query token', type: 'select', default: 'b', options: [{value:'a',label:'A'},{value:'b',label:'B'},{value:'c',label:'C'}] },
      { id: 'mask', label: 'Attention mask', type: 'select', default: 'causal', options: [{value:'causal',label:'Causal'},{value:'none',label:'Unmasked'}] },
    ],
    readouts: [], capabilities: [RASTER_CAPABILITY, 'select_inputs'],
  },
  source: `
const Q=[[1,0],[0,1],[1,1]], K=[[1,0],[0,1],[1,1]], V=[[2,0],[0,4],[2,2]];
export function evaluate({inputs}) {
  const query=['a','b','c'].indexOf(inputs.query), q=Q[query];
  const allowed=K.map((_,i)=>inputs.mask!=='causal'||i<=query);
  const scores=K.map(k=>(q[0]*k[0]+q[1]*k[1])/Math.sqrt(2));
  const max=Math.max(...scores.filter((_,i)=>allowed[i]));
  const exp=scores.map((s,i)=>allowed[i]?Math.exp(s-max):0);
  const total=exp.reduce((a,b)=>a+b,0), weights=exp.map(v=>v/total);
  const contributions=V.map((v,i)=>v.map(x=>x*weights[i]));
  const output=[0,1].map(d=>contributions.reduce((sum,v)=>sum+v[d],0));
  const pair=(v,decimals)=>'['+v.map(x=>x.toFixed(decimals)).join(', ')+']';
  const rows=['A','B','C'].map((token,i)=>[
    token,pair(K[i],0),allowed[i]?scores[i].toFixed(3):'blocked',weights[i].toFixed(3),pair(V[i],0),pair(contributions[i],2),
  ]);
  const objects=[
    sdk.text('query-vector',24,30,'Query '+['A','B','C'][query]+' = '+pair(q,0)),
    sdk.text('score-formula',400,30,'Score = (Q · K) / √2'),
    ...sdk.grid('attention',{x:24,y:54,w:792,h:218,rows,columnLabels:['Token','Key K','Score','Weight','Value V','α × V'],active:[[query,0]]}),
    ...sdk.readout('output-x',{x:24,y:302,w:380,h:48,label:'Output [0]',value:output[0],decimals:3}),
    ...sdk.readout('output-y',{x:436,y:302,w:380,h:48,label:'Output [1]',value:output[1],decimals:3}),
  ];
  return {frame:sdk.frame(objects,{width:840,height:374}),quantities:{query,weightA:weights[0],weightB:weights[1],weightC:weights[2],scoreA:scores[0],scoreB:scores[1],scoreC:scores[2],outputX:output[0],outputY:output[1]}};
}`,
};
