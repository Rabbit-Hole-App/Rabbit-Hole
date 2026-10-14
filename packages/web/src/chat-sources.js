import { useMemo, useRef, useState } from 'react';

// Sub-lane A4b (readers and reading position) owns this file. Contract: chat-workspace-CONTRACT.md A2, A5; brief section 6.
// Shape every other sub-lane relies on:
//   { active: ContextRef | null, open(ref) (pushes onto the back stack), back(), canBack, close(),
//     position(sourceId) -> saved reader position | undefined, savePosition(sourceId, position) }
// close() never detaches (contract A5). STUB: A4b replaces the body; keep the returned names.
export function useChatSources() {
  const [stack, setStack] = useState([]), positions = useRef(new Map());
  return useMemo(() => ({
    active: stack.at(-1) ?? null, canBack: stack.length > 1,
    open: ref => setStack(previous => (previous.at(-1)?.sourceId === ref.sourceId ? [...previous.slice(0, -1), ref] : [...previous, ref])),
    back: () => setStack(previous => previous.slice(0, -1)), close: () => setStack([]),
    position: sourceId => positions.current.get(sourceId), savePosition: (sourceId, position) => positions.current.set(sourceId, position),
  }), [stack]);
}
