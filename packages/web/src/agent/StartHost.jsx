import { useEffect, useState } from 'react';
import StartDialog from '../StartDialog.jsx';
import { ctxOf } from './commands.js';
import { useSurface } from './surface.js';
import { useStartDraft } from '../start-run.js';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui.jsx';

// T02 §3.3, §5: the one Start dialog host. Home's [Start a rabbit hole], Library
// and Settings dispatch 'small:start' {path}. Mounted once in Root (dev), so the
// dialog survives Shell remounts and Settings opening on top of it.
export default function StartHost({ takeEarly = () => null }) {
  const surface = useSurface(); // a fresh ctx once Shell publishes the workspace identity
  const [path, setPath] = useState(null);
  const draft = useStartDraft();
  // Once the destination exists the dialog steps aside, so the canvas and its own choice windows are usable; the job goes on
  // (start-job.js) and the chip below says where it stands. A source that needs another try brings the list back with Review.
  const away = draft.phase === 'starting' && !!draft.destination;
  useEffect(() => { if (away && path) setPath(null); }, [away, path]);
  useEffect(() => {
    const open = (e) => { takeEarly(); setPath(e.detail?.path || 'repository'); };
    window.addEventListener('small:start', open);
    // A request sent before this listener existed (chunk still loading, or between render and now).
    const early = takeEarly();
    if (early) setPath(early);
    return () => window.removeEventListener('small:start', open);
  }, []);
  const waiting = draft.rows.filter((row) => row.status !== 'ready' && row.status !== 'failed').length;
  const failed = draft.rows.filter((row) => row.status === 'failed').length;
  const chip = !path && draft.destination && (draft.phase === 'starting' || draft.phase === 'partial');
  return (
    <>
      {path && !away && <StartDialog ctx={ctxOf(surface)} initial={path} onClose={() => setPath(null)} />}
      {chip && (
        <div role="status" data-start-chip className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm shadow-pop">
          {draft.phase === 'starting'
            ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" />Adding sources, {waiting} to go</>
            : <>{failed === 1 ? '1 source needs another try.' : `${failed} sources need another try.`}<Button size="sm" variant="secondary" onClick={() => setPath('review')}>Review</Button></>}
        </div>
      )}
    </>
  );
}
