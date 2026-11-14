import { derived } from './topic-summarization-data.js';
import manifest from './topic-summarization-sources.json' with { type: 'json' };
const d = derived();
const spec = diagram => ({ version: 1, diagram });
const overview = { kind: 'matrix', layout: 'teaching', title: 'A supplied body and lead form one raw pair', columns: ['Role', 'Text'], rows: d.overview,
  caption: 'Toy raw supervised fields: observed body and supplied lead. No task marker or model-input formatting is shown.' };
const pairs = (records, fields, deep = false) => ({ kind: 'matrix', layout: 'teaching', title: deep ? 'Reorder records and fields, keep every pair' : 'Raw source bodies paired with supplied leads',
  columns: fields.map(field => field.label), rows: records.map((record, i) => ({ id: record.id, heading: 'Row ' + d.positions[i], cells: fields.map(field => record[field.key]) })),
  caption: deep ? 'Reordering rows and fields preserves $D_i\\mapsto S_i$ by record identity. Supplied lead stays the target; model formatting is later.'
    : 'Toy supplied body/lead pairs before model-input formatting. Row position may change; each record keeps its source and target fields.' });
const standard = pairs(d.records, d.standardFields), deep = pairs(d.reordered, d.deepFields, true);
const row = manifest.references.find(entry => entry.queueId === 'ml-summarization-supervised-summary-pair');
const paraphrases = ['Show raw summarization pairs before adding a task marker.', 'Keep source bodies attached to supplied leads in body lead supervision.', 'Reorder raw summarization pairs without swapping their target summaries.', 'Which fields are supplied in body lead supervision?', 'Show body lead supervision without claiming generated summaries.'];
const depths = { overview: { spec: spec(overview) }, standard: { spec: spec(standard) }, deep: { spec: spec(deep) } };
export const references = Object.freeze([{
  id: row.referenceId, topic: row.topic, lessons: row.lessons,
  sources: [{ kind: 'figure-brief', path: row.source.brief, revision: manifest.sourceRevision }],
  prompts: [row.source.summary, ...paraphrases], paraphrases, keywords: ['raw summarization pairs', 'body lead supervision'],
  useWhen: 'Show raw summarization pairs and body lead supervision before formatting; not task separators, translation, generated outputs, summary-quality scores or a complete summarization model.',
  ...depths.standard, depths,
}]);
export { derived };
