// Position, the API-level check (Reviewer 2026-11-17 10:22 B): one real section arranged by learn-position.js, without a browser. The cards are the ones Make made for nanoGPT 2.1
// on 8878 (make/nano-2.1-*.json: their kinds, and the words of each lead and follow), plus the chapter-2 heading card; the existing board is one 560-wide column of earlier cards.
// Heights are the spec 5 assumed heights (the browser settles them on measure). Writes position/nano-2.1-layout.json and exits 1 when a rule is broken.
// usage: node docs/features/learn-sections/position/arrange-check.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { SPACING, assumedHeight, columnWidth, learnLayout } from '../../../../packages/web/src/learn-position.js';

const dir = new URL('../', import.meta.url), read = path => JSON.parse(readFileSync(new URL(path, dir), 'utf8'));
const words = text => ({ type: 'doc', blocks: [{ content: [{ text: String(text || '') }] }] });
const KIND = { '/explain': 'explanation', '/code': 'snippet', '/diagram': 'flow_diagram', '/graph': 'interactive_graph' };
const items = read('compose/nano-2.1.json').out.composition.items;
const blocks = [{ id: 'chapter-2', ...words('2 · Setting Aside Text for Checking'), learn: { sectionId: '2', itemId: null, role: 'chapter' } }];
for (const [order, id] of [...items.map(item => item.id), 'notes'].entries()) {
  const made = read(`make/nano-2.1-${id}.json`).out;
  if (!made?.perform) continue; // skipped by Make (a quiz)
  const p = made.perform, type = p.op === 'slash' ? KIND[p.line.split(' ')[0]] : p.op;
  const tag = role => ({ sectionId: '2.1', itemId: id, role, order });
  if (made.item?.lead) blocks.push({ id: `${id}-lead`, ...words(made.item.lead), learn: tag('lead') });
  blocks.push({ id: `${id}-card`, type, ...(type === 'doc' ? words(p.markdown) : {}), ...(type === 'snippet' ? { code: 'x\n'.repeat(30) } : {}), learn: tag('card') });
  if (made.item?.follow) blocks.push({ id: `${id}-follow`, ...words(made.item.follow), learn: tag('follow') });
}
const W = columnWidth(blocks.map(block => (block.type === 'doc' ? 640 : block.type === 'explanation' ? 720 : 560)));
const existing = [{ x: 0, y: 0, w: 560, h: 4200 }];
const cards = blocks.map(block => ({ id: block.id, learn: block.learn, w: W, h: assumedHeight(block, W), box: null, placed: false }));
const { targets, origin } = learnLayout({ cards, others: existing, W });
const boxes = cards.map(card => ({ id: card.id, type: blocks.find(block => block.id === card.id).type, role: card.learn.role, ...targets.get(card.id), w: card.w, h: card.h }));

const errors = [], overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
for (const [k, a] of boxes.entries()) {
  if (existing.some(box => overlap(a, box))) errors.push(`${a.id} overlaps the existing board`);
  for (const b of boxes.slice(k + 1)) if (overlap(a, b)) errors.push(`${a.id} overlaps ${b.id}`);
  if (k && a.y < boxes[k - 1].y + boxes[k - 1].h) errors.push(`${a.id} is not below ${boxes[k - 1].id}`);
}
if (new Set(boxes.map(box => box.x)).size !== 1) errors.push('the column is not one x');
if (origin.x !== 560 + SPACING.column || origin.y !== 0) errors.push(`the column starts at ${origin.x},${origin.y}, not right of the board, top aligned`);
writeFileSync(new URL('position/nano-2.1-layout.json', dir), `${JSON.stringify({ W, origin, spacing: SPACING, boxes, errors }, null, 2)}\n`);
console.log(`${boxes.length} cards, W ${W}, column at ${origin.x},${origin.y}; ${errors.length ? `FAIL: ${errors.join('; ')}` : 'PASS: one column, plan order, no overlap, nothing existing covered'}`);
process.exit(errors.length ? 1 : 0);
