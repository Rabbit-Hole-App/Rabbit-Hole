import test from 'node:test';
import assert from 'node:assert/strict';
import {transformTable} from './inline-table-tools.js';
const table={columns:['Name','Value'],rows:[['z','10'],['a','2'],['b','2'],['c','-1']]};
const freeze=value=>{Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return value;};
test('numeric sort is stable and preserves exact cell strings and frozen input',()=>{
  const input=freeze(structuredClone(table));
  const result=transformTable(input,{operation:'sort',column:'Value',direction:'asc'});
  assert.equal(result.ok,true);assert.deepEqual(result.content.rows,[['c','-1'],['a','2'],['b','2'],['z','10']]);
  assert.deepEqual(input,table);assert.notEqual(result.content.rows,input.rows);
  assert.deepEqual(transformTable(input,{operation:'sort',column:1,direction:'desc'}).content.rows,[['z','10'],['a','2'],['b','2'],['c','-1']]);
});
test('numeric sorting does not collapse different large integer values',()=>{
  const result=transformTable({columns:['n'],rows:[['9007199254740993'],['9007199254740992'],['9e15']]},{operation:'sort',column:0});
  assert.deepEqual(result.content.rows,[['9e15'],['9007199254740992'],['9007199254740993']]);
});
test('mixed text sorting requires explicit text mode and reports its limitation',()=>{
  const input={columns:['x'],rows:[['2 kg'],['10 kg'],['']]};
  assert.equal(transformTable(input,{operation:'sort',column:0}).ok,false);
  const result=transformTable(input,{operation:'sort',column:0,sortType:'text'});
  assert.deepEqual(result.content.rows,[[''],['10 kg'],['2 kg']]);assert.ok(result.limitations.some(s=>s.includes('literal')));
});
test('deduplicate removes only exact whole rows by default, preserving first occurrence',()=>{
  const input={columns:['x','y'],rows:[['a','1'],['a','2'],['a','1'],['A','1'],['a ','1']]};
  const result=transformTable(input,{operation:'deduplicate'});
  assert.deepEqual(result.content.rows,[['a','1'],['a','2'],['A','1'],['a ','1']]);
  assert.deepEqual(transformTable(input,{operation:'deduplicate',column:0}).content.rows,[['a','1'],['A','1'],['a ','1']]);
});
test('explicit scaling is exact decimal arithmetic and preserves other columns',()=>{
  const result=transformTable({columns:['n','note'],rows:[['0.1','keep'],['-1.25','unchanged'],['1e3','literal']]},
    {operation:'scale',column:'n',factor:3,unitFrom:'m',unitTo:'scaled m'});
  assert.equal(result.ok,true);assert.deepEqual(result.content.rows,[['0.3','keep'],['-3.75','unchanged'],['3000','literal']]);
  assert.deepEqual(result.content.columns,['n','note']);assert.ok(result.limitations.length>0);
});
test('scale refuses units, expressions, blanks and partial numbers without partial output',()=>{
  for(const cell of ['1 kg','1,000','=1+1','NaN','Infinity',' 2','', '1e9999']){
    const result=transformTable({columns:['x'],rows:[['2'],[cell]]},{operation:'scale',column:0,factor:2,unitFrom:'m',unitTo:'cm'});
    assert.equal(result.ok,false,cell);assert.equal(result.content,undefined);
  }
});
test('scale requires explicit units and a finite numeric factor, never coerces strings',()=>{
  for(const extra of [{factor:2},{factor:'2',unitFrom:'m',unitTo:'cm'},{factor:Infinity,unitFrom:'m',unitTo:'cm'},{factor:2,unitFrom:' ',unitTo:'cm'}])
    assert.equal(transformTable(table,{operation:'scale',column:1,...extra}).ok,false);
});
test('malformed, ambiguous, excessive and unknown transform requests refuse',()=>{
  const invalid=[null,{columns:['x'],rows:[[1]]},{columns:['x'],rows:[[]]},{columns:[],rows:[]},{columns:['x'],rows:Array.from({length:10001},()=>['1'])}];
  for(const input of invalid)assert.equal(transformTable(input,{operation:'sort',column:0}).ok,false);
  for(const spec of [null,{operation:'eval'},{operation:'sort',column:-1},{operation:'sort',column:0,direction:'random'},{operation:'deduplicate',prompt:'discard data'}])
    assert.equal(transformTable(table,spec).ok,false);
  assert.equal(transformTable({columns:['x','x'],rows:[['1','2']]},{operation:'sort',column:'x'}).ok,false);
});
test('empty and unchanged tables succeed without invented changes',()=>{
  const empty=transformTable({columns:['x'],rows:[]},{operation:'deduplicate'});
  assert.deepEqual(empty.content,{columns:['x'],rows:[]});assert.deepEqual(empty.changes,[]);
  const result=transformTable({columns:['x'],rows:[['a'],['b']]},{operation:'sort',column:0,sortType:'text'});assert.deepEqual(result.changes,[]);
});
test('scaling preserves signed decimals without binary rounding and rejects overflow',()=>{
  const apply=(cell,factor)=>transformTable({columns:['x'],rows:[[cell]]},{operation:'scale',column:0,factor,unitFrom:'a',unitTo:'b'});
  assert.deepEqual(apply('1.20',0.1).content.rows,[['0.12']]);
  assert.deepEqual(apply('-0.00',100).content.rows,[['0']]);
  assert.deepEqual(apply('1',1e-7).content.rows,[['0.0000001']]);
  assert.equal(apply('1e308',10).ok,false);
});
test('sparse input and duplicate-name ambiguity refuse; output mutations cannot affect original',()=>{
  for(const input of [{columns:Array(1),rows:[]},{columns:['x'],rows:Array(1)},{columns:['x'],rows:[Array(1)]}])
    assert.equal(transformTable(input,{operation:'deduplicate'}).ok,false);
  const input=structuredClone(table),result=transformTable(input,{operation:'sort',column:1});
  result.content.rows[0][0]='changed';result.content.columns[0]='changed';result.changes[0].before[0]='changed';
  assert.deepEqual(input,table);
});
