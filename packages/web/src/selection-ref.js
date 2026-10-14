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
