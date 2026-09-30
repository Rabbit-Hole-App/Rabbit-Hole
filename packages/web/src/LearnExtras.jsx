import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { Button, CodeBlock, ConfirmDialog, IconBtn } from './ui.jsx';
import { colorLine } from './code.jsx';
import { architecturePages, flashcards, quiz, sourceSample } from './learn-preview.js';

export function LessonReading({ architecture, page, narration, onSource, onNotebook }) {
  const reading = architecture ? architecturePages[page] : null;
  return <article aria-label="Lesson reading" className="space-y-5 border-t border-line pt-6 pb-8 text-sm leading-7">
    <div className="flex items-center gap-2 text-xs text-ink-2"><BookOpen size={14} />Read & explore <span className="ml-auto rounded bg-hover px-2">Sample content</span></div>
    <h2 className="text-lg font-semibold">{reading?.[0] || 'From a score to a probability'}</h2>
    <p className="text-ink-2">{reading?.[2] || narration || 'A logistic regression model combines input features and learned weights into a score. The sigmoid maps that score into a value between zero and one. A separate decision threshold turns that value into a class; it does not change the learned weights.'}</p>
    <div className="rounded-lg bg-hover px-5 py-4 font-mono text-sm" aria-label="Example equation">{architecture ? '(x₁, y₁, x₂, y₂) = (x − l, y − t, x + r, y + b)' : 'σ(z) = 1 / (1 + exp(−z))'}</div>
    <p className="text-ink-2">{architecture ? 'Notebook connection: x and y locate a reference point. The non-negative distances l, t, r, and b locate the left, top, right, and bottom edges. These are already-decoded distances in one coordinate system, not the raw model outputs.' : 'At z = 0, exp(0) = 1, so the output is 0.5. Positive scores yield values above 0.5; negative scores yield values below it. This mapping is not the training loss.'}</p>
    <div className="space-y-2"><div className="flex items-center justify-between gap-2"><span className="text-xs text-ink-2">Illustrative notebook source · not deployed app code</span><button onClick={onSource} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">lesson_geometry.py:4–9<ArrowUpRight size={13} /></button></div>
      <CodeBlock>{sourceSample.split('\n').slice(3, 9).map((line, i) => <div key={i}>{colorLine(line)}</div>)}</CodeBlock>
    </div>
    <Button variant="secondary" onClick={onNotebook}>Try it yourself in the notebook <ArrowUpRight size={14} /></Button>
    <div className="space-y-1 border-t border-line pt-4"><h3 className="font-medium">Further reading</h3>
      <a className="block text-accent hover:underline" href="https://docs.ultralytics.com/models/yolov8/" target="_blank" rel="noreferrer">Ultralytics: YOLOv8: model family and detection head ↗</a>
      <a className="block text-accent hover:underline" href="https://docs.ultralytics.com/guides/yolo-architecture/" target="_blank" rel="noreferrer">Architecture guide: backbone, neck, and head ↗</a>
    </div>
  </article>;
}

export function LessonSource({ onClose }) {
  const first = useRef(null);
  useEffect(() => { first.current?.scrollIntoView({ block: 'center', inline: 'nearest' }); }, []);
  return <section aria-label="Lesson source" className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-line bg-white">
    <div className="flex items-center justify-between gap-2 border-b border-line p-4"><div><h2 className="text-sm font-medium">lesson_geometry.py</h2><p className="mt-1 text-xs text-ink-2">Sample source · lines 4–9</p></div><IconBtn aria-label="Close lesson source" onClick={onClose}><X size={15} /></IconBtn></div>
    <div className="min-h-0 flex-1 overflow-auto py-4"><pre className="min-w-max font-mono text-xs leading-7">{sourceSample.split('\n').map((line, i) => <div key={i} ref={i === 3 ? first : null} data-highlighted={i >= 3 && i <= 8 ? 'true' : undefined} className={`flex gap-4 pr-4 ${i >= 3 && i <= 8 ? 'bg-accent/10' : ''}`}><span className="w-9 shrink-0 text-right text-ink-3 select-none">{i + 1}</span><span>{colorLine(line)}</span></div>)}</pre></div>
  </section>;
}

export function LessonNotebook({ active }) {
  const [opened, setOpened] = useState(active);
  const [version, setVersion] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (active) setOpened(true); }, [active]);
  return <section aria-label="Lesson notebook" className={`${active ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col gap-3`}>
    <div className="flex shrink-0 justify-end"><Button size="sm" variant="secondary" onClick={() => setConfirm(true)}><RotateCcw size={13} />Reset notebook</Button></div>
    <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-lg border border-line">
      {!loaded && <p role="status" className="absolute inset-x-0 top-0 z-10 bg-white p-3 text-sm text-ink-2">Loading Jupyter… Python may take a moment to start.</p>}
      {opened && <iframe key={version} title="Jupyter lesson notebook" className="absolute inset-0 h-full w-full bg-white" onLoad={() => setLoaded(true)} src="https://small-learn-notebook-dev.zeroshothq.workers.dev/lab/index.html?path=lesson.ipynb&mode=single-document" sandbox="allow-scripts allow-same-origin allow-downloads" allow="clipboard-write" />}
    </div>
    {confirm && <ConfirmDialog title="Reset notebook?" body="Restore the original lesson notebook? Your edits, added cells, outputs, and Python variables will be cleared. Download a copy first if you want to keep them." confirmLabel="Reset notebook" onCancel={() => setConfirm(false)} onConfirm={() => { setVersion(v => v + 1); setLoaded(false); setConfirm(false); }} />}
  </section>;
}

export function LessonPractice({ active, onReview, mode, setMode }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [card, setCard] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [marks, setMarks] = useState({});
  const move = index => { setCard(index); setRevealed(false); };
  return <section aria-label="Lesson practice" className={`${active ? '' : 'hidden'} min-h-0 flex-1 overflow-auto pb-6`}>
    <div className="mb-5"><h2 className="text-lg font-semibold">Check your understanding</h2><p className="mt-1 text-xs text-ink-2">Lesson 2 · Inside YOLOv8 · sample practice</p></div>
    <div className="mb-5 flex gap-2">{['quiz', 'flashcards'].map(value => <Button key={value} size="sm" variant="secondary" aria-pressed={mode === value} className={mode === value ? 'bg-hover' : ''} onClick={() => setMode(value)}>{value === 'quiz' ? 'Quiz' : 'Flashcards'}</Button>)}</div>
    {mode === 'quiz' ? <div className="space-y-5">{quiz.map((q, i) => <fieldset key={q.question} className="rounded-lg border border-line p-4"><legend className="px-1 text-sm font-medium">{i + 1}. {q.question}</legend><div className="space-y-2">{q.options.map((option, index) => <label key={option} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-hover"><input type="radio" name={`learn-question-${i}`} checked={answers[i] === index} disabled={submitted} onChange={() => setAnswers(a => ({ ...a, [i]: index }))} />{option}</label>)}</div>{submitted && <div className="mt-3 border-t border-line pt-3 text-sm"><p className={answers[i] === q.correct ? 'text-green-700' : 'text-amber-700'}>{answers[i] === q.correct ? 'Correct' : `Review: ${q.options[q.correct]}`}</p><p className="mt-1 text-ink-2">{q.explanation}</p><button className="mt-2 text-xs text-accent hover:underline" onClick={() => onReview(q.page)}>Review page {q.page + 1}</button></div>}</fieldset>)}
      {submitted ? <div className="flex items-center justify-between"><p role="status" className="text-sm">{quiz.filter((q, i) => answers[i] === q.correct).length} of {quiz.length} correct</p><Button variant="secondary" onClick={() => { setSubmitted(false); setAnswers({}); }}>Try again</Button></div> : <Button disabled={Object.keys(answers).length !== quiz.length} onClick={() => setSubmitted(true)}>Check answers</Button>}
    </div> : <div className="space-y-4"><div className="flex justify-between text-xs text-ink-2"><span>Card {card + 1} of {flashcards.length}</span><span>{Object.values(marks).filter(v => v === 'got').length} remembered · {Object.values(marks).filter(v => v === 'review').length} to review</span></div>
      <button type="button" aria-label={revealed ? 'Flip card to question' : 'Flip card to answer'} aria-pressed={revealed} onClick={() => setRevealed(v => !v)} className="block w-full rounded-xl text-center focus-visible:outline-2 focus-visible:outline-accent" style={{ perspective: '1200px' }}>
        <div key={card} data-flashcard-flipped={revealed} className="relative grid min-h-64 transition-transform duration-500 motion-reduce:transition-none" style={{ transformStyle: 'preserve-3d', transform: revealed ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
          {[0, 1].map(side => <div key={side} aria-hidden={revealed !== !!side} className={`col-start-1 row-start-1 flex min-h-64 flex-col items-center justify-center rounded-xl border border-line px-8 py-10 ${side ? 'bg-blue-50' : 'bg-white'}`} style={{ backfaceVisibility: 'hidden', transform: side ? 'rotateY(180deg)' : 'rotateY(0deg)' }}><p className="text-xs uppercase tracking-wider text-ink-3">{side ? 'Answer' : 'Recall'}</p><p className="mt-5 text-lg leading-8">{flashcards[card][side]}</p><p className="mt-5 text-xs text-ink-2">Click to flip</p></div>)}
        </div>
      </button>
      <p className="text-center text-xs text-ink-2" role="status">{marks[card] ? `Your answer: ${marks[card] === 'got' ? 'Got it right' : 'Not yet'}` : revealed ? 'Did you get it right?' : 'Think of your answer, then flip the card.'}</p>
      <div className="flex items-center justify-between gap-2"><IconBtn aria-label="Previous flashcard" disabled={card === 0} onClick={() => move(card - 1)}><ChevronLeft size={18} /></IconBtn><div className="flex gap-2"><Button variant="secondary" disabled={!revealed} aria-pressed={marks[card] === 'review'} onClick={() => setMarks(m => ({ ...m, [card]: 'review' }))}>Not yet</Button><Button variant="soft" disabled={!revealed} aria-pressed={marks[card] === 'got'} onClick={() => setMarks(m => ({ ...m, [card]: 'got' }))}>Got it right</Button></div><IconBtn aria-label="Next flashcard" disabled={card === flashcards.length - 1} onClick={() => move(card + 1)}><ChevronRight size={18} /></IconBtn></div>
    </div>}
  </section>;
}
