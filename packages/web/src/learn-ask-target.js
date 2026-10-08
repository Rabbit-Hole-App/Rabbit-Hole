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

// The question a canvas Ask writes into the composer (owner, 2026-10-08): ready to send, never sent. A card or slide by
// its title, a group as a whole; the card or group itself rides as canvas_target.
export const cardQuestion = (title) => (title ? `Can you explain "${title}"?` : 'Can you explain this card?');
export const GROUP_QUESTION = 'Can you explain how these cards fit together?';

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
