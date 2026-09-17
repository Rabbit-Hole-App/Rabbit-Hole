import { Check } from 'lucide-react';
import { Button } from './ui.jsx';
import { architectureLesson, sampleCourse } from './learn-preview.js';

export default function LearnOutline({ allowSample = true, state, onOpen, disabled, sample, onSampleChange, activeId, activePage, completed, onToggleComplete }) {
  if (!state.loaded) return <p className="p-3 text-sm text-ink-2">{state.error || 'Loading curriculum…'}</p>;
  const curriculum = !sample && state.course?.curriculum;
  if (!curriculum && !allowSample) return <p className="p-3 text-sm text-ink-2">No approved course yet. The project owner can create one in Edit course.</p>;
  const lessons = curriculum?.lessons || sampleCourse.lessons;
  return <section aria-label="Learner curriculum" className="min-h-0 flex-1 overflow-y-auto py-2">
    {state.course?.curriculum && <label className="mb-3 block text-xs text-ink-2">Course<select aria-label="Browse course" className="mt-1 w-full rounded border border-line bg-white p-2 text-sm" value={sample ? 'sample' : 'saved'} onChange={e => onSampleChange(e.target.value === 'sample')}>{allowSample && <option value="sample">Sample course</option>}<option value="saved">Saved curriculum</option></select></label>}
    <h2 className="mb-1 text-sm font-medium">{curriculum?.title || sampleCourse.title}</h2>
    {!curriculum && <p className="mb-4 text-xs text-ink-2">Interactive preview · sample content</p>}
    <ol className="space-y-5">{lessons.map((item, index) => {
      const content = curriculum ? (index === 0 ? state.course?.lesson : null) : item;
      const sections = content?.pages || (item.topics || item.pages || []).map(title => ({ title }));
      const practice = content?.id === architectureLesson.id;
      const finished = !!content && sections.length > 0 && sections.every((_, i) => completed[`${content.id}:${i}`]) && (!practice || ['notebook', 'quiz', 'flashcards'].every(view => completed[`${content.id}:${view}`]));
      return <li key={index}>
        <h3 className="flex items-start gap-2 text-sm font-medium"><Completion checked={finished} label={item.title} /><button type="button" disabled={disabled || !content} onClick={() => onOpen(content, 'lesson', 0)} className="text-left hover:text-accent disabled:text-ink-3">Lesson {index + 1}: {item.title}</button></h3>
        {!content && <p className="mt-1 text-xs text-ink-3">Content not generated yet</p>}
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{sections.map((page, i) => <li key={i} className="flex items-start gap-2"><Completion checked={!!completed[`${content?.id}:${i}`]} label={page.title} /><button type="button" aria-current={content?.id === activeId && activePage === i ? 'step' : undefined} disabled={disabled || !content} onClick={() => onOpen(content, 'lesson', i)} className="rounded py-1 text-left text-ink-2 hover:text-accent hover:underline aria-[current=step]:font-medium aria-[current=step]:text-accent disabled:cursor-default disabled:text-ink-3 disabled:no-underline">{page.title}</button></li>)}
          {practice && [['notebook', 'Notebook: decoding a box'], ['quiz', 'Quiz'], ['flashcards', 'Flashcards']].map(([view, label]) => <li key={view} className="flex items-start gap-2"><input type="checkbox" aria-label={`${label} completed`} checked={!!completed[`${content.id}:${view}`]} onChange={() => onToggleComplete(`${content.id}:${view}`)} className="mt-2 h-3.5 w-3.5 shrink-0 cursor-pointer accent-green-600" /><Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onOpen(content, view)}>{label}</Button></li>)}
        </ul>
      </li>;
    })}</ol>
  </section>;
}

function Completion({ checked, label }) {
  return <span role="img" aria-label={`${label}: ${checked ? 'completed' : 'not completed'}`} className={`mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${checked ? 'border-green-600 bg-green-600 text-white' : 'border-line'}`}>{checked && <Check size={11} strokeWidth={3} />}</span>;
}
