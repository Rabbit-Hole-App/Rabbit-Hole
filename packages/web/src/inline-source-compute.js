import { computeTable } from './inline-compute.js';

const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));
const text = (value, max) => typeof value === 'string' && !!value.trim() && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const fail = reason => ({ ok: false, reason });

// Recognition remains unverified. Only numerical conversion/plot construction is deterministic.
// No reads, model calls, source mutation, or acceptance happen here.
export function computeRecognizedSourcePlot(input) {
  if (!only(input, ['table', 'operation', 'uncertainties'])) return fail('Use one recognized table, plot operation and uncertainty list.');
  const { table, operation, uncertainties } = input;
  if (!only(table, ['columns', 'rows']) || !Array.isArray(table.columns) || table.columns.length < 2 || table.columns.length > 8
    || !table.columns.every(value => text(value, 128)) || !Array.isArray(table.rows) || !table.rows.length || table.rows.length > 100
    || !table.rows.every(row => Array.isArray(row) && row.length === table.columns.length && row.every(value => typeof value === 'string' && value.length <= 128))
    || JSON.stringify(table).length > 16000) return fail('Review a recognized table of at most 100 rows, eight columns and 16000 characters.');
  if (!only(operation, ['type', 'columns', 'units', 'xColumn', 'xUnit']) || operation.type !== 'table_plot') return fail('Only an explicit numeric plot is supported for recognized pages.');
  if (!Array.isArray(uncertainties) || uncertainties.length > 8 || uncertainties.some(value => !only(value, ['location', 'message']) || !text(value.location, 120) || !text(value.message, 240))) return fail('Include a bounded recognition uncertainty list.');
  const computed = computeTable(table, { ...operation, targetId: 'recognized-source-table' });
  if (!computed.ok) return computed;
  return { ...computed, table: structuredClone(table), operation: structuredClone(operation), uncertainties: structuredClone(uncertainties),
    content: { ...computed.content, title: 'Plot of recognized PDF values', concept: 'Values recognized from selected extracted page text. Review cells and recognition uncertainty; the original PDF dataset was not independently verified.' },
    limitations: ['Recognized cells may be incorrect or incomplete, even when no uncertainty was reported. This is not an exact verified source dataset.', 'Only the selected extracted PDF page text was read; partial coverage remains partial.', ...computed.limitations] };
}
