import { z } from 'zod';

// Brief 31 proof card: a decision tree drawn by the written card's flow renderer (sdk.diagram, sdk-8 `figures`) with a step control that moves highlightPath.
// The flow spec is the same in every state; only highlightPath (and the callout) changes, so no node moves. ponytail: one tree, one tracked point, no readouts or ghost.
const text = max => z.string().min(1).max(max);
const id = z.string().min(1).max(24).regex(/^[A-Za-z][A-Za-z0-9]*$/);
export const treeTraceSchema = z.object({
  title: text(60),
  nodes: z.array(z.object({ id, label: text(60), role: z.enum(['process', 'decision', 'outcome']) }).strict()).min(2).max(12),
  edges: z.array(z.object({ from: id, to: id, label: text(30) }).strict()).min(1).max(20),
  steps: z.array(z.object({ label: text(24), highlightPath: z.array(id).min(2).max(12).optional(), callout: text(120) }).strict()).min(2).max(8),
}).strict();

export const roles = Object.freeze([]);
export const normalize = () => ({});
export const geometry = range => range;
export const states = () => ({});

// Evaluated inside the sealed program (sdk is its global); written as a string so the sealed source carries no import.
export function source(ctx) {
  const tree = ctx.geometry?.tree;
  if (!tree) { const e = new Error('tree-trace requires its validated tree'); e.code = 'part_binding'; e.path = 'geometry.tree'; throw e; }
  return `const T=${JSON.stringify(tree)};
const wrap=text=>{const lines=[];let line='';for(const word of text.split(/\s+/)){if(line&&(line+' '+word).length>22){lines.push(line);line='';}line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;};
export function evaluate({inputs}){
  const i=inputs.step===undefined?0:inputs.step;
  if(!Number.isInteger(i)||i<0||i>=T.steps.length)throw new RangeError('step outside the trace');
  const s=T.steps[i],spec={kind:'flow',title:T.title,nodes:T.nodes,edges:T.edges};
  if(s.highlightPath)spec.highlightPath=s.highlightPath;
  const lines=wrap(s.callout),objects=[sdk.diagram(spec,{x:20,y:24,w:400}),
    sdk.box('callout.active.l0',444,66,178,44+lines.length*20,{role:'input',opacity:1}),sdk.text('callout.active.title',455,90,s.label,{role:'input',opacity:1})];
  lines.forEach((value,j)=>objects.push(sdk.text('callout.active.s'+j,455,116+j*20,value,{role:'neutral',opacity:1})));
  return {frame:sdk.frame(objects,{width:640,height:338}),quantities:{}};
}`;
}
