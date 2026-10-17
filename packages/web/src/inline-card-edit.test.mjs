import test from 'node:test';
import assert from 'node:assert/strict';
import { cardEditSpec, validateCardContent, cardEditComparison, cardEditText } from './inline-card-edit.js';

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

test('untrusted inherited card types are refused rather than crashing', () => {
 for (const type of ['__proto__','constructor','toString','hasOwnProperty']) {
   assert.equal(cardEditSpec({type}).ok,false);
   assert.equal(validateCardContent({type},{body:'bad'}).ok,false);
 }
});
test('structured representation and metadata share the declared total context budget', () => {
 const board=boardOf({id:'a',type:'explanation',title:'T',body:'x'.repeat(1000)});
 const context=buildContext(board,freezeTarget(board,['a']),{cache:createContextCache(),boardKey:'b',limits:{objects:24,targetChars:4000,chars:400,total:2200,connections:40,relevant:0.35,hops:3,flowGap:48},extras:{title:'t'.repeat(200),goal:'g'.repeat(300),conversation:[{role:'user',text:'q'.repeat(1000)}],sources:[{kind:'paper',title:'p'.repeat(200)}]}});
 assert.ok(context.size.chars<=2200);
 assert.ok(context.omitted.metadata+context.omitted.conversation+context.omitted.sources>0);
 assert.ok(context.target.objects[0].editable);
});

test('a clipped target includes its ellipsis inside the total character budget', () => {
 const board=boardOf({id:'a',type:'explanation',title:'T',body:'x'.repeat(5000)});
 const context=buildContext(board,freezeTarget(board,['a']),{cache:createContextCache(),boardKey:'b',limits:{objects:24,targetChars:4000,chars:400,total:100,connections:40,relevant:0.35,hops:3,flowGap:48}});
 assert.ok(context.size.chars<=100); assert.equal(context.target.objects[0].truncated,true);
});

test('prose source links and footnotes cannot be rewritten or introduced without grounding', () => {
 for (const body of ['A [claim](https://example.com/paper).','Claim [source][paper].','Claim[^1].','[paper]: https://example.com/paper']) {
  assert.equal(cardEditSpec({type:'explanation',body}).ok,false,body);
  assert.equal(validateCardContent({type:'explanation',body:'Plain'},{body}).ok,false,body);
 }
 assert.equal(cardEditSpec({type:'explanation',body:'See https://example.com as plain text.'}).ok,true,'ordinary URL is not a structured reference');
});
test('Markdown examples in snippet code, fenced code and inline code remain editable', () => {
 const code='[label](https://example.com)\n[^1]';
 assert.equal(cardEditSpec({type:'snippet',code}).ok,true);
 assert.equal(validateCardContent({type:'snippet',code:'old'},{code}).ok,true);
 for (const body of ['```md\n[label](https://example.com)\n```','~~~md\n[^1]\n~~~','Use `[label](url)` syntax.']) {
  assert.equal(cardEditSpec({type:'explanation',body}).ok,true,body);
  assert.equal(validateCardContent({type:'explanation',body:'Plain'},{body}).ok,true,body);
 }
 assert.equal(cardEditSpec({type:'explanation',body:'```md\n[label](url)\n```\nActual [claim](https://example.com)'}).ok,false);
});

test('structured preview exposes readable fields and original newlines rather than storage JSON', () => {
 const before={title:'Old',body:'First\n\nSecond',more:[{label:'Details',text:'Old detail'}]};
 const after={title:'New',body:'## Heading\n\n- Item $x$',more:[{label:'Reason',text:'New detail'}]};
 const fields=cardEditComparison(before,after);
 assert.equal(fields.find(field=>field.key==='body').before,'First\n\nSecond');
 assert.equal(fields.find(field=>field.key==='body').after,'## Heading\n\n- Item $x$');
 assert.equal(fields.find(field=>field.key==='section-0').previousLabel,'Details');
 assert.equal(fields.find(field=>field.key==='section-0').label,'Reason');
 const readable=cardEditText(after); assert.match(readable,/Body\n## Heading/); assert.doesNotMatch(readable,/"body":|\x5cn/);
 const table=cardEditComparison({columns:['A','B'],rows:[['1','2']]},{columns:['A','B'],rows:[['3','4']]}).find(field=>field.key==='table');
 assert.equal(table.after,'A | B\n--- | ---\n3 | 4');
 assert.equal(cardEditComparison({code:'a\nb'},{code:'c\nd'})[0].code,true);
});
