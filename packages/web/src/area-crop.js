// Ask about selection (EXP-T28): the canvas toolbar's one region path. A crop is bound to what it shows at the moment
// it was taken: each card it touches by id and content revision, the crop's bounds inside that card, and the card's
// moment (an Explanation's time, inputs and the objects under the crop; a whiteboard's shapes by tldraw id; a paper's
// page and the region of that page).

const NEWLINE = String.fromCharCode(10);

// Place, size and view state are not content: moving a card or picking an object never makes a new revision.
const NOT_CONTENT = new Set(['dx', 'dy', 'w', 'h', 'space', 'time', 'inputs', 'inputRevision', 'marked', 'selectedObject', 'selectRequest', 'cardLayout']);

// FNV-1a over the card's content. shortcut: a 32-bit hash, enough to tell revisions of one card apart; use a server
// revision once cards carry one (T20 explainRevision).
export function cardRevision(block) {
  const text = JSON.stringify(block, (key, value) => (NOT_CONTENT.has(key) ? undefined : value));
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return `r${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

const round = value => Math.round(value * 1000) / 1000;

// The part of `inner` (client rect) that falls inside `frame`, in frame fractions; null when they do not meet.
export function within(frame, inner) {
  if (!frame?.width || !frame?.height) return null;
  const left = Math.max(frame.left, inner.left), top = Math.max(frame.top, inner.top);
  const right = Math.min(frame.left + frame.width, inner.left + inner.width), bottom = Math.min(frame.top + frame.height, inner.top + inner.height);
  if (right <= left || bottom <= top) return null;
  return { x: round((left - frame.left) / frame.width), y: round((top - frame.top) / frame.height), w: round((right - left) / frame.width), h: round((bottom - top) / frame.height) };
}

// One card under the crop. measured: { card, page?, objects? } client rects read the moment the crop was drawn
// (objects: [{ id, rect }] for an Explanation's drawn objects); shapes: a whiteboard's [{ id, type, text, author }].
export function cropBinding(block, crop, measured) {
  const bounds = within(measured.card, crop);
  if (!bounds) return null;
  const binding = { id: block.id, type: block.type, title: block.title || block.type, revision: cardRevision(block), bounds };
  if (block.type === 'animation') {
    binding.time = Number(Number(block.time || 0).toFixed(2));
    if (block.inputs && Object.keys(block.inputs).length) binding.inputs = { ...block.inputs };
    binding.objects = [...new Set((measured.objects || []).filter(entry => within(crop, entry.rect)).map(entry => entry.id))];
  }
  if (block.type === 'whiteboard') binding.shapes = measured.shapes || [];
  if (block.type === 'paper' && block.paper) {
    const region = measured.page ? within(measured.page, crop) : null;
    binding.paperId = block.paper.id;
    binding.page = block.paper.page || 1;
    if (region) binding.region = region;
  }
  return binding;
}

const describe = binding => {
  const where = `crop covers ${JSON.stringify(binding.bounds)} of the card (normalized x, y, w, h)`;
  if (binding.type === 'animation') {
    return [`Explanation card "${binding.title}" (revision ${binding.revision}) paused at ${binding.time}s${binding.inputs ? ` with inputs ${JSON.stringify(binding.inputs)}` : ''}: ${where}.`,
      binding.objects.length ? `  Objects inside the crop: ${binding.objects.join(', ')}` : '  The crop contains no authored object.'].join(NEWLINE);
  }
  if (binding.type === 'whiteboard') {
    return [`Learner whiteboard "${binding.title}" (revision ${binding.revision}): ${where}.`,
      binding.shapes.length ? `  Selected shapes: ${binding.shapes.map(shape => `${shape.type}${shape.text ? ` "${shape.text}"` : ''} (${shape.author}, ${shape.id})`).join(', ')}` : '  The crop contains no shape.'].join(NEWLINE);
  }
  if (binding.type === 'paper') return `Paper "${binding.title}" (revision ${binding.revision}), page ${binding.page}: ${binding.region ? `region of the page ${JSON.stringify(binding.region)} (normalized x, y, w, h)` : where}.`;
  return `Card "${binding.title}" (${binding.type}, revision ${binding.revision}): ${where}.`;
};

// The ask target the composer's pill shows and the question carries. A crop that lies on one paper's page also carries
// that page and region the way the paper's own region ask did, so the server crops the page for the model (paper.selection).
export function areaTarget({ id, bindings, preview = null, at = Date.now() }) {
  const titles = bindings.map(binding => binding.title);
  const title = titles.length ? `Selected area · ${titles.slice(0, 2).join(', ')}${titles.length > 2 ? ` +${titles.length - 2}` : ''}` : 'Selected area';
  const papers = bindings.filter(binding => binding.type === 'paper' && binding.region);
  const paper = papers.length === 1 && bindings.length === 1 && papers[0].paperId ? papers[0] : null;
  return {
    id, kind: 'Canvas selection', title, crops: bindings, at,
    text: [
      'The learner drew a rectangle on the canvas and asks about what is inside it; the attached image shows that area.',
      bindings.length ? `Cards inside or touching it:${NEWLINE}${bindings.map(describe).join(NEWLINE)}` : 'No card is inside it, only the canvas itself.',
    ].join(NEWLINE),
    ...(paper && preview ? { paper: { id: paper.paperId, page: paper.page, selection: { region: paper.region, preview } } } : {}),
  };
}
