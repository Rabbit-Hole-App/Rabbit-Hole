import test from 'node:test';
import assert from 'node:assert';
import { summaryRecords, summaryParameters, derived } from './topic-summarization-data.js';
import { references } from './composition-summarization-references.js';
import { parseTutorDiagram } from './spec.js';
import { lintDiagramContent } from './content-contract.js';
import { renderTutorDiagram } from './TutorDiagram.js';

test('C06 raw body and supplied lead fields are complete independent authored text',()=>{
 const d=derived();assert.strictEqual(d.counts.records,summaryRecords.length);
 assert.strictEqual(new Set(summaryRecords.map(row=>row.id)).size,summaryRecords.length);
 for(const row of summaryRecords){assert.ok(row.source.length<=40);assert.ok(row.lead.length<=40);assert.notStrictEqual(row.source,row.lead);}
 const standard=references[0].spec.diagram;
 assert.deepStrictEqual(standard.columns,d.standardFields.map(field=>field.label));
 assert.deepStrictEqual(standard.rows.map(row=>row.cells),summaryRecords.map(row=>d.standardFields.map(field=>row[field.key])));
 assert.match(standard.caption,/supplied|Supplied/);assert.match(standard.caption,/before.*format/i);
 assert.strictEqual(standard.rows.length,summaryRecords.length);
});
test('C06 row and field reordering preserves keyed source/lead pairs',()=>{
 const d=derived(),deep=references[0].depths.deep.spec.diagram;
 assert.deepStrictEqual(d.reordered.map(row=>row.id),summaryParameters.recordOrder);
 assert.deepStrictEqual(deep.columns,d.deepFields.map(field=>field.label));
 assert.notDeepStrictEqual(d.deepFields,d.standardFields);assert.notDeepStrictEqual(d.reordered,d.records);
 for(const [i,row]of deep.rows.entries()){
  const keyed=Object.fromEntries(d.deepFields.map((field,j)=>[field.key,row.cells[j]]));
  assert.deepStrictEqual(keyed,summaryRecords.find(record=>record.id===keyed.id));
  assert.strictEqual(row.heading,'Row '+(i+1));
 }
 assert.match(deep.caption,/mapsto/);
});
test('C06 summary native tables parse and fit408 without truncating text',()=>{
 const ref=references[0];assert.deepStrictEqual(ref.lessons,['01']);
 for(const view of Object.values(ref.depths))for(const spec of Object.values(view)){
 assert.doesNotThrow(()=>parseTutorDiagram(spec));assert.deepStrictEqual(lintDiagramContent(spec),[]);
 assert.strictEqual(renderTutorDiagram(spec,408).width,408);assert.ok(renderTutorDiagram(spec,680).width<=680);
 }
});
