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
