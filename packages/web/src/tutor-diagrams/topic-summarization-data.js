// Entire independently authored toy fields, before any model/task-marker formatting.
export const summaryRecords = Object.freeze([
  { id: 'A', source: 'Volunteers opened a food pantry.', lead: 'A volunteer food pantry opens.' },
  { id: 'B', source: 'Snow closed the road; crews cleared it.', lead: 'Crews cleared a snowbound road.' },
]);
export const summaryParameters = Object.freeze({ recordOrder: ['B', 'A'], standardFieldOrder: ['id', 'source', 'lead'], deepFieldOrder: ['lead', 'id', 'source'] });
const names = { id: 'Record', source: 'Source body', lead: 'Supplied lead' };
export function derived() {
  const records = summaryRecords.map(row => ({ ...row }));
  const reordered = summaryParameters.recordOrder.map(id => ({ ...records.find(row => row.id === id) }));
  const standardFields = summaryParameters.standardFieldOrder.map(key => ({ key, label: names[key] }));
  const deepFields = summaryParameters.deepFieldOrder.map(key => ({ key, label: names[key] }));
  return { records, reordered, standardFields, deepFields, positions: records.map((_, i) => i + 1),
    overview: [{ id: 'source', heading: 'Source', cells: ['Observed body', records[0].source] }, { id: 'target', heading: 'Target', cells: ['Supplied lead', records[0].lead] }],
    counts: { records: records.length, fields: standardFields.length } };
}
