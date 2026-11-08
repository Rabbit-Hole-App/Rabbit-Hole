import { MEDIUM_CAPABILITY } from './stamps.js';
import { imageViewsFixture as imageViewsExample } from './testdata/image-views.mjs';

const select = (id, label, options) => ({
  type: 'select', id, label, default: options[0][0], options: options.map(([value, label]) => ({ value, label })),
});
const fixture = (id, title, summary, controls, source) => ({
  id: `fixture-medium-${id}`,
  manifest: { title, summary, description: summary, assumptions: [], inputs: [], readouts: [], capabilities: [MEDIUM_CAPABILITY], ...controls },
  source,
});

export const mediumTraceFixture = fixture('trace', 'Inspect parallel tool calls',
  'Scrub an illustrative run and select a call to inspect its start, end and elapsed time.', {
    viewport: { width: 660, height: 362 }, duration: 8, actions: [],
    targets: [['fetch', 'Fetch'], ['parse', 'Parse'], ['retry', 'Retry'], ['write', 'Write']]
      .map(([id, label]) => ({ id: `run:span:${id}`, label })),
    capabilities: [MEDIUM_CAPABILITY, 'time_playback'],
  }, `
export function initialState() { return { selected: null }; }
export function reduce({ state, event }) {
  return event.type === 'select' ? { selected: event.target.slice('run:span:'.length) } : state;
}
export function evaluate({ state, time }) {
  const objects = sdk.trace('run', { x:16,y:16,w:620,h:330,domain:[0,8],unit:'s',cursor:time,selected:state.selected,lanes:[
    {id:'tools',label:'Tools',spans:[
      {id:'fetch',label:'Fetch',start:0,end:3,detail:'First request timed out'},
      {id:'parse',label:'Parse',start:1,end:2,parent:'fetch'},
      {id:'retry',label:'Retry',start:3,end:5,dependsOn:['fetch'],detail:'Retry returned a result'},
    ]},
    {id:'answer',label:'Answer',spans:[{id:'write',label:'Write',start:5,end:8,dependsOn:['retry']}]},
  ] });
  return { frame:sdk.frame(objects,{width:660,height:362}), quantities:{} };
}`);

const fieldFixture = fixture('field', 'Contours and flow directions',
  'Switch between equal-value contours and direction arrows on the same coordinate domain.', {
    inputs: [select('mode', 'Field', [['contour', 'Contours'], ['vector', 'Flow directions']])],
  }, `
export function evaluate({ inputs }) {
  const contour = inputs.mode === 'contour';
  const objects = sdk.field('field',{
    kind:inputs.mode,x:18,y:18,w:540,h:352,xDomain:[-2,2],yDomain:[-2,2],xLabel:'x',yLabel:'y',
    xUnit:'',yUnit:'',valueLabel:contour?'Potential':'Speed',valueUnit:'',
    ...(contour ? { levels:[1,2,3],sample:(x,y)=>x*x+y*y } : { maxMagnitude:3,sample:(x,y)=>[-y,x] }),
  });
  return { frame:sdk.frame(objects,{width:576,height:388}), quantities:{} };
}`);

const evidenceFixture = fixture('evidence', 'Inspect evidence in a sentence',
  'Select a claim to see the exact excerpt and the matching entry in the sample log.', {
    inputs: [select('claim', 'Evidence span', [['cooling', 'Cooling'], ['fan', 'Fan status']])],
  }, `
export function evaluate({ inputs }) {
  const objects = sdk.evidence('source', { x:12,y:12,w:300,h:180,
    text:'The log says: ice cooled the tray while the fan stayed off.', selected:inputs.claim,
    spans:[{id:'cooling',start:14,end:33,citation:'Lab notes, entry 2'},{id:'fan',start:34,end:58,citation:'Lab notes, entry 3'}],
  });
  return { frame:sdk.frame(objects,{width:324,height:206}), quantities:{} };
}`);

const treeFixture = fixture('tree', 'Open a search branch',
  'Choose a branch to reveal its leaves while the rest of the tree stays in place.', {
    inputs: [select('branch', 'Search branch', [['overview', 'Overview'], ['left', 'Left branch'], ['right', 'Right branch']])],
  }, `
export function evaluate({ inputs }) {
  const nodes = [{id:'root',label:'Search'},{id:'left',label:'Left'},{id:'right',label:'Right'},
    {id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'},{id:'d',label:'D'}];
  const edges = [{from:'root',to:'left'},{from:'root',to:'right'},
    {from:'left',to:'a'},{from:'left',to:'b'},{from:'right',to:'c'},{from:'right',to:'d'}];
  const expanded = inputs.branch === 'overview' ? [] : [inputs.branch];
  const objects = sdk.expandableGraph('tree',{x:16,y:16,w:540,h:350,nodes,edges,expanded});
  return { frame:sdk.frame(objects,{width:572,height:382}), quantities:{} };
}`);

const imageRegions = `const regions=[{id:'upper',x:0.25,y:0.12,w:0.48,h:0.43},{id:'lower',x:0.22,y:0.55,w:0.53,h:0.29}];`;
const regionInput = select('region', 'Sample region', [['upper', 'Upper region'], ['lower', 'Lower region']]);
const imageRegionsFixture = fixture('image-regions', 'Inspect regions of a sample image',
  'Choose a region to highlight its position on the bundled image.', { inputs: [regionInput] }, `
export function evaluate({ inputs }) {
  ${imageRegions}
  const objects = sdk.imageRegions('photo',{asset:'vlm-patch-source',x:16,y:16,w:420,h:330,regions,selected:inputs.region});
  return { frame:sdk.frame(objects,{width:452,height:362}), quantities:{} };
}`);

const imageViewsFixture = { ...imageViewsExample, id: 'fixture-medium-image-views',
  manifest: { ...imageViewsExample.manifest, capabilities: [MEDIUM_CAPABILITY] } };

const samples = [
  { id: 'a', label: 'A', at: [1, 18] },
  { id: 'b', label: 'B', at: [2, 24] },
  { id: 'c', label: 'C', at: [3, 31] },
];
const linkedComparisonFixture = fixture('linked-comparison', 'Compare temperature samples',
  'Select a point or a comparison row to highlight the same sample in both views and read its temperature.', {
    viewport: { width: 690, height: 292 }, actions: [],
    targets: samples.flatMap(({ id, label }) => [
      { id: `samples:point:${id}`, label: `Plot sample ${label}` },
      { id: `compare:row:${id}`, label: `Compare sample ${label}` },
    ]),
  }, `
const samples = ${JSON.stringify(samples)};
const pointId = id => 'samples:point:' + id;
const rowId = id => 'compare:row:' + id;

export function initialState() { return { selected: null }; }
export function reduce({ state, event }) {
  if (event.type !== 'select') return state;
  const sample = samples.find(({ id }) => event.target === pointId(id) || event.target === rowId(id));
  return sample ? { selected: sample.id } : state;
}
export function evaluate({ state }) {
  const plot = { x:56,y:56,w:280,h:160,xDomain:[0,4],yDomain:[0,40] };
  const xAt = sdk.linear(plot.xDomain, [plot.x, plot.x + plot.w]);
  const yAt = sdk.linear(plot.yDomain, [plot.y + plot.h, plot.y]);
  const selectedIndex = samples.findIndex(sample => sample.id === state.selected);
  const selected = samples[selectedIndex];
  const plotted = sdk.geometry('samples', { ...plot,
    segments: [{id:'time',from:[0,0],to:[4,0]},{id:'temp',from:[0,0],to:[0,40]}],
    points: samples.map(({ id, at }) => ({ id, at, role:id === state.selected ? 'learner' : 'output' })),
  });
  for (const { id, label } of samples) {
    const point = plotted.find(object => object.id === pointId(id));
    point.w = 28;
    point.text = label;
  }
  const rows = sdk.grid('compare', { x:370,y:60,w:300,h:151,
    rows:samples.map(({ label, at:[minutes, temperature] }) => [label + ' · ' + minutes + ' min · ' + temperature + ' °C']),
    active:selected ? [[selectedIndex,0]] : [],
  }).map((row, index) => ({ ...row, id:rowId(samples[index].id) }));
  const readout = { x:370,y:225,w:300,h:42 };
  const objects = [
    sdk.text('temp-title',56,34,'Temperature (°C)'),
    sdk.text('time-title',196,274,'Time (min)',{align:'middle'}),
    ...[1,2,3].map(t => sdk.text('time:' + t,xAt(t),yAt(0)+20,String(t),{align:'middle'})),
    ...[0,10,20,30,40].map(t => sdk.text('temp:' + t,xAt(0)-18,yAt(t)+5,String(t),{align:'middle'})),
    ...plotted,
    sdk.text('compare-title',370,34,'Compare samples'),
    ...rows,
    ...(selected ? sdk.readout('compare:reading', { ...readout,label:'Sample ' + selected.label,value:selected.at[1],unit:'°C',decimals:0 })
      : [sdk.box('compare:reading',readout.x,readout.y,readout.w,readout.h,{text:'Select a sample'})]),
  ];
  return { frame:sdk.frame(objects,{width:690,height:292}), quantities:{} };
}`);

export const MEDIUM_FIXTURES = [mediumTraceFixture, fieldFixture, evidenceFixture, treeFixture, imageRegionsFixture, imageViewsFixture, linkedComparisonFixture];
