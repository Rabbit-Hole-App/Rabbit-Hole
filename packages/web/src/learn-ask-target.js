// The canvas target a Learn question is about (owner decision 2): the card, group or marked
// region travels as canvas_target beside the learner's own words, never wrapped into the message.
// The server bounds the text for the model (8000 characters, with a marker); this caps the request.
export const CANVAS_TARGET_MAX = 32000;

export function canvasTargetField(target) {
  const text = String(target.text || '');
  const cut = CANVAS_TARGET_MAX - 60;
  return {
    id: String(target.id), kind: String(target.kind),
    ...(target.title ? { title: String(target.title) } : {}),
    text: text.length > CANVAS_TARGET_MAX ? `${text.slice(0, cut)}\n[${text.length - cut} more characters not sent]` : text,
  };
}

// The selected objects describeBlock (LearningBlocks.jsx) leaves out, for the composer's pill and canvas_target (owner,
// 2026-10-08: "when we click on a card meaning it is selected we should have a pill above the chat composer"): a chat
// card, a text box or sticky note, an equation, and the Wikipedia, PDF, file and section cards. A divider has nothing to ask about.
// material: the card's icon on the pill. image: an uploaded image's media id, which rides as image_context.
export function describeCanvasObject(object) {
  if (!object) return null;
  if (!object.type) {
    if (typeof object.question === 'string') {
      const turns = [object, ...(object.replies || [])].map(turn => `Q: ${turn.question || ''}\nA: ${turn.answer || ''}`);
      return { kind: 'Chat', title: object.question || 'Chat', text: `A chat on the canvas:\n${turns.join('\n\n')}`, material: 'chat' };
    }
    if (object.kind === 'text' || object.kind === 'sticky') {
      const kind = object.kind === 'sticky' ? 'Sticky note' : 'Text';
      const words = String(object.text || '').trim();
      return { kind, title: words.split('\n')[0] || `Empty ${kind.toLowerCase()}`, text: `${kind} on the canvas: ${words || '(empty)'}`, material: 'note' };
    }
    // An equation is its LaTeX source (canvas-equations.md): the pill shows it, the question carries it.
    if (object.kind === 'equation') {
      const latex = String(object.latex || '').trim();
      return { kind: 'Equation', title: latex || 'Empty equation', text: `Equation on the canvas, in LaTeX: ${latex || '(empty)'}`, material: 'equation' };
    }
    return null;
  }
  if (object.type === 'wiki') return { kind: 'Wikipedia', title: object.title, text: `Wikipedia article on the canvas: ${object.title}${object.section ? ` (section ${object.section})` : ''}`, material: 'wiki' };
  if (object.type === 'pdf') return { kind: 'PDF', title: object.label || 'PDF', text: `PDF on the canvas: ${object.label || 'untitled'}`, material: 'pdf' };
  if (object.type === 'file') {
    const image = object.kind === 'image';
    return { kind: image ? 'Image' : 'File', title: object.label || (image ? 'Image' : 'File'), text: `${image ? 'Image' : 'File'} on the canvas: ${object.label || 'untitled'}`, material: 'file', ...(image && object.mediaId ? { image: object.mediaId } : {}) };
  }
  if (object.type === 'heading') return { kind: 'Section', title: object.text || 'Section', text: `Section heading on the canvas: ${object.text || '(untitled)'}`, material: 'heading' };
  return null;
}

// The question a canvas Ask writes into the composer (owner, 2026-10-08): ready to send, never sent. A card or slide by
// its title, a group as a whole; the card or group itself rides as canvas_target.
export const cardQuestion = (title) => (title ? `Can you explain "${title}"?` : 'Can you explain this card?');
export const GROUP_QUESTION = 'Can you explain how these cards fit together?';
// An equation's own LaTeX rides as the context (and shows on the pill), so its question stays plain words.
export const EQUATION_QUESTION = 'Can you explain this equation?';

// A group Ask (K5): members in order, a chat answer cut at 600 characters, and the members with
// no text description named, each cut or omission marked so the tutor knows what it lacks.
export const GROUP_ANSWER_CHARS = 600;
export function groupTargetText(entries) {
  const parts = [], skipped = [];
  for (const entry of entries) {
    if (entry.skipped) { skipped.push(entry.skipped); continue; }
    if (entry.question !== undefined) {
      const answer = String(entry.answer || '');
      parts.push(`Q: ${entry.question}\nA: ${answer.slice(0, GROUP_ANSWER_CHARS)}${answer.length > GROUP_ANSWER_CHARS ? ' [answer truncated]' : ''}`);
    } else if (entry.text) parts.push(entry.text);
  }
  if (skipped.length) parts.push(`[${skipped.length} card${skipped.length === 1 ? '' : 's'} not described: ${[...new Set(skipped)].join(', ')}]`);
  return parts.join('\n\n') || 'An empty group of drawings.';
}

// A YouTube moment card: { type: 'video', videoId, title, channel, start, end, unverified }.
export function describeYouTube(block) {
  return `YouTube moment: ${block.title} (video ${block.videoId}${block.channel ? `, ${block.channel}` : ''}), window ${block.start || 0}s-${block.end != null ? `${block.end}s` : 'end'}${block.unverified ? ' (window unverified)' : ''}`;
}
