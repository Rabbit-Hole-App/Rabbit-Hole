import { ROLES } from '../scene-vocab.js';

// Semantic figures (sdk-8, capability figures): axis, plot and diagram frame objects. Unlike the helpers that expand into a handful of lines and texts, each of these returns ONE frame
// object (the contract's axis, plot or diagram kind, contract.js) and the trusted renderer draws it the way the written card draws the same figure: ticks, titles, gridlines, series
// colours and arrowheads are not the program's to draw. Every value is checked by the host's frame contract; the guest only refuses what would make the call unreadable.
//   sdk.axis(id, { x, y, length, orientation: 'x' | 'y', min, max, ticks?, label, unit?, role? })   an x axis runs right from (x, y); a y axis runs UP from (x, y)
//   sdk.plot(id, { x, y, w, h, axes: { x: { label, min, max, unit? }, y: {...} }, series: [{ label, kind: 'line' | 'scatter' | 'step', points: [{ x, y }] }], role? })
//     (a call WITHOUT axes is the earlier sdk.plot(id, { xDomain, yDomain, ... }), unchanged, and returns an array of objects)
//   sdk.diagram(spec, { x, y, w, id?, role? })   spec is the written diagram JSON; id defaults to 'diagram'
export const FIGURES_SOURCE = String.raw`
(function () {
  var roles = ${JSON.stringify(ROLES)};
  var withRole = function (kind, id, fields, opts) {
    var out = { kind: kind, id: id };
    for (var key in fields) if (fields[key] !== undefined) out[key] = fields[key];
    if (opts && opts.role !== undefined) {
      if (roles.indexOf(opts.role) === -1) throw new RangeError('sdk.' + (kind === 'diagram' ? 'diagram' : kind) + ': invalid role');
      out.role = opts.role;
    }
    return out;
  };
  var need = function (name, opts, keys) {
    if (!opts || typeof opts !== 'object') throw new RangeError('sdk.' + name + ': options are required');
    for (var i = 0; i < keys.length; i += 1) if (opts[keys[i]] === undefined) throw new RangeError('sdk.' + name + ': ' + keys[i] + ' is required');
  };
  sdk.axis = function (id, opts) {
    need('axis', opts, ['x', 'y', 'length', 'orientation', 'min', 'max', 'label']);
    return withRole('axis', id, { x: opts.x, y: opts.y, length: opts.length, orientation: opts.orientation, min: opts.min, max: opts.max, ticks: opts.ticks, label: opts.label, unit: opts.unit }, opts);
  };
  var legacyPlot = sdk.plot;
  sdk.plot = function (id, opts) {
    if (!opts || opts.axes === undefined) return legacyPlot(id, opts);
    need('plot', opts, ['x', 'y', 'w', 'h', 'series']);
    return withRole('plot', id, { x: opts.x, y: opts.y, w: opts.w, h: opts.h, axes: opts.axes, series: opts.series }, opts);
  };
  sdk.diagram = function (spec, opts) {
    need('diagram', opts, ['x', 'y', 'w']);
    return withRole('diagram', opts.id === undefined ? 'diagram' : opts.id, { x: opts.x, y: opts.y, w: opts.w, spec: spec }, opts);
  };
})();
`;
