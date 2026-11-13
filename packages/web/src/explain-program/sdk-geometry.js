import { ROLES } from '../scene-vocab.js';
import { CONTRACT_LIMITS } from './contract.js';

// Trusted guest code. Coordinates are data values; positive y goes up.
export const GEOMETRY_SOURCE = String.raw`
(function () {
  var roles = ${JSON.stringify(ROLES)};
  var idPattern = /^[A-Za-z0-9_.-]{1,24}$/;
  var kinds = { points: 'point', segments: 'segment', vectors: 'vector', paths: 'path' };

  function domain(value) {
    return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) &&
      value[0] < value[1] && Number.isFinite(value[1] - value[0]);
  }

  function itemList(value, name, limit) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > limit) throw new RangeError('geometry ' + name + ' allows at most ' + limit + ' items');
    return value;
  }

  function intersectsLine(box, line) {
    var from = line.from, to = line.to;
    var left = Math.max(box[0] - 3, Math.min(from.x, to.x));
    var right = Math.min(box[2] + 3, Math.max(from.x, to.x));
    if (left > right) return false;
    var low = from.y, high = to.y;
    if (from.x !== to.x) {
      var yAt = sdk.linear([from.x, to.x], [from.y, to.y]);
      low = yAt(left);
      high = yAt(right);
    }
    return Math.min(low, high) <= box[3] + 3 && Math.max(low, high) >= box[1] - 3;
  }

  // The Frame body text is 15px. Use a generous width estimate for greedy label placement.
  function placeLabel(label, bounds, occupied, lines) {
    var width = 10 * label.text.length;
    var x = label.x, y = label.y;
    var positions = [
      [x + 10, y + 5], [x - width - 10, y + 5],
      [x - width / 2, y - 11], [x - width / 2, y + 29],
      [x + 10, y - 16], [x - width - 10, y - 16],
      [x + 10, y + 26], [x - width - 10, y + 26]
    ];
    if (width > bounds.w) throw new RangeError('geometry label is wider than its viewport');
    for (var position of positions) {
      var left = sdk.clamp(position[0], bounds.x, bounds.x + bounds.w - width);
      var baseline = sdk.clamp(position[1], bounds.y + 15, bounds.y + bounds.h - 5);
      var box = [left, baseline - 15, left + width, baseline + 5];
      var clear = occupied.every(function (other) {
        return box[2] <= other[0] || box[0] >= other[2] || box[3] <= other[1] || box[1] >= other[3];
      });
      if (clear && !lines.some(function (line) { return intersectsLine(box, line); })) {
        occupied.push(box);
        return sdk.text(label.id, left, baseline, label.text);
      }
    }
    throw new RangeError('geometry labels need more space near ' + label.id);
  }

  sdk.geometry = function (id, spec) {
    if (typeof id !== 'string' || !idPattern.test(id)) throw new RangeError('invalid geometry id');
    if (!spec || typeof spec !== 'object') throw new RangeError('missing geometry viewport');
    var x = spec.x, y = spec.y, w = spec.w, h = spec.h;
    var maxCoordinate = ${CONTRACT_LIMITS.coordinate};
    if (![x, y, w, h].every(Number.isFinite) || w < 32 || h < 32 ||
        w > ${CONTRACT_LIMITS.size} || h > ${CONTRACT_LIMITS.size} ||
        x < -maxCoordinate || y < -maxCoordinate || x + w > maxCoordinate || y + h > maxCoordinate) {
      throw new RangeError('invalid geometry viewport');
    }
    if (!domain(spec.xDomain) || !domain(spec.yDomain)) throw new RangeError('invalid geometry domain');
    var mapX = sdk.linear(spec.xDomain, [x, x + w]);
    var mapY = sdk.linear(spec.yDomain, [y + h, y]);
    var objects = [], labels = [], occupied = [], seen = new Set();

    function point(value) {
      if (!Array.isArray(value) || value.length !== 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) ||
          value[0] < spec.xDomain[0] || value[0] > spec.xDomain[1] ||
          value[1] < spec.yDomain[0] || value[1] > spec.yDomain[1]) {
        throw new RangeError('geometry point is outside its domain or invalid');
      }
      return [mapX(value[0]), mapY(value[1])];
    }

    // Paint the marks above paths and lines.
    for (var group of ['paths', 'segments', 'vectors', 'points']) {
      var items = itemList(spec[group], group, group === 'paths' ? 8 : 24);
      for (var item of items) {
        if (!item || typeof item.id !== 'string' || !idPattern.test(item.id)) throw new RangeError('invalid geometry item id');
        var key = id + ':' + kinds[group] + ':' + item.id;
        if (seen.has(key)) throw new RangeError('duplicate geometry id: ' + item.id);
        seen.add(key);
        if (item.role !== undefined && roles.indexOf(item.role) === -1) throw new RangeError('invalid geometry role');
        var opts = { role: item.role === undefined ? 'neutral' : item.role };
        var anchor;
        if (group === 'paths') {
          var vertices = itemList(item.points, 'path points', 200);
          if (vertices.length < 2) throw new RangeError('geometry paths need at least two points');
          objects.push(sdk.polyline(key, Array.from(vertices, point), opts));
          continue;
        }
        if (group === 'points') {
          anchor = point(item.at);
          occupied.push([anchor[0] - 5, anchor[1] - 5, anchor[0] + 5, anchor[1] + 5]);
          objects.push(sdk.circle(key, anchor[0], anchor[1], 8, opts));
        } else {
          var from = point(item.from), to = point(item.to);
          anchor = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
          if (group === 'vectors' && from[0] === to[0] && from[1] === to[1]) opts.opacity = 0;
          var draw = group === 'vectors' ? sdk.arrow : sdk.line;
          objects.push(draw(key, from[0], from[1], to[0], to[1], opts));
        }
        if (item.label !== undefined) {
          if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > ${CONTRACT_LIMITS.text} || /[\r\n\u2028\u2029]/.test(item.label)) {
            throw new RangeError('invalid geometry label');
          }
          labels.push({ id: key + ':label', x: anchor[0], y: anchor[1], text: item.label });
        }
      }
    }

    if (objects.length + labels.length > ${CONTRACT_LIMITS.objects}) throw new RangeError('geometry exceeds the Frame object limit');
    var lines = objects.filter(function (object) {
      return (object.kind === 'line' || object.kind === 'arrow') && object.opacity !== 0;
    });
    for (var label of labels) objects.push(placeLabel(label, spec, occupied, lines));
    return objects;
  };
})();
`;

// Physical props (sdk-7, capability physical_props): drawing rules a program should not have to rediscover. Unlike the geometry helpers above these
// work in FRAME coordinates (pixels, y down) like sdk.arrow, and each returns an ARRAY of frame objects to spread into `objects`.
//   sdk.vector(id, from, vec, opts) - vec is {dx, dy} (frame units) or {value, direction} with direction 'up'|'down'|'left'|'right'|{x, y} (a negative value
//     reverses it); the length is |vec| x opts.scale (default 1). From opts.minLength (default 12 px) up it is an `arrow`; BELOW it is a plain `line` of its true
//     length (nothing at all under 1 px), so a zero or tiny vector never draws a floating arrowhead. opts.label adds a `text` (id + 'L') just PAST the tip
//     along the vector's own direction, 8 px clear of the tip, never at a fixed offset from the tail. opts.role colours the arrow and the label.
//   sdk.gate(id, x, y, opts) - a release gate centred on x: two short strokes pivoting about their outer ends, flat when closed and swung down when
//     open (opts.open, opts.w = 36 px wide), with its optional label BELOW the swing. At most 3 objects, inside [x - w/2, x + w/2] x [y, y + w/2 + 24].
//   sdk.groundMark(id, x, y, w, label) - a horizontal mark centred on x with its optional label below it. At most 2 objects.
export const PROPS_SOURCE = String.raw`
(function () {
  var CHAR = 9, HALF_LINE = 10, CLEAR = 8;
  var withRole = function (opts) { var out = {}; if (opts && opts.role) out.role = opts.role; return out; };
  var unit = function (direction) {
    if (direction === 'up') return { x: 0, y: -1 };
    if (direction === 'down') return { x: 0, y: 1 };
    if (direction === 'left') return { x: -1, y: 0 };
    if (direction === 'right') return { x: 1, y: 0 };
    if (direction && typeof direction === 'object' && Number.isFinite(direction.x) && Number.isFinite(direction.y)) {
      var n = Math.sqrt(direction.x * direction.x + direction.y * direction.y) || 1;
      return { x: direction.x / n, y: direction.y / n };
    }
    throw new RangeError('vector direction must be up, down, left, right or {x, y}');
  };
  sdk.vector = function (id, from, vec, opts) {
    opts = opts || {};
    var scale = opts.scale == null ? 1 : opts.scale, minLength = opts.minLength == null ? 12 : opts.minLength;
    var dx, dy, dir = { x: 1, y: 0 };
    if (vec && vec.value != null) {
      dir = unit(vec.direction);
      dx = dir.x * vec.value * scale; dy = dir.y * vec.value * scale;
    } else {
      dx = vec.dx * scale; dy = vec.dy * scale;
    }
    var length = Math.sqrt(dx * dx + dy * dy), role = withRole(opts), out = [];
    if (length >= 1) { dir = { x: dx / length, y: dy / length }; }
    else if (vec && vec.value != null && vec.value < 0) { dir = { x: -dir.x, y: -dir.y }; }
    var tip = { x: from.x + dx, y: from.y + dy };
    if (length >= 1) out.push(length >= minLength ? sdk.arrow(id, from.x, from.y, tip.x, tip.y, role) : sdk.line(id, from.x, from.y, tip.x, tip.y, role));
    if (opts.label != null) {
      var text = String(opts.label), hw = CHAR * text.length / 2;
      var reach = CLEAR + Math.abs(dir.x) * hw + Math.abs(dir.y) * HALF_LINE;
      var textOpts = withRole(opts); textOpts.align = 'middle';
      out.push(sdk.text(id + 'L', tip.x + dir.x * reach, tip.y + dir.y * reach, text, textOpts));
    }
    return out;
  };
})();
`;
