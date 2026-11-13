import { ROLES } from '../scene-vocab.js';

// Semantic figures (sdk-8, capability figures): axis, plot and diagram frame objects. Unlike the helpers that expand into a handful of lines and texts, each of these returns ONE frame
// object (the contract's axis, plot or diagram kind, contract.js) and the trusted renderer draws it the way the written card draws the same figure: ticks, titles, gridlines, series
// colours and arrowheads are not the program's to draw. Every value is checked by the host's frame contract; the guest only refuses what would make the call unreadable.
//   sdk.axis(id, { x, y, length, orientation: 'x' | 'y', min, max, ticks?, label, unit?, role? })   an x axis runs right from (x, y); a y axis runs UP from (x, y)
//   sdk.plot(id, { x, y, w, h, axes: { x: { label, min, max, unit? }, y: {...} }, series: [{ label, kind: 'line' | 'scatter' | 'step', points: [{ x, y }] }], role? })
//     (a call WITHOUT axes is the earlier sdk.plot(id, { xDomain, yDomain, ... }), unchanged, and returns an array of objects)
//   sdk.diagram(spec, { x, y, w, id?, role? })   spec is the written diagram JSON; id defaults to 'diagram'
//   sdk.callout(x, y, lines, { id?, role? })   a readout box of one to four lines beside an object: an array of boxes, one per line
//   sdk.vector(id, from, vec, { label?, side?: 'left' | 'right', ... })   the sdk-7 arrow; the label sits beside the shaft's midpoint (10 px clear), not at the tip.
//     vec = { value, direction }: `direction` names the POSITIVE axis and `value` is signed along it, so { value: -9.8, direction: 'up' } points DOWN and { value: -9.8, direction: 'down' } points UP.
//   sdk.panel({ x, y, w, h, title, state, id?, role? })   a lane: [box, title text, state text]; the heading line sits 14 px above y
// The helpers FIT, they never refuse a thing that can be drawn smaller (owner 2026-11-13): a panel's state is shortened with an ellipsis to the room beside its title (under 60 px of room it moves to a
// second line under the title); a readout's label is shortened to the box's room and its value is always whole; a plot keeps at most 3 series of 24 points (sampled evenly, the first and last point kept),
// an axis at most 12 given ticks and a callout at most 4 lines. The strict contract caps (contract.js FIGURE_LIMITS) still refuse a hand-written frame object.
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
    return withRole('axis', id, { x: opts.x, y: opts.y, length: opts.length, orientation: opts.orientation, min: opts.min, max: opts.max, ticks: evenly(opts.ticks, 12), label: opts.label, unit: opts.unit }, opts);
  };
  // At most max items, evenly spaced from the first to the last (a list already within the cap comes back as it is).
  var evenly = function (list, max) {
    if (!Array.isArray(list) || list.length <= max) return list;
    var out = [];
    for (var i = 0; i < max; i += 1) out.push(list[Math.round(i * (list.length - 1) / (max - 1))]);
    return out;
  };
  var legacyPlot = sdk.plot;
  sdk.plot = function (id, opts) {
    if (!opts || opts.axes === undefined) return legacyPlot(id, opts);
    need('plot', opts, ['x', 'y', 'w', 'h', 'series']);
    var series = Array.isArray(opts.series) ? opts.series.slice(0, 3).map(function (entry) {
      if (!entry || typeof entry !== 'object' || !Array.isArray(entry.points) || entry.points.length <= 24) return entry;
      var copy = {};
      for (var key in entry) copy[key] = entry[key];
      copy.points = evenly(entry.points, 24);
      return copy;
    }) : opts.series;
    return withRole('plot', id, { x: opts.x, y: opts.y, w: opts.w, h: opts.h, axes: opts.axes, series: series }, opts);
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
    if (!Array.isArray(lines) || lines.length < 1) throw new RangeError('sdk.callout: lines is one to four strings');
    lines = lines.slice(0, 4);
    var id = opts && opts.id !== undefined ? opts.id : 'callout', role = roleOf('callout', opts), w = 0, out = [];
    lines.forEach(function (line) { w = Math.max(w, wide(words('callout', line, 40))); });
    lines.forEach(function (line, i) { var o = { text: line }; if (role.role !== undefined) o.role = role.role; out.push(sdk.box(id + '.l' + i, x, y + i * 28, w, 28, o)); });
    return out;
  };
  // sdk.panel({ x, y, w, h, title, state, id?, role? }): a lane. The box (tinted by role) is the lane; its heading and state text sit in one line above it, the title at the left and
  // the state after it, so the caller keeps 28 px free above y. Returns [box, title, state], three frame objects.
  // A text shortened with an ellipsis until wide(text) fits the room (at least one character stays).
  var fitText = function (text, room) {
    if (wide(text) <= room) return text;
    return text.slice(0, Math.max(1, Math.floor((room - 16) / 10) - 1)).replace(/\s+$/, '') + '\u2026';
  };
  sdk.panel = function (opts) {
    need('panel', opts, ['x', 'y', 'w', 'h', 'title', 'state']);
    var id = opts.id !== undefined ? opts.id : 'panel', title = words('panel', opts.title, 24), state = words('panel', opts.state, 32), role = roleOf('panel', opts);
    var gap = 24, room = opts.w - wide(title) - gap, stacked = room < 60;
    var lane = { role: role.role === undefined ? 'neutral' : role.role }, heading = { role: 'neutral' }, line = opts.y - 14;
    // The title keeps its width. The state takes the room beside it, shortened to fit; with under 60 px of room it goes on a second line under the title, the lane's whole width to itself.
    if (stacked) return [sdk.box(id, opts.x, opts.y, opts.w, opts.h, lane), sdk.text(id + '.title', opts.x, line - 16, title, heading), sdk.text(id + '.state', opts.x, line, fitText(state, opts.w), heading)];
    return [sdk.box(id, opts.x, opts.y, opts.w, opts.h, lane), sdk.text(id + '.title', opts.x, line, title, heading), sdk.text(id + '.state', opts.x + wide(title) + gap, line, fitText(state, room), heading)];
  };
  // sdk.readout (the earlier one, sdk-grid.js) refuses a box too small for its label. Here the label is shortened with an ellipsis until the readout fits, and its value is always drawn whole; a box
  // too small even for the value alone is still drawn (the layout rules report the overflow) rather than refused.
  var earlierReadout = sdk.readout;
  sdk.readout = function (id, options) {
    try { return earlierReadout(id, options); }
    catch (error) {
      if (String(error && error.message).indexOf('needs more room for its label') < 0) throw error;
    }
    for (var keep = options.label.length - 1; keep >= 0; keep -= 1) {
      try { return earlierReadout(id, Object.assign({}, options, { label: options.label.slice(0, keep).replace(/\s+$/, '') + '\u2026' })); }
      catch (error) {
        if (String(error && error.message).indexOf('needs more room for its label') < 0) throw error;
      }
    }
    return [sdk.box(id, options.x, options.y, options.w, options.h, { text: '\u2026: ' + sdk.format(options.value, options.decimals) + (options.unit ? ' ' + options.unit : ''), role: options.role === undefined ? 'output' : options.role })];
  };
  // sdk.vector under sdk-8: the arrow is the earlier one; its label (opts.label, a short text) sits BESIDE the shaft's midpoint, 10 px clear of it, on the right-hand side of the direction of the
  // arrow (an up arrow: to its right) or the left with opts.side = 'left', so it is never at the tip where the body is. The renderer colours the arrow and label by kind from the label or id
  // (v blue, a orange dashed, F green: frame-look.js vectorKind).
  var earlierVector = sdk.vector;
  sdk.vector = function (id, from, vec, opts) {
    opts = opts || {};
    var plain = {};
    for (var key in opts) if (key !== 'label' && key !== 'side') plain[key] = opts[key];
    var out = earlierVector(id, from, vec, plain);
    if (opts.label == null) return out;
    if (opts.side !== undefined && opts.side !== 'left' && opts.side !== 'right') throw new RangeError('sdk.vector: side is left or right');
    var text = words('vector', String(opts.label), 24), half = 7.5 * text.length / 2, arrow = out[0], mid = from, dx = 0, dy = -1;
    if (arrow) {
      mid = { x: (arrow.from.x + arrow.to.x) / 2, y: (arrow.from.y + arrow.to.y) / 2 };
      var length = Math.sqrt(Math.pow(arrow.to.x - arrow.from.x, 2) + Math.pow(arrow.to.y - arrow.from.y, 2)) || 1;
      dx = (arrow.to.x - arrow.from.x) / length; dy = (arrow.to.y - arrow.from.y) / length;
    }
    var side = opts.side === 'left' ? -1 : 1, nx = -dy * side, ny = dx * side, textOpts = roleOf('vector', opts);
    textOpts.align = 'middle';
    out.push(sdk.text(id + 'L', mid.x + nx * (10 + half), mid.y + ny * (10 + 5), text, textOpts));
    return out;
  };
})();
`;
