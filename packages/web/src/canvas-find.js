// Find text on canvas and the panel's pin (docs/features/panel-header.md). Pure, so node tests run it.

// The words a card shows: its title and its body, and a chat card's question and answer.
// ponytail: titles and bodies only - text in tldraw shapes, free text and sticky notes, notebooks, code,
// tables and diagrams is not searched. Add a field here when the owner wants one found.
export const cardWords = card => [card.title, card.text, card.question, card.prompt, card.body, card.caption, card.answer,
  ...(card.more || []).map(section => section?.text), ...(card.options || []).map(option => option?.text)]
  .filter(value => typeof value === 'string' && value).join('\n');

// One match per card, in canvas order: its label, and the first hit with a little text either side.
// Case-insensitive through a regex, so the hit indexes the original text even where lowercasing changes a length.
export function findMatches(cards, query) {
  const needle = String(query || '').trim();
  if (!needle) return [];
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return cards.flatMap(card => {
    const words = cardWords(card), hit = pattern.exec(words);
    if (!hit) return [];
    const start = hit.index, end = start + hit[0].length;
    const label = card.title || card.question || card.prompt || card.text || 'Untitled card';
    // A field break reads as a dot in the one-line snippet; a cut end shows an ellipsis.
    const flat = text => text.replace(/\s*\n\s*/g, ' · ').replace(/\s+/g, ' ');
    const from = Math.max(0, start - 40), to = end + 60;
    return [{ id: card.id, label: String(label).split('\n')[0], before: (from ? '…' : '') + flat(words.slice(from, start)), hit: hit[0], after: flat(words.slice(end, to)) + (to < words.length ? '…' : '') }];
  });
}

// Pinned (the default) keeps the panel open while the learner works on the canvas; the choice lasts in this browser.
const PIN_KEY = 'small.learn-panel:pinned';
export const readPanelPin = storage => { try { return storage().getItem(PIN_KEY) !== 'false'; } catch { return true; } };
export const savePanelPin = (storage, pinned) => { try { storage().setItem(PIN_KEY, String(!!pinned)); } catch { /* private mode: the choice lasts this visit */ } };
