import { useMemo, useState } from 'react';

// Sub-lane A4a (Sources pane and shared context) owns this file. Contract: chat-workspace-CONTRACT.md A2 (ContextRef), A5.
// Shape every other sub-lane relies on:
//   { items: [{ ref: ContextRef, state: 'uploading' | 'processing' | 'ready' | 'failed', error?, retry? }]  (everything this canvas offers),
//     attached: ContextRef[] (this conversation's; sent as context_refs), attach(ref), detach(ref), isAttached(ref), upload(file) }
// STUB: A4a replaces the body (context docs, canvas refs, restore from thread.restore); keep the returned names.
export const sameRef = (a, b) => a.sourceId === b.sourceId && JSON.stringify(a.range ?? null) === JSON.stringify(b.range ?? null);
export function useChatContext(canvas, thread) { // eslint-disable-line no-unused-vars
  const [attached, setAttached] = useState([]);
  return useMemo(() => ({
    items: [], attached,
    attach: ref => setAttached(previous => (previous.some(item => sameRef(item, ref)) ? previous : [...previous, ref])),
    detach: ref => setAttached(previous => previous.filter(item => !sameRef(item, ref))),
    isAttached: ref => attached.some(item => sameRef(item, ref)), upload: async () => {},
  }), [attached]);
}
