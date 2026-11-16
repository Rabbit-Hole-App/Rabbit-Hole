// Test helper: the polyline a flow, sequence or relationship wire was routed along, read back from what `wire()` (primitives.js) draws: a <path> with 8 px
// quadratic corners (each Q control point is the original vertex) and a filled head whose tip stops 2 px short of the target. -> [[x, y], ...], the same
// points the old <polyline> carried, to a micro-unit.
const round = value => Math.round(value * 1e6) / 1e6;

export function wirePoints(element) {
  const [path, head] = element.type === 'path' ? [element, null] : (() => {
    let node = element;
    // route g -> wire g -> [path, polygon]; a wire g -> [path, polygon] directly is accepted too
    while (node && node.props?.d === undefined && node.props?.children) {
      const kids = [node.props.children].flat().filter(Boolean);
      const found = kids.find(kid => kid.type === 'path');
      if (found) return [found, kids.find(kid => kid.type === 'polygon') ?? null];
      node = kids[0];
    }
    throw new Error('no wire path in this element');
  })();
  const numbers = path.props.d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi).map(Number);
  const commands = path.props.d.match(/[MLQ]/g);
  const points = [];
  let cursor = 0, last = null, before = null;
  for (const command of commands) {
    if (command === 'M' || command === 'L') { before = last; last = [numbers[cursor++], numbers[cursor++]]; if (command === 'M') points.push(last); }
    else { const control = [numbers[cursor++], numbers[cursor++]]; before = last; last = [numbers[cursor++], numbers[cursor++]]; points.push(control); }
  }
  // `last` is the base of the head (or the tip when there is no head); the polygon's first point is the tip; the wire ends 2 px beyond it along its approach.
  const [px, py] = before;
  const run = Math.hypot(last[0] - px, last[1] - py) || 1, ux = (last[0] - px) / run, uy = (last[1] - py) / run;
  const tip = head ? head.props.points.split(' ')[0].split(',').map(Number) : last;
  points.push([tip[0] + ux * 2, tip[1] + uy * 2]);
  return points.map(([x, y]) => [round(x), round(y)]);
}

// The vertices of a wire path given as its d string (start, each corner's control point, the base of the head): for a test that only has the markup.
export function pathVertices(d) {
  const numbers = d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi).map(Number);
  const points = [];
  let cursor = 0;
  for (const command of d.match(/[MLQ]/g)) {
    if (command === 'M') points.push([numbers[cursor++], numbers[cursor++]]);
    else if (command === 'L') { const end = [numbers[cursor++], numbers[cursor++]]; if (cursor === numbers.length) points.push(end); }
    else { points.push([numbers[cursor++], numbers[cursor++]]); cursor += 2; }
  }
  return points;
}
