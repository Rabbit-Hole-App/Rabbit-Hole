import { CONTRACT_LIMITS } from './contract.js';

// Guest code. Field functions are sampled inside the sandbox; only normal Frame primitives leave it.
export const FIELD_SOURCE = String.raw`
sdk.field = (function () {
  const roles = ['prediction', 'input', 'output', 'warning'];
  const common = ['kind', 'x', 'y', 'w', 'h', 'xDomain', 'yDomain', 'xLabel', 'yLabel', 'xUnit', 'yUnit', 'valueLabel', 'valueUnit', 'samples', 'sample'];
  const maxObjects = Math.min(${CONTRACT_LIMITS.objects} - 5, 55);
  const maxPoints = Math.min(${CONTRACT_LIMITS.pointsTotal}, 3500);
  const pointsPerPath = ${CONTRACT_LIMITS.pointsPerObject};
  const legendHeight = 44;
  const fail = message => { throw new Error('sdk.field: ' + message); };

  function label(text, key, max, empty = false) {
    if (typeof text !== 'string' || (!empty && !text.trim()) || text.length > max
        || /[\u0000-\u001f\u007f-\u009f\u2028\u2029\ud800-\udfff\ufffe\uffff]/u.test(text)) fail('invalid ' + key);
    return text.trim();
  }
  const titled = (name, unit) => unit ? name + ' (' + unit + ')' : name;
  const textWidth = text => [...text].reduce((sum, c) => sum + (/[\x00-\xff]/.test(c) ? 12 : 17), 0);
  const domainAt = (domain, t) => {
    if (t === 1) return domain[1];
    const span = domain[1] - domain[0];
    return Number.isFinite(span) ? domain[0] + span * t : domain[0] * (1 - t) + domain[1] * t;
  };

  function plotArea(id, prefix, { x, y, w, h, xDomain, yDomain }, xLabel, yLabel) {
    if (!Number.isFinite(h) || h > ${CONTRACT_LIMITS.size} || y + h > ${CONTRACT_LIMITS.coordinate}) fail('invalid rectangle');
    // plot already owns axis ticks, labels and orientation. Its required single series supplies
    // the mapped corners; remove that calibration line, keeping just the existing axes.
    const objects = sdk.plot(id, { x, y, w, h: h - legendHeight, xDomain, yDomain, xLabel, yLabel,
      series: [{ id: 'field-domain', points: [[xDomain?.[0], yDomain?.[0]], [xDomain?.[1], yDomain?.[1]]] }] });
    const [[left, bottom], [right, top]] = objects.pop().points;
    const plotPrefixLength = ('plot:' + id + ':').length;
    for (const object of objects) object.id = prefix + object.id.slice(plotPrefixLength);
    return { objects, left, right, top, bottom };
  }

  function makeLegend(objects, prefix, opts, title, items) {
    const { x, y, w, h } = opts;
    const widths = items.map(item => textWidth(item.text) + 16);
    if (textWidth(title) > w - 16 || widths.reduce((a, b) => a + b, 0) > w - 16) fail('rectangle has no room for the field legend');
    objects.push(sdk.text(prefix + 'label', x + 8, y + h - 25, title));
    let left = x + 8;
    items.forEach((item, i) => {
      objects.push(sdk.text(prefix + 'legend:' + i, left, y + h - 7, item.text, { role: item.role }));
      left += widths[i];
    });
  }

  function ratio(a, b, level) {
    const span = b - a;
    return Number.isFinite(span) ? (level - a) / span : (level / 2 - a / 2) / (b / 2 - a / 2);
  }

  // Marching squares. Crossings are keyed by their grid edge so neighboring cells share the same
  // point exactly; following those edges gives one path per open chain or closed loop.
  function contourPaths(values, nx, ny, level, sx, sy, emit) {
    const nodes = new Map();
    function connect(a, b) { a.links.push(b); b.links.push(a); }
    function crossing(a, b) {
      const first = Math.min(a, b), last = Math.max(a, b);
      const key = first * 2 + (last - first === 1 ? 0 : 1);
      if (!nodes.has(key)) {
        const t = ratio(values[first], values[last], level);
        const col = sdk.lerp(first % nx, last % nx, t);
        const row = sdk.lerp(Math.floor(first / nx), Math.floor(last / nx), t);
        nodes.set(key, { point: [sx(col / (nx - 1)), sy(row / (ny - 1))], links: [] });
      }
      return nodes.get(key);
    }
    for (let row = 0; row < ny - 1; row++) {
      for (let col = 0; col < nx - 1; col++) {
        const start = row * nx + col;
        const corners = [start, start + 1, start + nx + 1, start + nx];
        const a = values[corners[0]], b = values[corners[1]], c = values[corners[2]], d = values[corners[3]];
        const above = [a >= level, b >= level, c >= level, d >= level];
        if (above.every(value => value === above[0])) continue;
        const edges = [];
        for (let i = 0; i < 4; i++) {
          const next = (i + 1) % 4;
          if (above[i] !== above[next]) edges.push(crossing(corners[i], corners[next]));
        }
        if (edges.length === 2) connect(edges[0], edges[1]);
        else {
          // Resolve a saddle according to its bilinear interpolant, including the exact crossing.
          const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), Math.abs(level));
          const offset = value => Number.isFinite(value - level) ? (value - level) / scale : value / scale - level / scale;
          const q = offset(a) * offset(c) - offset(b) * offset(d);
          const pairing = q > 0 ? [1, 2, 3] : q < 0 ? [3, 1, 2] : [2, 1, 3];
          connect(edges[0], edges[pairing[0]]);
          connect(edges[pairing[1]], edges[pairing[2]]);
        }
      }
    }
    const visited = new Set();
    function trace(start) {
      if (visited.has(start)) return;
      const points = [];
      const append = point => {
        const last = points[points.length - 1];
        if (!last || last[0] !== point[0] || last[1] !== point[1]) points.push(point);
      };
      let node = start, previous;
      while (node && !visited.has(node)) {
        visited.add(node);
        append(node.point);
        const next = node.links.find(other => other !== previous);
        previous = node;
        node = next;
      }
      if (node === start) append(start.point);
      if (points.length > 1) emit(points);
    }
    for (const node of nodes.values()) if (node.links.length === 1) trace(node);
    for (const node of nodes.values()) trace(node);
  }

  // Log spans preserve the direction even for an extreme but finite coordinate domain.
  function logSpan([a, b]) {
    const span = b - a;
    return Number.isFinite(span) ? Math.log(span) : Math.log(b / 2 - a / 2) + Math.LN2;
  }
  function drawVectors(prefix, { xDomain, yDomain, sample, maxMagnitude }, area, nx, ny, sx, sy) {
    const width = area.right - area.left, height = area.bottom - area.top;
    const maxLength = Math.min(width / nx, height / ny) * 0.68;
    const xScale = Math.log(width) - logSpan(xDomain), yScale = Math.log(height) - logSpan(yDomain);
    for (let row = 0; row < ny; row++) {
      for (let col = 0; col < nx; col++) {
        const tx = (col + 0.5) / nx, ty = (row + 0.5) / ny;
        const value = sample(domainAt(xDomain, tx), domainAt(yDomain, ty));
        if (!Array.isArray(value) || value.length !== 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) fail('sample must return a finite pair');
        const [u, v] = value;
        const peak = Math.max(Math.abs(u), Math.abs(v));
        if (peak === 0) continue;
        const lx = Math.log(Math.abs(u)) + xScale, ly = Math.log(Math.abs(v)) + yScale;
        const maxLog = Math.max(lx, ly);
        const dx = Math.sign(u) * Math.exp(lx - maxLog), dy = -Math.sign(v) * Math.exp(ly - maxLog);
        const magnitude = (peak / maxMagnitude) * Math.hypot(u / peak, v / peak);
        const length = maxLength * Math.min(1, magnitude) / (2 * Math.hypot(dx, dy));
        const x = sx(tx), y = sy(ty), ax = dx * length, ay = dy * length;
        if (x - ax !== x + ax || y - ay !== y + ay) {
          area.objects.push(sdk.arrow(prefix + 'vector:' + row + ':' + col, x - ax, y - ay, x + ax, y + ay, { role: roles[0] }));
        }
      }
    }
  }

  return function field(id, opts) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_.-]{1,32}$/.test(id)) fail('invalid field id');
    if (!opts || typeof opts !== 'object' || Array.isArray(opts) || !['contour', 'vector'].includes(opts.kind)) fail('kind must be contour or vector');
    const isContour = opts.kind === 'contour';
    const extra = isContour ? 'levels' : 'maxMagnitude';
    if (Object.keys(opts).some(key => key !== extra && !common.includes(key))) fail('invalid options for ' + opts.kind);
    const { sample, maxMagnitude } = opts;
    if (typeof sample !== 'function') fail('sample must be a function');
    const counts = opts.samples === undefined ? (isContour ? [21, 21] : [5, 5]) : opts.samples;
    const min = isContour ? 2 : 1, max = isContour ? 33 : 25;
    if (!Array.isArray(counts) || counts.length !== 2 || ![counts[0], counts[1]].every(n => Number.isInteger(n) && n >= min && n <= max)
        || (!isContour && counts[0] * counts[1] > 25)) fail('invalid samples: contours need 2 to 33 per axis; vectors allow at most 25 total');
    const [nx, ny] = counts;
    const xLabel = titled(label(opts.xLabel, 'xLabel', 30), label(opts.xUnit, 'xUnit', 12, true));
    const yLabel = titled(label(opts.yLabel, 'yLabel', 30), label(opts.yUnit, 'yUnit', 12, true));
    const valueUnit = label(opts.valueUnit, 'valueUnit', 12, true);
    const title = titled(label(opts.valueLabel, 'valueLabel', 30), valueUnit);
    let levels;
    if (isContour) {
      if (!Array.isArray(opts.levels) || opts.levels.length < 1 || opts.levels.length > roles.length) fail('levels must be 1 to 4 strictly increasing finite values');
      levels = [...opts.levels];
      if (!levels.every((value, i) => Number.isFinite(value) && (!i || value > levels[i - 1]))) fail('levels must be 1 to 4 strictly increasing finite values');
    } else if (!Number.isFinite(maxMagnitude) || maxMagnitude <= 0) fail('maxMagnitude must be finite and positive');
    const prefix = 'field:' + id + ':';
    const area = plotArea(id, prefix, opts, xLabel, yLabel);
    const xDomain = [...opts.xDomain], yDomain = [...opts.yDomain];
    const { objects, left, right, top, bottom } = area;
    const sx = t => sdk.lerp(left, right, t), sy = t => sdk.lerp(bottom, top, t);
    const legend = isContour ? levels.map((level, i) => ({ text: String(level), role: roles[i] }))
      : [{ text: 'Full arrow: ' + maxMagnitude + (valueUnit ? ' ' + valueUnit : ''), role: roles[0] }];
    makeLegend(objects, prefix, opts, title, legend);

    if (isContour) {
      const values = [];
      const xs = Array.from({ length: nx }, (_, col) => domainAt(xDomain, col / (nx - 1)));
      for (let row = 0; row < ny; row++) {
        const y = domainAt(yDomain, row / (ny - 1));
        for (const x of xs) {
          const value = sample(x, y);
          if (!Number.isFinite(value)) fail('sample must return a finite scalar');
          values.push(value);
        }
      }
      let pointCount = 0;
      levels.forEach((level, i) => {
        let part = 0;
        contourPaths(values, nx, ny, level, sx, sy, path => {
          for (let start = 0; start < path.length - 1; start += pointsPerPath - 1) {
            const points = path.slice(start, start + pointsPerPath);
            pointCount += points.length;
            if (pointCount > maxPoints) fail('contours exceed the field point budget');
            if (objects.length >= maxObjects) fail('contours exceed the frame object budget');
            objects.push(sdk.polyline(prefix + 'level:' + i + ':' + part++, points, { role: roles[i] }));
          }
        });
      });
    } else drawVectors(prefix, { xDomain, yDomain, sample, maxMagnitude }, area, nx, ny, sx, sy);
    if (objects.length > maxObjects) fail('field exceeds the frame object budget');
    return objects;
  };
})();
`;
