import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Md } from './ask.jsx';

// Lesson component library for the adaptive canvas (spec: docs/
// adaptive-learning-canvas-spec.md §12). Each entry renders inside the shared
// CanvasNode chrome; samples carry nanoGPT-flavored fixture content so the
// dev-only Insert menu can exercise the look before any lesson is assembled.
// Quiz and flashcards are the shapes the tutor agent will emit as the learner
// progresses; ghost entries sit directly on the canvas with no visible box
// until hovered.

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
  quiz: {
    label: 'Quiz',
    ghost: true,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'quiz',
      dx: 0,
      dy: 0,
      question: 'If $\\sigma(x) = \\frac{1}{1+e^{-x}}$, what is the derivative $\\sigma\'(x)$?',
      options: [
        { key: 'A', text: '$\\sigma(x)\\,(1 - \\sigma(x))$', correct: true },
        { key: 'B', text: '$1 - \\sigma(x)^2$' },
        { key: 'C', text: '$e^{-x}$' },
      ],
      why: 'Differentiate: $\\sigma\'(x) = \\frac{e^{-x}}{(1+e^{-x})^2} = \\sigma(x)\\,(1-\\sigma(x))$ — maximal $0.25$ at $x = 0$, which is why deep sigmoid stacks saturate.',
      choice: null,
    }),
  },
  flashcards: {
    label: 'Flashcards',
    ghost: true,
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'flashcards',
      dx: 0,
      dy: 0,
      cards: [
        { front: 'What is `wte`?', back: 'The token embedding table — one learned row per vocabulary token ($65 \\times 384$ in the char model).' },
        { front: 'Why are attention heads free?', back: '`n_head` only splits the same $n\\_{embd}$ channels — changing it adds no parameters.' },
        { front: 'Reported parameter count of the char model?', back: '$10{,}646{,}784$ — `bias = False` everywhere, and the position table is subtracted by `get_num_params`.' },
      ],
    }),
  },
};

function Kicker({ author = 'course', children }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-ink-2 uppercase"><span className="h-1.5 w-1.5 rounded-full bg-ink" />{children}</span>
      <span className="rounded-full bg-ink px-2 py-px text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">{author}</span>
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

function QuizBody({ block, onChange }) {
  const chosen = block.options.find(option => option.key === block.choice);
  const solved = !!chosen?.correct;
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker author="tutor">Check yourself</Kicker>
      <div className="text-sm"><Md text={block.question} /></div>
      <div className="mt-2" onPointerDown={e => solved || e.stopPropagation()}>
        {block.options.map(option => {
          const state = block.choice === option.key ? (option.correct ? 'right' : 'wrong') : null;
          return (
            <button key={option.key} type="button" data-quiz-option={option.key} disabled={solved}
              onClick={() => onChange({ ...block, choice: option.key })}
              className={`mt-1.5 flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm ${state === 'right' ? 'border-green-700 bg-green-700/5' : state === 'wrong' ? 'border-red-700 bg-red-700/5' : 'border-line bg-white hover:bg-hover'} ${solved && !state ? 'opacity-50' : ''}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold ${state === 'right' ? 'border-green-700 text-green-700' : state === 'wrong' ? 'border-red-700 text-red-700' : 'border-line text-ink-2'}`}>{option.key}</span>
              <span className="min-w-0"><Md text={option.text} /></span>
            </button>
          );
        })}
      </div>
      {block.choice && !solved && <p className="mt-2 text-xs text-red-700">Not quite — look at where the exponential ends up, and try again.</p>}
      {solved && <div className="mt-2 border-t border-line pt-2 text-sm text-ink-2"><span className="mr-1 font-medium text-green-700">✓ Right.</span><Md text={block.why} /></div>}
    </div>
  );
}

function FlashcardsBody({ block }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = block.cards[index];
  const go = step => { setFlipped(false); setIndex(previous => (previous + step + block.cards.length) % block.cards.length); };
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker author="tutor">Flashcards</Kicker>
      <button type="button" data-flashcard aria-label={flipped ? 'Show front' : 'Show back'}
        onPointerDown={e => e.stopPropagation()} onClick={() => setFlipped(previous => !previous)}
        className={`flex min-h-28 w-full items-center justify-center rounded-lg border px-5 py-4 text-center text-sm transition-colors ${flipped ? 'border-line bg-hover' : 'border-line bg-white hover:bg-hover'}`}>
        <Md text={flipped ? card.back : card.front} />
      </button>
      <div className="mt-2 flex items-center justify-between" onPointerDown={e => e.stopPropagation()}>
        <button type="button" aria-label="Previous card" onClick={() => go(-1)} className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink"><ChevronLeft size={15} /></button>
        <span className="text-xs tabular-nums text-ink-2">{index + 1} / {block.cards.length} · click the card to flip</span>
        <button type="button" aria-label="Next card" onClick={() => go(1)} className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink"><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}

export function LearningBlockBody({ block, onChange }) {
  if (block.type === 'challenge') return <ChallengeBody block={block} onChange={onChange} />;
  if (block.type === 'quiz') return <QuizBody block={block} onChange={onChange} />;
  if (block.type === 'flashcards') return <FlashcardsBody block={block} />;
  return null;
}
