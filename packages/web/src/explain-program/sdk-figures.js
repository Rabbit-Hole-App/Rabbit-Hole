import { ROLES } from '../scene-vocab.js';

// Semantic figures (sdk-8, capability figures): axis, plot and diagram frame objects. Unlike the helpers that expand into a handful of lines and texts, each of these returns ONE frame
// object (the contract's axis, plot or diagram kind, contract.js) and the trusted renderer draws it the way the written card draws the same figure: ticks, titles, gridlines, series
// colours and arrowheads are not the program's to draw. Every value is checked by the host's frame contract; the guest only refuses what would make the call unreadable.
//   sdk.axis(id, { x, y, length, orientation: 'x' | 'y', min, max, ticks?, label, unit?, role? })   an x axis runs right from (x, y); a y axis runs UP from (x, y)
//   sdk.plot(id, { x, y, w, h, axes: { x: { label, min, max, unit? }, y: {...} }, series: [{ label, kind: 'line' | 'scatter' | 'step', points: [{ x, y }] }], role? })
//     (a call WITHOUT axes is the earlier sdk.plot(id, { xDomain, yDomain, ... }), unchanged, and returns an array of objects)
//   sdk.diagram(spec, { x, y, w, id?, role? })   spec is the written diagram JSON; id defaults to 'diagram'
//   sdk.callout(x, y, lines, { id?, role? })   a readout box of one to four lines beside an object: an array of boxes, one per line
//   sdk.panel({ x, y, w, h, title, state, id?, role? })   a lane: [box, title text, state text]; the heading line sits 14 px above y
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
  // A label's width, generous on purpose: a layout rule that measures the real glyphs must never find the estimate short.
  var wide = function (text) { return text.length * 10 + 16; };
  var words = function (name, value, max) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new RangeError('sdk.' + name + ': text is 1 to ' + max + ' characters');
    return value;
  };
  var roleOf = function (name, opts) {
    var role = opts && opts.role !== undefined ? opts.role : undefined;
    if (role !== undefined && roles.indexOf(role) === -1) throw new RangeError('sdk.' + name + ': invalid role');
    return role === undefined ? {} : { role: role };
  };
  // sdk.callout(x, y, lines, { id?, role? }): a readout box beside an object, one to four lines, its top left at (x, y). Returns one box per line, stacked with no gap and equally wide,
  // each carrying its own text (a text object laid over a box would be a layout overlap).
  sdk.callout = function (x, y, lines, opts) {
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > 4) throw new RangeError('sdk.callout: lines is one to four strings');
    var id = opts && opts.id !== undefined ? opts.id : 'callout', role = roleOf('callout', opts), w = 0, out = [];
    lines.forEach(function (line) { w = Math.max(w, wide(words('callout', line, 40))); });
    lines.forEach(function (line, i) { var o = { text: line }; if (role.role !== undefined) o.role = role.role; out.push(sdk.box(id + '.l' + i, x, y + i * 28, w, 28, o)); });
    return out;
  };
  // sdk.panel({ x, y, w, h, title, state, id?, role? }): a lane. The box (tinted by role) is the lane; its heading and state text sit in one line above it, the title at the left and
  // the state after it, so the caller keeps 28 px free above y. Returns [box, title, state], three frame objects.
  sdk.panel = function (opts) {
    need('panel', opts, ['x', 'y', 'w', 'h', 'title', 'state']);
    var id = opts.id !== undefined ? opts.id : 'panel', title = words('panel', opts.title, 24), state = words('panel', opts.state, 32), role = roleOf('panel', opts);
    var gap = 24, room = opts.w - wide(title) - gap;
    if (room < wide(state)) throw new RangeError('sdk.panel: the lane is too narrow for its title and state');
    var lane = { role: role.role === undefined ? 'neutral' : role.role }, heading = { role: 'neutral' }, line = opts.y - 14;
    return [sdk.box(id, opts.x, opts.y, opts.w, opts.h, lane), sdk.text(id + '.title', opts.x, line, title, heading), sdk.text(id + '.state', opts.x + wide(title) + gap, line, state, heading)];
  };
})();
`;
