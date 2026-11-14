// Geometry lint (RD-3). A pure check over a renderer's LAYOUT OUTPUT (numbers, no pixels, no dependencies): the same layout gives the same violations.
// Input, as flow.js exposes it (layoutFlow(...).geometry):
//   { width, height,
//     nodes: [{ id, role, shape: 'box' | 'capsule' | 'diamond', x, y, width, height, text: [{ x, y, width, height }] }],
//     edges: [{ from, to, points: [[x, y], ...], label: null | { x, y, width, height } }] }
// Rules (a) sibling branch labels at one y, (b) no parallel wires closer than PARALLEL_GAP, (c) no edge-label box on a wire that is not its own,
// (d) no node text outside its shape, (e) no two labels intersecting. Every tolerance lives in TOLERANCE.

export const TOLERANCE = Object.freeze({
  parallelGap: 6,   // px: parallel wires closer than this (over a shared run) are a violation
  parallelRun: 1,   // px: the shared run must be longer than this to count (wires that only meet at an end do not)
  labelY: 1,        // px: sibling labels count as one level within this
  textPadding: 0,   // px: node text must sit inside its shape inset by this
  epsilon: 1e-6,
});

const fix = value => Number(value.toFixed(1));
const where = edge => `edge ${edge.from}:${edge.to}`;
const segmentsOf = edge => edge.points.slice(1).map((end, index) => [edge.points[index], end]).filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > TOLERANCE.epsilon);

// (a) The labels of branches leaving one node stand at one y: the reader compares them side by side.
function siblingLabels(geometry, found) {
  const byNode = new Map();
  for (const edge of geometry.edges) if (edge.label) (byNode.get(edge.from) ?? byNode.set(edge.from, []).get(edge.from)).push(edge);
  for (const [node, edges] of byNode) {
    if (edges.length < 2) continue;
    const centers = edges.map(edge => edge.label.y + edge.label.height / 2);
    const spread = Math.max(...centers) - Math.min(...centers);
    if (spread > TOLERANCE.labelY) found.push({ rule: 'a', where: `node ${node}`, detail: `labels of the ${edges.length} branches from ${node} stand at different heights: y = ${centers.map(fix).join(', ')} (${fix(spread)} px apart)` });
  }
}

// (b) Parallel wires of different edges need PARALLEL_GAP between them where they run side by side.
function parallelWires(geometry, found) {
  const reported = new Set();
  const { edges } = geometry;
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    let worst = null;
    for (const [a1, a2] of segmentsOf(edges[i])) for (const [b1, b2] of segmentsOf(edges[j])) {
      const da = [a2[0] - a1[0], a2[1] - a1[1]], db = [b2[0] - b1[0], b2[1] - b1[1]];
      const la = Math.hypot(...da), lb = Math.hypot(...db);
      if (Math.abs(da[0] * db[1] - da[1] * db[0]) > 1e-9 * la * lb) continue; // not parallel
      const unit = [da[0] / la, da[1] / la];
      const gap = Math.abs((b1[0] - a1[0]) * unit[1] - (b1[1] - a1[1]) * unit[0]);
      const along = point => (point[0] - a1[0]) * unit[0] + (point[1] - a1[1]) * unit[1];
      const run = Math.min(la, Math.max(along(b1), along(b2))) - Math.max(0, Math.min(along(b1), along(b2)));
      if (run <= TOLERANCE.parallelRun || gap >= TOLERANCE.parallelGap - TOLERANCE.epsilon) continue;
      if (!worst || gap < worst.gap) worst = { gap, run, at: [fix((a1[0] + a2[0]) / 2), fix((a1[1] + a2[1]) / 2)] };
    }
    const key = `${i}:${j}`;
    if (worst && !reported.has(key)) { reported.add(key); found.push({ rule: 'b', where: `${where(edges[i])} and ${where(edges[j])}`, detail: `parallel wires ${fix(worst.gap)} px apart over ${fix(worst.run)} px near (${worst.at.join(', ')}); the minimum is ${TOLERANCE.parallelGap} px` }); }
  }
}

const inside = (rect, [x, y]) => x > rect.x + TOLERANCE.epsilon && x < rect.x + rect.width - TOLERANCE.epsilon && y > rect.y + TOLERANCE.epsilon && y < rect.y + rect.height - TOLERANCE.epsilon;
function crossesRect(rect, [p, q]) {
  if (inside(rect, p) || inside(rect, q)) return true;
  const corners = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]];
  const side = ([a, b], [c, d]) => {
    const orient = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    return o1 * o2 < -TOLERANCE.epsilon && o3 * o4 < -TOLERANCE.epsilon;
  };
  return corners.some((corner, index) => side([p, q], [corner, corners[(index + 1) % 4]]));
}

// (c) An edge label is drawn over a clear stretch of its own wire: no other wire passes through its box.
function labelOnWires(geometry, found) {
  for (const edge of geometry.edges) {
    if (!edge.label) continue;
    for (const other of geometry.edges) {
      if (other === edge) continue;
      if (segmentsOf(other).some(segment => crossesRect(edge.label, segment))) found.push({ rule: 'c', where: `label of ${where(edge)}`, detail: `the label box (${fix(edge.label.x)}, ${fix(edge.label.y)}, ${fix(edge.label.width)} x ${fix(edge.label.height)}) is crossed by the wire of ${where(other)}` });
    }
  }
}

function insideShape(node, [px, py]) {
  const pad = TOLERANCE.textPadding, eps = TOLERANCE.epsilon;
  const { x, y, width, height } = node;
  if (px < x + pad - eps || px > x + width - pad + eps || py < y + pad - eps || py > y + height - pad + eps) return false;
  if (node.shape === 'diamond') return Math.abs(px - (x + width / 2)) / (width / 2 - pad) + Math.abs(py - (y + height / 2)) / (height / 2 - pad) <= 1 + eps;
  if (node.shape === 'capsule') {
    // The renderer's rounded rectangle: radius half the shorter side (an SVG radius is clamped to half the width and half the height).
    const r = Math.min(width, height) / 2;
    const nearX = Math.min(Math.max(px, x + r), x + width - r), nearY = Math.min(Math.max(py, y + r), y + height - r);
    return (px - nearX) ** 2 + (py - nearY) ** 2 <= r * r + eps;
  }
  return true;
}

// (d) Every line of a node's text lies inside the node's shape (a diamond's slopes and a capsule's ends included).
function textInShape(geometry, found) {
  for (const node of geometry.nodes) for (const line of node.text) {
    const corners = [[line.x, line.y], [line.x + line.width, line.y], [line.x + line.width, line.y + line.height], [line.x, line.y + line.height]];
    if (!corners.every(corner => insideShape(node, corner))) found.push({ rule: 'd', where: `node ${node.id}`, detail: `a line of its text (${fix(line.x)}, ${fix(line.y)}, ${fix(line.width)} x ${fix(line.height)}) leaves the ${node.shape} (${fix(node.x)}, ${fix(node.y)}, ${fix(node.width)} x ${fix(node.height)})` });
  }
}

const overlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > TOLERANCE.epsilon && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > TOLERANCE.epsilon;

// (e) No two labels intersect: edge labels with each other and with any node's text.
function labelOverlap(geometry, found) {
  const labels = geometry.edges.filter(edge => edge.label);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) if (overlap(labels[i].label, labels[j].label)) found.push({ rule: 'e', where: `labels of ${where(labels[i])} and ${where(labels[j])}`, detail: `the two edge labels overlap (${fix(labels[i].label.x)}, ${fix(labels[i].label.y)}) and (${fix(labels[j].label.x)}, ${fix(labels[j].label.y)})` });
    for (const node of geometry.nodes) for (const line of node.text) if (overlap(labels[i].label, line)) found.push({ rule: 'e', where: `label of ${where(labels[i])} and node ${node.id}`, detail: `the edge label (${fix(labels[i].label.x)}, ${fix(labels[i].label.y)}, ${fix(labels[i].label.width)} x ${fix(labels[i].label.height)}) overlaps a line of the text of node ${node.id}` });
  }
}

// All violations of one layout, in a fixed order, each { id, rule, where, detail }.
export function lintGeometry(geometry, { id = '' } = {}) {
  const found = [];
  siblingLabels(geometry, found);
  parallelWires(geometry, found);
  labelOnWires(geometry, found);
  textInShape(geometry, found);
  labelOverlap(geometry, found);
  return found.map(violation => ({ id, ...violation }));
}

// One line in the linters' format: what is wrong and where, with the fix.
export const FIXES = Object.freeze({
  a: 'fix the renderer: place sibling branch labels at one height',
  b: 'fix the renderer: space the wires at least 6 px apart',
  c: 'fix the renderer: move the label or the other wire',
  d: 'fix the renderer: widen or heighten the node so its text fits the shape',
  e: 'fix the renderer: separate the two labels',
});
export const formatViolation = ({ id, rule, where: at, detail }) => `${id ? `${id}: ` : ''}geometry rule ${rule} at ${at}: ${detail}. ${FIXES[rule]}`;
