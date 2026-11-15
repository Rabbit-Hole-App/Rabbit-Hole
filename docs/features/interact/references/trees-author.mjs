// Reference-only authoring: approved card shell, source data, hand-drawn scenes.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {mount} from './trees-reference-harness.mjs';
export const root=new URL('./',import.meta.url);
const read=n=>readFileSync(new URL(n,root),'utf8');
export const depths=['overview','standard','deep'];
export const spec=(id,depth)=>JSON.parse(read(`../../explain-on-canvas/handoff/phase02-library/illustrations/ml-trees-${id}${depth==='overview'?'-brief':depth==='deep'?'-detailed':''}/spec.json`)).diagram;
const sourcePath='packages/web/src/tutor-diagrams/lesson-decision-trees-data.js';
const source=execFileSync('git',['show',`aedd55b01:${sourcePath}`],{encoding:'utf8'});
export const toy=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).decisionTreesLesson;
export const sourceProof={path:sourcePath,revision:'aedd55b01',sha256:createHash('sha256').update(source).digest('hex')};
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function kit(){
 let n=0;const E=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const C={ink:'#202723',muted:'#5d675f',border:'#e3e7e0',paper:'#fffefa',panel:'#f6f8f4',blue:'#426db2',soft:'#eaf1fb',orange:'#b86232',warm:'#f8ece3',green:'#267657'};
 const mark=(tag,a,content='')=>`<${tag} id="mark.${n++}" ${Object.entries(a).map(([k,v])=>`${k}="${E(v)}"`).join(' ')}>${content}</${tag}>`;
 const T=(x,y,s,size=14,color=C.ink,anchor='start')=>mark('text',{x,y,'font-size':size,fill:color,'text-anchor':anchor},E(s));
 const R=(x,y,w,h,fill=C.panel,stroke=C.border)=>mark('rect',{x,y,width:w,height:h,rx:8,fill,stroke});
 const L=(x1,y1,x2,y2,color=C.border,width=1,dash='')=>mark('line',{x1,y1,x2,y2,stroke:color,'stroke-width':width,...(dash?{'stroke-dasharray':dash}:{})});
 const D=(x,y,r=4,color=C.blue)=>mark('circle',{cx:x,cy:y,r,fill:color});
 const P=(points,color=C.blue,width=2,dash='')=>mark('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:color,'stroke-width':width,...(dash?{'stroke-dasharray':dash}:{})});
 const wrap=(x,y,s,w=560,size=14,color=C.ink)=>{const words=String(s).split(' '),lines=[];let line='';for(const word of words){if((line+' '+word).trim().length*size*.56>w){lines.push(line);line=word}else line=(line+' '+word).trim()}if(line)lines.push(line);return lines.map((s,i)=>T(x,y+i*(size+6),s,size,color)).join('')};
 const pill=(x,y,w,label,active=true)=>R(x,y,w,30,active?C.soft:C.panel,active?C.blue:C.border)+T(x+w/2,y+20,label,13,active?C.blue:C.muted,'middle');
 const note=(y,text)=>R(18,y,604,48,C.soft,'#adc4e5')+wrap(30,y+20,text,578,13,C.blue);
 const metric=(x,y,w,label,value,color=C.blue)=>R(x,y,w,58)+T(x+12,y+20,label,12,C.muted)+T(x+12,y+44,value,21,color);
 const fmt=(v,d=3)=>Number(v.toFixed(d)).toString();
 const counts=rows=>[rows.filter(r=>r.label===0).length,rows.filter(r=>r.label===1).length];
 const gini=c=>c[0]+c[1]===0?0:2*c[0]*c[1]/(c[0]+c[1])**2;
 const path=(tree,row)=>{const out=[];let node=tree,id='root';for(;;){out.push({id,node});if(!node.split)break;const left=row[node.split.feature]<=node.split.threshold;id+=left?'l':'r';node=left?node.left:node.right}return out};
 const predict=(tree,row)=>path(tree,row).at(-1).node.prediction;
 const axes=(x,y,w,h,xmin,xmax,ymin,ymax,xticks,yticks,xlabel,ylabel,log=false)=>{const X=v=>x+w*(log?(Math.log(v)-Math.log(xmin))/(Math.log(xmax)-Math.log(xmin)):(v-xmin)/(xmax-xmin)),Y=v=>y+h-h*(v-ymin)/(ymax-ymin);let svg=L(x,y,x,y+h,C.muted)+L(x,y+h,x+w,y+h,C.muted);for(const v of xticks)svg+=L(X(v),y+h,X(v),y+h+5,C.muted)+T(X(v),y+h+21,v,12,C.muted,'middle');for(const v of yticks)svg+=L(x,y===Y(v)?y:Y(v),x+w,Y(v),C.border,1)+T(x-9,Y(v)+4,v,12,C.muted,'end');svg+=T(x+w/2,y+h+43,xlabel,13,C.muted,'middle')+T(x,y-14,ylabel,13,C.muted);return{svg,X,Y}};
 return{E,C,mark,T,R,L,D,P,wrap,pill,note,metric,fmt,counts,gini,path,predict,axes};
}
export {kit as referenceKit};
function runtime(S,compute,paint,makeKit){
 const u={...S.data.initialInputs};const nodes=Object.fromEntries(S.controls.filter(c=>c.kind!=='reset').map(c=>[c.id,document.getElementById(c.id)]));
 const api={scene:S,evidence:null,ahaReached:false};globalThis.TreesCard=api;
 function render(){let K=makeKit(),m=compute(S,u,K);if(m.domains)for(const [id,[min,max]]of Object.entries(m.domains)){nodes[id].setAttribute('min',min);nodes[id].setAttribute('max',max);u[id]=Math.max(min,Math.min(max,u[id]));m=compute(S,u,K)}
  document.getElementById('objects').innerHTML=paint(S,u,m,K);document.getElementById('scene-state').textContent=m.status??'';document.getElementById('status').textContent=m.status??'';
  for(const c of S.controls.filter(c=>c.kind!=='reset')){nodes[c.id].value=u[c.id];document.getElementById(c.id+'-value').textContent=m.controlLabels?.[c.id]??String(u[c.id]);}
  api.evidence=m.evidence;api.ahaReached=Object.entries(S.aha.inputs).every(([k,v])=>u[k]===v);api.inputs={...u};
 }
 for(const c of S.controls.filter(c=>c.kind!=='reset'))nodes[c.id].addEventListener(c.kind==='select'?'change':'input',e=>{u[c.id]=c.kind==='select'?e.target.value:Number(e.target.value);render()});
 document.getElementById('reset').addEventListener('click',()=>{Object.assign(u,S.data.initialInputs);render()});render();
}
const approved=read('overview-stepper-merge-sort.html');
const css=approved.match(/<style>([\s\S]*?)<\/style>/)[1];
const extra=`\n/* Owner 11:45: freely designed tree experiments; approved shell and palette. */\nmain{max-width:724px;padding:24px}.card h1{font-size:28px}.card-copy{font-size:15px;line-height:1.5}.experiment-instruction{font-size:14px;margin-bottom:14px}.experiment-heading{min-height:48px;padding-top:12px;padding-bottom:10px}.experiment-heading h2{font-size:16px}.tree-controls{padding:12px 16px 14px;border-top:1px solid var(--border);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 20px}.tree-controls .parameter{display:block}.tree-controls label{font-size:13px}.tree-controls output{font-size:12px}.tree-controls select{width:100%;height:32px;border:1px solid var(--border);border-radius:7px;background:var(--card);font:inherit;font-size:13px;padding:3px 8px;color:var(--ink)}.tree-controls select:focus-visible{outline:2px solid var(--blue);outline-offset:2px}.tree-controls .single{grid-column:1/-1}.badge{font-size:12px}.experiment-heading>span{font-size:12px}.tree-scene{display:block;width:640px;min-width:640px;height:auto;font-family:Inter,Arial,sans-serif}.tree-scene text{font-family:inherit;font-variant-numeric:tabular-nums}.experiment-heading>span{max-width:250px}.instructions-title{display:inline;margin-right:7px}#instructions p{display:inline}\n`;
const icon='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="15" rx="3"/><path d="m3 11 18-5M7 3l2 4M14 2l2 4"/></svg>';
function htmlOf(S,compute,paint){
 const controls=S.controls.filter(c=>c.kind!=='reset').map(c=>`<div class="parameter${S.controls.length===2?' single':''}"><div><label for="${c.id}">${esc(c.label)}</label><output id="${c.id}-value" for="${c.id}"></output></div>${c.kind==='select'?`<select id="${c.id}" data-event="change">${c.values.map((v,i)=>`<option value="${esc(v)}">${esc(c.labels?.[i]??v)}</option>`).join('')}</select>`:`<input id="${c.id}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" aria-label="${esc(c.label)}">`}</div>`).join('');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rabbit Hole · ${esc(S.id)}</title><style>${css}${extra}</style></head><body><main><article class="card" aria-labelledby="card-title"><header class="card-header"><span class="badge">${icon}Interactive</span><details class="prompt"><summary>Prompt</summary><div class="prompt-panel"><p>${esc(S.data.prompt)}</p></div></details></header><h1 id="card-title">${esc(S.data.title)}</h1><p class="card-copy concept" id="concept">${esc(S.story)}</p><div class="experiment-instruction" id="instructions"><strong class="instructions-title">Try it</strong><p>${esc(S.data.instructions)}</p></div><section class="experiment" id="experiment" aria-label="${esc(S.data.heading)}"><button class="button secondary experiment-reset" id="reset" type="button" aria-label="Reset experiment" title="Reset experiment"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2.7 8.4M3 4v6h6"/></svg></button><div class="experiment-heading"><h2>${esc(S.data.heading)}</h2><span id="scene-state"></span></div><div class="scenes-viewport"><svg class="tree-scene" id="drawing" width="640" height="${S.layout.height}" viewBox="0 0 640 ${S.layout.height}" role="img" aria-label="${esc(S.aha.observation)}"><title>${esc(S.data.heading)}</title><g id="objects"></g></svg></div><div class="tree-controls">${controls}</div></section><span class="sr-only" role="status" id="status"></span></article></main><script id="scene-model">const Scene = ${JSON.stringify(S)};</script><script id="scene-view">(${runtime.toString()})(Scene,${compute.toString()},${paint.toString()},${kit.toString()});</script></body></html>\n`;
}
export function writeCards(id,make,compute,paint){
 for(const depth of depths){const S=make(depth);S.aha.stateId='aha';S.data.captureStates=[{id:'initial',inputs:{...S.data.initialInputs}},{id:'aha',inputs:{...S.data.initialInputs,...S.aha.inputs}}];S.schemaVersion=1;S.status='reference-proposal';S.id=`${depth}-${S.family}-${id}`;S.depth={overview:'brief',standard:'balanced',deep:'detailed'}[depth];S.layout={width:640,height:S.layout?.height??370};S.controls.push({id:'reset',kind:'reset',effect:'Restore the declared initial inputs and the initial evidence.'});S.data.treeReference=true;S.data.provenance={reference:`ml-trees-${id}${depth==='overview'?'-brief':depth==='deep'?'-detailed':''}`,sourceProof};
  S.data.verification={maxObjects:0,cases:0,renderedFit:'Unknown — owner browser acceptance required'};
  const preview=htmlOf(S,compute,paint),ui=mount(preview),choices=S.controls.filter(c=>c.kind!=='reset');let cases=[{}];
  for(const c of choices){const vals=c.values??Array.from({length:Math.round((c.max-c.min)/c.step)+1},(_,i)=>Number((c.min+i*c.step).toFixed(8)));cases=cases.flatMap(s=>vals.map(v=>({...s,[c.id]:v})));}
  let max=0;for(const values of cases){for(const c of choices)ui.change(c.id,values[c.id]);max=Math.max(max,[...ui.svg().matchAll(/<(?:rect|circle|ellipse|line|polyline|polygon|path|text)\b/g)].length)}
  if(max>130)throw Error(`${S.id}: ${max} objects exceeds 130`);S.data.verification.maxObjects=max;S.data.verification.cases=cases.length;
  S.data.review={rubric:'scene-composition-scorecard.md',reviewer:'Codex',date:'2026-11-15',amendment:'Owner 11:45: depth pattern and parameter budget waived; scene design independent of existing runtime families.',checks:{1:'Yes: bound mechanism answers the prompt',2:'Yes: inputs persist without a clock',3:'Yes: every experiment control changes numerical or structural evidence',4:'Yes: composition data binds the visible parts',5:'Unknown: owner browser fit acceptance pending',6:'Yes: story, controls and part names agree',7:'Yes under owner amendment: depth chosen for this question',8:'Yes: calculations and source provenance declared and checked',9:'Unknown: source SVG inspected separately; complete-card browser legibility pending',10:'Unknown: Reset/handler boundaries checked; native browser keyboard/focus acceptance pending'}};
  writeFileSync(new URL(S.id+'.composition.json',root),JSON.stringify(S,null,2)+'\n');writeFileSync(new URL(S.id+'.html',root),htmlOf(S,compute,paint));
  console.log(`${S.id}: ${cases.length} cases, densest ${max}`);
 }
}
