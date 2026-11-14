import { useEffect, useRef } from 'react';
import CourseProgress from './CourseProgress.jsx';
import { toast } from './ui.jsx';
import { failuresOf } from './roadmap-client.js';
import { STRINGS } from './roadmap-strings.js';

// The roadmap shows in three places, each fed by the object useRoadmap returns: Chat's transcript (RoadmapTranscript.jsx, Tutor entries), the Table of contents tree
// (TableOfContents roadmap prop, accepted rows only) and RoadmapCanvas over the canvas pane: the course being made (CourseProgress.jsx; owner 2026-11-14 replaced the
// per-card proposal overlay) and the notices below.
export function RoadmapCanvas({ roadmap }) {
  const st = roadmap.state, told = useRef(new Set());
  // A withheld card is announced once per result through the app's existing error toast (ui.jsx), its message only (owner 2026-11-06: no Retry, Replace or Omit on explanation cards).
  const failures = failuresOf(st?.view);
  useEffect(() => {
    for (const item of failures) {
      if (told.current.has(item.resultId)) continue;
      told.current.add(item.resultId);
      toast(item.message, { tone: 'error' });
    }
  }, [failures.map(f => f.resultId).join(' ')]);
  // A run that stopped by itself (credits, a card that could not be prepared) says so once.
  const stopped = st?.view?.course?.stopped, run = st?.view?.roadmap?.id + ':' + (st?.view?.course?.stopped ?? '');
  const toldStop = useRef(null);
  useEffect(() => {
    if (!stopped || !STRINGS.courseStopped[stopped] || toldStop.current === run || (stopped === 'incomplete' && !(st?.view?.course?.failed > 0))) return;
    toldStop.current = run;
    toast(STRINGS.courseStopped[stopped], { tone: 'error' });
  }, [stopped, run]);
  const cancelling = !!st?.busy?.some(g => g.startsWith('course:stop'));
  return <>{roadmap.course && <CourseProgress course={roadmap.course} cancelling={cancelling} onCancel={() => roadmap.stopCourse()} />}</>;
}
