import test from 'node:test';import assert from 'node:assert/strict';
import {validateImageAction} from './inline-image-action.js';
import {freezeInlineTools} from './inline-tool-plan.js';
const block={id:'image',type:'image',assetKey:'saved',dx:0,dy:0};
const board={blocks:[block],items:[],shapes:[],links:[]};
const frozen={requestId:'request',toolSnapshot:freezeInlineTools(board,['image'])};
const action={kind:'image_action',action:'edit_image',targetId:'image',requestId:'request',summary:'Choose a region'};
test('image action is a nonmutating frozen selection handoff',()=>{const before=JSON.stringify(board);const result=validateImageAction(action,frozen,board);assert.equal(result.ok,true);assert.equal(result.preview.action,'edit_image');assert.equal(JSON.stringify(board),before);assert.notEqual(result.preview.raw,action);});
test('foreign request, injected model prompt, changed source and revoked permissions refuse',()=>{
 for(const args of [[{...action,requestId:'other'},frozen,board],[{...action,prompt:'model rewritten'},frozen,board],[action,frozen,{...board,blocks:[{...block,assetKey:'new'}]}],[action,frozen,board,{readOnly:true}],[action,frozen,board,{locked:true}]])assert.equal(validateImageAction(...args).ok,false);
});
