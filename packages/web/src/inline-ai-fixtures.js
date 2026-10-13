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
