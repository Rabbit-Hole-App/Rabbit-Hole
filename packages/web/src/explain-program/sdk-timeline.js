import { ROLES } from '../scene-vocab.js';
import { CONTRACT_LIMITS } from './contract.js';

// Trusted guest code for discrete events. The caller supplies the cursor on each frame.
export const TIMELINE_SOURCE = String.raw`
(function () {
  var roles = ${JSON.stringify(ROLES)};
  var prefixPattern = /^[A-Za-z0-9_.-]{1,24}$/;
  var idPattern = /^[A-Za-z0-9_.-]{1,16}$/;

  function singleLine(value, limit) {
    return typeof value === 'string' && value.length <= limit && !/[\r\n\u2028\u2029]/.test(value);
  }

  function labelWidth(value) {
    return 10 * value.length;
  }

  sdk.timeline = function (id, spec) {
    if (typeof id !== 'string' || !prefixPattern.test(id)) throw new RangeError('invalid timeline id');
    if (!spec || typeof spec !== 'object') throw new RangeError('missing timeline viewport');
    var x = spec.x, y = spec.y, w = spec.w, h = spec.h;
    var maxCoordinate = ${CONTRACT_LIMITS.coordinate};
    if (![x, y, w, h].every(Number.isFinite) || w < 160 || h < 78 ||
        w > ${CONTRACT_LIMITS.size} || h > ${CONTRACT_LIMITS.size} ||
        x < -maxCoordinate || y < -maxCoordinate || x + w > maxCoordinate || y + h > maxCoordinate) {
      throw new RangeError('invalid timeline viewport');
    }

    var domain = spec.domain, lanes = spec.lanes, cursor = spec.cursor;
    if (!Array.isArray(domain) || domain.length !== 2 || !Number.isFinite(domain[0]) || !Number.isFinite(domain[1]) ||
        domain[0] >= domain[1] || !Number.isFinite(domain[1] - domain[0])) throw new RangeError('invalid timeline domain');
    function within(value) {
      return Number.isFinite(value) && value >= domain[0] && value <= domain[1];
    }
    if (cursor !== undefined && !within(cursor)) throw new RangeError('timeline cursor is outside its domain');
    if (spec.unit !== undefined && !singleLine(spec.unit, 16)) throw new RangeError('invalid timeline unit');
    if (!Array.isArray(lanes) || lanes.length < 1 || lanes.length > 6) throw new RangeError('timeline needs one to six lanes');

    var laneIds = new Set(), gutter = 0, eventCount = 0;
    for (var lane of lanes) {
      if (!lane || typeof lane.id !== 'string' || !idPattern.test(lane.id)) throw new RangeError('invalid timeline lane id');
      if (laneIds.has(lane.id)) throw new RangeError('duplicate timeline lane id: ' + lane.id);
      laneIds.add(lane.id);
      if (!singleLine(lane.label, 24) || !lane.label.trim()) throw new RangeError('invalid timeline lane label');
      gutter = Math.max(gutter, labelWidth(lane.label));
      if (!Array.isArray(lane.events) || lane.events.length > 8) throw new RangeError('timeline allows at most eight events per lane');
      eventCount += lane.events.length;
    }
    if (eventCount > 18) throw new RangeError('timeline allows at most 18 events');

    var plotLeft = x + gutter + 20, plotRight = x + w - 8;
    var plotWidth = plotRight - plotLeft, row = (h - 26) / lanes.length;
    var suffix = spec.unit ? ' ' + spec.unit : '';
    var minLabel = String(domain[0]) + suffix, maxLabel = String(domain[1]) + suffix;
    if (row < 52 || plotWidth < labelWidth(minLabel) + labelWidth(maxLabel) + 12) {
      throw new RangeError('timeline lanes or scale labels need more space');
    }
    var map = sdk.linear(domain, [plotLeft, plotRight]);
    var objects = [];
    var cursorX = cursor === undefined ? undefined : map(cursor);

    for (var index = 0; index < lanes.length; index++) {
      var lane = lanes[index];
      var center = y + row * (index + 0.5);
      objects.push(sdk.text(id + ':lane:' + lane.id, x, center + 5, lane.label));
      objects.push(sdk.line(id + ':track:' + lane.id, plotLeft, center, plotRight, center, { opacity: 0.55 }));
      // Draw the cursor through each track, between its two nearest label rows.
      if (cursorX !== undefined) {
        objects.push(sdk.line(id + ':cursor:' + lane.id, cursorX, center - 5, cursorX, center + 6, { role: 'learner' }));
      }
      var eventIds = new Set();
      var slots = [{ y: center - 8, ranges: [] }, { y: center + 22, ranges: [] }];
      if (row >= 100) slots.push({ y: center - 30, ranges: [] }, { y: center + 44, ranges: [] });
      for (var event of lane.events) {
        if (!event || typeof event.id !== 'string' || !idPattern.test(event.id)) throw new RangeError('invalid timeline event id');
        if (eventIds.has(event.id)) throw new RangeError('duplicate timeline event id: ' + event.id);
        eventIds.add(event.id);
        if (!within(event.at)) throw new RangeError('timeline event is outside its domain or invalid');
        if (event.role !== undefined && roles.indexOf(event.role) === -1) throw new RangeError('invalid timeline event role');
        if (!singleLine(event.label, 60) || !event.label.trim()) throw new RangeError('invalid timeline event label');
        var eventX = map(event.at), labelW = labelWidth(event.label);
        if (labelW > plotWidth) throw new RangeError('timeline event label is wider than its lane');
        var left = sdk.clamp(eventX - labelW / 2, plotLeft, plotRight - labelW);
        var slot = slots.find(function (candidate) {
          return candidate.ranges.every(function (range) {
            return left + labelW + 6 <= range[0] || left >= range[1] + 6;
          });
        });
        if (!slot) throw new RangeError('timeline event labels need more space near ' + event.id);
        slot.ranges.push([left, left + labelW]);
        var key = id + ':e:' + lane.id + ':' + event.id;
        var role = event.role === undefined ? 'observed' : event.role;
        objects.push(sdk.circle(key, eventX, center, 8, { role: role }));
        objects.push(sdk.text(key + ':t', left, slot.y, event.label));
      }
    }

    objects.push(sdk.text(id + ':min', plotLeft, y + h - 5, minLabel));
    objects.push(sdk.text(id + ':max', plotRight - labelWidth(maxLabel), y + h - 5, maxLabel));
    return objects;
  };
})();
`;
