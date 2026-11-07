import { ROLES } from '../scene-vocab.js';
import { CONTRACT_LIMITS } from './contract.js';

// Guest code appended to the SDK before an authored module is evaluated.
// Plot data stays in ordinary frame objects, using the same trusted renderer as other geometry.
export const PLOT_SOURCE = String.raw`
sdk.plot = (function () {
  const roles = ${JSON.stringify(ROLES)};
  const limit = ${CONTRACT_LIMITS.coordinate};
  const maxSize = ${CONTRACT_LIMITS.size};
  const maxObjects = Math.min(${CONTRACT_LIMITS.objects} - 5, 55);
  const maxPoints = Math.min(${CONTRACT_LIMITS.pointsPerObject}, 256);
  const axisKeys = ['x', 'y', 'w', 'h', 'xDomain', 'yDomain', 'xLabel', 'yLabel', 'series', 'marker'];
  const lineRoles = ['prediction', 'input', 'output', 'warning'];
  const scatterRoles = ['observed', 'learner', 'success', 'warning'];
  const leading = 18;
  function refuse(message) { throw new Error('sdk.plot: ' + message); }
  function object(value, keys, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).some(key => !keys.includes(key))) refuse('invalid ' + name);
  }
  function name(value, max, what) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(value) || value.length > max) refuse('invalid ' + what + ' id');
    return value;
  }
  function label(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 48 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)) refuse('labels need 1 to 48 single-line characters');
    return value;
  }
  function domain(value, axis) {
    if (!Array.isArray(value) || value.length !== 2
        || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || value[0] >= value[1]) {
      refuse(axis + 'Domain must be a finite increasing pair');
    }
    return value;
  }
  function inDomain(value, range) {
    return Number.isFinite(value) && value >= range[0] && value <= range[1];
  }
  function role(value, fallback) {
    if (value === undefined) return fallback;
    if (!roles.includes(value)) refuse('invalid role');
    return value;
  }
  function scale(range, from, to) {
    const [min, max] = range;
    const span = max - min;
    return value => {
      // Opposite finite extremes can have an infinite difference. Halving keeps the ratio finite.
      const fraction = Number.isFinite(span)
        ? (value - min) / span
        : (value / 2 - min / 2) / (max / 2 - min / 2);
      return from + (to - from) * fraction;
    };
  }
  // Budget against the sandbox frame's unscaled text size, with room for wide glyphs.
  function widthOf(text) {
    let width = 0;
    for (const char of text) width += char.codePointAt(0) > 255 ? 15 : /[MW@%&]/.test(char) ? 14 : 9.5;
    return width;
  }
  function linesOf(value, width) {
    if (value === undefined) return [];
    const lines = [];
    let line = '';
    for (const word of label(value).trim().split(/\s+/)) {
      const joined = line ? line + ' ' + word : word;
      if (widthOf(joined) <= width) {
        line = joined;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const char of word) {
        if (line && widthOf(line + char) > width) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    if (line) lines.push(line);
    if (lines.length > 3) refuse('label is too wide for this plot rectangle');
    return lines;
  }
  function ticks(range, position, horizontal) {
    const [min, max] = range;
    const values = [min, max];
    const clearance = (a, b) => horizontal ? (widthOf(String(a)) + widthOf(String(b))) / 2 + 8 : 20;
    if (Math.abs(position(max) - position(min)) < clearance(min, max)) refuse('plot rectangle has no room for axis ticks');
    for (const t of [0.5, 0.25, 0.75]) {
      const raw = min * (1 - t) + max * t;
      const rounded = Number(raw.toPrecision(8));
      const value = rounded > min && rounded < max ? rounded : raw;
      if (value > min && value < max && values.every(other =>
        Math.abs(position(value) - position(other)) >= clearance(value, other))) values.push(value);
    }
    return values.sort((a, b) => a - b);
  }
  function plot(id, opts) {
    const prefix = 'plot:' + name(id, 32, 'plot') + ':';
    object(opts, axisKeys, 'options');
    const { x, y, w, h } = opts;
    if (![x, y, w, h].every(Number.isFinite) || w < 180 || h < 120 || w > maxSize || h > maxSize
        || x < -limit || y < -limit || x + w > limit || y + h > limit) {
      refuse('invalid rectangle (minimum 180 by 120)');
    }
    const xRange = domain(opts.xDomain, 'x'), yRange = domain(opts.yDomain, 'y');
    const xTitle = linesOf(opts.xLabel, w - 8), yTitle = linesOf(opts.yLabel, w - 8);
    const left = x + Math.max(26, widthOf(String(yRange[0])) + 12, widthOf(String(yRange[1])) + 12, widthOf(String(xRange[0])) / 2 + 4);
    const right = x + w - Math.max(12, widthOf(String(xRange[1])) / 2 + 4);
    const top = y + 14 + yTitle.length * leading;
    const bottom = y + h - 25 - xTitle.length * leading;
    if (right - left < 52 || bottom - top < 40) refuse('plot rectangle has no room for its axes and labels');
    const sx = scale(xRange, left, right), sy = scale(yRange, bottom, top);
    const objects = [
      sdk.line(prefix + 'axis:x', left, bottom, right, bottom),
      sdk.line(prefix + 'axis:y', left, bottom, left, top),
    ];
    ticks(xRange, sx, true).forEach((value, i) => {
      const key = prefix + 'tick:x:' + i, at = sx(value);
      objects.push(sdk.line(key, at, bottom, at, bottom + 5));
      objects.push(sdk.text(key + ':label', at, bottom + 21, String(value), { align: 'middle' }));
    });
    ticks(yRange, sy, false).forEach((value, i) => {
      const key = prefix + 'tick:y:' + i, at = sy(value), text = String(value);
      objects.push(sdk.line(key, left - 5, at, left, at));
      objects.push(sdk.text(key + ':label', Math.max(x + 4, left - 8 - widthOf(text)), at + 5, text));
    });
    xTitle.forEach((text, i) => objects.push(sdk.text(prefix + 'title:x:' + i, x + w / 2, bottom + 38 + i * leading, text, { align: 'middle' })));
    yTitle.forEach((text, i) => objects.push(sdk.text(prefix + 'title:y:' + i, x + 4, y + 16 + i * leading, text)));

    if (!Array.isArray(opts.series) || opts.series.length < 1 || opts.series.length > 4) refuse('need 1 to 4 series');
    const used = new Set();
    let scatterCount = 0;
    const lines = [], dots = [];
    for (const [index, entry] of opts.series.entries()) {
      object(entry, ['id', 'points', 'role', 'kind'], 'series');
      const id = name(entry.id, 20, 'series');
      if (used.has(id)) refuse('duplicate series id');
      used.add(id);
      const kind = entry.kind === undefined ? 'line' : entry.kind;
      if (kind !== 'line' && kind !== 'scatter') refuse('invalid series kind');
      if (!Array.isArray(entry.points) || entry.points.length < (kind === 'line' ? 2 : 1)
          || entry.points.length > maxPoints) refuse('invalid series points count');
      const style = { role: role(entry.role, (kind === 'line' ? lineRoles : scatterRoles)[index]) };
      const key = prefix + 's:' + id;
      const points = [];
      for (const point of entry.points) {
        if (!Array.isArray(point) || point.length !== 2 || !inDomain(point[0], xRange) || !inDomain(point[1], yRange)) {
          refuse('series points must be finite pairs inside the domains');
        }
        points.push([sx(point[0]), sy(point[1])]);
      }
      if (kind === 'line') {
        lines.push(sdk.polyline(key, points, style));
      } else {
        scatterCount += points.length;
        if (scatterCount > 20) refuse('need at most 20 scatter points per plot');
        points.forEach(([px, py], i) => dots.push(sdk.circle(key + ':' + i, px, py, 8, style)));
      }
    }
    objects.push(...lines, ...dots);
    if (opts.marker !== undefined) {
      const marker = opts.marker;
      object(marker, ['x', 'y', 'role', 'label'], 'marker');
      if (!inDomain(marker.x, xRange) || !inDomain(marker.y, yRange)) refuse('marker must be inside the domains');
      const mx = sx(marker.x), my = sy(marker.y), style = { role: role(marker.role, 'output') };
      objects.push(sdk.circle(prefix + 'marker', mx, my, 12, style));
      const labels = linesOf(marker.label, right - left - 8);
      if (labels.length) {
        const labelWidth = Math.max(...labels.map(widthOf));
        const labelX = Math.max(left, Math.min(right - labelWidth, mx + 9));
        const span = (labels.length - 1) * leading;
        if (span + 20 > bottom - top) refuse('marker label needs a taller plot rectangle');
        const above = my - 11 - span;
        const baseline = above >= top + 15 ? above : Math.min(bottom - 4 - span, my + 20);
        labels.forEach((text, i) => objects.push(sdk.text(prefix + 'marker:label:' + i, labelX, baseline + i * leading, text, style)));
      }
    }
    if (objects.length > maxObjects) refuse('plot exceeds the frame object budget');
    return objects;
  }
  return plot;
})();
`;
