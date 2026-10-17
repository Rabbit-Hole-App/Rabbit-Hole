import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildContext,buildCreationContext,createContextCache,freezeTarget} from './inline-ai-context.js';
import {cadClient} from './cad-client.js';
const board={blocks:[{id:'drawing',type:'file',kind:'image',label:'Dimensioned drawing',mediaId:'media:0123456789ab',dx:0,dy:0},{id:'other',type:'file',kind:'image',label:'Unselected private image',dx:500,dy:0},{id:'note',type:'explanation',title:'Selected note',body:'40 mm plate',dx:0,dy:300}],items:[],shapes:[],links:[],groups:[],boxes:{drawing:{x:0,y:0,w:400,h:240},other:{x:500,y:0,w:400,h:240},note:{x:0,y:300,w:400,h:150}}};
const options=()=>({cache:createContextCache(),boardKey:'cad-fixture',request:'Build from the explicit drawing'});
const contextFor=ids=>buildContext(board,freezeTarget(board,ids),options());
test('explicit selected image reaches actual CAD create payload with semantic context intact',async()=>{
 const context=contextFor(['drawing']);let sent;
 const client=cadClient(async(path,init)=>{sent=JSON.parse(init.body);return {};},'canvas-a');
 await client.start({prompt:'Use the selected drawing',cardId:'c',requestId:'r',context});
 assert.deepEqual(sent.context.image,{id:'drawing',mediaId:'media:0123456789ab'});
 assert.deepEqual(sent.context.target.ids,['drawing']);assert.equal(sent.confirmed,true);
 assert.equal(sent.context.image.url,undefined);assert.equal(sent.context.image.assetKey,undefined);
});
test('multiple selected images attach at most the first explicit image',()=>{
 const context=contextFor(['drawing','other']);assert.deepEqual(context.image,{id:'drawing',mediaId:'media:0123456789ab'});assert.equal(Array.isArray(context.image),false);
});
test('nearby images and creation context do not inherit an image attachment',()=>{
 assert.equal(contextFor(['note']).image,undefined);
 assert.equal(buildCreationContext(board,{x:50,y:50},options()).image,undefined);
});
test('both CAD composers pass the existing selected-context image through without inheriting Chat image state',()=>{
 const page=readFileSync(new URL('./LearnPage.jsx',import.meta.url),'utf8'),editor=readFileSync(new URL('./InlineAiEditor.jsx',import.meta.url),'utf8');
 const start=page.slice(page.indexOf('const startCad ='),page.indexOf('const inlineAi ='));
 assert.match(start,/context:context \|\| destination\?\.cadContext\(prompt,askTarget\?\.id\)/);
 assert.doesNotMatch(start,/imageContext|imageAttached/);
 assert.match(editor,/options:\{context:made\.context/);
});
