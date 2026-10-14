import { useMemo, useRef, useState } from 'react';

// Sub-lane A3a (composer and modes) owns this file. Contract: chat-workspace-CONTRACT.md A5, A6.
// Shape every other sub-lane relies on:
//   { text, setText(text), command: string | null, setCommand(command), inputRef,
//     prepare({ text?, command?, contextRefs?, mode? }) (never sends; A6 rules), focus(), clear() (after Send only) }
// The provider routes prepare's contextRefs and mode to context.attach and thread.setMode.
// STUB: A3a replaces the body (local draft per thread, restore from thread.restore); keep the returned names.
export function useChatDraft(canvas, thread) { // eslint-disable-line no-unused-vars
  const [text, setText] = useState(''), [command, setCommand] = useState(null), inputRef = useRef(null);
  return useMemo(() => ({
    text, setText, command, setCommand, inputRef,
    prepare: ({ text: next, command: nextCommand } = {}) => { if (next) setText(previous => (previous.trim() ? `${previous}\n\n${next}` : next)); if (nextCommand !== undefined) setCommand(nextCommand); requestAnimationFrame(() => inputRef.current?.focus()); },
    focus: () => requestAnimationFrame(() => inputRef.current?.focus()), clear: () => { setText(''); setCommand(null); },
  }), [text, command]);
}
