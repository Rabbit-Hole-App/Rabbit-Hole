import { ROLES } from '../scene-vocab.js';

// A small layered DAG for sandbox scenes. The caller supplies the topology;
// this helper only places it and highlights the selected path.
export const GRAPH_SOURCE = String.raw`
(function () {
  const ROLES = ${JSON.stringify(ROLES)};
  const NODE_HEIGHT = 42, PAD = 12, COLUMN_GAP = 18, LANE_GAP = 22;
  const fail = message => { throw new RangeError('sdk.graph: ' + message); };
  const nodeId = /^[A-Za-z0-9_-]{1,16}$/;

  function textWidth(text) {
    // The scene's body labels are 15 px. Give wide glyphs extra space.
    return Array.from(text, c => /[ilI .,:;!]/.test(c) ? 6 : /[MW@%#&mw]/.test(c) || c.codePointAt(0) > 255 ? 15 : 10)
      .reduce((sum, width) => sum + width, 0);
  }

  function checkedLabel(label, max) {
    return typeof label === 'string' && label.trim().length > 0 && label.length <= max && !/[\x00-\x1f\x7f\u2028\u2029\ud800-\udfff\ufffe\uffff]/u.test(label);
  }

  function port(node, routes, route, bottom) {
    const spread = Math.min(24, node.width / 4);
    const offset = routes.length === 1 ? 0 : (2 * routes.indexOf(route) / (routes.length - 1) - 1) * spread;
    return [node.center + offset, node.y + (bottom ? NODE_HEIGHT : 0)];
  }

  function crosses(points, left, top, right, bottom) {
    for (let i = 1; i < points.length; i += 1) {
      const [ax, ay] = points[i - 1], [bx, by] = points[i];
      if (Math.max(ax, bx) >= left && Math.min(ax, bx) <= right
          && Math.max(ay, by) >= top && Math.min(ay, by) <= bottom) return true;
    }
    return false;
  }

  function labelPosition(route, routes, left, right) {
    const [[from], , [to]] = route.points;
    const mid = (from + to) / 2, half = textWidth(route.edge.label) / 2 + 3;
    const y = route.depart.y - 6;
    for (const center of [mid, from + half + 7, from - half - 7, to + half + 7, to - half - 7]) {
      if (center - half < left || center + half > right) continue;
      if (routes.every(other => !crosses(other.points, center - half, y - 16, center + half, y + 2))) return [center, y];
    }
    fail('no room for an edge label; shorten labels or widen the graph');
  }

  sdk.graph = function (id, config) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_.:-]{1,24}$/.test(id)) fail('use a graph ID of 1 to 24 safe characters');
    if (!config || typeof config !== 'object') fail('expected a graph configuration');
    const { x, y, w, h, nodes, edges, active } = config;
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 4096 || y + h > 4096) {
      fail('expected positive dimensions inside the frame coordinate limit');
    }
    if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > 10) fail('expected 2 to 10 nodes');
    if (!Array.isArray(edges) || edges.length < 1 || edges.length > 12) fail('expected 1 to 12 edges');
    const byId = new Map();
    for (const node of nodes) {
      if (!node || typeof node.id !== 'string' || !nodeId.test(node.id)) fail('use a node ID of 1 to 16 letters, digits, underscores or hyphens');
      if (byId.has(node.id)) fail('duplicate node: ' + node.id);
      if (!checkedLabel(node.label, 24)) fail('use a nonblank node label of at most 24 characters');
      if (node.role !== undefined && !ROLES.includes(node.role)) fail('unknown node role: ' + node.role);
      byId.set(node.id, { label: node.label, role: node.role || 'neutral', rank: 0, incoming: [], outgoing: [] });
    }
    let highlighted;
    if (active !== undefined) {
      if (!Array.isArray(active) || active.length > nodes.length) fail('active must be a list of node IDs');
      highlighted = new Set(active);
      for (const key of highlighted) if (!byId.has(key)) fail('active refers to an unknown node: ' + key);
    }
    const pairs = new Set();
    const routes = [];
    for (const edge of edges) {
      const from = edge && byId.get(edge.from), to = edge && byId.get(edge.to);
      if (!from || !to) fail('edge refers to an unknown node');
      if (from === to) fail('self-edge: ' + edge.from);
      const key = edge.from + ':' + edge.to;
      if (pairs.has(key)) fail('duplicate edge: ' + key);
      pairs.add(key);
      if (edge.label !== undefined && !checkedLabel(edge.label, 14)) fail('use a nonblank edge label of at most 14 characters');
      const route = { edge, from, to, key };
      from.outgoing.push(route);
      to.incoming.push(route);
      if (from.outgoing.length > 4 || to.incoming.length > 4) fail('a node can have at most four incoming or four outgoing edges');
      routes.push(route);
    }

    const ready = [];
    for (const node of byId.values()) {
      node.pending = node.incoming.length;
      if (!node.pending) ready.push(node);
    }
    for (let i = 0; i < ready.length; i += 1) {
      const node = ready[i];
      for (const { to } of node.outgoing) {
        to.rank = Math.max(to.rank, node.rank + 1);
        if (--to.pending === 0) ready.push(to);
      }
    }
    if (ready.length !== nodes.length) fail('the graph must be acyclic');

    const rows = [];
    for (const node of byId.values()) (rows[node.rank] ||= []).push(node);
    const gaps = rows.slice(1).map(() => []);
    const skips = routes.filter(({ from, to }) => to.rank > from.rank + 1).sort((a, b) => b.from.rank - a.from.rank);
    const outerWidth = skips.length ? 18 + 12 * skips.length : 0;
    for (const route of routes) {
      route.depart = {};
      gaps[route.from.rank].push(route.depart);
    }
    for (const [i, route] of skips.entries()) {
      route.outside = x + w - PAD - outerWidth + 12 + i * 12;
      route.arrive = {};
      gaps[route.to.rank - 1].push(route.arrive);
    }
    const graphWidth = w - PAD * 2 - outerWidth;
    const widestRow = Math.max(...rows.map(row => row.length));
    const nodeWidth = Math.max(88, ...nodes.map(node => textWidth(node.label) + 20));
    if (widestRow * nodeWidth + (widestRow - 1) * COLUMN_GAP > graphWidth) fail('not enough room for the nodes; widen the graph or shorten node labels');
    const gapHeights = gaps.map(lanes => 38 + (lanes.length - 1) * LANE_GAP);
    const needed = PAD * 2 + NODE_HEIGHT * rows.length + gapHeights.reduce((sum, value) => sum + value, 0);
    if (needed > h) fail('not enough room for the routes; make the graph taller or simplify it');
    const slack = (h - needed) / gaps.length;
    let top = y + PAD;
    for (const [i, row] of rows.entries()) {
      const rowWidth = row.length * nodeWidth + (row.length - 1) * COLUMN_GAP;
      let left = x + PAD + (graphWidth - rowWidth) / 2;
      for (const node of row) {
        node.width = nodeWidth;
        node.center = left + nodeWidth / 2;
        node.y = top;
        left += nodeWidth + COLUMN_GAP;
      }
      if (i < gaps.length) {
        for (const [j, lane] of gaps[i].entries()) lane.y = top + NODE_HEIGHT + 24 + slack / 2 + j * LANE_GAP;
        top += NODE_HEIGHT + gapHeights[i] + slack;
      }
    }
    const exitX = route => route.outside ?? route.to.center;
    const entryX = route => route.arrive ? x + w + route.arrive.y : route.from.center;
    for (const node of byId.values()) {
      node.outgoing.sort((a, b) => exitX(a) - exitX(b));
      node.incoming.sort((a, b) => entryX(a) - entryX(b));
    }
    for (const route of routes) {
      const from = port(route.from, route.from.outgoing, route, true);
      const to = port(route.to, route.to.incoming, route, false);
      const laneX = route.outside ?? to[0];
      route.points = [from, [from[0], route.depart.y], [laneX, route.depart.y]];
      if (route.arrive) route.points.push([laneX, route.arrive.y], [to[0], route.arrive.y]);
      route.points.push(to);
    }

    const objects = [];
    for (const route of routes) {
      const prefix = id + '.e.' + route.key;
      const selected = highlighted?.has(route.edge.from) && highlighted.has(route.edge.to);
      // Keep unchosen routes and every label readable in both themes.
      const style = selected ? { role: 'learner', opacity: 1 }
        : highlighted ? { role: 'neutral', opacity: 0.72 } : { role: 'output', opacity: 1 };
      const points = route.points.filter(([px, py], i) => !i || px !== route.points[i - 1][0] || py !== route.points[i - 1][1]);
      const [tail, tip] = points.slice(-2);
      if (points.length > 2) objects.push(sdk.polyline(prefix + '.p', points.slice(0, -1), style));
      objects.push(sdk.arrow(prefix + '.a', tail[0], tail[1], tip[0], tip[1], style));
      if (route.edge.label !== undefined) {
        const [lx, ly] = labelPosition(route, routes, x + PAD, x + w - PAD);
        objects.push(sdk.text(prefix + '.l', lx, ly, route.edge.label, { align: 'middle' }));
      }
    }
    for (const [key, node] of byId) {
      const boxId = id + '.node.' + key;
      objects.push(sdk.box(boxId, node.center - node.width / 2, node.y, node.width, NODE_HEIGHT,
        { role: node.role, text: node.label }));
    }
    return objects;
  };
})();
`;
