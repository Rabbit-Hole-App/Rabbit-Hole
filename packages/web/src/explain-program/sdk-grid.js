import { ROLES } from '../scene-vocab.js';

// Trusted guest source. Grids and readouts emit the same boxed labels the scene gate already accepts.
export const GRID_SOURCE = String.raw`
(function () {
  const roles = ${JSON.stringify(ROLES)};
  const gap = 6;

  function checkBox(id, options, helper) {
    if (!options || typeof options !== 'object') throw new Error(helper + ' needs a layout configuration');
    const { x, y, w, h, role } = options;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_.:-]{1,48}$/.test(id)) throw new Error(helper + ' needs a valid short id');
    if (![x, y, x + w, y + h].every(value => Number.isFinite(value) && Math.abs(value) <= 100000)
        || ![w, h].every(value => Number.isFinite(value) && value > 0 && value <= 2000)) {
      throw new Error(helper + ' needs a finite layout rectangle');
    }
    if (role !== undefined && !roles.includes(role)) throw new Error(helper + ' needs a Frame role');
  }

  function labelWidth(text) {
    // Approximate a 16 px SVG label with room for padding and wide glyphs.
    return Math.max(32, [...text].reduce((width, char) => width + (/[ilI1 .,]/.test(char) ? 5 : /[A-ZmwMW@]|[^\x00-\x7f]/.test(char) ? 16 : 10), 14));
  }

  function cellText(value) {
    if (value === null) return '';
    if (typeof value === 'string' && value.length <= 32 && !/[\x00-\x1f\x7f\u2028\u2029\ud800-\udfff\ufffe\uffff]/u.test(value)) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    throw new Error('grid cell value must be short text, a finite number or null');
  }

  function labels(value, count, axis) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length !== count
        || [...value].some(label => typeof label !== 'string' || !label.trim() || label.length > 24 || /[\x00-\x1f\x7f\u2028\u2029\ud800-\udfff\ufffe\uffff]/u.test(label))) {
      throw new Error('grid needs one short ' + axis + ' label per ' + axis);
    }
    return value;
  }

  sdk.grid = function (id, options) {
    checkBox(id, options, 'grid');
    const { x, y, w, h, rows, rowLabels, columnLabels, active = [], role = 'neutral' } = options;
    const cols = Array.isArray(rows?.[0]) ? rows[0].length : 0;
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 6 || cols < 1 || cols > 6
        || [...rows].some(row => !Array.isArray(row) || row.length !== cols)) {
      throw new Error('grid needs rectangular rows with 1–6 rows and columns');
    }
    const values = rows.map(row => [...row].map(cellText));
    const leftLabels = labels(rowLabels, rows.length, 'row');
    const topLabels = labels(columnLabels, cols, 'column');
    const gutter = leftLabels.length ? Math.max(...leftLabels.map(labelWidth)) + gap : 0;
    const header = topLabels.length ? 28 : 0;
    const cellW = (w - gutter - (cols - 1) * gap) / cols;
    const cellH = (h - header - (rows.length - 1) * gap) / rows.length;
    if (cellW < Math.max(...values.flat().map(labelWidth), ...topLabels.map(labelWidth)) || cellH < 28) {
      throw new Error('grid needs more room for its cells and labels');
    }
    if (!Array.isArray(active) || active.length > rows.length * cols
        || [...active].some(pair => !Array.isArray(pair) || pair.length !== 2 || !Number.isInteger(pair[0])
          || !Number.isInteger(pair[1]) || pair[0] < 0 || pair[0] >= rows.length || pair[1] < 0 || pair[1] >= cols)) {
      throw new Error('grid active entries must point to an existing cell');
    }
    const selected = new Set(active.map(([r, c]) => r + ':' + c));
    const cellX = c => x + gutter + c * (cellW + gap);
    const cellY = r => y + header + r * (cellH + gap);
    const center = { align: 'middle' };
    return [
      ...topLabels.map((label, c) => sdk.text(id + '.col' + c, cellX(c) + cellW / 2, y + 18, label, center)),
      ...leftLabels.map((label, r) => sdk.text(id + '.row' + r, x + (gutter - gap) / 2, cellY(r) + cellH / 2 + 5, label, center)),
      ...values.flatMap((row, r) => row.map((value, c) =>
        sdk.box(id + '.r' + r + 'c' + c, cellX(c), cellY(r), cellW, cellH,
          { ...(value ? { text: value } : {}), role: selected.has(r + ':' + c) ? 'learner' : role }))),
    ];
  };

  sdk.readout = function (id, options) {
    checkBox(id, options, 'readout');
    const { x, y, w, h, label, value, unit = '', decimals = 2, role = 'output' } = options;
    if (typeof label !== 'string' || !label.trim() || label.length > 36 || /[\x00-\x1f\x7f\u2028\u2029\ud800-\udfff\ufffe\uffff]/u.test(label)
        || typeof unit !== 'string' || unit.length > 12 || /[\x00-\x1f\x7f\u2028\u2029\ud800-\udfff\ufffe\uffff]/u.test(unit)) {
      throw new Error('readout needs a short label and unit');
    }
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error('readout needs a finite value within ±1e12');
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) throw new Error('readout decimals must be 0–6');
    const text = label + ': ' + sdk.format(value, decimals) + (unit ? ' ' + unit : '');
    if (w < labelWidth(text) || h < 28) throw new Error('readout needs more room for its label');
    return [sdk.box(id, x, y, w, h, { text, role })];
  };
})();
`;
