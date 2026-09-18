import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, Play, RotateCcw, X } from 'lucide-react';
import { Md } from './ask.jsx';
import { colorLine } from './code.jsx';
import { CodeBlock } from './ui.jsx';
import { runPython } from './pyodide-runner.js';

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
  snippet: {
    label: 'Code sample',
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'snippet',
      dx: 0,
      dy: 0,
      title: 'Building the character vocabulary',
      brief: 'The char model derives its whole vocabulary from the training text — every distinct character gets an id.',
      code: "text = 'hello hi'\nchars = sorted(set(text))\nprint(chars)\nprint(len(chars), 'characters')\nstoi = { ch: i for i, ch in enumerate(chars) }\nprint(stoi['h'], stoi['i'])",
      output: "[' ', 'e', 'h', 'i', 'l', 'o']\n6 characters\n2 3",
    }),
  },
  code: {
    label: 'Code exercise',
    sample: () => ({
      id: crypto.randomUUID(),
      type: 'code',
      dx: 0,
      dy: 0,
      title: 'Finish the character encoder',
      brief: 'The char model maps every character to an id with `stoi`. Complete `encode` so it turns a string into its list of ids.',
      setup: "text = 'hello hi'\nchars = sorted(set(text))\nstoi = { ch: i for i, ch in enumerate(chars) }\nitos = { i: ch for ch, i in stoi.items() }",
      starter: 'def encode(s):\n    # return the list of ids for the characters of s\n    ...',
      checks: "assert encode('hi') == [stoi['h'], stoi['i']], f\"encode('hi') returned {encode('hi')}\"\nassert encode('') == [], 'an empty string should give an empty list'\nprint('encode(\\'hi\\') =', encode('hi'))\nprint('all checks passed')",
      hint: 'encode must return one id per character of s, in order — look each character up in stoi.',
      draft: null,
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

function Kicker({ author = 'course', action = null, children }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-ink-2 uppercase"><span className="h-1.5 w-1.5 rounded-full bg-ink" />{children}</span>
      <span className="flex items-center gap-1">
        {action}
        <span className="rounded-full bg-ink px-2 py-px text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">{author}</span>
      </span>
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
      <Kicker author="tutor" action={block.choice && (
        <button type="button" aria-label="Reset quiz" title="Try again from scratch"
          onPointerDown={e => e.stopPropagation()} onClick={() => onChange({ ...block, choice: null })}
          className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink"><RotateCcw size={13} /></button>
      )}>Check yourself</Kicker>
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

function SnippetBody({ block }) {
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker>Code</Kicker>
      <p className="text-sm font-medium">{block.title}</p>
      {block.brief && <div className="mt-1 text-sm text-ink-2"><Md text={block.brief} /></div>}
      <CodeBlock className="mt-2 text-xs">{block.code.split('\n').map((line, index) => <div key={index}>{colorLine(line)}</div>)}</CodeBlock>
      {block.output && <>
        <p className="mt-2 text-[10px] font-semibold tracking-wider text-ink-3 uppercase">Output</p>
        <pre className="no-scrollbar mt-1 max-h-40 overflow-y-auto rounded-lg border border-line bg-white p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap">{block.output}</pre>
      </>}
    </div>
  );
}

function CodeBody({ block, onChange }) {
  const [draft, setDraft] = useState(block.draft ?? block.starter);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(null); // null | 'starting' | { ok, output, error }
  const execute = async () => {
    setBusy(true);
    setRun('starting');
    const result = await runPython(`${block.setup}\n\n${draft}\n\n${block.checks}`);
    setRun(result);
    setBusy(false);
  };
  const reset = () => { setDraft(block.starter); setRun(null); onChange({ ...block, draft: null }); };
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker action={draft !== block.starter && (
        <button type="button" aria-label="Reset code" title="Restore the starter code"
          onPointerDown={e => e.stopPropagation()} onClick={reset}
          className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink"><RotateCcw size={13} /></button>
      )}>Code</Kicker>
      <p className="text-sm font-medium">{block.title}</p>
      <div className="mt-1 text-sm text-ink-2"><Md text={block.brief} /></div>
      <p className="mt-2 text-[10px] font-semibold tracking-wider text-ink-3 uppercase">Given</p>
      <CodeBlock className="mt-1 text-xs">{block.setup.split('\n').map((line, index) => <div key={index}>{colorLine(line)}</div>)}</CodeBlock>
      <p className="mt-2 text-[10px] font-semibold tracking-wider text-ink-3 uppercase">Your code</p>
      <textarea value={draft} spellCheck={false} rows={Math.max(4, draft.split('\n').length + 1)}
        onPointerDown={e => e.stopPropagation()}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => onChange({ ...block, draft })}
        className="mt-1 w-full resize-y rounded-lg border border-line bg-code p-3 font-mono text-xs leading-5 outline-none focus:border-ink-3" />
      <div className="mt-2 flex items-center gap-2" onPointerDown={e => e.stopPropagation()}>
        <button type="button" data-run-code disabled={busy} onClick={execute}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}{run === 'starting' ? 'Starting Python…' : 'Run checks'}
        </button>
        {run && run !== 'starting' && (run.ok
          ? <span className="text-sm font-medium text-green-700">✓ All checks passed</span>
          : <span className="text-sm font-medium text-red-700">✗ Not yet</span>)}
      </div>
      {run && run !== 'starting' && !run.ok && (
        <div className="mt-2 rounded-lg border border-red-700/25 bg-red-700/5 p-2 text-xs">
          <p><span className="font-medium text-red-700">Why it failed:</span> {(run.error || 'A check did not pass.').split('\n').filter(Boolean).pop()}</p>
          {block.hint && <p className="mt-1 text-ink"><span className="font-medium">Hint:</span> {block.hint}</p>}
        </div>
      )}
      {run && run !== 'starting' && run.output && (
        <pre className="no-scrollbar mt-2 max-h-32 overflow-y-auto rounded-lg border border-line bg-white p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap">{run.output}</pre>
      )}
    </div>
  );
}

function FlashcardsBody({ block, onChange }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = block.cards[index];
  const marks = block.marks || {}; // per-card self-assessment feeding the adaptive engine
  const go = step => { setFlipped(false); setIndex(previous => (previous + step + block.cards.length) % block.cards.length); };
  const mark = result => { onChange({ ...block, marks: { ...marks, [index]: result } }); go(1); };
  return (
    <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Kicker author="tutor">Flashcards</Kicker>
      <button type="button" data-flashcard aria-label={flipped ? 'Show front' : 'Show back'} style={{ perspective: 900 }}
        onPointerDown={e => e.stopPropagation()} onClick={() => setFlipped(previous => !previous)} className="block w-full">
        <span style={{ transformStyle: 'preserve-3d', transition: 'transform .4s ease', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }} className="relative block h-32 w-full motion-reduce:transition-none">
          <span style={{ backfaceVisibility: 'hidden' }} className="absolute inset-0 flex items-center justify-center overflow-y-auto rounded-lg border border-line bg-white px-5 py-4 text-center text-sm hover:bg-hover"><Md text={card.front} /></span>
          <span style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }} className="absolute inset-0 flex items-center justify-center overflow-y-auto rounded-lg border border-line bg-hover px-5 py-4 text-center text-sm"><Md text={card.back} /></span>
        </span>
      </button>
      {flipped && (
        <div className="mt-2 flex justify-center gap-2" onPointerDown={e => e.stopPropagation()}>
          <button type="button" data-flash-knew onClick={() => mark('right')}
            className="flex items-center gap-1.5 rounded-lg border border-green-700 px-3 py-1.5 text-sm text-green-700 hover:bg-green-700/5"><Check size={14} />Got it</button>
          <button type="button" data-flash-missed onClick={() => mark('wrong')}
            className="flex items-center gap-1.5 rounded-lg border border-red-700 px-3 py-1.5 text-sm text-red-700 hover:bg-red-700/5"><X size={14} />Not yet</button>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between" onPointerDown={e => e.stopPropagation()}>
        <button type="button" aria-label="Previous card" onClick={() => go(-1)} className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink"><ChevronLeft size={15} /></button>
        <span className="flex items-center gap-2 text-xs tabular-nums text-ink-2">
          {index + 1} / {block.cards.length}
          <span className="flex gap-1">{block.cards.map((_, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${marks[i] === 'right' ? 'bg-green-600' : marks[i] === 'wrong' ? 'bg-red-600' : 'bg-line'} ${i === index ? 'ring-2 ring-line' : ''}`} />)}</span>
          · flip, then rate yourself
        </span>
        <button type="button" aria-label="Next card" onClick={() => go(1)} className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink"><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}

// Serialize a block for the tutor prompt when the learner asks about it.
export function describeBlock(block) {
  if (block.type === 'code') return { kind: 'Code exercise', title: block.title, text: `Code exercise: ${block.title}\n${block.brief}\nGiven setup:\n${block.setup}\nLearner's current code:\n${block.draft ?? block.starter}\nChecks it must pass:\n${block.checks}` };
  if (block.type === 'snippet') return { kind: 'Code sample', title: block.title, text: `Code sample: ${block.title}\n${block.brief || ''}\nCode:\n${block.code}\nOutput:\n${block.output || '(none shown)'}` };
  if (block.type === 'quiz') return { kind: 'Quiz', title: block.question, text: `Quiz question: ${block.question}\nOptions:\n${block.options.map(option => `${option.key}. ${option.text}${option.correct ? ' (correct answer)' : ''}`).join('\n')}\nLearner's current choice: ${block.choice || 'none yet'}` };
  if (block.type === 'flashcards') return { kind: 'Flashcards', title: `${block.cards.length} cards`, text: `Flashcards:\n${block.cards.map((card, index) => `- ${card.front} → ${card.back} (learner self-rated: ${(block.marks || {})[index] || 'unrated'})`).join('\n')}` };
  if (block.type === 'challenge') return { kind: 'Challenge', title: block.prompt, text: `Challenge: ${block.prompt}\nLearner's committed answer: ${block.answer || 'none yet'}` };
  return null;
}

export function LearningBlockBody({ block, onChange }) {
  if (block.type === 'challenge') return <ChallengeBody block={block} onChange={onChange} />;
  if (block.type === 'quiz') return <QuizBody block={block} onChange={onChange} />;
  if (block.type === 'flashcards') return <FlashcardsBody block={block} onChange={onChange} />;
  if (block.type === 'code') return <CodeBody block={block} onChange={onChange} />;
  if (block.type === 'snippet') return <SnippetBody block={block} />;
  return null;
}
