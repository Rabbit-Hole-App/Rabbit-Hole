import { useMemo, useRef, useState } from 'react';

// Sub-lane A4b (readers and reading position) owns this file. Contract: chat-workspace-CONTRACT.md A2, A5; brief section 6.
// Shape every other sub-lane relies on:
//   { active: ContextRef | null, open(ref) (pushes onto the back stack), back(), canBack, close(),
//     position(sourceId) -> saved reader position | undefined, savePosition(sourceId, position) }
// close() never detaches (contract A5): it only empties the stack. Positions live for the whole session of this canvas.

const STACK_LIMIT = 50; // ponytail: the oldest back steps fall off past 50; nobody walks back that far

// The back stack: a ref for the source already on top replaces it (another page of the same paper is not a back step).
export const pushSource = (stack, ref) => (stack.at(-1)?.sourceId === ref.sourceId ? [...stack.slice(0, -1), ref] : [...stack, ref]).slice(-STACK_LIMIT);

// Reading positions per sourceId ({ page, section, scrollTop }), merged, so a page turn keeps the scroll and the reverse.
// An open that names a range (a citation) is an instruction to land there, so that source's saved position is forgotten.
export function positionStore() {
  const saved = new Map();
  return {
    get: sourceId => saved.get(sourceId),
    set: (sourceId, position) => saved.set(sourceId, { ...saved.get(sourceId), ...position }),
    opened: ref => { if (ref.range) saved.delete(ref.sourceId); },
  };
}

// code:<repo>@<commit>:<path> (contract A2). The range's own path wins; repo and commit may be empty.
export function codeSource(ref) {
  const match = /^code:([^@]*)@([^:]*):(.+)$/.exec(ref?.sourceId || '');
  if (!match) return null;
  const range = ref.range || {};
  return { repo: match[1], commit: match[2] || ref.version || '', path: range.path || match[3], start: range.start || 0, end: range.end || range.start || 0 };
}

// Which existing reader shows a ref (brief section 6). null: nothing here can show it, and the reader says so.
export function readerFor(ref) {
  const id = String(ref?.sourceId || '');
  if (ref?.kind === 'doc') return id.startsWith('doc:') ? 'doc' : null;
  if (ref?.kind === 'code') return codeSource(ref) ? 'code' : null;
  if (ref?.kind === 'web') return id.startsWith('paper:') ? 'paper' : id.startsWith('wiki:') ? 'wiki' : null;
  // Canvas content lives in the browser: a card or group shows the text resolved into its ref, when it has one.
  if (ref?.kind === 'card' || ref?.kind === 'group') return ref.text ? 'text' : null;
  return null; // ponytail: image and media refs name a canvas shape, and no reader here can read a shape by id
}

// Refs for the readers LearnPage opens (contract A2). Viewing builds a ref; only Attach or Ask about this sends one.
const named = text => String(text || '').replace(/_/g, ' ').slice(0, 120);
// home: a copied page's own canvas (pdf-to-canvas.md), so its reader reads its upload there.
export const paperRef = paper => ({ sourceId: `paper:${paper.id}`, kind: 'web', name: named(paper.title || `arXiv ${paper.id}`), version: String(paper.id), range: { page: paper.page || 1 }, ...(paper.home ? { home: paper.home } : {}) });
export const wikiRef = ({ title }) => ({ sourceId: `wiki:${title}`, kind: 'web', name: named(title), version: '', range: null });
export const codeRef = ({ repo = '', commit = '', path, start = 0, end = 0 }) => ({ sourceId: `code:${repo}@${commit}:${path}`, kind: 'code', name: named(path.split('/').pop()), version: commit, range: start ? { path, start, end: Math.max(start, end || start) } : null });

// Per canvas: another canvas starts with nothing open, and coming back finds its reading positions where they were.
let opens = 0;
export function useChatSources(canvas) {
  const [held, setHeld] = useState({ canvas, stack: [] }), stores = useRef(new Map());
  if (!stores.current.has(canvas)) stores.current.set(canvas, positionStore());
  const store = stores.current.get(canvas), stack = held.canvas === canvas ? held.stack : [];
  return useMemo(() => {
    const change = next => setHeld(previous => ({ canvas, stack: next(previous.canvas === canvas ? previous.stack : []) }));
    return {
      active: stack.at(-1) ?? null, canBack: stack.length > 1,
      // An excerpt's Open source lands on its anchor every time, also when that PDF is already open (SourceReader keys on `opened`).
      open: ref => { store.opened(ref); const next = ref.range?.excerpt ? { ...ref, opened: (opens += 1) } : ref; change(previous => pushSource(previous, next)); },
      back: () => change(previous => previous.slice(0, -1)), close: () => change(() => []),
      position: sourceId => store.get(sourceId), savePosition: (sourceId, position) => store.set(sourceId, position),
    };
  }, [canvas, stack, store]);
}
