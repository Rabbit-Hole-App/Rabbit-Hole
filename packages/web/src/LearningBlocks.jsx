import { useState } from 'react';
import { Md } from './ask.jsx';

// Lesson component library for the adaptive canvas (spec: docs/
// adaptive-learning-canvas-spec.md §12). Each entry renders inside the shared
// CanvasNode chrome; samples carry nanoGPT-flavored fixture content so the
// dev-only Insert menu can exercise the look before any lesson is assembled.

export const BLOCK_TYPES = {
  challenge: {
    label: 'Challenge',
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'challenge',
      dx: 0,
      dy: 0,
      prompt: 'nanoGPT receives token IDs — plain integers like `42`. What has to happen between these integers and next-token predictions?',
      hint: 'Commit a guess before we look.',
      reveal: 'Hold that thought. The next blocks walk the real path: token IDs pick embedding rows, positions add where each token sits, the transformer tower mixes them, and the LM head scores every vocabulary token.',
      answer: null,
    }),
  },
};

function Kicker({ children }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-ink-2 uppercase"><span className="h-1.5 w-1.5 rounded-full bg-ink" />{children}</span>
      <span className="rounded-full bg-ink px-2 py-px text-[10px] text-white">course</span>
    </div>
  );
}

function ChallengeBody({ block, onChange }) {
  const [draft, setDraft] = useState('');
  const commit = () => { if (draft.trim()) onChange({ ...block, answer: draft.trim() }); };
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker>Challenge</Kicker>
      <div className="text-sm"><Md text={block.prompt} /></div>
      {!block.answer ? (
        <div onPointerDown={e => e.stopPropagation()}>
          <p className="mt-1 text-xs text-ink-2 italic">{block.hint}</p>
          <div className="mt-2 flex gap-2">
            <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commit(); }}
              placeholder="Your guess in one sentence…" className="h-8 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm outline-none focus:border-ink-3" />
            <button type="button" disabled={!draft.trim()} onClick={commit}
              className="h-8 shrink-0 rounded-lg bg-ink px-3.5 text-sm font-medium text-white disabled:opacity-40">Commit</button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-2 flex justify-end"><span className="max-w-[85%] rounded-xl bg-[#2383e2] px-3 py-1.5 text-sm whitespace-pre-wrap text-white">{block.answer}</span></div>
          <div className="mt-3 border-t border-line pt-3 text-sm"><Md text={block.reveal} /></div>
        </>
      )}
    </div>
  );
}

export function LearningBlockBody({ block, onChange }) {
  if (block.type === 'challenge') return <ChallengeBody block={block} onChange={onChange} />;
  return null;
}
