// The canvas_context package (contract v1.1) shared by canvas-context.test.js and chat-modes.test.js.
// A board past six blocks: a large selected note sent partially, an older relevant card far away, a freeform arrow, a group,
// and an image whose content was not sent. Subject-neutral ids; the labels are only data.
export function canvasPackage(over = {}) {
  const items = [
    { id: 'n1', type: 'text', label: 'Selected note', region: 'top-left' },
    { id: 'c1', type: 'card', kind: 'definition', label: 'Older card', region: 'bottom-right' },
    { id: 'g1', type: 'group', label: 'Group A', region: 'top-left' },
    { id: 's1', type: 'shape', label: '', group_id: 'g1', region: 'top-left' },
    { id: 'e1', type: 'equation', label: 'F = ma', region: 'center' },
    { id: 'k1', type: 'connector', label: 'leads to', region: 'center' },
    { id: 'i1', type: 'image', label: 'Photo', region: 'bottom-left' },
    { id: 't2', type: 'text', label: 'Another note', region: 'center' },
  ];
  return {
    version: 1, built_at: '2026-10-14T16:40:00Z', includes_unsaved: true, title: 'Stale title',
    inventory: { counts: { text: 2, card: 1, group: 1, shape: 1, equation: 1, connector: 1, image: 1 }, items, omitted_items: 0 },
    excerpts: [
      { id: 'n1', type: 'text', text: 'First part of a long selected note.\n…\nA relevant later passage.', reason: 'relevant', inclusion: 'partial', omitted_chars: 5200, passages: [{ start: 0, end: 35 }, { start: 4000, end: 4025 }] },
      { id: 'c1', type: 'card', text: 'The older card, in full.', reason: 'relevant', inclusion: 'full', omitted_chars: 0 },
      { id: 'e1', type: 'equation', text: 'F = ma', reason: 'structural', inclusion: 'full', omitted_chars: 0 },
    ],
    relations: {
      explicit: [{ from: 'n1', to: 'c1', label: 'leads to' }],
      inferred: [{ from: 'g1', to: 's1', kind: 'contains', basis: 'shape inside the group frame' }, { from: 't2', to: 'e1', kind: 'near', basis: 'drawn arrow "calls" (ends matched by position, confidence 0.75)' }],
    },
    coverage: {
      objects_total: 8, listed: 8, included_full: 2, included_partial: 1, media_inspected: 0, unavailable_or_omitted: 1,
      items: [
        { id: 'n1', type: 'text', status: 'partial', omitted_chars: 5200 },
        { id: 'c1', type: 'card', status: 'full' },
        { id: 'e1', type: 'equation', status: 'full' },
        { id: 'i1', type: 'image', status: 'omitted', reason: 'media' },
      ],
      reserved_chars: 6000, budget_chars: 16000, used_chars: 120, summary: '8 objects listed; 2 included in full, 1 partially; 1 image not inspected',
    },
    ...over,
  };
}
