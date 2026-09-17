import { useEffect, useRef, useState } from 'react';
import { BookOpen, FileCode2 } from 'lucide-react';
import { Md } from './ask.jsx';
import { Button } from './ui.jsx';
import { nanoLesson, nanoMaterials, nanoSourceVersion } from './nanogpt-lesson.js';
import { addEncodingAttempt, lessonProgressKey } from './lesson-progress.js';

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
  return { saved, error, loaded, record, submit, persistent: !!key };
}

function SupportingVisual({ page }) {
  return <figure className="my-5 rounded-lg border border-line p-4" aria-label={page === 0 ? 'Two next-token steps' : 'Toy character lookup'}>
    {page === 0 ? <div className="flex flex-wrap items-center gap-3 font-mono text-base"><span>Hell</span><span aria-hidden="true">→</span><span>Hell<strong className="text-orange-700">o</strong></span><span aria-hidden="true">→</span><span>Hello<strong className="text-orange-700">[space]</strong></span></div>
      : <><div className="flex flex-wrap gap-2 font-mono">{['H → 0', 'e → 1', 'l → 2', 'o → 3', '[space] → 4'].map(item => <span key={item} className="rounded border border-line px-3 py-2">{item}</span>)}</div><div className="mt-4 overflow-auto font-mono text-sm">Hello Hello → [0, 1, 2, 2, 3, <strong className="text-orange-700">4</strong>, 0, 1, 2, 2, 3]</div></>}
    <figcaption className="mt-3 text-xs text-ink-2">{page === 0 ? 'Illustrative choices, not predictions from a trained model. Each selected character becomes part of the next input.' : 'Toy vocabulary. Repeated text reuses the same IDs; the space also has an ID.'}</figcaption>
  </figure>;
}

export default function NanoLessonReading({ page, progress, onSource }) {
  const [answer, setAnswer] = useState('');
  const [validation, setValidation] = useState('');
  const [retry, setRetry] = useState(false);
  const material = nanoMaterials[page];
  if (!material) return null;
  const result = progress.saved.encoding;
  const reading = material.reading
    .replace(/\*\*Supporting visual[^\n]+/, '@@visual@@')
    .replace('**Reuse the canvas lookup card beside this code.** ', '')
    .replace('**Insert the extended static mapping here.**', '\n\n@@visual@@\n\n');
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
    {progress.error && <p role="alert" className="text-sm text-red-700">{progress.error}</p>}
    <section aria-label="Further explanations" className="text-sm leading-relaxed">
      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold"><BookOpen size={17} />Further explanations</h3>
      {reading.split('@@visual@@').map((part, i) => <div key={i}>{i > 0 && <SupportingVisual page={page} />}<Md text={part} /></div>)}
    </section>
    <section aria-label="References and further reading" className="text-sm">
      <h3 className="mb-3 font-semibold">References and further reading</h3>
      {page === 1 && <><Md text={'```python\nchars = sorted(list(set(data)))\nvocab_size = len(chars)\n```'} /><p className="my-3 text-ink-2">The preparation script gathers distinct characters and counts them. The following lines build the encoding and decoding dictionaries.</p></>}
      <div className="flex flex-wrap gap-2">{refs.map(([, label, href]) => {
        const repo = href.match(/github\.com\/karpathy\/nanoGPT\/blob\/([^/]+)\/([^#]+)(?:#L(\d+)(?:-L(\d+))?)?/);
        return repo ? <button key={href} type="button" onClick={() => onSource({ path: repo[2], commit: repo[1], line: Number(repo[3] || 1), lineEnd: Number(repo[4] || repo[3] || 1) })} className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-left text-xs text-ink-2 hover:bg-hover"><FileCode2 size={13} />{label}</button> : <Md key={href} text={`[${label}](${href})`} />;
      })}</div>
      <p className="mt-3 text-xs text-ink-2">Repository links open the pinned source beside chat. External resources are optional further reading.</p>
    </section>
  </div>;
}
