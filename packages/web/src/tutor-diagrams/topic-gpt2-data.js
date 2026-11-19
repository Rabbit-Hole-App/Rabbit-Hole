import {derived as capacityDerived} from './topic-model-capacity-data.js';
const M=capacityDerived().M[0];
export const parameters=Object.freeze({markers:{start:'<s>',boundary:'<d>',readout:'<r>',stop:'</s>'},wrapperModel:'thetaW',decoderModel:'thetaD',
 tasks:[{id:'single',heading:'Single',fields:[['bright','day']],readoutId:'rC',readoutRole:'Final'},{id:'pair',heading:'Pair',fields:[['rain'],['wet']],readoutId:'rE',readoutRole:'Final'},
 {id:'similarityAB',heading:'Similarity AB',fields:[['hot'],['warm']],readoutId:'rAB',readoutRole:'Keep'},{id:'similarityBA',heading:'Similarity BA',fields:[['warm'],['hot']],readoutId:'rBA',readoutRole:'Keep'},
 {id:'choiceA',heading:'Choice A',fields:[['sky'],['blue']],readoutId:'rA',readoutRole:'Separate'},{id:'choiceB',heading:'Choice B',fields:[['sky'],['green']],readoutId:'rB',readoutRole:'Separate'}],
 translation:{source:['birds','fly'],target:['oiseaux','volent']},summary:{document:['Crews','reopen','a','trail.'],chosen:['Trail','open','</s>']},
 architecture:{name:'GPT-2',width:M.width,inner:M.inner,norms:[{id:'na',label:'Attention LayerNorm'},{id:'nf',label:'FFN LayerNorm'}],residuals:[{kind:'residual',from:'na',to:'a',merge:'add'},{kind:'residual',from:'nf',to:'f',merge:'add'}]}});
export function derived(){const p=parameters,m=p.markers,tasks=p.tasks.map(row=>({...row,model:p.wrapperModel,serialized:m.start+row.fields.map(field=>field.join(' ')).join(m.boundary)+m.readout,readoutLabel:row.readoutRole+' '+row.readoutId}));
 const prefixRows=(input,outputs,provenance,tag)=>outputs.map((next,i)=>({id:tag+i,heading:tag+i+' '+provenance.toLowerCase(),model:p.decoderModel,provenance,next,prefix:m.start+input.join(' ')+m.boundary+(i?outputs.slice(0,i).join(' '):'')}));
 const prefixes=[...prefixRows(p.translation.source,p.translation.target,'Observed','T'),...prefixRows(p.summary.document,p.summary.chosen,'Chosen','G')];
 return{parameters:p,tasks,reorderedTasks:[...tasks.slice(0,4),...tasks.slice(4).reverse()],prefixes,overviewPrefixes:[prefixes[0],prefixes[p.translation.target.length]],counts:{norms:p.architecture.norms.length,residuals:p.architecture.residuals.length,taskCalls:tasks.length,prefixes:prefixes.length}};
}
