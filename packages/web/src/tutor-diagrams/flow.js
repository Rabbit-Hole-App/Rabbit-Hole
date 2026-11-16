import { createElement as h } from 'react';
import { flowPaths } from './flow-paths.js';
import { box, diamond, label, lineHeight, longestWordWidth, SURFACE, textWidth, wire, widestFormula, wrap } from './primitives.js';
import { skipLanePoints, skipLaneX } from './skip-lanes.js';
import { layoutTensorStrip, tensorMinimumWidth } from './tensor-layout.js';

const PAD = 14;
const NODE_GAP = 18;
const NODE_MIN = 180;
const NODE_MAX = 220;
const EDGE_TEXT = 13;
const EDGE_WRAP = 158;
const PARALLEL_WIDTH = 960;
const TENSOR_PAD = 10;
const DECISION_BAND = 2 / 3;

// The narrowest wrap width at which a label takes two lines (from its longest word up).
const twoLineWidth = (text, from) => { let width = Math.ceil(from); while (wrap(text, width).length > 2 && width < 600) width += 2; return width; };

// A decision on two lines is wide enough that its diamond is no taller than about on three (the widest line plus 40 px stays within 74% of the width).
const twoLineMinimum = (text, word) => Math.ceil((Math.max(...wrap(text, twoLineWidth(text, word)).map(line => textWidth(line))) + 40) / 0.74);

const nodeName = node => node.label ?? node.tensor?.name ?? node.tensor?.dimensions;

function layersFor(nodes, incoming) {
  const ranks = new Map();
  function rank(id) {
    if (!ranks.has(id)) ranks.set(id, Math.max(0, ...incoming.get(id).map(edge => rank(edge.from) + 1)));
    return ranks.get(id);
  }
  const rows = [];
  for (const node of nodes) (rows[rank(node.id)] ??= []).push(node);
  return { rows, ranks };
}

function portOffset(node, edges, edge) {
  // The two branches of a decision both leave from its bottom centre, share the first drop and part along one horizontal run.
  if (node.role === 'decision' && !node.tensor && edges.length === 2 && edges.every(other => other.from === node.id)) return 0;
  const normalSpread = Math.min(20, node.width * 0.18);
  const spread = Math.min(node.width / 2 - 12, Math.max(normalSpread, (edges.length - 1) * 5));
  return edges.length > 1 ? (2 * edges.indexOf(edge) / (edges.length - 1) - 1) * spread : 0;
}

// A pill (fully rounded capsule): an outcome, and the start of the flow (the first node, which has no incoming edge) unless it is a decision.
const isCapsule = node => !node.tensor && node.role !== 'decision' && (node.role === 'outcome' || node.start === true);

function port(node, edges, edge, bottom, move = 0) {
  const dx = portOffset(node, edges, edge) + move;
  let inset = 0;
  if (node.role === 'decision') inset = Math.abs(dx) * node.height / node.width;
  if (isCapsule(node)) {
    // A wide fan-in can reach the curved ends of the outcome capsule.
    const radiusX = capsuleRadius(node);
    const cornerX = Math.max(0, Math.abs(dx) - (node.width / 2 - radiusX));
    inset = (radiusX === Math.min(node.width, node.height) / 2 ? node.height / 2 : radiusX) * (1 - Math.sqrt(1 - (cornerX / radiusX) ** 2));
  }
  return [node.cx + dx, bottom ? node.y + node.height - inset : node.y + inset];
}

// RD-4c: the corner radius of an outcome capsule: half the shorter side (a pill) when every line of its text lies inside the rounded ends, else the largest smaller radius that keeps them inside.
function capsuleRadius({ width, height, lines }) {
  const size = lines.fontSize ?? 15, step = lineHeight(size), pill = Math.min(width, height) / 2;
  const fits = radius => lines.every((line, index) => {
    const dx = textWidth(line, size) / 2 - (width / 2 - radius);
    const dy = Math.abs(index - (lines.length - 1) / 2) * step + size / 2 - (height / 2 - radius);
    return Math.hypot(Math.max(0, dx), Math.max(0, dy)) <= radius;
  });
  for (let radius = pill; radius > 7; radius -= 1) if (fits(radius)) return radius;
  return 7;
}

// The width of a decision that holds its whole label on one line: the diamond keeps about 68% of its width at the label's height.
const oneLineDecision = text => Math.ceil((textWidth(text) + 40) / 0.72);

function measureDecision(lines, width) {
  // The width available at y falls linearly away from the center of a diamond.
  const bands = lines.map((line, index) => ({
    y: (index - (lines.length - 1) / 2) * lineHeight(),
    ratio: 1 - (textWidth(line) + 40) / width,
  }));
  const heightAt = offset => Math.ceil(Math.max(74, ...bands.map(({ y, ratio }) => 2 * (Math.abs(y + offset) + 10) / ratio)));
  const centered = heightAt(0);
  const offset = -bands.reduce((widest, band) => band.ratio < widest.ratio ? band : widest).y;
  const aligned = heightAt(offset);
  return aligned < centered ? { height: aligned, offset } : { height: centered, offset: 0 };
}

function measureTensorNode(node, width) {
  const decision = node.role === 'decision';
  const contentWidth = width * (decision ? DECISION_BAND : 1) - 2 * TENSOR_PAD;
  const lines = wrap(node.label ?? '', contentWidth);
  const labelHeight = lines.length * lineHeight();
  const strip = layoutTensorStrip(node.tensor, decision ? 0 : contentWidth);
  const stripOffset = labelHeight ? labelHeight + 6 : 0;
  const contentHeight = stripOffset + strip.height;
  let height = contentHeight + 2 * TENSOR_PAD;
  if (decision) {
    // Keep the entire content band inside the diamond's sloped sides.
    const bandWidth = Math.max(strip.width, ...lines.map(line => textWidth(line))) + 2 * TENSOR_PAD;
    height = Math.ceil(height / (1 - bandWidth / width));
  }
  return { height, lines, strip, stripOffset, labelHeight, contentHeight };
}

function crosses(points, { x, y, width, height }) {
  const margin = 2;
  return points.slice(1).some(([x2, y2], i) => {
    const [x1, y1] = points[i];
    return x1 === x2
      ? x1 > x - margin && x1 < x + width + margin
        && Math.max(y1, y2) > y - margin && Math.min(y1, y2) < y + height + margin
      : y1 > y - margin && y1 < y + height + margin
        && Math.max(x1, x2) > x - margin && Math.min(x1, x2) < x + width + margin;
  });
}

const MIN_WIRE_GAP = 6; // RD-4b: the least distance between two side-by-side wires (the lint's parallelGap); a clash is moved apart to WIRE_GAP
const WIRE_GAP = 8;

// The first pair of vertical legs of two different edges that run side by side closer than MIN_WIRE_GAP, each as { index of its route, leg number, x }.
function closeVerticals(routed) {
  const legs = routed.map(({ points }) => points.slice(1).map((end, leg) => [points[leg], end, leg]).filter(([a, b]) => a[0] === b[0] && a[1] !== b[1]));
  for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) for (const [a1, a2, legA] of legs[i]) for (const [b1, b2, legB] of legs[j]) {
    const run = Math.min(Math.max(a1[1], a2[1]), Math.max(b1[1], b2[1])) - Math.max(Math.min(a1[1], a2[1]), Math.min(b1[1], b2[1]));
    const gap = Math.abs(a1[0] - b1[0]);
    // Two branches of one node on the very same x are a fork sharing its first drop, not a clash.
    if (run > 1 && gap < MIN_WIRE_GAP && !(gap === 0 && routed[i].edge.from === routed[j].edge.from)) return { a: { route: i, leg: legA, x: a1[0] }, b: { route: j, leg: legB, x: b1[0] }, gap };
  }
  return null;
}

// Where to move the port a clashing leg starts or ends at, away from the other leg to WIRE_GAP: { edge, end, move }, or null when the leg is a middle leg or a side branch, or the port would leave its node edge. The later edge moves first.
function nudgeFor(side, other, routed, placements, outgoing, incoming, moves) {
  const { edge, points, side: branch } = routed[side.route];
  const end = branch ? null : side.leg === 0 ? 'from' : side.leg === points.length - 2 ? 'to' : null;
  if (!end) return null;
  const node = placements.get(end === 'from' ? edge.from : edge.to);
  const move = (moves.get(edge)?.[end] ?? 0) + (side.x >= other.x ? 1 : -1) * (WIRE_GAP - Math.abs(side.x - other.x));
  const offset = portOffset(node, (end === 'from' ? outgoing : incoming).get(node.id), edge) + move;
  return Math.abs(offset) <= node.width / 2 - 12 ? { edge, end, move } : null;
}

const apart = (a, b) => a.x + a.width + 2 <= b.x || b.x + b.width + 2 <= a.x || a.y + a.height + 2 <= b.y || b.y + b.height + 2 <= a.y;

// `placed`: boxes of labels already standing, which a label of a shared label lane (RD-4a) must also keep clear of.
function labelBounds(route, others, width, placed = []) {
  const { words, side, dir, lift = 0, labelLane, points: [[from, fromY], turn, end] } = route;
  const [to, runY] = side ? [turn[0], fromY] : end;
  const y = labelLane ? labelLane.y : runY;
  const w = Math.ceil(Math.max(...words.map(word => textWidth(word, EDGE_TEXT))) + 12);
  const h = words.length * lineHeight(EDGE_TEXT) + 4;
  const center = labelLane ? to : (from + to) / 2; // RD-4a: on the wire's last vertical leg, in the lane the node's branches share
  const straight = !side && !labelLane && Math.abs(from - to) < 35;
  // RD-2b: beside a short drop the label stands outside the vertex; on a run it is centred on it.
  const anchor = side === 'drop' ? from + dir * (4 + w / 2) : center;
  const offset = straight ? w / 2 + 7 : 0;
  const offsets = [offset, -offset, offset + 10, -offset - 10, offset + 20, -offset - 20, offset + 35, -offset - 35];
  const clamped = candidate => Math.max(PAD, Math.min(width - PAD - w, candidate));
  for (const shift of offsets) {
    const x = clamped(anchor + shift - w / 2);
    const bounds = { x, y: side ? y - h - 4 - lift : y - h / 2, width: w, height: h };
    if (others.every(other => other === route || !crosses(other.points, bounds)) && placed.every(box => apart(box, bounds))) return bounds;
  }
  return null;
}

// RD-4a: a node whose shared label lane finds no room (a label would touch a wire that passes through the lane) is laid out again with its branches on their own lanes, as before.
export function layoutFlow(diagram, requestedWidth, paintNode) {
  const unshared = new Set();
  for (;;) {
    const { failed, ...layout } = layoutPass(diagram, requestedWidth, paintNode, unshared);
    if (!failed.length) return layout;
    for (const id of failed) unshared.add(id);
  }
}

function layoutPass({ nodes, edges, highlightPath }, requestedWidth, paintNode, unshared) {
  const paths = flowPaths(highlightPath);
  const onPath = new Set(paths.flat());
  const pathEdge = ({ from, to }) => paths.some(path => path.some((id, index) => id === from && path[index + 1] === to));
  const incoming = new Map(nodes.map(node => [node.id, []]));
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  for (const edge of edges) {
    incoming.get(edge.to).push(edge);
    outgoing.get(edge.from).push(edge);
  }
  const { rows, ranks } = layersFor(nodes, incoming);
  const skips = edges.filter(edge => ranks.get(edge.to) > ranks.get(edge.from) + 1)
    .sort((a, b) => ranks.get(b.from) - ranks.get(a.from));
  const skipOrder = new Map(skips.map((edge, index) => [edge, index]));
  const outer = skips.length ? 16 + skips.length * 9 : 0;
  const metrics = rows.map(row => {
    const space = PARALLEL_WIDTH - 2 * PAD - outer - (row.length - 1) * NODE_GAP;
    const wordLimit = paths.length === 2 ? Math.min(NODE_MAX, Math.floor(space / row.length)) : NODE_MAX;
    const floor = Math.min(NODE_MIN, wordLimit);
    return row.map(node => {
      const text = node.label ?? '';
      const word = longestWordWidth(text);
      const decision = node.role === 'decision';
      const pad = decision ? 32 : 48;
      const required = Math.ceil(word + pad);
      // A long word wraps by characters. Unbreakable formulas and tensors can widen their node.
      const min = Math.max(floor, required <= wordLimit ? required : Math.ceil(widestFormula(text) + pad));
      // A decision is wide enough for its label on one line (the diamond narrows away from its middle), when that stays within 360 px.
      const oneLine = decision && !node.tensor ? oneLineDecision(text) : 0;
      if (!node.tensor) return { word, min: oneLine && oneLine <= 360 ? Math.max(min, oneLine) : min, plain: min, text };
      const contentWidth = Math.max(tensorMinimumWidth(node.tensor), widestFormula(text));
      const tensorWidth = Math.ceil((contentWidth + 2 * TENSOR_PAD) / (decision ? DECISION_BAND : 1));
      return { word, min: Math.max(min, tensorWidth) };
    });
  });
  // A decision label wraps to two lines when its one-line diamond would push the figure past the card: the width asked for, at least 720 and at most 960.
  const budget = Math.min(PARALLEL_WIDTH, Math.max(720, requestedWidth));
  const rowWidth = row => row.reduce((sum, node) => sum + node.min, 0) + (row.length - 1) * NODE_GAP;
  for (const row of metrics) if (2 * PAD + outer + rowWidth(row) > budget) for (const node of row) if (node.plain) Object.assign(node, { min: Math.min(node.min, Math.max(node.plain, twoLineMinimum(node.text, node.word))), twoLine: true }); // never wider than the one-line minimum it replaces
  const rowMinimums = metrics.map(rowWidth);
  const width = Math.max(requestedWidth, 2 * PAD + Math.max(...rowMinimums) + outer);
  const inner = width - 2 * PAD - outer;
  const placements = new Map();

  const gaps = rows.map(() => []);
  const routes = edges.map(edge => {
    const from = ranks.get(edge.from), to = ranks.get(edge.to);
    const words = edge.label ? wrap(edge.label, EDGE_WRAP, EDGE_TEXT) : [];
    const depart = { height: words.length ? words.length * lineHeight(EDGE_TEXT) + 8 : 12 };
    const arrive = to > from + 1 ? { height: 12 } : null;
    gaps[from].push(depart);
    return { edge, depart, arrive, words };
  });
  const routeByEdge = new Map(routes.map(route => [route.edge, route]));
  // Inside lanes turn toward a shared target before the outside lanes arrive.
  for (const edge of skips) gaps[ranks.get(edge.to) - 1].push(routeByEdge.get(edge).arrive);

  const placedRows = rows.map((row, rank) => {
    const share = (inner - rowMinimums[rank]) / row.length;
    const widths = metrics[rank].map(({ min }) => Math.min(Math.max(NODE_MAX, min), min + share));
    const extra = (inner - widths.reduce((sum, w) => sum + w, 0) - (row.length - 1) * NODE_GAP) / row.length;
    let x = PAD + extra / 2;
    const rowNodes = row.map((node, index) => {
      const w = widths[index];
      const previous = incoming.get(node.id);
      const parent = previous.length === 1 ? placements.get(previous[0].from) : null;
      const ideal = row.length === 1 && parent ? parent.cx : x + w / 2;
      x += w + NODE_GAP + extra;
      const cx = Math.max(PAD + w / 2, Math.min(PAD + inner - w / 2, ideal));
      if (node.tensor) return { ...node, width: w, cx, ...measureTensorNode(node, w) };
      const isDecision = node.role === 'decision';
      const wrapWidth = isDecision ? (w >= oneLineDecision(node.label ?? '') ? w : Math.max(w * 0.58, Math.min(w - 32, metrics[rank][index].twoLine ? twoLineWidth(node.label ?? '', metrics[rank][index].word) : metrics[rank][index].word))) : w - 48;
      const lines = wrap(node.label, wrapWidth);
      const { height, offset } = isDecision ? measureDecision(lines, w)
        : { height: 40 + 16 * Math.max(1, lines.length), offset: 0 }; // 56 for one line, 72 for two
      return { ...node, width: w, height, cx, lines, offset, start: previous.length === 0 };
    });
    for (const node of rowNodes) placements.set(node.id, node);
    return rowNodes;
  });

  // Port order follows where the wire actually runs, including right-side skips.
  const skipX = edge => skipLaneX(PAD + inner, skipOrder.get(edge));
  const exitX = edge => skipOrder.has(edge) ? skipX(edge) : placements.get(edge.to).cx;
  const entryOrder = edge => skipOrder.has(edge) ? width + skipOrder.get(edge) : placements.get(edge.from).cx;
  for (const group of outgoing.values()) group.sort((a, b) => exitX(a) - exitX(b));
  for (const group of incoming.values()) group.sort((a, b) => entryOrder(a) - entryOrder(b));
  // RD-2: a decision with exactly two branches, one to each side, into the next rank leaves its side vertices: both wires run at the diamond's mid-height to the
  // target's top port and drop straight, taking no lane in the gap below the row. RD-2b: where the run would be shorter than the label (or inward: the targets sit under the
  // vertices) the wire drops straight from the vertex onto its target and the label stands outside it. Anything else (three branches, a skip, both targets on one side,
  // another node of the row standing on the run or the drop) keeps the lane routing.
  const sideEdges = new Map();
  // ponytail: the side-vertex exit (RD-2) is off: a decision whose two targets are below leaves by the shared bottom-centre fork below. It would apply again only to a target level with the decision, which the layering does not produce.
  const SIDE_EXIT = false;
  for (const node of placements.values()) {
    const branches = outgoing.get(node.id);
    if (!SIDE_EXIT || node.role !== 'decision' || node.tensor || branches.length !== 2) continue;
    if (branches.some(edge => skipOrder.has(edge) || ranks.get(edge.to) !== ranks.get(node.id) + 1)) continue;
    if (!(placements.get(branches[0].to).cx < node.cx && node.cx < placements.get(branches[1].to).cx)) continue;
    const plans = branches.map((edge, index) => {
      const sign = index === 0 ? -1 : 1;
      const vertexX = node.cx + sign * node.width / 2;
      const target = placements.get(edge.to);
      const turnX = port(target, incoming.get(edge.to), edge, false)[0];
      const words = edge.label ? wrap(edge.label, EDGE_WRAP, EDGE_TEXT) : [];
      const labelWidth = words.length ? Math.ceil(Math.max(...words.map(word => textWidth(word, EDGE_TEXT))) + 12) : 0;
      const labelHeight = words.length ? words.length * lineHeight(EDGE_TEXT) + 4 : 0;
      const clearOf = (a, b) => placedRows[ranks.get(node.id)].every(other => other === node || other.cx + other.width / 2 <= Math.min(a, b) - 2 || other.cx - other.width / 2 >= Math.max(a, b) + 2);
      if (sign * (turnX - vertexX) > 0 && Math.abs(turnX - vertexX) >= labelWidth && clearOf(vertexX, turnX)) return { kind: 'run', dir: sign, labelWidth, labelHeight, vertexX, turnX };
      // The drop lands on the top edge of the target away from its rounded corners, which only a lone arrival may move.
      const margin = isCapsule(target) ? capsuleRadius(target) : 8;
      const lands = incoming.get(edge.to).length === 1 && vertexX >= target.cx - target.width / 2 + margin && vertexX <= target.cx + target.width / 2 - margin;
      return lands && clearOf(vertexX, vertexX) ? { kind: 'drop', dir: sign, labelWidth, labelHeight, vertexX } : null;
    });
    if (plans.every(Boolean)) {
      // The label boxes as labelBounds will place them (clamped onto the card): a drop label pushed over the diamond is lifted clear of its edge, both branches to one height (rule a),
      // and a node whose two labels would overlap each other, or need more lift than the diamond's upper half allows, keeps the lane routing (found by the geometry lint, RD-3).
      const ratio = node.width / node.height;
      const boxes = plans.map(plan => {
        const x = Math.max(PAD, Math.min(width - PAD - plan.labelWidth, plan.kind === 'drop' ? plan.vertexX + plan.dir * (4 + plan.labelWidth / 2) - plan.labelWidth / 2 : (plan.vertexX + plan.turnX) / 2 - plan.labelWidth / 2));
        const over = plan.kind === 'drop' ? (plan.dir < 0 ? x + plan.labelWidth - plan.vertexX : plan.vertexX - x) : 0;
        return { x, right: x + plan.labelWidth, lift: over > 0 ? over / ratio + 2 : 0 };
      });
      const lift = Math.max(...boxes.map(box => box.lift));
      if (boxes[0].right + 2 <= boxes[1].x && lift <= node.height / 2 - 4 - Math.max(...plans.map(plan => plan.labelHeight))) branches.forEach((edge, index) => sideEdges.set(edge, { ...plans[index], lift }));
    }
  }
  for (const edge of sideEdges.keys()) {
    const gap = gaps[ranks.get(edge.from)];
    gap.splice(gap.indexOf(routeByEdge.get(edge).depart), 1);
  }
  for (const [id, group] of incoming) {
    group.sort((a, b) => entryOrder(a) - entryOrder(b));
    if (group.length < 3) continue;
    const target = placements.get(id);
    const left = [], right = [];
    for (const edge of group) {
      const { depart, arrive } = routeByEdge.get(edge);
      if (arrive || sideEdges.has(edge)) continue;
      const source = placements.get(edge.from);
      const fromX = source.cx + portOffset(source, outgoing.get(edge.from), edge);
      const toX = target.cx + portOffset(target, group, edge);
      (fromX < toX ? left : right).push(depart);
    }
    // Nearer approaches turn first on each side, so an outer wire never crosses
    // an inner arrival. Reuse the existing gap slots to keep nearby routes in order.
    const gap = gaps[ranks.get(id) - 1];
    for (const lanes of [left.reverse(), right]) {
      const slots = lanes.map(lane => gap.indexOf(lane)).sort((a, b) => a - b);
      slots.forEach((slot, index) => { gap[slot] = lanes[index]; });
    }
  }

  // FLOW-X: a run passes below the stem of every other node whose stem it spans (a stem is the vertical from a node down to its own lowest lane), so a run never crosses a stem. The lanes of a gap
  // keep their order unless a run would cross a stem; then the run goes after (below) that node's lanes (a stable topological order: a cycle keeps the old order).
  gaps.forEach((gap, rank) => {
    const lanes = routes.filter(route => !route.arrive && !sideEdges.has(route.edge) && gap.includes(route.depart));
    const stemX = route => placements.get(route.edge.from).cx + portOffset(placements.get(route.edge.from), outgoing.get(route.edge.from), route.edge);
    const runX = route => { const to = placements.get(route.edge.to); const x = to.cx + portOffset(to, incoming.get(route.edge.to), route.edge); return [Math.min(stemX(route), x), Math.max(stemX(route), x)]; };
    const before = new Map(gap.map(lane => [lane, new Set()]));
    for (const run of lanes) {
      const [left, right] = runX(run);
      for (const other of lanes) if (other.edge.from !== run.edge.from && other.depart !== run.depart && stemX(other) > left + 1 && stemX(other) < right - 1) before.get(run.depart).add(other.depart);
    }
    const sourceOf = new Map(lanes.map(route => [route.depart, route.edge.from]));
    const order = [], left = new Set(gap);
    while (left.size) {
      const ready = gap.filter(lane => left.has(lane) && [...before.get(lane)].every(other => !left.has(other)));
      // The lanes of one node stay together when they can, so its branches can share a height (RD-4a).
      const next = ready.find(lane => order.length && sourceOf.get(lane) !== undefined && sourceOf.get(lane) === sourceOf.get(order.at(-1))) ?? ready[0] ?? gap.find(lane => left.has(lane));
      order.push(next);
      left.delete(next);
    }
    order.forEach((lane, index) => { gap[index] = lane; });
  });

  // Fork: the two branches of a decision share one lane, so both drop from the diamond's bottom centre to one height and run apart there. A row gap takes the shared fork only when exactly one
  // decision forks into it: with two or more, their merged lanes cross, so every branch in that gap keeps its own nested lane.
  const forks = new Set();
  const forking = [...placements.values()].filter(node => {
    const branches = outgoing.get(node.id);
    return node.role === 'decision' && !node.tensor && branches.length === 2 && !branches.some(edge => skipOrder.has(edge) || sideEdges.has(edge));
  });
  for (const node of forking) {
    if (forking.some(other => other !== node && ranks.get(other.id) === ranks.get(node.id))) continue;
    const branches = outgoing.get(node.id);
    const [lead, other] = branches.map(edge => routeByEdge.get(edge));
    lead.depart.height = Math.max(lead.depart.height, other.depart.height);
    const lane = gaps[ranks.get(node.id)];
    lane.splice(lane.indexOf(other.depart), 1);
    other.depart = lead.depart;
    forks.add(node.id);
  }

  // RD-4a: two or more labelled branches that leave a node by lanes stand at one height. (1) When their runs and labels are side by side without touching (opposite directions, or short runs
  // apart), the branches share one lane and each label stands on its run. (2) Otherwise the wires keep their own 12 px lanes and the labels share one more lane below them, each label on its
  // wire's last vertical leg; the labels must fit side by side (the default wrap, else a narrower one), and if they do not, none of the node's branches is labelled inline (the key under the graph).
  const labelGroups = [];
  const labelWidth = words => Math.ceil(Math.max(...words.map(word => textWidth(word, EDGE_TEXT))) + 12);
  const apartX = (a, b, margin) => a[1] + margin <= b[0] || b[1] + margin <= a[0];
  for (const node of placements.values()) {
    const group = outgoing.get(node.id).map(edge => routeByEdge.get(edge)).filter(route => !sideEdges.has(route.edge) && !route.arrive && route.words.length);
    if (group.length < 2 || unshared.has(node.id) || forks.has(node.id)) continue;
    const anchors = group.map(({ edge }) => placements.get(edge.to).cx + portOffset(placements.get(edge.to), incoming.get(edge.to), edge));
    const starts = group.map(({ edge }) => node.cx + portOffset(node, outgoing.get(node.id), edge));
    const runs = group.map((_, index) => [Math.min(starts[index], anchors[index]), Math.max(starts[index], anchors[index])]);
    const boxes = group.map((route, index) => {
      const w = labelWidth(route.words), x = Math.max(PAD, Math.min(width - PAD - w, (starts[index] + anchors[index]) / 2 - w / 2));
      return [x, x + w];
    });
    const slots = group.map(route => gaps[ranks.get(node.id)].indexOf(route.depart)).sort((a, b) => a - b);
    const sideBySide = slots.every((slot, index) => slot === slots[0] + index) && runs.every((run, i) => run[1] - run[0] >= 35 && runs.every((other, j) => j === i || (apartX(run, other, 6) && apartX(boxes[i], other, 2) && apartX(boxes[i], boxes[j], 2))));
    if (sideBySide) {
      const [lead, ...rest] = group;
      lead.depart.height = Math.max(...group.map(route => route.depart.height));
      for (const route of rest) { gaps[ranks.get(node.id)].splice(gaps[ranks.get(node.id)].indexOf(route.depart), 1); route.depart = lead.depart; }
      continue;
    }
    const fits = lists => {
      let right = -Infinity;
      return group.map((_, index) => index).sort((a, b) => anchors[a] - anchors[b]).every(index => {
        const w = labelWidth(lists[index]);
        const x = Math.max(PAD, Math.min(width - PAD - w, anchors[index] - w / 2));
        const ok = x >= right + 2;
        right = x + w;
        return ok;
      });
    };
    const narrow = Math.floor((width - 2 * PAD) / group.length) - 16;
    const lists = [group.map(route => route.words), ...(narrow < EDGE_WRAP ? [group.map(route => wrap(route.edge.label, narrow, EDGE_TEXT))] : [])].find(fits);
    if (!lists) continue;
    const lane = { height: Math.max(...lists.map(words => words.length)) * lineHeight(EDGE_TEXT) + 4 + 8 };
    group.forEach((route, index) => { route.words = lists[index]; route.depart.height = 12; route.labelLane = lane; });
    gaps[ranks.get(node.id)].push(lane);
    labelGroups.push({ id: node.id, group });
  }

  let y = PAD;
  placedRows.forEach((row, rank) => {
    const height = Math.max(...row.map(node => node.height));
    for (const node of row) node.y = y + (height - node.height) / 2;
    y += height;
    if (rank === placedRows.length - 1) return;
    y += 6;
    for (const lane of gaps[rank]) {
      lane.y = y + lane.height / 2;
      y += lane.height;
    }
    y += 26;
  });

  // RD-4b: a port may be moved along its node edge (moves: edge -> { from, to }) when its vertical leg would run closer than MIN_WIRE_GAP to another edge's vertical.
  const moves = new Map();
  const moveOf = (edge, end) => moves.get(edge)?.[end] ?? 0;
  const routeAll = () => routes.map(route => {
    const { edge, depart, arrive } = route;
    if (sideEdges.has(edge)) {
      const source = placements.get(edge.from);
      const vertex = [source.cx + (outgoing.get(edge.from).indexOf(edge) === 0 ? -1 : 1) * source.width / 2, source.y + source.height / 2];
      const target = port(placements.get(edge.to), incoming.get(edge.to), edge, false);
      const { kind, dir, lift } = sideEdges.get(edge);
      const points = kind === 'drop' ? [vertex, [vertex[0], target[1]]] : [vertex, [target[0], vertex[1]], target];
      return { ...route, side: kind, dir, lift, points };
    }
    const from = port(placements.get(edge.from), outgoing.get(edge.from), edge, true, moveOf(edge, 'from'));
    const to = port(placements.get(edge.to), incoming.get(edge.to), edge, false, moveOf(edge, 'to'));
    const points = arrive ? skipLanePoints(from, to, skipX(edge), depart.y, arrive.y)
      : [from, [from[0], depart.y], [to[0], depart.y], to];
    return { ...route, points };
  });
  let routed = routeAll();
  for (let pass = 0; pass < 6; pass++) {
    const clash = closeVerticals(routed);
    const nudge = clash && [[clash.b, clash.a], [clash.a, clash.b]].map(([side, other]) => nudgeFor(side, other, routed, placements, outgoing, incoming, moves)).find(Boolean);
    if (!nudge) break;
    moves.set(nudge.edge, { ...moves.get(nudge.edge), [nudge.end]: nudge.move });
    routed = routeAll();
  }
  const wires = routed.map(({ edge, points }) => {
    const active = pathEdge(edge);
    return { active, element: h('g', { 'data-tutor-edge': `${edge.from}:${edge.to}`, ...(active ? { 'data-tutor-path': '' } : {}) }, wire(points, { active })) };
  })
    .sort((a, b) => a.active - b.active).map(wire => wire.element); // the route is drawn last, over any wire it crosses
  const annotations = [];
  const labelBoxes = new Map(); // geometry only (geometry-lint.js): where each inline edge label was placed
  let bottom = y;
  // A node's shared-lane labels are all placed, or the node is laid out again without the shared lane.
  const shared = new Map(), failed = [];
  for (const { id, group } of labelGroups) {
    const standing = [], boxes = new Map();
    for (const { edge } of group) {
      const bounds = labelBounds(routed.find(candidate => candidate.edge === edge), routed, width, standing);
      if (!bounds) break;
      standing.push(bounds);
      boxes.set(edge, bounds);
    }
    if (boxes.size === group.length) for (const [edge, bounds] of boxes) shared.set(edge, bounds);
    else failed.push(id);
  }
  if (failed.length) return { failed };
  for (const route of routed.filter(route => route.words.length)) {
    const { edge, words } = route;
    const bounds = route.labelLane ? shared.get(edge) : labelBounds(route, routed, width);
    if (bounds) {
      labelBoxes.set(edge, bounds);
      annotations.push(h('g', null,
        h('rect', { ...bounds, fill: SURFACE }),
        label(words, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { size: EDGE_TEXT })));
      continue;
    }
    // In a dense tier there may be no room on the edge itself. Keep the
    // directed relationship readable below the graph without masking any wire.
    const key = `${nodeName(placements.get(edge.from))} → ${nodeName(placements.get(edge.to))}: ${edge.label}`;
    const lines = wrap(key, width - 2 * PAD - 20, EDGE_TEXT);
    const height = lines.length * lineHeight(EDGE_TEXT) + 12;
    bottom += 8;
    annotations.push(h('g', null,
      box(PAD, bottom, width - 2 * PAD, height),
      label(lines, PAD + 10, bottom + height / 2, { size: EDGE_TEXT, anchor: 'start' })));
    bottom += height;
  }

  const shapes = Array.from(placements.values(), node => {
    const { id, cx, y, width, height, role, lines, offset, title, strip, stripOffset, labelHeight, contentHeight } = node;
    const x = cx - width / 2;
    const active = onPath.has(id);
    const baseShape = role === 'decision'
      ? diamond(x, y, width, height, { active })
      : box(x, y, width, height, { role, radius: isCapsule(node) ? capsuleRadius(node) : 9, active });
    const shape = paintNode ? paintNode(baseShape, node) : baseShape;
    // title: the full label when the server trimmed it to fit (item 47), shown as the node's tooltip.
    const props = { 'data-tutor-node': id, ...(active ? { 'data-tutor-path': '' } : {}) };
    const tooltip = title ? [h('title', null, title)] : [];
    if (!strip) return h('g', props, ...tooltip, shape, label(lines, cx, y + height / 2 + offset, { tone: 'onFill' }));
    const top = y + (height - contentHeight) / 2;
    return h('g', { ...props, 'aria-label': nodeName(node) }, ...tooltip, shape,
      ...(labelHeight ? [label(lines, cx, top + labelHeight / 2, { tone: 'onFill' })] : []),
      h('g', { 'data-tutor-node-tensor': '', transform: `translate(${cx - strip.width / 2} ${top + stripOffset})` }, ...strip.elements));
  });
  return { width, height: bottom + PAD, elements: [...wires, ...annotations, ...shapes], geometry: flowGeometry(width, bottom + PAD, placements, routed, labelBoxes), failed: [] };
}

// The layout as numbers, for geometry-lint.js (RD-3): node shapes with their text boxes, routed wires, inline edge-label boxes. Read-only; nothing here is drawn.
function flowGeometry(width, height, placements, routed, labelBoxes) {
  const nodes = Array.from(placements.values(), node => {
    const { id, cx, y, width: w, height: h2, role, lines, offset, strip, labelHeight, contentHeight } = node;
    const size = lines?.fontSize ?? 15, step = lineHeight(size);
    const centerY = strip ? y + (h2 - contentHeight) / 2 + (labelHeight ?? 0) / 2 : y + h2 / 2 + offset;
    const text = (strip && !labelHeight ? [] : lines ?? []).map((line, index, all) => {
      const textW = textWidth(line, size), middle = centerY + (index - (all.length - 1) / 2) * step;
      return { x: cx - textW / 2, y: middle - size / 2, width: textW, height: size };
    });
    return { id, role, shape: role === 'decision' ? 'diamond' : isCapsule(node) ? 'capsule' : 'box', x: cx - w / 2, y, width: w, height: h2, text, ...(isCapsule(node) ? { radius: capsuleRadius(node) } : {}) };
  });
  const edges = routed.map(({ edge, points }) => ({ from: edge.from, to: edge.to, points: points.map(point => [...point]), label: labelBoxes.get(edge) ? { ...labelBoxes.get(edge) } : null }));
  return { width, height, nodes, edges };
}
