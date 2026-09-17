import { useEffect, useRef, useState } from 'react';
import { BookOpen, FileCode2 } from 'lucide-react';
import { Md } from './ask.jsx';
import { Button } from './ui.jsx';
import { nanoLesson, nanoMaterials, nanoSourceVersion } from './nanogpt-lesson.js';
import { PREFIX_PAIRS, addEncodingAttempt, addGenerationAttempt, addPrefixAttempt, lessonProgressKey } from './lesson-progress.js';

export function useNanoProgress(app, enabled) {
  const key = enabled ? lessonProgressKey(app, nanoLesson.id, nanoSourceVersion) : null;
  const current = useRef({});
  const [saved, setSaved] = useState({});
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const lastSave = useRef(0);
  const save = () => {
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(current.current)); setError(''); }
    catch { setError('Progress could not be saved in this browser. Keep this page open.'); }
  };
  useEffect(() => {
    current.current = {}; setLoaded(false);
    if (key) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || '{}');
        if (value && typeof value === 'object' && !Array.isArray(value)) current.current = value;
      } catch { setError('Saved progress could not be read. This visit starts fresh.'); }
    }
    setSaved(current.current); setLoaded(true);
    const flush = () => { if (key) { try { localStorage.setItem(key, JSON.stringify(current.current)); } catch { /* Error already surfaced on save. */ } } };
    window.addEventListener('pagehide', flush);
    return () => { flush(); window.removeEventListener('pagehide', flush); };
  }, [key]);
  const record = value => {
    if (!loaded) return;
    current.current = { ...current.current, timeline: value.timeline,
      pages: { ...current.current.pages, ...(value.pageComplete ? { [value.page]: true } : {}) } };
    // Save once a second while playing, and immediately on pause/page completion.
    if (!value.playing || value.pageComplete || Date.now() - lastSave.current > 1000) {
      lastSave.current = Date.now(); save(); setSaved(current.current);
    }
  };
  const submit = response => {
    current.current = addEncodingAttempt(current.current, response);
    save(); setSaved(current.current);
  };
  const submitPrefix = (position, choice) => {
    current.current = addPrefixAttempt(current.current, position, choice);
    save(); setSaved(current.current);
  };
  const submitGeneration = choice => {
    current.current = addGenerationAttempt(current.current, choice);
    save(); setSaved(current.current);
  };
  return { saved, error, loaded, record, submit, submitPrefix, submitGeneration, persistent: !!key };
}

function SupportingVisual({ page }) {
  return <figure className="my-5 rounded-lg border border-line p-4" aria-label={page === 0 ? 'Two next-token steps' : 'Toy character lookup'}>
    {page === 0 ? <div className="flex flex-wrap items-center gap-3 font-mono text-base"><span>Hell</span><span aria-hidden="true">→</span><span>Hell<strong className="text-orange-700">o</strong></span><span aria-hidden="true">→</span><span>Hello<strong className="text-orange-700">[space]</strong></span></div>
      : <><div className="flex flex-wrap gap-2 font-mono">{['H → 0', 'e → 1', 'l → 2', 'o → 3', '[space] → 4'].map(item => <span key={item} className="rounded border border-line px-3 py-2">{item}</span>)}</div><div className="mt-4 overflow-auto font-mono text-sm">Hello Hello → [0, 1, 2, 2, 3, <strong className="text-orange-700">4</strong>, 0, 1, 2, 2, 3]</div></>}
    <figcaption className="mt-3 text-xs text-ink-2">{page === 0 ? 'Illustrative choices, not predictions from a trained model. Each selected character becomes part of the next input.' : 'Toy vocabulary. Repeated text reuses the same IDs; the space also has an ID.'}</figcaption>
  </figure>;
}

function AttemptFooter({ result }) {
  return <p className="mt-2 text-xs text-ink-2">Attempt {result.count} · First attempt: {result.first.correct ? 'correct' : 'incorrect'} · {result.everCorrect ? 'Answered correctly' : 'Keep practicing'}</p>;
}

function PrefixTargetCheck({ progress }) {
  const [position, setPosition] = useState(null);
  const [choice, setChoice] = useState(null);
  const [retry, setRetry] = useState(false);
  const result = progress.saved.prefixTarget;
  const pair = PREFIX_PAIRS.find(item => item.position === position);
  const showForm = !result || retry;
  return <section aria-label="Prefix and target check" className="rounded-xl border border-line bg-white p-5 text-ink">
    <h3 className="font-semibold">Try it: prefix → observed target</h3>
    <p className="mt-2 text-sm">Choose a position in <code className="rounded bg-code px-1">Hello</code>, then choose the character that followed that prefix. Position 5 has no recorded next character in this example.</p>
    <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Position">
      <span className="text-xs text-ink-2">Position</span>
      {PREFIX_PAIRS.map(item => <button key={item.position} type="button" aria-pressed={position === item.position} onClick={() => { setPosition(item.position); setChoice(null); setRetry(true); }} className={`rounded border px-3 py-1.5 text-sm ${position === item.position ? 'border-accent bg-hover font-medium' : 'border-line hover:bg-hover'}`}>{item.position}</button>)}
    </div>
    {showForm && pair && <>
      <p className="mt-3 text-sm">Available prefix: <code className="rounded bg-code px-1">{pair.prefix}</code>. What followed it in Hello?</p>
      <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Next character">
        {['H', 'e', 'l', 'o'].map(value => <button key={value} type="button" aria-pressed={choice === value} onClick={() => setChoice(value)} className={`rounded border px-3 py-1.5 font-mono text-sm ${choice === value ? 'border-accent bg-hover font-medium' : 'border-line hover:bg-hover'}`}>{value}</button>)}
      </div>
      <div className="mt-3"><Button variant="primary" disabled={!choice || !progress.loaded} onClick={() => { progress.submitPrefix(position, choice); setRetry(false); }}>Check answer</Button></div>
    </>}
    {result && !retry && <div role="status" className="mt-4 text-sm">
      <p className="font-medium">{result.last.correct
        ? (result.last.position === 3 ? 'Yes. After Hel, Hello contains another l.' : `Yes. After ${PREFIX_PAIRS[result.last.position - 1].prefix}, the observed next character is ${PREFIX_PAIRS[result.last.position - 1].target}.`)
        : `You selected ${result.last.choice}. After ${PREFIX_PAIRS[result.last.position - 1].prefix} the next character in this example is ${PREFIX_PAIRS[result.last.position - 1].target}${result.last.position === 3 ? '; the final o comes one position later' : ''}.`}</p>
      <p className="mt-2">Shifting the text by one position pairs each input with its observed target. One answered position is practice, not proof of mastery of all positions.</p>
      <AttemptFooter result={result} />
      <button type="button" onClick={() => { setChoice(null); setRetry(true); }} className="mt-3 rounded border border-line px-3 py-1.5 text-xs hover:bg-hover">Try another position</button>
    </div>}
  </section>;
}

function GenerationWeightsCheck({ progress }) {
  const [choice, setChoice] = useState(null);
  const [retry, setRetry] = useState(false);
  const result = progress.saved.generationWeights;
  const showForm = !result || retry;
  return <section aria-label="Generation and parameters check" className="rounded-xl border border-line bg-white p-5 text-ink">
    <h3 className="font-semibold">Quick check: text versus parameters</h3>
    <p className="mt-2 text-sm">Does a longer generated answer mean the parameters changed?</p>
    {showForm && <>
      <div className="mt-3 flex gap-2" role="group" aria-label="Answer">
        {['yes', 'no'].map(value => <button key={value} type="button" aria-pressed={choice === value} onClick={() => setChoice(value)} className={`rounded border px-4 py-1.5 text-sm capitalize ${choice === value ? 'border-accent bg-hover font-medium' : 'border-line hover:bg-hover'}`}>{value}</button>)}
      </div>
      <div className="mt-3"><Button variant="primary" disabled={!choice || !progress.loaded} onClick={() => { progress.submitGeneration(choice); setRetry(false); }}>Check answer</Button></div>
    </>}
    {result && !retry && <div role="status" className="mt-4 text-sm">
      <p className="font-medium">{result.last.correct ? 'No. The generated text changed; the learned parameters stayed fixed.' : 'Appending tokens changes the generated sequence, not the learned parameters. Once the context window is full, each prediction uses a shifted, bounded input.'}</p>
      <AttemptFooter result={result} />
      <button type="button" onClick={() => { setChoice(null); setRetry(true); }} className="mt-3 rounded border border-line px-3 py-1.5 text-xs hover:bg-hover">Try again</button>
    </div>}
  </section>;
}

export default function NanoLessonReading({ page, progress, onSource }) {
  const [answer, setAnswer] = useState('');
  const [validation, setValidation] = useState('');
  const [retry, setRetry] = useState(false);
  const material = nanoMaterials[page];
  if (!material) return null;
  const result = progress.saved.encoding;
  const reading = (page <= 1 ? material.reading
    .replace(/\*\*Supporting visual[^\n]+/, '@@visual@@')
    .replace('**Reuse the canvas lookup card beside this code.** ', '')
    .replace('**Insert the extended static mapping here.**', '\n\n@@visual@@\n\n')
    // Later pages: authoring directives about planned diagrams are not learner text.
    : material.reading.replace(/^\*\*(?:Insert|Reuse)[^\n]*\n?/gm, ''));
  const refs = [...material.references.matchAll(/\[([^\]]+)\]\((https:[^)]+)\)/g)];
  return <div className="space-y-6 pb-8">
    {page === 1 && <section aria-label="Encoding check" className="rounded-xl border border-line bg-white p-5 text-ink">
      <h3 className="font-semibold">Try it: text → IDs</h3>
      <p className="mt-2 text-sm">With H = 0, e = 1, l = 2, o = 3 and space = 4, encode <code className="rounded bg-code px-1">lo H</code>. Include the space.</p>
      {(!result || retry) && <form className="mt-4" onSubmit={event => {
        event.preventDefault();
        try { progress.submit(answer); setValidation(''); setRetry(false); }
        catch (error) { setValidation(error.message); }
      }}>
        <label className="block text-xs text-ink-2" htmlFor="nano-encoding">Four token IDs</label>
        <input id="nano-encoding" value={answer} onChange={e => setAnswer(e.target.value)} autoComplete="off" placeholder="e.g. 0, 1, 2, 3" className="mt-1 w-full max-w-sm rounded-md border border-line bg-white px-3 py-2 font-mono text-sm text-ink" />
        <div className="mt-3"><Button variant="primary" disabled={!answer.trim() || !progress.loaded} type="submit">Check answer</Button></div>
        {validation && <p role="alert" className="mt-2 text-sm text-red-700">{validation}</p>}
      </form>}
      {result && !retry && <div role="status" className="mt-4 text-sm">
        <p className="font-medium">{result.last.correct ? 'Correct.' : 'Not quite.'} {result.last.correct ? 'The space has its own ID too.' : `You entered [${result.last.response.join(', ')}]. Work through the lookup one character at a time.`}</p>
        <p className="mt-2">l → 2, o → 3, space → 4, H → 0. So <code>[2, 3, 4, 0]</code> decodes back to <code>lo H</code>. IDs identify characters; they are not probabilities or importance scores.</p>
        <p className="mt-2 text-xs text-ink-2">Attempt {result.count} · First attempt: {result.first.correct ? 'correct' : 'incorrect'} · {result.everCorrect ? 'Answered correctly' : 'Keep practicing'}</p>
        <button type="button" onClick={() => { setAnswer(''); setRetry(true); }} className="mt-3 rounded border border-line px-3 py-1.5 text-xs hover:bg-hover">Try again</button>
      </div>}
      <p className="mt-3 text-xs text-ink-2">{progress.persistent ? 'Progress is saved in this browser for your account.' : 'Progress lasts for this visit; no signed-in account was supplied.'}</p>
    </section>}
    {page === 2 && <PrefixTargetCheck progress={progress} />}
    {page === 3 && <GenerationWeightsCheck progress={progress} />}
    {progress.error && <p role="alert" className="text-sm text-red-700">{progress.error}</p>}
    <section aria-label="Further explanations" className="text-sm leading-relaxed">
      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold"><BookOpen size={17} />Further explanations</h3>
      {reading.split('@@visual@@').map((part, i) => <div key={i}>{i > 0 && <SupportingVisual page={page} />}<Md text={part} /></div>)}
    </section>
    <section aria-label="References and further reading" className="text-sm">
      <h3 className="mb-3 font-semibold">References and further reading</h3>
      {page === 1 && <><Md text={'```python\nchars = sorted(list(set(data)))\nvocab_size = len(chars)\n```'} /><p className="my-3 text-ink-2">The preparation script gathers distinct characters and counts them. The following lines build the encoding and decoding dictionaries.</p></>}
      <ul className="ml-5 list-disc space-y-2">{refs.map(([, label, href]) => {
        const repo = href.match(/github\.com\/karpathy\/nanoGPT\/blob\/([^/]+)\/([^#]+)(?:#L(\d+)(?:-L(\d+))?)?/);
        return <li key={href}>{repo ? <button type="button" onClick={() => onSource({ path: repo[2], commit: repo[1], line: Number(repo[3] || 1), lineEnd: Number(repo[4] || repo[3] || 1) })} className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-left text-xs text-ink-2 hover:bg-hover"><FileCode2 size={13} />{label}</button> : <Md text={`[${label}](${href})`} />}</li>;
      })}</ul>
    </section>
  </div>;
}
