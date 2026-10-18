import { previewNativeArrangement } from './inline-native-tools.js';
import { cardEditSpec } from './inline-card-edit.js';
import { supportsCardLayout, preserveCardEditLayout, resizeCardLayout } from './card-layout.js';

const BOXED = new Set(['rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star']);
const fail = reason => ({ ok: false, reason, changes: [] });
export const arrangementCardEligible = card => supportsCardLayout(card) && cardEditSpec(card).ok;

// Cards use persisted dx/dy offsets, never invented x/y positions. Layout slots
// retain their original footprint so resizing cannot reflow neighbouring cards.
export function previewInlineArrangement(input, { ids, snapshot, board, currentBounds, readOnly = false }) {
  if (!input || Object.keys(input).some(key => !['how', 'width'].includes(key)) || (input.how !== 'equal-width' && input.width !== undefined)) return fail('Unsupported arrangement input.');
  const entries = ids.map(id => {
    const list = snapshot.lists[id];
    return { id, list, entity: board[list]?.find(item => item.id === id), box: currentBounds[id] };
  });
  if (entries.some(({ list, entity }) => !entity || entity.locked || (list === 'blocks' ? !arrangementCardEligible(entity) : list === 'shapes' ? !BOXED.has(entity.kind) : list === 'items' ? !['text', 'sticky'].includes(entity.kind) : true))) return fail('Arrange editable cards, boxed shapes or standalone text; connectors and restricted sources cannot be moved independently.');
  if (entries.some(({ id, entity }) => JSON.stringify(entity) !== JSON.stringify(snapshot.objects[id]))) return fail('The selected object changed.');
  if(entries.some(({list,entity})=>list==='shapes'&&['x1','y1','x2','y2'].some(key=>!Number.isFinite(entity[key]))))return fail('The shape coordinates are invalid.');
  const layout = previewNativeArrangement({ how: input.how === 'equal-width' ? 'left' : input.how, units: entries.map(({ id, box }) => ({ ...box, members: [id] })) }, { frozen: snapshot, currentBounds, readOnly });
  if (!layout.ok) return layout;
  const width = input.width ?? Math.max(...entries.map(({ box }) => box.w));
  if (input.how === 'equal-width' && (!Number.isFinite(width) || width <= 0 || width > 1200)) return fail('Choose an equal width greater than zero and at most 1200 canvas units.');
  const changes = [];
  for (const { id, list, entity, box } of entries) {
    let after;
    if (input.how === 'equal-width') {
      if (list === 'blocks') {
        if (width < 320 || (entity.cardLayout?.mode === 'full' && width < box.w)) return fail('Cards require at least 320 units; Full content cards cannot shrink below their current measured width in this operation.');
        const stable = preserveCardEditLayout(entity, box);
        after = resizeCardLayout(stable, width, box.h, undefined, box.w);
      } else if (list === 'shapes') {
        const left = Math.min(entity.x1, entity.x2);
        after = entity.x2 >= entity.x1 ? { ...entity, x1: left, x2: left + width } : { ...entity, x1: left + width, x2: left };
      } else {
        if (width < 40) return fail('Text and note boxes require at least 40 canvas units.');
        after = { ...entity, w: width };
      }
    } else {
      const move = layout.moves.find(value => value.ids.includes(id));
      const keys = list === 'blocks' ? ['dx', 'dy'] : list === 'shapes' ? ['x1', 'y1', 'x2', 'y2'] : ['x', 'y'];
      if (keys.some(key => !Number.isFinite(entity[key]))) return fail('The selected object has no saved layout coordinates.');
      after = { ...entity };
      keys.forEach((key, index) => { after[key] += index % 2 === 0 ? move.dx : move.dy; });
      if (keys.some(key => !Number.isFinite(after[key]))) return fail('The arrangement exceeds finite canvas coordinates.');
    }
    const move=layout.moves.find(value=>value.ids.includes(id));
    const bounds=input.how==='equal-width'?{...box,w:width}:{...box,x:box.x+move.dx,y:box.y+move.dy};
    changes.push({ id, list, field: 'native', before: entity, after, bounds });
  }
  return { ok: true, changes, limitations: input.how === 'equal-width' ? ['Equal width retains left anchors and current heights; Full content height remains determined by its renderer. Connector endpoints remain attached by identity.'] : [] };
}
