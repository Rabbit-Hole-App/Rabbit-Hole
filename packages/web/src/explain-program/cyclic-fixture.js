import { CYCLIC_CAPABILITY } from './stamps.js';

// Hand-authored example of a bounded directed feedback loop, not model-generation evidence.
export const cyclicNetworkFixture = {
  id: 'fixture-cyclic-network',
  manifest: {
    title: 'Follow a feedback loop',
    summary: 'A plan leads to an action. The observed result feeds back into the next plan. Select a stage to highlight its outgoing relationship.',
    description: 'Three selectable stages form a directed loop: Plan to Act, Act to Observe, and Observe back to Plan.',
    assumptions: ['This is a schematic workflow, not a recorded agent run.'],
    inputs: [], actions: [], readouts: [], capabilities: [CYCLIC_CAPABILITY],
    viewport: { width: 580, height: 438 },
    targets: ['plan', 'act', 'observe'].map(id => ({ id: `loop.node.${id}`, label: `Select ${id}` })),
  },
  source: `
export function initialState() { return { selected: null }; }
export function reduce({ state, event }) {
  const key = event.type === 'select' ? event.target.slice('loop.node.'.length) : null;
  return ['plan','act','observe'].includes(key) ? { selected:key } : state;
}
export function evaluate({ state }) {
  const notes = {plan:'Plan → Act: execute the plan',act:'Act → Observe: inspect the result',observe:'Observe → Plan: use feedback'};
  const objects = sdk.cyclicGraph('loop', {
    x:20,y:12,w:540,h:360,selected:state.selected,
    nodes:[{id:'plan',label:'Plan',x:120,y:80,role:'input'},
      {id:'act',label:'Act',x:420,y:80,role:'output'},
      {id:'observe',label:'Observe',x:270,y:280,role:'observed'}],
    edges:[{from:'plan',to:'act',label:'Execute'},
      {from:'act',to:'observe',label:'Result',labelAt:[414,193]},
      {from:'observe',to:'plan',label:'Feedback',labelAt:[110,193]}],
  });
  objects.push(sdk.box('selection',20,386,540,40,{text:notes[state.selected] || 'Select a stage to follow its outgoing arrow'}));
  return {frame:sdk.frame(objects,{width:580,height:438}),quantities:{}};
}`,
};
