// Bounded numerical operations over supplied native table cells, never model-provided answers.
// The caller owns source access, frozen revision checks and preview/Accept.
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = value => typeof value === 'string' && value.length > 0 && value.length <= 80 && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
const fail = reason => ({ ok: false, reason });
function number(cell) {
  if (typeof cell !== 'string' || cell.length > 128 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(cell)) return null;
  const value = Number(cell);
  if (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)) return null;
  if (value === 0 && /[1-9]/.test(cell.split(/[eE]/)[0])) return null;
  return value;
}
// Neumaier compensated summation reduces cancellation error; it is not decimal exact arithmetic.
function summary(values) {
  let sum = 0, correction = 0, min = Infinity, max = -Infinity;
  for (const value of values) {
    const next = sum + value;
    correction += Math.abs(sum) >= Math.abs(value) ? (sum - next) + value : (value - next) + sum;
    sum = next; min = Math.min(min, value); max = Math.max(max, value);
  }
  const total = sum + correction, mean = total / values.length;
  if (![total, mean].every(Number.isFinite) || total !== 0 && mean === 0 || Number.isInteger(total) && !Number.isSafeInteger(total)) return null;
  const display = value => String(Number.isInteger(value) ? value : Number(value.toPrecision(15)));
  return [String(values.length), display(total), display(min), display(max), display(mean)];
}
export function computeTable(table, operation) {
  if (!record(table) || !Array.isArray(table.columns) || !table.columns.length || table.columns.length > 200 ||
      !Array.from(table.columns).every(value => typeof value === 'string' && value.length <= 2000) || !Array.isArray(table.rows) || !table.rows.length || table.rows.length > 10000 ||
      !Array.from(table.rows).every(row => Array.isArray(row) && row.length === table.columns.length && Array.from(row).every(value => typeof value === 'string')))
    return fail('Use a nonempty bounded native table with complete string rows.');
  if (JSON.stringify({ columns: table.columns, rows: table.rows }).length > 2000000) return fail('The table exceeds the local calculation limit.');
  if (!record(operation) || !['table_summary', 'table_plot'].includes(operation.type) ||
      Object.keys(operation).some(key => !['type', 'targetId', 'columns', 'units', ...(operation.type === 'table_plot' ? ['xColumn', 'xUnit'] : [])].includes(key)) ||
      typeof operation.targetId !== 'string' || !operation.targetId || operation.targetId.length > 200 ||
      !Array.isArray(operation.columns) || !operation.columns.length || operation.columns.length > 8 ||
      new Set(operation.columns).size !== operation.columns.length || !Array.from(operation.columns).every(index => Number.isInteger(index) && index >= 0 && index < table.columns.length) ||
      !Array.isArray(operation.units) || operation.units.length !== operation.columns.length || !Array.from(operation.units).every(label))
    return fail('Choose explicit unique column indexes and a unit for each column; use dimensionless when known.');
  const selected = operation.columns.map(index => table.rows.map(row => number(row[index])));
  if (selected.some(values => values.includes(null))) return fail('Selected cells must be finite decimal numbers without missing cells, formulas, unit suffixes or unsafe integers.');
  const evidence = { targetId: operation.targetId, columns: [...operation.columns], units: [...operation.units], rows: table.rows.length };
  const limitations = ['Uses only the supplied table rows. Declared units are not independently verified or converted.', 'Numerical values use IEEE-754 arithmetic; this is not symbolic mathematics or proof of a formula.'];
  if (operation.type === 'table_summary') {
    const stats = selected.map(summary);
    if (stats.includes(null)) return fail('A computed total exceeds the supported numeric precision.');
    limitations.push('Sums use compensated summation. Noninteger summary values are displayed to at most 15 significant digits.');
    return { ok: true, content: { type: 'table', columns: ['Column', 'Unit', 'Count', 'Sum', 'Minimum', 'Maximum', 'Mean'], rows: stats.map((values, index) => [table.columns[operation.columns[index]], operation.units[index], ...values]) }, evidence, limitations };
  }
  if (table.rows.length > 1000 || !Number.isInteger(operation.xColumn) || operation.xColumn < 0 || operation.xColumn >= table.columns.length ||
      operation.columns.includes(operation.xColumn) || !label(operation.xUnit) || new Set(operation.units).size !== 1)
    return fail('Plots require at most 1000 rows, an explicit distinct X column/unit, and identical declared units for all Y columns.');
  const x = table.rows.map(row => number(row[operation.xColumn]));
  if (x.includes(null)) return fail('The X column must contain complete finite numeric cells.');
  // Markers preserve measured row order without implying interpolation or a fitted function.
  const graph = { op: 'interactive_plot', id: 'computed-table', renderer: 'plotly', title: 'Selected table measurements', concept: 'Numeric values read from the selected table; no fitted curve or inferred data.',
    traces: selected.map((y, index) => ({ id: `column-${operation.columns[index]}`, type: 'scatter', x: [...x], y, label: table.columns[operation.columns[index]].slice(0, 100) })),
    xAxis: { label: `${table.columns[operation.xColumn]} (${operation.xUnit})`.slice(0, 100) }, yAxis: { label: operation.units[0] } };
  if (JSON.stringify(graph).length > 100000) return fail('The plot exceeds the existing graph size limit; select fewer rows or columns.');
  limitations.push('Points are plotted as supplied; no interpolation, regression, missing-value inference or unit conversion is performed.');
  return { ok: true, content: graph, evidence: { ...evidence, xColumn: operation.xColumn, xUnit: operation.xUnit }, limitations };
}
