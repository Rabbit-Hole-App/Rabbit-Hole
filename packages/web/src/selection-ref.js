// Add to Chat on the canvas (owner brief 2026-10-13 section 5; chat-workspace-CONTRACT.md A2, A5): the selection as ONE ContextRef.
// One object is its card (an uploaded image or a video/audio object is its own kind), or a card passage when text inside it is
// selected; a group or several objects is one group ref keyed by the first id, its members in range.cardIds. Ids are sorted, so
// adding the same selection twice is the same ref (sameRef de-duplicates it). text is a getter, read when the composer sends: the
// content sent is what the canvas holds then, as the armed canvas target's text is.
import { hash } from './inline-ai-context.js';

export const REF_LIMITS = Object.freeze({ name: 120, quote: 500, cardIds: 50, text: 8000 });

export function objectKind(object) {
  if (object?.type === 'image' || (object?.type === 'file' && object.kind === 'image')) return 'image';
  if (object?.type === 'video' || object?.type === 'audio' || (object?.type === 'file' && ['video', 'audio'].includes(object.kind))) return 'media';
  return 'card';
}

// A chip's name for one canvas object (owner brief UI-09): its described title, else its own title, label, question, text,
// LaTeX or the first line of its body, else what it is (the described kind, a shape, its card type) - never a count.
const firstLine = value => String(value ?? '').trim().split('\n')[0].trim();
const TYPE_NAMES = { 'repo-code': 'Code', 'repo-graph': 'Graph', snippet: 'Code sample', heading: 'Section', pdf: 'PDF' };
export function objectName(object, described = null) {
  return firstLine(described?.title) || firstLine(object?.title || object?.label || object?.question || object?.text || object?.latex || object?.body)
    || firstLine(described?.kind) || (object && 'x1' in object ? 'Shape' : TYPE_NAMES[object?.type] || (object?.type ? object.type[0].toUpperCase() + object.type.slice(1) : 'Card'));
}
// Several objects (UI-09): a group is its name ("Group" when unnamed), any other selection its first two names and an ellipsis for
// the rest. The chip shows how many beside it (chat-context.js rangeLabel: N cards), so the name never carries a count.
export function selectionName(names, group = null) {
  if (group) return firstLine(group.label) || 'Group';
  return names.length > 2 ? `${names.slice(0, 2).join(', ')}, …` : names.join(', ');
}

// ids: the selected objects; kind: objectKind of the one object (ignored for several); name: the chip's label; content: the text
// the version fingerprints; quote: text selected inside the one card; text(): the content, resolved at Send.
export function selectionRef({ ids, kind = 'card', name = '', content = '', quote = '', text = () => content }) {
  const sorted = [...ids].map(String).sort();
  const passage = String(quote || '').trim().slice(0, REF_LIMITS.quote);
  const ref = sorted.length === 1
    ? { sourceId: `${kind}:${sorted[0]}`, kind, range: kind === 'card' && passage ? { quote: passage } : null }
    : { sourceId: `group:${sorted[0]}`, kind: 'group', range: { cardIds: sorted.slice(0, REF_LIMITS.cardIds) } };
  Object.assign(ref, { name: String(name || 'Selection').slice(0, REF_LIMITS.name), version: hash(String(content)) });
  return Object.defineProperty(ref, 'text', { enumerable: true, get: () => String(text() ?? '').slice(0, REF_LIMITS.text) });
}
