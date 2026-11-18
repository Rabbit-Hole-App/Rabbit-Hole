import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { convergingFlow } from '../../scripts/batch-1-followup-fixtures.mjs';
import { layoutFlow } from './flow.js';
import { textWidth } from './primitives.js';
import { wirePoints } from './test-wire-points.mjs';

const cache = {
  kind: 'flow', title: 'Cache lookup',
  nodes: [
    { id: 'read', label: 'Read cache', role: 'process' },
    { id: 'cached', label: 'Value in cache?', role: 'decision' },
    { id: 'hit', label: 'Return cached value', role: 'outcome' },
    { id: 'miss', label: 'Read database', role: 'process' },
    { id: 'return', label: 'Cache and return value', role: 'outcome' },
  ],
  edges: [
    { from: 'read', to: 'cached' }, { from: 'cached', to: 'hit', label: 'Hit' },
    { from: 'cached', to: 'miss', label: 'Miss' }, { from: 'miss', to: 'return' },
  ],
};

function render(layout) {
  return renderToStaticMarkup(createElement('svg', null, ...layout.elements));
}

test('cache diagram draws the approved component roles and every labeled branch', () => {
  const layout = layoutFlow(cache, 408);
  assert.equal(layout.width, 408);
  const svg = render(layout);
  for (const color of ['#8DBFEF', '#E5AA46', '#67B9A0']) assert.ok(svg.includes(color), color);
  const visible = svg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const value of ['Read cache', 'Hit', 'Miss', 'Return cached value']) assert.ok(visible.includes(value), value);
  assert.equal((svg.match(/data-tutor-arrowhead/g) ?? []).length, 4);
});

test('a skip edge stays outside intermediate boxes and preserves a labeled join', () => {
  const flow = {
    kind: 'flow', title: 'Retry policy',
    nodes: [
      { id: 'a', label: 'Retry needed?', role: 'decision' },
      { id: 'b', label: 'Run the request a second time', role: 'process' },
      { id: 'c', label: 'Return the response', role: 'outcome' },
    ],
    edges: [{ from: 'a', to: 'b', label: 'Retry' }, { from: 'a', to: 'c', label: 'Continue' }, { from: 'b', to: 'c' }],
  };
  const { elements } = layoutFlow(flow, 320);
  const routes = elements.filter(element => element.props['data-tutor-edge']);
  const boxes = elements.filter(element => element.props['data-tutor-node']);
  assert.equal(routes.length, 3);
  for (const route of routes) {
    const points = wirePoints(route);
    for (const node of boxes.filter(node => !route.props['data-tutor-edge'].split(':').includes(node.props['data-tutor-node']))) {
      const { x, y, width, height } = node.props.children[0].props;
      for (let i = 1; i < points.length; i++) {
        const [[x1, y1], [x2, y2]] = points.slice(i - 1, i + 1);
        assert.ok(x1 === x2 || y1 === y2, 'edge is orthogonal');
        const crosses = x1 === x2
          ? x < x1 && x1 < x + width && Math.max(y1, y2) > y && Math.min(y1, y2) < y + height
          : y < y1 && y1 < y + height && Math.max(x1, x2) > x && Math.min(x1, x2) < x + width;
        assert.equal(crosses, false, route.props['data-tutor-edge']);
      }
    }
  }
  assert.match(render(layoutFlow(flow, 320)), /Continue/);
});

const pointsFor = wirePoints;

function touches(points, rect) {
  return points.slice(1).some(([x2, y2], index) => {
    const [x1, y1] = points[index];
    const { x, y, width, height } = rect;
    return x1 === x2
      ? x < x1 && x1 < x + width && Math.max(y1, y2) > y && Math.min(y1, y2) < y + height
      : y < y1 && y1 < y + height && Math.max(x1, x2) > x && Math.min(x1, x2) < x + width;
  });
}

test('three labeled arrivals use separate, noncrossing approaches to the same outcome', () => {
  const { diagram } = convergingFlow;
  for (const width of [408, layoutFlow(diagram, 0).width, 960]) {
    const { elements } = layoutFlow(diagram, width);
    const wires = elements.filter(element => element.props['data-tutor-edge']);
    const branches = wires.filter(wire => wire.props['data-tutor-edge'].endsWith(':dies'));
    const arrivals = branches.map(pointsFor);
    const target = elements.find(element => element.props['data-tutor-node'] === 'dies').props.children[0].props;
    const tips = arrivals.map(points => points.at(-1));
    const turns = arrivals.map(points => points.at(-2)[1]);
    assert.equal(new Set(tips.map(([x]) => x)).size, 3);
    assert.ok(tips.every(([x, y]) => target.x < x && x < target.x + target.width && y === target.y));
    assert.equal(new Set(turns).size, 3);
    assert.ok(arrivals.every(points => points.at(-3)[0] !== points.at(-2)[0]), 'each route has a horizontal approach');
    for (const [index, points] of arrivals.entries()) {
      for (const other of arrivals.slice(index + 1)) {
        for (const [[x1, y1], [x2, y2]] of points.slice(1).map((p, i) => [points[i], p])) {
          const bounds = {
            x: Math.min(x1, x2) - 0.25, y: Math.min(y1, y2) - 0.25,
            width: Math.abs(x1 - x2) + 0.5, height: Math.abs(y1 - y2) + 0.5,
          };
          assert.equal(touches(other, bounds), false, `arrival ${index + 1} crosses another route at ${width}`);
        }
      }
    }
    const annotations = elements.filter(item => Array.isArray(item.props.children)
      && item.props.children[0]?.type === 'rect' && !item.props['data-tutor-node']);
    const noLabels = annotations.filter(item => texts(item).some(({ lines }) => lines.join(' ') === 'No'));
    assert.equal(noLabels.length, 3, 'all three No labels fit on the graph');
    for (const [index, annotation] of noLabels.entries()) {
      const bounds = annotation.props.children[0].props;
      assert.ok(wires.every(wire => wire === branches[index] || !touches(pointsFor(wire), bounds)));
    }
  }
});

test('long branch labels never mask an unrelated connector in a nested flow', () => {
  const diagram = {
    nodes: ['r', 'a', 'b', 'c', 'd', 'e', 'f'].map(id => ({
      id, label: `Node ${id}`, role: ['r', 'a'].includes(id) ? 'decision' : id === 'f' ? 'outcome' : 'process',
    })),
    edges: [
      { from: 'r', to: 'a', label: 'First branch' }, { from: 'r', to: 'b', label: 'Second branch' },
      { from: 'a', to: 'd', label: 'On the first branch' }, { from: 'a', to: 'e', label: 'On the second branch' },
      { from: 'b', to: 'c' }, { from: 'c', to: 'f' }, { from: 'd', to: 'f' }, { from: 'e', to: 'f' },
    ],
  };
  const result = layoutFlow(diagram, 320);
  const wires = result.elements.filter(item => item.props['data-tutor-edge']);
  const annotations = result.elements.filter(item => Array.isArray(item.props.children)
    && item.props.children[0]?.type === 'rect' && !item.props['data-tutor-node']);
  assert.equal(annotations.length, 4);
  for (const [index, annotation] of annotations.entries()) {
    const { from, to } = diagram.edges[index];
    const other = wires.filter(wire => wire.props['data-tutor-edge'] !== `${from}:${to}`);
    assert.ok(other.every(wire => !touches(pointsFor(wire), annotation.props.children[0].props)));
  }
  assert.match(render(result).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), /On the second branch/);
});

test('wrapped decision text fits inside the sloping sides on a narrow tier', () => {
  const diagram = {
    nodes: ['root', 'a', 'b', 'c', 'yes', 'no'].map(id => ({
      id, label: id === 'a' ? Array(15).fill('MMMM').join(' ') : id, role: ['yes', 'no'].includes(id) ? 'outcome' : 'decision',
    })),
    edges: ['a', 'b', 'c'].flatMap(id => [
      { from: 'root', to: id, label: id }, { from: id, to: 'yes', label: 'Yes' }, { from: id, to: 'no', label: 'No' },
    ]),
  };
  const result = layoutFlow(diagram, 320);
  const node = result.elements.find(item => item.props['data-tutor-node'] === 'a');
  const [shape, text] = node.props.children;
  const [[, top], [right, middle], [, bottom], [left]] = shape.props.points.split(' ').map(pair => pair.split(',').map(Number));
  const lines = Array.isArray(text.props.children) ? text.props.children : [text.props.children];
  assert.ok(lines.length > 1);
  for (const span of lines) {
    const baseline = span.props.y;
    const inset = Math.max(Math.abs(baseline - 11 - middle), Math.abs(baseline + 2 - middle));
    const widthAtLine = (right - left) * (1 - 2 * inset / (bottom - top));
    assert.ok(span.props.children.length * 11.66 <= widthAtLine);
  }
});

test('flow preserves ordinary long words and wraps hyphenated labels at their hyphens', () => {
  const flow = {
    nodes: [
      { id: 'root', label: 'Check the request', role: 'decision' },
      { id: 'a', label: 'Review recommendations', role: 'decision' },
      { id: 'b', label: 'Configuration-dependent response', role: 'outcome' },
      { id: 'c', label: 'Escalate', role: 'outcome' },
    ],
    edges: [
      { from: 'root', to: 'a', label: 'Has recommendations' },
      { from: 'root', to: 'b', label: 'Skip review' },
      { from: 'a', to: 'b', label: 'Approve' },
      { from: 'a', to: 'c', label: 'Decline' },
    ],
  };
  for (const width of [320, 688]) {
    const layout = layoutFlow(flow, width);
    const review = layout.elements.find(element => element.props['data-tutor-node'] === 'a');
    const [diamond] = review.props.children;
    const [[, top], [right], [, bottom], [left]] = diamond.props.points.split(' ').map(pair => pair.split(',').map(Number));
    assert.ok(bottom - top <= right - left, 'long label should not force an unusually tall diamond');
    assert.match(render({ elements: [review] }).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), /Review recommendations/);
    const paths = layout.elements.filter(element => element.props['data-tutor-edge']?.startsWith('root:'));
    assert.deepEqual(pointsFor(paths[0])[0], pointsFor(paths[1])[0], 'the two branches of a two-way decision leave from its one bottom-centre point');
    const visible = render(layout).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(visible, /Has recommendations/);
    assert.match(visible, /Configuration- ?dependent response/);
    assert.doesNotMatch(render(layout), /font-size="12"/);
  }
});

test('converging routes have distinct arrowheads that meet the rounded outcome', () => {
  const checks = Array.from({ length: 7 }, (_, index) => `check${index}`);
  const flow = {
    nodes: [
      ...checks.map(id => ({ id, label: id, role: 'decision' })),
      { id: 'passed', label: 'Approved', role: 'outcome' },
      { id: 'rejected', label: 'The purchase order has been rejected by the reviewer', role: 'outcome' },
    ],
    edges: checks.flatMap((id, index) => [
      { from: id, to: checks[index + 1] ?? 'passed', label: 'Yes' },
      { from: id, to: 'rejected', label: 'No' },
    ]),
  };
  for (const width of [320, 688]) {
    const { elements } = layoutFlow(flow, width);
    const target = elements.find(element => element.props['data-tutor-node'] === 'rejected');
    const rect = target.props.children[0].props;
    const routes = elements.filter(element => element.props['data-tutor-edge']?.endsWith(':rejected')).map(pointsFor);
    const tips = routes.map(points => points.at(-1)).sort(([a], [b]) => a - b);
    assert.equal(tips.length, 7);
    assert.equal(routes.at(-1).at(-1)[0], tips[0][0], 'the direct route stays inside the outer routes');
    for (let i = 1; i < routes.length - 1; i++) {
      assert.ok(routes[i - 1][2][0] > routes[i][2][0], 'earlier departures use the outer lanes');
      assert.ok(routes[i - 1][3][1] > routes[i][3][1], 'the inner lane turns toward the outcome first');
    }
    if (width === 320) assert.ok(tips.every(([, y]) => y === rect.y), 'at the 180 px minimum width every arrowhead lands on the flat top of the pill');
    const rx = Math.min(rect.rx, rect.width / 2);
    const ry = Math.min(rect.rx, rect.height / 2);
    for (const [index, [x, y]] of tips.entries()) {
      const dx = Math.max(0, Math.abs(x - rect.x - rect.width / 2) - (rect.width / 2 - rx));
      assert.ok(Math.abs((dx / rx) ** 2 + ((y - rect.y - ry) / ry) ** 2 - 1) < 0.001);
      if (index > 0) assert.ok(x - tips[index - 1][0] >= 8, 'adjacent arrowheads have visible space between them');
    }
  }
});
// S7-EXPAND: benchmark-derived specs (p07, p18) whose labels once wrapped inside a word ("Intermitte / nt", "recommenda / tions", "environment / -dependent").
const p07 = {
  kind: 'flow', title: 'Distinguishing Flaky Tests from Real Bugs',
  nodes: [
    { id: 'start', label: 'Test fails', role: 'process' }, { id: 'repeat', label: 'Run test 10 times locally', role: 'process' },
    { id: 'consistent', label: 'Does it fail consistently?', role: 'decision' }, { id: 'flaky', label: 'It is a flaky test', role: 'outcome' },
    { id: 'env', label: 'Is failure environment-dependent?', role: 'decision' }, { id: 'bug', label: 'It is a real bug', role: 'outcome' },
  ],
  edges: [
    { from: 'start', to: 'repeat' }, { from: 'repeat', to: 'consistent' }, { from: 'consistent', to: 'flaky', label: 'No/Intermittent' },
    { from: 'consistent', to: 'env', label: 'Yes' }, { from: 'env', to: 'bug', label: 'No' }, { from: 'env', to: 'flaky', label: 'Yes' },
  ],
};
const p18 = {
  kind: 'flow', title: 'The Peer-Review Publishing Process',
  nodes: [
    { id: 'write', label: 'Author writes and prepares the manuscript', role: 'process' }, { id: 'submit', label: 'Author submits manuscript to the journal', role: 'process' },
    { id: 'editor', label: 'Editor performs initial screening', role: 'decision' }, { id: 'reject', label: 'Manuscript is rejected immediately', role: 'outcome' },
    { id: 'peer', label: 'Experts conduct peer review of quality', role: 'process' }, { id: 'decision', label: 'Reviewers provide feedback recommendations', role: 'decision' },
    { id: 'revise', label: 'Author revises manuscript based on feedback', role: 'process' }, { id: 'final', label: 'Editor gives final approval for publication', role: 'process' },
    { id: 'publish', label: 'Article is published in journal', role: 'outcome' },
  ],
  edges: [
    { from: 'write', to: 'submit' }, { from: 'submit', to: 'editor' }, { from: 'editor', to: 'reject', label: 'No' }, { from: 'editor', to: 'peer', label: 'Yes' },
    { from: 'peer', to: 'decision' }, { from: 'decision', to: 'revise', label: 'Major/Minor' }, { from: 'decision', to: 'reject', label: 'Reject' },
    { from: 'revise', to: 'final' }, { from: 'final', to: 'publish' },
  ],
};

function texts(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach(child => texts(child, out)); return out; }
  if (node.type === 'text') out.push({ size: node.props.fontSize, lines: [].concat(node.props.children).map(tspan => tspan.props.children) });
  texts(node.props?.children, out);
  return out;
}
// Lines rejoin to the original label: a line may end only at a space or right after "/" or "-", never inside a word.
const rejoin = lines => lines.reduce((text, line) => text + (/[/-]$/.test(text) ? '' : ' ') + line);

for (const [name, spec, labels] of [
  ['p07', p07, ['Run test 10 times locally', 'Does it fail consistently?', 'Is failure environment-dependent?', 'No/Intermittent']],
  ['p18', p18, ['Author writes and prepares the manuscript', 'Reviewers provide feedback recommendations', 'Editor gives final approval for publication', 'Major/Minor']],
]) {
  for (const width of [688, 320]) {
    test(`${name} at ${width}: no label breaks inside a word and every node label sits inside its shape`, () => {
      const layout = layoutFlow(spec, width);
      const drawn = texts(layout.elements);
      for (const text of labels) {
        const found = drawn.find(item => rejoin(item.lines) === text);
        assert.ok(found, `"${text}" is drawn whole: ${JSON.stringify(drawn.map(item => item.lines))}`);
        assert.ok(found.size >= 12, 'font shrinks by at most 2 px');
      }
      for (const element of layout.elements.filter(element => element.props['data-tutor-node'])) {
        const [shape, text] = element.props.children;
        const xs = shape.type === 'polygon' ? shape.props.points.split(' ').map(pair => Number(pair.split(',')[0])) : [shape.props.x, shape.props.x + shape.props.width];
        const inner = Math.max(...xs) - Math.min(...xs);
        const lines = [].concat(text.props.children).map(tspan => tspan.props.children);
        for (const line of lines) assert.ok(textWidth(line, text.props.fontSize) <= inner - 6, `${element.props['data-tutor-node']}: "${line}" fits ${inner}`);
        assert.ok(Math.max(...xs) <= layout.width && Math.min(...xs) >= 0, 'node is inside the drawing');
      }
    });
  }
}

// Item 47 (2026-11-08): a label the server trimmed keeps its full text as the node's title, drawn as an SVG <title> tooltip; a node without one draws none.
test('a node title is drawn as its SVG <title>, never as visible text', () => {
  const titled = { ...cache, nodes: cache.nodes.map(n => (n.id === 'miss' ? { ...n, title: 'Read the database row for this key and keep it' } : n)) };
  const svg = render(layoutFlow(titled, 408));
  assert.match(svg, /<g data-tutor-node="miss"><title>Read the database row for this key and keep it<\/title>/);
  assert.equal((svg.match(/<title>/g) || []).length, 1);
  assert.doesNotMatch(render(layoutFlow(cache, 408)), /<title>/);
});

// RD-2: a decision with exactly two branches to the next rank, one left and one right of it, leaves the diamond's side vertices: both wires run
// at the diamond's mid-height to the target's top port and drop straight down, the labels sit above the runs, and the gap below the row takes no lanes for them.
// Every other decision keeps its routing byte for byte.
const swallow = {
  kind: 'flow', title: 'Bedside Swallow Evaluation Process',
  nodes: [
    { id: 'chart', label: 'Review medical chart', role: 'process' }, { id: 'exam', label: 'Perform cranial nerve exam', role: 'process' },
    { id: 'aspiration', label: 'Signs of aspiration present?', role: 'decision' },
    { id: 'defer', label: 'Defer oral intake and recommend instrumental test', role: 'outcome' },
    { id: 'proceed', label: 'Proceed with controlled food trials', role: 'outcome' },
  ],
  edges: [{ from: 'chart', to: 'exam' }, { from: 'exam', to: 'aspiration' },
    { from: 'aspiration', to: 'defer', label: 'Yes' }, { from: 'aspiration', to: 'proceed', label: 'No' }],
};
const triage = {
  kind: 'flow', title: 'Triage',
  nodes: [
    { id: 'in', label: 'Receive the request', role: 'process' }, { id: 'kind', label: 'Which kind is it?', role: 'decision' },
    { id: 'a', label: 'Handle the bug', role: 'outcome' }, { id: 'b', label: 'Handle the question', role: 'outcome' }, { id: 'c', label: 'Handle the request', role: 'outcome' },
  ],
  edges: [{ from: 'in', to: 'kind' }, { from: 'kind', to: 'a', label: 'Bug' }, { from: 'kind', to: 'b', label: 'Question' }, { from: 'kind', to: 'c', label: 'Feature' }],
};
const sameSide = {
  kind: 'flow', title: 'Same side',
  nodes: [
    { id: 'root', label: 'Start the check', role: 'process' }, { id: 'p', label: 'Check the cache', role: 'outcome' }, { id: 'q', label: 'Check the queue', role: 'outcome' },
    { id: 'd', label: 'Is the record valid?', role: 'decision' }, { id: 't1', label: 'Save the record', role: 'outcome' }, { id: 't2', label: 'Reject the record', role: 'outcome' },
  ],
  edges: [{ from: 'root', to: 'p' }, { from: 'root', to: 'q' }, { from: 'root', to: 'd' }, { from: 'd', to: 't1', label: 'Yes' }, { from: 'd', to: 't2', label: 'No' }],
};
const shapeOf = (elements, id) => {
  const shape = elements.find(element => element.props['data-tutor-node'] === id).props.children.find(child => child?.type === 'polygon' || child?.type === 'rect');
  if (shape.type === 'rect') return shape.props;
  const [top, right, bottom, left] = shape.props.points.split(' ').map(pair => pair.split(',').map(Number));
  return { cx: top[0], top: top[1], mid: right[1], bottom: bottom[1], left: left[0], right: right[0] };
};
const wireOf = (elements, edge) => pointsFor(elements.find(element => element.props['data-tutor-edge'] === edge));
const labelRect = (elements, word) => elements.find(item => Array.isArray(item.props.children) && item.props.children[0]?.type === 'rect'
  && !item.props['data-tutor-node'] && texts(item).some(({ lines }) => lines.join(' ') === word))?.props.children[0].props;
const digest = layout => createHash('sha256').update(render(layout)).digest('hex').slice(0, 16);

test('RD-2: a two-way decision leaves its bottom centre, shares the first drop, runs apart at one height and drops onto each target', () => {
  for (const width of [600, 720]) {
    const { elements } = layoutFlow(swallow, width);
    const diamond = shapeOf(elements, 'aspiration');
    const yes = wireOf(elements, 'aspiration:defer'), no = wireOf(elements, 'aspiration:proceed');
    assert.deepEqual(yes[0], [diamond.cx, diamond.bottom], 'Yes leaves the bottom centre');
    assert.deepEqual(no[0], [diamond.cx, diamond.bottom], 'No leaves the same point');
    assert.equal(yes.length, 4);
    assert.equal(no.length, 4);
    assert.equal(yes[1][1], no[1][1], 'both runs are at the same height');
    for (const [points, id] of [[yes, 'defer'], [no, 'proceed']]) {
      const target = shapeOf(elements, id);
      assert.equal(points[1][0], diamond.cx, 'the first segment drops straight from the diamond');
      assert.equal(points[2][1], points[1][1], 'the second segment is the horizontal run');
      assert.equal(points[3][0], points[2][0], 'the last segment drops straight');
      assert.equal(points[3][1], target.y, 'the drop ends on the target top');
      assert.ok(target.x < points[3][0] && points[3][0] < target.x + target.width, 'and lands inside the target');
    }
    assert.ok(yes[2][0] < diamond.cx && no[2][0] > diamond.cx, 'each run goes outward from the centre');
  }
});

test('RD-2: the Yes and No labels are centred on their runs, sit on the line (the wire is cut behind them), and touch no other wire', () => {
  for (const width of [600, 720]) {
    const { elements } = layoutFlow(swallow, width);
    const others = elements.filter(element => element.props['data-tutor-edge'] && !element.props['data-tutor-edge'].startsWith('aspiration:')).map(pointsFor);
    for (const [word, edge] of [['Yes', 'aspiration:defer'], ['No', 'aspiration:proceed']]) {
      const rect = labelRect(elements, word);
      assert.ok(rect, `${word} label is drawn on the graph`);
      const [, corner, end] = wireOf(elements, edge);
      assert.ok(Math.abs(rect.x + rect.width / 2 - (corner[0] + end[0]) / 2) <= 1, `${word} is centred on its run`);
      assert.ok(Math.abs(rect.y + rect.height / 2 - corner[1]) <= 1, `${word} sits on its run`);
      for (const points of others) assert.equal(touches(points, rect), false, `${word} label touches another wire`);
    }
  }
});

test('RD-2: the gap below a two-way decision row holds one lane shared by its two branches', () => {
  const { elements } = layoutFlow(swallow, 600);
  const diamond = shapeOf(elements, 'aspiration');
  const target = shapeOf(elements, 'defer');
  assert.equal(wireOf(elements, 'aspiration:defer')[1][1], wireOf(elements, 'aspiration:proceed')[1][1], 'one lane for both branches');
  assert.ok(target.y - diamond.bottom <= 64, `the targets sit close under the diamond (${target.y - diamond.bottom} px)`);
});

test('RD-2: a three-branch decision keeps its lanes; the digests are the markup under the sprint theme', () => {
  assert.deepEqual([408, 720].map(width => digest(layoutFlow(triage, width))), ['4ba500adae549484', '4b724c68cf64896f']);
  // The same-side decision below has two branches, so it takes the shared fork. Its label wraps to two lines (FLOW-W) so the card is 639 wide at 408 and the 720 asked for at 720 (one line made it 726 at both);
  // the Yes and No labels stand beside their drops at one height (FLOW-X option B), so the two digests differ.
  assert.deepEqual([408, 720].map(width => layoutFlow(sameSide, width).width), [639, 720]);
  assert.deepEqual([408, 720].map(width => digest(layoutFlow(sameSide, width))), ['380e9a4f0d44e776', 'd5bc27cfa411fac1']);
});

test('RD-2b: at the card widths each branch drops onto its target from the shared run and its label is centred on its run', () => {
  for (const width of [320, 408, 440]) {
    const { elements } = layoutFlow(swallow, width);
    const diamond = shapeOf(elements, 'aspiration');
    const others = elements.filter(element => element.props['data-tutor-edge'] && !element.props['data-tutor-edge'].startsWith('aspiration:')).map(pointsFor);
    for (const [edge, id, word, outward] of [['aspiration:defer', 'defer', 'Yes', -1], ['aspiration:proceed', 'proceed', 'No', 1]]) {
      const points = wireOf(elements, edge), target = shapeOf(elements, id), rect = labelRect(elements, word);
      assert.deepEqual(points[0], [diamond.cx, diamond.bottom], `${word} leaves the bottom centre at ${width}`);
      assert.equal(points.length, 4, `${word} has one run and one drop at ${width}`);
      assert.equal(points[3][1], target.y, `${word} lands on the target top at ${width}`);
      assert.ok(target.x < points[3][0] && points[3][0] < target.x + target.width, `${word} lands inside its target at ${width}`);
      assert.ok(outward < 0 ? points[2][0] < diamond.cx : points[2][0] > diamond.cx, `${word} runs outward at ${width}`);
      assert.ok(rect, `${word} label is drawn`);
      assert.ok(Math.abs(rect.x + rect.width / 2 - (points[1][0] + points[2][0]) / 2) <= 1 && Math.abs(rect.y + rect.height / 2 - points[1][1]) <= 1, `${word} is centred on its run at ${width}`);
      for (const other of others) assert.equal(touches(other, rect), false, `${word} label touches another wire at ${width}`);
    }
    assert.equal(wireOf(elements, 'aspiration:defer')[1][1], wireOf(elements, 'aspiration:proceed')[1][1], 'both branches run at the same height');
  }
});

test('RD-2b: the swallow card is as wide at its natural width as at any narrower request: the 180 px node minimum', () => {
  assert.deepEqual([layoutFlow(swallow, 0).width, digest(layoutFlow(swallow, 0)) === digest(layoutFlow(swallow, 300))], [406, true]);
});

test('RD-2: the highlight path style applies to the routed branch', () => {
  const { elements } = layoutFlow({ ...swallow, highlightPath: ['chart', 'exam', 'aspiration', 'defer'] }, 600);
  const yes = elements.find(element => element.props['data-tutor-edge'] === 'aspiration:defer');
  const no = elements.find(element => element.props['data-tutor-edge'] === 'aspiration:proceed');
  assert.ok('data-tutor-path' in yes.props, 'the highlighted branch is marked');
  assert.equal('data-tutor-path' in no.props, false, 'the other branch is not');
  assert.equal(yes.props.children.props.children[0].props.strokeWidth, 3, 'and drawn in the path style');
});

// RD-2c (found by the RD-3 geometry lint): a side-branch label that does not fit outside its vertex is lifted clear of the diamond's edge (both branches to one height), and a decision whose two labels
// would overlap each other keeps the lane routing.
const narrow = {
  kind: 'flow', title: 'Which side predicts which class?',
  nodes: [{ id: 'q', role: 'decision', label: '$x_1+x_2<7$?' }, { id: 'n', role: 'outcome', label: 'Predict $0$' }, { id: 'p', role: 'outcome', label: 'Predict $1$' }],
  edges: [{ from: 'q', to: 'n', label: 'Yes' }, { from: 'q', to: 'p', label: 'No' }],
};
const longLabels = {
  kind: 'flow', title: 'Which feedback loop?',
  nodes: [
    { id: 'r', label: 'Choose feedback trigger', role: 'decision' }, { id: 'e', label: 'Evaluate', role: 'process' }, { id: 'f', label: 'Run Feature Engineering', role: 'process' },
    { id: 'm', label: 'Run Monitor', role: 'process' }, { id: 'c', label: 'Collect Data', role: 'process' },
  ],
  edges: [{ from: 'r', to: 'e', label: 'evaluation result' }, { from: 'e', to: 'f', label: 'not good enough' }, { from: 'r', to: 'm', label: 'monitoring result' }, { from: 'm', to: 'c', label: 'performance drops' }],
};
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const insideDiamond = (node, [x, y]) => Math.abs(x - (node.x + node.width / 2)) / (node.width / 2) + Math.abs(y - (node.y + node.height / 2)) / (node.height / 2) < 1;

test('RD-2c: a side-branch label squeezed by a narrow card is lifted clear of the diamond, both labels at one height', () => {
  const { geometry } = layoutFlow(narrow, 0);
  const diamond = geometry.nodes.find(node => node.id === 'q');
  const labels = geometry.edges.filter(edge => edge.from === 'q').map(edge => edge.label);
  assert.equal(labels.length, 2);
  assert.ok(Math.abs(labels[0].y - labels[1].y) <= 1, 'both labels stand at one height');
  for (const rect of labels) for (const corner of [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]) {
    assert.equal(insideDiamond(diamond, corner), false, 'no label corner is inside the diamond');
  }
  assert.equal(overlap(labels[0], labels[1]), false);
});

test('RD-2c: a decision whose two labels would overlap each other keeps the lane routing, and no two labels of any flow overlap', () => {
  for (const width of [0, 320, 408, 720]) {
    const { geometry } = layoutFlow(longLabels, width);
    const labels = geometry.edges.filter(edge => edge.label).map(edge => edge.label);
    for (const [index, rect] of labels.entries()) for (const other of labels.slice(index + 1)) assert.equal(overlap(rect, other), false, `labels overlap at ${width}`);
  }
  const natural = layoutFlow(longLabels, 0).geometry;
  assert.ok(natural.edges.filter(edge => edge.from === 'r').every(edge => edge.points.length === 4), 'at the natural width the decision keeps the lane routing');
});
