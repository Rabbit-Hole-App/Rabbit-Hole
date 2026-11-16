import { ROLES } from '../scene-vocab.js';

// A bounded directed network, including feedback, reciprocal edges and self-loops.
// Positions are explicit local pixel centers so a teaching layout is deterministic.
// nodes: {id,label,x,y,role?}; edges: {from,to,label,via?:[[x,y],...],labelAt?:[x,y]}.
// Optional via and labelAt are also local coordinates. Selection never changes geometry.
export const CYCLIC_GRAPH_SOURCE = String.raw`
(function () {
  const ROLES = ${JSON.stringify(ROLES)};
  const fail = message => { throw new RangeError('sdk.cyclicGraph: ' + message); };
  const safeId = /^[A-Za-z0-9_-]{1,16}$/;
  const labelOK = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max
    && !/[\x00-\x1f\x7f\u2028\u2029\ud800-\udfff\ufffe\uffff]/u.test(s);
  const textWidth = text => Array.from(text, c => /[ilI .,:;!]/.test(c) ? 6
    : /[MW@%#&mw]/.test(c) || c.codePointAt(0) > 255 ? 15 : 10).reduce((a, b) => a + b, 0);
  const pointOK = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const center = node => [node.x, node.y];
  function port(node, toward) {
    const dx = toward[0] - node.x, dy = toward[1] - node.y;
    if (!dx && !dy) fail('a route must leave its node');
    const scale = Math.min(dx ? node.w / (2 * Math.abs(dx)) : Infinity, dy ? 21 / Math.abs(dy) : Infinity);
    if (scale >= 1) fail('route waypoint is inside its endpoint node');
    return [node.x + dx * scale, node.y + dy * scale];
  }
  // Slab clipping against the open interior: a route may meet a node boundary,
  // but must not hide its direction by passing through another node.
  function crosses(a, b, node) {
    let low = 0, high = 1;
    const bounds = [[node.x - node.w / 2 + 0.01, node.x + node.w / 2 - 0.01], [node.y - 20.99, node.y + 20.99]];
    for (let axis = 0; axis < 2; axis++) {
      const delta = b[axis] - a[axis], [min, max] = bounds[axis];
      if (Math.abs(delta) < 1e-9) { if (a[axis] < min || a[axis] > max) return false; }
      else { const t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta;
        low = Math.max(low, Math.min(t1, t2)); high = Math.min(high, Math.max(t1, t2)); }
    }
    return low < high;
  }
  sdk.cyclicGraph = function (id, config) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_.:-]{1,24}$/.test(id)) fail('use a safe graph ID of 1 to 24 characters');
    if (!config || typeof config !== 'object') fail('expected a graph configuration');
    const { x, y, w, h, nodes, edges, selected = null } = config;
    if (![x,y,w,h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x+w > 4096 || y+h > 4096) fail('invalid bounds');
    if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > 8) fail('expected 2 to 8 nodes');
    if (!Array.isArray(edges) || edges.length < 1 || edges.length > 12) fail('expected 1 to 12 edges');
    const byId = new Map();
    const inside = p => pointOK(p) && p[0] >= 0 && p[0] <= w && p[1] >= 0 && p[1] <= h;
    for (const node of nodes) {
      if (!node || !safeId.test(node.id) || typeof node.id !== 'string') fail('invalid node ID');
      if (byId.has(node.id)) fail('duplicate node: ' + node.id);
      if (!labelOK(node.label,24)) fail('node label must be 1 to 24 readable characters');
      if (node.role !== undefined && !ROLES.includes(node.role)) fail('unknown node role');
      const checked = { ...node, w: Math.max(88, textWidth(node.label) + 24) };
      if (!inside([node.x,node.y]) || node.x-checked.w/2 < 0 || node.x+checked.w/2 > w || node.y-21 < 0 || node.y+21 > h) fail('node outside bounds');
      for (const other of byId.values()) if (Math.abs(node.x-other.x) < (checked.w+other.w)/2+8 && Math.abs(node.y-other.y) < 50) fail('nodes overlap or have insufficient spacing');
      byId.set(node.id,checked);
    }
    if (selected !== null && (typeof selected !== 'string' || !byId.has(selected))) fail('selected refers to an unknown node');
    const pairs = new Set();
    for (const edge of edges) {
      if (!edge || !byId.has(edge.from) || !byId.has(edge.to)) fail('edge refers to an unknown node');
      const key = edge.from + ':' + edge.to;
      if (pairs.has(key)) fail('duplicate edge: ' + key);
      pairs.add(key);
      if (!labelOK(edge.label,14)) fail('edge label must be 1 to 14 readable characters');
      if (edge.via !== undefined && (!Array.isArray(edge.via) || edge.via.length < 1 || edge.via.length > 4 || !edge.via.every(inside))) fail('via must contain 1 to 4 bounded waypoints');
      if (edge.labelAt !== undefined && !inside(edge.labelAt)) fail('labelAt must be a bounded point');
    }
    const objects = [];
    const absolute = p => [x+p[0],y+p[1]];
    for (const edge of edges) {
      const from = byId.get(edge.from), to = byId.get(edge.to), key = edge.from + ':' + edge.to;
      let via = edge.via;
      if (!via && from === to) via = [[from.x-from.w*0.3,from.y-65],[from.x+from.w*0.3,from.y-65]];
      if (!via && pairs.has(edge.to + ':' + edge.from)) {
        const dx = to.x-from.x, dy = to.y-from.y, length = Math.hypot(dx,dy);
        via = [[(from.x+to.x)/2-dy/length*30,(from.y+to.y)/2+dx/length*30]];
      }
      const middle = via || [];
      const points = [port(from,middle[0] || center(to)), ...middle, port(to,middle.at(-1) || center(from))];
      if (!points.every(inside)) fail('route outside bounds; move nodes or supply via');
      for (let i=1;i<points.length;i++) {
        if (distance(points[i-1],points[i]) < 8) fail('route segments must be at least 8 pixels');
        for (const node of byId.values()) if (crosses(points[i-1],points[i],node)) fail('route crosses a node; supply via');
      }
      let label = edge.labelAt;
      if (!label) {
        let a=points[0], b=points[1];
        for (let i=2;i<points.length;i++) if (distance(points[i-1],points[i]) > distance(a,b)) { a=points[i-1]; b=points[i]; }
        const length=distance(a,b);
        label=[(a[0]+b[0])/2-(b[1]-a[1])/length*14,(a[1]+b[1])/2+(b[0]-a[0])/length*14];
      }
      const half=textWidth(edge.label)/2;
      if (label[0]-half < 0 || label[0]+half > w || label[1]-16 < 0 || label[1]+3 > h) fail('edge label outside bounds; supply labelAt');
      for (const node of byId.values()) if (label[0]+half > node.x-node.w/2 && label[0]-half < node.x+node.w/2 && label[1]+3 > node.y-21 && label[1]-16 < node.y+21) fail('edge label overlaps a node; supply labelAt');
      const style = { role: selected === edge.from ? 'learner' : 'output' };
      const prefix=id+'.e.'+key, path=points.map(absolute), [tail,tip]=path.slice(-2);
      if (path.length > 2) objects.push(sdk.polyline(prefix+'.p',path.slice(0,-1),style));
      objects.push(sdk.arrow(prefix+'.a',tail[0],tail[1],tip[0],tip[1],style));
      objects.push(sdk.text(prefix+'.l',x+label[0],y+label[1],edge.label,{align:'middle'}));
    }
    for (const [key,node] of byId) objects.push(sdk.box(id+'.node.'+key,x+node.x-node.w/2,y+node.y-21,node.w,42,{text:node.label,role:selected === key ? 'learner' : node.role || 'neutral'}));
    // At most three primitives per edge plus one per node: <=44 of the 60-object frame budget.
    return objects;
  };
})();
`;
