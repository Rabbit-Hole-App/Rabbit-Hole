import { derived } from './topic-embeddings-data.js';
import manifest from './topic-embeddings-sources.json' with { type: 'json' };
const d = derived(), p = d.parameters, spec = diagram => ({ version: 1, diagram });
const table = (name, probe = false, overview = false) => { const data = probe ? d.probe : d.base, ids = name === 'E' ? [p.centerId] : p.contextIds, indices = overview ? p.vocabulary.slice(0, 2).map(row => d.idToRow[row.id]) : p.vocabulary.map(row => d.idToRow[row.id]);
  return { kind: 'heatmap', title: `${name}: returned ${name === 'E' ? 'center vector' : 'context vectors'} by stable id`, rowLabel: 'Token id / word', columnLabel: 'Vector feature', columns: Array.from({ length: d.width }, (_, i) => String(i)), rows: indices.map(i => ({ label: d.labels[i], cells: data[name][i] })), range: d.range,
    highlights: indices.flatMap((i, row) => ids.includes(p.vocabulary[i].id) ? Array.from({ length: d.width }, (_, column) => ({ row, column })) : []),
    caption: probe ? name === 'E' ? `Probe edits unselected C rows; returned $E'[${p.centerId},:]=E[${p.centerId},:]$. Independent E table and its highlighted vector stay fixed.`
      : `Only unselected $C[${d.unselectedContextIds.join('],C[')}]$ edited. Returned $C[${p.contextIds.join(',:],C[')},:]$ strips stay fixed; E independent.`
      : name === 'E' ? `Toy lookup $T[id,:]$; returned $E[${p.centerId},:]$ is the highlighted vector. Stable ids, width $${d.width}$.`
        : `Toy lookup $T[id,:]$; returned $C[${p.contextIds.join(',:],C[')},:]$ are highlighted strips. E/C tables independent; width $${d.width}$.` };
};
const entry = manifest.references.find(row => row.queueId === 'ml-embeddings-embedding-table-lookups');
const paraphrases = ['Show indexed vector retrieval with stable vocabulary ids.', 'Select a center and two context rows from independent lookup tables.', 'Why do independent lookup tables give different vectors for the same id?', 'Keep selected outputs fixed when unselected rows change in indexed vector retrieval.', 'Show several returned strips through shared indexed vector retrieval.'];
const depths = { overview: { spec: spec(table('E', false, true)) }, standard: { spec: spec(table('E')), detailSpec: spec(table('C')) }, deep: { spec: spec(table('E', true)), detailSpec: spec(table('C', true)) } };
export const references = Object.freeze([{ id: entry.referenceId, topic: entry.topic, lessons: entry.lessons, sources: [entry.source, ...entry.alsoCovers].map(source => ({ kind: 'figure-brief', path: source.brief, revision: manifest.sourceRevision })), prompts: [entry.source.summary, ...entry.alsoCovers.map(source => source.summary), ...paraphrases], paraphrases, keywords: ['indexed vector retrieval', 'independent lookup tables'],
  useWhen: 'Show stable-id numeric row retrieval from independent center/context tables; not position addition, contextual states, shared weights, scoring or a claimed training update.', ...depths.standard, depths }]);
export { derived };
