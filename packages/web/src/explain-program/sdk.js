import { RASTER_SOURCE } from './sdk-raster.js';
import { CYCLIC_GRAPH_SOURCE } from './sdk-cyclic.js';
import { GEOMETRY_SOURCE } from './sdk-geometry.js';
import { EXPANDABLE_GRAPH_SOURCE, GRAPH_SOURCE } from './sdk-graph.js';
import { EVIDENCE_SOURCE } from './sdk-evidence.js';
import { FIELD_SOURCE } from './sdk-field.js';
import { GRID_SOURCE } from './sdk-grid.js';
import { IMAGE_SOURCE } from './sdk-image.js';
import { PLOT_SOURCE } from './sdk-plot.js';
import { TIMELINE_SOURCE } from './sdk-timeline.js';
import { TRACE_SOURCE } from './sdk-trace.js';
import { CYCLIC_SDK_VERSION, HEAT_GRID_SDK_VERSION, MEDIUM_SDK_VERSION, RASTER_SDK_VERSION, VISUAL_SDK_VERSION } from './stamps.js';

// The guest-side SDK (plan section 5.2): generic geometry and formatting helpers only. No subject formulas, no lesson catalogue.
// SDK_SOURCE is plain script text the runtime evaluates in the guest BEFORE the generated module, defining one global, `sdk`.
// The generated program is an ES module with no imports whose only contract is the named export
//   export function evaluate({ inputs, time, seed, state }) { ... return { frame, quantities }; }
// and it reaches these helpers as the global `sdk`.
// Every helper is pure and returns plain JSON that the Frame contract (contract.js) accepts.
export const SDK_VERSION = 'sdk-1';

export const SDK_SOURCE = `
var sdk = (function () {
  var own = function (extra) { var out = {}; if (extra) for (var key in extra) out[key] = extra[key]; return out; };
  var withId = function (kind, id, fields, opts) { var out = own(opts); out.kind = kind; out.id = id; for (var key in fields) out[key] = fields[key]; return out; };
  return {
    clamp: function (value, low, high) { return Math.min(high, Math.max(low, value)); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    // A linear map from a domain to a range, e.g. data values to pixels. A flat domain maps to the range start.
    linear: function (domain, range) {
      var span = domain[1] - domain[0];
      return function (value) { return span === 0 ? range[0] : range[0] + (value - domain[0]) / span * (range[1] - range[0]); };
    },
    // count + 1 points [x, f(x)] from "from" to "to" inclusive.
    sample: function (f, from, to, count) {
      var points = [];
      for (var i = 0; i <= count; i += 1) { var x = from + (to - from) * i / count; points.push([x, f(x)]); }
      return points;
    },
    format: function (value, decimals) { return Number(value).toFixed(decimals == null ? 2 : decimals); },
    box: function (id, x, y, w, h, opts) { return withId('box', id, { x: x, y: y, w: w, h: h }, opts); },
    circle: function (id, x, y, diameter, opts) { return withId('circle', id, { x: x, y: y, w: diameter }, opts); },
    text: function (id, x, y, text, opts) { return withId('text', id, { x: x, y: y, text: text }, opts); },
    math: function (id, x, y, tex, opts) { return withId('text', id, { x: x, y: y, runs: [{ kind: 'math', tex: tex }] }, opts); },
    line: function (id, x1, y1, x2, y2, opts) { return withId('line', id, { from: { x: x1, y: y1 }, to: { x: x2, y: y2 } }, opts); },
    arrow: function (id, x1, y1, x2, y2, opts) { return withId('arrow', id, { from: { x: x1, y: y1 }, to: { x: x2, y: y2 } }, opts); },
    polyline: function (id, points, opts) { return withId('polyline', id, { points: points }, opts); },
    frame: function (objects, opts) { var out = own(opts); out.objects = objects; return out; }
  };
})();
`;

// Keep the old source byte-for-byte. The version is chosen by the host from the artifact's verified stamps.
const VISUAL_SDK_SOURCE = [SDK_SOURCE, PLOT_SOURCE, GRAPH_SOURCE, GRID_SOURCE, GEOMETRY_SOURCE, TIMELINE_SOURCE].join('\n');
const MEDIUM_SDK_SOURCE = [VISUAL_SDK_SOURCE, TRACE_SOURCE, FIELD_SOURCE, EVIDENCE_SOURCE, EXPANDABLE_GRAPH_SOURCE, IMAGE_SOURCE].join('\n');
const CYCLIC_SDK_SOURCE = [MEDIUM_SDK_SOURCE, CYCLIC_GRAPH_SOURCE].join('\n');
const RASTER_SDK_SOURCE = [CYCLIC_SDK_SOURCE, RASTER_SOURCE].join('\n');
const HEAT_GRID_SDK_SOURCE = `${VISUAL_SDK_SOURCE}
sdk.heatGrid = function (id, options) {
  return { ...options, kind: 'heat_grid', id };
};
`;
export function programSdkSource(version) {
  if (version === RASTER_SDK_VERSION) return RASTER_SDK_SOURCE;
  if (version === CYCLIC_SDK_VERSION) return CYCLIC_SDK_SOURCE;
  if (version === SDK_VERSION) return SDK_SOURCE;
  if (version === VISUAL_SDK_VERSION) return VISUAL_SDK_SOURCE;
  if (version === MEDIUM_SDK_VERSION) return MEDIUM_SDK_SOURCE;
  if (version === HEAT_GRID_SDK_VERSION) return HEAT_GRID_SDK_SOURCE;
}

// A stable build identity for the bundle hash: a SHA-256 of the exact source the guest receives.
export async function sdkFingerprint() {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(SDK_SOURCE));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
