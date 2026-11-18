import { z } from 'zod';

// Brief 32 card A: the tree-trace flow (sdk.diagram) with a dot that travels the route one point takes, on a 6 s timeline. The node centres and edge routes are baked into scene.data at build time
// (scripts/interact/bake-tree-geometry.mjs), so the program draws the dot in the same frame coordinates the renderer draws the diagram in. The route comes from the two number inputs.
// ponytail: one tree, two tests, a fixed schedule (dwell, slide, dwell, slide, hold); no speed control, no markers.
const text = max => z.string().min(1).max(max);
const id = z.string().min(1).max(24).regex(/^[A-Za-z][A-Za-z0-9]*$/);
const xy = z.tuple([z.number(), z.number()]);
export const treeMotionSchema = z.object({
  title: text(60),
  nodes: z.array(z.object({ id, label: text(60), role: z.enum(['process', 'decision', 'outcome']) }).strict()).min(2).max(12),
  edges: z.array(z.object({ from: id, to: id, label: text(30) }).strict()).min(1).max(20),
  root: id,
  tests: z.record(id, z.object({ input: id, max: z.number(), yes: id, no: id }).strict()),
  prediction: z.record(id, text(40)),
  duration: z.number().positive().max(60),
  geometry: z.object({
    frame: z.object({ width: z.number(), height: z.number() }).strict(), box: z.object({ x: z.number(), y: z.number(), w: z.number() }).strict(), scale: z.number(), rendered: z.object({ width: z.number(), height: z.number() }).strict(),
    nodes: z.record(id, z.object({ centre: xy, box: z.tuple([z.number(), z.number(), z.number(), z.number()]) }).strict()), edges: z.record(z.string(), z.array(xy)),
    labels: z.record(z.string(), z.tuple([z.number(), z.number(), z.number(), z.number()])),
  }).strict(),
}).strict();

export const roles = Object.freeze([]);
export const normalize = () => ({});
export const geometry = range => range;
export const states = () => ({});

// The sealed program. T is the validated data; the function below the data is plain JS over `inputs` and `time`.
export function source(ctx) {
  const tree = ctx.geometry?.tree;
  if (!tree) { const e = new Error('tree-motion requires its validated tree'); e.code = 'part_binding'; e.path = 'geometry.tree'; throw e; }
  return `const T=${JSON.stringify(tree)};
const wrap=text=>{const lines=[];let line='';for(const word of text.split(/\\s+/)){if(line&&(line+' '+word).length>22){lines.push(line);line='';}line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;};
const G=T.geometry,MOVE=1.1,HOLD=1.2,EDGE=(a,b)=>G.edges[a+':'+b];
const route=inputs=>{const path=[T.root],says=[];let at=T.root;while(T.tests[at]){const t=T.tests[at],v=inputs[t.input],yes=v<=t.max;says.push({node:at,text:v+' ≤ '+t.max+' is '+(yes?'true':'false')+': take '+(yes?'Yes':'No')+'.'});at=yes?t.yes:t.no;path.push(at);}return {path,says};};
const along=(points,f)=>{let total=0;const lens=[];for(let i=1;i<points.length;i++){const l=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);lens.push(l);total+=l;}let d=f*total;for(let i=0;i<lens.length;i++){if(d<=lens[i]||i===lens.length-1){const u=lens[i]?Math.min(1,d/lens[i]):1;return [points[i][0]+u*(points[i+1][0]-points[i][0]),points[i][1]+u*(points[i+1][1]-points[i][1])];}d-=lens[i];}return points[0];};
const lenOf=points=>{let total=0;for(let i=1;i<points.length;i++)total+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);return total;};
const cut=(points,d)=>{const out=[points[0]];for(let i=1;i<points.length&&d>0;i++){const l=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);if(d>=l){out.push(points[i]);d-=l;}else{const u=d/l;out.push([points[i-1][0]+u*(points[i][0]-points[i-1][0]),points[i-1][1]+u*(points[i][1]-points[i-1][1])]);d=0;}}return out;};
// The travelled part of a route that is not complete yet, as lines over the baked edge routes: whole edges for the nodes reached, and the part of the current edge the dot has covered. The renderer's own highlight takes over once the route runs root to a leaf.
const gap=(points,label)=>{if(!label)return [points];const P=3,g0=label[0]-P,g1=label[0]+label[2]+P,out=[];let cur=[points[0]];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(a[1]===b[1]&&a[1]>=label[1]-P&&a[1]<=label[1]+label[3]+P&&Math.max(a[0],b[0])>g0&&Math.min(a[0],b[0])<g1){const up=b[0]>a[0];const before=up?a[0]<g0:a[0]>g1,after=up?b[0]>g1:b[0]<g0;if(before){cur.push([up?g0:g1,a[1]]);out.push(cur);}cur=after?[[up?g1:g0,a[1]],b]:[];continue;}cur.push(b);}if(cur.length>1)out.push(cur);return out.filter(p=>p.length>1);};
// The trail leaves a gap where an edge label sits, as the renderer's own wire does.
const trail=(path,done,slide)=>{const out=[];for(let k=0;k<done;k++)out.push([EDGE(path[k],path[k+1]),path[k]+':'+path[k+1]]);if(slide){const e=EDGE(path[slide.k],path[slide.k+1]),from=G.nodes[path[slide.k]].centre,first=Math.hypot(e[0][0]-from[0],e[0][1]-from[1]),all=first+lenOf(e)+Math.hypot(G.nodes[path[slide.k+1]].centre[0]-e[e.length-1][0],G.nodes[path[slide.k+1]].centre[1]-e[e.length-1][1]),d=Math.min(lenOf(e),Math.max(0,slide.f*all-first));if(d>0)out.push([cut(e,d),path[slide.k]+':'+path[slide.k+1]]);}return out;};
export function evaluate({inputs,time}){
  const t=Math.min(Math.max(time||0,0),T.duration),{path,says}=route(inputs),n=path.length,dwell=(T.duration-(n-1)*MOVE-HOLD)/(n-1);
  // stop k holds from start[k] to start[k]+dwell (the last holds to the end); the slide k to k+1 follows each hold but the last
  const start=path.map((_,k)=>k*(dwell+MOVE));
  let pos=G.nodes[path[0]].centre,reached=1,phase=0,sliding=false,slideF=0;
  for(let k=0;k<n;k++){
    if(t>=start[k]){reached=k+1;pos=G.nodes[path[k]].centre;phase=k;sliding=false;}
    if(k<n-1&&t>=start[k]+dwell){const edge=[G.nodes[path[k]].centre].concat(EDGE(path[k],path[k+1]),[G.nodes[path[k+1]].centre]),f=Math.min(1,(t-start[k]-dwell)/MOVE);pos=along(edge,f);if(f<1){sliding=true;reached=k+1;phase=k;slideF=f;}}
  }
  const leaf=!sliding&&reached===n,flow={kind:'flow',title:T.title,nodes:T.nodes,edges:T.edges};
  if(leaf)flow.highlightPath=path;
  const head=leaf?'Prediction':'Test '+(phase+1),line=leaf?'The tree predicts '+T.prediction[path[n-1]].toLowerCase()+'.':says[phase].text;
  const lines=wrap(line),b=G.box,objects=[sdk.diagram({version:1,diagram:flow},{x:b.x,y:b.y,w:b.w})];
  if(!leaf)trail(path,sliding?phase:reached-1,sliding?{k:phase,f:slideF}:null).forEach(([points,key],i)=>gap(points,G.labels[key]).forEach((piece,j)=>objects.push(sdk.polyline('trail.'+i+'.'+j,piece,{role:'input',opacity:1}))));
  objects.push(
    sdk.circle('dot',pos[0],pos[1],18,{role:'output'}),
    sdk.box('callout.active.l0',450,66,178,44+lines.length*20,{role:'input',opacity:1}),sdk.text('callout.active.title',461,90,head,{role:'input',opacity:1}));
  lines.forEach((value,j)=>objects.push(sdk.text('callout.active.s'+j,461,116+j*20,value,{role:'neutral',opacity:1})));
  return {frame:sdk.frame(objects,{width:G.frame.width,height:G.frame.height}),quantities:{x:inputs.x,y:inputs.y}};
}`;
}
