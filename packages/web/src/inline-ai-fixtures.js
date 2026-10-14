// Test boards for the inline AI editor (docs/features/inline-ai-editor.md §9, §14): a tree with nodes 1, 2, 4, 3, 23 and
// a flow with different labels and structure, so no test leans on one example's words. Shared by the unit tests, the
// browser check and the seeded review board.
const node = (id, label, x, y, extra = {}) => ({ id, kind: 'ellipse', x1: x, y1: y, x2: x + 64, y2: y + 64, color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false, text: label, ...extra });
const box = (id, label, x, y, extra = {}) => ({ id, kind: 'rect', x1: x, y1: y, x2: x + 150, y2: y + 60, color: '#2383e2', width: 2, dash: 'solid', fill: null, opacity: 1, round: true, text: label, ...extra });
const edge = (id, from, to, extra = {}) => ({ id, from, fromSide: 'bottom', to, toSide: 'top', color: '#37352f', route: 'straight', head: true, ...extra });

// The tree: 1 -> 2, 1 -> 4; 4 -> 3, 4 -> 23; 2 -> 7. Node 23 is a child of 4, a sibling of 3, and a leaf.
export const treeBoard = () => ({
  shapes: [
    node('n1', '1', 400, 80), node('n2', '2', 240, 220), node('n4', '4', 560, 220),
    node('n3', '3', 480, 360), node('n23', '23', 640, 360), node('n7', '7', 160, 360),
  ],
  links: [edge('e1-2', 'n1', 'n2'), edge('e1-4', 'n1', 'n4'), edge('e4-3', 'n4', 'n3'), edge('e4-23', 'n4', 'n23'), edge('e2-7', 'n2', 'n7')],
  items: [
    { id: 'label23', kind: 'text', x: 630, y: 438, w: 120, text: 'bottom row', color: '#37352f', opacity: 1 },
    { id: 'clutter', kind: 'sticky', x: 900, y: 600, w: 160, text: 'Buy milk on the way home', color: '#f59e0b', opacity: 1 },
  ],
  blocks: [], groups: [], exchanges: [],
});

// The flow: Sign in -> Check password -> Dashboard, with Dashboard far off to the right; a note sits near the check but
// is unrelated. A group holds two labelled steps of a second, separate flow.
export const flowBoard = () => ({
  shapes: [
    box('signin', 'Sign in', 100, 700), box('check', 'Check password', 360, 700), box('dash', 'Dashboard', 5200, 700),
    box('g1', 'Fetch orders', 100, 950, { groupId: 'grp' }), box('g2', 'Render table', 360, 950, { groupId: 'grp' }),
  ],
  links: [edge('f1', 'signin', 'check', { fromSide: 'right', toSide: 'left', label: 'submit' }), edge('f2', 'check', 'dash', { fromSide: 'right', toSide: 'left', label: 'ok' }), edge('f3', 'g1', 'g2', { fromSide: 'right', toSide: 'left' })],
  items: [
    { id: 'aside', kind: 'sticky', x: 640, y: 560, w: 160, text: 'Lunch at noon', color: '#f59e0b', opacity: 1 },
    { id: 'code1', kind: 'text', mode: 'code', x: 100, y: 1150, w: 380, text: 'def total(xs):\n    s = 0\n    for x in xs:\n        s =+ x\n    retrun s', color: '#37352f', opacity: 1 },
    { id: 'para', kind: 'text', x: 100, y: 1350, w: 420, text: 'Orders load first. Then the table renders every row, which can be slow for big lists.', color: '#37352f', opacity: 1, groupId: 'grp2', runs: [{ t: 'Orders load first. ' }, { t: 'Then the table renders every row', b: true }, { t: ', which can be slow for big lists.' }] },
    { id: 'para2', kind: 'text', x: 100, y: 1420, w: 420, text: 'A second line in the same group.', color: '#37352f', opacity: 1, groupId: 'grp2' },
  ],
  blocks: [{ id: 'img1', type: 'file', kind: 'image', label: 'Binary tree (screenshot)', assetKey: 'asset:tree.png', mediaId: null, dx: 0, dy: 0 }],
  groups: [{ id: 'grp', label: 'Orders page' }, { id: 'grp2', label: 'Notes' }],
  exchanges: [],
});

// World boxes the canvas would measure: shapes from their corners, text by an estimate, cards by a fixed size.
export function boxesOf(board) {
  const boxes = {};
  for (const shape of board.shapes) boxes[shape.id] = { x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2), w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) };
  for (const item of board.items) boxes[item.id] = { x: item.x, y: item.y, w: item.w || 160, h: item.kind === 'sticky' ? 160 : 24 * String(item.text).split('\n').length };
  board.blocks.forEach((block, index) => { boxes[block.id] = { x: 0, y: 1600 + index * 420, w: 560, h: 400 }; });
  return boxes;
}
export const withBoxes = board => ({ ...board, boxes: boxesOf(board) });

// Owner task 2026-10-13 (inline context): boards for relevance-based context, each with what belongs in the context of
// its target and what does not. No board leans on another's words; the tree is only the first, regression example.
const shape = (id, kind, text, x, y, w, h, extra = {}) => ({ id, kind, x1: x, y1: y, x2: x + w, y2: y + h, color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: kind === 'rect', text, ...extra });
const drawn = (id, x1, y1, x2, y2, extra = {}) => ({ id, kind: 'arrow', x1, y1, x2, y2, color: '#37352f', width: 2, dash: 'solid', opacity: 1, ...extra });
const words = (id, text, x, y, extra = {}) => ({ id, kind: 'text', x, y, w: 520, text, color: '#37352f', opacity: 1, ...extra });
const note = (id, text, x, y) => ({ id, kind: 'sticky', x, y, w: 160, text, color: '#f59e0b', opacity: 1 });
const explanation = (id, title, body, extra = {}) => ({ id, type: 'explanation', title, body, dx: 0, dy: 0, ...extra });

export const CONTEXT_CASES = {
  // The original report: a tree on a canvas still titled for an earlier topic.
  tree: { title: 'Linked List', board: treeBoard, target: ['n23'], prompt: 'Explain this',
    expect: ['n4', 'n3'], never: ['clutter'] },
  // A flowchart of ordinary shapes and drawn arrows (no stored connections): labels sit at the arrows' middles; one
  // arrow ends where two shapes overlap, and one line has no head at all.
  flowchart: { title: 'Week 3 notes', target: ['decide'], prompt: 'Explain this step',
    board: () => ({
      shapes: [
        shape('start', 'ellipse', 'Start', 100, 100, 140, 60), shape('read', 'rect', 'Read age', 100, 240, 140, 60),
        shape('decide', 'diamond', 'age >= 18?', 90, 380, 160, 100), shape('allow', 'rect', 'Allow entry', 400, 400, 140, 60),
        shape('deny', 'rect', 'Show error', 100, 600, 140, 60), shape('log', 'rect', 'Log visit', 470, 420, 140, 60),
        drawn('a1', 170, 160, 170, 240), drawn('a2', 170, 300, 170, 380), drawn('a3', 250, 430, 480, 440), drawn('a4', 170, 480, 170, 600),
        drawn('a5', 100, 630, 40, 270, { kind: 'line', endHead: 'none' }),
      ],
      items: [words('yes', 'yes', 330, 410, { w: 40 }), words('no', 'no', 180, 530, { w: 30 }), note('milk', 'Buy milk and bread', 330, 200)],
      links: [], blocks: [], groups: [], exchanges: [],
    }),
    expect: ['read', 'allow', 'deny', 'start'], never: ['milk'] },
  // Code with its supporting notes: a definition far away that names the function, and an unrelated note right beside it.
  code: { title: 'Python basics', target: ['code'], prompt: 'Explain what this function does',
    board: () => ({
      shapes: [], links: [], blocks: [], groups: [], exchanges: [],
      items: [
        words('checkout', 'Checkout', 100, 40, { level: 'h2' }),
        { id: 'code', kind: 'text', mode: 'code', x: 100, y: 100, w: 380, text: 'def total(prices):\n    s = 0\n    for p in prices:\n        s += p\n    return s', color: '#37352f', opacity: 1 },
        note('lunch', 'Team lunch Friday 12:30', 520, 100),
        words('spec', 'total() adds up the cart prices before tax. prices is a list of floats in dollars.', 1500, 1100),
        words('photo', 'Photosynthesis turns light into chemical energy.', 1500, 100),
      ],
    }),
    expect: ['spec', 'checkout'], never: ['lunch', 'photo'] },
  // A paragraph inside a longer explanation, written as a column of text boxes.
  text: { title: 'Data structures', target: ['p2'], prompt: 'Explain this',
    board: () => ({
      shapes: [], links: [], blocks: [], groups: [], exchanges: [],
      items: [
        words('h', 'How hash tables work', 100, 40, { level: 'h1' }),
        words('p1', 'A hash function turns a key into a bucket index.', 100, 100),
        words('p2', 'Two different keys can land in the same bucket; that is a collision.', 100, 160),
        words('p3', 'Chaining keeps every key that lands in a bucket in a short list.', 100, 220),
        words('p4', 'Lookups stay fast while those lists stay short.', 100, 280),
        words('r1', 'Recipe: whisk two eggs with a pinch of salt.', 900, 100),
        words('r2', 'Cook on a low heat, stirring slowly.', 900, 160),
      ],
    }),
    expect: ['p1', 'p3', 'h'], never: ['r1', 'r2'] },
  // A card within a group of cards, under a section heading; another section follows.
  card: { title: 'Algorithms', target: ['merge'], prompt: 'Explain this',
    board: () => ({
      shapes: [], items: [], links: [], exchanges: [],
      blocks: [
        { id: 'sorting', type: 'heading', level: 1, text: 'Sorting', dx: 0, dy: 0, done: false },
        explanation('merge', 'Merge sort', 'Split the list in half, sort each half, then merge the two sorted halves.', { groupId: 'dc' }),
        explanation('quick', 'Quick sort', 'Pick a pivot, put smaller items before it and larger after it, then sort each side.', { groupId: 'dc' }),
        explanation('bubble', 'Bubble sort', 'Swap neighbours that are out of order until a pass makes no swap.'),
        { id: 'graphs', type: 'heading', level: 1, text: 'Graphs', dx: 0, dy: 0, done: false },
        explanation('bfs', 'Breadth-first search', 'Visit every neighbour of a node before going deeper.'),
      ],
      groups: [{ id: 'dc', label: 'Divide and conquer' }],
    }),
    expect: ['quick', 'sorting'], never: ['bfs', 'graphs'] },
  // Two topics on one canvas, still titled for the second: the tree's own region is the context, not the list's.
  topics: { title: 'Linked List', target: ['n23'], prompt: 'Explain this',
    board: () => {
      const tree = treeBoard();
      return {
        ...tree,
        shapes: [...tree.shapes, shape('ll1', 'rect', 'head', 1800, 200, 120, 60), shape('ll2', 'rect', 'node A', 2000, 200, 120, 60), shape('ll3', 'rect', 'node B', 2200, 200, 120, 60)],
        links: [...tree.links, { id: 'l1', from: 'll1', to: 'll2', fromSide: 'right', toSide: 'left', head: true }, { id: 'l2', from: 'll2', to: 'll3', fromSide: 'right', toSide: 'left', head: true }],
        items: [...tree.items, words('treeTitle', 'Binary search tree', 380, 10, { level: 'h2', w: 300 }), words('llTitle', 'Linked lists', 1800, 120, { level: 'h2', w: 300 })],
      };
    },
    expect: ['n4', 'treeTitle'], never: ['ll1', 'll2', 'llTitle'] },
};
