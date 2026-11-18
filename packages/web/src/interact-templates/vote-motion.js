import { z } from 'zod';

// Brief 32 card B: majority vote as a bar chart (sdk.diagram, kind bar-chart). Each tree's vote arrives in turn and the bar of the class it chose grows smoothly to its new count; the program hands the
// bar values for the current moment to sdk.diagram on every frame. ponytail: no inputs; the trees and their votes are the ml-trees-majority-vote reference's, copied into the plan.
const text = max => z.string().min(1).max(max);
export const voteMotionSchema = z.object({
  title: text(60), unit: text(16),
  classes: z.array(text(30)).min(2).max(8),
  votes: z.array(z.object({ tree: text(30), rule: text(30), class: z.number().int().min(0).max(7) }).strict()).min(1).max(8),
  duration: z.number().positive().max(60),
}).strict();

export const roles = Object.freeze([]);
export const normalize = () => ({});
export const geometry = range => range;
export const states = () => ({});

export function source(ctx) {
  const vote = ctx.geometry?.vote;
  if (!vote) { const e = new Error('vote-motion requires its validated votes'); e.code = 'part_binding'; e.path = 'geometry.vote'; throw e; }
  return `const V=${JSON.stringify(vote)};
const wrap=text=>{const lines=[];let line='';for(const word of text.split(/\\s+/)){if(line&&(line+' '+word).length>22){lines.push(line);line='';}line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;};
const PERIOD=V.duration/V.votes.length,LEAD=0.3,GROW=1.0,ease=u=>u*u*(3-2*u);
export function evaluate({time}){
  const t=Math.min(Math.max(time||0,0),V.duration),grown=V.votes.map((_,k)=>ease(Math.min(1,Math.max(0,(t-k*PERIOD-LEAD)/GROW))));
  const values=V.classes.map((_,c)=>V.votes.reduce((sum,v,k)=>sum+(v.class===c?grown[k]:0),0));
  const last=V.votes.findIndex((_,k)=>t>=k*PERIOD+LEAD&&(k===V.votes.length-1||t<(k+1)*PERIOD+LEAD)),done=t>=V.duration-0.7;
  const totals=V.classes.map((_,c)=>V.votes.filter(v=>v.class===c).length),win=totals.indexOf(Math.max.apply(null,totals));
  const head=done?'Result':last<0?'Votes':V.votes[last].tree,line=done?V.classes[win]+' wins, '+totals[win]+' votes to '+(V.votes.length-totals[win])+'.':last<0?'Each tree votes for one class.':V.votes[last].tree+' ('+V.votes[last].rule+') votes '+V.classes[V.votes[last].class]+'.';
  const lines=wrap(line),spec={version:1,diagram:{kind:'bar-chart',title:V.title,unit:V.unit,bars:V.classes.map((label,c)=>({label:label,value:values[c]}))}};
  const objects=[sdk.diagram(spec,{x:12,y:12,w:420}),sdk.box('callout.active.l0',450,66,178,44+lines.length*20,{role:'input',opacity:1}),sdk.text('callout.active.title',461,90,head,{role:'input',opacity:1})];
  lines.forEach((value,j)=>objects.push(sdk.text('callout.active.s'+j,461,116+j*20,value,{role:'neutral',opacity:1})));
  return {frame:sdk.frame(objects,{width:640,height:300}),quantities:{}};
}`;
}
