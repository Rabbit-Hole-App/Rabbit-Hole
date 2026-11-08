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

export const MEDIUM_FIXTURES = [mediumTraceFixture, fieldFixture, evidenceFixture, treeFixture, imageRegionsFixture, imageViewsFixture];
