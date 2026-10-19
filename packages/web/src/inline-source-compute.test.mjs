import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRecognizedSourcePlot } from './inline-source-compute.js';
const input = () => ({ table: { columns: ['Time', 'Length'], rows: [['0','2'],['1','4']] }, operation: { type: 'table_plot', columns: [1], units: ['mm'], xColumn: 0, xUnit: 's' }, uncertainties: [{location:'row 2',message:'Check recognition against the page.'}] });
test('recognized cells produce actual points without modifying source or claiming accurate extraction', () => {
 const value=input(), before=structuredClone(value), result=computeRecognizedSourcePlot(value);
 assert.equal(result.ok,true);assert.deepEqual(result.content.traces[0].x,[0,1]);assert.deepEqual(result.content.traces[0].y,[2,4]);assert.deepEqual(value,before);
 assert.match(result.limitations.join(' '),/not an exact verified source dataset/);assert.equal(result.uncertainties.length,1);
 result.table.rows[0][0]='changed';assert.equal(value.table.rows[0][0],'0');
});
test('refuse model answers, malformed/missing cells, unknown units and bounds instead of guessing',()=>{
 for(const mutate of [v=>{v.points=[];},v=>{v.operation.answer=42;},v=>{v.operation.targetId='foreign';},v=>{v.operation.units=[];},v=>{v.table.rows[0][1]='2 mm';},v=>{v.table.rows[0].pop();},v=>{v.table.rows=Array.from({length:101},()=>['0','2']);},v=>{v.uncertainties=[{location:'x',message:'ok',verified:true}];},v=>{v.operation.type='table_summary';},v=>{v.table.columns[0]='';}]){const value=input();mutate(value);assert.equal(computeRecognizedSourcePlot(value).ok,false);}
});
