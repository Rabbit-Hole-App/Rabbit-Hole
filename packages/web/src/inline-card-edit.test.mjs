import test from 'node:test';
import assert from 'node:assert/strict';
import { cardEditSpec, validateCardContent } from './inline-card-edit.js';

test('structured explanation edit preserves identity, provenance links and current layout', () => {
 const block = {id:'a',type:'explanation',title:'Title',body:'**Bold** $x$',more:[{label:'Why',text:'Detail'}],dx:12,cardLayout:{mode:'full',fullWidth:720},refs:[{id:'r'}]};
 const spec=cardEditSpec(block); assert.equal(spec.ok,true);
 const out=validateCardContent(block,{...spec.content,body:'## Heading\n\n- Item $x$'});
 assert.equal(out.ok,true); assert.equal(out.after.id,'a'); assert.equal(out.after.cardLayout,block.cardLayout); assert.equal(out.after.refs,block.refs); assert.deepEqual(out.after.more,block.more);
 assert.equal(validateCardContent(block,{...spec.content,id:'other'}).ok,false);
 assert.equal(validateCardContent(block,{body:'Only body'}).ok,false);
});
test('unsafe snapshots, citation-bearing cards and hidden assessment material are refused', () => {
 for (const patch of [{sources:[{kind:'paper'}]},{fileRef:{}},{anchor:{}},{citations:[1]}]) assert.equal(cardEditSpec({type:'explanation',title:'T',body:'B',...patch}).ok,false);
 for(const type of ['quiz','code','notebook','paper','pdf','video','canvas-ref']) assert.equal(cardEditSpec({type}).ok,false);
});
test('table stays rectangular and snippet code invalidates derived output only when changed', () => {
 const table={type:'table',title:'T',columns:['A','B'],rows:[['1','2']]};
 assert.equal(validateCardContent(table,{...cardEditSpec(table).content,rows:[['1']]}).ok,false);
 const snippet={type:'snippet',title:'S',brief:'B',code:'print(1)',output:'1'};
 assert.equal(validateCardContent(snippet,{...cardEditSpec(snippet).content,title:'New'}).after.output,'1');
 assert.equal(validateCardContent(snippet,{...cardEditSpec(snippet).content,code:'print(2)'}).after.output,'');
});

import { buildContext, createContextCache, freezeTarget, clippedOf, staleness } from './inline-ai-context.js';
import { validateEdit, editTx, applyTx, describeChange } from './inline-ai-apply.js';
import { earlierResult, createInlineSession } from './inline-ai-session.js';

const boardOf = block => ({blocks:[block],items:[],shapes:[],links:[],groups:[],exchanges:[]});
const prepareCard = board => {
 const target=freezeTarget(board,['a']), cache=createContextCache();
 const context=buildContext(board,target,{cache,boardKey:'b'});
 return {context,cache,frozen:{...target,prints:context.prints,clipped:clippedOf(context)}};
};
test('complete structured context and transactional preview survive a layout change, reject changed content', () => {
 const original={id:'a',type:'explanation',title:'T',body:'Body',more:[{label:'Detail',text:'$x$'}],cardLayout:{mode:'scrollable'},dx:7};
 const board=boardOf(original), {context,cache,frozen}=prepareCard(board);
 assert.deepEqual(context.target.objects[0].editable.content.more,original.more);
 const moved=boardOf({...original,dx:100,cardLayout:{mode:'full',fullWidth:900}});
 assert.equal(staleness(frozen,moved,cache,'b').content,false);
 assert.equal(staleness(frozen,boardOf({...original,body:'Concurrent'}),cache,'b').content,true);
 const op={op:'replace_card_content',id:'a',content:{...context.target.objects[0].editable.content,body:'## Revised'}};
 const out=validateEdit({ops:[op]},frozen,moved); assert.equal(out.ok,true);
 assert.match(describeChange(out.changes[0]).after,/Revised/);
 const applied=applyTx(moved,editTx({requestId:'q',changes:out.changes}));
 assert.equal(applied.blocks[0].cardLayout.fullWidth,900); assert.equal(applied.blocks[0].dx,100);
 assert.equal(board.blocks[0].body,'Body','proposal did not mutate saved content');
 assert.equal(validateEdit({ops:[{...op,id:'not-selected'}]},frozen,moved).ok,false);
});
test('oversized card is explicitly incomplete and cannot be rewritten from clipped context', () => {
 const board=boardOf({id:'a',type:'explanation',title:'T',body:'x'.repeat(5000)});
 const {context,frozen}=prepareCard(board);
 assert.equal(context.target.objects[0].truncated,true); assert.equal(context.target.objects[0].editable,undefined);
 assert.equal(validateEdit({ops:[{op:'replace_card_content',id:'a',content:{title:'T',body:'Short'}}]},frozen,board).ok,false);
});
test('bounded conversation and source references identify listing rather than source reading', () => {
 const board=boardOf({id:'a',type:'explanation',title:'T',body:'B'}), target=freezeTarget(board,['a']);
 const context=buildContext(board,target,{cache:createContextCache(),boardKey:'b',extras:{conversation:[{role:'user',text:'Tell me why'}],sources:[{kind:'paper',sourceId:'s',title:'Reference',coverage:'full',secret:'NO'}]}});
 assert.equal(context.metadata.conversation[0].text,'Tell me why'); assert.equal(context.metadata.sources[0].coverage,'listed'); assert.equal(context.metadata.sources[0].secret,undefined);
 const only=buildContext(board,target,{cache:createContextCache(),boardKey:'b',selectionOnly:true,extras:{conversation:[{role:'user',text:'hidden'}]}});
 assert.equal(only.metadata.conversation,undefined);
});
test('structured Refine uses the full candidate or refuses, never truncated JSON', () => {
 const raw={ops:[{op:'replace_card_content',id:'a',content:{body:'Previous candidate'}}]};
 assert.deepEqual(JSON.parse(earlierResult({kind:'edit',raw})).ops,raw.ops);
 assert.equal(earlierResult({kind:'edit',raw:{ops:[{op:'replace_card_content',content:{body:'x'.repeat(9000)}}]}}),null);
});
test('complete-content preflight refusal invokes no transport and changes no board', async () => {
 let calls=0;
 const session=createInlineSession({boardKey:'b',transport:{decide:()=>{calls++;},generate:()=>{calls++;}},validate:()=>({ok:true})});
 assert.equal(await session.submit({mode:'edit',prompt:'Improve',prepare:()=>({error:'Too large'})}),'unsupported');
 assert.equal(calls,0); assert.equal(session.state.error,'Too large');
});
