import { ROLES } from '../scene-vocab.js';

// Interval traces use ordinary scene objects. The caller owns selection, playback and trace data.
export const TRACE_SOURCE = String.raw`
(function () {
  const roles = ${JSON.stringify(ROLES)};
  const safeId = /^[A-Za-z0-9_.-]{1,16}$/;
  const fail = message => { throw new RangeError('sdk.trace: ' + message); };
  const isId = id => typeof id === 'string' && safeId.test(id);
  const isLabel = (text, max) => typeof text === 'string' && text.length <= max && text.trim()
    && !/[\x00-\x1f\x7f\u2028\u2029]/.test(text);
  const textWidth = text => text.length * 10;
  const durationText = value => String(Number(value.toPrecision(10)));
  const trackHeight = 32;

  sdk.trace = function (id, config) {
    if (!isId(id) || !config || typeof config !== 'object') fail('expected an id and trace configuration');
    const { x, y, w, h, domain, lanes, selected, cursor } = config;
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w < 280 || h < 170
        || w > 2000 || h > 2000 || x + w > 4096 || y + h > 4096) fail('invalid trace viewport');
    if (!Array.isArray(domain) || domain.length !== 2 || !domain.every(Number.isFinite)
        || domain[0] >= domain[1] || !Number.isFinite(domain[1] - domain[0])) fail('invalid trace domain');
    const within = value => Number.isFinite(value) && value >= domain[0] && value <= domain[1];
    if (cursor !== undefined && !within(cursor)) fail('cursor is outside the domain');
    if (config.unit !== undefined && !isLabel(config.unit, 12)) fail('invalid time unit');
    if (!Array.isArray(lanes) || lanes.length < 1 || lanes.length > 6) fail('expected one to six lanes');

    const laneIds = new Set(), byId = new Map();
    let dependencyCount = 0;
    for (const lane of lanes) {
      if (!lane || !isId(lane.id) || laneIds.has(lane.id) || !isLabel(lane.label, 24)
          || !Array.isArray(lane.spans) || lane.spans.length > 12) fail('invalid trace lane');
      laneIds.add(lane.id);
      for (const span of lane.spans) {
        if (!span || !isId(span.id) || byId.has(span.id) || !isLabel(span.label, 40)) fail('invalid or duplicate span');
        if (!within(span.start) || !within(span.end) || span.end <= span.start) fail('invalid span interval: ' + span.id);
        if (span.role !== undefined && !roles.includes(span.role)) fail('invalid span role: ' + span.id);
        if (span.detail !== undefined && !isLabel(span.detail, 64)) fail('invalid span detail: ' + span.id);
        if (span.dependsOn !== undefined && (!Array.isArray(span.dependsOn) || span.dependsOn.length > 3
            || !span.dependsOn.every(isId) || new Set(span.dependsOn).size !== span.dependsOn.length)) fail('invalid dependencies: ' + span.id);
        byId.set(span.id, { ...span });
        dependencyCount += span.dependsOn?.length ?? 0;
      }
    }
    if (byId.size < 1 || byId.size > 12 || dependencyCount > 12) fail('expected 1 to 12 spans and at most 12 dependencies');
    if (selected != null && !byId.has(selected)) fail('unknown selected span');
    for (const span of byId.values()) {
      if (span.parent !== undefined) {
        const parent = byId.get(span.parent);
        if (!parent || parent.start > span.start || parent.end < span.end
            || (parent.start === span.start && parent.end === span.end)) fail('parent must strictly contain span: ' + span.id);
      }
      for (const source of span.dependsOn ?? []) {
        if (!byId.has(source) || byId.get(source).end > span.start) fail('dependency must end before span: ' + span.id);
      }
    }

    const unit = config.unit ? ' ' + config.unit : '';
    const minLabel = String(domain[0]) + unit, maxLabel = String(domain[1]) + unit;
    const left = x + Math.max(...lanes.map(lane => textWidth(lane.label))) + 16;
    const right = x + w - 8, axis = y + h - 88;
    if (right - left < textWidth(minLabel) + textWidth(maxLabel) + 12) fail('time scale needs more room');
    const toX = sdk.linear(domain, [left, right]);
    const objects = [];
    let top = y + 4;
    for (const lane of lanes) {
      const trackEnds = [];
      const ordered = lane.spans.map(span => byId.get(span.id)).sort((a, b) => a.start - b.start || b.end - a.end);
      for (const span of ordered) {
        let track = trackEnds.findIndex(end => end <= span.start);
        if (track === -1) track = trackEnds.length;
        trackEnds[track] = span.end;
        span.x = toX(span.start);
        span.right = toX(span.end);
        span.y = top + track * trackHeight;
        if (span.right - span.x < 1) fail('span is narrower than one pixel: ' + span.id);
      }
      objects.push(sdk.text(id + ':lane:' + lane.id, x, top + 18, lane.label));
      top += Math.max(1, trackEnds.length) * trackHeight;
    }
    if (top + 4 > axis) fail('trace tracks need more height');

    objects.push(sdk.line(id + ':axis', left, axis, right, axis));
    objects.push(sdk.text(id + ':min', left, axis + 19, minLabel));
    objects.push(sdk.text(id + ':max', right - textWidth(maxLabel), axis + 19, maxLabel));
    if (cursor !== undefined) {
      const position = toX(cursor);
      objects.push(sdk.line(id + ':cursor', position, y, position, axis, { role: 'learner' }));
    }
    for (const span of byId.values()) {
      for (const source of span.dependsOn ?? []) {
        const prior = byId.get(source);
        const samePoint = prior.right === span.x && prior.y === span.y;
        objects.push(sdk.arrow(id + ':dep:' + source + ':' + span.id, prior.right,
          prior.y + (samePoint ? 1 : 11), span.x, span.y + 11, { role: 'output' }));
      }
    }
    for (const span of byId.values()) {
      const width = span.right - span.x;
      const style = { role: selected === span.id ? 'learner' : span.role ?? 'observed' };
      if (textWidth(span.label) + 10 <= width) style.text = span.label;
      objects.push(sdk.box(id + ':span:' + span.id, span.x, span.y, width, 22, style));
    }
    if (selected != null) {
      const span = byId.get(selected);
      const timing = span.start + ' to ' + span.end + unit + ' · ' + durationText(span.end - span.start) + unit + ' elapsed';
      const context = span.detail ?? (span.parent ? 'Within ' + byId.get(span.parent).label : null);
      const detail = [[span.label, 'name'], [timing, 'time'], [context, 'context']];
      for (const [index, [label, key]] of detail.entries()) {
        if (!label) continue;
        if (textWidth(label) > w) fail('selected span detail needs a wider trace');
        objects.push(sdk.text(id + ':detail:' + key, x, axis + 41 + index * 20, label));
      }
    }
    return objects;
  };
})();
`;
