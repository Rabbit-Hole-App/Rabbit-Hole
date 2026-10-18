import {test} from 'node:test';
import assert from 'node:assert/strict';
import {equationTransaction} from './inline-equation-apply.js';
const result={kind:'equation',latex:'x^2'};
test('new equation is a native detached transaction, not a card or bitmap',()=>{const made=equationTransaction(result,{point:{x:10,y:20},requestId:'r'});assert.equal(made.ok,true);assert.deepEqual(made.tx.additions[0].after,{id:'equation-r',kind:'equation',x:10,y:20,latex:'x^2',size:24});assert.deepEqual(made.tx.changes,[]);assert.equal(equationTransaction(result,{point:{x:10,y:20},requestId:'r',taken:['equation-r']}).ok,false);});
test('replacement retains identity, position, style and unrelated fields; stale and read-only refuse',()=>{const item={id:'a',kind:'equation',latex:'x',x:10,y:20,color:'red',size:40};const made=equationTransaction(result,{item,frozen:{...item}});assert.equal(made.ok,true);assert.deepEqual(made.tx.changes[0].after,{...item,latex:'x^2'});assert.equal(item.latex,'x');assert.equal(equationTransaction(result,{item:{...item,x:11},frozen:item}).ok,false);assert.equal(equationTransaction(result,{item,frozen:item,readOnly:true}).ok,false);});
