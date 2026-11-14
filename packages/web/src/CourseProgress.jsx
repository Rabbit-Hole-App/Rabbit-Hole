import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from './ui.jsx';
import { STRINGS } from './roadmap-strings.js';

// The course being made (owner 2026-11-14): the canvas dims, and a card in the middle shows how many cards are made, the one being made now, a fun fact about the
// document while the learner waits, and Cancel. The veil lets the pointer through, so the learner can still look around the canvas while cards land on it; only the
// card takes clicks. Progress bar as LearnCourse.jsx draws it. course: roadmap-client.js courseOf; onCancel: the controller's stopCourse.
export const FACT_MS = 9000;
export default function CourseProgress({ course, onCancel, cancelling = false }) {
  const [shown, setShown] = useState(0);
  const facts = course.facts || [];
  useEffect(() => {
    if (facts.length < 2) return undefined;
    const id = setInterval(() => setShown(n => n + 1), FACT_MS);
    return () => clearInterval(id);
  }, [facts.length]);
  const percent = course.total ? Math.min(100, Math.round((course.made / course.total) * 100)) : 0;
  const fact = facts.length ? facts[shown % facts.length] : null;
  return (
    <div data-course-progress className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-white/70 p-4">
      <div role="status" aria-live="polite" className="pointer-events-auto w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-md">
        <div className="flex items-center gap-2 text-sm font-medium text-ink"><Loader2 size={18} aria-hidden="true" className="animate-spin text-claude motion-reduce:animate-none" /><span className="shimmer">{STRINGS.courseMaking}</span></div>
        <div role="progressbar" aria-label={STRINGS.courseMaking} aria-valuemin={0} aria-valuemax={course.total} aria-valuenow={course.made} className="mt-4 h-2 overflow-hidden rounded-full bg-line">
          <span style={{ width: `${percent}%` }} className="block h-full rounded-full bg-accent transition-[width] duration-500 motion-reduce:transition-none" />
        </div>
        <p data-course-count className="mt-2 text-xs text-ink-2 tabular-nums">{STRINGS.courseProgress(course.made, course.total)}{course.failed ? ` · ${STRINGS.courseFailed(course.failed)}` : ''}</p>
        {course.current && <p data-course-current className="mt-1 truncate text-xs text-ink-2">{STRINGS.courseNow(course.current)}</p>}
        {fact && <div data-course-fact className="mt-4 rounded-md bg-hover/60 p-3"><div className="text-[11px] font-medium text-ink-2">{STRINGS.didYouKnow}</div><p className="mt-1 text-[13px] leading-normal break-words text-ink">{fact}</p></div>}
        <div className="mt-4 flex justify-end"><Button type="button" size="sm" variant="secondary" data-course-cancel disabled={cancelling} onClick={onCancel}>{STRINGS.cancel}</Button></div>
      </div>
    </div>
  );
}
